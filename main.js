import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";

/* ---------- Scene / renderer ---------- */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87c9ff);
scene.fog = new THREE.Fog(0x87c9ff, 44, 118);

const camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, .05, 220);
camera.rotation.order = "YXZ";

const renderer = new THREE.WebGLRenderer({antialias:false,powerPreference:"high-performance"});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.35));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.05;
document.body.prepend(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xc9eaff,0x63734e,1.9));
const sun=new THREE.DirectionalLight(0xfff1cf,2.15);
sun.position.set(-45,80,28);
sun.castShadow=true;
sun.shadow.mapSize.set(1024,1024);
sun.shadow.camera.left=-65;sun.shadow.camera.right=65;sun.shadow.camera.top=65;sun.shadow.camera.bottom=-65;
sun.shadow.camera.near=1;sun.shadow.camera.far=180;
scene.add(sun);

/* ---------- Texture atlas: every source tile is 64x64 ---------- */
const atlasTex=new THREE.TextureLoader().load("./textures/atlas.png");
atlasTex.colorSpace=THREE.SRGBColorSpace;
atlasTex.magFilter=THREE.NearestFilter;
atlasTex.minFilter=THREE.NearestFilter;
atlasTex.generateMipmaps=false;
const atlasMat=new THREE.MeshLambertMaterial({map:atlasTex});
const waterMat=new THREE.MeshLambertMaterial({map:atlasTex,transparent:true,opacity:.62,depthWrite:false});

const TILE=64/256;
const tile={grass_side:[1,0],grass_top:[0,0],dirt:[2,0],stone:[3,0],log_side:[0,1],log_top:[1,1],leaves:[2,1],planks:[3,1],water:[0,2]};

const BLOCKS={
  grass:{solid:true,hardness:.52,drop:"dirt",side:"grass_side",top:"grass_top",bottom:"dirt"},
  dirt:{solid:true,hardness:.42,drop:"dirt",all:"dirt"},
  stone:{solid:true,hardness:1.25,drop:"stone",all:"stone"},
  log:{solid:true,hardness:.78,drop:"log",side:"log_side",top:"log_top",bottom:"log_top"},
  leaves:{solid:true,hardness:.14,drop:"leaves",all:"leaves"},
  planks:{solid:true,hardness:.58,drop:"planks",all:"planks"},
  water:{solid:false,hardness:99,drop:null,all:"water"}
};

const CHUNK=16;
const WORLD=112;
const HALF=WORLD/2;
const MINY=-8,MAXY=28,WATER_LEVEL=4;
const chunks=new Map();
const edits=new Map();

