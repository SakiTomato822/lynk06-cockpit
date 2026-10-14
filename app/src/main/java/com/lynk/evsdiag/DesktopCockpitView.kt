package com.lynk.dvrprobe

import android.content.Context
import android.graphics.*
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.HapticFeedbackConstants
import androidx.core.content.res.ResourcesCompat
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.*
import kotlin.math.*

internal class DesktopCockpitView(context: Context, private val action:(String)->Unit):View(context) {
    var snapshot:FuelEnergySnapshot?=null
    var navigation=AmapNavigationState()
    var trend:List<FuelTrendPoint> = emptyList()
    var preview=false
    var night=true
    var loading=true
    var rendererError=false
    var weather=DesktopEnvironment.Weather.CLEAR
    var weatherSource="天气 · 演示"
    var speedKmh=0
    var airflowLevel=3
    var airflowAdjusting=false
    var lights=false
    var trunk=false
    var windowsOpen=0
    var roofOpen=0
    private val paint=Paint(Paint.ANTI_ALIAS_FLAG)
    private val font=ResourcesCompat.getFont(context,R.font.lynkco_type_medium)
    private val clockFormat=SimpleDateFormat("HH:mm",Locale.CHINA)
    private val reducedMotion=runCatching {
        android.provider.Settings.Global.getFloat(
            context.contentResolver,
            android.provider.Settings.Global.ANIMATOR_DURATION_SCALE,
            1f,
        )==0f
    }.getOrDefault(false)
    private val day=BitmapFactory.decodeStream(context.assets.open("cockpit/scenes/day.png"))
    private val dark=BitmapFactory.decodeStream(context.assets.open("cockpit/scenes/night.png"))
    private val buttons=linkedMapOf<String,RectF>()
    private var focusIndex=-1
    private var scale=1f
    private var ox=0f
    private var oy=0f
    private var pressed:String?=null
    private var touchStartX=0f
    private var touchStartY=0f
    private var longPressHandled=false
    private val touchSlop=ViewConfiguration.get(context).scaledTouchSlop
    private val openWindowControls=Runnable {
        if(pressed?.let(::normalizedAction)=="windows") {
            longPressHandled=true
            performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
            action("windows")
        }
    }
    private var screenHotspots:Map<String,Pair<Float,Float>> = emptyMap()
    private val textColor get()=if(night)Color.rgb(237,244,249) else Color.rgb(36,57,61)
    private val muted get()=if(night)Color.rgb(149,172,189) else Color.rgb(103,126,132)
    private val accent get()=if(night)Color.rgb(134,202,232) else Color.rgb(48,117,136)

    val backgroundView=object:View(context) {
        override fun onDraw(c:Canvas) {
            val image=if(night)dark else day
            val s=max(width.toFloat()/image.width,height.toFloat()/image.height)
            val w=image.width*s;val h=image.height*s
            c.drawBitmap(image,null,RectF((width-w)/2,(height-h)/2,(width+w)/2,(height+h)/2),paint)
            if(weather==DesktopEnvironment.Weather.FOG) c.drawColor(Color.argb(145,181,198,207))
            if(weather==DesktopEnvironment.Weather.CLOUD||weather==DesktopEnvironment.Weather.RAIN)c.drawColor(Color.argb(40,49,64,80))
            if(weather==DesktopEnvironment.Weather.SNOW){
                paint.shader=LinearGradient(0f,height*.36f,0f,height.toFloat(),intArrayOf(Color.TRANSPARENT,Color.argb(220,226,235,239)),null,Shader.TileMode.CLAMP)
                c.drawRect(0f,height*.36f,width.toFloat(),height.toFloat(),paint);paint.shader=null
            }
            // Quiet edge shading keeps native instruments legible over the scene.
            paint.shader=LinearGradient(0f,0f,width*.5f,0f,if(night)intArrayOf(Color.argb(195,12,25,42),Color.TRANSPARENT) else intArrayOf(Color.argb(205,239,244,243),Color.TRANSPARENT),null,Shader.TileMode.CLAMP)
            c.drawRect(0f,0f,width.toFloat(),height.toFloat(),paint);paint.shader=null
        }
    }
    init { isFocusable=true;isFocusableInTouchMode=true;setLayerType(LAYER_TYPE_HARDWARE,null) }

