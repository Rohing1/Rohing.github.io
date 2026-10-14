import { DEFAULT, normalize, calculate } from 'power-model.js';

const KEY = 'yj-room-power-planner-v1';
const $ = id => document.getElementById(id);
const fmt = (n, digits = 1) => Number(n).toLocaleString('zh-CN', { maximumFractionDigits: digits });
const unit = (n, suffix, digits = 1) => `${fmt(n, digits)} ${suffix}`;
let scenario = normalize(DEFAULT);
let saveTimer = null;

function setStatus(message) { $('save-state').textContent = message; }

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ app: 'yj-room-power-planner', version: 1, savedAt: new Date().toISOString(), scenario }));
    setStatus('方案已自动保存在当前浏览器 · 请定期导出完整备份');
  } catch {
    setStatus('浏览器保存失败；请立即导出完整备份');
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 250);
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved?.app === 'yj-room-power-planner' && saved.version === 1 && saved.scenario) {
      scenario = normalize(saved.scenario);
      setStatus('已读取此浏览器的规划方案 · 请定期导出完整备份');
    }
  } catch { setStatus('本机方案读取失败；当前显示通用示例，可恢复备份'); }
}

function renderGroups() {
  const host = $('groups');
  host.replaceChildren();
  for (const group of scenario.groups) {
    const row = document.createElement('div');
    row.className = 'group-row';
    row.dataset.id = group.id;
    const name = document.createElement('input');
    name.type = 'text'; name.maxLength = 60; name.value = group.name; name.dataset.groupField = 'name'; name.setAttribute('aria-label', '设备组名称');
    const count = document.createElement('input');
    count.type = 'number'; count.min = '0'; count.max = '100000'; count.step = '1'; count.inputMode = 'numeric'; count.value = group.count; count.dataset.groupField = 'count'; count.setAttribute('aria-label', `${group.name}数量`);
    const watts = document.createElement('input');
    watts.type = 'number'; watts.min = '0'; watts.max = '1000000'; watts.step = '1'; watts.inputMode = 'decimal'; watts.value = group.watts; watts.dataset.groupField = 'watts'; watts.setAttribute('aria-label', `${group.name}单台峰值瓦数`);
    const remove = document.createElement('button');
    remove.type = 'button'; remove.textContent = '×'; remove.title = `删除${group.name}`; remove.setAttribute('aria-label', `删除${group.name}`); remove.dataset.removeGroup = group.id;
    host.append(row); row.append(name, count, watts, remove);
  }
}

function renderFields() {
  for (const field of document.querySelectorAll('[data-field]')) field.value = scenario[field.dataset.field];
  renderGroups();
}

function setText(id, value) { $(id).textContent = value; }

function renderBar(model) {
  const parts = [
    { label: 'IT 负载', value: model.designITKW, color: '#0d9488' },
    { label: '制冷用电', value: model.coolingElectricalKW, color: '#3484c2' },
    { label: '其他用电', value: model.config.upsAuxKW + model.config.directAuxKW, color: '#e7a740' },
    { label: 'UPS 损耗', value: model.upsLossKW, color: '#ad77b7' },
    { label: '配电损耗', value: model.distributionLossKW, color: '#91a5b8' },
  ];
  const bar = $('power-bar'); const legend = $('power-legend'); bar.replaceChildren(); legend.replaceChildren();
  for (const part of parts) {
    const width = model.utilityPeakKW ? Math.max(0, part.value / model.utilityPeakKW * 100) : 0;
    const segment = document.createElement('span'); segment.style.width = `${width}%`; segment.style.backgroundColor = part.color; segment.title = `${part.label} ${unit(part.value, 'kW')}`; bar.append(segment);
    const item = document.createElement('span'); const dot = document.createElement('i'); dot.style.backgroundColor = part.color; item.append(dot, `${part.label} ${unit(part.value, 'kW')}`); legend.append(item);
  }
}

