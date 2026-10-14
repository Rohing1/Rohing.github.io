import * as THREE from 'vendor/three.module.js';
import { OrbitControls } from 'vendor/OrbitControls.js';

const colors = {active:'#27e5b0', maintenance:'#ffd166', inactive:'#8192a6', unknown:'#5e7897'};

export function alignRackRows(racks,width,depth,rackScale=1) {
  const positions=new Map(),rows=new Map();let groups=0;
  for(const rack of racks){if(rack.planX==null||rack.planY==null)continue;positions.set(rack.id,{x:rack.planX,y:rack.planY});if(!rows.has(rack.row))rows.set(rack.row,[]);rows.get(rack.row).push(rack)}
  for(const members of rows.values()){
    if(members.length<2)continue;
    const xs=members.map(r=>r.planX),ys=members.map(r=>r.planY),spanX=Math.max(...xs)-Math.min(...xs),spanY=Math.max(...ys)-Math.min(...ys);
    const vertical=spanY>spanX,major=vertical?'planY':'planX',minor=vertical?'planX':'planY',span=vertical?spanY:spanX,minorSpan=vertical?spanX:spanY;
    if(span<.06||minorSpan>Math.max(.04,span*.22))continue;
    const sorted=[...members].sort((a,b)=>a[major]-b[major]||a.bay-b.bay),minorValues=members.map(r=>r[minor]).sort((a,b)=>a-b),minorCenter=minorValues[Math.floor((minorValues.length-1)/2)],dimension=vertical?depth:width;
    let step=Math.max(span/(members.length-1),1.55*rackScale/dimension);
    step=Math.min(step,.94/(members.length-1));
    const visualSpan=step*(members.length-1),rawCenter=(Math.min(...(vertical?ys:xs))+Math.max(...(vertical?ys:xs)))/2,center=Math.max(.02+visualSpan/2,Math.min(.98-visualSpan/2,rawCenter));
    sorted.forEach((rack,index)=>{const point=positions.get(rack.id);point[vertical?'y':'x']=center+(index-(sorted.length-1)/2)*step;point[vertical?'x':'y']=minorCenter});
    groups++;
  }
  return {positions,groups};
}

