(() => {
  'use strict';
  const M = window.WirelessModel;
  const $ = id => document.getElementById(id);
  const stage = $('stage'), heat = $('heatmap'), overlay = $('overlay'), floorplan = $('floorplan');
  let plan = M.scenario('office'), tool = 'select', selected = null, probe = null, draft = null, dragging = false, heatTimer = 0, imageUrl = '', db = null, saveReady = false, saveTimer = 0;
  const status = (message, error = false) => { $('status').textContent = message; $('status').className = `status ${error ? 'error' : 'success'}`; };
  const finite = (value, fallback, min, max) => Number.isFinite(Number(value)) ? M.clamp(Number(value), min, max) : fallback;
  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const download = (name, blob) => { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); };
  const point = event => { const rect = overlay.getBoundingClientRect(); return {x:M.clamp((event.clientX - rect.left)/rect.width,0,1),y:M.clamp((event.clientY - rect.top)/rect.height,0,1)}; };
  const px = x => x * overlay.clientWidth, py = y => y * overlay.clientHeight;
  function resizeCanvas(canvas) { const ratio = Math.min(window.devicePixelRatio || 1, 2), w = Math.max(1, Math.round(stage.clientWidth*ratio)), h = Math.max(1, Math.round(stage.clientHeight*ratio)); if (canvas.width !== w || canvas.height !== h) {canvas.width=w;canvas.height=h;} const context=canvas.getContext('2d'); context.setTransform(ratio,0,0,ratio,0,0); return context; }
  function heatColor(pointValue) {
    if (!pointValue.best) return 'rgba(64,73,87,.42)';
    const view = plan.settings.view, threshold = Number(plan.settings.threshold);
    if (view === 'interference') {
      const same = new Set(pointValue.signals.filter(s => s.rssi >= threshold && s.channel === pointValue.best.channel).map(s => s.apId));
      return same.size > 1 ? 'rgba(240,86,60,.67)' : pointValue.best.rssi >= threshold ? 'rgba(52,198,162,.48)' : 'rgba(100,92,133,.43)';
    }
    const value = view === 'snr' ? pointValue.snr : pointValue.best.rssi;
    const low = view === 'snr' ? 5 : -90, high = view === 'snr' ? 45 : -40;
    const t = M.clamp((value-low)/(high-low),0,1);
    const hue = Math.round(338 + t*172) % 360;
    return `hsla(${hue},80%,${Math.round(48+t*10)}%,.62)`;
  }
  function drawHeat() {
    const ctx=resizeCanvas(heat), w=heat.clientWidth,h=heat.clientHeight;ctx.clearRect(0,0,w,h);
    if (!plan.settings.showHeat) return;
    const cols=Math.min(76,Math.max(44,Math.round(w/13))), rows=Math.min(50,Math.max(28,Math.round(h/13)));
    const cw=w/cols,ch=h/rows;
    for(let y=0;y<rows;y++) for(let x=0;x<cols;x++) {ctx.fillStyle=heatColor(M.signalAt(plan,(x+.5)/cols,(y+.5)/rows));ctx.fillRect(x*cw,y*ch,cw+1,ch+1);}
  }
  function drawOverlay() {
    const ctx=resizeCanvas(overlay),w=overlay.clientWidth,h=overlay.clientHeight;ctx.clearRect(0,0,w,h);
    if(plan.settings.showGrid){ctx.strokeStyle='rgba(220,247,255,.20)';ctx.lineWidth=1;const cols=Math.max(1,Math.round(plan.widthM/2)),rows=Math.max(1,Math.round(plan.heightM/2));for(let x=1;x<cols;x++){ctx.beginPath();ctx.moveTo(x*w/cols,0);ctx.lineTo(x*w/cols,h);ctx.stroke();}for(let y=1;y<rows;y++){ctx.beginPath();ctx.moveTo(0,y*h/rows);ctx.lineTo(w,y*h/rows);ctx.stroke();}}
    ctx.lineCap='round';
    for(const wall of plan.walls){const isSelected=selected?.kind==='wall'&&selected.id===wall.id;ctx.strokeStyle=isSelected?'#fff2ad':M.WALLS[wall.type].color;ctx.lineWidth=isSelected?9:6;ctx.beginPath();ctx.moveTo(px(wall.x1),py(wall.y1));ctx.lineTo(px(wall.x2),py(wall.y2));ctx.stroke();ctx.strokeStyle='rgba(5,24,35,.72)';ctx.lineWidth=2;ctx.stroke();}
    if(draft){ctx.setLineDash([6,6]);ctx.strokeStyle='#fbd38b';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(px(draft.x1),py(draft.y1));ctx.lineTo(px(draft.x2),py(draft.y2));ctx.stroke();ctx.setLineDash([]);}
    if(plan.route.length){ctx.strokeStyle='#ffc968';ctx.lineWidth=4;ctx.setLineDash([8,5]);ctx.beginPath();plan.route.forEach((p,i)=>i?ctx.lineTo(px(p.x),py(p.y)):ctx.moveTo(px(p.x),py(p.y)));ctx.stroke();ctx.setLineDash([]);plan.route.forEach((p,i)=>{ctx.fillStyle='#ffe2a1';ctx.beginPath();ctx.arc(px(p.x),py(p.y),5,0,Math.PI*2);ctx.fill();if(i===0&&plan.settings.showLabels)label(ctx,'起点',px(p.x)+10,py(p.y)-8);});}
    if(plan.settings.showRadius) for(const ap of plan.aps){const rx=ap.radiusM/plan.widthM*w,ry=ap.radiusM/plan.heightM*h;ctx.strokeStyle='rgba(238,250,255,.72)';ctx.lineWidth=1.6;ctx.setLineDash([7,6]);ctx.beginPath();ctx.ellipse(px(ap.x),py(ap.y),rx,ry,0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
    for(const ap of plan.aps){const x=px(ap.x),y=py(ap.y),active=selected?.kind==='ap'&&selected.id===ap.id;ctx.fillStyle=active?'#fff0a8':'#d8fbff';ctx.strokeStyle='#064a62';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,active?15:12,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#07546b';ctx.font='bold 13px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('AP',x,y);if(plan.settings.showLabels)label(ctx,ap.name,x+17,y-11);}
    if(probe){const x=px(probe.x),y=py(probe.y);ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,8,0,Math.PI*2);ctx.moveTo(x-12,y);ctx.lineTo(x+12,y);ctx.moveTo(x,y-12);ctx.lineTo(x,y+12);ctx.stroke();}
  }
  function label(ctx,text,x,y){ctx.font='12px system-ui';ctx.textAlign='left';ctx.textBaseline='middle';const width=Math.min(240,ctx.measureText(text).width+12);ctx.fillStyle='rgba(7,29,42,.84)';ctx.fillRect(x,y-11,width,22);ctx.fillStyle='#fff';ctx.fillText(text,x+6,y,Math.max(20,width-12));}
  function scheduleSave(){if(!saveReady||!db)return;clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{const request=db.transaction('plans','readwrite').objectStore('plans').put(plan,'current');request.onerror=()=>status('浏览器本地保存失败，请立即导出 JSON 备份。',true);}catch{status('浏览器本地保存失败，请立即导出 JSON 备份。',true);}},500);}
  function redraw(heavy=true){drawOverlay();if(heavy){clearTimeout(heatTimer);heatTimer=setTimeout(()=>{drawHeat();updateStats();},90);scheduleSave();}}
  function renderImage(){if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl='';if(plan.imageData){floorplan.src=plan.imageData;floorplan.hidden=false;}else{floorplan.removeAttribute('src');floorplan.hidden=true;}}
  function syncInputs(){$('profile').value=M.PROFILES[plan.defaultProfileId]?plan.defaultProfileId:'cisco9120';renderProfileHint();$('widthM').value=plan.widthM;$('heightM').value=plan.heightM;$('band').value=plan.settings.band;$('view').value=plan.settings.view;for(const id of ['threshold','noise','exponent','hysteresis'])$(id).value=plan.settings[id];for(const id of ['showHeat','showGrid','showLabels','showRadius'])$(id).checked=!!plan.settings[id];renderImage();renderDetail();redraw();}
  function updateStats(){const c=M.coverage(plan),warnings=M.channelWarnings(plan),roam=M.roam(plan);$('summaryBand').textContent=plan.settings.band==='5'?'5 GHz':'2.4 GHz';$('covered').textContent=`${c.coveredPct}%`;$('overlap').textContent=`${c.overlapPct}%`;$('apCount').textContent=`${plan.aps.length} / ${plan.walls.length}`;$('channelCount').textContent=String(warnings.length);$('signalRange').textContent=c.minimum===null?'当前频段没有启用的无线电。':`预测 RSSI 范围 ${c.minimum}～${c.maximum} dBm；门限 ${plan.settings.threshold} dBm。`;
    const advice=[];if(c.coveredPct<80)advice.push('覆盖低于 80%：检查 AP 位置、墙体假设或选中频段。');if(c.overlapPct<15&&plan.aps.length>1)advice.push('双 AP 覆盖较少：切换区域可能需要更平滑的重叠。');if(warnings.length)advice.push(`${warnings.length} 对 25 米内相邻射频有同频/重叠信道：${warnings.slice(0,3).map(item=>`${escapeHtml(item.a)} ↔ ${escapeHtml(item.b)}`).join('，')}。`);if(plan.settings.band==='2.4'&&plan.aps.length>2)advice.push('2.4 GHz 信道资源有限；可比较 5 GHz 方案，并结合实际终端能力。');$('advice').innerHTML=advice.length?advice.map(a=>`<p class="warn">${a}</p>`).join(''):'<p>当前没有明显的规划提醒；仍需现场勘测验证。</p>';
    $('roamSummary').textContent=roam.samples.length?`路线 ${roam.distance} 米 · 演示切换 ${roam.handoffs.length} 次 · 低于门限采样 ${roam.weakPct}%`:'至少设置两个路径点，即可演示切换。';$('handoffs').innerHTML=roam.handoffs.length?roam.handoffs.map(h=>`<li>约 ${h.at.toFixed(1)} 米：${escapeHtml(h.from)} → ${escapeHtml(h.to)}</li>`).join(''):'<li>暂无演示切换点</li>';if(probe&&selected?.kind!=='ap'&&selected?.kind!=='wall')renderDetail();}
  function profileOptions(selectedId){return ['Cisco','Huawei','H3C'].map(vendor=>`<optgroup label="${vendor}">${Object.entries(M.PROFILES).filter(([,p])=>p.vendor===vendor).map(([id,p])=>`<option value="${id}" ${id===selectedId?'selected':''}>${escapeHtml(p.label)} · ${escapeHtml(p.scene)}</option>`).join('')}</optgroup>`).join('');}
  function renderProfileHint(){const profile=M.PROFILES[$('profile').value];$('profileHint').textContent=profile?`${profile.vendor} ${profile.label} · ${profile.scene} · ${profile.detail}。默认规划圈 ${profile.radiusM} m（可编辑，不代表厂商保证覆盖半径）。`:'';}
  function renderDetail(){
    const selector=$('apSelector');selector.replaceChildren(new Option('未选择 AP',''),...plan.aps.map(a=>new Option(a.name,a.id)));selector.value=selected?.kind==='ap'?selected.id:'';
    const item=selected?.kind==='ap'?plan.aps.find(a=>a.id===selected.id):selected?.kind==='wall'?plan.walls.find(w=>w.id===selected.id):null;
    $('deleteSelected').disabled=!item;
    const detail=$('detail');
    if(selected?.kind==='ap'&&item){
      $('detailTitle').textContent='AP 射频配置';
      const profile=M.PROFILES[item.profileId];
      detail.innerHTML=`<label>AP 名称<input data-field="name" maxlength="36" value="${escapeHtml(item.name)}"></label>
        <div class="fields"><label>参考机型<select data-field="profileId">${profileOptions(item.profileId)}</select></label>
        <label>射频模式<select data-field="mode">${profile.modes.map(mode=>`<option value="${mode}" ${item.mode===mode?'selected':''}>${mode==='dual'?'双频 2.4+5':mode==='dual5'?'双 5 GHz':'三射频 2.4+5+5'}</option>`).join('')}</select></label>
        <label>安装高度（米）<input data-field="height" type="number" min="1" max="10" step="0.1" value="${item.height}"></label>
        <label>参考半径（米）<input data-field="radiusM" type="number" min="1" max="200" step="1" value="${item.radiusM}"></label>
        <label>预估终端数<input data-field="clients" type="number" min="0" max="500" step="1" value="${item.clients}"></label>
        <label>横向位置（米）<input data-field="x" type="number" min="0" max="${plan.widthM}" step="0.1" value="${(item.x*plan.widthM).toFixed(1)}"></label>
        <label>纵向位置（米）<input data-field="y" type="number" min="0" max="${plan.heightM}" step="0.1" value="${(item.y*plan.heightM).toFixed(1)}"></label></div>
        <p class="hint">${escapeHtml(profile.scene)} · 坐标 ${(item.x*plan.widthM).toFixed(1)} m × ${(item.y*plan.heightM).toFixed(1)} m。参考半径只绘制虚线圈，不参与热力图计算。改机型会重置射频示例值和参考圈。</p>
        ${item.radios.map((radio,i)=>`<div class="radio-card"><strong>${radio.band} GHz · 射频 ${radio.id}</strong><label class="label-check"><input type="checkbox" data-radio="${i}" data-key="enabled" ${radio.enabled?'checked':''}> 启用</label><div class="fields"><label>信道<input type="number" data-radio="${i}" data-key="channel" min="1" max="196" step="1" value="${radio.channel}"></label><label>带宽 MHz<select data-radio="${i}" data-key="width">${[20,40,80].filter(w=>radio.band==='5'||w<=40).map(w=>`<option value="${w}" ${radio.width===w?'selected':''}>${w}</option>`).join('')}</select></label><label>EIRP dBm<input type="number" data-radio="${i}" data-key="eirp" min="0" max="36" step="1" value="${radio.eirp}"></label></div></div>`).join('')}
        <p class="hint">EIRP 为示意值；请按当地法规、天线和实际设备配置核验。室外机型的天线方向图未模拟。终端数仅用于记录，不构成容量保证。</p>`;
      return;
    }
    if(selected?.kind==='wall'&&item){$('detailTitle').textContent='墙体参数';detail.innerHTML=`<label>墙体类型<select data-wall="type">${Object.entries(M.WALLS).map(([type,w])=>`<option value="${type}" ${item.type===type?'selected':''}>${w.label} · ${w.loss24}/${w.loss5} dB</option>`).join('')}</select></label><p class="hint">拖动端点附近可重画墙体；删除后可重新绘制。墙体衰减为演示假设，不是测量值。</p>`;return;}
    $('detailTitle').textContent='位置探针';if(!probe){detail.textContent='点击平面图任意位置查看该点预测信号；也可选择 AP 调整射频参数。';return;}const s=M.signalAt(plan,probe.x,probe.y);detail.innerHTML=`<div class="probe"><strong>${s.best?`${escapeHtml(s.best.apName)} · ${s.best.rssi.toFixed(1)} dBm`:'该频段无信号'}</strong><p class="hint">${(probe.x*plan.widthM).toFixed(1)} m × ${(probe.y*plan.heightM).toFixed(1)} m ${s.best?`· SNR ${s.snr.toFixed(1)} dB · 信道 ${s.best.channel}`:''}</p></div>${s.signals.slice(0,6).map(r=>`<p>${escapeHtml(r.apName)} · ${r.channel} 信道 · ${r.rssi.toFixed(1)} dBm</p>`).join('')}`;
  }
  function hitAp(p){const radius=18/Math.max(overlay.clientWidth,overlay.clientHeight);return plan.aps.findLast(a=>Math.hypot((a.x-p.x)*overlay.clientWidth,(a.y-p.y)*overlay.clientHeight)<Math.max(18,radius*overlay.clientWidth));}
  function hitWall(p){let best=null,dist=Infinity;for(const w of plan.walls){const ax=px(w.x1),ay=py(w.y1),bx=px(w.x2),by=py(w.y2),cx=px(p.x),cy=py(p.y);const t=M.clamp(((cx-ax)*(bx-ax)+(cy-ay)*(by-ay))/Math.max(1,(bx-ax)**2+(by-ay)**2),0,1);const d=Math.hypot(cx-(ax+t*(bx-ax)),cy-(ay+t*(by-ay)));if(d<10&&d<dist){best=w;dist=d;}}return best;}
  overlay.addEventListener('pointerdown',event=>{const p=point(event);overlay.setPointerCapture(event.pointerId);if(tool==='ap'){if(plan.aps.length>=20)return status('最多 20 个 AP；请先删减。',true);const model=$('profile').value;const ap=M.makeAp(model,p.x,p.y,`${M.PROFILES[model].vendor} AP-${plan.aps.length+1}`);plan.aps.push(ap);selected={kind:'ap',id:ap.id};probe=null;renderDetail();redraw();return;}if(tool==='route'){if(plan.route.length>=40)return status('路径点最多 40 个。',true);plan.route.push(p);redraw();return;}if(tool==='wall'){if(plan.walls.length>=60)return status('最多绘制 60 段墙。',true);draft={x1:p.x,y1:p.y,x2:p.x,y2:p.y};redraw(false);return;}const ap=hitAp(p),wall=ap?null:hitWall(p);if(ap){selected={kind:'ap',id:ap.id};dragging=true;stage.classList.add('moving');probe=null;}else if(wall){selected={kind:'wall',id:wall.id};probe=null;}else{selected=null;probe=p;}renderDetail();redraw(false);});
  overlay.addEventListener('pointermove',event=>{const p=point(event);if(draft){draft.x2=p.x;draft.y2=p.y;redraw(false);}else if(dragging&&selected?.kind==='ap'){const ap=plan.aps.find(a=>a.id===selected.id);if(ap){ap.x=p.x;ap.y=p.y;redraw(false);}}});
  function finishPointer(){if(draft){const distance=Math.hypot((draft.x2-draft.x1)*plan.widthM,(draft.y2-draft.y1)*plan.heightM);if(distance>.3){const wall=M.makeWall($('wallType').value,draft.x1,draft.y1,draft.x2,draft.y2);plan.walls.push(wall);selected={kind:'wall',id:wall.id};}draft=null;renderDetail();redraw();}if(dragging){dragging=false;stage.classList.remove('moving');renderDetail();redraw();}}
  overlay.addEventListener('pointerup',finishPointer);overlay.addEventListener('pointercancel',finishPointer);
  document.querySelectorAll('[data-tool]').forEach(button=>button.addEventListener('click',()=>{tool=button.dataset.tool;document.querySelectorAll('[data-tool]').forEach(b=>{const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active?'true':'false');});$('modeHint').textContent={select:'拖动 AP 调整位置，点击空白处查看信号。',ap:'点击平面图放置一台所选参考机型 AP。',wall:'按住并拖动绘制一段墙；按右侧类型计算衰减。',route:'按经过顺序点击路径点；使用“清空路径”重新开始。'}[tool];}));
  $('deleteSelected').addEventListener('click',()=>{if(!selected)return;const list=selected.kind==='ap'?plan.aps:plan.walls;const index=list.findIndex(item=>item.id===selected.id);if(index>=0)list.splice(index,1);selected=null;renderDetail();redraw();});$('clearRoute').addEventListener('click',()=>{plan.route=[];redraw();});
  $('detail').addEventListener('change',event=>{
    const target=event.target;
    if(selected?.kind==='wall'&&target.dataset.wall){const wall=plan.walls.find(w=>w.id===selected.id);if(wall&&M.WALLS[target.value])wall.type=target.value;redraw();return;}
    const ap=plan.aps.find(a=>a.id===selected?.id);if(!ap)return;
    if(target.dataset.field==='profileId'){if(!M.PROFILES[target.value])return;ap.profileId=target.value;ap.mode=M.PROFILES[target.value].modes[0];ap.radios=M.radiosFor(ap.profileId,ap.mode);ap.radiusM=M.PROFILES[target.value].radiusM;renderDetail();redraw();return;}
    if(target.dataset.field==='mode'){ap.mode=target.value;ap.radios=M.radiosFor(ap.profileId,ap.mode);renderDetail();redraw();return;}
    if(target.dataset.field==='name')ap.name=target.value.trim().slice(0,36)||'未命名 AP';
    if(target.dataset.field==='height')ap.height=finite(target.value,2.7,1,10);
    if(target.dataset.field==='radiusM')ap.radiusM=finite(target.value,20,1,200);
    if(target.dataset.field==='clients')ap.clients=finite(target.value,0,0,500);
    if(target.dataset.field==='x')ap.x=finite(target.value,ap.x*plan.widthM,0,plan.widthM)/plan.widthM;
    if(target.dataset.field==='y')ap.y=finite(target.value,ap.y*plan.heightM,0,plan.heightM)/plan.heightM;
    if(target.dataset.radio!==undefined){const radio=ap.radios[Number(target.dataset.radio)];if(radio){const key=target.dataset.key;if(key==='enabled')radio.enabled=target.checked;if(key==='channel')radio.channel=finite(target.value,radio.channel,1,196);if(key==='width')radio.width=finite(target.value,radio.width,20,80);if(key==='eirp')radio.eirp=finite(target.value,radio.eirp,0,36);}}
    renderDetail();redraw();
  });
  $('apSelector').addEventListener('change',event=>{selected=event.target.value?{kind:'ap',id:event.target.value}:null;probe=null;renderDetail();redraw(false);});
  $('scenario').addEventListener('change',event=>{const previous=event.target.dataset.previous||'office';if(!confirm('切换场景会替换当前方案。是否继续？')){event.target.value=previous;return;}event.target.dataset.previous=event.target.value;let switched=false;if(event.target.value==='outdoor'&&!M.PROFILES[$('profile').value].scene.startsWith('室外')){const vendor=M.PROFILES[$('profile').value].vendor;const outdoor=Object.entries(M.PROFILES).find(([,p])=>p.vendor===vendor&&p.scene.startsWith('室外'));if(outdoor){$('profile').value=outdoor[0];renderProfileHint();switched=true;}}plan=M.scenario(event.target.value,$('profile').value);selected=null;probe=null;syncInputs();status(switched?'已载入虚构室外场景，并切换到同品牌室外参考机型。':'已载入虚构示例场景。');});
  for(const id of ['widthM','heightM'])$(id).addEventListener('change',event=>{plan[id]=finite(event.target.value,plan[id],5,200);event.target.value=plan[id];redraw();});
  for(const id of ['band','view'])$(id).addEventListener('change',event=>{plan.settings[id]=event.target.value;renderDetail();redraw();});
  for(const id of ['threshold','noise','exponent','hysteresis'])$(id).addEventListener('change',event=>{const limits={threshold:[-95,-40],noise:[-110,-60],exponent:[2,4],hysteresis:[0,15]};plan.settings[id]=finite(event.target.value,plan.settings[id],...limits[id]);event.target.value=plan.settings[id];renderDetail();redraw();});
  for(const id of ['showHeat','showGrid','showLabels','showRadius'])$(id).addEventListener('change',event=>{plan.settings[id]=event.target.checked;redraw();});
  $('imageInput').addEventListener('change',async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024)return status('仅支持 8 MB 以下的 PNG、JPEG、WebP 图纸。',true);const reader=new FileReader();reader.onload=()=>{plan.imageData=String(reader.result);renderImage();redraw(false);scheduleSave();status('本地图纸已叠加。建议设置实际尺寸并对齐 AP 与墙体。');};reader.readAsDataURL(file);});
  $('clearImage').addEventListener('click',()=>{plan.imageData='';renderImage();scheduleSave();status('已从当前方案移除图纸。');});
  $('exportJson').addEventListener('click',()=>download('wireless-plan.json',new Blob([JSON.stringify(plan,null,2)],{type:'application/json'})));
  function restore(raw){
    if(!raw||raw.version!==1||!Array.isArray(raw.aps)||!Array.isArray(raw.walls)||!Array.isArray(raw.route)||raw.aps.length>20||raw.walls.length>60||raw.route.length>40)throw Error('方案结构或数量不受支持');
    const base=M.scenario('blank');base.title=String(raw.title||'恢复方案').slice(0,80);base.defaultProfileId=M.PROFILES[raw.defaultProfileId]?raw.defaultProfileId:'cisco9120';base.widthM=finite(raw.widthM,30,5,200);base.heightM=finite(raw.heightM,18,5,200);
    if(raw.imageData){if(typeof raw.imageData!=='string'||!/^data:image\/(png|jpeg|webp);base64,/.test(raw.imageData)||raw.imageData.length>12_000_000)throw Error('图纸格式或大小不受支持');base.imageData=raw.imageData;}
    const num01=value=>finite(value,0,0,1);
    base.aps=raw.aps.map((a,i)=>{
      const id=M.PROFILES[a.profileId]?a.profileId:'cisco9120';
      const ap=M.makeAp(id,num01(a.x),num01(a.y),String(a.name||`AP-${i+1}`).slice(0,36),a.mode);
      ap.height=finite(a.height,2.7,1,10);ap.radiusM=finite(a.radiusM,M.PROFILES[id].radiusM,1,200);ap.clients=finite(a.clients,20,0,500);
      if(Array.isArray(a.radios))ap.radios.forEach((r,index)=>{const input=a.radios[index]||{};r.channel=finite(input.channel,r.channel,1,196);r.width=[20,40,80].includes(Number(input.width))?Number(input.width):r.width;r.eirp=finite(input.eirp,r.eirp,0,36);r.enabled=input.enabled!==false;});
      return ap;
    });
    base.walls=raw.walls.map(w=>M.makeWall(w.type,num01(w.x1),num01(w.y1),num01(w.x2),num01(w.y2)));
    base.route=raw.route.map(p=>({x:num01(p.x),y:num01(p.y)}));
    const s=raw.settings||{};
    for(const id of ['threshold','noise','exponent','hysteresis']){const limits={threshold:[-95,-40],noise:[-110,-60],exponent:[2,4],hysteresis:[0,15]};base.settings[id]=finite(s[id],base.settings[id],...limits[id]);}
    if(['2.4','5'].includes(s.band))base.settings.band=s.band;if(['rssi','snr','interference'].includes(s.view))base.settings.view=s.view;
    for(const id of ['showHeat','showGrid','showLabels','showRadius'])base.settings[id]=s[id]!==false;
    return base;
  }
  $('importJson').addEventListener('change',async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;if(file.size>13*1024*1024)return status('方案文件过大。',true);try{const next=restore(JSON.parse(await file.text()));if(!confirm('恢复方案会替换当前页面的布局。是否继续？'))return;plan=next;selected=null;probe=null;syncInputs();status('方案已在当前页面恢复。');}catch(error){status(`恢复失败：${error.message}`,true);}});
  $('exportPng').addEventListener('click',()=>{const canvas=document.createElement('canvas');canvas.width=overlay.width;canvas.height=overlay.height;const ctx=canvas.getContext('2d');ctx.fillStyle='#0c2330';ctx.fillRect(0,0,canvas.width,canvas.height);try{if(!floorplan.hidden)ctx.drawImage(floorplan,0,0,canvas.width,canvas.height);ctx.drawImage(heat,0,0);ctx.drawImage(overlay,0,0);canvas.toBlob(blob=>blob?download('wireless-plan.png',blob):status('PNG 生成失败。',true),'image/png');}catch{status('图纸尚未加载完成，请稍后再下载。',true);}});
  $('profile').innerHTML=profileOptions('cisco9120');
  $('profile').addEventListener('change',()=>{plan.defaultProfileId=$('profile').value;renderProfileHint();scheduleSave();});
  renderProfileHint();
  $('profileSources').innerHTML=Object.values(M.PROFILES).map(p=>`<a href="${p.source}" target="_blank" rel="noopener noreferrer"><strong>${escapeHtml(p.vendor)} ${escapeHtml(p.label)}</strong><small>${escapeHtml(p.scene)} · ${escapeHtml(p.detail)}</small><small>官方产品资料 ↗</small></a>`).join('');
  function loadSavedPlan(){if(!('indexedDB' in window)){status('当前浏览器不支持本地自动保存，请使用 JSON 备份。',true);return;}const request=indexedDB.open('yanjian-wireless-plan',1);request.onupgradeneeded=()=>request.result.createObjectStore('plans');request.onerror=()=>status('本地保存不可用，请使用 JSON 备份。',true);request.onsuccess=()=>{db=request.result;const read=db.transaction('plans','readonly').objectStore('plans').get('current');read.onsuccess=()=>{if(read.result){try{plan=restore(read.result);selected=null;probe=null;syncInputs();status('已从当前浏览器恢复上次方案。');}catch{status('本地方案损坏；已载入示例，请检查 JSON 备份。',true);}}saveReady=true;};read.onerror=()=>{saveReady=true;status('读取本地方案失败，请使用 JSON 备份。',true);};};}
  new ResizeObserver(()=>redraw()).observe(stage);syncInputs();loadSavedPlan();
  window.ScenarioCompare.mount({
    id: 'wireless-coverage', after: '.setup', maxBackupBytes: 28 * 1024 * 1024,
    get: () => plan,
    validate: restore,
    apply: value => { plan = restore(value); selected = null; probe = null; syncInputs(); status('已载入 A/B 方案；原保存快照未改变。'); },
    metrics: value => {
      const c = M.coverage(value), warnings = M.channelWarnings(value);
      return [
        {label:'门限覆盖', value:c.coveredPct, unit:'%', display:`${c.coveredPct}%`},
        {label:'双 AP 覆盖', value:c.overlapPct, unit:'%', display:`${c.overlapPct}%`},
        {label:'AP 数', value:value.aps.length, unit:'台', display:`${value.aps.length} 台`},
        {label:'近邻同频风险对', value:warnings.length, unit:'对', display:`${warnings.length} 对`},
        {label:'隔墙段数', value:value.walls.length, unit:'段', display:`${value.walls.length} 段`},
      ];
    },
    assumptions: value => `${value.widthM} × ${value.heightM} 米，${value.settings.band} GHz，RSSI 门限 ${value.settings.threshold} dBm，路径损耗指数 ${value.settings.exponent}；${value.imageData?'含本地图纸（A/B 备份会一并包含）':'不含图纸'}。`,
    formatDelta: (delta, suffix) => `${delta.toLocaleString('zh-CN',{maximumFractionDigits:1})} ${suffix}`,
    caution: '对比结果来自同一简化传播模型，只供方案预演；覆盖比例、同频风险与漫游效果必须通过现场勘测验证。'
  });
})();
