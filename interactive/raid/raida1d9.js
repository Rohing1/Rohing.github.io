import { LEVELS, DEFAULTS, normalize, capacityTB, derive, toggleFailure, completeRebuild } from 'raid-modela1d9.js?v=20260930b';

const KEY = 'yj-raid-planner-v1';
const $ = id => document.getElementById(id);
const fmt = (value, digits = 2) => Number(value).toLocaleString('zh-CN', { maximumFractionDigits: digits });
const tb = value => value === null ? '—' : `${fmt(value)} TB`;
const tib = value => value * 1_000_000_000_000 / 1_099_511_627_776;
let scenario = { ...DEFAULTS, failed: [] };

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (data?.version === 1 && data.scenario) scenario = normalize(data.scenario);
  } catch { $('save-state').textContent = '无法读取本机保存；可继续使用并导出备份'; }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), scenario }));
    $('save-state').textContent = '方案已自动保存在当前浏览器 · 请定期下载完整备份';
  } catch { $('save-state').textContent = '浏览器保存失败，请立即导出完整备份'; }
}

function setScenario(next) {
  scenario = normalize(next);
  render();
  save();
}

function setText(id, value) { $(id).textContent = value; }

function renderControls(model) {
  const c = model.config;
  document.querySelector(`input[name="level"][value="${c.level}"]`).checked = true;
  setText('level-rule', LEVELS[c.level].rule);
  $('disks').value = c.disks;
  $('diskTB').value = c.diskTB;
  $('diskTB-number').value = c.diskTB;
  $('reserve').value = c.reserve;
  $('rebuildMBps').value = c.rebuildMBps;
  setText('disks-output', `${c.disks} 块`);
  setText('diskTB-output', `${fmt(c.diskTB)} TB`);
  setText('reserve-output', `${c.reserve}%`);
  setText('speed-output', `${c.rebuildMBps} MB/s`);
  const spareSelect = $('spares');
  spareSelect.replaceChildren();
  for (let n = 0; n <= Math.min(8, c.disks - 2); n++) {
    const option = new Option(`${n} 块`, String(n));
    spareSelect.add(option);
  }
  spareSelect.value = String(c.spares);
}

function renderCapacity(model) {
  const { config: c, usableTB, plannedTB, rawTB, reserveTB, overheadTB, spareTB } = model;
  setText('raw-capacity', tb(rawTB));
  setText('raid-capacity', tb(usableTB));
  setText('planned-capacity', tb(plannedTB));
  setText('usable-tib', usableTB === null ? '当前组合不符合此 RAID 级别要求' : `约 ${fmt(tib(usableTB))} TiB · 不含文件系统开销`);
  setText('reserve-note', `扣除 ${c.reserve}% 自定预留`);
  setText('efficiency', usableTB === null ? '配置待调整' : `阵列容量占总标称容量 ${fmt(usableTB / rawTB * 100, 1)}%`);
  setText('capacity-note', usableTB === null
    ? model.reason
    : `配置时成员盘 ${model.active} 块，热备 ${c.spares} 块。阵列可用 ${tb(usableTB)}；镜像 / 校验占 ${tb(overheadTB)}，热备预留占 ${tb(spareTB)}，另从可用空间中建议预留 ${tb(reserveTB)}。${model.completed.length ? ` 已有 ${model.completed.length} 块热备模拟重建为成员盘；此处仍显示初始容量规划。` : ''}`);
  const bar = $('capacity-bar');
  bar.replaceChildren();
  const sections = usableTB === null ? [{ name: 'unavailable', value: rawTB }] : [
    { name: 'data', value: plannedTB }, { name: 'reserve', value: reserveTB },
    { name: 'overhead', value: overheadTB }, { name: 'spare', value: spareTB }
  ];
  for (const section of sections) {
    if (!section.value) continue;
    const segment = document.createElement('div');
    segment.className = section.name;
    segment.style.width = `${section.value / rawTB * 100}%`;
    bar.append(segment);
  }
  bar.setAttribute('aria-label', usableTB === null ? '当前组合无有效容量分配' : `建议使用 ${tb(plannedTB)}，预留 ${tb(reserveTB)}，镜像或校验 ${tb(overheadTB)}，热备 ${tb(spareTB)}`);
}

