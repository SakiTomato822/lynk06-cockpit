package com.lynk.dvrprobe

/** Null and expired rain samples are not evidence of rain. Weather is the fallback. */
internal object DesktopEnvironment {
    enum class Weather(val label: String, val scene: String) {
        CLEAR("晴", "clear"), CLOUD("多云", "cloud"), RAIN("雨", "rain"),
        FOG("雾", "fog"), SNOW("雪", "snow")
    }
    data class RainSample(val active: Boolean, val elapsedMs: Long)
    data class Decision(val weather: Weather, val source: String)
    fun resolve(rain: RainSample?, weather: Weather?, nowMs: Long): Decision {
        val fresh = rain != null && nowMs - rain.elapsedMs in 0L..15_000L
        return if (fresh && rain!!.active) Decision(Weather.RAIN, "雨量传感器")
        else Decision(weather ?: Weather.CLEAR, if (weather == null) "天气未知" else "天气")
    }
}
