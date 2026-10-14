package com.lynk.dvrprobe

import org.junit.Assert.*
import org.junit.Test

class DesktopEnvironmentTest {
    @Test fun rainOverridesForecastOnlyWhenFreshAndActive() {
        val now = 100_000L
        val rain = DesktopEnvironment.RainSample(true, now)
        assertEquals(DesktopEnvironment.Weather.RAIN, DesktopEnvironment.resolve(rain, DesktopEnvironment.Weather.CLEAR, now).weather)
        assertEquals(DesktopEnvironment.Weather.SNOW, DesktopEnvironment.resolve(rain.copy(elapsedMs = now-15_001), DesktopEnvironment.Weather.SNOW, now).weather)
        assertEquals(DesktopEnvironment.Weather.FOG, DesktopEnvironment.resolve(rain.copy(active=false), DesktopEnvironment.Weather.FOG, now).weather)
        assertEquals("天气未知", DesktopEnvironment.resolve(null, null, now).source)
        assertEquals(DesktopEnvironment.Weather.CLEAR, DesktopEnvironment.resolve(rain.copy(elapsedMs=now+1), DesktopEnvironment.Weather.CLEAR, now).weather)
    }
}