function frontTexture(rack, devices) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0b1627'; ctx.fillRect(0,0,256,512);
  ctx.fillStyle = '#15283d'; ctx.fillRect(12,12,232,488);
  for (let i=0; i<rack.totalU; i++) {
    const y = 468 - i * (408/rack.totalU);
    ctx.fillStyle = i%2 ? '#1b3149' : '#203a54';
    ctx.fillRect(24,y,208,Math.max(3,408/rack.totalU-1));
  }
  for (const device of devices) {
    const y = 468 - (device.startU+device.heightU-1) * (408/rack.totalU);
    const h = Math.max(5,device.heightU * 408/rack.totalU-1);
    ctx.fillStyle = colors[device.status] || colors.unknown;
    ctx.fillRect(28,y,200,h);
    ctx.fillStyle = '#071321';
    if(h>14) { ctx.font = 'bold 13px system-ui'; ctx.fillText(device.name.slice(0,15),36,y+Math.min(15,h-2),174); }
  }
  ctx.fillStyle = '#2d4763'; ctx.fillRect(12,12,232,42);
  ctx.fillStyle = '#dcecff'; ctx.font = 'bold 18px system-ui'; ctx.textAlign = 'center';
  ctx.fillText(rack.name.length>11 ? rack.name.slice(0,10)+'…' : rack.name,128,40,218);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function areaTexture(label){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#0c3147df';ctx.fillRect(0,10,512,108);ctx.strokeStyle='#64e3df';ctx.lineWidth=5;ctx.strokeRect(4,14,504,100);
  ctx.fillStyle='#eaffff';ctx.font='bold 46px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,256,64,474);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}

function signTexture(label,background='#146d59'){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
  const ctx=canvas.getContext('2d');ctx.fillStyle=background;ctx.fillRect(0,0,512,128);
  ctx.strokeStyle='#b8fff0';ctx.lineWidth=6;ctx.strokeRect(6,6,500,116);
  ctx.fillStyle='#f1ffff';ctx.font='bold 49px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,256,64,476);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}

export function createRoom3D(stage, state, onSelect, onHeading=()=>{}, onRackMove=()=>{}, options={}) {
  const scene = new THREE.Scene();
  const room = state.room || {};
  scene.background = new THREE.Color('#081322');
  scene.fog = new THREE.Fog('#081322', 24, 85);
  const minRow = state.racks.length ? Math.min(...state.racks.map(r=>r.row || 1)) : 1;
  const maxRow = Math.max(minRow+1,...state.racks.map(r=>r.row || 1));
  const minBay = state.racks.length ? Math.min(...state.racks.map(r=>r.bay || 1)) : 1;
  const maxBay = Math.max(minBay+1,...state.racks.map(r=>r.bay || 1));
  const baseWidth = Math.max(10,(maxBay-minBay+1)*1.62+5,room.width||0);
  const baseDepth = Math.max(10,(maxRow-minRow+1)*2.7+5,room.depth||0);
  const rackScale=Math.max(.35,Math.min(1,(room.rackScale??100)/100));
  let width=baseWidth,depth=baseDepth;
  const placed=room.plan&&options.autoSpacing!==false?state.racks.filter(r=>r.planX!=null&&r.planY!=null):[];
  // Enlarge the schematic floor (and its texture) only as much as needed for 3D cabinet footprints.
  // Saved normalized plan positions stay untouched. Coincident positions cannot be separated safely.
  for(let i=0;i<placed.length;i++)for(let j=i+1;j<placed.length;j++){
    const dx=Math.abs(placed[i].planX-placed[j].planX),dz=Math.abs(placed[i].planY-placed[j].planY);
    const minX=1.5*rackScale,minZ=1.55*rackScale;
    if(dx*width>=minX||dz*depth>=minZ)continue;
    const neededWidth=dx>0?minX/dx:Infinity,neededDepth=dz>0?minZ/dz:Infinity;
    if(neededWidth<=neededDepth&&neededWidth<=100)width=Math.max(width,neededWidth);
    else if(neededDepth<=100)depth=Math.max(depth,neededDepth);
    else if(neededWidth<=100)width=Math.max(width,neededWidth);
  }
  const alignment=placed.length?alignRackRows(placed,width,depth,rackScale):{positions:new Map(),groups:0};
  const camera = new THREE.PerspectiveCamera(48,1,0.1,Math.max(150,Math.max(width,depth)*3));
  const size = Math.max(width,depth);
  scene.fog.far=Math.max(85,size*1.8);
  const spread = Math.max(maxBay-minBay+1,maxRow-minRow+1);
  const fit = spread>6 ? 1.65 : spread>3 ? 1.3 : 1;
  const home = new THREE.Vector3(size*.42*fit,Math.max(5.5,size*.45)*fit,size*.56*fit);
  camera.position.copy(home);
  const renderer = new THREE.WebGLRenderer({antialias:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.55;
  stage.append(renderer.domElement);
  const controls = new OrbitControls(camera,renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = .08;
  controls.minDistance = 3;
  controls.maxDistance = Math.max(75,size*1.5);
  controls.maxPolarAngle = Math.PI*.48;
  controls.target.set(0,.8,0);
  controls.update();

  scene.add(new THREE.HemisphereLight('#b7deff','#1b2837',2.2));
  const key = new THREE.DirectionalLight('#a9dcff',2.6); key.position.set(8,15,10); scene.add(key);
  const fill = new THREE.DirectionalLight('#1cf3d1',.55); fill.position.set(-8,9,-6); scene.add(fill);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width,depth),new THREE.MeshStandardMaterial({color:'#14283c',roughness:.92}));
  floor.rotation.x=-Math.PI/2; floor.position.y=-.06; scene.add(floor);
  let planFloor=null;
  if(room.plan){
    const planTexture = new THREE.TextureLoader().load(room.plan);
    planTexture.colorSpace=THREE.SRGBColorSpace;
    planTexture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    planFloor=new THREE.Mesh(new THREE.PlaneGeometry(width,depth),new THREE.MeshBasicMaterial({map:planTexture,transparent:true,opacity:.6,side:THREE.DoubleSide,depthWrite:false}));
    planFloor.rotation.x=-Math.PI/2;planFloor.position.y=-.026;planFloor.visible=false;scene.add(planFloor);
  }
  const grid = new THREE.GridHelper(Math.max(width,depth),Math.ceil(Math.max(width,depth)*2),'#245e77','#183650');
  grid.position.y=-.018;grid.material.transparent=true;grid.material.opacity=.23;scene.add(grid);
  function setPlanVisible(visible,opacity=.6){if(planFloor){planFloor.visible=!!visible;planFloor.material.opacity=Math.max(.15,Math.min(.95,opacity))}grid.material.opacity=visible?.12:.23;return !!planFloor&&!!visible}
  const edgeMaterial = new THREE.MeshBasicMaterial({color:'#1a9caf'});
  const beam=(x,z,w,d)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,.025,d),edgeMaterial);mesh.position.set(x,-.015,z);scene.add(mesh)};
  beam(0,-depth/2,width,.035);beam(0,depth/2,width,.035);beam(-width/2,0,.035,depth);beam(width/2,0,.035,depth);
  const wallMaterial=new THREE.MeshStandardMaterial({color:'#79b4ca',transparent:true,opacity:.14,depthWrite:false,side:THREE.DoubleSide,metalness:.35,roughness:.55});
  const walls=[];
  function wallSegment(x,z,w,d){if(w<=0||d<=0)return;const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,2.8,d),wallMaterial);mesh.position.set(x,1.4,z);scene.add(mesh);walls.push(mesh)}
  const customEntry=room.entryX!=null&&room.entryY!=null;
  const edgeDistances=customEntry?{top:room.entryY,right:1-room.entryX,bottom:1-room.entryY,left:room.entryX}:null;
  const nearestEdge=customEntry?Object.keys(edgeDistances).sort((a,b)=>edgeDistances[a]-edgeDistances[b])[0]:null;
  const entry=customEntry?(edgeDistances[nearestEdge]<.055?nearestEdge:null):(room.entrance||'bottom');
  const at=Math.max(.05,Math.min(.95,customEntry?(entry==='top'||entry==='bottom'?room.entryX:room.entryY):(room.entranceAt??50)/100));
  const gap=2.2;
  for(const side of ['top','right','bottom','left']){
    const horizontal=side==='top'||side==='bottom',span=horizontal?width:depth,offset=(at-.5)*span;
    if(side!==entry){horizontal?wallSegment(0,side==='top'?-depth/2:depth/2,width,.08):wallSegment(side==='left'?-width/2:width/2,0,.08,depth);continue}
    const firstEnd=offset-gap/2,secondStart=offset+gap/2;
    if(horizontal){wallSegment((-span/2+firstEnd)/2,side==='top'?-depth/2:depth/2,firstEnd+span/2,.08);wallSegment((secondStart+span/2)/2,side==='top'?-depth/2:depth/2,span/2-secondStart,.08)}
    else{wallSegment(side==='left'?-width/2:width/2,(-span/2+firstEnd)/2,.08,firstEnd+span/2);wallSegment(side==='left'?-width/2:width/2,(secondStart+span/2)/2,.08,span/2-secondStart)}
  }
  const entranceMarker=new THREE.Mesh(new THREE.PlaneGeometry(customEntry?.9:(entry==='top'||entry==='bottom'?gap:.28),customEntry?.9:(entry==='left'||entry==='right'?gap:.28)),new THREE.MeshBasicMaterial({color:'#42f0c7',transparent:true,opacity:.7,side:THREE.DoubleSide}));
  entranceMarker.rotation.x=-Math.PI/2;
  entranceMarker.position.set(customEntry?(room.entryX-.5)*width:(entry==='left'?-width/2+.65:entry==='right'?width/2-.65:(at-.5)*width),.01,customEntry?(room.entryY-.5)*depth:(entry==='top'?-depth/2+.65:entry==='bottom'?depth/2-.65:(at-.5)*depth));
  scene.add(entranceMarker);
  const structureWalls=[],structureObstacles=[],structureObjects=new Map(),structureData=new Map(),structurePickables=[];
  function addBox(group,w,h,d,x,y,z,color,metalness=.25){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,metalness,roughness:.5}));mesh.position.set(x,y,z);group.add(mesh);return mesh}
  function addSign(group,label,w,y,z,background){const sign=new THREE.Mesh(new THREE.PlaneGeometry(w,w*.25),new THREE.MeshBasicMaterial({map:signTexture(label,background),transparent:true,side:THREE.DoubleSide}));sign.position.set(0,y,z);group.add(sign);return sign}
  function registerStructure(structure,object){structureObjects.set(structure.id,object);structureData.set(structure.id,structure);object.traverse(child=>{if(child.isMesh){child.userData.structureId=structure.id;structurePickables.push(child)}});scene.add(object)}
  function drawStructure(structure){
    if(structure.type==='area'){
      const label=new THREE.Mesh(new THREE.PlaneGeometry(Math.max(1.8,Math.min(3.2,structure.label.length*.38)),.68),new THREE.MeshBasicMaterial({map:areaTexture(structure.label),transparent:true,side:THREE.DoubleSide,depthWrite:false}));
      label.rotation.x=-Math.PI/2;label.position.set((structure.x-.5)*width,.055,(structure.y-.5)*depth);registerStructure(structure,label);return;
    }
    if(!['glass','solid'].includes(structure.type)){
      const group=new THREE.Group(),x=(structure.x-.5)*width,z=(structure.y-.5)*depth;
      group.position.set(x,0,z);group.rotation.y=(structure.turn||0)*Math.PI/180;
      if(structure.type==='desk'){
        addBox(group,1.5,.1,.78,0,.76,0,'#adc5d4');
        for(const lx of [-.66,.66])for(const lz of [-.32,.32])addBox(group,.07,.71,.07,lx,.37,lz,'#64869a');
        addBox(group,.52,.36,.045,0,1.05,-.2,'#12283e');addBox(group,.18,.19,.14,0,.84,-.2,'#476d84');
        addBox(group,.5,.07,.42,0,.48,.77,'#477c90');addBox(group,.5,.45,.06,0,.72,1,'#477c90');
      }else if(structure.type==='firedoor'){
        addBox(group,.1,2.35,.14,-.69,1.17,0,'#c9e3e9');addBox(group,.1,2.35,.14,.69,1.17,0,'#c9e3e9');addBox(group,1.48,.1,.14,0,2.3,0,'#c9e3e9');
        const leaf=addBox(group,1.25,2.14,.08,-.05,1.12,.05,'#a65d4b');leaf.rotation.y=-.43;
        addBox(group,.08,.08,.09,.37,1.08,.16,'#f2d08c');addSign(group,structure.label||'防火门',1.15,2.48,.12,'#8f443d');
      }else if(structure.type==='entrysign'){
        addBox(group,.07,2.45,.07,0,1.22,0,'#90bed1');
        addBox(group,1.8,.47,.1,0,2.28,0,'#13745c');addSign(group,structure.label||'入口 →',1.72,2.28,.06,'#13745c');
      }else if(structure.type==='battery'){
        const cols=structure.cols||16,rows=structure.rows||4,levels=structure.levels||2,count=structure.count||cols*rows*levels,stepX=.34,stepZ=.32,stepY=.43;
        const rackW=cols*stepX+.14,rackD=rows*stepZ+.14,rackH=levels*stepY+.26;
        addBox(group,rackW,.08,rackD,0,.09,0,'#657e8e',.65);
        for(const px of [-rackW/2+.05,rackW/2-.05])for(const pz of [-rackD/2+.05,rackD/2-.05])addBox(group,.065,rackH,.065,px,rackH/2+.09,pz,'#7398a9',.7);
        for(let level=0;level<levels;level++)addBox(group,rackW,.04,rackD,0,.2+level*stepY,0,'#304b5d',.6);
        for(const pz of [-rackD/2+.05,rackD/2-.05])addBox(group,rackW,.04,.055,0,rackH+.07,pz,'#7aa3b3',.65);
        const cells=new THREE.InstancedMesh(new THREE.BoxGeometry(.27,.27,.25),new THREE.MeshStandardMaterial({color:'#91a6b3',metalness:.12,roughness:.7}),count),matrix=new THREE.Matrix4();
        let index=0;for(let level=0;level<levels&&index<count;level++)for(let row=0;row<rows&&index<count;row++)for(let col=0;col<cols&&index<count;col++){matrix.makeTranslation((col-(cols-1)/2)*stepX,.37+level*stepY,(row-(rows-1)/2)*stepZ);cells.setMatrixAt(index++,matrix)}
        cells.instanceMatrix.needsUpdate=true;group.add(cells);
        addSign(group,structure.label||`UPS 长排电池架 · ${count} 节`,Math.min(1.9,Math.max(1.1,rackW-.05)),rackH+.25,rackD/2+.055,'#204c67');
      }else if(structure.type==='gas'){
        const count=structure.count||1,columns=Math.min(4,count),rows=Math.ceil(count/4),rackW=columns*.48+.2,rackD=rows*.54+.2;
        addBox(group,rackW,.09,rackD,0,.055,0,'#6d8290',.58);
        for(let i=0;i<count;i++){
          const px=(i%4-(Math.min(4,count)-1)/2)*.48,pz=(Math.floor(i/4)-(rows-1)/2)*.54;
          const bottle=new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,1.35,14),new THREE.MeshStandardMaterial({color:'#b8423d',metalness:.3,roughness:.42}));bottle.position.set(px,.83,pz);group.add(bottle);
          const shoulder=new THREE.Mesh(new THREE.SphereGeometry(.18,12,8),new THREE.MeshStandardMaterial({color:'#b8423d',metalness:.3,roughness:.42}));shoulder.scale.y=.48;shoulder.position.set(px,1.52,pz);group.add(shoulder);
          addBox(group,.07,.17,.07,px,1.68,pz,'#b8c6c9',.7);
          addBox(group,.26,.045,.07,px,1.77,pz,'#c4d2d2',.7);
        }
        addBox(group,rackW,.055,.06,0,1.37,-rackD/2+.04,'#93afbc',.6);
        addSign(group,structure.label||`七氟丙烷 · ${count} 瓶`,Math.max(1.05,rackW),2.12,rackD/2+.07,'#823d3b');
      }else{
        const specs={power:{w:1.25,h:2.12,d:.78,color:'#546c7e',accent:'#ffc65c',name:'配电柜'},ups:{w:1.25,h:1.92,d:.9,color:'#5d638b',accent:'#93a8ff',name:'UPS'},cooling:{w:1.5,h:2.18,d:.9,color:'#668ea2',accent:'#5be8e0',name:'精密空调'}}[structure.type];
        if(!specs)return;
        addBox(group,specs.w,specs.h,specs.d,0,specs.h/2,0,specs.color,.42);
        addBox(group,specs.w-.14,.08,.04,0,specs.h-.17,specs.d/2+.025,specs.accent);
        for(let i=0;i<5;i++)addBox(group,specs.w-.28,.035,.035,0,.55+i*.18,specs.d/2+.03,'#213949');
        addSign(group,structure.label||specs.name,specs.w-.14,specs.h-.38,specs.d/2+.052,'#24455c');
      }
      registerStructure(structure,group);
      if(structure.type==='firedoor'&&structureWalls.length)redrawWalls();
      if(['desk','power','ups','cooling','battery','gas'].includes(structure.type)){
        const sizes={desk:[.85,.75],power:[.7,.5],ups:[.7,.55],cooling:[.82,.55],battery:[(structure.cols||16)*.17+.24,(structure.rows||4)*.16+.24],gas:[Math.min(4,structure.count||1)*.24+.22,Math.ceil((structure.count||1)/4)*.27+.22]}[structure.type];
        const sideways=(structure.turn||0)%180!==0;
        structureObstacles.push({id:structure.id,x,z,halfW:sideways?sizes[1]:sizes[0],halfD:sideways?sizes[0]:sizes[1]});
      }
      return;
    }
    const x1=(structure.x1-.5)*width,z1=(structure.y1-.5)*depth,x2=(structure.x2-.5)*width,z2=(structure.y2-.5)*depth,length=Math.hypot(x2-x1,z2-z1);
    if(length<.1)return;
    const group=new THREE.Group();group.position.set((x1+x2)/2,0,(z1+z2)/2);group.rotation.y=-Math.atan2(z2-z1,x2-x1);
    const glass=structure.type==='glass',intervals=[];
    for(const door of structureData.values())if(door.type==='firedoor'){
      const doorX=(door.x-.5)*width,doorZ=(door.y-.5)*depth,t=Math.max(0,Math.min(1,((doorX-x1)*(x2-x1)+(doorZ-z1)*(z2-z1))/(length*length)));
      if(Math.hypot(doorX-(x1+t*(x2-x1)),doorZ-(z1+t*(z2-z1)))<.5)intervals.push([Math.max(-length/2,t*length-length/2-.69),Math.min(length/2,t*length-length/2+.69)]);
    }
    intervals.sort((a,b)=>a[0]-b[0]);
    function wallPiece(left,right){const span=right-left;if(span<.05)return;const cx=(left+right)/2;
      const panel=new THREE.Mesh(new THREE.BoxGeometry(span,2.5,.07),new THREE.MeshStandardMaterial({color:glass?'#7be4f5':'#47647b',transparent:true,opacity:glass ? .28 : .88,depthWrite:!glass,metalness:glass ? .15 : .25,roughness:glass ? .18 : .7,side:THREE.DoubleSide}));panel.position.set(cx,1.25,0);group.add(panel);
      if(glass){for(const y of [.05,2.5]){const rail=new THREE.Mesh(new THREE.BoxGeometry(span,.06,.1),new THREE.MeshStandardMaterial({color:'#6ac3da',metalness:.65,roughness:.28}));rail.position.set(cx,y,0);group.add(rail)}for(const edge of [left,right]){const post=new THREE.Mesh(new THREE.BoxGeometry(.06,2.5,.1),new THREE.MeshStandardMaterial({color:'#6ac3da',metalness:.65,roughness:.28}));post.position.set(edge,1.25,0);group.add(post)}}
    }
    let cursor=-length/2;for(const [left,right] of intervals){wallPiece(cursor,left);cursor=Math.max(cursor,right)}wallPiece(cursor,length/2);
    registerStructure(structure,group);structureWalls.push({id:structure.id,x1,z1,x2,z2});
  }
  for(const structure of [...(room.structures||[])].sort((a,b)=>(a.type==='firedoor'?-1:0)-(b.type==='firedoor'?-1:0)))drawStructure(structure);
  function redrawWalls(){const items=[...structureData.values()].filter(item=>['glass','solid'].includes(item.type));for(const item of items){removeStructureFromScene(item.id,false);drawStructure(item)}}
  function removeStructureFromScene(id,refresh=true){const object=structureObjects.get(id);if(!object)return;const wasDoor=structureData.get(id)?.type==='firedoor';scene.remove(object);object.traverse(child=>{if(child.isMesh){const index=structurePickables.indexOf(child);if(index>=0)structurePickables.splice(index,1)}child.geometry?.dispose();if(child.material){const materials=Array.isArray(child.material)?child.material:[child.material];for(const material of materials){material.map?.dispose();material.dispose()}}});structureObjects.delete(id);structureData.delete(id);for(const collection of [structureWalls,structureObstacles]){const index=collection.findIndex(item=>item.id===id);if(index>=0)collection.splice(index,1)}if(wasDoor&&refresh)redrawWalls()}
  const automaticEntrySign=new THREE.Group();automaticEntrySign.position.set(entranceMarker.position.x,0,entranceMarker.position.z);
  addBox(automaticEntrySign,.06,2.55,.06,0,1.28,0,'#70bcb2');addSign(automaticEntrySign,'入口',1.45,2.54,.08,'#116d55');scene.add(automaticEntrySign);
  const originX=(maxBay+minBay)/2,originZ=(maxRow+minRow)/2;
  // A floorplan does not imply rack coordinates. Keep unplaced racks apart as a visual staging layout.
  const unplaced=room.plan?state.racks.filter(r=>r.planX==null||r.planY==null):[];
  const autoColumns=Math.max(1,Math.min(6,Math.ceil(Math.sqrt(unplaced.length*width/depth*.65))));
  const autoRows=Math.ceil(unplaced.length/autoColumns);
  const autoStepX=Math.min(3.1,(width-1.8)/Math.max(1,autoColumns));
  const autoStepZ=Math.min(3.1,(depth-1.8)/Math.max(1,autoRows));
  const autoPositions=new Map(unplaced.map((rack,index)=>{const row=Math.floor(index/autoColumns),column=index%autoColumns,countInRow=Math.min(autoColumns,unplaced.length-row*autoColumns);return[rack.id,{x:(column-(countInRow-1)/2)*autoStepX,z:(row-(autoRows-1)/2)*autoStepZ}]}));
  const aisleStrips=[];
  for(let row=minRow;row<=maxRow;row++) {
    const z=(row-originZ)*2.7;
    const strip=new THREE.Mesh(new THREE.PlaneGeometry(width-1,.28),new THREE.MeshBasicMaterial({color:'#103f58',transparent:true,opacity:.42,side:THREE.DoubleSide}));
    strip.rotation.x=-Math.PI/2;strip.position.set(0,-.035,z+1.25);scene.add(strip);aisleStrips.push(strip);
  }

  const pickables=[],rackObjects=new Map(),leds=[],powerBars=[];
  const maxEstimatedPower=Math.max(1,...state.racks.map(rack=>state.devices.filter(device=>device.rackId===rack.id).reduce((sum,device)=>sum+(Number(device.power)||0),0)));
  const cabinetGeometry=new THREE.BoxGeometry(1.08,2.2,1.12);
  const cabinetMaterial=new THREE.MeshStandardMaterial({color:'#1b3047',metalness:.62,roughness:.35});
  const frameMaterial=new THREE.MeshStandardMaterial({color:'#4a728c',metalness:.66,roughness:.28});
  const edgeGeometry=new THREE.BoxGeometry(1.12,.045,1.16);
  const railGeometry=new THREE.BoxGeometry(.045,2.22,.04);
  const ledGeometry=new THREE.SphereGeometry(.055,8,6);
  const statusMaterial=new Map();
  for(const rack of state.racks){
    const group=new THREE.Group();
    const auto=autoPositions.get(rack.id);
    const aligned=alignment.positions.get(rack.id);
    group.position.set(aligned?(aligned.x-.5)*width:rack.planX!=null?(rack.planX-.5)*width:(auto?.x??(rack.bay-originX)*1.62),0,aligned?(aligned.y-.5)*depth:rack.planY!=null?(rack.planY-.5)*depth:(auto?.z??(rack.row-originZ)*2.7));
    group.scale.set(rackScale,1,rackScale);
    group.rotation.y={north:0,south:Math.PI,east:Math.PI/2,west:-Math.PI/2}[rack.facing]??0;
    const body=new THREE.Mesh(cabinetGeometry,cabinetMaterial);body.position.y=1.1;group.add(body);
    const top=new THREE.Mesh(edgeGeometry,frameMaterial);top.position.y=2.22;group.add(top);
    const base=new THREE.Mesh(edgeGeometry,frameMaterial);base.position.y=.02;group.add(base);
    for(const x of [-.54,.54]){const rail=new THREE.Mesh(railGeometry,frameMaterial);rail.position.set(x,1.1,.58);group.add(rail)}
    const members=state.devices.filter(device=>device.rackId===rack.id);
    const estimatedPower=members.reduce((sum,device)=>sum+(Number(device.power)||0),0);
    if(estimatedPower>0){const ratio=Math.max(.08,estimatedPower/maxEstimatedPower),bar=new THREE.Mesh(new THREE.BoxGeometry(.88*ratio,.045,.1),new THREE.MeshBasicMaterial({color:ratio>.8?'#ff7a69':ratio>.5?'#ffd166':'#60e4bd'}));bar.position.set(-.44+.44*ratio,2.28,.3);bar.visible=false;group.add(bar);powerBars.push(bar)}
    const texture=frontTexture(rack,members);
    const panel=new THREE.Mesh(new THREE.PlaneGeometry(1.02,2.1),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));
    panel.position.set(0,1.1,.593);group.add(panel);
    const ledStatus=members.some(d=>d.status==='active')?'active':members.some(d=>d.status==='maintenance')?'maintenance':members.some(d=>d.status==='inactive')?'inactive':'unknown';
    if(!statusMaterial.has(ledStatus))statusMaterial.set(ledStatus,new THREE.MeshBasicMaterial({color:colors[ledStatus]}));
    const led=new THREE.Mesh(ledGeometry,statusMaterial.get(ledStatus));led.position.set(.43,2.24,.61);group.add(led);
    if(ledStatus==='active'||ledStatus==='maintenance') leds.push(led);
    const ring=new THREE.Mesh(new THREE.RingGeometry(.69,.73,36),new THREE.MeshBasicMaterial({color:'#36d8c0',side:THREE.DoubleSide,transparent:true,opacity:0}));
    ring.rotation.x=-Math.PI/2;ring.position.y=.01;group.add(ring);
    group.userData={rackId:rack.id};
    for(const mesh of [body,top,base,panel]){mesh.userData.rackId=rack.id;pickables.push(mesh)}
    scene.add(group);rackObjects.set(rack.id,{group,ring,rack,members,panel});
  }

  // These overlays visualize manually entered records. They are not sensor readings or CFD.
  const heatCanvas=document.createElement('canvas');heatCanvas.width=256;heatCanvas.height=256;
  const heatContext=heatCanvas.getContext('2d');
  let heatSources=0;
  for(const item of rackObjects.values()){
    const watts=item.members.reduce((sum,device)=>sum+(Number(device.power)||0),0);
    if(!watts&&!item.members.length)continue;
    heatSources++;
    const px=(item.group.position.x/width+.5)*256,py=(item.group.position.z/depth+.5)*256;
    const radius=Math.max(10,Math.min(34,12+Math.sqrt(watts||item.members.length*350)*.24));
    const glow=heatContext.createRadialGradient(px,py,2,px,py,radius);
    glow.addColorStop(0,'rgba(255,88,62,.68)');glow.addColorStop(.35,'rgba(255,166,51,.42)');glow.addColorStop(1,'rgba(255,166,51,0)');
    heatContext.fillStyle=glow;heatContext.fillRect(px-radius,py-radius,radius*2,radius*2);
  }
  const heatTexture=new THREE.CanvasTexture(heatCanvas);
  const heatField=new THREE.Mesh(new THREE.PlaneGeometry(width,depth),new THREE.MeshBasicMaterial({map:heatTexture,transparent:true,opacity:.75,depthWrite:false,side:THREE.DoubleSide}));
  heatField.rotation.x=-Math.PI/2;heatField.position.y=-.009;heatField.visible=false;scene.add(heatField);
  const particleCount=Math.min(120,Math.max(36,state.racks.length*3));
  const particlePositions=new Float32Array(particleCount*3),particleSeeds=new Float32Array(particleCount);
  for(let i=0;i<particleCount;i++){
    particleSeeds[i]=(i*.61803398875)%1;
    particlePositions[i*3]=((i*.754877666)%1-.5)*(width-1);
    particlePositions[i*3+1]=.22+(i%5)*.075;
    particlePositions[i*3+2]=((i*.569840291)%1-.5)*(depth-1);
  }
  const particleGeometry=new THREE.BufferGeometry();particleGeometry.setAttribute('position',new THREE.BufferAttribute(particlePositions,3));
  const airflow=new THREE.Points(particleGeometry,new THREE.PointsMaterial({color:'#67d9f7',size:.11,transparent:true,opacity:.7,depthWrite:false,sizeAttenuation:true}));
  airflow.visible=false;airflow.frustumCulled=false;scene.add(airflow);
  const deviceHighlight=new THREE.Mesh(new THREE.PlaneGeometry(1.01,1),new THREE.MeshBasicMaterial({color:'#ffe083',transparent:true,opacity:.34,depthWrite:false,depthTest:false,side:THREE.DoubleSide}));
  deviceHighlight.visible=false;deviceHighlight.renderOrder=5;
  const layerState={occupancy:true,power:true,facilities:true,aisles:true,heat:false,airflow:false};
  function setLayers(next={}){
    Object.assign(layerState,next);
    heatField.visible=!!layerState.heat&&heatSources>0&&!arranging;
    airflow.visible=!!layerState.airflow&&!arranging;
    for(const strip of aisleStrips)strip.visible=!!layerState.aisles;
    for(const bar of powerBars)bar.visible=!!layerState.power;
    for(const [id,object] of structureObjects){
      const type=structureData.get(id)?.type;
      if(['desk','power','ups','battery','gas','cooling','entrysign'].includes(type))object.visible=!!layerState.facilities;
    }
    for(const item of rackObjects.values()){
      const ratio=item.members.reduce((sum,device)=>sum+device.heightU,0)/Math.max(1,item.rack.totalU);
      item.ring.material.color.set(ratio>=.85?'#f47769':ratio>=.6?'#ffc866':'#42dcb6');
    }
    refreshRings();
    return {heatAvailable:heatSources>0};
  }

  let selected=null,targetCamera=null,targetFocus=null,walkTarget=null,walkQueue=[],frame=0,disposed=false,raf=0,walking=false,arranging=false,structuring=false,structureKind='glass',draft=null,drag=null,yaw=0,pitch=0,lastTime=performance.now(),slowFrames=0,airflowAutoReduced=false;
  const connectionLayer=new THREE.Group();scene.add(connectionLayer);let cableDevice=null;
  function drawConnections(){
    for(const line of [...connectionLayer.children]){connectionLayer.remove(line);line.geometry.dispose();line.material.dispose()}
    if(!selected)return;
    const endpoint=id=>{const device=state.devices.find(d=>d.id===id),item=device&&rackObjects.get(device.rackId);if(!item)return null;item.group.updateMatrixWorld(true);return item.group.localToWorld(new THREE.Vector3(0,.15+(device.startU+device.heightU/2-.5)/item.rack.totalU*1.95,.66))};
    const relevant=(state.connections||[]).filter(c=>cableDevice?c.from===cableDevice||c.to===cableDevice:state.devices.some(d=>d.rackId===selected&&(d.id===c.from||d.id===c.to))).slice(0,100);
    for(const c of relevant){const a=endpoint(c.from),b=endpoint(c.to);if(!a||!b)continue;const ceiling=2.7,points=[a,a.clone().setY(ceiling),new THREE.Vector3(b.x,ceiling,a.z),b.clone().setY(ceiling),b];const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:{network:'#5edaff',powerA:'#ffd166',powerB:'#cd9dff'}[c.kind],transparent:true,opacity:.8,depthTest:false}));line.renderOrder=10;connectionLayer.add(line)}
  }
  function refreshRings(){for(const [id,item] of rackObjects)item.ring.material.opacity=id===selected?.94:layerState.occupancy?.6:0}
  const moveKeys=new Set();
  const pointer=new THREE.Vector2(),raycaster=new THREE.Raycaster();
  let down=null;
  const previewGeometry=new THREE.BufferGeometry(),previewPoints=new Float32Array(6);previewGeometry.setAttribute('position',new THREE.BufferAttribute(previewPoints,3));
  const previewLine=new THREE.Line(previewGeometry,new THREE.LineBasicMaterial({color:'#ffd166',depthTest:false}));previewLine.visible=false;previewLine.renderOrder=10;scene.add(previewLine);
  const walkTargetMarker=new THREE.Mesh(new THREE.RingGeometry(.2,.27,32),new THREE.MeshBasicMaterial({color:'#5cffcc',side:THREE.DoubleSide,depthTest:false}));walkTargetMarker.rotation.x=-Math.PI/2;walkTargetMarker.position.y=.065;walkTargetMarker.renderOrder=9;walkTargetMarker.visible=false;scene.add(walkTargetMarker);
  function cancelWalkTarget(){walkTarget=null;walkQueue=[];walkTargetMarker.visible=false}
  function clearDraft(){draft=null;previewLine.visible=false}
  function updatePreview(x,z){if(!draft)return;const positions=previewGeometry.attributes.position;positions.setXYZ(0,draft.worldX,.09,draft.worldZ);positions.setXYZ(1,x,.09,z);positions.needsUpdate=true;previewLine.visible=true}
  function select(id,deviceId=null){
    const item=rackObjects.get(id); if(!item)return;
    selected=id;cableDevice=deviceId;refreshRings();drawConnections();
    deviceHighlight.visible=false;
    if(deviceId){
      const device=item.members.find(member=>member.id===deviceId);
      if(device){
        const y=468-(device.startU+device.heightU-1)*408/item.rack.totalU;
        const h=Math.max(5,device.heightU*408/item.rack.totalU-1);
        item.group.add(deviceHighlight);
        deviceHighlight.position.set(0,2.15-(y+h/2)/512*2.1,.615);
        deviceHighlight.scale.y=h/512*2.1;
        deviceHighlight.visible=true;
      }
    }
    const pos=item.group.position.clone();
    if(!walking){targetFocus=pos.clone().add(new THREE.Vector3(0,1.25,0));
    const toward=new THREE.Vector3(2.8,2.4,3.8).applyAxisAngle(new THREE.Vector3(0,1,0),item.group.rotation.y);
    targetCamera=targetFocus.clone().add(toward)}
    onSelect(item.rack,deviceId);
  }
  function focusDevice(deviceId){const device=state.devices.find(item=>item.id===deviceId);if(device)select(device.rackId,deviceId)}
  function deviceAtPanel(hit){
    if(!hit?.uv||hit.object!==rackObjects.get(hit.object.userData.rackId)?.panel)return null;
    const item=rackObjects.get(hit.object.userData.rackId),pixel=(1-hit.uv.y)*512;
    return item.members.find(device=>{const y=468-(device.startU+device.heightU-1)*408/item.rack.totalU,h=Math.max(5,device.heightU*408/item.rack.totalU-1);return pixel>=y&&pixel<=y+h})?.id||null;
  }
  function pointerPosition(event){const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera)}
  const ground=new THREE.Plane(new THREE.Vector3(0,1,0),0),groundPoint=new THREE.Vector3();
  function setWalkTarget(x,z){
    if(!walking)return false;
    const margin=.45,baseX=Math.max(-width/2+margin,Math.min(width/2-margin,x)),baseZ=Math.max(-depth/2+margin,Math.min(depth/2-margin,z));
    const offsets=[[0,0],[-.5,0],[.5,0],[0,-.5],[0,.5],[-1,0],[1,0],[0,-1],[0,1]];
    const point=offsets.map(([dx,dz])=>({x:baseX+dx,z:baseZ+dz})).find(p=>clearPosition(p.x,p.z));
    if(!point){options.onWalkStatus?.('附近没有可通行位置，请在地面或小地图选另一处。');return false}
    walkQueue=[];walkTarget=point;walkTargetMarker.position.set(point.x,.065,point.z);walkTargetMarker.visible=true;
    options.onWalkStatus?.('正在前往选中的位置；遇到隔断会停下。');return true;
  }
  function passFireDoor(door){
    const x=(door.x-.5)*width,z=(door.y-.5)*depth,angle=(door.turn||0)*Math.PI/180,nx=Math.sin(angle),nz=Math.cos(angle);
    const side=Math.sign((camera.position.x-x)*nx+(camera.position.z-z)*nz)||1;
    const far={x:x-nx*side*1.05,z:z-nz*side*1.05};
    if(!clearPosition(x,z)||!clearPosition(far.x,far.z)){options.onWalkStatus?.('门口或门后被其他设施占用，请调整布置或从旁边通道进入。');return false}
    walkTarget={x,z};walkQueue=[far];walkTargetMarker.position.set(far.x,.065,far.z);walkTargetMarker.visible=true;
    options.onWalkStatus?.('正在穿过防火门；门洞仅作漫游示意。');return true;
  }
  function onPointerDown(event){down={x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY};if(structuring)return;if(arranging){pointerPosition(event);const hit=raycaster.intersectObjects(pickables,false)[0];if(hit){const id=hit.object.userData.rackId,item=rackObjects.get(id);drag={id,item,start:item.group.position.clone(),x:event.clientX,y:event.clientY,moved:false};renderer.domElement.setPointerCapture(event.pointerId);stage.style.cursor='grabbing'}return}if(walking)renderer.domElement.setPointerCapture(event.pointerId)}
  function onPointerMove(event){if(structuring){if(draft){pointerPosition(event);if(raycaster.ray.intersectPlane(ground,groundPoint))updatePreview(groundPoint.x,groundPoint.z)}return}if(arranging){if(!drag)return;if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<4&&!drag.moved)return;pointerPosition(event);if(!raycaster.ray.intersectPlane(ground,groundPoint))return;const x=Math.max(-width/2+.65,Math.min(width/2-.65,groundPoint.x)),z=Math.max(-depth/2+.65,Math.min(depth/2-.65,groundPoint.z));for(const [id,item] of rackObjects){if(id!==drag.id&&Math.abs(x-item.group.position.x)<1.25*rackScale&&Math.abs(z-item.group.position.z)<1.3*rackScale)return}drag.item.group.position.set(x,0,z);drag.moved=true;return}if(!walking||!down)return;const dx=event.clientX-down.lastX,dy=event.clientY-down.lastY;down.lastX=event.clientX;down.lastY=event.clientY;if(Math.hypot(event.clientX-down.x,event.clientY-down.y)>4){yaw-=dx*.004;pitch=Math.max(-1.15,Math.min(1.15,pitch-dy*.003));camera.rotation.set(pitch,yaw,0,'YXZ')}}
  function onPointerUp(event){
    if(structuring){if(!down||Math.hypot(event.clientX-down.x,event.clientY-down.y)>7){down=null;return}down=null;pointerPosition(event);if(!raycaster.ray.intersectPlane(ground,groundPoint))return;const x=Math.max(.02,Math.min(.98,Math.round((groundPoint.x/width+.5)*1000)/1000)),y=Math.max(.02,Math.min(.98,Math.round((groundPoint.z/depth+.5)*1000)/1000));if(!['glass','solid'].includes(structureKind)){if(structureKind==='battery'&&!clearBatteryFootprint(groundPoint.x,groundPoint.z)){options.onStructureStatus?.('长排电池架占地较长，请选择有足够空间且不碰机柜或隔墙的位置。');return}if(structureKind!=='battery'&&['desk','power','ups','cooling','gas'].includes(structureKind)&&!clearPosition(groundPoint.x,groundPoint.z)){options.onStructureStatus?.('这里与机柜、设施或隔断太近，请换个位置。');return}options.onStructureCreate?.({type:structureKind,x,y,turn:options.getStructureTurn?.()??0});return}if(!draft){draft={x,y,worldX:groundPoint.x,worldZ:groundPoint.z};updatePreview(groundPoint.x,groundPoint.z);options.onStructureStatus?.('起点已确定，请在地面点击终点。');return}if(Math.hypot(x-draft.x,y-draft.y)<.015){options.onStructureStatus?.('终点离起点太近，请选更远的位置。');return}const candidate={type:structureKind,x1:draft.x,y1:draft.y,x2:x,y2:y};clearDraft();options.onStructureCreate?.(candidate);return}
    if(arranging){down=null;stage.style.cursor='grab';if(!drag){if(selected){pointerPosition(event);if(raycaster.ray.intersectPlane(ground,groundPoint)){const item=rackObjects.get(selected),x=Math.max(-width/2+.65,Math.min(width/2-.65,groundPoint.x)),z=Math.max(-depth/2+.65,Math.min(depth/2-.65,groundPoint.z)),blocked=[...rackObjects].some(([id,other])=>id!==selected&&Math.abs(x-other.group.position.x)<1.25*rackScale&&Math.abs(z-other.group.position.z)<1.3*rackScale);if(!blocked){const start=item.group.position.clone();item.group.position.set(x,0,z);try{onRackMove(selected,Math.max(.02,Math.min(.98,x/width+.5)),Math.max(.02,Math.min(.98,z/depth+.5)))}catch(error){item.group.position.copy(start)}}}}return}const current=drag;drag=null;if(current.moved){const pos=current.item.group.position,x=Math.max(.02,Math.min(.98,pos.x/width+.5)),y=Math.max(.02,Math.min(.98,pos.z/depth+.5));try{onRackMove(current.id,x,y)}catch(error){current.item.group.position.copy(current.start)}}else select(current.id);return}
    if(!down||Math.hypot(event.clientX-down.x,event.clientY-down.y)>6){down=null;return}down=null;
    pointerPosition(event);
    const hit=raycaster.intersectObjects([...pickables,...structurePickables],false)[0];
    if(hit){const structure=structureData.get(hit.object.userData.structureId);if(walking&&structure?.type==='firedoor'){options.onStructureSelect?.(structure);passFireDoor(structure);return}cancelWalkTarget();if(hit.object.userData.rackId)select(hit.object.userData.rackId,deviceAtPanel(hit));else options.onStructureSelect?.(structure);return}
    if(walking){if(raycaster.ray.intersectPlane(ground,groundPoint))setWalkTarget(groundPoint.x,groundPoint.z);else options.onWalkStatus?.('当前视角看不到地面，请向下转动视角或点击小地图选位置。')}
  }
  function onPointerCancel(){if(drag)drag.item.group.position.copy(drag.start);drag=null;down=null;stage.style.cursor=arranging?'grab':''}
  renderer.domElement.addEventListener('pointerdown',onPointerDown);
  renderer.domElement.addEventListener('pointermove',onPointerMove);
  renderer.domElement.addEventListener('pointerup',onPointerUp);
  renderer.domElement.addEventListener('pointercancel',onPointerCancel);
  function onWheel(event){if(!walking)return;event.preventDefault();camera.fov=Math.max(35,Math.min(75,camera.fov+event.deltaY*.025));camera.updateProjectionMatrix()}
  renderer.domElement.addEventListener('wheel',onWheel,{passive:false});
  const keyMap={w:'forward',ArrowUp:'forward',s:'back',ArrowDown:'back',a:'left',ArrowLeft:'left',d:'right',ArrowRight:'right'};
  function onKeyDown(event){if(walking&&keyMap[event.key]){event.preventDefault();moveKeys.add(keyMap[event.key])}}
  function onKeyUp(event){if(keyMap[event.key])moveKeys.delete(keyMap[event.key])}
  window.addEventListener('keydown',onKeyDown);window.addEventListener('keyup',onKeyUp);
  function resize(){const rect=stage.getBoundingClientRect();if(rect.width<1||rect.height<1)return;camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();renderer.setSize(rect.width,rect.height,false)}
  const observer=new ResizeObserver(resize);observer.observe(stage);resize();
  function clearPosition(x,z){
    if(x<-width/2+.35||x>width/2-.35||z<-depth/2+.35||z>depth/2-.35)return false;
    for(const item of rackObjects.values()){const p=item.group.position;if(Math.abs(x-p.x)<.55*rackScale+.28&&Math.abs(z-p.z)<.57*rackScale+.3)return false}
    for(const wall of structureWalls){const dx=wall.x2-wall.x1,dz=wall.z2-wall.z1,t=Math.max(0,Math.min(1,((x-wall.x1)*dx+(z-wall.z1)*dz)/(dx*dx+dz*dz))),nearX=wall.x1+t*dx,nearZ=wall.z1+t*dz;if(Math.hypot(x-nearX,z-nearZ)<.28){const atDoor=[...structureData.values()].some(door=>{if(door.type!=='firedoor')return false;const doorX=(door.x-.5)*width,doorZ=(door.y-.5)*depth,doorT=Math.max(0,Math.min(1,((doorX-wall.x1)*dx+(doorZ-wall.z1)*dz)/(dx*dx+dz*dz)));return Math.hypot(doorX-(wall.x1+doorT*dx),doorZ-(wall.z1+doorT*dz))<.5&&Math.hypot(x-doorX,z-doorZ)<.72});if(!atDoor)return false}}
    for(const item of structureObstacles)if(item.id!==options.getRelocatingId?.()&&Math.abs(x-item.x)<item.halfW&&Math.abs(z-item.z)<item.halfD)return false;
    return true;
  }
  function clearBatteryFootprint(x,z){const config=options.getBatteryConfig?.()||{cols:16,rows:4},angle=(options.getStructureTurn?.()||0)%180,halfW=((angle?config.rows:config.cols)*(angle?.32:.34)+.14)/2,halfD=((angle?config.cols:config.rows)*(angle?.34:.32)+.14)/2;
    if(!Number.isInteger(config.cols)||!Number.isInteger(config.rows)||config.cols<1||config.cols>32||config.rows<1||config.rows>6)return false;
    for(let px=x-halfW;px<=x+halfW+.01;px+=.35)for(let pz=z-halfD;pz<=z+halfD+.01;pz+=.35)if(!clearPosition(px,pz))return false;
    return clearPosition(x+halfW,z+halfD);
  }
  function enterWalk(){walking=true;targetCamera=null;targetFocus=null;cancelWalkTarget();controls.enabled=false;moveKeys.clear();stage.style.cursor='crosshair';wallMaterial.opacity=.08;camera.fov=58;camera.updateProjectionMatrix();const p=entranceMarker.position;camera.position.set(p.x,1.65,p.z);camera.rotation.order='YXZ';pitch=0;if(customEntry){yaw={up:0,right:-Math.PI/2,down:Math.PI,left:Math.PI/2}[room.entryFacing]??0;camera.rotation.set(0,yaw,0,'YXZ')}else{camera.lookAt(0,1.65,0);yaw=camera.rotation.y}return true}
  function exitWalk(){walking=false;cancelWalkTarget();moveKeys.clear();controls.enabled=true;stage.style.cursor='';wallMaterial.opacity=.14;camera.fov=48;camera.updateProjectionMatrix();targetFocus=new THREE.Vector3(0,.8,0);targetCamera=home.clone();return false}
  function walkingStep(delta){const speed=2.5*delta,front=(moveKeys.has('forward')?1:0)-(moveKeys.has('back')?1:0),side=(moveKeys.has('right')?1:0)-(moveKeys.has('left')?1:0);if(front||side){cancelWalkTarget();const norm=Math.hypot(front,side)||1,dx=(-Math.sin(yaw)*front+Math.cos(yaw)*side)*speed/norm,dz=(-Math.cos(yaw)*front-Math.sin(yaw)*side)*speed/norm;const x=camera.position.x+dx,z=camera.position.z+dz;if(clearPosition(x,camera.position.z))camera.position.x=x;if(clearPosition(camera.position.x,z))camera.position.z=z;return}if(!walkTarget)return;const dx=walkTarget.x-camera.position.x,dz=walkTarget.z-camera.position.z,distance=Math.hypot(dx,dz);if(distance<.16){if(walkQueue.length){walkTarget=walkQueue.shift();return}cancelWalkTarget();options.onWalkStatus?.('已到达所选位置。');return}const step=Math.min(speed,distance),x=camera.position.x+dx/distance*step,z=camera.position.z+dz/distance*step;if(!clearPosition(x,z)){cancelWalkTarget();options.onWalkStatus?.('前方有机柜、设施或隔断，请选择另一条路线。');return}camera.position.x=x;camera.position.z=z}
  const northOffset={north:0,east:90,south:180,west:270}[room.northOnTop];
  const headingVector=new THREE.Vector3();
  function heading(){camera.getWorldDirection(headingVector);const planBearing=(Math.atan2(headingVector.x,-headingVector.z)*180/Math.PI+360)%360;onHeading({bearing:northOffset===undefined?null:(planBearing+northOffset)%360,planBearing,walking,position:{x:Math.max(0,Math.min(1,camera.position.x/width+.5)),y:Math.max(0,Math.min(1,camera.position.z/depth+.5))}})}
  function animate(){
    if(disposed)return;
    raf=requestAnimationFrame(animate);
    if(document.hidden)return;
    const now=performance.now(),elapsed=now-lastTime,delta=Math.min(.05,elapsed/1000);lastTime=now;
    if(airflow.visible&&!airflowAutoReduced){slowFrames=elapsed>48?slowFrames+1:Math.max(0,slowFrames-2);if(slowFrames>=45){airflowAutoReduced=true;airflow.visible=false;layerState.airflow=false;options.onPerformanceFallback?.('检测到帧率偏低，已自动关闭气流粒子；可在图层面板重新开启。')}}
    if(walking)walkingStep(delta);
    if(!walking&&targetCamera){
      camera.position.lerp(targetCamera,.075);
      controls.target.lerp(targetFocus,.075);
      if(camera.position.distanceTo(targetCamera)<.035){targetCamera=null;targetFocus=null}
    }
    if(!walking)controls.update();
    const glow=.62+.38*Math.sin(frame++*.055);
    for(const led of leds)led.scale.setScalar(glow);
    if(airflow.visible&&frame%3===0){
      for(let i=0;i<particleCount;i++){
        let x=particlePositions[i*3]+delta*3*(.45+particleSeeds[i]);
        if(x>width/2-.4)x=-width/2+.4;
        particlePositions[i*3]=x;
      }
      particleGeometry.attributes.position.needsUpdate=true;
    }
    if(frame%8===0)heading();
    renderer.render(scene,camera);
  }
  animate();
  const stopFly=()=>{targetCamera=null;targetFocus=null};
  controls.addEventListener('start',stopFly);
  return {
    focus:select,
    focusDevice,
    setConnections(connections){state.connections=connections;drawConnections()},
    setLayers,
    layerAvailability(){return {heat:heatSources>0}},
    reset(){if(walking)exitWalk();targetFocus=new THREE.Vector3(0,.8,0);targetCamera=home.clone()},
    top(){if(walking)exitWalk();targetFocus=new THREE.Vector3(0,0,0);targetCamera=new THREE.Vector3(.01,Math.max(width,depth)*1.25,.01)},
    entrance(){if(walking)exitWalk();const p=entranceMarker.position;targetFocus=new THREE.Vector3(0,1,0);targetCamera=new THREE.Vector3(p.x,Math.max(3,size*.27),p.z).lerp(new THREE.Vector3(0,Math.max(3,size*.27),0),.16)},
    toggleWalk(){return walking?exitWalk():enterWalk()},
    walkToNormalized(x,y){return setWalkTarget((x-.5)*width,(y-.5)*depth)},
    setPlanVisible,
    hasPlan(){return !!planFloor},
    arrange(active){if(walking)exitWalk();if(active){structuring=false;clearDraft()}arranging=!!active;drag=null;down=null;controls.enabled=!arranging;stage.style.cursor=arranging?'grab':'';if(arranging){heatField.visible=false;airflow.visible=false}else setLayers();return arranging},
    structureMode(kind){if(walking)exitWalk();if(kind){arranging=false;structuring=true;structureKind=['glass','solid','area','desk','entrysign','firedoor','power','ups','battery','gas','cooling'].includes(kind)?kind:'glass'}else structuring=false;clearDraft();down=null;controls.enabled=!structuring&&!arranging;stage.style.cursor=structuring?'crosshair':'';return structuring},
    cancelStructureDraft(){clearDraft()},
    addStructure(item){drawStructure(item);setLayers()},
    removeStructure:removeStructureFromScene,
    structureCount(){return structureObjects.size},
    crowdedCount(){const items=[...rackObjects.values()];let count=0;for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){const a=items[i].group.position,b=items[j].group.position;if(Math.abs(a.x-b.x)<1.55*rackScale&&Math.abs(a.z-b.z)<1.5*rackScale)count++}return count},
    spacingInfo(){return{baseWidth,baseDepth,width,depth,expanded:width>baseWidth+.01||depth>baseDepth+.01,alignedGroups:alignment.groups}},
    setMove(action,active){if(active)moveKeys.add(action);else moveKeys.delete(action)},
    dispose(){
      disposed=true;cancelAnimationFrame(raf);observer.disconnect();controls.dispose();
      renderer.domElement.removeEventListener('pointerdown',onPointerDown);
      renderer.domElement.removeEventListener('pointermove',onPointerMove);
      renderer.domElement.removeEventListener('pointerup',onPointerUp);
      renderer.domElement.removeEventListener('pointercancel',onPointerCancel);
      renderer.domElement.removeEventListener('wheel',onWheel);
      window.removeEventListener('keydown',onKeyDown);window.removeEventListener('keyup',onKeyUp);
      scene.traverse(object=>{if(object.geometry&&![cabinetGeometry,edgeGeometry,railGeometry,ledGeometry].includes(object.geometry))object.geometry.dispose();if(object.material){const materials=Array.isArray(object.material)?object.material:[object.material];for(const material of materials){material.map?.dispose();if(![cabinetMaterial,frameMaterial,edgeMaterial,...statusMaterial.values()].includes(material))material.dispose()}}});
      cabinetGeometry.dispose();edgeGeometry.dispose();railGeometry.dispose();ledGeometry.dispose();cabinetMaterial.dispose();frameMaterial.dispose();edgeMaterial.dispose();for(const material of statusMaterial.values())material.dispose();
      renderer.dispose();renderer.domElement.remove();
    }
  };
}