    fun updateHotspots(data:JSONObject) {
        screenHotspots=listOf("lights","windows","roof","trunk").mapNotNull { key ->
            val p=data.optJSONObject(key)?:return@mapNotNull null
            if(!p.optBoolean("visible"))return@mapNotNull null
            key to ((.18f+.82f*p.optDouble("x").toFloat())*width to (.02f+.85f*p.optDouble("y").toFloat())*height)
        }.toMap();invalidate()
    }
    fun actionRect(id:String):RectF?=(pressed?.takeIf {normalizedAction(it)==id}?.let(buttons::get)?:buttons[id])?.let {RectF(ox+it.left*scale,oy+it.top*scale,ox+it.right*scale,oy+it.bottom*scale)}
    fun moveFocus(delta:Int) {
        val count=buttons.size
        if(count==0)return
        focusIndex=if(focusIndex<0){if(delta>=0)0 else count-1}else (focusIndex+delta).mod(count)
        airflowAdjusting=false
        invalidate()
    }
    fun isAirflowFocused()=buttons.keys.elementAtOrNull(focusIndex)=="airflow"
    fun confirmFocus() {
        if(focusIndex<0)moveFocus(1)
        else buttons.keys.elementAtOrNull(focusIndex)?.let { action(normalizedAction(it)) }
    }
    fun clearRotaryFocus(){focusIndex=-1;airflowAdjusting=false;invalidate()}
    private fun text(c:Canvas,value:String,x:Float,y:Float,size:Float,color:Int=textColor) {
        paint.style=Paint.Style.FILL;paint.shader=null;paint.typeface=font;paint.textSize=size;paint.color=color
        c.drawText(value,x,y,paint)
    }
    private fun round(c:Canvas,r:RectF,color:Int,radius:Float=20f){paint.style=Paint.Style.FILL;paint.shader=null;paint.color=color;c.drawRoundRect(r,radius,radius,paint)}
    private fun button(c:Canvas,id:String,r:RectF,title:String,small:String?=null,active:Boolean=false) {
        buttons[id]=r
        val base=if(night)Color.argb(210,24,40,57) else Color.argb(227,243,248,248)
        round(c,r,if(pressed==id)Color.argb(230,78,117,139) else base,18f)
        val color=if(active)accent else textColor
        text(c,title,r.left+22,r.top+42,24f,color)
        small?.let {text(c,it,r.left+22,r.top+72,17f,muted)}
    }
    override fun onDraw(c:Canvas) {
        super.onDraw(c);buttons.clear()
        scale=min(width/1920f,height/896f);ox=(width-1920*scale)/2;oy=(height-896*scale)/2
        c.save();c.translate(ox,oy);c.scale(scale,scale)
        text(c,"LYNK & CO",44f,43f,24f)
        text(c,if(preview)"车辆桌面 · 数据演示" else "车辆桌面 · 只读车况 / 控车演示",245f,43f,18f,muted)
        val clock=clockFormat.format(Date())
        text(c,clock,1750f,43f,28f)
        buttons["back"]=RectF(35f,8f,215f,58f)
        buttons["theme"]=RectF(1540f,8f,1715f,58f)
        text(c,if(night)"日间模式" else "夜间模式",1550f,42f,20f,muted)
        buttons["environment"]=RectF(1625f,70f,1880f,237f)
        text(c,when(weather){DesktopEnvironment.Weather.SNOW->"0°";DesktopEnvironment.Weather.RAIN->"22°";else->"24°"},1660f,153f,78f)
        text(c,weather.label,1760f,203f,25f)
        text(c,weatherSource,1640f,231f,16f,muted)

        val navSubtitle=when {
            navigation.hasGuidance -> listOfNotNull(navigation.maneuverDistance,navigation.maneuverUnit).joinToString("")
                .let { distance -> if(distance.isBlank()) navigation.roadName.orEmpty() else "前方 $distance · ${navigation.roadName.orEmpty()}" }
            navigation.connected -> "已连接原厂高德 · 等待巡航 / 导航"
            navigation.available -> "原厂高德暂未连接 · 点击打开  ↗"
            else -> "读取车机原厂高德 · 点击打开  ↗"
        }
        button(c,"amap",RectF(44f,86f,410f,225f),if(navigation.hasGuidance)"高德导航" else "高德地图",navSubtitle)
        val navSummary=if(navigation.hasGuidance) listOfNotNull(
            navigation.remainingDistance?.let { "剩余 $it" },
            navigation.remainingTime,
            navigation.arrivalTime?.let { "$it 到达" },
        ).joinToString(" · ").ifBlank { "导航数据已接入" } else "行程里程由车辆提供"
        text(c,navSummary,66f,198f,17f,muted)
        drawFuel(c)
        drawHotspots(c)

        button(c,"routes",RectF(44f,708f,540f,826f),"行程地图  ↗","本地轨迹 · 高德联动入口")
        val distance=snapshot?.trip2DistanceKm
        text(c,distance?.let {"%.1f km".format(Locale.CHINA,it)}?:"-- km",343f,758f,31f)
        text(c,"车辆本次里程",343f,790f,17f,muted)
        val row=RectF(566f,708f,1382f,826f)
        round(c,row,if(night)Color.argb(210,24,40,57)else Color.argb(227,243,248,248))
        val labels=linkedMapOf("lights" to "大灯","windows" to "车窗","roof" to "天窗","trunk" to "尾门")
        labels.entries.forEachIndexed { i,(id,label) ->
            val r=RectF(578f+i*200,719f,766f+i*200,815f)
            val status=when(id){"lights"->if(lights)"已开启" else "关闭";"windows"->if(windowsOpen>0)"$windowsOpen 扇开启" else "独立调节";"roof"->"$roofOpen% · 调节";else->if(trunk)"已开启" else "关闭"}
            button(c,id,r,label,status,when(id){"lights"->lights;"windows"->windowsOpen>0;"roof"->roofOpen>0;else->trunk})
        }
        button(c,"energy",RectF(1408f,708f,1876f,826f),"油耗与里程  ↗","本次 / 小计 / 历史曲线")
        text(c,"控车为动画演示 · 风量不下发",1495f,684f,16f,muted)
        buttons["reset"]=RectF(1440f,630f,1615f,688f)
        text(c,"复位视角 ↗",1460f,668f,18f,muted)
        round(c,RectF(0f,846f,1920f,896f),if(night)Color.argb(235,13,27,43)else Color.argb(242,236,244,243),0f)
        text(c,"车辆空间",55f,880f,21f)
        text(c,"地图",335f,880f,20f,muted)
        buttons["amap-dock"]=RectF(300f,846f,450f,896f)
        text(c,"23.0°",890f,883f,33f)
        text(c,"AUTO",1020f,880f,14f,muted)
        buttons["airflow"]=RectF(1110f,846f,1380f,896f)
        text(c,"风量",1127f,879f,17f,if(airflowAdjusting)accent else muted)
        text(c,"$airflowLevel/7",1182f,880f,20f)
        for(i in 0 until 7) {
            val bar=RectF(1242f+i*14f,867f,1250f+i*14f,879f)
            round(c,bar,if(i<airflowLevel)accent else if(night)Color.argb(70,160,183,197) else Color.argb(80,75,102,108),4f)
        }
        text(c,"演示",1350f,879f,14f,muted)
        text(c,if(speedKmh>0)"行驶效果演示 · $speedKmh km/h" else if(airflowAdjusting)"方向键调风量 · 确认退出" else "选中风量后旋钮调节 · 确认进入方向调节",1400f,879f,17f,muted)
        if(loading||rendererError) {
            round(c,RectF(730f,320f,1440f,400f),Color.argb(220,27,43,56),18f)
            text(c,if(rendererError)"3D 渲染器已退出，可返回后重开" else "正在准备车辆空间…",765f,371f,25f,Color.WHITE)
        }
        if(focusIndex>=0)buttons.values.elementAtOrNull(focusIndex)?.let {r ->
            paint.style=Paint.Style.STROKE;paint.color=accent;paint.strokeWidth=3f;c.drawRoundRect(r,18f,18f,paint);paint.style=Paint.Style.FILL
        }
        c.restore()
        drawPrecipitation(c)
    }
    private fun drawFuel(c:Canvas) {
        val data=snapshot
        val litres=FuelQuantity.estimateLitres(data?.fuelPercent)
        val avg=(data?.avgFuelTrip1?:data?.avgFuelTrip2)?.takeIf {it.isFinite()&&it>0.1f}
        val rawRange=data?.oilRangeKm?:data?.totalRangeKm
        val estimated=if(rawRange==null&&litres!=null&&avg!=null)(litres/avg*100).roundToInt().takeIf {it in 0..5000} else null
        val range=rawRange?:estimated
        text(c,if(estimated!=null)"估算续航" else "预计续航",54f,287f,22f,muted)
        text(c,range?.toString()?:"--",50f,374f,85f)
        text(c,"km",283f,369f,25f,muted)
        buttons["fuel-energy"]=RectF(44f,250f,420f,680f)
        drawTrend(c)
        text(c,"燃油余量",54f,433f,21f,muted)
        text(c,data?.fuelPercent?.let {"$it%"}?:"--%",54f,481f,40f)
        text(c,litres?.let {"约 %.1f L".format(Locale.CHINA,it)}?:"-- L",225f,478f,22f,muted)
        paint.color=if(night)Color.argb(40,180,212,230)else Color.argb(40,50,95,106);paint.strokeWidth=1f
        c.drawLine(54f,505f,400f,505f,paint)
        text(c,"本次平均油耗",54f,548f,21f,muted)
        text(c,data?.avgFuelTrip2?.let {"%.1f".format(Locale.CHINA,it)}?:"--",54f,592f,37f)
        text(c,"L/100km",171f,590f,20f,muted)
        text(c,"本次里程",54f,637f,20f,muted)
        text(c,data?.trip2DistanceKm?.let {"%.1f km".format(Locale.CHINA,it)}?:"-- km",205f,637f,26f)
        text(c,if(preview)"演示折线 · 最近 50 km" else if(trend.size<2)"行驶后生成分段油耗" else "最近 50 km · 分段估算",54f,676f,15f,muted)
    }
    private fun drawTrend(c:Canvas) {
        if(trend.size<2)return
        val points=trend.takeLast(40);val path=Path();val area=Path()
        points.forEachIndexed {i,p ->
            val x=48f+i*365f/(points.size-1);val y=605f-(p.value.coerceIn(0f,25f)/25f)*210f
            if(i==0){path.moveTo(x,y);area.moveTo(x,y)}else{path.lineTo(x,y);area.lineTo(x,y)}
        }
        area.lineTo(413f,670f);area.lineTo(48f,670f);area.close()
        paint.shader=LinearGradient(0f,400f,0f,670f,intArrayOf(if(night)Color.argb(65,84,170,210)else Color.argb(45,45,122,147),Color.TRANSPARENT),null,Shader.TileMode.CLAMP)
        paint.style=Paint.Style.FILL;c.drawPath(area,paint);paint.shader=null
        paint.style=Paint.Style.STROKE;paint.strokeWidth=2.5f;paint.color=if(night)Color.argb(90,112,194,221)else Color.argb(80,44,111,134);c.drawPath(path,paint);paint.style=Paint.Style.FILL
    }
    private fun drawHotspots(c:Canvas) {
        if(loading)return
        val names=mapOf("lights" to "大灯","windows" to "车窗","roof" to "天窗","trunk" to "尾门")
        screenHotspots.forEach { (id,p) ->
            val x=(p.first-ox)/scale;val y=(p.second-oy)/scale
            if(x !in 440f..1850f || y !in 110f..650f)return@forEach
            val r=RectF(x-50,y-23,x+50,y+23)
            round(c,r,if(night)Color.argb(220,37,54,65)else Color.argb(220,243,247,244),22f)
            text(c,names.getValue(id),x-24,y+7,20f)
            buttons["hot-$id"]=r
        }
    }
    private fun drawPrecipitation(c:Canvas) {
        if(weather!=DesktopEnvironment.Weather.RAIN&&weather!=DesktopEnvironment.Weather.SNOW)return
        val t=if(reducedMotion)0f else (android.os.SystemClock.elapsedRealtime()%20_000)/1000f
        val snow=weather==DesktopEnvironment.Weather.SNOW
        paint.color=if(snow)Color.argb(170,239,247,252) else Color.argb(95,191,222,239)
        paint.strokeWidth=1.2f
        val boundsLeft=width*.23f
        for(i in 0 until 38) {
            val x=boundsLeft+(i*97%991)/991f*(width-boundsLeft)
            val y=((i*37%103)/103f+t*(if(snow).055f else .48f))%1f*height*.77f
            if(snow)c.drawCircle(x,y,1.5f+i%3,paint) else c.drawLine(x,y,x-3,y+12,paint)
        }
        if(isShown&&!reducedMotion)postInvalidateDelayed(66)
    }
    override fun onTouchEvent(event:MotionEvent):Boolean {
        val x=(event.x-ox)/scale;val y=(event.y-oy)/scale
        if(event.actionMasked==MotionEvent.ACTION_DOWN){
            removeCallbacks(openWindowControls)
            pressed=buttons.entries.lastOrNull {it.value.contains(x,y)}?.key
            touchStartX=event.x;touchStartY=event.y;longPressHandled=false
            if(pressed?.let(::normalizedAction)=="windows")postDelayed(openWindowControls,ViewConfiguration.getLongPressTimeout().toLong())
            invalidate();return pressed!=null
        }
        if(event.actionMasked==MotionEvent.ACTION_MOVE&&hypot(event.x-touchStartX,event.y-touchStartY)>touchSlop)removeCallbacks(openWindowControls)
        if(event.actionMasked==MotionEvent.ACTION_UP){removeCallbacks(openWindowControls);val id=pressed;pressed=null;invalidate();if(!longPressHandled&&id!=null&&buttons[id]?.contains(x,y)==true){focusIndex=buttons.keys.indexOf(id);if(id!="airflow")airflowAdjusting=false;performClick();action(normalizedAction(id))};return id!=null}
        if(event.actionMasked==MotionEvent.ACTION_CANCEL){removeCallbacks(openWindowControls);pressed=null;invalidate()}
        return pressed!=null
    }
    override fun onDetachedFromWindow(){removeCallbacks(openWindowControls);super.onDetachedFromWindow()}
    private fun normalizedAction(id:String)=when {id.startsWith("hot-")->id.removePrefix("hot-");id=="amap-dock"->"amap";id=="fuel-energy"->"energy";else->id}
    override fun performClick():Boolean {super.performClick();return true}
}