const key=(x,y,z)=>`${x},${y},${z}`;
const chunkKey=(cx,cz)=>`${cx},${cz}`;
function baseHash(x,z){let n=(Math.imul(x,374761393)+Math.imul(z,668265263))|0;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295}
function smoothNoise(x,z){
  const x0=Math.floor(x),z0=Math.floor(z),fx=x-x0,fz=z-z0;
  const sx=fx*fx*(3-2*fx),sz=fz*fz*(3-2*fz);
  const a=baseHash(x0,z0),b=baseHash(x0+1,z0),c=baseHash(x0,z0+1),d=baseHash(x0+1,z0+1);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a,b,sx),THREE.MathUtils.lerp(c,d,sx),sz);
}
function fbm(x,z){
  let v=0,a=.5,f=.045,n=0;
  for(let i=0;i<5;i++){v+=smoothNoise(x*f,z*f)*a;n+=a;a*=.5;f*=2}
  return v/n
}
function terrainHeight(x,z){
  const broad=fbm(x+90,z-40);
  const detail=fbm(x-160,z+120);
  const ridged=Math.abs(fbm(x+480,z+480)-.5)*2;
  return Math.floor(4+broad*9+detail*3-ridged*1.5);
}
function generated(x,y,z){
  const h=Math.min(MAXY-4,terrainHeight(x,z));
  if(y<=h)return y===h?"grass":y>=h-3?"dirt":"stone";
  if(y<=WATER_LEVEL)return "water";
  return null;
}
const trees=new Map();
function treeAt(x,z){
  const k=`${x},${z}`;
  if(trees.has(k))return trees.get(k);
  const h=terrainHeight(x,z);
  let result=null;
  if(h>=7&&h<=17&&baseHash(x*7+31,z*11-19)<.012){
    let clear=true;
    for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++)if(dx||dz){
      if(baseHash((x+dx)*7+31,(z+dz)*11-19)<.008)clear=false;
    }
    if(clear)result={h,trunk:3+(baseHash(x+77,z-91)>.65?1:0)};
  }
  trees.set(k,result);
  return result;
}
function treeBlock(x,y,z){
  // Query only the small cached set of candidate tree centres.
  for(let tx=x-2;tx<=x+2;tx++)for(let tz=z-2;tz<=z+2;tz++){
    const info=treeAt(tx,tz); if(!info)continue;
    const top=info.h+info.trunk;
    if(tx===x&&tz===z&&y>info.h&&y<=top)return "log";
    for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let dy=-1;dy<=1;dy++){
      if(Math.abs(dx)+Math.abs(dz)+Math.abs(dy)<=3 && !(dx===0&&dz===0&&dy<0)){
        if(tx+dx===x&&tz+dz===z&&top+dy===y)return "leaves";
      }
    }
  }
  return null;
}
function get(x,y,z){
  if(x<-HALF||x>=HALF||z<-HALF||z>=HALF||y<MINY||y>MAXY)return null;
  const k=key(x,y,z);
  if(edits.has(k))return edits.get(k);
  return treeBlock(x,y,z)||generated(x,y,z);
}
let rebuildQueued=false;\nconst rebuildQueue=new Set();\nfunction queueChunk(cx,cz){ if(cx<0||cz<0||cx>=WORLD/CHUNK||cz>=WORLD/CHUNK)return; rebuildQueue.add(chunkKey(cx,cz)); }\nfunction flushChunkQueue(){ if(rebuildQueued||!rebuildQueue.size)return; rebuildQueued=true; requestAnimationFrame(()=>{ const q=[...rebuildQueue]; rebuildQueue.clear(); rebuildQueued=false; for(const k of q){const [cx,cz]=k.split(",").map(Number);rebuildChunk(cx,cz)} }); }\nfunction setLocal(x,y,z,type,broadcast=true){
  const k=key(x,y,z);
  edits.set(k,type||null);
  queueChunk(Math.floor((x+HALF)/CHUNK),Math.floor((z+HALF)/CHUNK));
  if((x+HALF)%CHUNK===0)queueChunk(Math.floor((x+HALF)/CHUNK)-1,Math.floor((z+HALF)/CHUNK));
  if((z+HALF)%CHUNK===0)queueChunk(Math.floor((x+HALF)/CHUNK),Math.floor((z+HALF)/CHUNK)-1);
  flushChunkQueue();
  if(broadcast)netSendBlock({x,y,z,type:type||null});
}

