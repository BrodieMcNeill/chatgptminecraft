import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87c9ff);
scene.fog = new THREE.Fog(0x87c9ff, 34, 115);

const camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, .05, 220);
camera.rotation.order = "YXZ";

const renderer = new THREE.WebGLRenderer({antialias:false, powerPreference:"high-performance"});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.prepend(renderer.domElement);

const hemi = new THREE.HemisphereLight(0xbde7ff,0x657044,1.8);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2cf,2.2);
sun.position.set(-45,75,30);
sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.left=-55; sun.shadow.camera.right=55;
sun.shadow.camera.top=55; sun.shadow.camera.bottom=-55;
sun.shadow.camera.near=1; sun.shadow.camera.far=180;
scene.add(sun);

const BLOCKS = {
  grass:{id:1,name:"Grass",solid:true,top:0x68b84d,side:0x58a442,bottom:0x8b5a32,hardness:0.38,drop:"dirt"},
  dirt:{id:2,name:"Dirt",solid:true,color:0x8b5a32,hardness:0.32,drop:"dirt"},
  stone:{id:3,name:"Stone",solid:true,color:0x858a89,hardness:1.15,drop:"stone"},
  log:{id:4,name:"Log",solid:true,color:0x76502f,hardness:0.7,drop:"log"},
  leaves:{id:5,name:"Leaves",solid:true,color:0x3d963d,hardness:0.12,drop:"leaves"},
  water:{id:6,name:"Water",solid:false,color:0x3d8fd3,hardness:99,drop:null}
};
const TYPES = Object.keys(BLOCKS);
const world = new Map();
const meshes = new Map();
const SIZE=72, HALF=SIZE/2, MINY=-8, MAXY=28;
const WATER_LEVEL=4;

function key(x,y,z){return `${x},${y},${z}`}
function get(x,y,z){return world.get(key(x,y,z))}
function setBlock(x,y,z,type){
  if(y<MINY||y>MAXY)return;
  const k=key(x,y,z);
  if(type) world.set(k,type); else world.delete(k);
}
function hash2(x,z){
  let n=(x*374761393+z*668265263)|0;
  n=(n^(n>>>13))*1274126177|0;
  return ((n^(n>>>16))>>>0)/4294967295;
}
function smoothNoise(x,z){
  const x0=Math.floor(x),z0=Math.floor(z),fx=x-x0,fz=z-z0;
  const sx=fx*fx*(3-2*fx), sz=fz*fz*(3-2*fz);
  const a=hash2(x0,z0),b=hash2(x0+1,z0),c=hash2(x0,z0+1),d=hash2(x0+1,z0+1);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a,b,sx),THREE.MathUtils.lerp(c,d,sx),sz);
}
function fbm(x,z){
  let v=0,a=.5,f=.045,n=0;
  for(let i=0;i<5;i++){v+=smoothNoise(x*f,z*f)*a;n+=a;a*=.5;f*=2}
  return v/n;
}
function heightAt(x,z){
  const broad=fbm(x+100,z-50);
  const detail=fbm(x-200,z+140);
  const ridged=Math.abs(fbm(x+500,z+500)-.5)*2;
  return Math.floor(4 + broad*9 + detail*3 - ridged*1.7);
}

function generateWorld(){
  for(let x=-HALF;x<HALF;x++) for(let z=-HALF;z<HALF;z++){
    const h=Math.min(MAXY-4,heightAt(x,z));
    for(let y=MINY;y<=h;y++){
      const depth=h-y;
      setBlock(x,y,z, depth===0 ? "grass" : depth<4 ? "dirt" : "stone");
    }
    if(h<WATER_LEVEL){
      for(let y=h+1;y<=WATER_LEVEL;y++) setBlock(x,y,z,"water");
    }
  }
  // Natural-looking tree distribution with local spacing and flatter-ground preference.
  for(let x=-HALF+3;x<HALF-3;x++) for(let z=-HALF+3;z<HALF-3;z++){
    const h=heightAt(x,z);
    if(h<6 || h>17) continue;
    if(hash2(x*7+31,z*11-19)<0.009){
      let near=false;
      for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++)if(get(x+dx,h,z+dz)==="log")near=true;
      if(near)continue;
      const trunk=3+(hash2(x+77,z-91)>.65?1:0);
      for(let y=1;y<=trunk;y++)setBlock(x,h+y,z,"log");
      const top=h+trunk;
      for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let dy=-1;dy<=1;dy++){
        if(Math.abs(dx)+Math.abs(dz)+Math.abs(dy)<=3 && !(dx===0&&dz===0&&dy<0))
          if(!get(x+dx,top+dy,z+dz)) setBlock(x+dx,top+dy,z+dz,"leaves");
      }
    }
  }
}

