package com.lynk.dvrprobe

import android.Manifest
import android.app.Dialog
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.SystemClock
import android.view.*
import android.webkit.*
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.WindowCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.*
import org.json.JSONObject
import kotlin.math.roundToInt

/** Native Android UI; a restricted local WebGL surface renders only the vehicle. */
class DesktopDemoActivity : AppCompatActivity() {
    private lateinit var vehicle: WebView
    private lateinit var ui: DesktopCockpitView
    private var ready = false
    private val preview by lazy { runCatching { Class.forName("android.car.Car") }.isFailure }
    private val windows = linkedMapOf("lf" to 0, "rf" to 0, "lb" to 0, "rb" to 0)
    private var roof = 0
    private var lights = false
    private var trunk = false
    private var rainActive = false
    private var forecast = DesktopEnvironment.Weather.CLEAR
    private var demoSpeed = 0
    private var demoAirflow = 3
    private var vehicleDestroyed = false
    private var controlsPopup: PopupWindow? = null
    private lateinit var amapNavigation: AmapNavigationWidgetBridge
    private val runtimeCarPermissions = arrayOf(
        "android.car.permission.CAR_ENERGY",
        "android.car.permission.CAR_SPEED",
    )
    private val carPermissionRequest = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { grants ->
        AppLog.i("PERMISSION", "cockpit car permission result=$grants")
        if (grants.values.any { !it }) {
            Toast.makeText(this, "部分车况权限未授予，相关数据可能不可用", Toast.LENGTH_LONG).show()
        }
        // MCU/local fallback sources can still work when Car permissions are denied.
        startVehicleCollector()
    }