function renderResults() {
  const m = calculate(scenario);
  setText('result-summary', `当前装机 ${unit(m.installedITKW, 'kW')} · 扩容余量 ${fmt(m.config.growthPct, 0)}% · ${m.config.upsTopology.toUpperCase()} UPS`);
  setText('it-peak', unit(m.designITKW, 'kW'));
  setText('ups-size', unit(m.upsPerPathKVA, 'kVA'));
  setText('cooling-size', unit(m.coolingDesignKW, 'kW'));
  setText('cooling-ton', `约 ${fmt(m.coolingDesignKW / 3.51685284)} RT · 用电峰值约 ${unit(m.coolingElectricalKW, 'kW')}`);
  setText('utility-size', unit(m.utilityPerFeedKVA, 'kVA'));
  setText('dock-it', unit(m.designITKW, 'kW'));
  setText('dock-ups', unit(m.upsPerPathKVA, 'kVA'));
  setText('dock-utility', unit(m.utilityPerFeedKVA, 'kVA'));
  setText('utility-current', `总进线峰值约 ${unit(m.utilityPeakKW, 'kW')} · 单路故障工况约 ${unit(m.utilityPerFeedA, 'A', 0)}`);
  if (m.config.upsTopology === 'n1') {
    setText('ups-topology', `N+1 · ${m.upsWorkingModules}+1 台 × ${fmt(m.config.upsModuleKVA)} kVA，装机 ${unit(m.upsInstalledKVA, 'kVA')}`);
  } else if (m.config.upsTopology === '2n') {
    setText('ups-topology', `2N · 2 路各 ≥ ${unit(m.upsPerPathKVA, 'kVA')}，总装机下限 ${unit(m.upsInstalledKVA, 'kVA')}`);
  } else {
    setText('ups-topology', `N · 单系统 ≥ ${unit(m.upsPerPathKVA, 'kVA')}`);
  }
  setText('battery-size', `${unit(m.batteryRequiredPerPathKWh, 'kWh')} / 路${m.config.upsTopology === '2n' ? ` · 双路合计 ${unit(m.batteryInstalledTotalKWh, 'kWh')}` : ''}`);
  setText('cooling-units', `${m.config.coolingRedundancy === 'n1' ? 'N+1' : 'N'} · ${m.coolingInstalledUnits} 台 × ${unit(m.config.coolingUnitKW, 'kW')} 显冷量`);
  setText('utility-feeds', `${m.config.utilityMode === 'dual' ? 'A/B 双路，每路' : '单路'} ≥ ${unit(m.utilityPerFeedKVA, 'kVA')}${m.config.utilityMode === 'dual' ? `；总装机下限 ${unit(m.utilityInstalledKVA, 'kVA')}` : ''}`);
  setText('generator-base', `${unit(m.generatorBaseKVA, 'kVA')} · 未计启动/降额`);
  setText('runtime-detail', `关键交流负载 ${unit(m.upsOutputKW, 'kW')}，目标续航 ${fmt(m.config.runtimeMin, 0)} 分钟。${m.config.batteryInstalledKWh > 0 ? `按填入单路电池容量，理想化估算约 ${fmt(m.batteryEstimatedMinutes, 0)} 分钟。` : '可填写拟配电池标称容量，查看理想化续航。'}${m.config.generatorTransferSec > 0 ? `备用电源预期切换 ${fmt(m.config.generatorTransferSec, 0)} 秒；启动失败的备用情景尚未覆盖。` : ''}实际以厂家放电曲线及寿命末期校核为准。`);
  setText('peak-detail', `UPS 输出 ${unit(m.upsOutputKW, 'kW')}，输入约 ${unit(m.upsInputKW, 'kW')}；制冷电功率已计入总进线。双路装机不等于双倍实际耗电。`);
  setText('monthly-kwh', unit(m.monthlyKWh, 'kWh', 0));
  setText('monthly-cost', `约 ¥${fmt(m.monthlyCost, 0)} / 30 天`);
  setText('average-detail', `当前设备按 ${fmt(m.config.averageITPct, 0)}% 运行时，IT 平均约 ${unit(m.averageITKW, 'kW')}，整间机房进线平均约 ${unit(m.utilityAverageKW, 'kW')}。未来扩容余量不计入此平均值。`);
  renderBar(m);
  const list = $('warnings'); list.replaceChildren();
  const warnings = m.warnings.length ? m.warnings : ['当前简化模型未发现明显容量冲突；仍须核对真实峰值、单线图与厂商资料。'];
  for (const warning of warnings) { const li = document.createElement('li'); li.textContent = warning; list.append(li); }
  $('module-field').hidden = m.config.upsTopology !== 'n1';
}

document.querySelectorAll('[data-field]').forEach(field => {
  const update = () => {
    const key = field.dataset.field;
    if (field.value === '') return;
    scenario = normalize({ ...scenario, [key]: field.tagName === 'SELECT' ? field.value : Number(field.value) });
    renderResults(); scheduleSave();
  };
  field.addEventListener(field.tagName === 'SELECT' ? 'change' : 'input', update);
  if (field.tagName !== 'SELECT') field.addEventListener('change', () => { field.value = scenario[field.dataset.field]; });
});

