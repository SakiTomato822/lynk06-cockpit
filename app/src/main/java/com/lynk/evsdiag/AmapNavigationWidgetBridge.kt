package com.lynk.dvrprobe

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.Binder
import android.os.IBinder
import android.os.Parcel
import android.os.SystemClock
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

internal data class AmapNavigationState(
    val available: Boolean = false,
    val connected: Boolean = false,
    val guidanceStatus: Int? = null,
    val energyType: Int? = null,
    val eventType: Int? = null,
    val maneuverDistance: String? = null,
    val maneuverUnit: String? = null,
    val roadName: String? = null,
    val nextManeuverDistance: String? = null,
    val nextManeuverUnit: String? = null,
    val remainingDistance: String? = null,
    val remainingTime: String? = null,
    val arrivalTime: String? = null,
    val updatedElapsedMs: Long? = null,
) {
    val hasGuidance: Boolean
        get() = !roadName.isNullOrBlank() || !maneuverDistance.isNullOrBlank() ||
            !remainingDistance.isNullOrBlank() || !remainingTime.isNullOrBlank()
}

/**
 * Read-only client for the navigation widget channel used by the OEM Flyme Auto desktop.
 *
 * It deliberately uses only register/query/unregister transactions (1, 4, 5, 7, 6).
 * Transaction 4 reports route-guidance state (103 = guiding, 102 = idle); transaction 7
 * reports the vehicle energy type, not a second navigation or cruise state.
 * Transactions 2 (change/open map page) and 3 (supply a render Surface) are never called.
 */
internal class AmapNavigationWidgetBridge(private val context: Context) : AutoCloseable {
    private companion object {
        const val MAP_PACKAGE = "com.geely.map"
        const val MAP_SERVICE = "com.ecarx.navi.widget.NaviWidgetService"
        const val MAP_ACTION = "ecarx.intent.action.widget_service"
        const val SERVICE_DESCRIPTOR = "com.ecarx.navi.widget.INaviWidgetService"
        const val CALLBACK_DESCRIPTOR = "com.ecarx.navi.widget.INaviWidgetCallback"
        const val TBT_CLASS = "com.ecarx.navi.widget.NaviWidgetTbtData"
    }

    private val mutableState = MutableStateFlow(AmapNavigationState())
    val state: StateFlow<AmapNavigationState> = mutableState
    private var remote: IBinder? = null
    private var bound = false

