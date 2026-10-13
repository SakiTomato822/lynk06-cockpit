const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const state={layout:'space',theme:'dark',lights:false,windows:false,roof:false,trunk:false,rain:0,temp:23};
const directions={space:['车辆空间','车模是主角，常用功能一步触达。','随心，出发。'],journey:['旅途桌面','地图始终可见，车辆与油耗在右侧陪伴。','一路，从容。'],drive:['驾驶座舱','固定功能分区，大触点与旋钮焦点优先。','掌控，在手。']};
let toastTimer,focusIndex=-1,mapEnabled=false,mapExpanded=false;
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2600);}
function changeLayout(layout){state.layout=layout;document.body.dataset.layout=layout;const [title,copy,greeting]=directions[layout];$('#direction-title').textContent=title;$('#direction-copy').textContent=copy;$('.vehicle-heading h1').textContent=greeting;$$('.workbench nav button').forEach(b=>{b.classList.toggle('chosen',b.dataset.layout===layout);b.setAttribute('aria-pressed',String(b.dataset.layout===layout));});focusIndex=-1;$$('.knob-focus').forEach(b=>b.classList.remove('knob-focus'));requestAnimationFrame(()=>{if(mapEnabled)renderMap();});}
$$('.workbench nav button').forEach(b=>b.onclick=()=>changeLayout(b.dataset.layout));
$('#theme').onclick=()=>{state.theme=state.theme==='dark'?'light':'dark';document.body.dataset.theme=state.theme;$('#theme').textContent=state.theme==='dark'?'切换浅色':'切换深色';window.CarScene?.setTheme(state.theme);};
const names={lights:'大灯',windows:'车窗',roof:'天窗',trunk:'尾门'};
function control(id){if(!window.CarScene?.ready){toast('车模正在加载，稍后即可操作');return;}state[id]=!state[id];window.CarScene.control(id,state[id]);$$(`[data-control="${id}"]`).forEach(b=>{b.setAttribute('aria-pressed',String(state[id]));const label=b.querySelector('small');if(label)label.textContent=state[id]?'已开启':'已关闭';});const open=Object.keys(names).filter(k=>state[k]).map(k=>names[k]);$('#car-summary').textContent=open.length?open.join('、')+'已开启':'车辆已就绪';toast(`${names[id]}${state[id]?'已开启':'已关闭'} · 演示操作`);}
$$('[data-control]').forEach(b=>{b.setAttribute('aria-pressed','false');b.onclick=()=>control(b.dataset.control);});
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
$('#music').onclick=()=>{const b=$('#music');const paused=b.dataset.paused!=='true';b.dataset.paused=String(paused);b.innerHTML=(paused?'▷':'Ⅱ')+' <span>静谧旅途</span>';toast(paused?'音乐已暂停 · 演示':'继续播放 · 演示');};
function toggleMapExpansion(){mapExpanded=!mapExpanded;$('.map').classList.toggle('expanded',mapExpanded);$('#map-expand').textContent=mapExpanded?'收起 ↙':'展开 ↗';requestAnimationFrame(()=>{if(mapEnabled)renderMap();});}
$('#map-expand').onclick=toggleMapExpansion;
function focusables(){return detail.open?[$('#close-detail'),...detail.querySelectorAll('button:not(#close-detail)')]:$$('[data-focus]').filter(e=>e.getClientRects().length&&(!mapExpanded||$('.map').contains(e)));}
function rotate(step){const items=focusables();if(!items.length)return;$$('.knob-focus').forEach(b=>b.classList.remove('knob-focus'));focusIndex=(focusIndex+step+items.length)%items.length;items[focusIndex].classList.add('knob-focus');items[focusIndex].focus({preventScroll:true});}
function press(){const items=focusables();if(focusIndex<0){rotate(1);return;}items[focusIndex%items.length]?.click();}
function back(){if(detail.open){detail.close();focusIndex=-1;}else if(mapExpanded)toggleMapExpansion();else{$$('.knob-focus').forEach(b=>b.classList.remove('knob-focus'));focusIndex=-1;toast('已退出旋钮焦点');}}
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
window.addEventListener('car-ready',()=>{window.CarScene.setTheme(state.theme);$('#status').textContent='拖动旋转 · 滚轮缩放 · 点击部位';});
// Browser caching follows the OSM server headers; request only the current viewport.
$('#map-enable').onclick=()=>{if(mapEnabled){mapEnabled=false;$('#map-tiles').replaceChildren();$('.map').classList.remove('loaded');$('#attribution').hidden=true;$('#map-enable').textContent='加载 OSM 底图';return;}openDetail('<h2>查看在线底图</h2><p>将从 OpenStreetMap 加载当前查看区域的道路和地名。地图服务会收到你的 IP 和查看区域。此处路线是布局演示，不代表真实行驶路线。</p><button id="confirm-map">加载底图</button>');$('#confirm-map').onclick=()=>{detail.close();mapEnabled=true;renderMap();$('#map-enable').textContent='关闭在线底图';};};
let mapTimer;
function renderMap(){if(!mapEnabled)return;const host=$('#map-tiles'),w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;const z=14,n=2**z,lon=119.303,lat=26.077,a=lat*Math.PI/180,cx=(lon+180)/360*n*256,cy=(1-Math.log(Math.tan(a)+1/Math.cos(a))/Math.PI)/2*n*256,left=cx-w/2,top=cy-h/2;host.replaceChildren();let loaded=0;for(let x=Math.floor(left/256);x<=Math.floor((left+w)/256);x++)for(let y=Math.floor(top/256);y<=Math.floor((top+h)/256);y++){const img=new Image();img.alt='';img.src=`https://tile.openstreetmap.org/${z}/${x}/${y}.png`;img.style.left=(x*256-left)+'px';img.style.top=(y*256-top)+'px';img.onload=()=>{loaded++;$('.map').classList.add('loaded');};img.onerror=()=>toast('部分底图加载失败，仍可预览交互');host.append(img);}$('#attribution').hidden=false;}
new ResizeObserver(()=>{clearTimeout(mapTimer);mapTimer=setTimeout(()=>{if(mapEnabled)renderMap();},250);}).observe($('#map-surface'));
window.CockpitDemo={state,changeLayout,control,energyDetail,renderMap};
changeLayout(new URLSearchParams(location.search).get('layout') in directions?new URLSearchParams(location.search).get('layout'):'space');