$('groups').addEventListener('input', event => {
  const field = event.target.dataset.groupField;
  if (!field || (field !== 'name' && event.target.value === '')) return;
  const group = scenario.groups.find(item => item.id === event.target.closest('.group-row')?.dataset.id);
  if (!group) return;
  group[field] = field === 'name' ? event.target.value.slice(0, 60) : Number(event.target.value);
  scenario = normalize(scenario);
  renderResults(); scheduleSave();
});
$('groups').addEventListener('change', event => {
  const row = event.target.closest('.group-row');
  if (!row) return;
  const group = scenario.groups.find(item => item.id === row.dataset.id);
  if (group) { row.querySelector('[data-group-field="count"]').value = group.count; row.querySelector('[data-group-field="watts"]').value = group.watts; }
});
$('groups').addEventListener('click', event => {
  const id = event.target.dataset.removeGroup;
  if (!id) return;
  if (scenario.groups.length === 1) { setStatus('至少保留一条设备组；可将数量设为 0'); return; }
  scenario.groups = scenario.groups.filter(item => item.id !== id);
  renderGroups(); renderResults(); scheduleSave();
});
$('add-group').addEventListener('click', () => {
  if (scenario.groups.length >= 100) { setStatus('最多 100 个设备组'); return; }
  scenario.groups.push({ id: `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: '新设备组', count: 1, watts: 100 });
  renderGroups(); renderResults(); scheduleSave();
  $('groups').lastElementChild.querySelector('input').focus();
});

function download(name, data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
$('export').addEventListener('click', () => download('%e6%9c%ba%e6%88%bf%e4%be%9b%e9%85%8d%e7%94%b5%e4%b8%8e%e5%88%b6%e5%86%b7%e8%a7%84%e5%88%92-%e5%ae%8c%e6%95%b4%e5%a4%87%e4%bb%bd.json.html', {
  app: 'yj-room-power-planner', version: 1, exportedAt: new Date().toISOString(), scenario,
}));
$('import').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    if (file.size > 1024 * 1024) throw Error('备份文件不能超过 1 MB');
    const data = JSON.parse(await file.text());
    if (data?.app !== 'yj-room-power-planner' || data.version !== 1 || !data.scenario || !Array.isArray(data.scenario.groups)) throw Error('不是本工具的完整备份');
    if (!window.confirm('恢复会替换当前方案。请先导出当前完整备份，是否继续？')) return;
    scenario = normalize(data.scenario); renderFields(); renderResults(); save();
  } catch (error) { setStatus(`恢复失败：${error.message}`); }
  finally { event.target.value = ''; }
});
$('reset').addEventListener('click', () => {
  if (!window.confirm('用通用示例替换当前方案？请先导出完整备份。')) return;
  scenario = normalize(DEFAULT); renderFields(); renderResults(); save();
});
$('print').addEventListener('click', () => window.print());

load(); renderFields(); renderResults();
window.ScenarioCompare.mount({
  id: 'room-power', after: '.toolbar',
  get: () => scenario,
  validate: value => {
    if (!value || !Array.isArray(value.groups) || value.groups.length < 1 || value.groups.length > 100) throw Error('设备组结构不正确');
    return normalize(value);
  },
  apply: value => { scenario = normalize(value); renderFields(); renderResults(); save(); },
  metrics: value => {
    const m = calculate(value), metric = (label, amount, suffix, digits = 1) => ({ label, value: amount, unit: suffix, display: unit(amount, suffix, digits) });
    return [
      metric('IT 设计峰值', m.designITKW, 'kW'),
      metric('单路 UPS 下限', m.upsPerPathKVA, 'kVA'),
      metric('单路电池需求', m.batteryRequiredPerPathKWh, 'kWh'),
      metric('制冷显冷量', m.coolingDesignKW, 'kW'),
      metric('单路市电容量', m.utilityPerFeedKVA, 'kVA'),
      metric('月度用电情景', m.monthlyKWh, 'kWh', 0),
      metric('月度电费情景', m.monthlyCost, '元', 0),
    ];
  },
  assumptions: value => `UPS ${value.upsTopology.toUpperCase()}，目标装载率 ${value.upsTargetPct}%，电池续航 ${value.runtimeMin} 分钟；制冷 COP ${value.coolingCOP}，电价 ${value.electricityPrice} 元/kWh，扩容余量 ${value.growthPct}%。`,
  formatDelta: (delta, suffix) => `${fmt(delta, suffix === '元' || suffix === 'kWh' ? 0 : 1)} ${suffix}`,
  caution: '比较只反映输入假设变化，不表示成本报价或设备实际性能；UPS 电池、市电与制冷的实选结果仍需专业复核。'
});
