(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const button = $('#view-room3d');
  let modulePromise, view, overlay, previousFocus, state, racks, selectedId, selectedDeviceId=null, walking=false, arranging=false, structuring=false, relocatingId=null, placementMode='rack', autoSpacing=true, restoreSpacingAfterArrange=false, planVisible=false,planBeforeWalk=false,editPlanRestore=null,planOpacity=.6,mapCollapsed=false;
  let layers={occupancy:true,power:true,facilities:true,aisles:true,heat:true,airflow:true},cameraMode='总览视角';

  function createOverlay() {
    const root = document.createElement('section');
    root.className = 'room3d';
    root.setAttribute('role','dialog');
    root.setAttribute('aria-modal','true');
    root.setAttribute('aria-label','3D 机房视图');
    root.innerHTML = `
      <header class="room3d-head"><div><span class="room3d-kicker">LOCAL ROOM · 3D VIEW</span><h2>3D 机房</h2><p>本地平面图与机柜定位 · 不连接设备 · 非实时监控</p></div>
        <div class="room3d-actions"><button type="button" data-action="plan">布局校准</button><button type="button" data-action="plan-layer" title="在简洁地板上叠加或隐藏本机图纸">图纸叠加：关</button><button type="button" data-action="spacing" title="默认开启；仅在 3D 中等距对齐同排机柜，不修改图纸点位或备份">自动间距：开</button><button type="button" data-action="arrange">摆放机柜</button><button type="button" data-action="structure">布置隔断/设施</button><button type="button" data-action="walk">从入口漫游</button><button type="button" data-action="layers" aria-expanded="false">图层与视角</button><button type="button" data-action="close">退出 3D</button></div></header>
      <div class="room3d-main"><div class="room3d-stage" aria-label="可旋转或步行漫游的 3D 机房视图">
          <div class="room3d-compass" aria-live="off"><div class="room3d-compass-rose"><span class="room3d-compass-n">N</span><span class="room3d-compass-needle">▲</span></div><strong id="room3d-heading">方位待校准</strong><small id="room3d-viewmode">总览视角</small></div>
          <section class="room3d-layer-panel" hidden aria-label="3D 图层与视角"><strong>视角</strong><div class="room3d-view-buttons"><button type="button" data-action="reset">总览</button><button type="button" data-action="top">俯视</button><button type="button" data-action="entrance">入口</button><button type="button" data-action="selected">当前机柜</button></div><strong>图层</strong><label><input type="checkbox" data-layer="occupancy" checked>机柜占用率</label><label><input type="checkbox" data-layer="power" checked>功耗估算（相对值）</label><label><input type="checkbox" data-layer="facilities" checked>设施模型</label><label><input type="checkbox" data-layer="aisles" checked>通道标识</label><label><input type="checkbox" data-layer="heat" checked>热场示意</label><label><input type="checkbox" data-layer="airflow" checked>气流粒子</label><p id="room3d-layer-note">功耗条按手填功率相对比较；热场按功耗或设备数量绘制；气流仅是动效，均非实时监测或 CFD 仿真。</p></section>
          <section class="room3d-structure-panel" hidden aria-label="3D 隔断与设施布置"><strong>隔断与设施</strong><p>隔断点两下定两端；其他设施点一下放置。防火门请放在预留的通道位置，模型仅作示意。</p><label>类型<select id="room3d-structure-kind"><optgroup label="空间"><option value="glass">玻璃隔断</option><option value="solid">实体隔墙</option><option value="area">区域名称</option></optgroup><optgroup label="家具与标识"><option value="desk">办公桌</option><option value="entrysign">入口指示牌</option><option value="firedoor">防火门</option></optgroup><optgroup label="机房设施"><option value="power">配电柜</option><option value="ups">UPS</option><option value="battery">UPS 长排电池架</option><option value="gas">七氟丙烷气瓶组</option><option value="cooling">精密空调</option></optgroup></select></label><label>名称（区域必填，其余可选）<input id="room3d-structure-label" type="text" maxlength="40" placeholder="由你填写，不预置真实机房信息"></label><label id="room3d-structure-turn-label" hidden>正面朝向<select id="room3d-structure-turn"><option value="0">图纸下方</option><option value="90">图纸右方</option><option value="180">图纸上方</option><option value="270">图纸左方</option></select></label><div id="room3d-battery-fields" class="room3d-equipment-fields" hidden><label>沿长度列数<input id="room3d-battery-cols" type="number" min="1" max="32" value="16"></label><label>进深排数<input id="room3d-battery-rows" type="number" min="1" max="6" value="4"></label><label>层数（常见 2～3）<input id="room3d-battery-levels" type="number" min="1" max="10" value="2"></label><label>实际电池节数<input id="room3d-battery-count" type="number" min="1" max="256" value="128"></label><small id="room3d-battery-total">长排布局：2 层，架位 128 节，实际 128 节</small></div><label id="room3d-gas-count-label" hidden>气瓶数量（1～8）<input id="room3d-gas-count" type="number" min="1" max="8" value="1"></label><p id="room3d-equipment-note" hidden>仅作空间摆放示意，不能用于承重、间距、消防设计或设备选型。</p><div class="room3d-structure-actions"><button type="button" id="room3d-structure-cancel">取消当前起点</button><button type="button" id="room3d-structure-done">完成布置</button></div><p id="room3d-structure-status" role="status"></p><div id="room3d-structure-list" class="room3d-structure-list"></div></section>
          <div class="room3d-minimap" hidden aria-label="点击本机平面图小地图可选择漫游目标"><img id="room3d-minimap-image" alt="你在此浏览器导入的平面图"><span id="room3d-minimap-position" aria-hidden="true">▲</span><button type="button" id="room3d-minimap-collapse">收起地图</button></div><button type="button" id="room3d-minimap-expand" hidden>打开地图</button>
          <div class="room3d-walkpad" hidden aria-label="漫游方向控制"><button type="button" data-move="forward">↑</button><div><button type="button" data-move="left">←</button><button type="button" data-move="back">↓</button><button type="button" data-move="right">→</button></div></div>
        </div><aside class="room3d-side"><div class="room3d-side-head"><strong>机柜 / 设备定位</strong><span id="room3d-count"></span></div><label class="room3d-search">查找机柜或设备<input id="room3d-search" type="search" placeholder="机柜、设备、资产编号、IP…" maxlength="100"></label>
          <div id="room3d-list" class="room3d-list"></div><div id="room3d-info" class="room3d-info"></div><p class="room3d-notice">拖动或手机单指转向，滚轮/触摸板调整视野；点击空地前往，点击机柜或设施看信息。方向键和屏幕箭头仅作为补充。模型与灯效不是实时监控。</p></aside></div>
      <section class="room3d-calibrate" hidden aria-label="本地机房平面图校准"><div class="room3d-map-area"><div class="room3d-map-head"><div><span class="room3d-kicker">PRIVATE FLOOR PLAN</span><h3>把机柜放回真实平面</h3><p>选择机柜，再点击图纸上的位置。图纸仅在此浏览器处理；未上传网站。</p></div><button type="button" data-action="finish-plan">完成校准</button></div>
          <div id="room3d-map" class="room3d-map"><img id="room3d-map-image" alt="用户在本地导入的机房平面图" hidden><div id="room3d-markers"></div><p id="room3d-map-empty">尚未导入平面图。请选择你自己的图片，网站没有内置真实机房资料。</p></div><p id="room3d-map-caption" class="room3d-map-caption"></p></div>
        <aside class="room3d-plan-controls"><h3>平面图与方位</h3><p class="room3d-privacy">可导入 JPG、PNG 或 WebP；浏览器会去除图片元数据并压缩后保存在本机。完整备份会包含图纸，请勿公开分享。</p>
          <label class="room3d-upload">选择本地平面图<input id="room3d-plan-file" type="file" accept="image/jpeg,image/png,image/webp"></label>
          <label>当前要定位的机柜<select id="room3d-plan-rack"></select></label><button type="button" id="room3d-clear-position">清除此机柜定位</button>
          <div class="room3d-fields"><label>示意宽度（米）<input id="room3d-width" type="number" min="0" max="60" step="1"></label><label>示意深度（米）<input id="room3d-depth" type="number" min="0" max="60" step="1"></label></div>
          <p class="room3d-field-help">尺寸只决定 3D 显示比例，并非测量结果；0 表示按机柜排位自动计算。若机柜在图上挤成一团，请先核对机房宽度和点位。</p>
          <label>3D 机柜显示宽度 <output id="room3d-rack-scale-value"></output><input id="room3d-rack-scale" type="range" min="35" max="100" step="5"></label><p class="room3d-field-help">只缩小柜体模型，不更改你手工标注的中心坐标、楼层图和备份点位。</p>
          <label>图纸上方实际朝向<select id="room3d-north"><option value="">尚未确认（不显示东南西北）</option><option value="north">北</option><option value="east">东</option><option value="south">南</option><option value="west">西</option></select></label>
          <div class="room3d-door-controls"><strong>机房入口</strong><p>点击“在图上指定入口”，再点击实际门的位置；建议点在可通行区域。</p><div class="room3d-door-actions"><button type="button" id="room3d-place-entry">在图上指定入口</button><button type="button" id="room3d-clear-entry">恢复边缘入口</button></div>
          <label>从门进入时面朝图纸方向<select id="room3d-entry-facing"><option value="up">上方</option><option value="right">右方</option><option value="down">下方</option><option value="left">左方</option></select></label><p id="room3d-entry-status" class="room3d-field-help"></p></div>
          <div id="room3d-edge-entry-controls"><p class="room3d-field-help">未在图上指定时，使用以下边缘入口：</p><label>入口位于图纸哪侧<select id="room3d-entrance"><option value="top">上侧</option><option value="right">右侧</option><option value="bottom">下侧</option><option value="left">左侧</option></select></label>
          <label>入口沿该侧的位置 <output id="room3d-entry-value"></output><input id="room3d-entry-at" type="range" min="5" max="95" step="1"></label></div>
          <button type="button" id="room3d-remove-plan">移除本机平面图</button><p id="room3d-plan-status" role="status"></p>
        </aside></section>
      <div class="room3d-bottom"><span id="room3d-help">拖动旋转 · 滚轮 / 双指缩放 · 点击机柜查看设备</span><label id="room3d-opacity-wrap" hidden>图纸显示强度 <output id="room3d-opacity-value">60%</output><input id="room3d-opacity" type="range" min="15" max="95" value="60" aria-label="图纸显示强度"></label><span id="room3d-message" role="status"></span></div>`;
    document.body.append(root);
    root.querySelector('[data-action="close"]').onclick=close;
    root.querySelector('[data-action="reset"]').onclick=()=>{view?.reset();cameraMode='总览视角';setWalking(false)};
    root.querySelector('[data-action="top"]').onclick=()=>{view?.top();cameraMode='俯视视角';setWalking(false)};
    root.querySelector('[data-action="entrance"]').onclick=()=>{view?.entrance();cameraMode='入口视角';setWalking(false)};
    root.querySelector('[data-action="selected"]').onclick=()=>{if(selectedDeviceId)view?.focusDevice(selectedDeviceId);else if(selectedId)view?.focus(selectedId);else {$('#room3d-message').textContent='请先选择一个机柜或设备。';return}cameraMode='机柜视角'};
    root.querySelector('[data-action="layers"]').onclick=()=>{const panel=root.querySelector('.room3d-layer-panel');panel.hidden=!panel.hidden;root.querySelector('[data-action="layers"]').setAttribute('aria-expanded',String(!panel.hidden))};
    for(const input of root.querySelectorAll('[data-layer]'))input.onchange=()=>{layers[input.dataset.layer]=input.checked;syncLayers()};
    root.querySelector('[data-action="plan-layer"]').onclick=()=>setPlanLayer(!planVisible);
    root.querySelector('#room3d-opacity').oninput=event=>{planOpacity=Number(event.target.value)/100;root.querySelector('#room3d-opacity-value').textContent=event.target.value+'%';view?.setPlanVisible(planVisible,planOpacity)};
    root.querySelector('#room3d-minimap-collapse').onclick=()=>{mapCollapsed=true;syncMinimap()};
    root.querySelector('#room3d-minimap-expand').onclick=()=>{mapCollapsed=false;syncMinimap()};
    root.querySelector('.room3d-minimap').onclick=event=>{if(event.target.closest('button'))return;const rect=event.currentTarget.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width,y=(event.clientY-rect.top)/rect.height;view?.walkToNormalized(x,y)};
    root.querySelector('[data-action="walk"]').onclick=()=>{if(!view)return;if(structuring)setStructuring(false);if(arranging)setArranging(false);setWalking(view.toggleWalk())};
    root.querySelector('[data-action="arrange"]').onclick=()=>{if(structuring)setStructuring(false);setArranging(!arranging)};
    root.querySelector('[data-action="structure"]').onclick=()=>setStructuring(!structuring);
    root.querySelector('[data-action="spacing"]').onclick=()=>{if(structuring)setStructuring(false);if(arranging)setArranging(false);autoSpacing=!autoSpacing;root.querySelector('[data-action="spacing"]').textContent=`自动间距：${autoSpacing?'开':'关'}`;initView();showSpacingMessage()};
    root.querySelector('[data-action="plan"]').onclick=()=>{if(structuring)setStructuring(false);togglePlan(true)};
    root.querySelector('[data-action="finish-plan"]').onclick=()=>togglePlan(false);
    root.querySelector('#room3d-structure-kind').onchange=event=>{relocatingId=null;view?.structureMode(event.target.value);syncStructureKind();root.querySelector('#room3d-structure-status').textContent=['glass','solid'].includes(event.target.value)?'请在地面点击隔断的起点和终点。':'请在地面点击放置位置。'};
    for(const id of ['room3d-battery-cols','room3d-battery-rows','room3d-battery-levels'])root.querySelector('#'+id).oninput=()=>{const capacity=Number($('#room3d-battery-cols').value)*Number($('#room3d-battery-rows').value)*Number($('#room3d-battery-levels').value);if(Number.isInteger(capacity)&&capacity>0&&Number($('#room3d-battery-count').value)>capacity)$('#room3d-battery-count').value=String(capacity);updateBatteryTotal()};
    root.querySelector('#room3d-battery-count').oninput=updateBatteryTotal;
    root.querySelector('#room3d-structure-cancel').onclick=()=>{relocatingId=null;view?.cancelStructureDraft();root.querySelector('#room3d-structure-status').textContent='已取消当前起点或移动操作。'};
    root.querySelector('#room3d-structure-done').onclick=()=>setStructuring(false);
    for(const key of ['forward','left','back','right']){
      const control=root.querySelector(`[data-move="${key}"]`);
      control.onpointerdown=event=>{event.preventDefault();control.setPointerCapture(event.pointerId);view?.setMove(key,true)};
      control.onpointerup=control.onpointercancel=()=>view?.setMove(key,false);
    }
    syncStructureKind();
    return root;
  }

  function updateBatteryTotal(){const cols=Number($('#room3d-battery-cols').value),rows=Number($('#room3d-battery-rows').value),levels=Number($('#room3d-battery-levels').value),count=Number($('#room3d-battery-count').value),capacity=cols*rows*levels;$('#room3d-battery-total').textContent=Number.isInteger(capacity)&&capacity>0&&capacity<=256&&Number.isInteger(count)&&count>=1&&count<=capacity?`长排布局：${levels} 层，架位 ${capacity} 节，实际 ${count} 节（请按实物调整）`:'请检查列、排、层和节数：实际节数不能超过架位容量 256 节'}
  function syncStructureKind(){const kind=$('#room3d-structure-kind')?.value;const label=$('#room3d-structure-turn-label');if(label)label.hidden=['glass','solid','area'].includes(kind);$('#room3d-battery-fields').hidden=kind!=='battery';$('#room3d-gas-count-label').hidden=kind!=='gas';$('#room3d-equipment-note').hidden=!['battery','gas'].includes(kind);updateBatteryTotal()}
  function setPlanLayer(value){
    if(!overlay)return;
    planVisible=!!value&&!!view?.hasPlan();
    view?.setPlanVisible(planVisible,planOpacity);
    const action=overlay.querySelector('[data-action="plan-layer"]');action.disabled=!view?.hasPlan();action.textContent=`图纸叠加：${planVisible?'开':'关'}`;action.classList.toggle('active',planVisible);
    $('#room3d-opacity-wrap').hidden=!planVisible;
  }
  function syncLayers(){
    if(!overlay||!view)return;
    const availability=view.setLayers(layers);
    const heat=overlay.querySelector('[data-layer="heat"]');
    heat.disabled=!availability.heatAvailable;
    if(!availability.heatAvailable)heat.checked=false;
    $('#room3d-layer-note').textContent=availability.heatAvailable?'功耗条按手填功率相对比较；热场按功耗或设备数量绘制；气流仅是动效，均非实时监测或 CFD 仿真。':'尚无已登记设备，热场暂不显示；气流仅是示意动效，非实时监测或 CFD 仿真。';
  }
  function syncMinimap(){
    if(!overlay)return;
    const available=walking&&!!state?.room?.plan;
    overlay.querySelector('.room3d-minimap').hidden=!available||mapCollapsed;
    $('#room3d-minimap-expand').hidden=!available||!mapCollapsed;
  }
  function setWalking(value){
    const wasWalking=walking;walking=!!value;
    if(walking&&!wasWalking){planBeforeWalk=planVisible;setPlanLayer(false);mapCollapsed=false}
    else if(!walking&&wasWalking)setPlanLayer(planBeforeWalk);
    const action=overlay?.querySelector('[data-action="walk"]');if(action)action.textContent=walking?'退出漫游':'从入口漫游';
    const pad=overlay?.querySelector('.room3d-walkpad');if(pad)pad.hidden=!walking;
    syncMinimap();
    const help=$('#room3d-help');if(help)help.textContent=walking?'拖动 / 单指自由转向 · 滚轮调整视野 · 点击地面或小地图前往 · 点击模型查看':'拖动旋转 · 滚轮 / 双指缩放 · 点击机柜或设施查看';
  }
  function renderStructureList(){
    if(!overlay)return;
    const list=$('#room3d-structure-list');list.replaceChildren();
    const structures=window.RackApp.state().room.structures||[];
    for(const item of structures){
      const row=document.createElement('div'),label=document.createElement('span'),actions=document.createElement('div'),move=document.createElement('button'),remove=document.createElement('button');
      row.className='room3d-structure-item';label.textContent=`${{glass:'玻璃隔断',solid:'实体隔墙',area:'区域',desk:'办公桌',entrysign:'入口指示牌',firedoor:'防火门',power:'配电柜',ups:'UPS',battery:'UPS 长排电池架',gas:'七氟丙烷气瓶组',cooling:'精密空调'}[item.type]}${item.type==='battery'?` · ${item.cols}列×${item.rows}排×${item.levels}层 · ${item.count}节`:item.type==='gas'?` · ${item.count} 瓶`:''}${item.label?' · '+item.label:''}`;
      actions.className='room3d-structure-item-actions';move.type='button';move.textContent='移动';move.setAttribute('aria-label',`移动${label.textContent}`);
      move.onclick=()=>{relocatingId=item.id;$('#room3d-structure-kind').value=item.type;$('#room3d-structure-label').value=item.label||'';$('#room3d-structure-turn').value=String(item.turn||0);if(item.type==='battery'){for(const field of ['cols','rows','levels','count'])$('#room3d-battery-'+field).value=item[field]}if(item.type==='gas')$('#room3d-gas-count').value=item.count;syncStructureKind();view?.structureMode(item.type);$('#room3d-structure-status').textContent=['glass','solid'].includes(item.type)?'重新点击隔断的起点和终点，保留名称。':item.type==='battery'?'可改列、排、层和节数，再点击地面；点原位置可只调整架子形状。':'点击新的位置，保留名称和朝向。'};
      remove.type='button';remove.textContent='删除';remove.setAttribute('aria-label',`删除${label.textContent}`);
      remove.onclick=()=>{if(!window.confirm(`删除“${label.textContent}”？此操作会修改当前浏览器的机房布置。`))return;try{const room=window.RackApp.state().room;window.RackApp.setRoom({...room,structures:(room.structures||[]).filter(entry=>entry.id!==item.id)});view?.removeStructure(item.id);if(relocatingId===item.id)relocatingId=null;renderStructureList();$('#room3d-structure-status').textContent='已从本机布置中删除。'}catch(error){$('#room3d-structure-status').textContent='删除失败：'+error.message}};
      actions.append(move,remove);row.append(label,actions);list.append(row);
    }
    if(!structures.length){const empty=document.createElement('p');empty.textContent='尚未布置隔断或设施。';list.append(empty)}
  }
  function addStructure(candidate){
    const status=$('#room3d-structure-status'),label=$('#room3d-structure-label').value.trim();
    if(candidate.type==='area'&&!label){status.textContent='请先填写区域名称，再点击地面。';return}
    try{
      const room=window.RackApp.state().room,old=(room.structures||[]).find(entry=>entry.id===relocatingId),item={id:old?.id||crypto.randomUUID(),label,...candidate};
      if(candidate.type==='battery')for(const field of ['cols','rows','levels','count'])item[field]=Number($('#room3d-battery-'+field).value);
      if(candidate.type==='gas')item.count=Number($('#room3d-gas-count').value);
      window.RackApp.setRoom({...room,structures:old?room.structures.map(entry=>entry.id===old.id?item:entry):[...(room.structures||[]),item]});
      if(old)view?.removeStructure(old.id);
      view?.addStructure(item);relocatingId=null;renderStructureList();
      const saveState=$('#save-status').textContent;status.textContent=saveState.startsWith('已保存')?'已保存到此浏览器；模型仅作空间示意。':'已更新当前页面；'+saveState;
    }catch(error){status.textContent='保存失败：'+error.message}
  }
  function setStructuring(value){
    if(!view||!overlay)return;
    if(value&&arranging)setArranging(false);
    if(value&&walking)setWalking(view.toggleWalk());
    if(value&&!structuring&&view.hasPlan()){editPlanRestore=planVisible;setPlanLayer(true)}
    structuring=view.structureMode(value?$('#room3d-structure-kind').value:null);
    if(!structuring){relocatingId=null;if(editPlanRestore!==null){setPlanLayer(editPlanRestore);editPlanRestore=null}}
    const action=overlay.querySelector('[data-action="structure"]');action.textContent=structuring?'完成布置':'布置隔断/设施';action.classList.toggle('active',structuring);
    overlay.querySelector('.room3d-structure-panel').hidden=!structuring;
    if(structuring){overlay.querySelector('.room3d-layer-panel').hidden=true;overlay.querySelector('[data-action="layers"]').setAttribute('aria-expanded','false')}
    $('#room3d-help').textContent=structuring?'隔断点两次 · 设施与区域点一次 · 名称和位置仅在本机':'拖动旋转 · 滚轮 / 双指缩放 · 点击机柜或设施查看';
    if(structuring){renderStructureList();$('#room3d-structure-status').textContent='请在地面选择位置；完成后可以旋转和漫游查看。'}
  }
  function setArranging(value){if(!view)return;if(value&&walking)setWalking(view.toggleWalk());if(value&&!arranging&&view.hasPlan()){editPlanRestore=planVisible;setPlanLayer(true)}if(value&&autoSpacing){autoSpacing=false;restoreSpacingAfterArrange=true;overlay.querySelector('[data-action="spacing"]').textContent='自动间距：暂停';initView();$('#room3d-message').textContent='摆放时临时显示原始点位；完成摆放后自动恢复等距对齐。'}if(!value&&restoreSpacingAfterArrange){view.arrange(false);restoreSpacingAfterArrange=false;autoSpacing=true;overlay.querySelector('[data-action="spacing"]').textContent='自动间距：开';initView();if(editPlanRestore!==null){setPlanLayer(editPlanRestore);editPlanRestore=null}showSpacingMessage();return}arranging=view.arrange(value);if(!arranging&&editPlanRestore!==null){setPlanLayer(editPlanRestore);editPlanRestore=null}setWalking(false);const action=overlay.querySelector('[data-action="arrange"]');action.textContent=arranging?'完成摆放':'摆放机柜';action.classList.toggle('active',arranging);$('#room3d-help').textContent=arranging?'拖动机柜，或在列表选中机柜后点击空地；松开即保存到本机':'拖动旋转 · 滚轮 / 双指缩放 · 点击机柜或设施查看'}
  function showSpacingMessage(){if(!view)return;const crowded=view.crowdedCount(),spacing=view.spacingInfo();$('#room3d-message').textContent=crowded?`仍有 ${crowded} 组机柜间距偏小；可检查重合点位或开启自动间距。`:spacing.alignedGroups?`已在 3D 中对齐 ${spacing.alignedGroups} 排机柜、统一相邻间距；图纸点位和保存数据未改动。`:spacing.expanded?`3D 示意已自动扩展${spacing.width>spacing.baseWidth+.01?'宽度':''}${spacing.width>spacing.baseWidth+.01&&spacing.depth>spacing.baseDepth+.01?'和':''}${spacing.depth>spacing.baseDepth+.01?'深度':''}以容纳机柜；图纸点位和保存数据未改动。`:racks.length?'已就绪 · 图纸点位按原样显示':'当前没有机柜；退出后新增机柜即可在此看到。'}
  function close(){if(restoreSpacingAfterArrange){autoSpacing=true;restoreSpacingAfterArrange=false}view?.dispose();view=null;overlay?.remove();overlay=null;walking=false;structuring=false;document.body.classList.remove('room3d-open');previousFocus?.focus()}

  function updateHeading({bearing,planBearing,position,walking:walk}){
    if(!overlay)return;
    const label=$('#room3d-heading'),needle=overlay.querySelector('.room3d-compass-needle');
    if(bearing===null){label.textContent='方位待校准';needle.style.opacity='.35'}
    else{const names=['北','东北','东','东南','南','西南','西','西北'];label.textContent=`朝向 ${names[Math.round(bearing/45)%8]} · ${Math.round(bearing)}°`;needle.style.opacity='1';needle.style.transform=`translate(-50%,-50%) rotate(${-bearing}deg)`}
    $('#room3d-viewmode').textContent=walk?'入口漫游':cameraMode;
    if(walk&&position){const marker=$('#room3d-minimap-position');marker.style.left=`${position.x*100}%`;marker.style.top=`${position.y*100}%`;marker.style.transform=`translate(-50%,-50%) rotate(${planBearing}deg)`}
  }

  function showDetails(rack,devices,deviceId=null){
    window.dispatchEvent(new CustomEvent('yj-rack-3d-selection',{detail:{rackId:rack?.id||'',deviceId}}));
    const panel=$('#room3d-info');panel.replaceChildren();
    const side=panel.closest('.room3d-side');side?.classList.toggle('has-selection',!!rack);
    if(!rack){const p=document.createElement('p');p.textContent='点击机柜查看设备清单；点击隔断、区域或设施查看其名称和位置。';panel.append(p);return}
    const title=document.createElement('h3');title.textContent=rack.name;
    const face={north:'朝图纸下方',south:'朝图纸上方',east:'朝图纸右方',west:'朝图纸左方'}[rack.facing]||'朝向未记录';
    const meta=document.createElement('p');meta.textContent=`第 ${rack.row} 排 · 第 ${rack.bay} 列 · ${face}${rack.planX!=null?' · 已在图纸定位':''}${rack.location?' · '+rack.location:''}`;
    const used=devices.reduce((sum,item)=>sum+item.heightU,0),power=devices.reduce((sum,item)=>sum+item.power,0),stats=document.createElement('div');stats.className='room3d-stats';
    for(const [value,label] of [[`${used}/${rack.totalU}U`,'空间占用'],[String(devices.length),'设备'],[`${power}W`,'功耗估算']]){const item=document.createElement('div'),strong=document.createElement('strong'),small=document.createElement('small');strong.textContent=value;small.textContent=label;item.append(strong,small);stats.append(item)}
    const listTitle=document.createElement('h4');listTitle.className='room3d-device-heading';listTitle.textContent=`设备清单 · ${devices.length} 台`;
    const list=document.createElement('ul');list.className='room3d-devices';
    for(const device of [...devices].sort((a,b)=>b.startU-a.startU)){const item=document.createElement('li'),button=document.createElement('button'),main=document.createElement('div'),name=document.createElement('strong'),model=document.createElement('small'),place=document.createElement('span');button.type='button';button.className='room3d-device-link';button.classList.toggle('selected',device.id===deviceId);button.setAttribute('aria-label',`定位${device.name}，U${device.startU}至U${device.startU+device.heightU-1}`);button.onclick=()=>view?.focusDevice(device.id);name.textContent=device.name;model.textContent=[device.model,{server:'服务器',switch:'交换机',firewall:'防火墙',storage:'存储',ups:'UPS / 电源',other:'其他'}[device.type]].filter(Boolean).join(' · ');place.textContent=`U${device.startU}–${device.startU+device.heightU-1} · ${device.status==='active'?'运行':device.status==='maintenance'?'维护':device.status==='inactive'?'停用':'未记录'}`;main.append(name,model);button.append(main,place);item.append(button);list.append(item)}
    if(!devices.length){const empty=document.createElement('p');empty.textContent='机柜内暂无设备。';list.append(empty)}
    const selected=devices.find(device=>device.id===deviceId);
    const selectedInfo=document.createElement('section');selectedInfo.className='room3d-device-detail';
    if(selected){const heading=document.createElement('h4');heading.textContent=`当前设备 · ${selected.name}`;selectedInfo.append(heading);for(const [label,value] of [['U 位',`U${selected.startU}–U${selected.startU+selected.heightU-1}`],['记录状态',selected.status==='active'?'运行':selected.status==='maintenance'?'维护':selected.status==='inactive'?'停用':'未记录'],['型号',selected.model],['资产编号',selected.serial],['IP / 地址',selected.address],['负责人',selected.owner],['功耗估算',selected.power?`${selected.power} W`:null],['上联 / PDU',selected.ports],['备注',selected.note]]){if(!value)continue;const row=document.createElement('p');row.textContent=`${label}：${value}`;selectedInfo.append(row)}}
    const records=(state.maintenance||[]).filter(record=>record.rackId===rack.id&&(!deviceId||!record.deviceId||record.deviceId===deviceId)).slice(0,8);
    const maintenance=document.createElement('section');maintenance.className='room3d-maintenance';
    const heading=document.createElement('h4');heading.textContent='本地维护记录';maintenance.append(heading);
    if(!records.length){const empty=document.createElement('p');empty.textContent='暂无维护记录。';maintenance.append(empty)}
    for(const record of records){const row=document.createElement('div'),body=document.createElement('span'),remove=document.createElement('button');row.className='room3d-maintenance-item';const target=state.devices.find(device=>device.id===record.deviceId);body.textContent=`${new Date(record.at).toLocaleString('zh-CN')} · ${target?.name||'机柜'}：${record.content}`;remove.type='button';remove.textContent='删除';remove.setAttribute('aria-label',`删除维护记录：${record.content.slice(0,30)}`);remove.onclick=()=>{if(!window.confirm('删除这条本地维护记录？'))return;try{window.RackApp.deleteMaintenance(record.id);state=window.RackApp.state();showDetails(rack,devices,deviceId)}catch(error){$('#room3d-message').textContent=error.message}};row.append(body,remove);maintenance.append(row)}
    const form=document.createElement('form'),input=document.createElement('textarea'),submit=document.createElement('button');form.className='room3d-maintenance-form';input.required=true;input.maxLength=500;input.placeholder=selected?`记录 ${selected.name} 的维护情况`:'记录此机柜的维护情况';input.setAttribute('aria-label','维护内容');submit.type='submit';submit.textContent='添加本地记录';form.append(input,submit);form.onsubmit=event=>{event.preventDefault();try{window.RackApp.addMaintenance(rack.id,deviceId,input.value);state=window.RackApp.state();showDetails(rack,devices,deviceId);$('#room3d-message').textContent='维护记录已写入当前浏览器，完整备份会包含此记录。'}catch(error){$('#room3d-message').textContent=error.message}};maintenance.append(form);
    const edit=document.createElement('button');edit.type='button';edit.textContent='返回详情编辑此机柜';edit.onclick=()=>{close();$('#view-detail').click();document.querySelector(`[data-rack="${CSS.escape(rack.id)}"]`)?.click();$('#rack-panel').scrollIntoView({behavior:'smooth',block:'start'})};
    panel.append(title,meta,stats,listTitle,list,selectedInfo,maintenance,edit);
  }

  function showStructureDetails(item){
    if(!item)return;
    selectedId=null;selectedDeviceId=null;renderLocatorList();
    const panel=$('#room3d-info'),name={glass:'玻璃隔断',solid:'实体隔墙',area:'区域名称',desk:'办公桌',firedoor:'防火门',power:'配电柜',ups:'UPS',battery:'UPS 长排电池架',gas:'七氟丙烷气瓶组',cooling:'精密空调',entrysign:'入口指示牌'}[item.type];panel.replaceChildren();panel.closest('.room3d-side')?.classList.add('has-selection');
    const title=document.createElement('h3'),meta=document.createElement('p'),note=document.createElement('p'),edit=document.createElement('button');
    title.textContent=item.label||name;meta.textContent=`${name}${item.type==='battery'?` · ${item.cols}列×${item.rows}排×${item.levels}层，已摆 ${item.count}/${item.cols*item.rows*item.levels} 节`:item.type==='gas'?` · ${item.count} 瓶示意气瓶`:''} · ${['glass','solid'].includes(item.type)?'两端位置已在图纸坐标保存':'图纸位置 '+Math.round(item.x*100)+'% / '+Math.round(item.y*100)+'%'}`;
    note.textContent='仅是本机手工布置的空间示意，不代表真实设备状态或监测数据。';edit.type='button';edit.textContent='打开布置面板';edit.onclick=()=>setStructuring(true);
    panel.append(title,meta,note,edit);
  }

  function renderLocatorList(){
    if(!overlay||!racks)return;
    const list=$('#room3d-list'),query=$('#room3d-search').value.toLocaleLowerCase().trim();list.replaceChildren();
    const matchingRacks=racks.filter(rack=>!query||`${rack.name} ${rack.location} ${rack.row}排 ${rack.bay}列`.toLocaleLowerCase().includes(query));
    const matchingDevices=query?state.devices.filter(device=>`${device.name} ${device.model} ${device.serial} ${device.address} ${device.owner} U${device.startU}`.toLocaleLowerCase().includes(query)).slice(0,60):[];
    for(const rack of matchingRacks){const entry=document.createElement('button'),strong=document.createElement('strong'),span=document.createElement('span');entry.type='button';entry.className='room3d-entry';entry.classList.toggle('selected',rack.id===selectedId&&!selectedDeviceId);strong.textContent=rack.name;span.textContent=`${rack.row} 排 · ${rack.bay} 列 · ${state.devices.filter(d=>d.rackId===rack.id).length} 台设备`;entry.append(strong,span);entry.onclick=()=>view?.focus(rack.id);list.append(entry)}
    for(const device of matchingDevices){const rack=racks.find(item=>item.id===device.rackId),entry=document.createElement('button'),strong=document.createElement('strong'),span=document.createElement('span');entry.type='button';entry.className='room3d-entry room3d-device-result';entry.classList.toggle('selected',device.id===selectedDeviceId);strong.textContent=device.name;span.textContent=`${rack?.name||'机柜'} · U${device.startU}–${device.startU+device.heightU-1}${device.serial?' · '+device.serial:''}`;entry.append(strong,span);entry.onclick=()=>view?.focusDevice(device.id);list.append(entry)}
    if(!list.children.length){const empty=document.createElement('p');empty.className='room3d-list-empty';empty.textContent='没有匹配的机柜或设备。';list.append(empty)}
  }

  function initView(){
    state=window.RackApp.state();racks=[...state.racks].sort((a,b)=>a.row-b.row||a.bay-b.bay);
    view?.dispose();
    const {createRoom3D}=window.RackRoom3D;
    view=createRoom3D(overlay.querySelector('.room3d-stage'),state,(rack,deviceId)=>{
      selectedId=rack.id;selectedDeviceId=deviceId;cameraMode=deviceId?'设备视角':'机柜视角';view?.setConnections(window.RackApp.state().connections||[]);renderLocatorList();showDetails(rack,state.devices.filter(d=>d.rackId===rack.id),deviceId);
    },updateHeading,(id,x,y)=>{try{window.RackApp.placeRackOnPlan(id,x,y);const crowded=view?.crowdedCount()||0;$('#room3d-message').textContent=crowded?`位置已保存；仍有 ${crowded} 组机柜间距偏小。`:'机柜位置已保存在此浏览器，并同步到平面图。'}catch(error){$('#room3d-message').textContent='保存位置失败：'+error.message;throw error}},{autoSpacing,onStructureCreate:addStructure,onStructureStatus:message=>{$('#room3d-structure-status').textContent=message},onStructureSelect:showStructureDetails,getStructureTurn:()=>Number($('#room3d-structure-turn').value),getBatteryConfig:()=>({cols:Number($('#room3d-battery-cols').value),rows:Number($('#room3d-battery-rows').value)}),getRelocatingId:()=>relocatingId,onWalkStatus:message=>{$('#room3d-message').textContent=message},onPerformanceFallback:message=>{layers.airflow=false;overlay.querySelector('[data-layer="airflow"]').checked=false;$('#room3d-message').textContent=message}});
    const map=$('#room3d-minimap-image');if(state.room.plan){map.src=state.room.plan;map.parentElement.style.aspectRatio=`${state.room.imageWidth||2}/${state.room.imageHeight||1}`}else map.removeAttribute('src');
    arranging=false;structuring=false;overlay.querySelector('[data-action="arrange"]').textContent='摆放机柜';overlay.querySelector('[data-action="arrange"]').classList.remove('active');overlay.querySelector('[data-action="structure"]').textContent='布置隔断/设施';overlay.querySelector('[data-action="structure"]').classList.remove('active');overlay.querySelector('.room3d-structure-panel').hidden=true;setWalking(false);setPlanLayer(planVisible);syncLayers();renderLocatorList();
    if(selectedDeviceId&&state.devices.some(device=>device.id===selectedDeviceId))view.focusDevice(selectedDeviceId);else if(selectedId&&racks.some(r=>r.id===selectedId))view.focus(selectedId);
  }

  function togglePlan(show){
    if(!overlay)return;
    if(show&&walking)setWalking(view.toggleWalk());
    if(show&&arranging)setArranging(false);
    overlay.querySelector('.room3d-calibrate').hidden=!show;
    overlay.querySelector('.room3d-main').hidden=show;
    overlay.querySelector('[data-action="plan"]').hidden=show;
    if(show){overlay.querySelector('.room3d-layer-panel').hidden=true;overlay.querySelector('[data-action="layers"]').setAttribute('aria-expanded','false')}
    if(show){view?.dispose();view=null;arranging=false;setWalking(false);overlay.querySelector('[data-action="arrange"]').textContent='摆放机柜';overlay.querySelector('[data-action="arrange"]').classList.remove('active');placementMode='rack';renderPlan();$('#room3d-help').textContent='图纸和机柜定位仅保存在本机浏览器，完整备份会包含图纸'}
    else{initView();showSpacingMessage();$('#room3d-help').textContent='拖动旋转 · 滚轮 / 双指缩放 · 点击机柜或设施查看'}
  }

  function renderPlan(){
    state=window.RackApp.state();racks=[...state.racks].sort((a,b)=>a.row-b.row||a.bay-b.bay);
    const room=state.room||{},image=$('#room3d-map-image'),empty=$('#room3d-map-empty'),map=$('#room3d-map');
    image.hidden=!room.plan;empty.hidden=!!room.plan;
    if(room.plan){image.src=room.plan;map.style.aspectRatio=`${room.imageWidth||2}/${room.imageHeight||1}`}else{image.removeAttribute('src');map.style.aspectRatio='2/1'}
    for(const [id,value] of [['room3d-width',room.width||0],['room3d-depth',room.depth||0],['room3d-rack-scale',room.rackScale??100],['room3d-north',room.northOnTop||''],['room3d-entrance',room.entrance||'bottom'],['room3d-entry-at',room.entranceAt??50],['room3d-entry-facing',room.entryFacing||'up']])$('#'+id).value=value;
    $('#room3d-rack-scale-value').textContent=`${room.rackScale??100}%`;
    $('#room3d-entry-value').textContent=`${room.entranceAt??50}%`;
    const customEntry=room.entryX!=null&&room.entryY!=null;
    $('#room3d-edge-entry-controls').hidden=customEntry;
    $('#room3d-clear-entry').disabled=!customEntry;
    $('#room3d-place-entry').classList.toggle('active',placementMode==='entry');
    $('#room3d-place-entry').textContent=placementMode==='entry'?'正在选择入口 · 点击图纸':'在图上指定入口';
    $('#room3d-entry-status').textContent=customEntry?'已自定义入口：从此处开始漫游，不再显示默认外墙门洞。':'当前使用边缘入口；可在图纸上另选实际门的位置。';
    const selector=$('#room3d-plan-rack'),current=selector.value||selectedId||racks[0]?.id;
    selector.replaceChildren();
    for(const rack of racks){const option=document.createElement('option');option.value=rack.id;option.textContent=`${rack.name} · ${rack.planX!=null?'已定位':'未定位'}`;selector.append(option)}
    if(racks.some(r=>r.id===current))selector.value=current;
    const markers=$('#room3d-markers');markers.replaceChildren();
    for(const rack of racks.filter(r=>r.planX!=null&&r.planY!=null)){
      const marker=document.createElement('button');marker.type='button';marker.className='room3d-marker';marker.textContent=String(racks.indexOf(rack)+1);marker.title=rack.name;marker.style.left=`${rack.planX*100}%`;marker.style.top=`${rack.planY*100}%`;
      marker.classList.toggle('selected',rack.id===selector.value);marker.onclick=event=>{event.stopPropagation();selector.value=rack.id;renderPlan()};markers.append(marker);
    }
    if(customEntry){const marker=document.createElement('button');marker.type='button';marker.className='room3d-entry-marker';marker.textContent='入口';marker.title='自定义机房入口；点击可重新指定';marker.style.left=`${room.entryX*100}%`;marker.style.top=`${room.entryY*100}%`;marker.onclick=event=>{event.stopPropagation();placementMode='entry';renderPlan()};markers.append(marker)}
    $('#room3d-map-caption').textContent=`${racks.filter(r=>r.planX!=null).length} / ${racks.length} 个机柜已在图纸定位。${room.northOnTop?'方位已校准。':'请确认图纸上方实际朝向；未确认前不会猜测东南西北。'}`;
  }

  async function processPlan(file){
    if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>15*1024*1024)throw Error('请选择不超过 15 MB 的 JPG、PNG 或 WebP 图片');
    const bitmap=await createImageBitmap(file);try{
      const ratio=Math.min(1,2400/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*ratio);canvas.height=Math.round(bitmap.height*ratio);
      const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      let data='';for(const quality of [.9,.82,.72,.62,.5]){data=canvas.toDataURL('image/webp',quality);if(data.length<=2400000)break}
      if(!data.startsWith('data:image/webp;base64,')||data.length>2400000)throw Error('压缩后仍过大，请先把图片缩小再导入');
      return{plan:data,imageWidth:canvas.width,imageHeight:canvas.height};
    }finally{bitmap.close()}
  }

  function setupPlanControls(){
    $('#room3d-plan-file').onchange=async event=>{const file=event.target.files?.[0];if(!file)return;const status=$('#room3d-plan-status');status.textContent='正在本机处理图片…';try{const image=await processPlan(file),room=window.RackApp.state().room,aspect=image.imageWidth/image.imageHeight;window.RackApp.setRoom({...room,...image,width:room.width||20,depth:room.depth||Math.max(8,Math.min(60,Math.round(20/aspect)))});status.textContent='平面图已在本机处理并保存，没有上传。请定位机柜和确认方向。';renderPlan()}catch(error){status.textContent='未导入：'+error.message}finally{event.target.value=''}};
    $('#room3d-map').onclick=event=>{const room=window.RackApp.state().room,id=$('#room3d-plan-rack').value;if(!room.plan)return;const rect=event.currentTarget.getBoundingClientRect(),x=Math.min(.98,Math.max(.02,(event.clientX-rect.left)/rect.width)),y=Math.min(.98,Math.max(.02,(event.clientY-rect.top)/rect.height));try{if(placementMode==='entry'){window.RackApp.setRoom({...room,entryX:x,entryY:y});placementMode='rack';$('#room3d-plan-status').textContent='已在本机设置入口。可选择进入时面朝的方向。'}else if(id){window.RackApp.placeRackOnPlan(id,x,y);$('#room3d-plan-status').textContent='已在本机定位该机柜。'}renderPlan()}catch(error){$('#room3d-plan-status').textContent=error.message}};
    $('#room3d-plan-rack').onchange=renderPlan;
    $('#room3d-clear-position').onclick=()=>{const id=$('#room3d-plan-rack').value;if(!id)return;try{window.RackApp.placeRackOnPlan(id,null,null);renderPlan();$('#room3d-plan-status').textContent='已清除此机柜的图纸定位。'}catch(error){$('#room3d-plan-status').textContent=error.message}};
    $('#room3d-place-entry').onclick=()=>{placementMode=placementMode==='entry'?'rack':'entry';renderPlan();$('#room3d-plan-status').textContent=placementMode==='entry'?'请点击图纸上的实际门位置；再次点击按钮可取消。':'已取消选择入口。'};
    $('#room3d-clear-entry').onclick=()=>{try{const room=window.RackApp.state().room;window.RackApp.setRoom({...room,entryX:null,entryY:null});placementMode='rack';renderPlan();$('#room3d-plan-status').textContent='已恢复边缘入口。'}catch(error){$('#room3d-plan-status').textContent=error.message}};
    for(const id of ['room3d-width','room3d-depth','room3d-rack-scale','room3d-north','room3d-entrance','room3d-entry-at','room3d-entry-facing'])$('#'+id).onchange=()=>{try{const room=window.RackApp.state().room;window.RackApp.setRoom({...room,width:Number($('#room3d-width').value),depth:Number($('#room3d-depth').value),rackScale:Number($('#room3d-rack-scale').value),northOnTop:$('#room3d-north').value,entrance:$('#room3d-entrance').value,entranceAt:Number($('#room3d-entry-at').value),entryFacing:$('#room3d-entry-facing').value});renderPlan();$('#room3d-plan-status').textContent='布局设置已保存在当前浏览器。'}catch(error){$('#room3d-plan-status').textContent=error.message}};
    $('#room3d-entry-at').oninput=event=>{$('#room3d-entry-value').textContent=`${event.target.value}%`};
    $('#room3d-rack-scale').oninput=event=>{$('#room3d-rack-scale-value').textContent=`${event.target.value}%`};
    $('#room3d-remove-plan').onclick=()=>{if(!window.confirm('从此浏览器移除平面图？机柜、设备和手工定位不会删除；建议先导出完整备份。'))return;const room=window.RackApp.state().room;window.RackApp.setRoom({...room,plan:'',imageWidth:0,imageHeight:0});renderPlan();$('#room3d-plan-status').textContent='平面图已从此工具的当前记录中移除。'};
  }

  async function open(deviceId=null){
    if(overlay){if(deviceId){selectedDeviceId=deviceId;view?.focusDevice(deviceId)}return}autoSpacing=true;restoreSpacingAfterArrange=false;planVisible=false;planBeforeWalk=false;editPlanRestore=null;planOpacity=.6;mapCollapsed=false;relocatingId=null;selectedDeviceId=deviceId;cameraMode='总览视角';layers={occupancy:true,power:true,facilities:true,aisles:true,heat:true,airflow:window.innerWidth>760&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches};previousFocus=document.activeElement;overlay=createOverlay();overlay.querySelector('[data-layer="airflow"]').checked=layers.airflow;document.body.classList.add('room3d-open');overlay.querySelector('[data-action="close"]').focus();$('#room3d-message').textContent='正在初始化 3D 视图…';
    try{
      modulePromise ||= import('room3d.202610051c00.js?v=20261005');
      window.RackRoom3D=await modulePromise;if(!overlay)return;
      state=window.RackApp.state();racks=[...state.racks].sort((a,b)=>a.row-b.row||a.bay-b.bay);
      $('#room3d-count').textContent=`${racks.length} 个机柜`;
      $('#room3d-search').oninput=renderLocatorList;
      setupPlanControls();showDetails(null,[]);initView();showSpacingMessage();
    }catch(error){modulePromise=null;console.error('3D 机房初始化失败',error);$('#room3d-message').textContent='此浏览器暂时无法打开 3D 视图。机柜详情和 2D 全景仍可使用。';const stage=overlay?.querySelector('.room3d-stage');if(stage)stage.textContent='3D 图形初始化失败；本机记录不受影响。'}
  }

  window.addEventListener('yj-rack-update',()=>view?.setConnections(window.RackApp.state().connections||[]));
  button?.addEventListener('click',()=>open());
  document.addEventListener('rack:focus-device3d',event=>open(event.detail?.deviceId||null));
  document.addEventListener('keydown',event=>{if(event.key!=='Escape'||!overlay)return;event.preventDefault();if(!overlay.querySelector('.room3d-calibrate').hidden)togglePlan(false);else if(structuring)setStructuring(false);else if(arranging)setArranging(false);else if(walking)setWalking(view.toggleWalk());else close()});
})();
