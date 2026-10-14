import { DEFAULTS, normalize, derive } from 'recovery-model4bea.js?v=20261001';

const KEY = 'yj-recovery-sandbox-v1';
const $ = id => document.getElementById(id);
const fields = Object.keys(DEFAULTS);
const fmt = value => Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 1 });
const duration = hours => hours === null ? '无可用备份' : hours < 1 ? `${fmt(hours * 60)} 分钟` : `${fmt(hours)} 小时`;
let config = { ...DEFAULTS };

function fillForm() {
  for (const key of fields) {
    if (typeof DEFAULTS[key] === 'boolean') $(key).checked = config[key];
    else $(key).value = config[key];
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ app: 'yj-recovery-sandbox', version: 1, config }));
    $('save-state').textContent = '已自动保存在此浏览器；请定期导出完整备份。';
  } catch { $('save-state').textContent = '本机保存失败，请立即导出完整备份。'; }
}

function metric(card, value, status, passed) {
  $(card).className = `sandbox-metric ${passed ? 'pass' : 'fail'}`;
  $(`${card === 'rpo-card' ? 'rpo' : 'rto'}-value`).textContent = value;
  $(`${card === 'rpo-card' ? 'rpo' : 'rto'}-status`).textContent = status;
}

function renderTimeline(model) {
  const track = $('timeline');
  track.replaceChildren();
  for (const snapshot of model.snapshots) {
    const mark = document.createElement('span');
    mark.className = `recovery-tick ${snapshot.status}`;
    mark.style.left = `${2 + 94 * snapshot.at / model.config.failureHour}%`;
    const names = { selected: '最终恢复点', candidate: '候选备份', expired: '超出保留期', copying: '异地副本未到', missed: '任务失败', corrupt: '校验失败' };
    mark.title = `第 ${fmt(snapshot.at)} 小时 · ${names[snapshot.status]}`;
    track.append(mark);
  }
  const failure = document.createElement('span');
  failure.className = 'recovery-failure';
  failure.title = `第 ${fmt(model.config.failureHour)} 小时故障`;
  const start = document.createElement('span');
  start.className = 'edge-label start';
  start.textContent = '第 0 小时';
  const end = document.createElement('span');
  end.className = 'edge-label end';
  end.textContent = `故障 · 第 ${fmt(model.config.failureHour)} 小时`;
  track.append(failure, start, end);
  track.setAttribute('aria-label', model.selected
    ? `故障发生于第 ${fmt(model.config.failureHour)} 小时，最后可用备份是第 ${fmt(model.selected.at)} 小时，数据回退 ${duration(model.dataLossHours)}`
    : `故障发生于第 ${fmt(model.config.failureHour)} 小时，当前条件下无可用备份`);
}

function render() {
  const model = derive(config);
  config = model.config;
  metric('rpo-card', duration(model.dataLossHours), model.rpoPass ? `达到 ≤ ${fmt(config.rpoTargetHours)} 小时目标` : `未达到 ≤ ${fmt(config.rpoTargetHours)} 小时目标`, model.rpoPass);
  metric('rto-card', duration(model.recoveryHours), model.rtoPass ? `达到 ≤ ${fmt(config.rtoTargetHours)} 小时目标` : `未达到 ≤ ${fmt(config.rtoTargetHours)} 小时目标`, model.rtoPass);
  renderTimeline(model);
  $('point-note').textContent = model.selected
    ? `第 ${fmt(model.selected.at)} 小时的备份是最后可用恢复点；故障发生在第 ${fmt(config.failureHour)} 小时，之后的数据可能需要其他途径追回。${config.scenario === 'site' ? '异地副本须在故障前完成复制。' : '假设本地备份独立于故障主机。'}`
    : '当前保留期、复制延迟和失败条件下没有可用备份；无法仅凭此方案计算恢复时间。';
  const breakdown = $('breakdown');
  breakdown.replaceChildren();
  for (const [label, value] of [
    ['准备环境', `${fmt(config.prepareMinutes)} 分钟`],
    ['传输数据', model.selected ? duration(model.transferHours) : '未估算'],
    ['恢复后验证', `${fmt(config.verifyMinutes)} 分钟`]
  ]) {
    const item = document.createElement('div');
    const small = document.createElement('span');
    small.textContent = label;
    const strong = document.createElement('strong');
    strong.textContent = value;
    item.append(small, strong);
    breakdown.append(item);
  }
}

function set(next, refill = false) {
  config = normalize(next);
  if (refill) fillForm();
  render();
  save();
}

function download() {
  const backup = { app: 'yj-recovery-sandbox', version: 1, exportedAt: new Date().toISOString(), config };
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = '%e5%a4%87%e4%bb%bd%e6%81%a2%e5%a4%8d%e6%b2%99%e7%9b%98-%e5%ae%8c%e6%95%b4%e5%a4%87%e4%bb%bd.json.html';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function validBackup(value) {
  if (value?.app !== 'yj-recovery-sandbox' || value.version !== 1 || !value.config || typeof value.config !== 'object') return false;
  const normal = normalize(value.config);
  return fields.every(key => Object.hasOwn(value.config, key) && Object.is(value.config[key], normal[key]));
}

for (const key of fields) {
  const element = $(key);
  element.addEventListener('change', () => {
    const value = typeof DEFAULTS[key] === 'boolean' ? element.checked : typeof DEFAULTS[key] === 'number' ? Number(element.value) : element.value;
    if (typeof DEFAULTS[key] === 'number' && (element.value === '' || !Number.isFinite(value))) { fillForm(); return; }
    const next = normalize({ ...config, [key]: value });
    if (!Object.is(next[key], value)) { fillForm(); return; }
    set(next);
  });
}
$('export').addEventListener('click', download);
$('import').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 32 * 1024) throw Error('备份文件不能超过 32 KB。');
    const value = JSON.parse(await file.text());
    if (!validBackup(value)) throw Error('备份格式或数值无效。');
    if (window.confirm('恢复备份会替换当前方案。请先导出当前完整备份，是否继续？')) set(value.config, true);
  } catch (error) { window.alert(`恢复失败：${error.message}`); }
  finally { event.target.value = ''; }
});
$('reset').addEventListener('click', () => { if (window.confirm('恢复示例方案？')) set(DEFAULTS, true); });
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (validBackup(saved)) config = normalize(saved.config);
} catch { $('save-state').textContent = '旧方案无法读取；请恢复有效的完整备份。'; }
fillForm();
render();