const mats={};
function matFor(type,face){
  const b=BLOCKS[type];
  let color=b.color ?? (face==="top"?b.top:face==="bottom"?b.bottom:b.side);
  const keym=`${type}-${face}`;
  if(!mats[keym]){
    mats[keym]=new THREE.MeshLambertMaterial({
      color, transparent:type==="leaves"||type==="water", opacity:type==="water"?.62: type==="leaves"?.9:1,
      depthWrite:type!=="water"
    });
  }
  return mats[keym];
}
const cubeGeo=new THREE.BoxGeometry(1,1,1);
const dirs=[[1,0,0,"side"],[-1,0,0,"side"],[0,1,0,"top"],[0,-1,0,"bottom"],[0,0,1,"side"],[0,0,-1,"side"]];

function rebuildVisible(){
  for(const m of meshes.values())scene.remove(m);
  meshes.clear();
  // Individual visible cubes keep the implementation simple and make edits instant.
  // Frustum culling + a modest render radius keeps the prototype playable.
  const groups={};
  for(const [k,type] of world){
    const [x,y,z]=k.split(",").map(Number);
    let visible=false;
    for(const [dx,dy,dz] of dirs){
      if(!get(x+dx,y+dy,z+dz) || get(x+dx,y+dy,z+dz)==="water"){visible=true;break}
    }
    if(!visible)continue;
    (groups[type]??=[]).push([x,y,z]);
  }
  for(const [type,arr] of Object.entries(groups)){
    const g=new THREE.Group();
    g.userData.type=type;
    for(const [x,y,z] of arr){
      const m=new THREE.Mesh(cubeGeo,[
        matFor(type,"side"),matFor(type,"side"),matFor(type,"top"),
        matFor(type,"bottom"),matFor(type,"side"),matFor(type,"side")
      ]);
      m.position.set(x+.5,y+.5,z+.5);
      m.castShadow=type!=="water"; m.receiveShadow=true;
      m.userData.block={x,y,z,type};
      g.add(m);
    }
    scene.add(g); meshes.set(type,g);
  }
}
generateWorld();
rebuildVisible();

// Player: capsule-ish AABB controller with eye height.
const player={x:.5,y:heightAt(0,0)+1.01,z:.5,vx:0,vy:0,vz:0,onGround:false};
camera.position.set(player.x,player.y+1.62,player.z);
let yaw=0,pitch=0;
const keys={};
let pointerLocked=false;
addEventListener("keydown",e=>{keys[e.code]=true;if(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code))e.preventDefault();});
addEventListener("keyup",e=>keys[e.code]=false);
document.addEventListener("pointerlockchange",()=>{pointerLocked=document.pointerLockElement===renderer.domElement;document.getElementById("overlay").style.display=pointerLocked?"none":"grid"});
renderer.domElement.addEventListener("mousemove",e=>{
  if(!pointerLocked)return;
  yaw-=e.movementX*.0022; pitch-=e.movementY*.0022;
  pitch=Math.max(-Math.PI/2+.01,Math.min(Math.PI/2-.01,pitch));
});
document.getElementById("start").onclick=()=>renderer.domElement.requestPointerLock();

function collides(px,py,pz){
  const r=.29, bottom=py, top=py+1.72;
  const minX=Math.floor(px-r),maxX=Math.floor(px+r);
  const minY=Math.floor(bottom),maxY=Math.floor(top-.001);
  const minZ=Math.floor(pz-r),maxZ=Math.floor(pz+r);
  for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++)for(let z=minZ;z<=maxZ;z++){
    const t=get(x,y,z); if(t && BLOCKS[t].solid) return true;
  }
  return false;
}
function moveAxis(axis,amount){
  if(!amount)return;
  const steps=Math.max(1,Math.ceil(Math.abs(amount)/.12)), step=amount/steps;
  for(let i=0;i<steps;i++){
    const nx=axis==="x"?player.x+step:player.x;
    const ny=axis==="y"?player.y+step:player.y;
    const nz=axis==="z"?player.z+step:player.z;
    if(!collides(nx,ny,nz)){player.x=nx;player.y=ny;player.z=nz}
    else{
      if(axis==="y"){
        if(step<0)player.onGround=true;
        player.vy=0;
      } else if(axis==="x") player.vx=0;
      else player.vz=0;
      break;
    }
  }
}
function updatePlayer(dt){
  const forward=(keys.KeyW?1:0)-(keys.KeyS?1:0), strafe=(keys.KeyD?1:0)-(keys.KeyA?1:0);
  const len=Math.hypot(forward,strafe)||1;
  const sprint=keys.ShiftLeft||keys.ShiftRight;
  const speed=sprint?7.2:4.8;
  const tx=((Math.sin(yaw)*forward)+(Math.cos(yaw)*strafe))/len*speed;
  const tz=((Math.cos(yaw)*forward)-(Math.sin(yaw)*strafe))/len*speed;
  const accel=player.onGround?18:8;
  player.vx+=THREE.MathUtils.clamp(tx-player.vx,-accel*dt,accel*dt);
  player.vz+=THREE.MathUtils.clamp(tz-player.vz,-accel*dt,accel*dt);
  if(!forward&&!strafe && player.onGround){player.vx*=Math.pow(.001,dt);player.vz*=Math.pow(.001,dt)}
  if(keys.Space&&player.onGround){player.vy=7.5;player.onGround=false}
  player.vy-=20*dt;
  player.onGround=false;
  moveAxis("x",player.vx*dt); moveAxis("z",player.vz*dt); moveAxis("y",player.vy*dt);
  if(player.y<-20){player.x=.5;player.z=.5;player.y=heightAt(0,0)+2;player.vy=0}
  camera.position.set(player.x,player.y+1.62,player.z);
  camera.rotation.set(pitch,yaw,0);
}