function chunkFor(cx,cz){
  const k=chunkKey(cx,cz);
  if(!chunks.has(k))chunks.set(k,{opaque:null,water:null});
  return chunks.get(k);
}
const faceDefs=[
  {n:[1,0,0],v:[[1,0,0],[1,1,0],[1,1,1],[1,0,1]],uv:[[0,0],[0,1],[1,1],[1,0]]},
  {n:[-1,0,0],v:[[0,0,1],[0,1,1],[0,1,0],[0,0,0]],uv:[[0,0],[0,1],[1,1],[1,0]]},
  {n:[0,1,0],v:[[0,1,0],[0,1,1],[1,1,1],[1,1,0]],uv:[[0,0],[0,1],[1,1],[1,0]]},
  {n:[0,-1,0],v:[[0,0,1],[0,0,0],[1,0,0],[1,0,1]],uv:[[0,0],[0,1],[1,1],[1,0]]},
  {n:[0,0,1],v:[[1,0,1],[1,1,1],[0,1,1],[0,0,1]],uv:[[0,0],[0,1],[1,1],[1,0]]},
  {n:[0,0,-1],v:[[0,0,0],[0,1,0],[1,1,0],[1,0,0]],uv:[[0,0],[0,1],[1,1],[1,0]]}
];
function faceTile(type,faceIndex){
  const b=BLOCKS[type];
  if(faceIndex===2)return tile[b.top||b.all];
  if(faceIndex===3)return tile[b.bottom||b.all];
  return tile[b.side||b.all];
}
function buildGeometry(cx,cz,waterOnly){
  const positions=[],normals=[],uvs=[],indices=[],faceBlocks=[];
  const x0=cx*CHUNK-HALF,z0=cz*CHUNK-HALF;
  let vi=0;
  for(let x=x0;x<x0+CHUNK;x++)for(let z=z0;z<z0+CHUNK;z++)for(let y=MINY;y<=MAXY;y++){
    const type=get(x,y,z); if(!type || (type==="water")!==waterOnly)continue;
    for(let fi=0;fi<6;fi++){
      const f=faceDefs[fi],nx=f.n[0],ny=f.n[1],nz=f.n[2],nt=get(x+nx,y+ny,z+nz);
      const neighborWater=nt==="water";
      const exposed=waterOnly ? (!nt||!BLOCKS[nt].solid) : (!nt||neighborWater||!BLOCKS[nt]?.solid);
      if(!exposed)continue;
      const tt=faceTile(type,fi); const tx=tt[0]*TILE,ty=1-(tt[1]+1)*TILE;
      for(let i=0;i<4;i++){
        const q=f.v[i];positions.push(x+q[0],y+q[1],z+q[2]);
        normals.push(nx,ny,nz);
        const qv=f.uv[i];uvs.push(tx+qv[0]*TILE,ty+qv[1]*TILE);
      }
      indices.push(vi,vi+1,vi+2,vi,vi+2,vi+3);
      faceBlocks.push({x,y,z,type});
      vi+=4;
    }
  }
  if(!positions.length)return null;
  const geo=new THREE.BufferGeometry();
  geo.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute("normal",new THREE.Float32BufferAttribute(normals,3));
  geo.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  geo.userData.faceBlocks=faceBlocks;
  return geo;
}
function disposeMesh(m){if(m){m.geometry.dispose();scene.remove(m)}}
function rebuildChunk(cx,cz){
  if(cx<0||cz<0||cx>=WORLD/CHUNK||cz>=WORLD/CHUNK)return;
  const c=chunkFor(cx,cz);
  disposeMesh(c.opaque);disposeMesh(c.water);c.opaque=c.water=null;
  const og=buildGeometry(cx,cz,false),wg=buildGeometry(cx,cz,true);
  if(og){c.opaque=new THREE.Mesh(og,atlasMat);c.opaque.receiveShadow=true;c.opaque.frustumCulled=true;scene.add(c.opaque)}
  if(wg){c.water=new THREE.Mesh(wg,waterMat);c.water.renderOrder=2;c.water.frustumCulled=true;scene.add(c.water)}
}
for(let cx=0;cx<WORLD/CHUNK;cx++)for(let cz=0;cz<WORLD/CHUNK;cz++)rebuildChunk(cx,cz);

/* ---------- Player physics ---------- */
const player={x:.5,y:terrainHeight(0,0)+1.01,z:.5,vx:0,vy:0,vz:0,onGround:false};
let yaw=0,pitch=0;
const keys={};
addEventListener("keydown",e=>{
  keys[e.code]=true;
  if(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code))e.preventDefault();
  if(e.code==="KeyC" && pointerLocked)toggleCrafting();
});
addEventListener("keyup",e=>keys[e.code]=false);
let pointerLocked=false;
document.addEventListener("pointerlockchange",()=>{
  pointerLocked=document.pointerLockElement===renderer.domElement;
  if(!craftingOpen)document.getElementById("overlay").style.display=pointerLocked?"none":"grid";
});
renderer.domElement.addEventListener("mousemove",e=>{
  if(!pointerLocked||craftingOpen)return;
  yaw-=e.movementX*.00215;pitch-=e.movementY*.00215;
  pitch=Math.max(-Math.PI/2+.01,Math.min(Math.PI/2-.01,pitch));
});

