import { el, btn, field, select, panel, row, grid, table, dialog, download, csv, ready, clone } from '../ops-ui.js';
const api = await ready('LocalAssets'), M = window.OpsModels;
const p = panel('扫码盘点任务', '先建立盘点快照，再连续扫码或输入资产编号。盘点不会自动借出、归还或报废；差异预览确认后，仅更新实物位置 / 状态与耗材数量。任务与结果包含在原有完整备份中。');
const task = select('盘点任务', []), name = field('新任务名称'), scope = field('按位置筛选（空白为全部）'), input = field('二维码内容 / 资产编号（扫码枪回车）');
name.input.maxLength = 100; scope.input.maxLength = 160; input.input.maxLength = 420;
const location = field('本次实际位置（空白保持原位置）'), condition = select('本次实物状态', [['', '保持原状态'], ['good', '完好'], ['faulty', '故障'], ['maintenance', '维修中'], ['unknown', '未记录']]);
const output = el('div'), status = el('p', '', { class: 'ops-status', role: 'status' }), video = el('video', null, { muted: true, playsInline: true, hidden: true });
let stream = null, timer = null, cameraGeneration = 0, lastCode = '', lastAt = 0;
p.append(grid(task.label, name.label, scope.label), row(btn('新建盘点任务', create, 'primary'), btn('删除当前任务', () => { const t = current(); if (!t || !confirm('将此盘点任务移入回收站？不删除物品或流水，可从回收站恢复。')) return; api.update(d => { d.stocktakes = (d.stocktakes || []).filter(x => x.id !== t.id); }); render(); })), grid(input.label, location.label, condition.label), row(btn('登记已找到', () => scan(input.input.value)), btn('连续摄像头扫码', startCamera), btn('停止摄像头', stopCamera), btn('预览差异与完成盘点', finish), btn('导出盘点结果 CSV', exportResult)), video, status, output);
task.input.addEventListener('change', () => { stopCamera(); render(); }); input.input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); scan(input.input.value); } });
function current() { return (api.state().stocktakes || []).find(t => t.id === task.input.value); }
function create() {
  const data = api.state(), stocks = api.ledger(data).stocks, title = name.input.value.trim(), q = scope.input.value.trim(); if (!title) throw Error('请输入盘点任务名称');
  const items = data.items.filter(i => !i.archived && i.condition !== 'retired' && (!q || i.location.includes(q))).map(i => ({ id: i.id, name: i.name, assetNo: i.assetNo || i.id, kind: i.kind, expected: stocks.get(i.id), location: i.location, originalCondition: i.condition, result: 'pending', actual: null, observedLocation: i.location, condition: i.condition, note: '' }));
  if (!items.length) throw Error('当前筛选没有可盘点物品'); const id = crypto.randomUUID();
  api.update(d => { d.stocktakes = d.stocktakes || []; d.stocktakes.push({ id, name: title, at: new Date().toISOString(), status: 'open', closedAt: '', items }); }); render(id); status.textContent = `已建立 ${items.length} 项快照。借出资产的在库预期为 0，找到实物也不会自动归还。`;
}
function scan(value) {
  try {
    const t = current(); if (!t || t.status !== 'open') throw Error('请先选择进行中的盘点任务');
    value = value.trim(); let id = value; if (value.startsWith('YJ-ASSET:1:')) { id = decodeURIComponent(value.slice(11)); if ('YJ-ASSET:1:' + encodeURIComponent(id) !== value) throw Error('二维码格式无效'); }
    const r = t.items.find(x => x.id === id || x.assetNo.toLowerCase() === value.toLowerCase()); if (!r) throw Error('不属于本次盘点快照，不会自动创建物品');
    if (r.kind === 'consumable') { stopCamera(); edit(r); return; }
    const place = location.input.value.trim() || r.location, c = condition.input.value || r.originalCondition;
    api.update(d => { const target = d.stocktakes.find(x => x.id === t.id).items.find(x => x.id === r.id); Object.assign(target, { result: place !== r.location || c !== r.originalCondition ? 'mismatch' : 'found', actual: 1, observedLocation: place, condition: c }); });
    input.input.value = ''; render(t.id); status.textContent = `${r.name} · ${r.assetNo} 已登记；重复扫码不会增加数量。`; input.input.focus();
  } catch (e) { status.textContent = e.message; }
}
function edit(r) {
  const t = current(); if (!t || t.status !== 'open') return;
  const d = dialog(`核对：${r.name}`), result = select('盘点结果', [['pending', '未盘'], ['found', '已找到'], ['mismatch', '位置 / 状态不符'], ['missing', '未找到']]), actual = field('实盘数量（耗材必填）', 'number', r.actual ?? r.expected), place = field('实物位置', 'text', r.observedLocation), c = select('实物状态', [['unknown', '未记录'], ['good', '完好'], ['faulty', '故障'], ['maintenance', '维修中']]), note = field('差异说明', 'textarea', r.note);
  result.input.value = r.result; c.input.value = r.condition; actual.input.min = 0; actual.input.max = 1000000; actual.label.hidden = r.kind === 'asset';
  d.append(grid(result.label, actual.label, place.label, c.label), note.label, row(btn('保存盘点观察', () => {
    api.update(data => { const x = data.stocktakes.find(x => x.id === t.id).items.find(x => x.id === r.id); x.result = result.input.value; x.actual = x.result === 'pending' ? null : x.result === 'missing' ? 0 : r.kind === 'asset' ? 1 : Number(actual.input.value); x.observedLocation = place.input.value; x.condition = c.input.value; x.note = note.input.value; }); d.close(); render(t.id);
  }, 'primary'), btn('取消', () => d.close()))); d.showModal();
}
function finish() {
  const t = current(); if (!t || t.status !== 'open') throw Error('请选择进行中的盘点任务');
  const data = api.state(), changes = M.stocktakeChanges(t, data, api.ledger(data).stocks), d = dialog('差异预览 · 确认后入账');
  d.append(el('p', `可应用 ${changes.changes.length} 项；未盘、资产未找到、借还和报废不会自动处理；耗材未找到按实盘 0 预览调整。`), table(['资产 / 物料', '拟应用变更'], changes.changes.map(c => [t.items.find(r => r.id === c.id)?.assetNo, c.kind === 'asset' ? `位置 ${c.location || '未填写'} · 状态 ${c.condition}` : `库存调整 ${c.delta > 0 ? '+' : ''}${c.delta}`])), table(['保留差异 / 提醒'], changes.warnings.map(s => [s])));
  d.append(row(btn('确认应用并完成', () => {
    api.update(next => {
      const live = next.stocktakes.find(x => x.id === t.id); if (!live || live.status !== 'open' || JSON.stringify(live) !== JSON.stringify(t)) throw Error('盘点任务已变化，请重新预览');
      const checked = M.stocktakeChanges(live, next, api.ledger(next).stocks); if (JSON.stringify(checked) !== JSON.stringify(changes)) throw Error('台账已变化，请重新预览');
      for (const c of checked.changes) { const i = next.items.find(i => i.id === c.id); if (c.kind === 'asset') { i.location = c.location; i.condition = c.condition; } else next.entries.push({ id: crypto.randomUUID(), itemId: c.id, action: 'adjust', qty: c.delta, person: '', note: c.note, due: '', at: new Date().toISOString(), loanId: '' }); }
      live.status = 'closed'; live.closedAt = new Date().toISOString();
    }); d.close(); stopCamera(); render(t.id); status.textContent = '盘点已完成，差异记录保留在完整备份中。';
  }, 'primary'), btn('返回继续核对', () => d.close()))); d.showModal();
}
function exportResult() { const t = current(); if (!t) throw Error('请选择盘点任务'); download('盘点结果.csv', csv([['任务', '编号', '名称', '类型', '预期在库', '实盘', '结果', '原位置', '实物位置', '状态', '说明'], ...t.items.map(r => [t.name, r.assetNo, r.name, r.kind, r.expected, r.actual ?? '', r.result, r.location, r.observedLocation, r.condition, r.note])]), 'text/csv;charset=utf-8'); }
function render(selected) {
  const value = selected || task.input.value, tasks = api.state().stocktakes || []; task.input.replaceChildren(new Option('请选择任务', '')); tasks.slice().reverse().forEach(t => task.input.add(new Option(`${t.name} · ${t.status === 'open' ? '进行中' : '已完成'}`, t.id))); task.input.value = value;
  const t = current(); output.replaceChildren(); if (!t) return;
  const counts = Object.fromEntries(['pending', 'found', 'mismatch', 'missing'].map(k => [k, t.items.filter(r => r.result === k).length]));
  output.append(el('h3', `未盘 ${counts.pending} · 已找到 ${counts.found} · 不符 ${counts.mismatch} · 未找到 ${counts.missing}`), table(['编号 / 物品', '预期在库', '实盘', '位置', '结果', '操作'], t.items.map(r => () => [r.assetNo + ' · ' + r.name, r.expected, r.actual ?? '—', r.observedLocation || '—', { pending: '未盘', found: '已找到', mismatch: '不符', missing: '未找到' }[r.result], t.status === 'open' ? btn('核对', () => edit(r)) : '已完成'])));
}
function stopCamera() { cameraGeneration++; clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()); stream = null; video.srcObject = null; video.hidden = true; }
async function startCamera() {
  stopCamera(); if (current()?.status !== 'open') throw Error('先选择进行中的盘点任务');
  const token = cameraGeneration;
  try {
    if (!window.YJJsQR) await new Promise((resolve, reject) => { const s = el('script', null, { src: '../display/qr.js?v=1' }); s.onload = resolve; s.onerror = () => reject(Error('扫码组件加载失败')); document.head.append(s); });
    if (token !== cameraGeneration) return;
    const live = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } } }); if (token !== cameraGeneration) { live.getTracks().forEach(t => t.stop()); return; }
    stream = live; video.srcObject = live; video.hidden = false; await video.play();
    const canvas = el('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
    const tick = () => { if (token !== cameraGeneration || !stream) return; if (video.readyState >= 2) { const scale = Math.min(1, 800 / video.videoWidth); canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale); ctx.drawImage(video, 0, 0, canvas.width, canvas.height); const code = window.YJJsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height); if (code && (code.data !== lastCode || Date.now() - lastAt > 2000)) { lastCode = code.data; lastAt = Date.now(); scan(code.data); } } timer = setTimeout(tick, 300); }; tick();
  } catch (e) { stopCamera(); status.textContent = '摄像头不可用：' + e.message + '。可使用扫码枪或手动编号。'; }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) stopCamera(); }); window.addEventListener('pagehide', stopCamera); window.addEventListener('yj-assets-update', () => { stopCamera(); render(); }); render();

