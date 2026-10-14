const iconPaths={lights:'M13 5C7 5 4 8 4 12s3 7 9 7V5ZM17 7h5M17 11h5M17 15h5M17 19h5',windows:'M4 18 7 6h12l2 12H4Zm4-9h9M10 6l-2 12',roof:'M4 8h16v10H4V8Zm4 0v10M16 8v10M4 5h16',trunk:'M4 16h16v4H4v-4Zm2 0V9l12-5 2 2-12 5v5M10 11l5 5'};
for(const [id,d] of Object.entries(iconPaths)){const node=document.querySelector(`.control-grid [data-control="${id}"] .control-icon`);node.innerHTML=`<svg viewBox="0 0 26 26" aria-hidden="true"><path d="${d}"/></svg>`;}
function setPaint(name){const matching=[...document.querySelectorAll('.legacy .paint')].find(b=>b.getAttribute('aria-label')===name);if(matching)matching.click();document.querySelectorAll('[data-paint]').forEach(b=>{b.classList.toggle('active',b.dataset.paint===name);b.setAttribute('aria-pressed',String(b.dataset.paint===name));});}
document.querySelectorAll('[data-paint]').forEach(b=>b.onclick=()=>setPaint(b.dataset.paint));
const dockIcons={'home-desktop':['M4 12 12 5l8 7v9h-6v-6h-4v6H4v-9Z','桌面'],'nav-map':['M3 5l6 2 6-2 6 2v14l-6-2-6 2-6-2V5Zm6 2v14M15 5v14','地图'],'nav-car':['M5 10l2-5h10l2 5M4 10h16v9H4v-9Zm3 4h2m6 0h2M6 19v2m12-2v2','车辆'],'nav-energy':['M4 19V9m6 10V5m6 14v-7m6 7V3','油耗']};
for(const [id,[d,label]] of Object.entries(dockIcons)){const b=document.getElementById(id);b.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg><span>${label}</span>`;b.setAttribute('aria-label',label);}
const music=document.getElementById('music');
music.dataset.paused='false';
music.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg><span>静谧旅途</span>';
music.setAttribute('aria-label','暂停音乐 · 演示');
const trendValues=[60,53,58,35,40,20,44,38,48,28,30,50,40,54,34,46,39,44,28,34,27,32];
function monotoneCurvePath(values,width,height){
 const points=values.map((y,index)=>({x:width*index/(values.length-1),y}));
 const widths=points.slice(0,-1).map((p,index)=>points[index+1].x-p.x);
 const slopes=points.slice(0,-1).map((p,index)=>(points[index+1].y-p.y)/widths[index]);
 const tangents=Array(points.length).fill(0);tangents[0]=slopes[0];tangents[tangents.length-1]=slopes[slopes.length-1];
 for(let i=1;i<points.length-1;i++){
  const before=slopes[i-1],after=slopes[i];
  if(before===0||after===0||before*after<=0){tangents[i]=0;continue;}
  const prev=widths[i-1],next=widths[i],w1=2*next+prev,w2=next+2*prev;
  tangents[i]=(w1+w2)/(w1/before+w2/after);
 }
 for(let i=0;i<slopes.length;i++){
  const slope=slopes[i];if(!slope){tangents[i]=0;tangents[i+1]=0;continue;}
  if(tangents[i]*slope<0)tangents[i]=0;if(tangents[i+1]*slope<0)tangents[i+1]=0;
  const a=tangents[i]/slope,b=tangents[i+1]/slope,magnitude=a*a+b*b;
  if(magnitude>9){const scale=3/Math.sqrt(magnitude);tangents[i]=scale*a*slope;tangents[i+1]=scale*b*slope;}
 }
 let path=`M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
 for(let i=0;i<slopes.length;i++){
  const start=points[i],end=points[i+1],dx=widths[i];
  path+=`C${(start.x+dx/3).toFixed(2)} ${(start.y+tangents[i]*dx/3).toFixed(2)} ${(end.x-dx/3).toFixed(2)} ${(end.y-tangents[i+1]*dx/3).toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
 }
 return path;
}
const chart=document.querySelector('.fuel-chart'),spark=chart?.querySelector('.spark'),area=chart?.querySelector('path[fill]');
if(chart&&spark&&area){const trend=monotoneCurvePath(trendValues,420,90);spark.setAttribute('d',trend);area.setAttribute('d',`${trend}L420 90H0Z`);}
function defaultForDirection(){const layout=document.body.dataset.layout;if(layout==='drive'&&document.body.dataset.theme==='dark')document.querySelector('#theme').click();if(layout==='space'&&document.body.dataset.theme==='light')document.querySelector('#theme').click();}
document.querySelectorAll('.workbench [data-layout]').forEach(b=>b.addEventListener('click',defaultForDirection));
defaultForDirection();
const route=document.querySelector('.route-line');
new ResizeObserver(()=>{const {width:w,height:h}=route.getBoundingClientRect();if(!w||!h)return;route.setAttribute('viewBox',`0 0 ${w} ${h}`);const r=Math.min(25,w*.04,h*.04),x=w*.39,y=h*.45,b=h*.75;const d=`M${w*.2} ${b}H${x-r}Q${x} ${b} ${x} ${b-r}V${y+r}Q${x} ${y} ${x+r} ${y}H${w*.67}V${h*.2}`;route.querySelectorAll('path').forEach(p=>p.setAttribute('d',d));const dots=route.querySelectorAll('circle');dots[0].setAttribute('cx',w*.2);dots[0].setAttribute('cy',b);dots[1].setAttribute('cx',w*.67);dots[1].setAttribute('cy',h*.2);dots.forEach(c=>c.setAttribute('r',6));}).observe(route);