function renderDisks(model) {
  const grid = $('disk-grid');
  grid.replaceChildren();
  for (let i = 0; i < model.config.disks; i++) {
    const spare = i >= model.active;
    const failed = !spare && model.config.failed.includes(i);
    const replacement = spare ? model.config.replacements.find(item => item.spare === i - model.active)
      : model.config.replacements.find(item => item.member === i);
    const disk = document.createElement(spare ? 'div' : 'button');
    disk.className = `disk${failed ? ' failed' : ''}${spare ? ' spare' : ''}${spare && replacement ? ` ${replacement.status}` : ''}`;
    if (!spare) {
      disk.type = 'button';
      disk.setAttribute('aria-pressed', String(failed));
      disk.setAttribute('aria-label', `成员盘 ${i + 1}，${failed ? replacement?.status === 'complete' ? '故障，已由热备重建替换' : '故障' : '正常'}；点击${failed ? '撤销模拟故障' : '模拟故障'}`);
      disk.addEventListener('click', () => setScenario(toggleFailure(scenario, i)));
    }
    const icon = document.createElement('span');
    icon.className = 'disk-icon';
    icon.setAttribute('aria-hidden', 'true');
    const title = document.createElement('strong');
    title.textContent = spare ? `热备 ${i - model.active + 1}` : `磁盘 ${i + 1}`;
    const subtitle = document.createElement('small');
    subtitle.textContent = spare ? replacement?.status === 'complete' ? `已替换磁盘 ${replacement.member + 1}`
      : replacement ? `接管磁盘 ${replacement.member + 1} · 重建中` : '待命'
      : failed ? replacement?.status === 'complete' ? '故障 · 已替换' : '故障'
        : model.config.level === '10' ? `镜像对 ${Math.floor(i / 2) + 1}` : '正常';
    disk.append(icon, title, subtitle);
    grid.append(disk);
  }
  $('clear-faults').disabled = model.config.failed.length === 0;
}

function renderState(model) {
  const names = { healthy: '阵列正常', degraded: '冗余降低', rebuilding: '热备重建中', unavailable: '模拟不可用', invalid: '组合无效' };
  const badge = $('array-state');
  badge.className = `state-badge ${model.state}`;
  badge.textContent = names[model.state];
  const result = $('fault-result');
  result.className = `fault-result ${model.state}`;
  result.replaceChildren();
  const title = document.createElement('strong');
  title.textContent = names[model.state];
  const explanation = document.createElement('span');
  explanation.textContent = model.reason;
  result.append(title, explanation);
  let detail = '';
  if (['degraded', 'rebuilding'].includes(model.state) && model.config.level === '10') {
    const affectedPairs = [...new Set(model.activeFailures.map(n => Math.floor(n / 2) + 1))];
    detail = ` 已受损镜像对：${affectedPairs.join('、')}；这些镜像对再失去另一块盘就会使阵列不可用。`;
  } else if (['degraded', 'rebuilding'].includes(model.state) && model.config.level === '5') detail = ' 在重建完成前，再有一块成员盘故障将使模拟阵列不可用。';
  else if (['degraded', 'rebuilding'].includes(model.state) && model.config.level === '6') detail = ` 此时还能容忍 ${2 - model.activeFailures.length} 块成员盘故障。`;
  else if (['degraded', 'rebuilding'].includes(model.state) && model.config.level === '1') detail = ` 仍有 ${model.active - model.activeFailures.length} 块有效镜像盘。`;
  if (detail) explanation.textContent += detail;
  $('stage-failure').classList.toggle('active', model.config.failed.length > 0);
  $('stage-rebuilding').classList.toggle('active', Boolean(model.rebuilding));
  $('stage-complete').classList.toggle('active', model.completed.length > 0 && !model.activeFailures.length);
  const complete = $('complete-rebuild');
  complete.hidden = !model.rebuilding;
  complete.disabled = model.state === 'unavailable' || model.state === 'invalid';
  setText('rebuild-stage', model.rebuilding
    ? model.state === 'unavailable' ? '重建前又发生超出容忍范围的故障，不能模拟重建成功；可撤销后来故障或清除模拟。'
      : `热备 ${model.rebuilding.spare + 1} 已接管磁盘 ${model.rebuilding.member + 1}。确认模拟重建完成后，该热备才成为有效成员盘、阵列冗余才恢复。`
    : model.completed.length ? `已模拟完成 ${model.completed.length} 次热备重建；原故障盘不再参与阵列，仍需更换。`
      : model.config.spares ? '热备盘待命；只有成员盘故障后才会接管并开始模拟重建。'
        : '未配置热备盘；成员盘故障后需另行更换硬盘并完成重建。');
  const estimate = fmt(model.rebuildHours, 1);
  setText('rebuild-note', model.config.level === '0'
    ? 'RAID 0 没有冗余，成员盘故障后不能依靠阵列重建恢复数据。'
    : `粗略重建窗口：${tb(model.config.diskTB)} ÷ ${model.config.rebuildMBps} MB/s ≈ ${estimate} 小时。仅是容量 / 速度估算，不是故障概率或完成时间承诺；实际可能显著更久。`);
}

