import { el, btn, field, panel, row, table, dialog, download, csv, ready } from '../ops-ui.js';
const api = await ready('LocalLogs'), M = window.OpsModels;
const p = panel('跨文件时间线与异常关联', '按时间串联多个文件；支持 requestId / traceId 精确关联、异常聚类和前后文。时间修正是分钟偏移（例如 -480），不改变原始日志。聚类只提供线索，不自动判断故障原因。');
const request = field('请求 / 链路 ID（精确匹配）'), offsets = el('div', null, { class: 'ops-grid' }), out = el('div'), status = el('p', '', { class: 'ops-status', role: 'status' });
const order = el('input', null, { type: 'checkbox', checked: true }), orderLabel = el('label', '按校正后的时间排序', { class: 'ops-check' }); orderLabel.prepend(order);
request.input.maxLength = 160;
let shifts = api.correlation().shifts, result = [], generation = 0, worker = null;
request.input.value=api.correlation().request;order.checked=api.correlation().order;
const run = btn('更新关联分析', analyze, 'primary'), cancel = btn('取消', () => { generation++; worker?.terminate(); worker = null; cancel.hidden = true; status.textContent = '已取消关联分析；原始日志未改变。'; run.disabled = false; }); cancel.hidden = true;
p.append(row(request.label, orderLabel, run, cancel, btn('导出关联时间线（脱敏）', () => { if (!result.length) throw Error('先运行关联分析'); download('关联时间线.csv', csv([['校正时间', '来源', '行号', '请求ID', '级别', '内容'], ...result.map(r => [r.adjustedAt == null ? '无时间' : new Date(r.adjustedAt).toISOString(), r.source, r.n, api.scrub(r.requestId), r.level, api.scrub(r.text)])]), 'text/csv;charset=utf-8'); })), offsets, status, out);
function context(r, records) {
  const d = dialog(`${r.source} · 第 ${r.n} 行上下文（脱敏）`);
  const same = records.filter(x => x.source === r.source && Math.abs(x.n - r.n) <= 3); d.append(el('pre', same.map(x => `${x.n === r.n ? '▶' : ' '} ${x.n} ${api.scrub(x.text)}`).join('\n')), row(btn('关闭', () => d.close()))); d.showModal();
}
async function analyze() {
  const token = ++generation, records = api.records();
  if (api.busy()) { status.textContent = '原始日志仍在分析，请等待完成。'; return; }
  if (!records.length) { status.textContent = '请先在上方分析日志；输入变化后需要重新分析。'; return; }
  run.disabled = true; cancel.hidden = false; out.replaceChildren(); status.textContent = '正在逐批建立关联…';
  try {
    worker?.terminate(); worker = new Worker('correlate-worker.20261005.js');
    const w = worker, computed = await new Promise((resolve, reject) => {
      w.onmessage = ({data}) => data.error ? reject(Error(data.error)) : resolve(data);
      w.onerror = e => reject(Error(e.message || '关联分析失败'));
      w.postMessage({records, shifts, request:request.input.value.trim(), order:order.checked});
    });
    w.terminate(); if(worker===w) worker=null;
    if(token!==generation) return;
    result = computed.rows.map(r => ({...records[r.index], ...r}));
    const aggregates = {clusters: computed.clusters, minutes: computed.minutes};
    const display = r => [r.adjustedAt == null ? '无法识别时间（排序末尾）' : new Date(r.adjustedAt).toLocaleString('zh-CN', { hour12: false }), `${r.source}:${r.n}`, api.scrub(r.requestId) || '—', r.level, api.scrub(r.text).slice(0, 500), btn('上下文', () => context(r, records))];
    out.append(el('h3', '统一时间线'), table(['校正时间', '来源', '请求 ID', '级别', '内容（截取）', '查看'], result.slice(0, 5000).map(r => () => display(r))));
    out.append(el('h3', '异常聚类（数字 / 地址归一化）'), table(['模式（脱敏）', '次数', '来源数', '示例上下文'], aggregates.clusters.slice(0, 1000).map(c => () => [api.scrub(c.key), c.count, c.sources, btn('查看', () => context(records[c.sample], records))])));
    const max = aggregates.minutes.reduce((m,x)=>Math.max(m,x[1]),1);
    out.append(el('h3', '每分钟警告与错误趋势'), table(['时间', '数量', '相对频次'], aggregates.minutes.slice(0,5000).map(([at, count]) => () => { const meter = el('div', null, { class: 'ops-meter' }), bar = el('span'); bar.style.width = `${count / max * 100}%`; meter.append(bar); return [new Date(at).toLocaleString('zh-CN'), count, meter]; })));
    status.textContent = `匹配 ${result.length} 行 · 无时间 ${result.filter(r => r.adjustedAt == null).length} 行。界面最多展示前 5000 行时间线、1000 种异常；导出包含全部匹配行。原始时间不带时区时先按浏览器本地时区解析，再加这里的偏移。`;
  } finally { if (token === generation) { run.disabled = false; cancel.hidden = true; } }
}
function sources() {
  const correlation=api.correlation();shifts=correlation.shifts;request.input.value=correlation.request;order.checked=correlation.order;
  const snapshot = api.state(), names = [...new Set([...(snapshot.source ? ['手动输入'] : []), ...snapshot.files.map(f => f.name)])]; offsets.replaceChildren();
  names.forEach(name => { const f = field(`${name} · 时间修正（分钟）`, 'number', shifts[name] || 0); f.input.min = -1440; f.input.max = 1440; f.input.addEventListener('change', () => { const n = Number(f.input.value); if (!Number.isFinite(n) || Math.abs(n) > 1440) { f.input.value = 0; shifts[name] = 0; } else shifts[name] = n; invalidate(); }); offsets.append(f.label); });
}
function invalidate() { api.setCorrelation({shifts,request:request.input.value.trim(),order:order.checked}); generation++; worker?.terminate(); worker = null; result = []; out.replaceChildren(); run.disabled = false; cancel.hidden = true; status.textContent = '日志或关联条件已变化，点击更新关联分析。'; }
request.input.addEventListener('input', invalidate); order.addEventListener('change', invalidate);
for (const id of ['analyze', 'clear', 'sample']) document.getElementById(id).addEventListener('click', () => { invalidate(); sources(); });
document.getElementById('log-file').addEventListener('change', () => { invalidate(); setTimeout(sources, 1000); });
document.getElementById('source').addEventListener('input', () => { invalidate(); sources(); });
sources();
window.addEventListener('yj-logs-update',()=>{const stored=api.correlation();shifts=stored.shifts;request.input.value=stored.request;order.checked=stored.order;invalidate();sources()});
window.addEventListener('pagehide',()=>worker?.terminate());