    private val callback = object : Binder() {
        init { attachInterface(null, CALLBACK_DESCRIPTOR) }

        override fun onTransact(code: Int, data: Parcel, reply: Parcel?, flags: Int): Boolean {
            if (code == INTERFACE_TRANSACTION) {
                reply?.writeString(CALLBACK_DESCRIPTOR)
                return true
            }
            if (code != 1) return super.onTransact(code, data, reply, flags)
            return try {
                data.enforceInterface(CALLBACK_DESCRIPTOR)
                val update = if (data.readInt() != 0) readNavigationUpdate(data) else null
                if (update != null) mutableState.value = merge(mutableState.value, update)
                reply?.writeNoException()
                true
            } catch (error: Throwable) {
                AppLog.w("AMAP", "OEM navigation payload rejected: ${error.javaClass.simpleName}")
                reply?.writeException(IllegalArgumentException("unsupported navigation payload"))
                true
            }
        }
    }

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName, service: IBinder) {
            remote = service
            val current = mutableState.value
            mutableState.value = current.copy(available = true, connected = true)
            runCatching {
                register(service)
                val guidanceStatus = queryInt(service, 4)
                // Match the OEM desktop helper: an active guidance query triggers a TBT refresh;
                // while idle, ask for the cached route condition and optional energy type.
                val energyType = if (guidanceStatus == 103) null else {
                    requestCurrentRoute(service)
                    queryInt(service, 7)
                }
                mutableState.value = mutableState.value.copy(
                    available = true,
                    connected = true,
                    guidanceStatus = guidanceStatus,
                    energyType = energyType,
                )
                AppLog.i("AMAP", "OEM navigation widget connected guidance=$guidanceStatus energyType=$energyType")
            }.onFailure {
                AppLog.w("AMAP", "OEM navigation widget registration failed: ${it.javaClass.simpleName}")
                mutableState.value = mutableState.value.copy(available = true, connected = false)
            }
        }

        override fun onServiceDisconnected(name: ComponentName) = disconnected("service disconnected")
        override fun onBindingDied(name: ComponentName) = disconnected("binding died")
        override fun onNullBinding(name: ComponentName) = disconnected("null binding")
    }

    fun start() {
        if (bound) return
        val intent = Intent(MAP_ACTION).setComponent(ComponentName(MAP_PACKAGE, MAP_SERVICE))
        bound = runCatching { context.bindService(intent, connection, Context.BIND_AUTO_CREATE) }
            .onFailure { AppLog.i("AMAP", "OEM navigation widget unavailable: ${it.javaClass.simpleName}") }
            .getOrDefault(false)
        if (!bound) mutableState.value = AmapNavigationState(available = false)
    }

    private fun disconnected(reason: String) {
        remote = null
        mutableState.value = mutableState.value.copy(connected = false)
        AppLog.i("AMAP", "OEM navigation widget $reason")
    }

    override fun close() {
        remote?.let { runCatching { unregister(it) } }
        remote = null
        if (bound) runCatching { context.unbindService(connection) }
        bound = false
        mutableState.value = mutableState.value.copy(connected = false)
    }

    private fun register(service: IBinder) = transact(service, 1) { writeStrongBinder(callback) }
    private fun unregister(service: IBinder) = transact(service, 6) { writeStrongBinder(callback) }
    private fun requestCurrentRoute(service: IBinder) = transact(service, 5) {}

    private fun queryInt(service: IBinder, transaction: Int): Int {
        val input = Parcel.obtain()
        val output = Parcel.obtain()
        return try {
            input.writeInterfaceToken(SERVICE_DESCRIPTOR)
            check(service.transact(transaction, input, output, 0)) { "transaction $transaction rejected" }
            output.readException()
            output.readInt()
        } finally {
            output.recycle(); input.recycle()
        }
    }

    private inline fun transact(service: IBinder, transaction: Int, body: Parcel.() -> Unit) {
        val input = Parcel.obtain()
        val output = Parcel.obtain()
        try {
            input.writeInterfaceToken(SERVICE_DESCRIPTOR)
            input.body()
            check(service.transact(transaction, input, output, 0)) { "transaction $transaction rejected" }
            output.readException()
        } finally {
            output.recycle(); input.recycle()
        }
    }

    private fun readNavigationUpdate(parcel: Parcel): AmapNavigationState {
        val eventType = parcel.readInt()
        parcel.readInt() // OEM sub-type, retained by the service but not needed by the card.
        parcel.readString() // OEM message/label.
        val className = parcel.readString() // Parcel.writeParcelable writes its class name first.
        if (className == null) return AmapNavigationState(eventType = eventType)
        require(className == TBT_CLASS) { "unexpected parcelable $className" }

        parcel.readFloat() // Progress to the next maneuver, 0..1.
        val roadName = parcel.readString().clean()
        val maneuverDistance = parcel.readString().clean()
        val maneuverUnit = parcel.readString().clean()
        parcel.readString() // Auxiliary text.
        val nextDistance = parcel.readString().clean()
        val nextUnit = parcel.readString().clean()
        parcel.readByte() // Cross-image availability.
        parcel.readLong() // Current maneuver icon id.
        parcel.readLong() // Following maneuver icon id.
        val remainingDistance = parcel.readString().clean()
        val remainingTime = parcel.readString().clean()
        val arrivalTime = parcel.readString().clean()
        return AmapNavigationState(
            eventType = eventType,
            maneuverDistance = maneuverDistance,
            maneuverUnit = maneuverUnit,
            roadName = roadName,
            nextManeuverDistance = nextDistance,
            nextManeuverUnit = nextUnit,
            remainingDistance = remainingDistance,
            remainingTime = remainingTime,
            arrivalTime = arrivalTime,
        )
    }

    private fun merge(previous: AmapNavigationState, update: AmapNavigationState): AmapNavigationState {
        // 407 is the OEM "navigation interrupted/ended" event. Partial events such as lane
        // updates (406) must not erase the latest road and ETA strings.
        if (update.eventType == 407) return AmapNavigationState(
            available = true,
            connected = true,
            guidanceStatus = 102,
            energyType = previous.energyType,
            eventType = 407,
            updatedElapsedMs = SystemClock.elapsedRealtime(),
        )
        return previous.copy(
            available = true,
            connected = true,
            eventType = update.eventType,
            maneuverDistance = update.maneuverDistance ?: previous.maneuverDistance,
            maneuverUnit = update.maneuverUnit ?: previous.maneuverUnit,
            roadName = update.roadName ?: previous.roadName,
            nextManeuverDistance = update.nextManeuverDistance ?: previous.nextManeuverDistance,
            nextManeuverUnit = update.nextManeuverUnit ?: previous.nextManeuverUnit,
            remainingDistance = update.remainingDistance ?: previous.remainingDistance,
            remainingTime = update.remainingTime ?: previous.remainingTime,
            arrivalTime = update.arrivalTime ?: previous.arrivalTime,
            updatedElapsedMs = SystemClock.elapsedRealtime(),
        )
    }

    private fun String?.clean(): String? = this?.trim()?.takeIf { it.isNotEmpty() && it.length <= 80 }
}
