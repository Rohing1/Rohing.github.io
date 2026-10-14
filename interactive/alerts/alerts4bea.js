import { DEFAULTS, PRESETS, normalize, parseSamples, evaluate } from 'alerts-model4bea.js?v=20261001';

const KEY = 'yj-alert-sandbox-v1';
const $ = id => document.getElementById(id);
const fields = Object.keys(DEFAULTS);
const svgNS = 'http://www.w3.org/2000/svg';
const fmt = value => Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const svg = (tag, attrs = {}) => {
  const element = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  return element;
};
let config = { ...DEFAULTS };
let timer;

function fillForm() { for (const key of fields) $(key).value = config[key]; }

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ app: 'yj-alert-sandbox', version: 1, config }));
    $('save-state').textContent = '规则和样本已保存在此浏览器；请定期导出完整备份。';
  } catch { $('save-state').textContent = '本机保存失败，请立即导出完整备份。'; }
}

function chart(model) {
  const host = $('alert-chart');
  host.replaceChildren();
  const values = model.points.map(point => point.value).filter(value => value !== null);
  const low = Math.min(model.config.threshold, ...values);
  const high = Math.max(model.config.threshold, ...values);
  const pad = Math.max((high - low) * .12, 1);
  const bottom = low - pad, top = high + pad;
  const x = index => 48 + index * 672 / (model.points.length - 1);
  const y = value => 190 - (value - bottom) / (top - bottom) * 145;
  for (let row = 0; row < 4; row++) host.append(svg('line', { x1: 48, x2: 720, y1: 45 + row * 48, y2: 45 + row * 48, class: 'alert-grid' }));
  host.append(svg('line', { x1: 48, x2: 720, y1: y(model.config.threshold), y2: y(model.config.threshold), class: 'alert-threshold' }));
  const thresholdLabel = svg('text', { x: 52, y: Math.max(17, y(model.config.threshold) - 8), class: 'alert-axis' });
  thresholdLabel.textContent = `阈值 ${fmt(model.config.threshold)}`;
  host.append(thresholdLabel);
  let segment = [];
  const flush = () => { if (segment.length > 1) host.append(svg('path', { d: segment.join(' '), class: 'alert-line' })); segment = []; };
  for (const point of model.points) {
    if (point.value === null) { flush(); continue; }
    segment.push(`${segment.length ? 'L' : 'M'} ${x(point.index)} ${y(point.value)}`);
  }
  flush();
  for (const point of model.points) {
    if (point.value === null) continue;
    const marker = svg('circle', { cx: x(point.index), cy: y(point.value), r: model.points.length > 90 ? 2 : 4, class: `alert-point ${point.state}` });
    const title = svg('title');
    title.textContent = `第 ${fmt(point.minute)} 分钟：${fmt(point.value)}，${point.state}`;
    marker.append(title);
    host.append(marker);
  }
  for (const [index, label] of [[0, '0 分'], [model.points.length - 1, `${fmt(model.points.at(-1).minute)} 分`]]) {
    const text = svg('text', { x: x(index), y: 222, 'text-anchor': index ? 'end' : 'start', class: 'alert-axis' });
    text.textContent = label;
    host.append(text);
  }
  host.setAttribute('aria-label', `${model.config.name}：阈值 ${model.config.comparator} ${fmt(model.config.threshold)}，${model.episodes} 次触发，${model.noData} 个无数据样本`);
}

function table(model) {
  const body = $('alert-rows');
  body.replaceChildren();
  const names = { normal: '正常', pending: '等待', firing: '触发中', nodata: '无数据' };
  for (const point of model.points) {
    const row = document.createElement('tr');
    row.className = point.state;
    for (const value of [point.index + 1, `${fmt(point.minute)} 分钟`, point.value === null ? 'NA' : fmt(point.value), names[point.state], point.event || '—']) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    body.append(row);
  }
}

function render() {
  try {
    const model = evaluate(config);
    $('alert-error').hidden = true;
    $('first-firing').textContent = model.firstFiring === null ? '未触发' : `第 ${fmt(model.firstFiring)} 分钟`;
    $('firing-note').textContent = `${model.points.length} 次评估 · ${model.noData} 次无数据`;
    $('episodes').textContent = `${model.episodes} 次`;
    $('episode-note').textContent = `${model.firingSamples} 个评估点处于触发中`;
    $('firing-card').className = `sandbox-metric ${model.episodes ? 'fail' : 'pass'}`;
    chart(model);
    table(model);
  } catch (error) {
    $('alert-error').hidden = false;
    $('alert-error').textContent = error.message;
    $('first-firing').textContent = '—';
    $('episodes').textContent = '—';
    $('firing-note').textContent = '请修正样本输入';
    $('episode-note').textContent = '';
    $('alert-chart').replaceChildren();
    $('alert-rows').replaceChildren();
  }
}

function set(next, refill = false) {
  config = normalize(next);
  if (refill) fillForm();
  render();
  save();
}

function validBackup(value) {
  if (value?.app !== 'yj-alert-sandbox' || value.version !== 1 || !value.config || typeof value.config !== 'object') return false;
  const normal = normalize(value.config);
  if (!fields.every(key => Object.hasOwn(value.config, key) && Object.is(value.config[key], normal[key]))) return false;
  try { parseSamples(normal.samples); return true; } catch { return false; }
}

for (const key of fields) {
  const input = $(key);
  input.addEventListener(key === 'samples' || key === 'name' ? 'input' : 'change', () => {
    const value = typeof DEFAULTS[key] === 'number' ? Number(input.value) : input.value;
    if (typeof DEFAULTS[key] === 'number' && input.value === '') { fillForm(); return; }
    const next = normalize({ ...config, [key]: value });
    if (!Object.is(next[key], value)) { fillForm(); return; }
    if (key === 'samples') {
      config = next; save(); clearTimeout(timer); timer = setTimeout(render, 200);
    } else set(next);
  });
}
document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
  if (window.confirm('载入示例会替换当前规则与样本。请先导出完整备份，是否继续？')) set(PRESETS[button.dataset.preset], true);
}));
$('reset').addEventListener('click', () => { if (window.confirm('恢复默认示例？')) set(DEFAULTS, true); });
$('export').addEventListener('click', () => {
  const backup = { app: 'yj-alert-sandbox', version: 1, exportedAt: new Date().toISOString(), config };
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = '%e5%91%8a%e8%ad%a6%e8%a7%84%e5%88%99%e6%bc%94%e7%bb%83%e5%8f%b0-%e5%ae%8c%e6%95%b4%e5%a4%87%e4%bb%bd.json.html';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
});
$('import').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 16 * 1024) throw Error('备份文件不能超过 16 KB。');
    const value = JSON.parse(await file.text());
    if (!validBackup(value)) throw Error('备份格式、样本或数值无效。');
    if (window.confirm('恢复备份会替换当前规则与样本。请先导出当前完整备份，是否继续？')) set(value.config, true);
  } catch (error) { window.alert(`恢复失败：${error.message}`); }
  finally { event.target.value = ''; }
});
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (validBackup(saved)) config = normalize(saved.config);
} catch { $('save-state').textContent = '旧方案无法读取；可恢复有效备份。'; }
fillForm();
render();