function collides(px,py,pz){
  const r=.28,bottom=py,top=py+1.72;
  for(let x=Math.floor(px-r);x<=Math.floor(px+r);x++)
    for(let y=Math.floor(bottom);y<=Math.floor(top-.001);y++)
      for(let z=Math.floor(pz-r);z<=Math.floor(pz+r);z++){
        const t=get(x,y,z);if(t&&BLOCKS[t].solid)return true;
      }
  return false;
}
function moveAxis(axis,amount){
  if(!amount)return;
  const steps=Math.max(1,Math.ceil(Math.abs(amount)/.11)),step=amount/steps;
  for(let i=0;i<steps;i++){
    const nx=axis==="x"?player.x+step:player.x,ny=axis==="y"?player.y+step:player.y,nz=axis==="z"?player.z+step:player.z;
    if(!collides(nx,ny,nz)){player.x=nx;player.y=ny;player.z=nz}
    else{
      if(axis==="y"){if(step<0)player.onGround=true;player.vy=0}
      else if(axis==="x")player.vx=0;else player.vz=0;
      break;
    }
  }
}
function updatePlayer(dt){
  const f=(keys.KeyW?1:0)-(keys.KeyS?1:0),s=(keys.KeyD?1:0)-(keys.KeyA?1:0),len=Math.hypot(f,s)||1;
  const sprint=keys.ShiftLeft||keys.ShiftRight,speed=sprint?7.0:4.65;
  const tx=((Math.sin(yaw)*f)+(Math.cos(yaw)*s))/len*speed;
  const tz=((Math.cos(yaw)*f)-(Math.sin(yaw)*s))/len*speed;
  const accel=player.onGround?19:8;
  player.vx+=THREE.MathUtils.clamp(tx-player.vx,-accel*dt,accel*dt);
  player.vz+=THREE.MathUtils.clamp(tz-player.vz,-accel*dt,accel*dt);
  if(!f&&!s&&player.onGround){player.vx*=Math.pow(.0008,dt);player.vz*=Math.pow(.0008,dt)}
  if(keys.Space&&player.onGround){player.vy=7.35;player.onGround=false}
  player.vy-=19.6*dt;
  player.onGround=false;
  moveAxis("x",player.vx*dt);moveAxis("z",player.vz*dt);moveAxis("y",player.vy*dt);
  if(player.y<-20){player.x=.5;player.z=.5;player.y=terrainHeight(0,0)+3;player.vy=0}
  camera.position.set(player.x,player.y+1.62,player.z);
  camera.rotation.set(pitch,yaw,0);
}

/* ---------- Inventory + crafting ---------- */
const inv={dirt:0,stone:0,log:0,leaves:0,planks:0,sticks:0,wooden_pickaxe:0,stone_pickaxe:0};
let hotbar=["dirt","stone","log","leaves","planks","wooden_pickaxe","stone_pickaxe",null,null];
let selected=0;
const ITEM_LABEL={dirt:"Dirt",stone:"Stone",log:"Log",leaves:"Leaves",planks:"Planks",sticks:"Sticks",wooden_pickaxe:"Wood Pickaxe",stone_pickaxe:"Stone Pickaxe"};
const ITEM_TEX={dirt:"dirt.png",stone:"stone.png",log:"log_side.png",leaves:"leaves.png",planks:"planks.png",wooden_pickaxe:"planks.png",stone_pickaxe:"stone.png"};
for(let i=1;i<=9;i++)addEventListener("keydown",e=>{if(e.code==="Digit"+i){selected=i-1;renderHotbar()}});