function renderComparison(model) {
  const body = $('comparison-body');
  body.replaceChildren();
  const tolerance = {
    '0': '无冗余，任一成员盘故障即不可用',
    '1': '镜像；至少保留 1 块完整成员盘',
    '5': '任意 1 块成员盘故障',
    '6': '任意 2 块成员盘故障',
    '10': '每一镜像对最多故障 1 块'
  };
  for (const level of Object.keys(LEVELS)) {
    const value = capacityTB(level, model.active, model.config.diskTB);
    const row = document.createElement('tr');
    if (level === model.config.level) row.className = 'current';
    const cells = [LEVELS[level].name, value === null ? '当前盘数不可用' : tb(value), value === null ? '—' : `${fmt(value / model.rawTB * 100, 1)}%`, value === null ? (level === '10' ? '至少 4 块、且成员盘数为偶数' : `至少 ${LEVELS[level].minimum} 块成员盘`) : tolerance[level]];
    for (const cell of cells) {
      const td = document.createElement('td');
      td.textContent = cell;
      if (value === null) td.className = 'invalid-text';
      row.append(td);
    }
    body.append(row);
  }
}

function render() {
  const model = derive(scenario);
  scenario = model.config;
  renderControls(model);
  renderCapacity(model);
  renderDisks(model);
  renderState(model);
  renderComparison(model);
}

function downloadBackup() {
  const backup = { version: 1, app: 'yan-jian-raid-planner', exportedAt: new Date().toISOString(), scenario };
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `RAID-存储容量沙盘-备份-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function validBackup(data) {
  if (data?.version !== 1 || data.app !== 'yan-jian-raid-planner' || !data.scenario || typeof data.scenario !== 'object') return false;
  const s = data.scenario;
  return Object.hasOwn(LEVELS, String(s.level)) && Number.isInteger(s.disks) && s.disks >= 2 && s.disks <= 48
    && Number.isInteger(s.spares) && s.spares >= 0 && s.spares <= Math.min(8, s.disks - 2)
    && Number.isFinite(s.diskTB) && s.diskTB >= 0.25 && s.diskTB <= 100
    && Number.isInteger(s.reserve) && s.reserve >= 0 && s.reserve <= 50
    && Number.isInteger(s.rebuildMBps) && s.rebuildMBps >= 25 && s.rebuildMBps <= 1000
    && Array.isArray(s.failed) && s.failed.every(n => Number.isInteger(n) && n >= 0 && n < s.disks - s.spares)
    && (s.replacements === undefined || (Array.isArray(s.replacements) && s.replacements.length <= s.spares
      && s.replacements.every(item => item && Number.isInteger(item.member) && s.failed.includes(item.member)
        && Number.isInteger(item.spare) && item.spare >= 0 && item.spare < s.spares
        && ['rebuilding', 'complete'].includes(item.status))
      && new Set(s.replacements.map(item => item.member)).size === s.replacements.length
      && new Set(s.replacements.map(item => item.spare)).size === s.replacements.length
      && s.replacements.filter(item => item.status === 'rebuilding').length <= 1));
}

async function importBackup(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 64 * 1024) throw Error('备份文件不能超过 64 KB。');
    const data = JSON.parse(await file.text());
    if (!validBackup(data)) throw Error('备份格式或数值无效，未覆盖本机方案。');
    if (!window.confirm('恢复备份会替换当前浏览器中的 RAID 方案，是否继续？')) return;
    setScenario(data.scenario);
  } catch (error) { window.alert(`恢复失败：${error.message}`); }
  finally { event.target.value = ''; }
}

document.querySelectorAll('input[name="level"]').forEach(input => input.addEventListener('change', () => setScenario({ ...scenario, level: input.value, failed: [], replacements: [] })));
for (const key of ['disks', 'diskTB', 'reserve', 'rebuildMBps']) {
  $(key).addEventListener('input', event => setScenario({ ...scenario, [key]: Number(event.target.value), failed: key === 'disks' ? [] : scenario.failed, replacements: key === 'disks' ? [] : scenario.replacements }));
}
$('diskTB-number').addEventListener('change', event => {
  const value = Number(event.target.value);
  if (!Number.isFinite(value) || value < 0.25 || value > 100 || !Number.isInteger(value * 4)) { window.alert('单盘容量请输入 0.25 至 100 TB，按 0.25 TB 递增。'); render(); return; }
  setScenario({ ...scenario, diskTB: value });
});
$('spares').addEventListener('change', event => setScenario({ ...scenario, spares: Number(event.target.value), failed: [], replacements: [] }));
$('clear-faults').addEventListener('click', () => setScenario({ ...scenario, failed: [], replacements: [] }));
$('complete-rebuild').addEventListener('click', () => setScenario(completeRebuild(scenario)));
const presets = {
  small: { level: '5', disks: 4, spares: 0, diskTB: 4 },
  balanced: { level: '6', disks: 8, spares: 0, diskTB: 8 },
  performance: { level: '10', disks: 12, spares: 0, diskTB: 8 }
};
document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => setScenario({ ...DEFAULTS, ...presets[button.dataset.preset], failed: [], replacements: [] })));
$('export').addEventListener('click', downloadBackup);
$('import').addEventListener('change', importBackup);
$('reset').addEventListener('click', () => { if (window.confirm('恢复示例配置并清除当前故障模拟？')) setScenario({ ...DEFAULTS, failed: [], replacements: [] }); });
load();
render();
