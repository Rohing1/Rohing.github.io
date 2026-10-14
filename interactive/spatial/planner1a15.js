(() => {
  'use strict';
  const M = window.SpatialModel;
  const C = window.CameraCatalog;
  const mode = document.body.dataset.planner;
  const app = document.getElementById('app');
  if (!M || !app || !['camera', 'cabling', 'meeting'].includes(mode)) return;
  const KEY = `yj-spatial-${mode}-v1`;
  const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const num = (value, fallback, min, max) => Number.isFinite(Number(value)) ? M.clamp(value, min, max) : fallback;
  const config = {
    camera: { title: '视频监控覆盖规划台', eyebrow: 'SURVEILLANCE PLANNING / LOCAL ONLY',
      lead: '按机型和镜头焦距摆放摄像机，比较水平视角、可视区域、参考识别范围与盲区，再估算带宽和录像容量。',
      tools: [['camera', '＋ 摄像机'], ['wall', '╱ 遮挡墙']], source: '<a href="https://help.axis.com/en-us/axis-site-designer" target="_blank" rel="noopener noreferrer">AXIS Site Designer 规划方法 ↗</a> · 海康机型数据见选中点位的官方规格链接' },
    cabling: { title: '综合布线与 PoE 预算台', eyebrow: 'CABLING & POE / LOCAL ONLY',
      lead: '在平面图上规划链路与端口，核对 802.3af/at/bt 单端口能力、交换机预留功率以及永久链路和信道长度。',
      tools: [['switch', '＋ PoE 交换机'], ['ap', '＋ AP'], ['camera', '＋ 摄像机'], ['reader', '＋ 门禁读卡器'], ['sensor', '＋ 传感器'], ['route', '⌁ 路径转折点']],
      source: '<a href="https://ethernetalliance.org/wp-content/uploads/2019/12/WP_EA_Overview8023bt_V2p1_FINAL.pdf" target="_blank" rel="noopener noreferrer">Ethernet Alliance PoE 类型与功率 ↗</a> · <a href="https://www.cisco.com/c/en/us/td/docs/switches/lan/c9000/infra/poe/poe-configuration-guide/g-poe/c-poe-and-switch.html" target="_blank" rel="noopener noreferrer">Cisco 功率分配说明 ↗</a> · <a href="https://www.flukenetworks.com/blog/cabling-chronicles/extending-and-testing-cable-runs-beyond-100-meters" target="_blank" rel="noopener noreferrer">Fluke 永久链路与信道 ↗</a>' },
    meeting: { title: '会议室音视频布置台', eyebrow: 'MEETING AV / LOCAL ONLY',
      lead: '按设备参数摆放屏幕、摄像机、麦克风、音箱和座位，分别检查几何覆盖、画面细节、文字可读性与扩声参考声级。',
      tools: [['screen', '＋ 屏幕'], ['camera', '＋ 摄像机'], ['mic', '＋ 麦克风'], ['speaker', '＋ 音箱'], ['seat', '＋ 座位'], ['table', '＋ 会议桌'], ['wall', '╱ 隔墙']],
      source: '<a href="https://www.shure.com/en-US/docs/guide/DESIGNER/" target="_blank" rel="noopener noreferrer">Shure Designer 覆盖图说明 ↗</a> · <a href="https://www.avixa.org/explore/articles/conference-room-design" target="_blank" rel="noopener noreferrer">AVIXA 会议室设计要点 ↗</a>' }
  }[mode];
  const labels = { camera: '摄像机', switch: '交换机', ap: '无线 AP', reader: '门禁读卡器', sensor: '传感器', screen: '屏幕', mic: '麦克风', speaker: '音箱', seat: '座位', table: '会议桌' };
  const glyphs = { camera: '●', switch: 'S', ap: 'AP', reader: 'D', sensor: '◉', screen: '▣', mic: 'M', speaker: '♫', seat: '•', table: '▤' };
  const colors = { camera: '#62e4d5', switch: '#ffc777', ap: '#81c6ff', reader: '#c7b4ff', sensor: '#ff99ac', screen: '#9bc4ff', mic: '#9df4bb', speaker: '#ffcf8c', seat: '#ffffff', table: '#849bb8' };
  // Generic starting scenarios, not manufacturer specifications. Every parameter remains editable.
  const avPresets = {
    camera: {
      wide4k: { label: '广角会议摄像机 · 4K 示例', range: 12, fov: 90, hPixels: 3840, minFacePx: 40 },
      usb1080: { label: 'USB 摄像机 · 1080p 示例', range: 10, fov: 78, hPixels: 1920, minFacePx: 40 },
      ptz4k: { label: '窄角 / PTZ · 4K 示例', range: 20, fov: 65, hPixels: 3840, minFacePx: 40 }
    },
    screen: {
      display75: { label: '75 英寸显示屏示例', range: 12, fov: 120, diagonalIn: 75, textPx: 40, contentHeightPx: 1080, minTextArcMin: 16 },
      display55: { label: '55 英寸显示屏示例', range: 10, fov: 120, diagonalIn: 55, textPx: 40, contentHeightPx: 1080, minTextArcMin: 16 },
      projection120: { label: '120 英寸投影幕示例', range: 20, fov: 120, diagonalIn: 120, textPx: 40, contentHeightPx: 1080, minTextArcMin: 16 }
    },
    mic: {
      tabletop: { label: '桌面全向话筒示例', range: 2.5, fov: 360 },
      ceiling: { label: '吊顶阵列话筒示例', range: 4, fov: 360 },
      gooseneck: { label: '鹅颈定向话筒示例', range: 1, fov: 100 }
    },
    speaker: {
      wall: { label: '壁挂音箱示例', range: 8, fov: 160, spl1m: 85 },
      ceiling: { label: '吸顶音箱示例', range: 5, fov: 360, spl1m: 82 }
    }
  };
  const avDefault = { camera: 'wide4k', screen: 'display75', mic: 'tabletop', speaker: 'wall' };
  function item(type, x, y, n) {
    const base = { id: uid(), type, name: `${labels[type]} ${n}`, x, y, angle: 90, fov: 80, range: 8, power: 12, runningPower: 12, bitrate: 4, height: 2.8, switchId: '', waypoints: [], ports: 24, budget: 370, poeType: 'auto', perPortW: 30, portNumber: 0, verticalM: 0, patchM: 0 };
    if (type === 'camera' && mode === 'camera') Object.assign(base, { angle: 0, range: 12, fov: 90, vFov: 0, identifyRange: 0, modelId: 'custom', lensId: 'custom', power: 10 });
    if (mode === 'meeting' && avPresets[type]) Object.assign(base, avPresets[type][avDefault[type]], { avPreset: avDefault[type] });
    if (type === 'reader') base.power = base.runningPower = 7;
    if (type === 'sensor') base.power = base.runningPower = 5;
    if (type === 'ap') base.power = base.runningPower = 22;
    if (type === 'switch') base.poeType = 'at';
    return base;
  }
  function blank() {
    return { version: 1, mode, width: mode === 'meeting' ? 12 : 24, height: mode === 'meeting' ? 8 : 15,
      imageData: '', items: [], walls: [], settings: { days: 30, slack: 10, reservePct: 15, noiseDb: 38, rt60: .45, targetSplDb: 65 } };
  }
  function example() {
    const p = blank();
    if (mode === 'camera') {
      p.items.push(item('camera', .13, .25, 1), item('camera', .75, .18, 2));
      p.items[0].angle = 30; p.items[1].angle = 145;
      p.walls.push({ id: uid(), x1: .49, y1: .12, x2: .49, y2: .58 });
    } else if (mode === 'cabling') {
      const sw = item('switch', .18, .48, 1); p.items.push(sw);
      [['ap', .42, .25], ['camera', .79, .2], ['reader', .76, .72]].forEach(([type, x, y], index) => {
        const d = item(type, x, y, index + 1); d.switchId = sw.id; p.items.push(d);
      });
    } else {
      const screen = item('screen', .5, .08, 1), camera = item('camera', .5, .15, 1);
      const micLeft = item('mic', .27, .52, 1), micRight = item('mic', .73, .52, 2);
      const speaker = item('speaker', .5, .2, 1), table = item('table', .5, .55, 1);
      p.items.push(screen, camera, micLeft, micRight, speaker, table);
      [[.27,.38],[.27,.56],[.27,.75],[.73,.38],[.73,.56],[.73,.75]].forEach(([x,y],i) => p.items.push(item('seat',x,y,i+1)));
    }
    return p;
  }
  function normalize(raw) {
    if (!raw || raw.mode !== mode || raw.version !== 1 || !Array.isArray(raw.items) || !Array.isArray(raw.walls)) throw new Error('不是当前工具的有效方案文件。');
    if (raw.items.length > 300 || raw.walls.length > 100) throw new Error('方案元素数量超出上限。');
    const p = blank(); p.width = num(raw.width, p.width, 3, 200); p.height = num(raw.height, p.height, 3, 200);
    p.settings.days = num(raw.settings?.days, 30, 1, 365); p.settings.slack = num(raw.settings?.slack, 10, 0, 50); p.settings.reservePct = num(raw.settings?.reservePct, 15, 0, 50);
    if (mode === 'meeting') { p.settings.noiseDb = num(raw.settings?.noiseDb, 38, 20, 80); p.settings.rt60 = num(raw.settings?.rt60, .45, .1, 3); p.settings.targetSplDb = num(raw.settings?.targetSplDb, 65, 45, 90); }
    if (typeof raw.imageData === 'string' && raw.imageData.length <= 3500000 && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(raw.imageData)) p.imageData = raw.imageData;
    const allowed = new Set(mode === 'camera' ? ['camera'] : mode === 'cabling' ? ['switch','ap','camera','reader','sensor'] : ['screen','camera','mic','speaker','seat','table']);
    p.items = raw.items.filter(v => v && allowed.has(v.type)).map((v, index) => {
      const b = item(v.type, num(v.x,.5,0,1), num(v.y,.5,0,1),index+1);
      b.id = String(v.id || b.id).slice(0,80); b.name = String(v.name || b.name).slice(0,50);
      for (const [key, lo, hi] of [['angle',0,359],['fov',5,mode==='meeting'?360:170],['range',.5,100],['power',0,100],['bitrate',.1,100],['height',1,15],['ports',1,96],['budget',1,3000]]) b[key] = num(v[key],b[key],lo,hi);
      if (mode === 'meeting' && avPresets[v.type]) {
        b.avPreset = Object.hasOwn(avPresets[v.type],v.avPreset) ? v.avPreset : 'custom';
        for (const [key, lo, hi] of [['hPixels',640,7680],['minFacePx',10,200],['diagonalIn',24,300],['textPx',12,120],['contentHeightPx',480,4320],['minTextArcMin',5,60],['spl1m',50,110]])
          if (key in b) b[key] = num(v[key],b[key],lo,hi);
      }
      if (mode === 'camera') {
        b.modelId = C && Object.hasOwn(C.MODELS, v.modelId) ? v.modelId : 'custom';
        b.lensId = C?.lens(b.modelId, v.lensId) ? v.lensId : 'custom';
        b.vFov = num(v.vFov, 0, 0, 140);
        b.identifyRange = num(v.identifyRange, 0, 0, 200);
      }
      if (mode === 'cabling') {
        const tiers = M.poeTiers.map(t=>t.id);
        b.poeType = v.type === 'switch' ? tiers.includes(v.poeType) ? v.poeType : 'at' : ['auto',...tiers].includes(v.poeType) ? v.poeType : 'auto';
        b.perPortW = num(v.perPortW, M.poeTiers.find(t=>t.id===b.poeType)?.pseW||30, 1, 100);
        b.runningPower = num(v.runningPower, b.power, 0, 100);
        b.portNumber = num(v.portNumber, 0, 0, 96);
        b.verticalM = num(v.verticalM, 0, 0, 200);
        b.patchM = num(v.patchM, 0, 0, 30);
      }
      b.switchId = String(v.switchId || '').slice(0,80);
      b.waypoints = Array.isArray(v.waypoints) ? v.waypoints.slice(0,12).map(w => ({ x:num(w?.x,.5,0,1), y:num(w?.y,.5,0,1) })) : [];
      return b;
    });
    p.walls = raw.walls.filter(Boolean).map(w => ({ id:String(w.id || uid()).slice(0,80), x1:num(w.x1,.2,0,1), y1:num(w.y1,.2,0,1), x2:num(w.x2,.8,0,1), y2:num(w.y2,.8,0,1) }));
    return p;
  }
  let plan;
  try { plan = normalize(JSON.parse(localStorage.getItem(KEY))); } catch { plan = example(); }
  let selected = null, tool = 'select', moving = false, wallDraft = null, floorImage = null, saveTimer = 0;
  app.innerHTML = `
    <section class="planner-intro"><div><span class="eyebrow">${config.eyebrow}</span><h1>${config.title}</h1><p>${config.lead}</p></div><span class="local-badge">◉ 本地方案 · 不上传图纸</span></section>
    <div class="privacy-note"><strong>规划估算，不是验收结论。</strong> 图纸与方案只在当前浏览器处理，不会自动上传；浏览器清理可能导致数据丢失，请定期导出完整 JSON 备份。示例布局完全虚构。导出文件含图纸，请自行妥善保管。</div>
    <div class="planner-layout"><div class="planner-main">
      <section class="planner-panel"><h2>方案与图纸</h2><div class="setup-fields"><label>场地宽度（米）<input id="width" type="number" min="3" max="200" step=".1"></label><label>场地长度（米）<input id="height" type="number" min="3" max="200" step=".1"></label>${mode === 'camera' ? '<label>录像保留（天）<input id="days" type="number" min="1" max="365" step="1"></label>' : mode === 'cabling' ? '<label>路径余量（%）<input id="slack" type="number" min="0" max="50" step="1"></label><label>交换机功率预留（%）<input id="reservePct" type="number" min="0" max="50" step="1"></label>' : '<label>背景噪声参考（dBA）<input id="noiseDb" type="number" min="20" max="80" step="1"></label><label>混响时间参考（秒）<input id="rt60" type="number" min=".1" max="3" step=".05"></label><label>座位扩声目标（dBA）<input id="targetSplDb" type="number" min="45" max="90" step="1"></label>'}</div>
        <div class="setup-actions"><label class="button file-button">导入本地图纸<input id="imageFile" type="file" accept="image/png,image/jpeg,image/webp"></label><button id="removeImage">移除图纸</button><button id="backup">导出完整备份</button><label class="button file-button">恢复备份<input id="restoreFile" type="file" accept=".json,application/json"></label><button id="png">下载规划图 PNG</button>${mode==='cabling'?'<button id="report">导出施工核对清单 CSV</button>':''}<button id="newPlan">新建空白方案</button></div><p class="hint">图纸会缩放到设置的场地尺寸；请先核对长宽比例。示例方案仅帮助试用，修改会自动保存在此浏览器。</p></section>
      <section class="planner-panel"><div class="board-head"><div><h2>场地平面图</h2><p id="toolHint">选择元素后拖动；在右侧编辑参数。鼠标和触摸屏均可操作。</p></div><span class="pill" id="countLabel"></span></div><div class="toolstrip" role="toolbar" aria-label="平面图工具"><button data-tool="select" class="active" aria-pressed="true">↖ 选择 / 拖动</button>${config.tools.map(([id,label])=>`<button data-tool="${id}" aria-pressed="false">${label}</button>`).join('')}</div><div class="board-stage" id="stage"><canvas id="canvas" aria-label="可交互的本地规划平面图"></canvas></div><div class="canvas-legend">${mode === 'camera' ? '<span><i style="background:#1dd3a74a"></i>可视示意</span><span><i style="background:#0bdcb69c"></i>参考可识别</span><span><i style="background:#e96c72"></i>盲区</span>' : mode === 'meeting' ? '<span><i style="background:#49d4c1"></i>参考条件齐全</span><span><i style="background:#ffce79"></i>入镜 / 看见，但细节不足</span><span><i style="background:#e96c72"></i>几何覆盖缺失</span>' : '<span><i style="background:#49d4c1"></i>覆盖 / 点位</span><span><i style="background:#ffce79"></i>路径 / 警示</span><span><i style="background:#e96c72"></i>盲区 / 缺项</span>'}</div><p class="canvas-hint">${mode === 'camera' ? '平面图仅用镜头水平视角、设定距离和遮挡墙估算；参考可识别范围取厂家 DORI I 值与规划距离的较小者。垂直角和安装高度仅记录，未做俯仰与地面投影模拟。' : mode === 'cabling' ? '选中终端后使用“路径转折点”逐次添加转折。永久链路长度=平面路线+竖向长度，再加路径余量；信道长度另加两端跳线。' : '示例设备参数并非厂家规格。画面/文字大小和扩声声级是平面参考值；混响、噪声、俯仰角、遮挡物与真实声场仍需现场核验。'}</p></section>
      <section class="planner-panel"><h2>参考与边界</h2><p class="reference">${config.source}</p><p class="reference">所有结果基于可编辑输入和简化几何模型。正式施工前请核对设备规格、标准要求与现场测量。</p></section>
    </div><aside class="planner-side"><section class="planner-panel"><h2>规划摘要</h2><div id="metrics" class="metric-grid"></div><div id="advice"></div></section><section class="planner-panel"><h2 id="detailTitle">选择一个点位</h2><div id="detail" class="empty-hint">点击或添加元素，修改具体参数。</div></section><section class="planner-panel wide"><h2>${mode==='camera'?'摄像机清单':mode==='cabling'?'链路与交换机':'座位覆盖检查'}</h2><div id="listing"></div></section></aside></div><p id="status" class="status" role="status" aria-live="polite"></p>`;
  const $ = id => document.getElementById(id);
  const canvas = $('canvas'), stage = $('stage'), ctx = canvas.getContext('2d');
  const status = (message, error = false) => { $('status').textContent = message; $('status').className = `status ${error ? 'error' : 'success'}`; };
  function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(plan)); } catch { status('浏览器空间不足或禁止本地存储；请立即导出完整备份。', true); } }, 300); }
  function download(name, blob) { const url=URL.createObjectURL(blob), a=document.createElement('a'); a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000); }
  function imageChanged() { floorImage = null; if (!plan.imageData) { draw(); return; } const image = new Image(); image.onload=()=>{floorImage=image;draw();}; image.onerror=()=>status('图纸无法读取，请重新导入。',true); image.src=plan.imageData; }
  function sync() { $('width').value=plan.width; $('height').value=plan.height; for(const id of ['days','slack','reservePct','noiseDb','rt60','targetSplDb'])if($(id))$(id).value=plan.settings[id]; stage.style.setProperty('--plan-aspect',`${plan.width}/${plan.height}`); imageChanged(); render(); }
  function changed() { render(); save(); }
  function point(event) { const r=canvas.getBoundingClientRect();return { x:M.clamp((event.clientX-r.left)/r.width,0,1),y:M.clamp((event.clientY-r.top)/r.height,0,1) }; }
  const px = x => x*stage.clientWidth, py = y => y*stage.clientHeight;
  function resizeCanvas() { const dpr=Math.min(2,window.devicePixelRatio||1), w=Math.max(1,Math.round(stage.clientWidth*dpr)),h=Math.max(1,Math.round(stage.clientHeight*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}ctx.setTransform(dpr,0,0,dpr,0,0);return {w:stage.clientWidth,h:stage.clientHeight}; }
  function label(text,x,y) { ctx.font='12px system-ui';const w=Math.min(170,ctx.measureText(text).width+14);ctx.fillStyle='#092034dd';ctx.fillRect(x+13,y-21,w,22);ctx.fillStyle='#fff';ctx.fillText(text,x+20,y-6,w-10); }
  function drawCone(i, distance=i.range, identify=false) { const start=(i.angle-i.fov/2)*Math.PI/180,end=(i.angle+i.fov/2)*Math.PI/180;ctx.beginPath();ctx.moveTo(px(i.x),py(i.y));for(let a=start;a<=end+.01;a+=(end-start)/24){const angle=Math.min(a,end);ctx.lineTo(px(i.x+Math.cos(angle)*distance/plan.width),py(i.y+Math.sin(angle)*distance/plan.height));}ctx.closePath();ctx.fillStyle=identify?'#0bdcb61d':mode==='camera'?'#39d8b600':i.type==='screen'?'#75a5fa22':'#39d8b633';ctx.strokeStyle=identify?'#25e8ba':i.type==='screen'?'#9bc4ff66':'#70f2dc99';ctx.lineWidth=identify?2:1.3;ctx.fill();ctx.stroke(); }
  function drawCircle(i) { ctx.beginPath();ctx.ellipse(px(i.x),py(i.y),Math.max(1,px(i.range/plan.width)),Math.max(1,py(i.range/plan.height)),0,0,Math.PI*2);ctx.fillStyle=i.type==='mic'?'#53e9a425':'#ffcc7820';ctx.strokeStyle=i.type==='mic'?'#78e5ad88':'#ffc77788';ctx.lineWidth=1.3;ctx.fill();ctx.stroke(); }
  function draw() {
    const {w,h}=resizeCanvas(); ctx.clearRect(0,0,w,h);ctx.fillStyle='#11283f';ctx.fillRect(0,0,w,h);
    if(floorImage){ctx.globalAlpha=.74;ctx.drawImage(floorImage,0,0,w,h);ctx.globalAlpha=1;ctx.fillStyle='#041a2b44';ctx.fillRect(0,0,w,h);}
    ctx.strokeStyle=floorImage?'#0a536a55':'#ffffff15';ctx.lineWidth=1;for(let x=1;x<plan.width;x++){const a=x/plan.width*w;ctx.beginPath();ctx.moveTo(a,0);ctx.lineTo(a,h);ctx.stroke();}for(let y=1;y<plan.height;y++){const a=y/plan.height*h;ctx.beginPath();ctx.moveTo(0,a);ctx.lineTo(w,a);ctx.stroke();}
    if(mode==='camera'){
      const cols=48, rows=Math.max(20,Math.round(cols*plan.height/plan.width)),cw=w/cols,ch=h/rows,cams=plan.items.filter(i=>i.type==='camera');
      for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const p={x:(x+.5)/cols,y:(y+.5)/rows};let zone=0;for(const i of cams){zone=Math.max(zone,M.cameraZone(i,p,plan));if(zone===2)break;}ctx.fillStyle=zone===2?'#0bdcb654':zone===1?'#1dd3a72c':'#e86c7223';ctx.fillRect(x*cw,y*ch,cw+1,ch+1);}
    }
    if(mode==='cabling')for(const i of plan.items.filter(i=>i.type!=='switch')){const sw=plan.items.find(s=>s.id===i.switchId&&s.type==='switch');if(!sw)continue;const path=[sw,...i.waypoints,i];const length=M.cableLength(i,sw,plan);ctx.strokeStyle=length>90?'#ff8080':'#ffcb73';ctx.lineWidth=selected?.id===i.id?4:2.5;ctx.beginPath();path.forEach((p,index)=>index?ctx.lineTo(px(p.x),py(p.y)):ctx.moveTo(px(p.x),py(p.y)));ctx.stroke();for(const p of i.waypoints){ctx.fillStyle='#fff5c9';ctx.fillRect(px(p.x)-3,py(p.y)-3,6,6);}}
    if(mode==='meeting')for(const i of plan.items){if(['camera','screen'].includes(i.type) || (['mic','speaker'].includes(i.type) && i.fov < 359))drawCone(i);else if(['mic','speaker'].includes(i.type))drawCircle(i);}
    if(mode==='camera')for(const i of plan.items){drawCone(i);if(i.identifyRange>0)drawCone(i,Math.min(i.range,i.identifyRange),true);}
    for(const wall of [...plan.walls,...(wallDraft?[wallDraft]:[])]){ctx.strokeStyle=selected?.id===wall.id?'#fff4a4':'#d5e9f8';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(px(wall.x1),py(wall.y1));ctx.lineTo(px(wall.x2),py(wall.y2));ctx.stroke();ctx.strokeStyle='#235375';ctx.lineWidth=2;ctx.stroke();}
    const seatScores=mode==='meeting'?new Map(M.avEstimate(plan).seats.map(score=>[score.id,score])):null;
    for(const i of plan.items){const x=px(i.x),y=py(i.y),active=selected?.id===i.id, radius=i.type==='table'?19:i.type==='seat'?10:15;const score=seatScores?.get(i.id);ctx.fillStyle=score?(score.ready?'#49d4c1':score.mic&&score.speaker&&score.camera&&score.screen?'#ffce79':'#f28a8a'):colors[i.type];ctx.strokeStyle=active?'#fff9b0':'#072238';ctx.lineWidth=active?4:2.5;ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#083048';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`bold ${i.type==='ap'?10:13}px system-ui`;ctx.fillText(glyphs[i.type],x,y+1);ctx.textAlign='left';label(i.name,x,y);}
    if(!floorImage&&plan.items.length===0){ctx.fillStyle='#b2cadb';ctx.font='16px system-ui';ctx.textAlign='center';ctx.fillText('导入图纸，或点击工具栏添加点位',w/2,h/2);ctx.textAlign='left';}
  }
  function metric(value, caption) { return `<div class="metric"><strong>${safe(value)}</strong><span>${safe(caption)}</span></div>`; }
  function renderStats() {
    let metrics='', advice='', listing='';
    if(mode==='camera'){
      const s=M.cameraEstimate(plan);
      metrics=metric(s.cameras,'摄像机')+metric(`${s.coveredPct}%`,'面积可视估算')+metric(s.identifiablePct===null?'—':`${s.identifiablePct}%`,'参考可识别面积')+metric(`${s.bitrateMbps} Mb/s`,'码率合计')+metric(`${s.retentionTB} TB`,'录像净容量估算');
      advice=`<p class="warning">${s.cameras?`盲区约 ${100-s.coveredPct}%；日增约 ${s.dailyGB} GB，PoE 约 ${s.poeW} W。`:'先摆放摄像机，再查看覆盖与容量。'}</p><p class="hint">“参考可识别”仅按所选镜头的厂家 DORI I 距离截取平面区域；不是现场识别保证。录像按 ${plan.settings.days} 天连续录制、十进制容量计算，未含索引、冗余与预留。</p>`;
      listing=`<ul class="mini-list">${plan.items.map(i=>`<li><b>${safe(i.name)}</b><small>${safe(C.model(i.modelId).name)} · ${safe(C.lens(i.modelId,i.lensId)?.label||'自定义角度')} · 水平 ${i.fov}° · ${i.range} m</small></li>`).join('')||'<li>暂无摄像机</li>'}</ul>`;
    }else if(mode==='cabling'){
      const s=M.cableEstimate(plan),allocated=s.budgets.reduce((n,b)=>n+b.watts,0),running=s.budgets.reduce((n,b)=>n+b.runningW,0);
      metrics=metric(s.rows.length,'PoE 终端')+metric(`${s.totalM} m`,'永久链路总长')+metric(`${+allocated.toFixed(1)} W`,'保守分配预算')+metric(`${+running.toFixed(1)} W`,'填写的运行功耗')+metric(s.issues,'待核对项');
      const notes=s.rows.flatMap(r=>r.issues.map(issue=>`${safe(r.name)}：${safe(issue)}`));
      for(const b of s.budgets)if(b.overloaded)notes.push(`${safe(b.name)}：端口数或总功率超限`);else if(b.reserveExceeded)notes.push(`${safe(b.name)}：已占用预留功率`);
      advice=`<p class="warning ${notes.length?'':'ok'}">${notes.length?notes.slice(0,6).join('；')+(notes.length>6?`；另有 ${notes.length-6} 项见清单`:''):'当前没有明显的端口、功率或长度警示。'}</p><p class="hint">按 PoE 等级的交换机端（PSE）功率保守预留预算；填写的运行功耗仅供比较，不作为通过条件。永久链路提示线为 90 m，含两端跳线的信道提示线为 100 m。均非现场验收结论。</p>`;
      listing=`<ul class="mini-list">${s.budgets.map(b=>`<li><b>${safe(b.name)}</b><small class="${b.overloaded||b.reserveExceeded?'bad':''}">${b.portsUsed}/${b.ports} 口 · 分配 ${b.watts}/${b.budget} W · 扣预留后 ${b.usableW} W · ${safe(M.poeTiers.find(t=>t.id===b.poeType)?.label||b.poeType)}</small></li>`).join('')}${s.rows.map(r=>`<li><b>${safe(r.name)} → ${safe(r.switchName)}${r.switchId?` · ${r.portNumber||'—'} 口`:''}</b><small class="${r.issues.length?'bad':''}">${r.length===null?'未连接':`永久 ${r.length} m / 信道 ${r.channelLength} m`} · 分配 ${r.allocatedW} W · 运行 ${r.runningW} W${r.issues.length?` · ${safe(r.issues.join('、'))}`:''}</small></li>`).join('')||'<li>暂无终端</li>'}</ul>`;
    }else{
      const s=M.avEstimate(plan);
      const geometry=s.seats.filter(r=>r.mic&&r.speaker&&r.camera&&r.screen).length;
      metrics=metric(`${geometry}/${s.seats.length}`,'四项几何覆盖')+metric(`${s.ready}/${s.seats.length}`,'参考条件齐全')+metric(s.weakCamera,'入镜但面部像素不足')+metric(s.weakScreen,'看见但文字偏小')+metric(s.weakSpeaker,'扩声声级参考偏低')+metric(s.missingMic,'收音距离 / 朝向不符');
      const risks=[...s.acousticRisks];
      if(s.missingCamera||s.missingScreen)risks.push(`${s.missingCamera} 个座位未入镜、${s.missingScreen} 个座位未处于屏幕可视扇形`);
      if(s.missingSpeaker)risks.push(`${s.missingSpeaker} 个座位未处于音箱参考范围`);
      if(s.weakCamera||s.weakScreen||s.weakSpeaker)risks.push('部分座位虽在覆盖区内，但细节或扩声参考值不足');
      advice=`<p class="warning ${s.seats.length&&s.ready===s.seats.length&&!risks.length?'ok':''}">${!s.seats.length?'先放置座位，再检查音视频覆盖。':`${s.ready}/${s.seats.length} 个座位满足当前填写的参考阈值；这不是验收结论。`}</p>${risks.length?`<ul class="av-risks">${risks.map(r=>`<li>${safe(r)}</li>`).join('')}</ul>`:''}<p class="hint">面部像素按约 16 cm 脸宽和水平视角估算；屏幕文字按 16:9、内容像素高度与视角估算；扩声按距 1 米声级和自由场距离衰减估算。阈值均可编辑，不代表厂家保证。话筒只有方向与填写距离的几何检查，不把“半径”当成真实收音边界。</p><details class="av-checklist"><summary>现场核验清单（必须实测）</summary><ol><li>从最远和两侧座位试拍，检查脸部尺寸、俯仰、逆光及自动取景。</li><li>在实际演示文稿中检查最小文字、反光、遮挡和屏幕亮度。</li><li>每个座位正常说话并录制回放，检查底噪、混响和远端听感。</li><li>试听音量均匀性、回声消除、啸叫与远端回传。</li><li>核对接口、线缆、供电和会议软件的设备选择。</li></ol></details>`;
      listing=`<ul class="mini-list av-seat-list">${s.seats.map(r=>`<li><b>${safe(r.name)}</b><small class="${r.ready?'':'bad'}">话筒几何 ${r.mic?'✓':'×'} · 扩声 ${r.speaker?`${r.speakerDb} dBA 参考${r.speakerLevelOk?' ✓':' 偏低'}`:'×'}<br>摄像 ${r.camera?`入镜 · 脸宽约 ${r.facePx} px${r.cameraClear?' ✓':' 偏小'}`:'未入镜'} · 屏幕 ${r.screen?`可见 · 文字约 ${r.textArcMin}′${r.screenReadable?' ✓':' 偏小'}`:'不可见'}</small></li>`).join('')||'<li>暂无座位</li>'}</ul>`;
    }
    $('metrics').innerHTML=metrics;$('advice').innerHTML=advice;$('listing').innerHTML=listing;$('countLabel').textContent=`${plan.items.length} 个点位 · ${plan.walls.length} 段墙`;
  }
  const field = (key, labelText, value, min, max, step=1) => `<label>${labelText}<input data-field="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
  function recommendedSwitch(device) {
    return plan.items.filter(i=>i.type==='switch').map(sw=>{
      const candidate={...plan,items:plan.items.map(i=>i.id===device.id?{...device,switchId:sw.id,portNumber:0}:i)};
      const estimate=M.cableEstimate(candidate), row=estimate.rows.find(r=>r.id===device.id), budget=estimate.budgets.find(b=>b.id===sw.id);
      return {sw, row, budget, meters:M.distance(sw,device,plan.width,plan.height)};
    }).filter(v=>v.row&&!v.row.issues.some(issue=>['端口不足','单端口 PoE 能力不足','超过标准 PoE Type 4 参考范围','设备最大功耗超过所选供电类型'].includes(issue))&&!v.budget.reserveExceeded&&!v.budget.overloaded).sort((a,b)=>a.meters-b.meters)[0]?.sw || null;
  }
  function renderDetail() {
    const element=selected?.kind==='item'?plan.items.find(i=>i.id===selected.id):null;
    const wall=selected?.kind==='wall'?plan.walls.find(w=>w.id===selected.id):null;
    if(wall){$('detailTitle').textContent='遮挡墙';$('detail').innerHTML=`<p class="hint">长度约 ${M.distance({x:wall.x1,y:wall.y1},{x:wall.x2,y:wall.y2},plan.width,plan.height).toFixed(1)} 米。需要调整位置时，可删除后重新绘制。</p><div class="detail-actions"><button id="removeSelected" class="danger">删除这段墙</button></div>`;return;}
    if(!element){$('detailTitle').textContent='选择一个点位';$('detail').innerHTML='<p class="empty-hint">点击画布中的点位查看详细参数；选择工具后点击画布可添加。拖动点位可重新定位。</p>';return;}
    $('detailTitle').textContent=`${labels[element.type]}参数`;
    let html=`<div class="detail-grid"><label class="full">名称<input data-field="name" maxlength="50" value="${safe(element.name)}"></label>${field('x','距左边（米）',+(element.x*plan.width).toFixed(1),0,plan.width,.1)}${field('y','距上边（米）',+(element.y*plan.height).toFixed(1),0,plan.height,.1)}`;
    if(mode==='camera'){
      const model=C.model(element.modelId), lens=C.lens(element.modelId,element.lensId);
      const modelOptions=Object.entries(C.MODELS).map(([id,data])=>`<option value="${id}" ${element.modelId===id?'selected':''}>${safe(data.name)} · ${safe(data.kind)}</option>`).join('');
      const lensOptions=`<option value="custom" ${!lens?'selected':''}>自定义角度 / 未指定</option>`+model.lenses.map(data=>`<option value="${data.id}" ${element.lensId===data.id?'selected':''}>${safe(data.label)} · 水平 ${data.hFov}°</option>`).join('');
      html+=`<label class="full">参考机型<select data-field="modelId">${modelOptions}</select></label><label class="full">镜头焦距 / 视角版本<select data-field="lensId" ${element.modelId==='custom'?'disabled':''}>${lensOptions}</select></label>`;
      html+=`${field('angle','平面朝向（°；0 向右）',element.angle,0,359)}${field('fov','水平视角（°；用于平面覆盖）',element.fov,5,170)}${field('vFov','垂直视角（°；仅记录）',element.vFov,0,140)}${field('range','可视示意距离（米）',element.range,.5,100,.5)}${field('identifyRange','DORI I 参考识别距离（米）',element.identifyRange,0,200,.1)}${field('height','安装高度（米；仅记录）',element.height,1,15,.1)}${field('bitrate','平均码率（Mb/s）',element.bitrate,.1,100,.1)}${field('power','PoE 规划功率（W）',element.power,0,100,.5)}`;
      html+=`<p class="camera-optics-note">${lens?'已载入该镜头的厂家参考数据。':'当前角度或距离为自定义值，请核对实际镜头。'}按当前水平视角，距镜头 ${element.range} 米处的理论横向画幅约 ${M.fieldWidthAtDistance(element.fov,element.range)} 米；未考虑遮挡、垂直俯仰与照明。${model.url?` <a href="${safe(model.url)}" target="_blank" rel="noopener noreferrer">查看海康官方规格 ↗</a>`:''}</p>`;
    }
    if(mode==='cabling'){
      if(element.type==='switch')html+=`${field('ports','可用 PoE 端口',element.ports,1,96)}${field('budget','PoE 总预算（W）',element.budget,1,3000)}<label>端口 PoE 类型<select data-field="poeType">${M.poeTiers.map(t=>`<option value="${t.id}" ${element.poeType===t.id?'selected':''}>${t.label}</option>`).join('')}</select></label>${field('perPortW','单端口最大 PSE 功率（W）',element.perPortW,1,100,.1)}`;
      else html+=`${field('power','终端最大功耗（PD 侧 W）',element.power,0,100,.1)}${field('runningPower','运行功耗参考（W）',element.runningPower,0,100,.1)}<label>终端所需 PoE 类型<select data-field="poeType"><option value="auto" ${element.poeType==='auto'?'selected':''}>按最大功耗推断</option>${M.poeTiers.map(t=>`<option value="${t.id}" ${element.poeType===t.id?'selected':''}>${t.label}</option>`).join('')}</select></label>${field('portNumber','交换机端口号（0 为自动）',element.portNumber,0,96)}${field('verticalM','竖向及上架线长（米）',element.verticalM,0,200,.1)}${field('patchM','两端跳线合计（米）',element.patchM,0,30,.1)}<label class="full">接入交换机<select data-field="switchId"><option value="">未分配</option>${plan.items.filter(i=>i.type==='switch').map(i=>`<option value="${safe(i.id)}" ${element.switchId===i.id?'selected':''}>${safe(i.name)}</option>`).join('')}</select></label>`;
    }
    if(mode==='meeting'&&avPresets[element.type]){
      const presets=avPresets[element.type];
      html+=`<label class="full">设备类型 / 参数起点<select data-field="avPreset"><option value="custom" ${element.avPreset==='custom'?'selected':''}>自定义参数</option>${Object.entries(presets).map(([key,data])=>`<option value="${key}" ${element.avPreset===key?'selected':''}>${safe(data.label)}</option>`).join('')}</select></label>`;
      html+=field('range',element.type==='mic'?'几何收音参考距离（米）':element.type==='speaker'?'扩声参考距离（米）':'规划可达距离（米）',element.range,.5,100,.5);
      html+=field('angle','平面朝向（°；90 向下）',element.angle,0,359);
      html+=field('fov',element.type==='mic'?'拾音参考角（360 为全向）':element.type==='speaker'?'扩声参考角（360 为全向）':'水平视角（°）',element.fov,20,['mic','speaker'].includes(element.type)?360:170);
      if(element.type==='camera')html+=`${field('hPixels','输出画面水平像素',element.hPixels,640,7680)}${field('minFacePx','面部宽度参考阈值（像素）',element.minFacePx,10,200)}<p class="camera-optics-note">按约 16 cm 面部宽度计算画面像素；不考虑俯仰、裁切、自动取景、编码和照明。</p>`;
      if(element.type==='screen')html+=`${field('diagonalIn','屏幕对角线（英寸）',element.diagonalIn,24,300)}${field('textPx','最小文字高度（内容像素）',element.textPx,12,120)}${field('contentHeightPx','内容画布高度（像素）',element.contentHeightPx,480,4320)}${field('minTextArcMin','最小文字视角阈值（角分）',element.minTextArcMin,5,60)}<p class="camera-optics-note">按 16:9 画面估算文字视角；投影亮度、环境光、实际版式和遮挡尚需现场核对。</p>`;
      if(element.type==='speaker')html+=`${field('spl1m','距 1 米参考声级（dBA）',element.spl1m,50,110)}<p class="camera-optics-note">只按自由场距离衰减估算座位声级，不模拟真实声场；请填实际系统调试后的参考值。</p>`;
      if(element.type==='mic')html+='<p class="camera-optics-note">填写距离是规划假设，不是话筒“超过此距离就收不到声音”的物理边界。请结合话筒类型、房间噪声与混响现场试录。</p>';
    }
    html+='</div><div class="detail-actions">';
    if(mode==='cabling'&&element.type!=='switch'){
      const suggestion=recommendedSwitch(element);
      if(suggestion)html+=`<button id="recommendSwitch" data-switch="${safe(suggestion.id)}">建议接入：${safe(suggestion.name)}</button>`;
      html+='<button id="clearRoute">清空转折点</button>';
    }
    html+='<button id="removeSelected" class="danger">删除点位</button></div>';
    if(mode==='cabling'&&element.type!=='switch')html+=`<p class="hint">已有 ${element.waypoints.length} 个路径转折点。推荐交换机按距离和剩余端口、功率筛选，需您点击确认；最终仍需核对线缆路由和设备规格。</p>`;
    $('detail').innerHTML=html;
  }
  function render() { draw();renderStats();renderDetail(); }
  function hit(p) { for(const i of [...plan.items].reverse())if(Math.hypot(px(i.x-p.x),py(i.y-p.y))<20)return {kind:'item',id:i.id};for(const w of plan.walls){const ax=px(w.x1),ay=py(w.y1),bx=px(w.x2),by=py(w.y2),cx=px(p.x),cy=py(p.y),t=M.clamp(((cx-ax)*(bx-ax)+(cy-ay)*(by-ay))/Math.max(1,(bx-ax)**2+(by-ay)**2),0,1);if(Math.hypot(cx-(ax+t*(bx-ax)),cy-(ay+t*(by-ay)))<9)return {kind:'wall',id:w.id};}return null; }
  canvas.addEventListener('pointerdown',event=>{
    event.preventDefault();const p=point(event);canvas.setPointerCapture(event.pointerId);
    if(tool==='wall'){wallDraft={id:uid(),x1:p.x,y1:p.y,x2:p.x,y2:p.y};draw();return;}
    if(tool==='route'){const i=plan.items.find(v=>v.id===selected?.id);if(!i||i.type==='switch'){status('请先用“选择 / 拖动”选中一台终端，再添加路径点。',true);return;}if(i.waypoints.length>=12){status('一条链路最多设置 12 个转折点。',true);return;}i.waypoints.push(p);changed();return;}
    if(tool!=='select'){if(plan.items.length>=300){status('最多 300 个点位。',true);return;}const i=item(tool,p.x,p.y,plan.items.filter(v=>v.type===tool).length+1);plan.items.push(i);selected={kind:'item',id:i.id};changed();return;}
    selected=hit(p);moving=selected?.kind==='item';stage.classList.toggle('dragging',moving);renderDetail();draw();
  });
  canvas.addEventListener('pointermove',event=>{if(!canvas.hasPointerCapture(event.pointerId))return;const p=point(event);if(wallDraft){wallDraft.x2=p.x;wallDraft.y2=p.y;draw();}else if(moving){const i=plan.items.find(v=>v.id===selected?.id);if(i){i.x=p.x;i.y=p.y;draw();}}});
  function finish() {if(wallDraft){const len=M.distance({x:wallDraft.x1,y:wallDraft.y1},{x:wallDraft.x2,y:wallDraft.y2},plan.width,plan.height);if(len>=.3){plan.walls.push(wallDraft);selected={kind:'wall',id:wallDraft.id};}wallDraft=null;changed();}if(moving){moving=false;stage.classList.remove('dragging');changed();}}
  canvas.addEventListener('pointerup',finish);canvas.addEventListener('pointercancel',finish);
  document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>{tool=b.dataset.tool;document.querySelectorAll('[data-tool]').forEach(v=>{const on=v===b;v.classList.toggle('active',on);v.setAttribute('aria-pressed',String(on));});$('toolHint').textContent=tool==='select'?'选择点位后拖动；在右侧编辑参数。':tool==='wall'?'按住并拖动，绘制一段遮挡墙。':tool==='route'?'先选中终端，再点击画布依次添加路径转折点。':`点击平面图放置${labels[tool]}。`;}));
  $('detail').addEventListener('change',event=>{const el=event.target,key=el.dataset.field;if(!key)return;const i=plan.items.find(v=>v.id===selected?.id);if(!i)return;if(key==='name')i.name=el.value.trim().slice(0,50)||labels[i.type];else if(key==='switchId')i.switchId=plan.items.some(v=>v.type==='switch'&&v.id===el.value)?el.value:'';else if(mode==='meeting'&&key==='avPreset'){i.avPreset=Object.hasOwn(avPresets[i.type],el.value)?el.value:'custom';if(i.avPreset!=='custom')Object.assign(i,avPresets[i.type][i.avPreset]);}else if(mode==='cabling'&&key==='poeType'){i.poeType=M.poeTiers.some(t=>t.id===el.value)?el.value:'auto';if(i.type==='switch')i.perPortW=M.poeTiers.find(t=>t.id===i.poeType)?.pseW||30;}else if(mode==='camera'&&key==='modelId'){i.modelId=Object.hasOwn(C.MODELS,el.value)?el.value:'custom';const first=C.model(i.modelId).lenses[0];if(first)Object.assign(i,C.optics(i.modelId,first.id));else i.lensId='custom';}else if(mode==='camera'&&key==='lensId'){const preset=C.optics(i.modelId,el.value);if(preset)Object.assign(i,preset);else i.lensId='custom';}else if(key==='x')i.x=num(el.value,i.x*plan.width,0,plan.width)/plan.width;else if(key==='y')i.y=num(el.value,i.y*plan.height,0,plan.height)/plan.height;else{const limits={angle:[0,359],fov:[mode==='camera'?5:20,mode==='meeting'&&['mic','speaker'].includes(i.type)?360:170],vFov:[0,140],identifyRange:[0,200],range:[.5,100],hPixels:[640,7680],minFacePx:[10,200],diagonalIn:[24,300],textPx:[12,120],contentHeightPx:[480,4320],minTextArcMin:[5,60],spl1m:[50,110],power:[0,100],runningPower:[0,100],perPortW:[1,100],portNumber:[0,96],verticalM:[0,200],patchM:[0,30],bitrate:[.1,100],height:[1,15],ports:[1,96],budget:[1,3000]};if(limits[key]){const before=i[key];i[key]=num(el.value,i[key],...limits[key]);if(key==='portNumber')i[key]=Math.round(i[key]);if(mode==='cabling'&&key==='power'&&i.runningPower===before)i.runningPower=i.power;if(mode==='camera'&&['fov','vFov','identifyRange'].includes(key))i.lensId='custom';if(mode==='meeting'&&avPresets[i.type])i.avPreset='custom';}}changed();});
  $('detail').addEventListener('click',event=>{if(event.target.id==='recommendSwitch'){const i=plan.items.find(v=>v.id===selected?.id),sw=i&&recommendedSwitch(i);if(sw&&sw.id===event.target.dataset.switch){i.switchId=sw.id;i.portNumber=0;changed();status(`已接入 ${sw.name}，端口号按当前方案自动分配。`);}return;}if(event.target.id==='clearRoute'){const i=plan.items.find(v=>v.id===selected?.id);if(i){i.waypoints=[];changed();}}if(event.target.id==='removeSelected'){if(!confirm('确定删除选中的点位或墙段？'))return;if(selected?.kind==='item'){const index=plan.items.findIndex(i=>i.id===selected.id);if(index>=0){const removed=plan.items.splice(index,1)[0];if(removed.type==='switch')for(const i of plan.items)if(i.switchId===removed.id)i.switchId='';}}else{plan.walls=plan.walls.filter(w=>w.id!==selected?.id);}selected=null;changed();}});
  for(const id of ['width','height','days','slack','reservePct','noiseDb','rt60','targetSplDb'])if($(id))$(id).addEventListener('change',e=>{if(id==='width'||id==='height')plan[id]=num(e.target.value,plan[id],3,200);else{const limits={days:[1,365],slack:[0,50],reservePct:[0,50],noiseDb:[20,80],rt60:[.1,3],targetSplDb:[45,90]};plan.settings[id]=num(e.target.value,plan.settings[id],...limits[id]);}stage.style.setProperty('--plan-aspect',`${plan.width}/${plan.height}`);sync();save();});
  $('imageFile').addEventListener('change',async event=>{const file=event.target.files[0];event.target.value='';if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>15*1024*1024){status('请选择不超过 15 MB 的 PNG、JPEG 或 WebP 图纸。',true);return;}try{const bitmap=await createImageBitmap(file);const ratio=Math.min(1,1800/bitmap.width,1200/bitmap.height);const c=document.createElement('canvas');c.width=Math.max(1,Math.round(bitmap.width*ratio));c.height=Math.max(1,Math.round(bitmap.height*ratio));const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(bitmap,0,0,c.width,c.height);bitmap.close?.();const data=c.toDataURL('image/jpeg',.8);if(data.length>3500000)throw new Error('压缩后的图纸仍过大');plan.imageData=data;imageChanged();save();status('图纸已在本地导入。请核对场地尺寸与图纸比例。');}catch(error){status(`无法导入图纸：${error.message}`,true);}});
  $('removeImage').addEventListener('click',()=>{if(!plan.imageData)return;if(!confirm('从当前方案中移除图纸？点位仍会保留。'))return;plan.imageData='';imageChanged();save();});
  $('backup').addEventListener('click',()=>{download(`${mode}-plan-${new Date().toISOString().slice(0,10)}.json`,new Blob([JSON.stringify(plan,null,2)],{type:'application/json'}));status('完整备份已下载，包含图纸与全部点位。');});
  if(mode==='cabling')$('report').addEventListener('click',()=>{
    const estimate=M.cableEstimate(plan);
    const line=values=>values.map(value=>{let content=String(value??'').replace(/[\r\n]+/g,' ');if(/^\s*[=+\-@]/.test(content))content=`'${content}`;return `"${content.replace(/"/g,'""')}"`;}).join(',');
    const rows=[line(['终端','类型','交换机','端口','PoE类型','PD最大功耗W','PSE预算W','运行功耗W','永久链路m','含跳线信道m','核对项'])];
    for(const row of estimate.rows)rows.push(line([row.name,labels[row.type],row.switchName,row.switchId?row.portNumber:'',M.poeTiers.find(t=>t.id===row.poeType)?.label||row.poeType,row.watts,row.allocatedW,row.runningW,row.length,row.channelLength,row.issues.join('；')]));
    rows.push('',line(['交换机','端口使用','端口类型','单端口上限W','分配预算W','填写运行功耗W','总预算W','扣预留后预算W','核对项']));
    for(const sw of estimate.budgets)rows.push(line([sw.name,`${sw.portsUsed}/${sw.ports}`,M.poeTiers.find(t=>t.id===sw.poeType)?.label||sw.poeType,sw.portLimitW,sw.watts,sw.runningW,sw.budget,sw.usableW,sw.overloaded?'端口数或总功率超限':sw.reserveExceeded?'已占用预留功率':'']));
    rows.push('',line(['说明','本清单仅是本地规划估算；90m永久链路、100m信道为规划提醒，不代替现场验收。']));
    download(`cabling-checklist-${new Date().toISOString().slice(0,10)}.csv`,new Blob(['\ufeff'+rows.join('\r\n')],{type:'text/csv;charset=utf-8'}));
    status('施工核对清单已下载；CSV 不含图纸，请另行保存完整 JSON 备份。');
  });
  $('restoreFile').addEventListener('change',async event=>{const file=event.target.files[0];event.target.value='';if(!file)return;if(file.size>6*1024*1024){status('备份文件超过 6 MB，请检查。',true);return;}try{const p=normalize(JSON.parse(await file.text()));if(!confirm('恢复备份会覆盖当前方案。确定继续？'))return;plan=p;selected=null;sync();save();status('备份已恢复。');}catch(error){status(`恢复失败：${error.message}`,true);}});
  $('png').addEventListener('click',()=>{draw();canvas.toBlob(blob=>blob&&download(`${mode}-plan.png`,blob),'image/png');});
  $('newPlan').addEventListener('click',()=>{if(!confirm('新建空白方案会替换当前方案。建议先导出备份，是否继续？'))return;plan=blank();selected=null;sync();save();status('已新建空白方案。');});
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(draw).observe(stage);else window.addEventListener('resize',draw);
  sync();
})();