function renderHotbar(){
  const bar=document.getElementById("hotbar");bar.innerHTML="";
  hotbar.forEach((type,i)=>{
    const s=document.createElement("div");s.className="slot"+(i===selected?" selected":"");
    s.innerHTML=`<span class="key">${i+1}</span>`;
    if(type){
      const d=document.createElement("div");d.className="swatch";
      d.style.backgroundImage=`url('./textures/${ITEM_TEX[type]||"dirt.png"}')`;
      s.appendChild(d);
      s.insertAdjacentHTML("beforeend",`<span class="count">${inv[type]||0}</span>`);
    }
    bar.appendChild(s);
  });
}
function firstEmptyHotbar(){return hotbar.findIndex(x=>!x)}
function give(item,n=1){
  inv[item]=(inv[item]||0)+n;
  if(!hotbar.includes(item)){const i=firstEmptyHotbar();if(i>=0)hotbar[i]=item}
  renderHotbar();renderRecipes();
}
const RECIPES=[
  {id:"planks",name:"Oak Planks",needs:{log:1},gives:{planks:4}},
  {id:"sticks",name:"Sticks",needs:{planks:2},gives:{sticks:4}},
  {id:"wooden_pickaxe",name:"Wood Pickaxe",needs:{planks:3,sticks:2},gives:{wooden_pickaxe:1}},
  {id:"stone_pickaxe",name:"Stone Pickaxe",needs:{stone:3,sticks:2},gives:{stone_pickaxe:1}}
];
function canCraft(r){return Object.entries(r.needs).every(([k,v])=>(inv[k]||0)>=v)}
function craft(r){
  if(!canCraft(r))return;
  for(const [k,v] of Object.entries(r.needs))inv[k]-=v;
  for(const [k,v] of Object.entries(r.gives))inv[k]=(inv[k]||0)+v;
  for(const [k] of Object.entries(r.gives))if(!hotbar.includes(k)){const i=firstEmptyHotbar();if(i>=0)hotbar[i]=k}
  renderHotbar();renderRecipes();
}
function renderRecipes(){
  const wrap=document.getElementById("recipes");wrap.innerHTML="";
  for(const r of RECIPES){
    const el=document.createElement("div");el.className="recipe";
    const needs=Object.entries(r.needs).map(([k,v])=>`${v} ${ITEM_LABEL[k]}`).join(" + ");
    const gives=Object.entries(r.gives).map(([k,v])=>`${v} ${ITEM_LABEL[k]}`).join(", ");
    el.innerHTML=`<strong>${r.name}</strong><div class="need">${needs} → ${gives}</div>`;
    const b=document.createElement("button");b.textContent="Craft";b.disabled=!canCraft(r);b.onclick=()=>craft(r);
    el.appendChild(b);wrap.appendChild(el);
  }
}
let craftingOpen=false;
function toggleCrafting(){
  craftingOpen=!craftingOpen;
  document.getElementById("crafting").classList.toggle("hidden",!craftingOpen);
  if(craftingOpen){renderRecipes();document.exitPointerLock()}
}
document.getElementById("closeCraft").onclick=()=>toggleCrafting();
renderHotbar();

/* ---------- Block breaking / placement ---------- */
const raycaster=new THREE.Raycaster();raycaster.far=7;
function targetHit(){
  raycaster.setFromCamera({x:0,y:0},camera);
  const objs=[];
  for(const c of chunks.values()){if(c.opaque)objs.push(c.opaque);if(c.water)objs.push(c.water)}
  const hits=raycaster.intersectObjects(objs,false);
  return hits[0]||null;
}
let mining={id:null,start:0,duration:0};
const mineBar=document.getElementById("mineBar"),mineFill=document.getElementById("mineFill");
function toolMineMultiplier(type){
  const item=hotbar[selected];
  if(item==="stone_pickaxe"&&type==="stone")return .25;
  if(item==="wooden_pickaxe"&&type==="stone")return .62;
  if(item==="stone_pickaxe"&&["dirt","grass","leaves"].includes(type))return .55;
  return 1;
}
function mine(){
  const hit=targetHit();
  if(!hit||hit.object.userData.faceBlocks==null){mining.id=null;mineBar.classList.add("hidden");return}
  const fb=hit.object.userData.faceBlocks[Math.floor((hit.faceIndex??0)/2)];
  if(!fb||fb.type==="water")return;
  const id=key(fb.x,fb.y,fb.z);
  if(mining.id!==id)mining={id,start:performance.now(),duration:BLOCKS[fb.type].hardness*700*toolMineMultiplier(fb.type)};
  const p=Math.min(1,(performance.now()-mining.start)/mining.duration);
  mineBar.classList.remove("hidden");mineFill.style.width=(p*100)+"%";
  if(p>=1){
    const drop=BLOCKS[fb.type].drop;
    setLocal(fb.x,fb.y,fb.z,null,true);
    if(drop)give(drop,1);
    mining={id:null,start:0,duration:0};mineBar.classList.add("hidden");
  }
}
function place(){
  const hit=targetHit();if(!hit)return;
  const type=hotbar[selected];if(!type||!BLOCKS[type]?.solid||(inv[type]||0)<=0)return;
  const fb=hit.object.userData.faceBlocks[Math.floor((hit.faceIndex??0)/2)];
  if(!fb)return;
  const n=hit.face.normal;
  const x=fb.x+Math.round(n.x),y=fb.y+Math.round(n.y),z=fb.z+Math.round(n.z);
  if(!get(x,y,z)&&!collides(x+.5,y,z+.5)){setLocal(x,y,z,type,true);inv[type]--;renderHotbar()}
}
let lmb=false;
renderer.domElement.addEventListener("mousedown",e=>{
  if(craftingOpen)return;
  if(!pointerLocked){renderer.domElement.requestPointerLock();return}
  if(e.button===0)lmb=true;
  if(e.button===2){e.preventDefault();place()}
});
addEventListener("mouseup",e=>{if(e.button===0)lmb=false});
renderer.domElement.addEventListener("contextmenu",e=>e.preventDefault());