    @Suppress("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, true)
        AppLog.initialize(this)
        val root = FrameLayout(this)
        vehicle = WebView(this).apply {
            setBackgroundColor(Color.TRANSPARENT)
            settings.javaScriptEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.domStorageEnabled = false
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            settings.setSupportZoom(false)
            addJavascriptInterface(object {
                @JavascriptInterface fun ready() = runOnUiThread {
                    ready = true; ui.loading = false; ui.invalidate(); applyScene()
                    AppLog.i("DESKTOP", "local vehicle renderer ready; controls are simulation only")
                }
                @JavascriptInterface fun hotspots(json: String) = runOnUiThread {
                    runCatching { ui.updateHotspots(JSONObject(json)) }
                }
                @JavascriptInterface fun failed(message: String) = runOnUiThread {
                    ui.loading=false;ui.rendererError=true;ui.invalidate();AppLog.w("DESKTOP", "renderer load failed: ${message.take(500)}")
                }
            }, "VehicleHost")
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view:WebView,url:String) {
                    view.postDelayed({
                        if (!ready && !vehicleDestroyed && !isFinishing && !isDestroyed) {
                            view.evaluateJavascript("JSON.stringify({status:document.getElementById('status')?.textContent,ready:!!window.CarScene})") {
                                AppLog.w("DESKTOP","renderer pending: $it")
                            }
                        }
                    },15000)
                }
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) = true
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse {
                    val uri = request.url
                    val path = uri.path.orEmpty().removePrefix("/assets/")
                    if (uri.scheme != "https" || uri.host != "appassets.androidplatform.net" ||
                        !uri.path.orEmpty().startsWith("/assets/cockpit/") || path.split('/').any { it == ".." }) {
                        return WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", emptyMap(), "".byteInputStream())
                    }
                    return try {
                        val mime = when (path.substringAfterLast('.')) {
                            "js" -> "application/javascript"; "json" -> "application/json"; "html" -> "text/html"
                            "png" -> "image/png"; "jpg", "jpeg" -> "image/jpeg"; "glb" -> "model/gltf-binary"
                            else -> "application/octet-stream"
                        }
                        WebResourceResponse(mime, "UTF-8", assets.open(path))
                    } catch (_: Exception) {
                        AppLog.w("DESKTOP","local asset missing: $path")
                        WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", emptyMap(), "".byteInputStream())
                    }
                }
                override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                    ready = false; ui.loading = false; ui.rendererError = true; ui.invalidate()
                    AppLog.w("DESKTOP", "vehicle renderer exited; didCrash=${detail.didCrash()}")
                    root.removeView(view)
                    destroyVehicle()
                    return true
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(message: ConsoleMessage): Boolean {
                    if (message.messageLevel() == ConsoleMessage.MessageLevel.ERROR)
                        AppLog.w("DESKTOP", "renderer: ${message.message().take(400)}")
                    return true
                }
            }
        }
        ui = DesktopCockpitView(this) { action -> handle(action) }
        root.addView(ui.backgroundView, FrameLayout.LayoutParams(-1, -1))
        root.addView(vehicle, FrameLayout.LayoutParams(-1, -1))
        root.addView(ui, FrameLayout.LayoutParams(-1, -1))
        setContentView(root)
        amapNavigation = AmapNavigationWidgetBridge(applicationContext).also { it.start() }
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                amapNavigation.state.collect { state -> ui.navigation = state; ui.invalidate() }
            }
        }
        vehicle.loadUrl("https://appassets.androidplatform.net/assets/cockpit/vehicle-layer.html")
        if (preview) {
            ui.snapshot = SimulatedCarProperties(initialScenario = "aggressive").snapshot()
            ui.preview = true
            ui.trend = (0..28).map { FuelTrendPoint(it * 5000L, 6f + (it % 7) * .7f, it * 3f, 3f) }
        } else {
            ui.preview = false
            requestVehicleDataAccess()
            lifecycleScope.launch {
                repeatOnLifecycle(Lifecycle.State.STARTED) {
                    FuelCollectionState.snapshots.collect { reading ->
                        ui.snapshot = reading
                        ui.trend = withContext(Dispatchers.IO) { runCatching { FuelTrendStore(this@DesktopDemoActivity).loadForLastDistance(50f) }.getOrDefault(emptyList()) }
                        ui.invalidate()
                    }
                }
            }
        }
        applyScene()
    }

    private fun requestVehicleDataAccess() {
        val missing = runtimeCarPermissions.filter {
            checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isEmpty()) startVehicleCollector()
        else {
            AppLog.i("PERMISSION", "cockpit requesting car permissions=$missing")
            carPermissionRequest.launch(missing.toTypedArray())
        }
    }

    private fun startVehicleCollector() {
        if (isFinishing || isDestroyed) return
        runCatching { FuelCollectionService.start(this) }
            .onFailure { AppLog.w("DESKTOP", "collector unavailable", it) }
    }

    private fun command(expression: String) {
        if (ready && !vehicleDestroyed) vehicle.evaluateJavascript("window.CarScene && $expression", null)
    }
    private fun adjustDemoAirflow(delta: Int) {
        demoAirflow = (demoAirflow + delta).coerceIn(1, 7)
        ui.airflowLevel = demoAirflow
        ui.invalidate()
    }
    private fun applyScene() {
        val decision = DesktopEnvironment.resolve(
            if (rainActive) DesktopEnvironment.RainSample(true, SystemClock.elapsedRealtime()) else null,
            forecast, SystemClock.elapsedRealtime())
        ui.weather = decision.weather
        ui.weatherSource = "${decision.source} · 演示"
        ui.speedKmh = demoSpeed
        ui.backgroundView.invalidate(); ui.invalidate()
        command("CarScene.setTheme('${if (ui.night) "dark" else "light"}')")
        command("CarScene.environment('${decision.weather.scene}',$demoSpeed)")
    }
    private fun handle(action: String) {
        if(!ready&&action in listOf("lights","trunk","windows","roof","reset")) {
            Toast.makeText(this,"车模仍在准备中",Toast.LENGTH_SHORT).show();return
        }
        when (action) {
            "back" -> finish()
            "theme" -> { ui.night = !ui.night; applyScene() }
            "environment" -> environmentPanel()
            // This control is intentionally local UI state. It never calls the car or WebGL bridge.
            "airflow" -> { ui.airflowAdjusting = !ui.airflowAdjusting; ui.invalidate() }
            "airflow-up" -> adjustDemoAirflow(1)
            "airflow-down" -> adjustDemoAirflow(-1)
            "reset" -> command("CarScene.home()")
            "lights" -> { lights = !lights; ui.lights = lights; command("CarScene.setLights($lights)"); ui.invalidate() }
            "trunk" -> { trunk = !trunk; ui.trunk = trunk; command("CarScene.control('trunk',$trunk)"); ui.invalidate() }
            "windows" -> windowPanel()
            "roof" -> roofPanel()
            "amap" -> openAmap()
            "routes" -> startActivity(Intent(this, TripRouteActivity::class.java))
            "energy" -> startActivity(Intent(this, MainActivity::class.java))
        }
    }
    private fun openAmap() {
        val packages = listOf("com.geely.map", "com.autonavi.amapauto", "com.autonavi.amapauto64", "com.autonavi.minimap", "com.ecarx.amapauto")
        val launch = packages.firstNotNullOfOrNull { packageManager.getLaunchIntentForPackage(it) }
        if (launch == null) Toast.makeText(this, "未找到可启动的高德应用；安装到车机后再验证", Toast.LENGTH_LONG).show()
        else runCatching { startActivity(launch) }.onFailure { Toast.makeText(this, "高德启动失败", Toast.LENGTH_SHORT).show() }
        // Do not fabricate navigation instructions without an actual AMap IPC feed.
    }
    private fun panel(title: String, subtitle: String): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(28), dp(22), dp(28), dp(24))
        background = GradientDrawable().apply { setColor(if (ui.night) Color.rgb(31,43,54) else Color.rgb(247,249,248)); cornerRadius=dp(20).toFloat() }
        addView(text(title, 25f)); addView(text(subtitle, 15f).apply { alpha=.6f }, LinearLayout.LayoutParams(-1,-2).apply { bottomMargin=dp(15) })
    }
    private fun text(value: String, size: Float) = TextView(this).apply {
        text=value; textSize=size; setTextColor(if(ui.night) Color.rgb(230,239,244) else Color.rgb(42,63,64))
    }
    private fun button(label: String, block: () -> Unit) = Button(this).apply {
        text=label; textSize=18f; isAllCaps=false; setOnClickListener { block() }
    }
    private fun popup(content: View, action: String) {
        controlsPopup?.dismiss()
        val margin=dp(20)
        val popupWidth=minOf(dp(620),(ui.width-margin*2).coerceAtLeast(1))
        content.measure(View.MeasureSpec.makeMeasureSpec(popupWidth,View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec((ui.height-margin*2).coerceAtLeast(1),View.MeasureSpec.AT_MOST))
        val popupHeight=content.measuredHeight
        val popup=PopupWindow(content, popupWidth, popupHeight, true).apply {
            elevation=dp(22).toFloat(); setBackgroundDrawable(android.graphics.drawable.ColorDrawable(Color.TRANSPARENT)); isOutsideTouchable=true
        }
        controlsPopup=popup
        popup.setOnDismissListener {if(controlsPopup===popup)controlsPopup=null}
        val anchor=ui.actionRect(action)
        val location=IntArray(2);ui.getLocationInWindow(location)
        val left=((anchor?.centerX()?:ui.width/2f)-popupWidth/2).roundToInt()
            .coerceIn(margin,(ui.width-popupWidth-margin).coerceAtLeast(margin))
        val above=(anchor?.top?:ui.height/2f).roundToInt()-popupHeight-dp(12)
        val desiredTop=if(above>=margin)above else (anchor?.bottom?:margin.toFloat()).roundToInt()+dp(12)
        val top=desiredTop.coerceIn(margin,(ui.height-popupHeight-margin).coerceAtLeast(margin))
        popup.showAtLocation(ui, Gravity.TOP or Gravity.START,
            location[0]+left,location[1]+top)
    }
    private fun sliderRow(container: LinearLayout, title: String, initial: Int, maximum: Int, unit: String, update: (Int)->Unit) {
        val row=LinearLayout(this).apply { orientation=LinearLayout.HORIZONTAL; gravity=Gravity.CENTER_VERTICAL }
        val value=text("$title  $initial$unit", 20f)
        row.addView(value, LinearLayout.LayoutParams(dp(220),-2))
        row.addView(SeekBar(this).apply { max=maximum; progress=initial; setOnSeekBarChangeListener(object:SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(bar:SeekBar?,progress:Int,fromUser:Boolean){value.text="$title  $progress$unit";if(fromUser)update(progress)}
            override fun onStartTrackingTouch(bar:SeekBar?){};override fun onStopTrackingTouch(bar:SeekBar?){}
        }) }, LinearLayout.LayoutParams(0,dp(58),1f))
        container.addView(row)
    }
    private fun windowPanel() {
        val content=panel("车窗", "独立调节开启比例 · 控车与状态均为演示")
        mapOf("lf" to "主驾", "rf" to "副驾", "lb" to "左后", "rb" to "右后").forEach { (id,label) ->
            sliderRow(content,label,windows.getValue(id),100,"%") { value -> windows[id]=value;ui.windowsOpen=windows.values.count { it>0 };command("CarScene.setWindow('$id',${value/100f})");ui.invalidate() }
        }
        content.addView(button("全部关闭") { windows.keys.toList().forEach { windows[it]=0;command("CarScene.setWindow('$it',0)") };for(i in 0 until content.childCount){val row=content.getChildAt(i) as? LinearLayout?:continue;for(j in 0 until row.childCount)(row.getChildAt(j) as? SeekBar)?.progress=0};ui.windowsOpen=0;ui.invalidate() })
        popup(content,"windows")
    }
    private fun roofPanel() {
        val content=panel("天窗", "先抬升，再平顺后滑 · 演示开度")
        sliderRow(content,"开启比例",roof,100,"%") { value -> roof=value;ui.roofOpen=value;command("CarScene.setRoof(${value/100f})");ui.invalidate() }
        popup(content,"roof")
    }
    private fun environmentPanel() {
        val dialog=Dialog(this)
        val content=panel("环境效果", "雨量有效信号优先；无雨量信号时按天气 · 当前输入为模拟")
        val weatherRow=LinearLayout(this).apply { orientation=LinearLayout.HORIZONTAL }
        DesktopEnvironment.Weather.entries.forEach { weather -> weatherRow.addView(button(weather.label) { forecast=weather;applyScene() },LinearLayout.LayoutParams(0,-2,1f)) }
        content.addView(weatherRow)
        content.addView(Switch(this).apply { text="雨量传感器：检测到雨（覆盖天气）";textSize=19f;isChecked=rainActive;setTextColor(if(ui.night)Color.WHITE else Color.DKGRAY);setOnCheckedChangeListener { _,checked ->rainActive=checked;applyScene()} })
        sliderRow(content,"行驶模拟",demoSpeed,100," km/h") { demoSpeed=it;applyScene() }
        content.addView(button("完成") {dialog.dismiss()})
        dialog.setContentView(content);dialog.window?.setBackgroundDrawableResource(android.R.color.transparent);dialog.show()
        dialog.window?.setLayout(minOf(dp(860),resources.displayMetrics.widthPixels-dp(60)),-2)
    }
    private fun dp(value:Int)=(value*resources.displayMetrics.density).roundToInt()
    override fun dispatchKeyEvent(event:KeyEvent):Boolean {
        if (event.action==KeyEvent.ACTION_DOWN) when(event.keyCode) {
            KeyEvent.KEYCODE_DPAD_LEFT,KeyEvent.KEYCODE_DPAD_UP -> {
                if (ui.airflowAdjusting && ui.isAirflowFocused()) handle("airflow-down") else ui.moveFocus(-1)
                return true
            }
            KeyEvent.KEYCODE_DPAD_RIGHT,KeyEvent.KEYCODE_DPAD_DOWN -> {
                if (ui.airflowAdjusting && ui.isAirflowFocused()) handle("airflow-up") else ui.moveFocus(1)
                return true
            }
            KeyEvent.KEYCODE_DPAD_CENTER,KeyEvent.KEYCODE_ENTER,KeyEvent.KEYCODE_NUMPAD_ENTER -> {ui.confirmFocus();return true}
            KeyEvent.KEYCODE_ESCAPE -> {ui.clearRotaryFocus();return true}
        }
        return super.dispatchKeyEvent(event)
    }
    override fun dispatchGenericMotionEvent(event:MotionEvent):Boolean {
        if(event.isFromSource(InputDevice.SOURCE_ROTARY_ENCODER)&&event.action==MotionEvent.ACTION_SCROLL){
            val direction=event.getAxisValue(MotionEvent.AXIS_SCROLL).compareTo(0f)
            if(direction==0)return super.dispatchGenericMotionEvent(event)
            if(ui.isAirflowFocused())handle(if(direction>0)"airflow-up" else "airflow-down")
            else ui.moveFocus(if(direction>0)-1 else 1)
            return true
        }
        return super.dispatchGenericMotionEvent(event)
    }
    override fun onResume(){super.onResume();if(::vehicle.isInitialized&&!vehicleDestroyed)vehicle.onResume()}
    override fun onPause(){controlsPopup?.dismiss();if(::vehicle.isInitialized&&!vehicleDestroyed)vehicle.onPause();super.onPause()}
    private fun destroyVehicle() {
        if (!::vehicle.isInitialized || vehicleDestroyed) return
        vehicleDestroyed = true
        runCatching { vehicle.removeJavascriptInterface("VehicleHost") }
        runCatching { vehicle.stopLoading() }
        runCatching { vehicle.destroy() }
    }
    override fun onDestroy(){ready=false;if(::amapNavigation.isInitialized)amapNavigation.close();destroyVehicle();super.onDestroy()}
}
