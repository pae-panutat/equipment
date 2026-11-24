'use client';
import { Suspense, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { architecture, layout } from './model-factory';

export type Kind = 'chiller' | 'pump' | 'air' | 'other';
export type Alert = 'ok' | 'warn' | 'bad';
export type Item = { id:number; label:string; kind:Kind; alert:Alert; name?:string };
export type Room = {name:string; items:Item[]};
/** Camera distance for the biggest floor: grows with the number of rooms in a row (the layout is two rows of 6-metre rooms). */
export const planSize = (roomCount: number) => Math.max(18, Math.ceil(Math.max(1, roomCount) / 2) * 6);
export type Props = {rooms:Room[]; extent:number; selected:number|null; onPick:(id:number|null)=>void; modelUrls?:Record<Kind,string>};
const states={ok:{color:'#29a787',label:'ปกติ',symbol:'✓'},warn:{color:'#e7a439',label:'เลยกำหนดบำรุงรักษา',symbol:'!'},bad:{color:'#d65d50',label:'ชำรุด / กำลังซ่อม',symbol:'×'}};
const defaultUrls={chiller:'/models/chiller.glb',pump:'/models/pump.glb',air:'/models/air.glb',other:'/models/other.glb'};

function Studio(){
 const {gl,scene}=useThree();
 useEffect(()=>{const p=new THREE.PMREMGenerator(gl);const room=new RoomEnvironment();const env=p.fromScene(room,.04);scene.environment=env.texture;scene.environmentIntensity=.3;return()=>{scene.environment=null;env.dispose();room.dispose();p.dispose();};},[gl,scene]);
 return <><hemisphereLight args={['#f4f5ee','#6b746d',1.1]}/><directionalLight position={[-9,20,8]} intensity={2.3} color="#fff4df" castShadow shadow-mapSize={[2048,2048]} shadow-camera-left={-19} shadow-camera-right={19} shadow-camera-top={19} shadow-camera-bottom={-19} shadow-camera-near={1} shadow-camera-far={65} shadow-bias={-.0002} shadow-normalBias={.035} shadow-radius={4}/><directionalLight position={[9,8,-12]} intensity={.6} color="#d7e8ee"/></>;
}
function Machine({item,url,onPick,selected}:{item:any;url:string;onPick:Props['onPick'];selected:boolean}){
 const {scene}=useGLTF(url);
 const model=useMemo(()=>{const c=scene.clone(true);c.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}});return c;},[scene]);
 const beacon=useRef<THREE.Mesh>(null);
 useFrame(({clock})=>{if(beacon.current){const s=item.alert==='ok'?1:1+.1*Math.sin(clock.elapsedTime*2.6);beacon.current.scale.setScalar(s);}});
 return <group position={item.position} onClick={e=>{e.stopPropagation();onPick(item.id);}}>
  <primitive object={model} scale={item.scale}/>
  <mesh rotation={[-Math.PI/2,0,0]} position={[0,.013,0]}><ringGeometry args={[selected?1.18:1.08,selected?1.22:1.095,64]}/><meshBasicMaterial color={selected?'#42867a':'#747f75'} transparent opacity={selected?.9:.22} depthWrite={false}/></mesh>
  <mesh ref={beacon} position={[0,item.beaconHeight,0]}><sphereGeometry args={[.092,16,12]}/><meshStandardMaterial color={states[item.alert as Alert].color} emissive={states[item.alert as Alert].color} emissiveIntensity={.35} roughness={.3}/></mesh>
 </group>;
}
function Projector({items,rooms,root}:{items:any[];rooms:any[];root:RefObject<HTMLDivElement|null>}){
 const p=useMemo(()=>new THREE.Vector3(),[]);const {camera,size}=useThree();
 useFrame(()=>{if(!root.current)return;for(const a of items){const e=root.current.querySelector<HTMLButtonElement>(`[data-asset="${a.id}"]`);if(!e)continue;p.set(a.position[0],a.beaconHeight+.2,a.position[2]).project(camera);e.style.transform=`translate(-50%,-100%) translate(${(p.x*.5+.5)*size.width}px,${(-p.y*.5+.5)*size.height}px)`;e.style.visibility=p.z<1&&p.z>-1?'visible':'hidden';}
 for(let i=0;i<rooms.length;i++){const r=rooms[i],e=root.current.querySelector<HTMLElement>(`[data-room="${i}"]`);if(!e)continue;p.set(r.x,.05,r.z+(r.row?-1:1)*(r.depth/2-.55)).project(camera);e.style.transform=`translate(-50%,-50%) translate(${(p.x*.5+.5)*size.width}px,${(-p.y*.5+.5)*size.height}px)`;e.style.visibility=p.z<1&&p.z>-1?'visible':'hidden';}});
 return null;
}
/** Frames the whole floor plan: pulls the camera back until every corner of the plan (and the labels above it) is inside the view, whatever the window shape. */
function FitCamera({rooms,onFit}:{rooms:Room[];onFit:(dist:number)=>void}){
 const {camera,size}=useThree();const L=useMemo(()=>layout(rooms),[rooms]);
 useEffect(()=>{
  if(!(camera instanceof THREE.PerspectiveCamera)||!size.width||!size.height)return;
  camera.aspect=size.width/size.height;camera.updateProjectionMatrix();
  const w=L.width+.5,d=L.totalDepth+.5,h=2.9,v=new THREE.Vector3(),dir=new THREE.Vector3(.67,.83,.92).normalize();
  const corners=[-1,1].flatMap(x=>[0,h].flatMap(y=>[-1,1].map(z=>new THREE.Vector3(x*w/2,y,z*d/2))));
  const fits=(dist:number)=>{camera.position.copy(dir).multiplyScalar(dist);camera.lookAt(0,h*.3,0);camera.updateMatrixWorld();return corners.every(c=>{v.copy(c).project(camera);return Math.abs(v.x)<=.97&&Math.abs(v.y)<=.965&&v.z<1;});};
  let lo=4,hi=400;for(let i=0;i<30&&hi-lo>.05;i++){const m=(lo+hi)/2;if(fits(m))hi=m;else lo=m;}
  fits(hi);onFit(hi);
  /* open closer than the full fit (drag/scroll to zoom out; the fit distance stays the zoom-out limit) */
  camera.position.copy(dir).multiplyScalar(hi*.68);camera.lookAt(0,h*.3,0);camera.updateMatrixWorld();

 },[camera,size.width,size.height,L,onFit]);
 return null;
}
function Plan({rooms,selected,onPick,modelUrls,root}:{rooms:Room[];selected:number|null;onPick:Props['onPick'];modelUrls:Record<Kind,string>;root:RefObject<HTMLDivElement|null>}){
 const L=useMemo(()=>layout(rooms),[rooms]);const shell=useMemo(()=>architecture(rooms),[rooms]);
 useEffect(()=>()=>{shell.traverse((o:THREE.Object3D)=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});},[shell]);
 const items=L.rooms.flatMap((r:any)=>r.items);
 return <><primitive object={shell} onClick={()=>onPick(null)}/>{items.map((item:any)=><Suspense key={item.id} fallback={null}><Machine item={item} url={modelUrls[item.kind as Kind]} selected={selected===item.id} onPick={onPick}/></Suspense>)}<Projector items={items} rooms={L.rooms} root={root}/></>;
}
export function Building3D({rooms,extent,selected,onPick,modelUrls=defaultUrls}:Props){
 const root=useRef<HTMLDivElement>(null);const items=rooms.flatMap(r=>r.items);const [fit,setFit]=useState(30);
 return <div ref={root} className="building-stage" style={{position:'relative',width:'100%',height:'100%',minHeight:240}}>
  <Canvas shadows dpr={[1,1.75]} gl={{alpha:true,antialias:true,toneMapping:THREE.ACESFilmicToneMapping,toneMappingExposure:.96}} camera={{fov:29,near:.1,far:220,position:[24,29,33]}} onPointerMissed={()=>onPick(null)} fallback={<p>อุปกรณ์นี้ไม่รองรับ WebGL</p>}>
   <Studio/><FitCamera rooms={rooms} onFit={setFit}/><Plan rooms={rooms} selected={selected} onPick={onPick} modelUrls={modelUrls} root={root}/>
   <OrbitControls makeDefault target={[0,.9,0]} autoRotate={false} enablePan screenSpacePanning mouseButtons={{LEFT:THREE.MOUSE.PAN,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.ROTATE}} touches={{ONE:THREE.TOUCH.PAN,TWO:THREE.TOUCH.DOLLY_ROTATE}} minDistance={fit*.3} maxDistance={fit*1.3} minPolarAngle={.18} maxPolarAngle={Math.PI/2.7} enableDamping dampingFactor={.08}/>
  </Canvas>
  <div style={{position:'absolute',inset:0,pointerEvents:'none',overflow:'hidden'}}>{items.map(a=><button key={a.id} data-asset={a.id} className={`asset-label ${selected===a.id?'is-selected':''}`} style={{position:'absolute',left:0,top:0,pointerEvents:'auto','--status':states[a.alert].color} as React.CSSProperties} aria-label={`${a.label}${a.name ? " " + a.name : ""} — ${states[a.alert].label}`} aria-pressed={selected===a.id} title={`${a.label}${a.name ? " · " + a.name : ""} · ${states[a.alert].label}`} onClick={()=>onPick(a.id)}><span>{states[a.alert].symbol}</span>{a.label}</button>)}{rooms.map((r,i)=><span key={r.name+i} data-room={i} className="room-label" style={{position:'absolute',left:0,top:0}}>{r.name}</span>)}</div>
 </div>;
}

export default Building3D;