/* ---------- Simple blocky mobs ---------- */
const mobs=[];
function box(mat,w,h,d){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.castShadow=true;m.receiveShadow=true;return m}
const cowMat=new THREE.MeshLambertMaterial({color:0x664632}),cowWhite=new THREE.MeshLambertMaterial({color:0xf0eee8});
const zombieMat=new THREE.MeshLambertMaterial({color:0x4d8f63}),zombieShirt=new THREE.MeshLambertMaterial({color:0x3d6ba3});

function spawnMob(kind,x,z){
  const group=new THREE.Group();
  const body=box(kind==="cow"?cowWhite:zombieShirt,.72,.8,.42);body.position.y=1.05;
  const head=box(kind==="cow"?cowWhite:zombieMat,.58,.58,.58);head.position.set(0,1.72,.02);
  group.add(body,head);
  if(kind==="cow"){
    for(const sx of [-.27,.27])for(const sz of [-.15,.15]){
      const leg=box(cowMat,.14,.58,.14);leg.position.set(sx,.48,sz);group.add(leg)
    }
  }else{
    const legMat=new THREE.MeshLambertMaterial({color:0x36574d});
    for(const sx of [-.18,.18]){const leg=box(legMat,.16,.65,.18);leg.position.set(sx,.4,0);group.add(leg)}
    const armMat=new THREE.MeshLambertMaterial({color:0x4d8f63});
    for(const sx of [-.47,.47]){const arm=box(armMat,.14,.66,.14);arm.position.set(sx,1.05,0);group.add(arm)}
  }
  group.position.set(x,terrainHeight(Math.floor(x),Math.floor(z))+0.02,z);
  scene.add(group);
  mobs.push({kind,group,x,z,vx:0,vz:0,t:Math.random()*5,attack:0});
}
let mobSeed=77;
for(let i=0;i<10;i++){
  const x=Math.round((baseHash(i*31,mobSeed)-.5)*70),z=Math.round((baseHash(i*53,mobSeed+3)-.5)*70);
  spawnMob("cow",x+.5,z+.5);
}
for(let i=0;i<4;i++){
  const x=Math.round((baseHash(i*71,mobSeed+9)-.5)*80),z=Math.round((baseHash(i*43,mobSeed+17)-.5)*80);
  spawnMob("zombie",x+.5,z+.5);
}
function updateMobs(dt){
  for(const m of mobs){
    m.t-=dt;m.attack=Math.max(0,m.attack-dt);
    const dx=player.x-m.x,dz=player.z-m.z,dist=Math.hypot(dx,dz);
    let tx=0,tz=0;
    if(m.kind==="zombie"&&dist<18){tx=dx/(dist||1);tz=dz/(dist||1)}
    else if(m.t<=0){m.t=2+Math.random()*3;const a=Math.random()*Math.PI*2;tx=Math.cos(a);tz=Math.sin(a)}
    const sp=m.kind==="zombie"?1.5:.75;
    m.vx+=(tx*sp-m.vx)*Math.min(1,dt*2.5);m.vz+=(tz*sp-m.vz)*Math.min(1,dt*2.5);
    const nx=m.x+m.vx*dt,nz=m.z+m.vz*dt;
    if(!collides(nx,m.group.position.y,nz)){m.x=nx;m.z=nz}
    else{m.vx*=-.4;m.vz*=-.4}
    const ground=terrainHeight(Math.floor(m.x),Math.floor(m.z))+0.02;
    m.group.position.set(m.x,ground,m.z);
    if(Math.abs(m.vx)+Math.abs(m.vz)>.15)m.group.rotation.y=Math.atan2(m.vx,m.vz);
  }
}

