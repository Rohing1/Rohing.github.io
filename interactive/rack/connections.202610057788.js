import {el,btn,field,select,panel,row,grid,table,dialog,download,csv,ready} from '../ops-ui.js';
const api=await ready('RackApp'), M=window.OpsModels;
const p=panel('端口接线与 A/B 供电台账','登记设备之间的网络接口、PDU 插口和供电支路。接线仅为人工记录；连线是逻辑关系示意，不是实际布线路径，不进行设备探测。新增接线纳入原有完整备份与撤销。');
const from=select('设备端',[]), to=select('对端设备 / PDU',[]), fromPort=field('设备接口 / 电源口'),toPort=field('对端接口 / 插口'),kind=select('接线类型',[['network','网络'],['powerA','供电 A 路'],['powerB','供电 B 路']]), label=field('接线说明（可选）'), filter=select('查看设备',[]), out=el('div'), status=el('p','',{class:'ops-status',role:'status'});
let editing=null;
for(const f of [fromPort,toPort])f.input.maxLength=60;label.input.maxLength=100;
const save=btn('保存接线',()=>{
  const state=api.state(), next={id:editing||crypto.randomUUID(),from:from.input.value,to:to.input.value,fromPort:fromPort.input.value.trim(),toPort:toPort.input.value.trim(),kind:kind.input.value,label:label.input.value.trim()};
  const connections=(state.connections||[]).filter(c=>c.id!==next.id);connections.push(next);api.updateConnections(connections);editing=null;fromPort.input.value='';toPort.input.value='';label.input.value='';save.textContent='保存接线';status.textContent='已登记；请定期导出完整备份。';render();
},'primary');
p.append(grid(from.label,to.label,fromPort.label,toPort.label,kind.label,label.label),row(save,btn('取消编辑',()=>{editing=null;save.textContent='保存接线'}),filter.label,btn('导出接线 CSV',exportWiring),btn('导出所选机柜立面 SVG',exportElevation)),status,out);
function deviceName(id,state){const d=state.devices.find(d=>d.id===id);return d?`${state.racks.find(r=>r.id===d.rackId)?.name||'机柜'} / ${d.name}`:'不存在的设备'}
function options(f,items,empty){const old=f.input.value;f.input.replaceChildren();if(empty)f.input.add(new Option(empty,''));for(const d of items)f.input.add(new Option(deviceName(d.id,api.state()),d.id));if([...f.input.options].some(o=>o.value===old))f.input.value=old}
function focus(id){document.dispatchEvent(new CustomEvent('rack:focus-device3d',{detail:{deviceId:id}}))}
function edit(c){editing=c.id;from.input.value=c.from;to.input.value=c.to;fromPort.input.value=c.fromPort;toPort.input.value=c.toPort;kind.input.value=c.kind;label.input.value=c.label;save.textContent='保存修改';from.input.focus()}
function render(){
  const state=api.state(),connections=state.connections||[];for(const f of [from,to])options(f,state.devices);options(filter,state.devices,'所有设备');
  out.replaceChildren();const issues=M.connectionIssues(connections,state.devices);if(issues.length){const details=el('details',null,{open:true});details.append(el('summary',`规划核对提醒 · ${issues.length} 条`));issues.forEach(t=>details.append(el('p',t,{class:'ops-warning'})));out.append(details)}
  const shown=connections.filter(c=>!filter.input.value||c.from===filter.input.value||c.to===filter.input.value);
  out.append(table(['设备端 / 接口','对端 / 插口','支路','说明','操作'],shown.map(c=>()=>[`${deviceName(c.from,state)} · ${c.fromPort}`,`${deviceName(c.to,state)} · ${c.toPort}`,{network:'网络',powerA:'A 路',powerB:'B 路'}[c.kind],c.label,row(btn('编辑',()=>edit(c)),btn('定位对端',()=>focus(c.to)),btn('删除',()=>{if(confirm('删除这条人工接线记录？设备本身不会删除。'))api.updateConnections(connections.filter(x=>x.id!==c.id))},'danger'))])));
  if(filter.input.value){const links=shown.map(c=>{const target=c.from===filter.input.value?c.to:c.from;return row(el('span',`${c.kind==='network'?'↔':'⚡'} ${c.from===filter.input.value?c.fromPort:c.toPort} → ${deviceName(target,state)} / ${c.from===filter.input.value?c.toPort:c.fromPort}`),btn('3D 联动定位',()=>focus(target)))});out.append(el('h3','所选设备的邻接关系'),...links)}
}
function exportWiring(){const s=api.state();download('设备接线台账.csv',csv([['设备端','接口','对端','接口或插口','支路','说明'],...(s.connections||[]).map(c=>[deviceName(c.from,s),c.fromPort,deviceName(c.to,s),c.toPort,c.kind,c.label])]),'text/csv;charset=utf-8')}
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function exportElevation(){const s=api.state(),rack=s.racks.find(r=>r.id===api.selected());if(!rack)throw Error('请先在机柜列表选择一个机柜');const h=rack.totalU*18+100;
 const shapes=s.devices.filter(d=>d.rackId===rack.id).map(d=>{const y=60+(rack.totalU-d.startU-d.heightU+1)*18;return `<rect x="62" y="${y}" width="420" height="${d.heightU*18}" fill="#e9f5ff" stroke="#176b91"/><text x="72" y="${y+14}" font-size="12">${escape(d.name)} · U${d.startU}–${d.startU+d.heightU-1}</text>`}).join('');
 const marks=Array.from({length:rack.totalU},(_,i)=>`<text x="25" y="${60+(rack.totalU-i-1)*18+14}" font-size="12">${i+1}U</text>`).join('');download('机柜立面.svg',`<svg xmlns="http://www.w3.org/2000/svg" width="540" height="${h}" viewBox="0 0 540 ${h}"><rect width="540" height="${h}" fill="white"/><text x="25" y="30" font-size="20">${escape(rack.name)} · 机柜立面</text>${marks}${shapes}<text x="25" y="${h-14}" font-size="12">手工规划示意，非实测 · 包含本机资产，请妥善保管</text></svg>`,'image/svg+xml')
}
window.addEventListener('yj-rack-update',render);filter.input.addEventListener('change',render);
window.addEventListener('yj-rack-3d-selection',event=>queueMicrotask(()=>{
 const host=document.getElementById('room3d-info');if(!host)return;host.querySelector('[data-cable-info]')?.remove();const state=api.state(),id=event.detail.deviceId,links=(state.connections||[]).filter(c=>id?c.from===id||c.to===id:state.devices.some(d=>d.rackId===event.detail.rackId&&(d.id===c.from||d.id===c.to)));
 const box=el('section',null,{'data-cable-info':'true'});box.append(el('h3',`接线关系 · ${links.length} 条`),el('p','彩色线为人工登记的逻辑关系，非实际路径。'));for(const c of links.slice(0,30)){const target=id&&c.to===id?c.from:c.to;box.append(el('p',`${c.kind} · ${c.fromPort} ↔ ${c.toPort}`),btn(deviceName(target,state),()=>focus(target)))}host.append(box);
 if(id){filter.input.value=id;render()}else if(!event.detail.rackId){filter.input.value='';render()}
}));render();
