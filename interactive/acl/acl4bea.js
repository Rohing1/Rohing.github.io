import { parseRule, analyzeRules, simulatePacket } from 'acl-model4bea.js?v=20261001';
import { parseCsv, csvCell } from '../network-csv.20261001.js';

const KEY = 'yj-acl-sandbox-v1';
const $ = id => document.getElementById(id);
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const defaultPacket = () => ({ source: '10.1.2.3', destination: '192.0.2.10', protocol: 'tcp', port: '443' });
const defaults = () => ({ rules: [], packet: defaultPacket() });
let state = defaults(), editing = null;

function message(text, kind = '') { $('form-message').textContent = text; $('form-message').className = `network-message ${kind}`; }
function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ app: 'yj-acl-sandbox', version: 1, state })); $('save-state').textContent = '已自动保存在此浏览器；请定期导出完整备份。'; }
  catch { $('save-state').textContent = '本机保存失败，请立即导出完整备份。'; }
}
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function validateRule(raw) {
  if (!raw || typeof raw.name !== 'string' || typeof raw.source !== 'string' || typeof raw.destination !== 'string' || typeof raw.port !== 'string') throw Error('规则字段无效');
  const parsed = parseRule(raw);
  return { id: raw.id || uid(), name: parsed.name, action: parsed.action, source: parsed.source.cidr, destination: parsed.destination.cidr, protocol: parsed.protocol, port: parsed.port.text, enabled: parsed.enabled };
}
function validBackup(value) {
  if (value?.app !== 'yj-acl-sandbox' || value.version !== 1 || !value.state || !Array.isArray(value.state.rules) || value.state.rules.length > 200) return null;
  try {
    const rules = value.state.rules.map(item => {
      if (typeof item.id !== 'string' || item.id.length > 100 || typeof item.enabled !== 'boolean') throw Error('规则格式无效');
      return validateRule(item);
    });
    if (new Set(rules.map(rule => rule.id)).size !== rules.length) return null;
    const packet = value.state.packet;
    if (!packet || typeof packet.source !== 'string' || typeof packet.destination !== 'string' || typeof packet.protocol !== 'string' || typeof packet.port !== 'string') return null;
    simulatePacket([], packet);
    return { rules, packet: { ...packet } };
  } catch { return null; }
}
function updatePortField() {
  const limited = ['icmp', 'any'].includes($('rule-protocol').value);
  if (limited) $('rule-port').value = 'any';
  else if ($('rule-port').value === 'any') $('rule-port').value = '443';
  $('rule-port').disabled = limited;
}
function resetForm() {
  editing = null; $('form-title').textContent = '添加规则'; $('save-rule').textContent = '添加到末尾'; $('cancel-edit').hidden = true;
  $('rule-name').value = ''; $('rule-action').value = 'allow'; $('rule-source').value = '0.0.0.0/0'; $('rule-destination').value = '0.0.0.0/0';
  $('rule-protocol').value = 'tcp'; $('rule-port').value = '443'; $('rule-enabled').checked = true; updatePortField();
}
function fillPacket() {
  for (const field of ['source', 'destination', 'protocol', 'port']) $(`test-${field}`).value = state.packet[field];
  $('test-port').disabled = state.packet.protocol === 'icmp';
}
function edit(rule) {
  editing = rule.id; $('form-title').textContent = '编辑规则'; $('save-rule').textContent = '保存修改'; $('cancel-edit').hidden = false;
  for (const field of ['name', 'action', 'source', 'destination', 'protocol', 'port']) $(`rule-${field}`).value = rule[field];
  $('rule-enabled').checked = rule.enabled; updatePortField(); $('rule-name').focus(); window.scrollTo({ top: 0, behavior: 'smooth' });
}
function btn(text, action, title = '') {
  const element = document.createElement('button'); element.type = 'button'; element.textContent = text; element.title = title || text; element.addEventListener('click', action); return element;
}
function rerender() { save(); render(); }
function render() {
  const model = analyzeRules(state.rules);
  $('rule-count').textContent = String(state.rules.length);
  const shadowCount = model.findings.filter(item => ['conflict', 'redundant'].includes(item.kind)).length;
  const partialCount = model.findings.filter(item => item.kind === 'partial').length;
  $('shadow-count').textContent = String(shadowCount); $('shadow-count').className = shadowCount ? 'problem' : '';
  $('partial-count').textContent = String(partialCount);
  const rows = $('rules'); rows.replaceChildren();
  if (!state.rules.length) { const tr = rows.insertRow(); const td = tr.insertCell(); td.colSpan = 5; td.className = 'network-empty'; td.textContent = '还没有规则。可以添加规则，或载入演示。'; }
  for (let i = 0; i < state.rules.length; i++) {
    const rule = state.rules[i], finding = model.findings[i];
    const tr = rows.insertRow(); if (finding.kind === 'conflict') tr.className = 'conflict-row'; else if (['redundant', 'partial'].includes(finding.kind)) tr.className = 'warning-row';
    const first = tr.insertCell(); first.textContent = `${i + 1}. ${rule.name}`;
    const small = document.createElement('small'); small.textContent = `${rule.action === 'allow' ? '允许' : '拒绝'} · ${rule.enabled ? '启用' : '停用'}`; first.append(small);
    const path = tr.insertCell(); path.textContent = `${rule.source} → ${rule.destination}`;
    const service = tr.insertCell(); service.textContent = `${rule.protocol.toUpperCase()} / ${rule.port}`;
    const status = tr.insertCell(); const badge = document.createElement('span');
    const names = { clear: '未发现遮蔽', conflict: `被第 ${finding.earlier + 1} 条拦截`, redundant: `与第 ${finding.earlier + 1} 条冗余`, partial: `部分重叠 ${finding.overlaps.length} 条`, disabled: '已停用' };
    badge.textContent = names[finding.kind]; badge.className = `network-badge ${finding.kind === 'conflict' ? 'bad' : finding.kind === 'partial' || finding.kind === 'redundant' ? 'warn' : finding.kind === 'disabled' ? 'off' : ''}`; status.append(badge);
    const actions = tr.insertCell(); const group = document.createElement('div'); group.className = 'row';
    group.append(btn('↑', () => { if (i > 0) { [state.rules[i - 1], state.rules[i]] = [state.rules[i], state.rules[i - 1]]; rerender(); } }, '上移规则'), btn('↓', () => { if (i < state.rules.length - 1) { [state.rules[i], state.rules[i + 1]] = [state.rules[i + 1], state.rules[i]]; rerender(); } }, '下移规则'), btn('编辑', () => edit(rule)), btn(rule.enabled ? '停用' : '启用', () => { rule.enabled = !rule.enabled; rerender(); }), btn('删除', () => {
      if (!window.confirm(`删除“${rule.name}”？请先导出完整备份。`)) return;
      state.rules.splice(i, 1); if (editing === rule.id) resetForm(); rerender();
    })); actions.append(group);
  }
  const findings = $('findings'); findings.replaceChildren();
  for (let i = 0; i < model.findings.length; i++) {
    const item = model.findings[i]; if (item.kind === 'clear' || item.kind === 'disabled') continue;
    const li = document.createElement('li'); li.className = item.kind === 'conflict' ? 'bad' : 'warn';
    if (item.kind === 'conflict') li.textContent = `第 ${i + 1} 条“${state.rules[i].name}”被第 ${item.earlier + 1} 条完全覆盖，且动作不同；按本模型将永远不会生效。`;
    else if (item.kind === 'redundant') li.textContent = `第 ${i + 1} 条“${state.rules[i].name}”被第 ${item.earlier + 1} 条完全覆盖且动作相同，可能多余。`;
    else li.textContent = `第 ${i + 1} 条“${state.rules[i].name}”与前面第 ${item.overlaps.map(index => index + 1).join('、')} 条部分重叠；请用下方模拟流量核对边界。`;
    findings.append(li);
  }
  if (!findings.childElementCount) { const li = document.createElement('li'); li.textContent = '目前未发现单条规则完全遮蔽或部分重叠。'; findings.append(li); }
  $('sim-result').textContent = '规则已变化，请重新运行流量演练。'; $('sim-result').className = 'network-message'; $('trace').replaceChildren();
}

