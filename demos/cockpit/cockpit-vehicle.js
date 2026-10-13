// Vehicle only: no vendor showroom, telemetry or application scripts.
const host=document.querySelector('#viewport'),status=document.querySelector('#status');
document.querySelector('.note').textContent='官方展厅 06 Relive 车模与原始材质 · 独立背景，本地研究预览；未作真车性能验证。';
async function boot(){
 await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='./vendor/playcanvas-stable.min.js';s.onload=resolve;s.onerror=()=>reject(Error('渲染引擎加载失败'));document.head.append(s);});
 const pc=window.pc,manifest=await fetch('./assets/relive/manifest.json').then(r=>{if(!r.ok)throw Error('官方资源正在下载，请稍后刷新');return r.json();});
 const canvas=document.createElement('canvas');host.append(canvas);
 const app=new pc.Application(canvas,{graphicsDeviceOptions:{alpha:true,antialias:true,powerPreference:'low-power'}});
 app.graphicsDevice.maxPixelRatio=Math.min(devicePixelRatio,1.5);app.setCanvasResolution(pc.RESOLUTION_AUTO);app.setCanvasFillMode(pc.FILLMODE_NONE);app.autoRender=false;
 app.scene.gammaCorrection=pc.GAMMA_SRGB;app.scene.toneMapping=pc.TONEMAP_FILMIC;app.scene.exposure=1;
 app.scene.ambientLight=new pc.Color(.35,.36,.38);
 const camera=new pc.Entity('View');camera.addComponent('camera',{fov:32,nearClip:.1,farClip:100,clearColor:new pc.Color(0,0,0,0)});app.root.addChild(camera);
 const light=new pc.Entity('KEYLight');light.addComponent('light',{type:'directional',color:new pc.Color(1,.98,.95),intensity:.85,castShadows:false});light.setLocalEulerAngles(45,-35,0);app.root.addChild(light);
 const fill=new pc.Entity('fillLight');fill.addComponent('light',{type:'directional',color:new pc.Color(.92,.96,1),intensity:.3,castShadows:false});fill.setLocalEulerAngles(35,145,0);app.root.addChild(fill);
 const registry=new Map();for(const raw of Object.values(manifest.assets)){const asset=new pc.Asset(raw.name,raw.type,raw.file,raw.data);asset.id=Number(raw.id);app.assets.add(asset);registry.set(asset.id,asset);}
 function load(asset){return new Promise((resolve,reject)=>{if(asset.loaded)return resolve(asset);asset.once('load',()=>resolve(asset));asset.once('error',e=>reject(Error(asset.name+': '+e)));app.assets.load(asset);});}
 status.textContent='加载原始贴图与反射…';
 const referencedCubes=new Set(Object.values(manifest.assets).filter(a=>a.type==='material').map(a=>Number(a.data?.cubeMap)).filter(Boolean));
 await Promise.all([...registry.values()].filter(a=>a.type==='texture'||(a.type==='cubemap'&&referencedCubes.has(a.id))).map(load));
 await Promise.all([...registry.values()].filter(a=>a.type==='material').map(load));
 const trims=await fetch('./references/relive/Lynkco0625Relive.json').then(r=>r.json());
 const materialNames=new Map([...registry.values()].filter(a=>a.type==='material').map(a=>[a.name,a.resource]));
 const car=new pc.Entity('06');app.root.addChild(car);const paints=new Set(),paintMeshes=[];let bounds=null,done=0;
 await Promise.all(manifest.models.map(async spec=>{const asset=[...registry.values()].find(a=>a.type==='model'&&a.name===spec.name);if(!asset)throw Error('缺少车身部件 '+spec.name);await load(asset);const part=new pc.Entity(spec.name);part.addComponent('model',{asset:asset.id,castShadows:false,receiveShadows:false});car.addChild(part);
  for(const mesh of part.model.meshInstances){for(let node=mesh.node;node&&node!==part;node=node.parent){if(/^(F|B)Tires_gr|^EXT_gr/.test(node.name)&&!node.name.includes('gr03'))mesh.visible=false;}const trim=trims.find(t=>t.ModelName===spec.name.replace(/\.glb$/,'')&&t.MeshName===mesh.node.name);if(trim&&materialNames.has(trim.Configs.gr03))mesh.material=materialNames.get(trim.Configs.gr03);if(/^Paint/.test(mesh.material.name)){paints.add(mesh.material);paintMeshes.push(mesh);}if(mesh.visible){if(!bounds)bounds=mesh.aabb.clone();else bounds.add(mesh.aabb);}}
  status.textContent=`车身部件 ${++done} / ${manifest.models.length}`;
 }));
 if(!bounds)throw Error('车身范围为空');const size=bounds.halfExtents.clone().mulScalar(2),center=bounds.center.clone();car.setPosition(-center.x,-center.y+size.y/2,-center.z);
 const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=256;const ctx=shadowCanvas.getContext('2d'),gradient=ctx.createRadialGradient(128,128,5,128,128,124);gradient.addColorStop(0,'rgba(0,0,0,.55)');gradient.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,256,256);
 const texture=new pc.Texture(app.graphicsDevice,{mipmaps:false});texture.setSource(shadowCanvas);const shadowMat=new pc.StandardMaterial();shadowMat.useLighting=false;shadowMat.diffuse=new pc.Color(0,0,0);shadowMat.opacityMap=texture;shadowMat.opacityMapChannel='a';shadowMat.blendType=pc.BLEND_NORMAL;shadowMat.depthWrite=false;shadowMat.update();const shadow=new pc.Entity('Contact shadow');shadow.addComponent('render',{type:'plane',material:shadowMat,castShadows:false,receiveShadows:false});shadow.setLocalScale(size.x*1.5,1,size.z*1.3);shadow.setPosition(0,.005,0);app.root.addChild(shadow);
 const defaultElevation=Math.atan(.25)*180/Math.PI;
 let angle=-36,target=-36,elevation=defaultElevation,targetElevation=defaultElevation,radius=5.6,zoom=1,targetZoom=1,drag=null,pinch=null,count=0;const pointers=new Map(),lookY=size.y*.45,slider=document.querySelector('#angle');
 // Zoom along the current orbit ray, never pan toward the cursor or change orientation.
 const safeDistance=Math.hypot(size.x/2,size.z/2,Math.max(lookY,size.y-lookY))+.35;
 const minZoom=()=>Math.max(.65,safeDistance/(radius/Math.cos(defaultElevation*Math.PI/180)));
 function setZoom(value){targetZoom=Math.max(minZoom(),Math.min(1.4,value));}
 function cameraPose(){const a=angle*Math.PI/180,p=elevation*Math.PI/180,distance=radius*zoom/Math.cos(defaultElevation*Math.PI/180),horizontal=distance*Math.cos(p);camera.setPosition(Math.sin(a)*horizontal,lookY+distance*Math.sin(p),Math.cos(a)*horizontal);camera.lookAt(0,lookY,0);host.dataset.elevation=elevation.toFixed(2);host.dataset.zoom=zoom.toFixed(3);app.renderNextFrame=true;}
 function setAngle(value){target=Math.max(-135,Math.min(135,value));slider.value=target;document.querySelector('#anglevalue').textContent=Math.round(target)+'°';}
 function resize(){const r=host.getBoundingClientRect();app.resizeCanvas(r.width,r.height);radius=r.width/r.height<1.25?7.5:6.25;setZoom(targetZoom);zoom=Math.max(minZoom(),zoom);cameraPose();}
 new ResizeObserver(resize).observe(host);slider.oninput=()=>setAngle(Number(slider.value));const home=document.querySelector('#home');home.onclick=()=>{setAngle(-36);targetElevation=defaultElevation;setZoom(1);};
 for(const [label,factor] of [['放大',.88],['缩小',1/.88]]){const button=document.createElement('button');button.className='view';button.textContent=label;button.onclick=()=>setZoom(targetZoom*factor);home.before(button);}
 function pinchDistance(){const [a,b]=[...pointers.values()];return Math.hypot(a.x-b.x,a.y-b.y);}
 function beginDrag(id,point){drag={id,x:point.x,y:point.y,angle:target,elevation:targetElevation};}
 host.onpointerdown=e=>{if(e.button!==0||pointers.size>=2)return;const point={x:e.clientX,y:e.clientY};pointers.set(e.pointerId,point);host.setPointerCapture(e.pointerId);if(pointers.size===2){drag=null;pinch={distance:Math.max(1,pinchDistance()),zoom:targetZoom};}else beginDrag(e.pointerId,point);};
 host.onpointermove=e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pinch&&pointers.size===2)setZoom(pinch.zoom*pinch.distance/Math.max(1,pinchDistance()));else if(drag&&drag.id===e.pointerId){setAngle(drag.angle+(e.clientX-drag.x)*.35);targetElevation=Math.max(6,Math.min(65,drag.elevation+(e.clientY-drag.y)*.25));}};
 host.onpointerup=host.onpointercancel=host.onlostpointercapture=e=>{if(!pointers.delete(e.pointerId))return;pinch=null;drag=null;if(pointers.size===1){const [id,point]=[...pointers.entries()][0];beginDrag(id,point);}};
 host.addEventListener('wheel',e=>{e.preventDefault();const pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?host.clientHeight:1);setZoom(targetZoom*Math.exp(Math.max(-100,Math.min(100,pixels))*.002));},{passive:false});
 window.addEventListener('blur',()=>{pointers.clear();drag=pinch=null;});
 host.setAttribute('aria-label','领克06三维车身，可左右环绕270度、上下拖动查看车顶');
 document.querySelector('.title p').textContent='左右环绕 · 上下看车顶 · 滚轮 / 双指缩放';
 status.textContent='接入原厂多层车漆…';
 const shaderData=await fetch('./references/relive/shaders/paint-shader.json').then(r=>r.json());
 const presets=await fetch('./references/relive/paint-presets.json').then(r=>r.json());
 await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='./references/relive/shaders/paint-uniforms.js';s.onload=resolve;s.onerror=reject;document.head.append(s);});
 const paintShader=new pc.Shader(app.graphicsDevice,{attributes:{aPosition:pc.SEMANTIC_POSITION,aUv0:pc.SEMANTIC_TEXCOORD0,aUv1:pc.SEMANTIC_TEXCOORD1,aNormal:pc.SEMANTIC_NORMAL},vshader:shaderData.vertex,fshader:'precision '+app.graphicsDevice.precision+' float;\n#define CUBE_MAP\n#define SPECULAR_MASK\n'+shaderData.fragment});
 const paintMat=new pc.Material();paintMat.name='Official multilayer paint';paintMat.shader=paintShader;paintMat.blendType=pc.BLEND_NONE;
 paintMeshes.forEach(mesh=>mesh.material=paintMat);
 const paintEntity=new pc.Entity('Paint parameters');paintEntity.targetMaterial=paintMat;paintEntity.addComponent('script');app.root.addChild(paintEntity);
 const controller=paintEntity.script.create('customShader',{attributes:{...presets.find(p=>p.eid===370).attributes,_AOMap:258530632,_AOUVSelect:3,_AOWeight:1}});
 // These parameters are static: update them on color changes, not every idle frame.
 controller.initialize();controller.update(0);controller.enabled=false;
 const colorOrder=[['森珀绿',365],['暮光紫',394],['落樱粉',367],['沙丘米',368],['银盐白',370],['极地灰',372]];
 const colors=colorOrder.map(([name,eid])=>{const preset=presets.find(p=>p.eid===eid);const color='#'+preset.attributes._Color.slice(0,3).map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('');return [name,color,preset];});
 document.querySelectorAll('.paint').forEach(e=>e.remove());
 function paint(name,preset){for(const [key,value] of Object.entries(preset.attributes)){if(!['_AOMap','_AOWeight','_AOUVSelect'].includes(key))controller[key]=value;}controller.update(0);paintMat.update();document.querySelector('#paintname').textContent=name;app.renderNextFrame=true;}
 for(const [name,color,preset] of colors){const button=document.createElement('button');button.className='paint';button.style.background=color;button.setAttribute('aria-label',name);button.setAttribute('aria-pressed',String(name==='银盐白'));button.onclick=()=>{paint(name,preset);document.querySelectorAll('.paint').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));};document.querySelector('.paints').append(button);}
 paint('银盐白',presets.find(p=>p.eid===370));
 app.on('update',dt=>{if(document.hidden)return;if(Math.abs(angle-target)>.025||Math.abs(elevation-targetElevation)>.025||Math.abs(zoom-targetZoom)>.0005){const blend=matchMedia('(prefers-reduced-motion: reduce)').matches?1:1-Math.exp(-14*Math.min(dt,.05));angle+=(target-angle)*blend;elevation+=(targetElevation-elevation)*blend;zoom+=(targetZoom-zoom)*blend;if(Math.abs(angle-target)<.025)angle=target;if(Math.abs(elevation-targetElevation)<.025)elevation=targetElevation;if(Math.abs(zoom-targetZoom)<.0005)zoom=targetZoom;cameraPose();}});
 app.on('postrender',()=>{host.dataset.drawCount=++count;host.dataset.calls=app.stats.drawCalls.total;host.dataset.triangles=app.stats.frame.triangles;});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)app.renderNextFrame=true;});

 const partStates={lights:false,windows:false,roof:false,trunk:false};
 const trunk=car.children.find(p=>/Trunk/.test(p.name)),roof=car.children.find(p=>/_SR/.test(p.name));
 let hinge=null;
 if(trunk){hinge=new pc.Entity('Tailgate hinge');car.addChild(hinge);const pivot=new pc.Vec3(center.x,center.y+size.y*.36,center.z-size.z*.38);hinge.setLocalPosition(pivot);trunk.reparent(hinge);trunk.setLocalPosition(-pivot.x,-pivot.y,-pivot.z);}
 const glassMeshes=[],lampMaterials=new Set();
 for(const part of car.children){if(!part.model)continue;for(const mesh of part.model.meshInstances){
 if(/^Glass/.test(mesh.material.name)&&/Door/.test(part.name))glassMeshes.push(mesh);
 if(/Light/.test(mesh.material.name)&&!lampMaterials.has(mesh.material)){lampMaterials.add(mesh.material);}
 }}
 const originalEmissive=new Map([...lampMaterials].map(m=>[m,{color:m.emissive.clone(),intensity:m.emissiveIntensity}]));
 let roofT=0,trunkT=0;
 const anchors={
 lights:new pc.Vec3(0,size.y*.45,size.z*.43),
 windows:new pc.Vec3(-size.x*.45,size.y*.72,size.z*.12),
 roof:new pc.Vec3(0,size.y*.98,0),
 trunk:new pc.Vec3(0,size.y*.65,-size.z*.45)
 };
 function project(){for(const [id,p] of Object.entries(anchors)){const screen=camera.camera.worldToScreen(p);const el=document.querySelector('[data-hotspot="'+id+'"]');if(el){el.style.left=screen.x+'px';el.style.top=screen.y+'px';el.style.visibility=screen.z>0?'visible':'hidden';}}}
 app.on('postrender',project);
 app.on('update',dt=>{if(document.hidden)return;const step=Math.min(dt,.05)*4;const nextRoof=partStates.roof?1:0,nextTrunk=partStates.trunk?1:0;
 if(Math.abs(roofT-nextRoof)>.002||Math.abs(trunkT-nextTrunk)>.002){roofT+=(nextRoof-roofT)*step;trunkT+=(nextTrunk-trunkT)*step;if(roof)roof.setLocalPosition(0,.02*roofT,-.46*roofT);if(hinge)hinge.setLocalEulerAngles(-62*trunkT,0,0);app.renderNextFrame=true;}
 });
 window.CarScene={app,camera,car,size,ready:true,setAngle,home:home.onclick,
 rotate(delta){setAngle(target+delta);},
 control(id,value){partStates[id]=value;if(id==='windows')glassMeshes.forEach(m=>m.visible=!value);if(id==='lights')for(const m of lampMaterials){const old=originalEmissive.get(m);m.emissive=value?new pc.Color(.85,.92,1):old.color;m.emissiveIntensity=value?2:old.intensity;m.update();}app.renderNextFrame=true;},
 setTheme(theme){app.scene.exposure=theme==='light'?1.05:.86;app.renderNextFrame=true;},
 get states(){return {...partStates};}
 };
 window.dispatchEvent(new Event('car-ready'));

 app.start();resize();status.textContent='原厂多层车漆 · 拖动查看，静止时停止连续绘制';
}
boot().catch(e=>{status.textContent='加载失败：'+e.message;console.error(e);});


