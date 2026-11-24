import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const mat=(name,color,metalness=0,roughness=.65)=>new T.MeshStandardMaterial({name,color,metalness,roughness});
const M={wall:mat('Warm mineral plaster','#deded5'),outer:mat('Graphite facade','#565e61'),cap:mat('Honed limestone edges','#efeee6'),floor:mat('Warm grey epoxy','#b5b7af'),walk:mat('Sandstone corridor','#c9bc9f'),joint:mat('Floor joints','#91978e'),steel:mat('Brushed stainless steel','#aeb9ba',.75,.3),dark:mat('Powder coated graphite','#303e43',.35,.45),white:mat('Ivory enamel','#dce2dc',.2,.35),blue:mat('Pump enamel / petrol blue','#316d83',.4,.32),cold:mat('Chilled water / blue','#398b9a',.25,.4),hot:mat('Return water / terracotta','#a56347',.2,.4),black:mat('Rubber and coil fins','#182629',.1,.8),screen:mat('Control display','#4c9fa2',.3,.25),brass:mat('Valve brass','#ab9160',.6,.33),pad:mat('Concrete equipment pad','#999e95')};
M.glass=new T.MeshPhysicalMaterial({name:'Low iron partition glass',color:'#b8cfcd',transparent:true,opacity:.16,metalness:.1,roughness:.16,depthWrite:false});
const cache=new Map();
function mesh(g,geometry,material,pos=[0,0,0],rot=[0,0,0],scale=[1,1,1]){const o=new T.Mesh(geometry,material);o.position.set(...pos);o.rotation.set(...rot);o.scale.set(...scale);o.castShadow=material!==M.glass;o.receiveShadow=true;g.add(o);return o;}
function geo(k,fn){if(!cache.has(k))cache.set(k,fn());return cache.get(k);}
function box(g,s,p,m=M.white,r=[0,0,0],bevel=0){return mesh(g,bevel?geo('r'+s.join()+bevel,()=>new RoundedBoxGeometry(...s,2,bevel)):geo('box',()=>new T.BoxGeometry(1,1,1)),m,p,r,bevel?[1,1,1]:s);}
function cyl(g,r,h,p,m=M.steel,axis='y',r2=r){return mesh(g,geo(`c${r},${r2},${h}`,()=>new T.CylinderGeometry(r2,r,h,20)),m,p,axis==='x'?[0,0,Math.PI/2]:axis==='z'?[Math.PI/2,0,0]:[0,0,0]);}
function ring(g,r,t,p,m=M.steel,rot=[Math.PI/2,0,0]){return mesh(g,geo(`t${r},${t}`,()=>new T.TorusGeometry(r,t,6,24)),m,p,rot);}
function pipe(g,a,b,r=.05,m=M.steel){const A=new T.Vector3(...a),B=new T.Vector3(...b),d=B.clone().sub(A);const o=cyl(g,r,d.length(),A.add(B).multiplyScalar(.5).toArray(),m);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return o;}
function valve(g,p){cyl(g,.09,.16,p,M.brass);ring(g,.17,.023,[p[0],p[1]+.13,p[2]],M.hot);box(g,[.3,.025,.025],[p[0],p[1]+.13,p[2]],M.hot);box(g,[.025,.025,.3],[p[0],p[1]+.13,p[2]],M.hot);}
function bolts(g,x,y,z,r=.25){for(let i=0;i<6;i++){const a=i*Math.PI/3;cyl(g,.026,.028,[x+Math.cos(a)*r,y+Math.sin(a)*r,z],M.steel,'z');}}
function fan(g,x,y,z,r){cyl(g,r,.045,[x,y,z],M.black);for(let i=0;i<7;i++){const a=i*Math.PI*2/7;box(g,[r*.7,.025,r*.22],[x+Math.cos(a)*r*.43,y+.035,z+Math.sin(a)*r*.43],M.steel,[0,-a+.6,0]);}cyl(g,r*.16,.08,[x,y+.06,z],M.dark);for(let i=1;i<5;i++)ring(g,r*i/4,.012,[x,y+.1,z],M.steel);for(let i=0;i<4;i++)box(g,[r*2,.018,.02],[x,y+.11,z],M.dark,[0,i*Math.PI/4,0]);}
export function optimize(root){root.updateMatrixWorld(true);const merged=new T.Group();merged.name=root.name;merged.userData={...root.userData};const buckets=new Map();root.traverse(o=>{if(!o.isMesh)return;let a=buckets.get(o.material);if(!a)buckets.set(o.material,a=[]);const g=(o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone()).applyMatrix4(o.matrixWorld);a.push(g);});for(const [m,gs]of buckets){const o=new T.Mesh(mergeVertices(mergeGeometries(gs)),m);o.name=m.name;o.castShadow=m!==M.glass;o.receiveShadow=true;merged.add(o);gs.forEach(g=>g.dispose());}return merged;}
export function equipment(kind){const g=new T.Group();g.name=kind;g.userData={kind,units:'metres',origin:'floor centre'};
 if(kind==='chiller'){
  box(g,[3.5,.12,1.85],[0,.06,0],M.dark);
  for(const x of [-1.4,1.4])for(const z of [-.67,.67])box(g,[.28,.18,.28],[x,.2,z],M.black);
  box(g,[3.25,1.35,1.6],[0,.98,0],M.white,[0,0,0],.06);
  for(const z of [-.812,.812]){box(g,[2.67,.86,.025],[.18,1.03,z],M.black);for(let i=0;i<33;i++)box(g,[.026,.82,.03],[-1.1+i*.08,1.03,z],M.steel);for(const x of [-1.28,1.6])box(g,[.055,1.2,.08],[x,1,z],M.white);}
  for(const x of [-.85,.65])fan(g,x,1.69,0,.61);
  box(g,[.36,.83,1.67],[-1.44,1.12,0],M.white,[0,0,0],.02);
  box(g,[.2,.22,.025],[-1.44,1.28,.852],M.dark);box(g,[.14,.13,.028],[-1.44,1.3,.87],M.screen);
  for(const x of [-.65,.55]){cyl(g,.23,.51,[x,.48,.95],M.dark);cyl(g,.24,.04,[x,.74,.95],M.steel);}
  for(const [z,m]of [[-.46,M.cold],[.46,M.hot]]){pipe(g,[1.65,.75,z],[1.98,.75,z],.075,m);pipe(g,[1.98,.75,z],[1.98,.33,z],.075,m);cyl(g,.12,.045,[1.82,.75,z],M.steel,'x');valve(g,[1.98,.86,z]);}
 }else if(kind==='pump'){
  box(g,[1.65,.12,.82],[0,.06,0],M.dark,[0,0,0],.025);
  for(const x of [-.52,.4])box(g,[.26,.2,.5],[x,.22,0],M.blue);
  cyl(g,.29,.8,[-.32,.52,0],M.blue,'x');cyl(g,.31,.09,[-.76,.52,0],M.dark,'x');
  for(let i=0;i<11;i++){const a=i*Math.PI*2/11;box(g,[.7,.035,.035],[-.33,.52+Math.cos(a)*.29,Math.sin(a)*.29],M.blue);}
  box(g,[.3,.18,.3],[-.36,.86,0],M.blue,[0,0,0],.025);cyl(g,.11,.25,[.21,.52,0],M.steel,'x');
  cyl(g,.34,.32,[.5,.51,0],M.blue,'z');cyl(g,.23,.12,[.5,.51,.24],M.steel,'z');bolts(g,.5,.51,.31,.18);
  pipe(g,[.5,.51,.3],[.5,.51,.65],.1,M.cold);pipe(g,[.5,.71,0],[.5,1.18,0],.1,M.cold);cyl(g,.16,.06,[.5,1.14,0],M.steel);valve(g,[.5,1.25,0]);
  pipe(g,[.68,.7,0],[.87,.92,0],.025);cyl(g,.09,.04,[.89,.96,.01],M.dark,'z');cyl(g,.074,.044,[.89,.96,.025],M.white,'z');box(g,[.015,.09,.008],[.89,.97,.053],M.hot,[0,0,-.6]);
 }else if(kind==='air'){
  for(const x of [-1.1,1.1])box(g,[.18,.2,1.05],[x,.1,0],M.dark);
  box(g,[2.8,1.5,1.2],[0,.95,0],M.white,[0,0,0],.04);
  for(const x of [-1.38,-.48,.48,1.38])box(g,[.035,1.43,.025],[x,.95,.613],M.steel);
  box(g,[.8,1.12,.027],[-.92,.97,.625],M.black);
  for(let i=0;i<12;i++)box(g,[.76,.035,.065],[-.92,.48+i*.087,.65],M.steel,[.35,0,0]);
  for(const x of [0,.92]){box(g,[.05,.23,.06],[x+.2,1.02,.65],M.dark);for(const y of [.43,1.52])box(g,[.075,.07,.05],[x-.3,y,.64],M.steel);}
  box(g,[.26,.23,.04],[.02,1.39,.64],M.dark);box(g,[.19,.12,.045],[.02,1.4,.66],M.screen);
  box(g,[.76,.4,.9],[1.73,1.12,0],M.steel);box(g,[.06,.48,.99],[1.53,1.12,0],M.dark);
  for(const [x,m]of [[-.15,M.cold],[.15,M.hot]]){pipe(g,[x,.5,-.6],[x,.5,-.88],.047,m);pipe(g,[x,.5,-.88],[x,1.3,-.88],.047,m);valve(g,[x,1.2,-.88]);}
 }else{
  box(g,[1,.12,.65],[0,.06,0],M.dark);box(g,[.95,1.7,.6],[0,.97,0],M.white,[0,0,0],.035);box(g,[.018,1.55,.02],[0,1,.31],M.steel);box(g,[.23,.22,.04],[-.22,1.47,.33],M.dark);box(g,[.16,.12,.045],[-.22,1.49,.35],M.screen);for(const x of [-.06,.06])box(g,[.025,.23,.045],[x,.99,.34],M.dark);for(let i=0;i<6;i++)box(g,[.3,.025,.02],[.23,.38+i*.06,.32],M.dark);
 }
 return optimize(g);
}
export const DEMO_ROOMS=[{name:'ห้องเครื่องทำน้ำเย็น',items:[{id:101,label:'CH-01',kind:'chiller',alert:'ok'},{id:102,label:'CH-02',kind:'chiller',alert:'warn'}]},{name:'ห้องปั๊มน้ำ',items:[{id:201,label:'P-01',kind:'pump',alert:'ok'},{id:202,label:'P-02',kind:'pump',alert:'bad'},{id:203,label:'P-03',kind:'pump',alert:'ok'}]},{name:'ห้องระบบอากาศ',items:[{id:301,label:'AHU-01',kind:'air',alert:'ok'}]},{name:'ห้องควบคุมไฟฟ้า',items:[{id:401,label:'MDB-01',kind:'other',alert:'ok'},{id:402,label:'DB-02',kind:'other',alert:'ok'}]},{name:'ห้องระบบอากาศสำรอง',items:[{id:501,label:'AHU-02',kind:'air',alert:'warn'}]},{name:'ห้องปั๊มสำรอง',items:[{id:601,label:'P-04',kind:'pump',alert:'ok'},{id:602,label:'P-05',kind:'pump',alert:'ok'}]}];
export function layout(rooms){const cols=Math.max(1,Math.ceil(rooms.length/2));const roomWidth=6;const depth=Math.max(4.5,...rooms.map(r=>Math.ceil(r.items.length/2)*2.5+.5));const width=cols*roomWidth, corridor=2;return {width,depth,corridor,totalDepth:depth*2+corridor,rooms:rooms.map((r,i)=>{const row=i<cols?0:1;const col=i%cols;const x=-width/2+roomWidth*(col+.5),z=(row?1:-1)*(corridor/2+depth/2);return {...r,x,z,row,width:roomWidth,depth,items:r.items.map((a,j)=>({...a,position:[x+(r.items.length===1?0:((j%2)-.5)*2.8),0,z+(Math.floor(j/2)-(Math.ceil(r.items.length/2)-1)/2)*2.5],scale:a.kind==='chiller'?.64:a.kind==='air'?.77:1,beaconHeight:a.kind==='pump'?1.65:a.kind==='chiller'?1.65:2.1}))};})};}
export function architecture(rooms=DEMO_ROOMS){const L=layout(rooms),g=new T.Group();g.name='Architecture';const {width:w,totalDepth:d,depth}=L;
 box(g,[w,.12,2],[0,-.06,0],M.walk);
 for(const r of L.rooms){box(g,[5.98,.12,depth-.02],[r.x,-.06,r.z],M.floor);for(let x=-2;x<=2;x++)box(g,[.012,.002,depth-.08],[r.x+x,.002,r.z],M.joint);for(let z=-depth/2+1;z<depth/2;z+=1)box(g,[5.94,.002,.012],[r.x,.002,r.z+z],M.joint);
  // The corridor facade is cut down. A real doorway remains open on the right.
  const zz=r.row?1.05:-1.05;box(g,[3.95,.45,.17],[r.x-.9,.225,zz],M.wall);box(g,[3.95,.06,.2],[r.x-.9,.48,zz],M.cap);
  for(const xx of [r.x-2.85,r.x-.9,r.x+1.05])box(g,[.045,1.5,.06],[xx,1.24,zz],M.dark);
  box(g,[3.95,.045,.06],[r.x-.9,1.99,zz],M.dark);box(g,[3.85,1.44,.02],[r.x-.9,1.24,zz],M.glass);
  box(g,[.6,.45,.17],[r.x+2.7,.225,zz],M.wall);box(g,[1.24,.018,.21],[r.x+1.97,.012,zz],M.steel);
 }
 // Full back wall, low front cutaway, thick perimeter and capped partition walls.
 const wall=(s,p,h)=>{box(g,[s[0],h,s[1]],[p[0],h/2,p[1]],M.wall);box(g,[s[0]+.035,.055,s[1]+.035],[p[0],h+.025,p[1]],M.cap);};
 wall([w+.2,.22],[0,-d/2],2.35);box(g,[w+.2,2.35,.035],[0,1.175,-d/2-.13],M.outer);
 wall([w+.2,.22],[0,d/2],.46);box(g,[w+.2,.46,.035],[0,.23,d/2+.13],M.outer);
 for(const x of [-w/2,w/2]){wall([.22,d],[x,0],1.05);box(g,[.035,1.05,d],[x+Math.sign(x)*.13,.525,0],M.outer);}
 const cols=Math.ceil(rooms.length/2);for(let i=1;i<cols;i++)for(const z of [-1,1])wall([.18,depth],[-w/2+i*6,z*(1+depth/2)],1.12);
 // Services run along the rear wall: supply, return, brackets and cable tray.
 for(const [y,m]of [[1.76,M.cold],[2.03,M.hot]]){pipe(g,[-w/2+.3,y,-d/2+.25],[w/2-.3,y,-d/2+.25],.055,m);for(let x=-w/2+1;x<w/2;x+=2){box(g,[.07,.15,.28],[x,y,-d/2+.13],M.steel);}}
 for(let x=-w/2+.75;x<w/2;x+=1.5){box(g,[.45,.025,.4],[x,.012,0],M.cap);}
 return optimize(g);
}