$('rule-protocol').addEventListener('change', updatePortField);
$('test-protocol').addEventListener('change', () => { $('test-port').disabled = $('test-protocol').value === 'icmp'; });
$('save-rule').addEventListener('click', () => {
  try {
    const rule = validateRule({ id: editing || uid(), name: $('rule-name').value, action: $('rule-action').value, source: $('rule-source').value, destination: $('rule-destination').value, protocol: $('rule-protocol').value, port: $('rule-port').value, enabled: $('rule-enabled').checked });
    if (editing) state.rules[state.rules.findIndex(item => item.id === editing)] = rule;
    else { if (state.rules.length >= 200) throw Error('最多保存 200 条规则'); state.rules.push(rule); }
    const note = editing ? '规则已更新。' : '规则已添加到末尾。'; resetForm(); rerender(); message(note, 'success');
  } catch (error) { message(error.message, 'error'); }
});
$('cancel-edit').addEventListener('click', () => { resetForm(); message('已取消编辑。'); });
$('simulate').addEventListener('click', () => {
  try {
    const packet = { source: $('test-source').value.trim(), destination: $('test-destination').value.trim(), protocol: $('test-protocol').value, port: $('test-port').value };
    const result = simulatePacket(state.rules, packet);
    state.packet = packet; save();
    $('sim-result').textContent = result.first === null ? '没有命中任何启用规则：按本页设定的默认拒绝处理。' : `首条命中：第 ${result.first + 1} 条“${state.rules[result.first].name}”，结果为${result.action === 'allow' ? '允许' : '拒绝'}。`;
    $('sim-result').className = `network-message ${result.action === 'deny' ? 'error' : 'success'}`;
    const trace = $('trace'); trace.replaceChildren();
    for (let i = 0; i < state.rules.length; i++) {
      const rule = state.rules[i], row = document.createElement('div');
      if (!rule.enabled) row.textContent = `第 ${i + 1} 条 ${rule.name}：已停用，跳过。`;
      else if (result.matches.includes(i) && i === result.first) { row.className = result.action === 'allow' ? 'hit' : 'blocked'; row.textContent = `第 ${i + 1} 条 ${rule.name}：首条匹配，执行${result.action === 'allow' ? '允许' : '拒绝'}，停止评估。`; }
      else if (result.matches.includes(i)) row.textContent = `第 ${i + 1} 条 ${rule.name}：条件也匹配，但前面的规则已经截获。`;
      else row.textContent = `第 ${i + 1} 条 ${rule.name}：条件不匹配。`;
      trace.append(row);
    }
  } catch (error) { $('sim-result').textContent = error.message; $('sim-result').className = 'network-message error'; $('trace').replaceChildren(); }
});
$('example').addEventListener('click', () => {
  if (!window.confirm('载入演示会替换当前规则，请先导出完整备份。是否继续？')) return;
  state = { rules: [
    { id: uid(), name: '办公网访问业务 HTTPS', action: 'allow', source: '10.20.0.0/16', destination: '192.0.2.0/24', protocol: 'tcp', port: '443', enabled: true },
    { id: uid(), name: '访客网禁止访问业务', action: 'deny', source: '10.30.0.0/16', destination: '192.0.2.0/24', protocol: 'any', port: 'any', enabled: true },
    { id: uid(), name: '办公网特定终端 HTTPS', action: 'allow', source: '10.20.1.0/24', destination: '192.0.2.0/24', protocol: 'tcp', port: '443', enabled: true }
  ], packet: { source: '10.20.1.8', destination: '192.0.2.10', protocol: 'tcp', port: '443' } };
  resetForm(); fillPacket(); rerender(); message('已载入演示规则；第 3 条会显示冗余。', 'success');
});
$('clear').addEventListener('click', () => {
  if (!window.confirm('清空当前浏览器中的全部规则？请先导出完整备份。')) return;
  state = defaults(); resetForm(); fillPacket(); rerender(); message('本机规则已清空。', 'success');
});
$('export').addEventListener('click', () => download('ACL%e8%a7%84%e5%88%99%e6%bc%94%e7%bb%83-%e5%ae%8c%e6%95%b4%e5%a4%87%e4%bb%bd.json.html', JSON.stringify({ app: 'yj-acl-sandbox', version: 1, exportedAt: new Date().toISOString(), state }, null, 2), 'application/json'));
$('export-csv').addEventListener('click', () => {
  const rows = [['name', 'action', 'source', 'destination', 'protocol', 'port', 'enabled'], ...state.rules.map(rule => [rule.name, rule.action, rule.source, rule.destination, rule.protocol, rule.port, rule.enabled])];
  download('ACL规则演练-清单.csv', '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
});
$('import-csv').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    if (file.size > 128 * 1024) throw Error('CSV 不能超过 128 KB');
    const rows = parseCsv((await file.text()).replace(/^\ufeff/, ''));
    if (rows[0]?.map(item => item.trim().toLowerCase()).join(',') !== 'name,action,source,destination,protocol,port,enabled') throw Error('CSV 首行列名不符');
    if (state.rules.length + rows.length - 1 > 200) throw Error('导入后不能超过 200 条规则');
    const additions = rows.slice(1).map(row => {
      if (row.length !== 7 || !['true', 'false'].includes(row[6].trim().toLowerCase())) throw Error('CSV 每行须有 7 列，enabled 为 true 或 false');
      return validateRule({ id: uid(), name: row[0], action: row[1].trim().toLowerCase(), source: row[2], destination: row[3], protocol: row[4].trim().toLowerCase(), port: row[5], enabled: row[6].trim().toLowerCase() === 'true' });
    });
    if (window.confirm(`按 CSV 顺序追加 ${additions.length} 条规则？`)) { state.rules.push(...additions); rerender(); message(`已追加 ${additions.length} 条规则。`, 'success'); }
  } catch (error) { message(`导入失败：${error.message}`, 'error'); } finally { event.target.value = ''; }
});
$('import').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try { if (file.size > 256 * 1024) throw Error('备份不能超过 256 KB'); const next = validBackup(JSON.parse(await file.text())); if (!next) throw Error('备份格式或规则无效'); if (window.confirm('恢复会替换当前规则。请先导出当前完整备份，是否继续？')) { state = next; resetForm(); fillPacket(); rerender(); message('完整备份已恢复。', 'success'); } }
  catch (error) { message(`恢复失败：${error.message}`, 'error'); } finally { event.target.value = ''; }
});
try { const saved = validBackup(JSON.parse(localStorage.getItem(KEY) || 'null')); if (saved) state = saved; } catch { /* Keep the blank local sandbox if storage is unreadable. */ }
fillPacket(); updatePortField(); render();
