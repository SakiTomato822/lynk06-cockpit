// Vehicle only: no vendor showroom, telemetry or application scripts.
const host=document.querySelector('#viewport'),status=document.querySelector('#status');
document.querySelector('.note').textContent='官方展厅 06 Relive 车模与原始材质 · 独立背景，本地研究预览；未作真车性能验证。';
async function boot(){
 await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='./vendor/playcanvas-stable.min.js';s.onload=resolve;s.onerror=()=>reject(Error('渲染引擎加载失败'));document.head.append(s);});
 const pc=window.pc,manifest=await fetch('./assets/relive/manifest.json').then(r=>{if(!r.ok)throw Error('官方资源正在下载，请稍后刷新');return r.json();});
 const canvas=document.createElement('canvas');host.append(canvas);
 const androidRenderer=/Android/i.test(navigator.userAgent)||document.body.dataset.native==='true';
 const graphicsDeviceOptions={alpha:true,antialias:true,powerPreference:'low-power'};
 if(androidRenderer){graphicsDeviceOptions.preferWebGl2=false;graphicsDeviceOptions.deviceTypes=[pc.DEVICETYPE_WEBGL1];}
 const app=new pc.Application(canvas,{graphicsDeviceOptions});
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
 let angle=36,target=36,elevation=defaultElevation,targetElevation=defaultElevation,radius=5.6,zoom=1,targetZoom=1,drag=null,pinch=null,count=0;const pointers=new Map(),lookY=size.y*.45,slider=document.querySelector('#angle');
 // Zoom along the current orbit ray, never pan toward the cursor or change orientation.
 const safeDistance=Math.hypot(size.x/2,size.z/2,Math.max(lookY,size.y-lookY))+.35;
 const minZoom=()=>Math.max(.65,safeDistance/(radius/Math.cos(defaultElevation*Math.PI/180)));
 function setZoom(value){targetZoom=Math.max(minZoom(),Math.min(1.4,value));}
 function cameraPose(){const a=angle*Math.PI/180,p=elevation*Math.PI/180,distance=radius*zoom/Math.cos(defaultElevation*Math.PI/180),horizontal=distance*Math.cos(p);camera.setPosition(Math.sin(a)*horizontal,lookY+distance*Math.sin(p),Math.cos(a)*horizontal);camera.lookAt(0,lookY,0);host.dataset.angle=angle.toFixed(2);host.dataset.elevation=elevation.toFixed(2);host.dataset.zoom=zoom.toFixed(3);app.renderNextFrame=true;}
 function setAngle(value){target=Math.max(-135,Math.min(135,value));slider.value=target;document.querySelector('#anglevalue').textContent=Math.round(target)+'°';}
 function resize(){const r=host.getBoundingClientRect();app.resizeCanvas(r.width,r.height);const layout=document.body.dataset.layout;radius=r.width/r.height<1.1?7.1:layout==='space'?4.95:layout==='journey'?5.6:5.3;setZoom(targetZoom);zoom=Math.max(minZoom(),zoom);cameraPose();}
 new ResizeObserver(resize).observe(host);slider.oninput=()=>setAngle(Number(slider.value));const home=document.querySelector('#home');home.onclick=()=>{setAngle(36);targetElevation=defaultElevation;setZoom(1);};
 for(const [label,factor] of [['放大',.88],['缩小',1/.88]]){const button=document.createElement('button');button.className='view';button.textContent=label;button.onclick=()=>setZoom(targetZoom*factor);home.before(button);}
 function pinchDistance(){const [a,b]=[...pointers.values()];return Math.hypot(a.x-b.x,a.y-b.y);}
 function beginDrag(id,point){drag={id,x:point.x,y:point.y,angle:target,elevation:targetElevation};}
 host.onpointerdown=e=>{if(e.button!==0||pointers.size>=2)return;const point={x:e.clientX,y:e.clientY};pointers.set(e.pointerId,point);host.setPointerCapture(e.pointerId);if(pointers.size===2){drag=null;pinch={distance:Math.max(1,pinchDistance()),zoom:targetZoom};}else beginDrag(e.pointerId,point);};
 host.onpointermove=e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pinch&&pointers.size===2)setZoom(pinch.zoom*pinch.distance/Math.max(1,pinchDistance()));else if(drag&&drag.id===e.pointerId){setAngle(drag.angle-(e.clientX-drag.x)*.35);targetElevation=Math.max(6,Math.min(65,drag.elevation+(e.clientY-drag.y)*.25));}};
 host.onpointerup=host.onpointercancel=host.onlostpointercapture=e=>{if(!pointers.delete(e.pointerId))return;pinch=null;drag=null;if(pointers.size===1){const [id,point]=[...pointers.entries()][0];beginDrag(id,point);}};
 host.addEventListener('wheel',e=>{e.preventDefault();const pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?host.clientHeight:1);setZoom(targetZoom*Math.exp(Math.max(-100,Math.min(100,pixels))*.002));},{passive:false});
 window.addEventListener('blur',()=>{pointers.clear();drag=pinch=null;});
 host.setAttribute('aria-label','领克06三维车身，可左右环绕270度、上下拖动查看车顶');
 document.querySelector('.title p').textContent='左右环绕 · 上下看车顶 · 滚轮 / 双指缩放';
 status.textContent='接入原厂多层车漆…';
 const shaderData=await fetch('./references/relive/shaders/paint-shader.json').then(r=>r.json());
 const presets=await fetch('./references/relive/paint-presets.json').then(r=>r.json());
 await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='./references/relive/shaders/paint-uniforms.js';s.onload=resolve;s.onerror=reject;document.head.append(s);});
 const paintShader=new pc.Shader(app.graphicsDevice,{attributes:{aPosition:pc.SEMANTIC_POSITION,aUv0:pc.SEMANTIC_TEXCOORD0,aUv1:pc.SEMANTIC_TEXCOORD1,aNormal:pc.SEMANTIC_NORMAL},vshader:shaderData.vertex,fshader:'precision '+app.graphicsDevice.precision+' float;\n#define CUBE_MAP\n#define SPECULAR_MASK\nuniform float sceneExposure; uniform float sceneFog; uniform vec3 sceneFogColor;\n'+shaderData.fragment.replace('gl_FragColor = color;', 'float fogMix = 1.0-exp(-sceneFog*length(posWorld.xyz-view_position)); color.rgb=mix(color.rgb,sceneFogColor,fogMix); color.rgb=gammaCorrectOutput(toneMap(max(color.rgb,vec3(0.0))*sceneExposure)); color.a=1.0; gl_FragColor = color;')});
 const paintMat=new pc.Material();paintMat.name='Official multilayer paint';paintMat.shader=paintShader;paintMat.blendType=pc.BLEND_NONE;
 paintMeshes.forEach(mesh=>mesh.material=paintMat);paintMat.setParameter('sceneExposure',1.0);paintMat.setParameter('sceneFog',0);paintMat.setParameter('sceneFogColor',[.45,.52,.58]);
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


 const partStates={lights:false,windows:{lf:0,rf:0,lb:0,rb:0},roof:0,trunk:false};
 const animated=new Map();let weather='clear',speed=0;
 function animate(key,to,apply,duration=900){const previous=animated.get(key);animated.set(key,{from:previous?.value??0,to,value:previous?.value??0,start:performance.now(),duration,apply});app.renderNextFrame=true;}
 function unionPart(part){let box=null;for(const mesh of part?.model?.meshInstances||[]){if(!mesh.visible)continue;if(!box)box=mesh.aabb.clone();else box.add(mesh.aabb);}return box;}
 const trunk=car.children.find(p=>/Trunk/.test(p.name)),roof=car.children.find(p=>/_SR\./.test(p.name));
 let hinge=null;
 if(trunk){const box=unionPart(trunk),max=box.getMax();const worldPivot=new pc.Vec3(box.center.x,max.y-.012,max.z-.04);
 const localPivot=car.getWorldTransform().clone().invert().transformPoint(worldPivot);
 hinge=new pc.Entity('Tailgate actual hinge');car.addChild(hinge);hinge.setLocalPosition(localPivot);trunk.reparent(hinge);trunk.setLocalPosition(-localPivot.x,-localPivot.y,-localPivot.z);}
 const glassByWindow={lf:[],rf:[],lb:[],rb:[]},doorCodes={LFDoor:'lf',RFDoor:'rf',LBDoor:'lb',RBDoor:'rb'},lampMaterials=new Set();
 for(const part of car.children){if(!part.model)continue;const code=Object.entries(doorCodes).find(([name])=>part.name.includes('_'+name+'.'))?.[1];
 for(const mesh of part.model.meshInstances){
 if(code&&/^(Glass_WW|Glass_FL)$/.test(mesh.material.name)&&!glassByWindow[code].some(v=>v.node===mesh.node)){const parent=mesh.node.parent;const scale=parent.getWorldTransform().getScale();glassByWindow[code].push({node:mesh.node,origin:mesh.node.getLocalPosition().clone(),units:Math.abs(scale.y)||.0085});}
 if(/^FLight0[12]$/.test(mesh.material.name)){mesh.material=mesh.material.clone();lampMaterials.add(mesh.material);mesh.material.emissiveIntensity=.01;mesh.material.update();}
 }}
 // A single low-poly textured ground card gives the headlights a readable, soft double beam.
 // It lives in car-local space, so it stays aligned with the front while the camera orbits.
 const beamCanvas=document.createElement('canvas');beamCanvas.width=beamCanvas.height=512;
 const beamContext=beamCanvas.getContext('2d');
 for(const x of [164,348]){
  beamContext.save();beamContext.shadowColor='rgba(212,235,255,.36)';beamContext.shadowBlur=22;beamContext.fillStyle=beamContext.createLinearGradient(0,0,512,0);beamContext.fillStyle.addColorStop(0,'rgba(205,229,255,0)');beamContext.fillStyle.addColorStop(.5,'rgba(225,241,255,.42)');beamContext.fillStyle.addColorStop(1,'rgba(205,229,255,0)');
  beamContext.globalAlpha=.42;beamContext.beginPath();beamContext.moveTo(x-7,0);beamContext.bezierCurveTo(x-22,130,x-76,350,x-82,512);beamContext.lineTo(x+82,512);beamContext.bezierCurveTo(x+76,350,x+22,130,x+7,0);beamContext.closePath();beamContext.fill();beamContext.restore();
  beamContext.save();const reflection=beamContext.createRadialGradient(x,405,3,x,405,54);reflection.addColorStop(0,'rgba(244,249,255,.4)');reflection.addColorStop(.28,'rgba(220,239,255,.24)');reflection.addColorStop(1,'rgba(205,229,255,0)');beamContext.fillStyle=reflection;beamContext.beginPath();beamContext.ellipse(x,405,54,34,0,0,Math.PI*2);beamContext.fill();beamContext.restore();
 }
 const beamTexture=new pc.Texture(app.graphicsDevice,{mipmaps:false});beamTexture.setSource(beamCanvas);beamTexture.minFilter=pc.FILTER_LINEAR;beamTexture.magFilter=pc.FILTER_LINEAR;
 const beamMaterial=new pc.StandardMaterial();beamMaterial.name='Soft headlight ground beams';beamMaterial.useLighting=false;beamMaterial.useTonemap=false;beamMaterial.diffuse=new pc.Color(1,1,1);beamMaterial.diffuseMap=beamTexture;beamMaterial.opacityMap=beamTexture;beamMaterial.opacityMapChannel='a';beamMaterial.opacity=.72;beamMaterial.blendType=pc.BLEND_NORMAL;beamMaterial.depthWrite=false;beamMaterial.cull=pc.CULLFACE_NONE;beamMaterial.update();
 const beamLength=size.z*.96,beam=new pc.Entity('Headlight ground beams');beam.addComponent('render',{type:'plane',material:beamMaterial,castShadows:false,receiveShadows:false});beam.setLocalScale(size.x*1.55,1,beamLength);beam.setLocalPosition(0,-car.getPosition().y+.012,size.z/2+.08+beamLength/2);car.addChild(beam);beam.enabled=false;
 const anchors={lights:new pc.Vec3(0,size.y*.45,size.z*.43),windows:new pc.Vec3(-size.x*.45,size.y*.72,size.z*.12),roof:new pc.Vec3(0,size.y*.98,0),trunk:new pc.Vec3(0,size.y*.65,-size.z*.45)};
 function project(){const positions={};for(const [id,p] of Object.entries(anchors)){const q=camera.camera.worldToScreen(p);positions[id]={x:q.x/host.clientWidth,y:q.y/host.clientHeight,visible:q.z>0};const el=document.querySelector('[data-hotspot="'+id+'"]');if(el){el.style.left=q.x+'px';el.style.top=q.y+'px';el.style.visibility=q.z>0?'visible':'hidden';}}
 if(window.VehicleHost&&document.body.dataset.native==='true')window.VehicleHost.hotspots(JSON.stringify(positions));}
 app.on('postrender',project);
 // A bounded world-space ground layer makes snow and tyre traces follow camera orbit.
 const groundCanvas=document.createElement('canvas');groundCanvas.width=groundCanvas.height=512;
 const gc=groundCanvas.getContext('2d'),groundTexture=new pc.Texture(app.graphicsDevice,{mipmaps:false});
 const groundMat=new pc.StandardMaterial();groundMat.useLighting=false;groundMat.diffuse=new pc.Color(1,1,1);groundMat.diffuseMap=groundTexture;groundMat.opacityMap=groundTexture;groundMat.opacityMapChannel='a';groundMat.blendType=pc.BLEND_NORMAL;groundMat.depthWrite=false;groundMat.cull=pc.CULLFACE_NONE;groundMat.update();
 const ground=new pc.Entity('Weather ground');ground.addComponent('render',{type:'plane',material:groundMat,castShadows:false,receiveShadows:false});ground.setLocalScale(9,1,12);ground.setPosition(0,.002,0);app.root.addChild(ground);ground.enabled=false;
 let travel=0,lastGround=0;
 function drawGround(){gc.clearRect(0,0,512,512);if(weather==='snow'){const g=gc.createRadialGradient(256,256,30,256,256,255);g.addColorStop(0,'rgba(236,242,242,.93)');g.addColorStop(.65,'rgba(236,242,242,.86)');g.addColorStop(1,'rgba(236,242,242,0)');gc.fillStyle=g;gc.fillRect(0,0,512,512);}
 if(speed>0&&(weather==='snow'||weather==='rain')){gc.strokeStyle=weather==='snow'?'rgba(80,99,111,.45)':'rgba(168,200,221,.15)';gc.lineWidth=weather==='snow'?8:5;gc.setLineDash([6,3]);gc.lineDashOffset=-travel*8;gc.beginPath();for(const x of [219,293]){gc.moveTo(x,310);gc.lineTo(x,Math.min(490,330+travel*7));}gc.stroke();}
 groundTexture.setSource(groundCanvas);ground.enabled=weather==='snow'||(weather==='rain'&&speed>0);}
 function setWindow(id,open){if(!(id in glassByWindow))return;const value=Math.max(0,Math.min(1,open));partStates.windows[id]=value;animate('window-'+id,value,t=>{for(const entry of glassByWindow[id])entry.node.setLocalPosition(entry.origin.x,entry.origin.y-.38*t/entry.units,entry.origin.z);},700);}
 function setRoof(open){partStates.roof=Math.max(0,Math.min(1,open));animate('roof',partStates.roof,t=>{if(!roof)return;const lift=Math.min(t/.22,1)*.025,slide=Math.max(0,(t-.22)/.78)*.30;roof.setLocalPosition(0,lift,-slide);roof.setLocalEulerAngles(0,0,0);},1100);}
 function setLights(value){partStates.lights=!!value;beam.enabled=partStates.lights;for(const mat of lampMaterials){mat.emissive=new pc.Color(.91,.96,1);mat.emissiveIntensity=partStates.lights?2.1:.01;mat.update();}app.renderNextFrame=true;}
 function setTheme(theme){const day=theme==='light';app.scene.exposure=day?1.05:1;app.scene.ambientLight=new pc.Color(day?.53:.35,day?.55:.41,day?.56:.52);
 light.light.color=new pc.Color(day?1:.74,day?.98:.83,day?.94:1);light.light.intensity=day?.9:.72;fill.light.intensity=day?.45:.52;controller.update(0);paintMat.setParameter('sceneExposure',day?1:.92);app.renderNextFrame=true;}
 function environment(kind,kmh=0){weather=['clear','cloud','rain','fog','snow'].includes(kind)?kind:'clear';speed=Math.max(0,Math.min(120,Number(kmh)||0));if(speed===0)travel=0;
 app.scene.fog=weather==='fog'?pc.FOG_LINEAR:pc.FOG_NONE;app.scene.fogStart=1;app.scene.fogEnd=18;app.scene.fogColor=new pc.Color(.63,.69,.73);paintMat.setParameter('sceneFog',weather==='fog'?.09:0);paintMat.setParameter('sceneFogColor',[.49,.57,.64]);drawGround();app.renderNextFrame=true;}
 app.on('update',dt=>{if(document.hidden)return;const now=performance.now();let changed=false;for(const slot of animated.values()){if(slot.value===slot.to)continue;const p=Math.min(1,(now-slot.start)/slot.duration),ease=p*p*(3-2*p);slot.value=p===1?slot.to:slot.from+(slot.to-slot.from)*ease;slot.apply(slot.value);changed=true;}
 if(speed>0&&(weather==='snow'||weather==='rain')&&now-lastGround>66){lastGround=now;travel=Math.min(24,travel+speed/3.6*Math.min(dt,.1));drawGround();changed=true;}if(changed)app.renderNextFrame=true;});
 window.CarScene={app,camera,car,size,ready:true,setAngle,home:home.onclick,setWindow,setRoof,setLights,setTheme,environment,
 rotate(delta){setAngle(target+delta);},
 control(id,value){if(id==='lights')setLights(value);if(id==='roof')setRoof(value?1:0);if(id==='trunk'){partStates.trunk=!!value;animate('trunk',value?1:0,t=>hinge?.setLocalEulerAngles(68*t,0,0),1200);}if(id==='windows')return;},
 get states(){return JSON.parse(JSON.stringify(partStates));}
 };
 window.dispatchEvent(new Event('car-ready'));

 app.start();resize();if(window.VehicleHost)window.VehicleHost.ready();status.textContent='原厂多层车漆 · 拖动查看，静止时停止连续绘制';
}
boot().catch(e=>{status.textContent='加载失败：'+e.message;if(window.VehicleHost)window.VehicleHost.failed(String(e.message));console.error(e);});


