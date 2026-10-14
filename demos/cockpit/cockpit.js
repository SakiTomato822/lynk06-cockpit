const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const state={layout:'space',theme:'dark',lights:false,windows:false,roof:false,trunk:false,rain:0,temp:23,fan:3};
const directions={space:['全景 · 车辆','宽幅车模、克制的信息层级，控制沿边缘展开。','06'],journey:['漫游 · 地图','地图铺满桌面，车辆与行程数据悬浮于其上。','06'],drive:['精密 · 座舱','浅色仪表布局，细分隔线与固定旋钮操作区。','LYNK 06']};
let toastTimer,focusIndex=-1,mapEnabled=false,mapExpanded=false;
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2600);}
function changeLayout(layout){state.layout=layout;document.body.dataset.layout=layout;const [title,copy,greeting]=directions[layout];$('#direction-title').textContent=title;$('#direction-copy').textContent=copy;$('.vehicle-heading h1').textContent=greeting;$$('.workbench nav button').forEach(b=>{b.classList.toggle('chosen',b.dataset.layout===layout);b.setAttribute('aria-pressed',String(b.dataset.layout===layout));});focusIndex=-1;$$('.knob-focus').forEach(b=>b.classList.remove('knob-focus'));requestAnimationFrame(()=>{if(mapEnabled)renderMap();});}
$$('.workbench nav button').forEach(b=>b.onclick=()=>changeLayout(b.dataset.layout));
$('#theme').onclick=()=>{state.theme=state.theme==='dark'?'light':'dark';document.body.dataset.theme=state.theme;$('#theme').textContent=state.theme==='dark'?'切换浅色':'切换深色';window.CarScene?.setTheme(state.theme);};
const names={lights:'大灯',windows:'车窗',roof:'天窗',trunk:'尾门'};
const windowPopover=$('#window-popover'),windowButtons=$$('[data-control="windows"]'),windowInputs=$$('[data-window]'),windowPresses=new Map(),longPressOpened=new WeakSet();let windowPopoverAnchor=null;
function updateCarSummary(){const open=Object.keys(names).filter(k=>state[k]).map(k=>names[k]);$('#car-summary').textContent=open.length?open.join('、')+'已开启':'车辆已就绪';}
function syncWindows(){const values=windowInputs.map(input=>({id:input.dataset.window,value:Number(input.value)}));const active=values.filter(v=>v.value>0);state.windows=active.length>0;for(const {id,value} of values){const output=$(`[data-window-value="${id}"]`);if(output)output.textContent=value+'%';}$$('[data-control="windows"]').forEach(button=>{button.setAttribute('aria-pressed',String(state.windows));const label=button.querySelector('small');if(label)label.textContent=active.length?`${active.length}窗开启`:'已关闭';});updateCarSummary();}
function showWindowHint(){toast('短按提示：长按或右键可调节四窗开度');}
function placeWindowPopover(anchor){const root=$('.cockpit').getBoundingClientRect(),target=anchor.getBoundingClientRect(),width=windowPopover.offsetWidth,height=windowPopover.offsetHeight;let left=target.left-root.left+target.width/2-width/2,top=target.top-root.top-height-12;left=Math.max(12,Math.min(root.width-width-12,left));if(top<12)top=target.bottom-root.top+12;top=Math.max(12,Math.min(root.height-height-12,top));windowPopover.style.left=left+'px';windowPopover.style.top=top+'px';}
function openWindowPopover(anchor,focus=false){if(!window.CarScene?.ready){toast('车模加载完成后即可调节车窗');return;}windowPopoverAnchor=anchor||windowButtons[0];const current=window.CarScene.states.windows;for(const input of windowInputs)input.value=Math.round((current[input.dataset.window]||0)*100);syncWindows();windowPopover.hidden=false;windowPopover.style.visibility='hidden';placeWindowPopover(windowPopoverAnchor);windowPopover.style.visibility='visible';windowButtons.forEach(button=>button.setAttribute('aria-expanded','true'));if(focus)$('#window-lf').focus({preventScroll:true});}
function closeWindowPopover(){windowPopover.hidden=true;windowPopover.style.removeProperty('visibility');windowPopoverAnchor=null;windowButtons.forEach(button=>button.setAttribute('aria-expanded','false'));}
windowButtons.forEach(button=>{
 button.addEventListener('pointerdown',event=>{if(event.button!==0||event.isPrimary===false)return;const record={button,x:event.clientX,y:event.clientY,opened:false,timer:0};record.timer=setTimeout(()=>{record.opened=true;longPressOpened.add(button);openWindowPopover(button);setTimeout(()=>longPressOpened.delete(button),1000);},520);windowPresses.set(event.pointerId,record);});
 button.addEventListener('contextmenu',event=>{event.preventDefault();openWindowPopover(button,true);});
});
document.addEventListener('pointermove',event=>{const record=windowPresses.get(event.pointerId);if(record&&Math.hypot(event.clientX-record.x,event.clientY-record.y)>10)clearTimeout(record.timer);});
function finishWindowPress(event){const record=windowPresses.get(event.pointerId);if(record){clearTimeout(record.timer);windowPresses.delete(event.pointerId);}}
document.addEventListener('pointerup',finishWindowPress);document.addEventListener('pointercancel',finishWindowPress);
document.addEventListener('pointerdown',event=>{if(!windowPopover.hidden&&!windowPopover.contains(event.target)&&!windowButtons.some(button=>button.contains(event.target)))closeWindowPopover();});
$('#close-window-popover').onclick=closeWindowPopover;
$('#close-all-windows').onclick=()=>{for(const input of windowInputs){input.value='0';window.CarScene?.setWindow(input.dataset.window,0);}syncWindows();};
windowInputs.forEach(input=>input.addEventListener('input',()=>{window.CarScene?.setWindow(input.dataset.window,Number(input.value)/100);syncWindows();}));
window.addEventListener('resize',()=>{if(!windowPopover.hidden&&windowPopoverAnchor)placeWindowPopover(windowPopoverAnchor);});
window.addEventListener('blur',()=>{for(const record of windowPresses.values())clearTimeout(record.timer);windowPresses.clear();});
function control(id){if(id==='windows'){showWindowHint();return;}if(!window.CarScene?.ready){toast('车模正在加载，稍后即可操作');return;}state[id]=!state[id];window.CarScene.control(id,state[id]);$$(`[data-control="${id}"]`).forEach(b=>{b.setAttribute('aria-pressed',String(state[id]));const label=b.querySelector('small');if(label)label.textContent=state[id]?'已开启':'已关闭';});updateCarSummary();toast(`${names[id]}${state[id]?'已开启':'已关闭'} · 演示操作`);}
$$('[data-control]').forEach(b=>{b.setAttribute('aria-pressed','false');b.onclick=()=>{if(b.dataset.control==='windows'){if(longPressOpened.delete(b))return;showWindowHint();return;}control(b.dataset.control);};});
$('#reset-view').onclick=()=>window.CarScene?.home();
$('#home-desktop').onclick=()=>{if(mapExpanded)toggleMapExpansion();window.CarScene?.home();toast('已回到桌面');};
$('#nav-car').onclick=()=>{if(mapExpanded)toggleMapExpansion();changeLayout('space');};
$('#nav-map').onclick=()=>changeLayout('journey');
const detail=$('#detail');
function openDetail(content){$('#detail-content').innerHTML=content;detail.showModal();$('#close-detail').focus();}
$('#close-detail').onclick=()=>detail.close();
detail.addEventListener('click',e=>{if(e.target===detail)detail.close();});
function energyDetail(){openDetail(`<span class="eyebrow">FUEL & JOURNEY · 演示</span><h2>这一程，轻松掌握。</h2><div class="detail-grid"><article><small>本次平均油耗</small><strong>7.9 <small>L/100km</small></strong></article><article><small>行驶里程</small><strong>18.6 <small>km</small></strong></article><article><small>行驶时间</small><strong>32 <small>min</small></strong></article><article><small>燃油余量</small><strong>68 <small>% · 约 34.0 L</small></strong></article></div><p>地图上的颜色可切换为速度或分段油耗。正式接入时，分段油耗根据车辆累计数据估算，缺少有效数据的路段留空。</p><p>当前画面中的数字与曲线为设计演示。</p>`);}
$('#energy-expand').onclick=$('#nav-energy').onclick=energyDetail;
$('#temp-down').onclick=()=>setTemp(-.5);$('#temp-up').onclick=()=>setTemp(.5);
function setTemp(delta){state.temp=Math.max(16,Math.min(30,state.temp+delta));$('#temperature').textContent=state.temp.toFixed(1)+'°';toast('空调 '+state.temp.toFixed(1)+'° · 演示操作');}
$('#fan-down').onclick=()=>setFan(-1);$('#fan-up').onclick=()=>setFan(1);
function setFan(delta){state.fan=Math.max(1,Math.min(7,state.fan+delta));$('#fan-level').textContent=state.fan;$('#fan-bars').style.setProperty('--fan-level',state.fan);$('#fan-bars').setAttribute('aria-label',`风量 ${state.fan} 档`);toast(`风量 ${state.fan} 档 · 演示，不下发控车`);}
setFan(0);
$('#music').onclick=()=>{const b=$('#music');const paused=b.dataset.paused!=='true';b.dataset.paused=String(paused);const icon=paused?'<path d="m8 5 11 7-11 7z"/>':'<path d="M8 5v14M16 5v14"/>';b.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg><span>静谧旅途</span>`;b.setAttribute('aria-label',paused?'播放音乐 · 演示':'暂停音乐 · 演示');toast(paused?'音乐已暂停 · 演示':'继续播放 · 演示');};
function toggleMapExpansion(){mapExpanded=!mapExpanded;$('.map').classList.toggle('expanded',mapExpanded);$('#map-expand').textContent=mapExpanded?'收起 ↙':'展开 ↗';requestAnimationFrame(()=>{if(mapEnabled)renderMap();});}
$('#map-expand').onclick=toggleMapExpansion;
function focusables(){return detail.open?[$('#close-detail'),...detail.querySelectorAll('button:not(#close-detail)')]:!windowPopover.hidden?[...windowPopover.querySelectorAll('button,input')]:$$('[data-focus]').filter(e=>e.getClientRects().length&&(!mapExpanded||$('.map').contains(e)));}
function rotate(step){const items=focusables();if(!items.length)return;$$('.knob-focus').forEach(b=>b.classList.remove('knob-focus'));focusIndex=(focusIndex+step+items.length)%items.length;items[focusIndex].classList.add('knob-focus');items[focusIndex].focus({preventScroll:true});}
function press(){const items=focusables();if(focusIndex<0){rotate(1);return;}items[focusIndex%items.length]?.click();}
function back(){if(!windowPopover.hidden){closeWindowPopover();focusIndex=-1;}else if(detail.open){detail.close();focusIndex=-1;}else if(mapExpanded)toggleMapExpansion();else{$$('.knob-focus').forEach(b=>b.classList.remove('knob-focus'));focusIndex=-1;toast('已退出旋钮焦点');}}
window.CockpitInput={rotate,press,back};
$('#knob-left').onclick=()=>rotate(-1);$('#knob-right').onclick=()=>rotate(1);$('#knob-ok').onclick=press;$('#knob-back').onclick=back;
$('.rotary').addEventListener('wheel',e=>{e.preventDefault();rotate(e.deltaY>0?1:-1);},{passive:false});
document.addEventListener('keydown',e=>{if(e.target.matches('input,select'))return;if(['ArrowLeft','ArrowUp','ArrowRight','ArrowDown'].includes(e.key)){e.preventDefault();rotate(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1);}else if(e.key==='Enter'&&focusIndex>=0){e.preventDefault();press();}else if(e.key==='Escape'){e.preventDefault();back();}});
const rainCanvas=$('#rain'),rainContext=rainCanvas.getContext('2d');let rainFrame=0,lastRain=0;const drops=Array.from({length:90},(_,i)=>({x:(i*73%101)/101,y:(i*37%103)/103,v:.4+(i%7)*.06}));
function sizeRain(){rainCanvas.width=rainCanvas.clientWidth;rainCanvas.height=rainCanvas.clientHeight;drawRain(0);}
function drawRain(time){rainFrame=0;if(document.hidden||!state.rain){rainContext.clearRect(0,0,rainCanvas.width,rainCanvas.height);return;}if(time-lastRain<33){rainFrame=requestAnimationFrame(drawRain);return;}const dt=Math.min((time-lastRain)/1000,.05);lastRain=time;const w=rainCanvas.width,h=rainCanvas.height;rainContext.clearRect(0,0,w,h);rainContext.strokeStyle=state.theme==='dark'?'rgba(188,219,230,.32)':'rgba(83,126,145,.28)';rainContext.lineWidth=1;rainContext.beginPath();for(const drop of drops.slice(0,state.rain*25)){drop.y=(drop.y+dt*drop.v*(.8+state.rain*.2))%1;rainContext.moveTo(drop.x*w,drop.y*h);rainContext.lineTo(drop.x*w-3,drop.y*h+8+state.rain*3);}rainContext.stroke();if(!matchMedia('(prefers-reduced-motion: reduce)').matches)rainFrame=requestAnimationFrame(drawRain);}
new ResizeObserver(sizeRain).observe(rainCanvas);
$('#rain-level').oninput=e=>{state.rain=Number(e.target.value);const labels=['无雨','小雨','中雨','大雨'];$('#rain-value').textContent=labels[state.rain];$('#weather').textContent=state.rain?labels[state.rain]+' · 22°':'晴朗 · 24°';$('.puddle').style.opacity=state.rain/3;cancelAnimationFrame(rainFrame);rainFrame=requestAnimationFrame(drawRain);};
document.addEventListener('visibilitychange',()=>{cancelAnimationFrame(rainFrame);if(!document.hidden&&state.rain)rainFrame=requestAnimationFrame(drawRain);});
window.addEventListener('car-ready',()=>{window.CarScene.setTheme(state.theme);$('#status').textContent='拖动旋转 · 长按车窗调节四窗 · 点击部位';});
// Browser caching follows the OSM server headers; request only the current viewport.
$('#map-enable').onclick=()=>{if(mapEnabled){mapEnabled=false;$('#map-tiles').replaceChildren();$('.map').classList.remove('loaded');$('#attribution').hidden=true;$('#map-enable').textContent='加载 OSM 底图';return;}openDetail('<h2>查看在线底图</h2><p>将从 OpenStreetMap 加载当前查看区域的道路和地名。地图服务会收到你的 IP 和查看区域。此处路线是布局演示，不代表真实行驶路线。</p><button id="confirm-map">加载底图</button>');$('#confirm-map').onclick=()=>{detail.close();mapEnabled=true;renderMap();$('#map-enable').textContent='关闭在线底图';};};
let mapTimer;
function renderMap(){if(!mapEnabled)return;const host=$('#map-tiles'),w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;const z=14,n=2**z,lon=119.303,lat=26.077,a=lat*Math.PI/180,cx=(lon+180)/360*n*256,cy=(1-Math.log(Math.tan(a)+1/Math.cos(a))/Math.PI)/2*n*256,left=cx-w/2,top=cy-h/2;host.replaceChildren();let loaded=0;for(let x=Math.floor(left/256);x<=Math.floor((left+w)/256);x++)for(let y=Math.floor(top/256);y<=Math.floor((top+h)/256);y++){const img=new Image();img.alt='';img.src=`https://tile.openstreetmap.org/${z}/${x}/${y}.png`;img.style.left=(x*256-left)+'px';img.style.top=(y*256-top)+'px';img.onload=()=>{loaded++;$('.map').classList.add('loaded');};img.onerror=()=>toast('部分底图加载失败，仍可预览交互');host.append(img);}$('#attribution').hidden=false;}
new ResizeObserver(()=>{clearTimeout(mapTimer);mapTimer=setTimeout(()=>{if(mapEnabled)renderMap();},250);}).observe($('#map-surface'));
window.CockpitDemo={state,changeLayout,control,energyDetail,renderMap};
changeLayout(new URLSearchParams(location.search).get('layout') in directions?new URLSearchParams(location.search).get('layout'):'space');