/* ---------- Multiplayer: peer-to-peer via PeerJS ---------- */
let peer=null,isHost=false,myId=null,connections=new Map(),remotePlayers=new Map();
const net={name:"Player"};
const urlParams=new URLSearchParams(location.search);
const roomField=document.getElementById("roomInput");
if(urlParams.get("join")){roomField.value=urlParams.get("join");document.getElementById("roomLabel").classList.remove("hidden")}

function msgAll(data,except=null){
  connections.forEach((c,id)=>{if(id!==except&&c.open)try{c.send(data)}catch{}})
}
function netSend(data){
  if(isHost){msgAll(data)}
  else {connections.forEach(c=>{if(c.open)try{c.send(data)}catch{}})}
}
function netSendBlock(edit){
  const msg={t:"block",...edit};
  if(isHost)msgAll(msg);else{
    const c=connections.get("host");if(c?.open)c.send(msg);
  }
}
function addRemote(id,data){
  if(id===myId)return;
  let r=remotePlayers.get(id);
  if(!r){
    const g=new THREE.Group();
    const bm=new THREE.MeshLambertMaterial({color:0xd99a4e});
    const pm=new THREE.MeshLambertMaterial({color:0x3b67a9});
    const body=box(pm,.62,1.0,.36);body.castShadow=true;body.position.y=.95;
    const head=box(bm,.48,.48,.48);head.position.y=1.68;head.castShadow=true;
    g.add(body,head);scene.add(g);
    r={group:g,label:null,x:data.x,z:data.z,y:data.y,rx:0,rz:0,target:{...data}};remotePlayers.set(id,r);
  }
  r.target=data;
}
function removeRemote(id){const r=remotePlayers.get(id);if(r){scene.remove(r.group);remotePlayers.delete(id)}}
function syncRemote(dt){
  remotePlayers.forEach(r=>{
    r.x+=(r.target.x-r.x)*Math.min(1,dt*12);r.y+=(r.target.y-r.y)*Math.min(1,dt*12);r.z+=(r.target.z-r.z)*Math.min(1,dt*12);
    r.group.position.set(r.x,r.y,r.z);r.group.rotation.y=r.target.yaw||0;
  });
}
function applySnapshot(data){
  for(const [k,v] of Object.entries(data.edits||{})){const [x,y,z]=k.split(",").map(Number);edits.set(k,v)}
  // Rebuild every edited chunk once.
  const changed=new Set();
  for(const k of Object.keys(data.edits||{})){const [x,,z]=k.split(",").map(Number);changed.add(chunkKey(Math.floor((x+HALF)/CHUNK),Math.floor((z+HALF)/CHUNK)))}
  changed.forEach(k=>{const [cx,cz]=k.split(",").map(Number);rebuildChunk(cx,cz)});
  for(const p of data.players||[])addRemote(p.id,p);
}
function setupConn(c,peerId){
  connections.set(peerId,c);
  c.on("open",()=>{
    if(isHost){
      c.send({t:"welcome",id:myId,host:true,edits:Object.fromEntries(edits),players:[{id:myId,x:player.x,y:player.y,z:player.z,yaw,name:net.name}]});
      msgAll({t:"join",id:peerId,name:"Player"},peerId);
    }else c.send({t:"hello",name:net.name});
  });
  c.on("data",data=>{
    if(!data?.t)return;
    if(data.t==="hello"&&isHost){
      // Associate the remote name and send a full snapshot.
      c.peerName=data.name||"Player";
      const ps=[...remotePlayers].map(([id,r])=>({id,x:r.x,y:r.y,z:r.z,yaw:r.target.yaw||0,name:r.target.name||"Player"}));
      ps.push({id:myId,x:player.x,y:player.y,z:player.z,yaw,name:net.name});
      c.send({t:"welcome",id:myId,host:true,edits:Object.fromEntries(edits),players:ps});
    }else if(data.t==="welcome"&&!isHost){
      applySnapshot(data);myId=peerIdSafe();document.getElementById("roomInfo").textContent="Connected to host.";
      if(data.players)for(const p of data.players)addRemote(p.id,p);
    }else if(data.t==="block"){
      setLocal(data.x,data.y,data.z,data.type,false);
      if(isHost)msgAll(data,c.peer);
    }else if(data.t==="player"){
      addRemote(data.id,data);
      if(isHost)msgAll(data,c.peer);
    }else if(data.t==="join"){
      // Host knows a new player exists; remote rendering begins on their first player packet.
    }else if(data.t==="leave"){
      removeRemote(data.id);
      if(isHost)msgAll(data,c.peer);
    }
  });
  c.on("close",()=>{connections.delete(peerId);removeRemote(peerId);if(isHost)msgAll({t:"leave",id:peerId})});
  c.on("error",()=>{connections.delete(peerId);removeRemote(peerId)});
}
function peerIdSafe(){return peer?.id||myId}
function startHost(){
  isHost=true;
  peer=new Peer();
  peer.on("open",id=>{
    myId=id;
    document.getElementById("roomInfo").innerHTML=`Share this code with your mates:<br><b>${id}</b>`;
    const url=`${location.origin}${location.pathname}?join=${encodeURIComponent(id)}`;
    const copy=document.createElement("button");copy.textContent="Copy Invite Link";copy.onclick=()=>navigator.clipboard?.writeText(url);
    document.getElementById("roomInfo").appendChild(document.createElement("br"));document.getElementById("roomInfo").appendChild(copy);
  });
  peer.on("connection",c=>setupConn(c,c.peer));
  peer.on("error",e=>{document.getElementById("roomInfo").textContent=`Multiplayer error: ${e.type}`});
}
function startJoin(id){
  isHost=false;
  peer=new Peer();
  peer.on("open",myPeerId=>{
    myId=myPeerId;
    const c=peer.connect(id,{reliable:true});
    setupConn(c,"host");
    document.getElementById("roomInfo").textContent="Connecting…";
  });
  peer.on("error",e=>{document.getElementById("roomInfo").textContent=`Multiplayer error: ${e.type}`});
}
let netStarted=false;
document.getElementById("hostBtn").onclick=()=>{
  document.getElementById("roomLabel").classList.add("hidden");
  if(!netStarted){startHost();netStarted=true}
};
document.getElementById("joinBtn").onclick=()=>{
  document.getElementById("roomLabel").classList.remove("hidden");
};
document.getElementById("enterBtn").onclick=()=>{
  net.name=(document.getElementById("nameInput").value.trim()||"Player").slice(0,14);
  const hostCode=roomField.value.trim();
  if(!netStarted){
    if(hostCode)startJoin(hostCode);else startHost();
    netStarted=true;
  }
  renderer.domElement.requestPointerLock();
  document.getElementById("overlay").style.display="none";
};

let netClock=0;
function networkTick(dt){
  if(!myId)return;
  netClock+=dt;
  if(netClock<.08)return;
  netClock=0;
  netSend({t:"player",id:myId,x:player.x,y:player.y,z:player.z,yaw,name:net.name});
}

/* ---------- Main loop ---------- */
const clock=new THREE.Clock();
function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),.045);
  if(pointerLocked&&!craftingOpen){
    updatePlayer(dt);
    if(lmb)mine();else{mining.id=null;mineBar.classList.add("hidden")}
    updateMobs(dt);
    networkTick(dt);
  }
  syncRemote(dt);
  const t=targetHit();
  const picked=t?.object?.userData?.faceBlocks?.[Math.floor((t.faceIndex??0)/2)];
  document.getElementById("status").textContent=picked?`${picked.type.replace("_"," ")} · ${t.distance.toFixed(1)}m${myId?` · ${isHost?"Host":"Online"}`:""}`:"";
  renderer.render(scene,camera);
}
animate();

addEventListener("resize",()=>{
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)
});
document.addEventListener("selectstart",e=>e.preventDefault());