// Raycast interaction.
const raycaster=new THREE.Raycaster();
raycaster.far=7;
let target=null;
function getTarget(){
  raycaster.setFromCamera({x:0,y:0},camera);
  const hits=raycaster.intersectObjects([...meshes.values()],true);
  return hits[0]||null;
}
const inv={dirt:0,stone:0,log:0,grass:0,leaves:0};
const hotbar=["dirt","stone","log","leaves","grass",null,null,null,null];
let selected=0;
for(let i=1;i<=9;i++)addEventListener("keydown",e=>{if(e.code==="Digit"+i){selected=i-1;updateHotbar()}});

function updateHotbar(){
  const bar=document.getElementById("hotbar");bar.innerHTML="";
  hotbar.forEach((type,i)=>{
    const s=document.createElement("div");s.className="slot"+(i===selected?" selected":"");
    s.innerHTML=`<span class="key">${i+1}</span>`;
    if(type){
      const d=document.createElement("div");d.className="swatch";
      d.style.background=`#${(BLOCKS[type].color??BLOCKS[type].top).toString(16).padStart(6,"0")}`;
      s.appendChild(d);
      s.insertAdjacentHTML("beforeend",`<span class="count">${inv[type]||0}</span>`);
    }
    bar.appendChild(s);
  });
}
updateHotbar();

let mining={key:null,start:0,duration:0};
const mineBar=document.getElementById("mineBar"),mineFill=document.getElementById("mineFill");
function beginOrContinueMining(){
  const hit=getTarget();
  if(!hit){mining.key=null;mineBar.classList.add("hidden");return}
  const b=hit.object.userData.block;if(!b)return;
  const k=key(b.x,b.y,b.z);
  if(mining.key!==k){mining={key:k,start:performance.now(),duration:BLOCKS[b.type].hardness*650};}
  const p=Math.min(1,(performance.now()-mining.start)/mining.duration);
  mineBar.classList.remove("hidden");mineFill.style.width=(p*100)+"%";
  if(p>=1){
    const drop=BLOCKS[b.type].drop;
    setBlock(b.x,b.y,b.z,null);
    if(drop)inv[drop]=(inv[drop]||0)+1;
    rebuildVisible();updateHotbar();
    mining={key:null,start:0,duration:0};mineBar.classList.add("hidden");
  }
}
function place(){
  const hit=getTarget(); if(!hit)return;
  const type=hotbar[selected]; if(!type||!(inv[type]>0))return;
  const b=hit.object.userData.block;
  const n=hit.face.normal;
  const x=b.x+Math.round(n.x),y=b.y+Math.round(n.y),z=b.z+Math.round(n.z);
  if(y<MINY||y>MAXY||get(x,y,z))return;
  // Don't let the player place a block inside themselves.
  if(collides(x+.5,y,z+.5))return;
  setBlock(x,y,z,type);inv[type]--;rebuildVisible();updateHotbar();
}
let lmb=false;
renderer.domElement.addEventListener("mousedown",e=>{
  if(!pointerLocked){renderer.domElement.requestPointerLock();return}
  if(e.button===0)lmb=true;
  if(e.button===2){e.preventDefault();place()}
});
addEventListener("mouseup",e=>{if(e.button===0)lmb=false});
renderer.domElement.addEventListener("contextmenu",e=>e.preventDefault());

const clock=new THREE.Clock();
let fps=0,frames=0,lastInfo=0;
function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),.05);
  if(pointerLocked){
    updatePlayer(dt);
    if(lmb)beginOrContinueMining(); else {mining.key=null;mineBar.classList.add("hidden")}
    const t=getTarget();
    document.getElementById("status").textContent=t?`${BLOCKS[t.object.userData.block.type].name} · ${Math.round(t.distance*10)/10}m`:"";
  }
  renderer.render(scene,camera);
}
animate();
addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});

// Prevent selecting text while playing.
document.addEventListener("selectstart",e=>e.preventDefault());
