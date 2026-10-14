import { parseCidr, analyzePool, suggestSubnet, usableHosts, formatIp } from '../network-core.20261001.js';
import { parseCsv, csvCell } from '../network-csv.20261001.js';

const KEY = 'yj-ipam-planner-v1';
const $ = id => document.getElementById(id);
const fmt = number => Number(number).toLocaleString('zh-CN');
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const defaults = () => ({ parent: '10.0.0.0/16', entries: [] });
let state = defaults(), editing = null;
const oldValidBackup = validBackup;
validBackup = function(value) { const next = oldValidBackup(value); if (!next) return null; try { return { ...next, ...OpsModels.validateIpDetails(value.state) }; } catch { return null; } };

function message(text, kind = '') { $('form-message').textContent = text; $('form-message').className = `network-message ${kind}`; }
function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ app: 'yj-ipam-planner', version: 1, state })); $('save-state').textContent = '已自动保存在此浏览器；请定期导出完整备份。'; }
  catch { $('save-state').textContent = '本机保存失败，请立即导出完整备份。'; return false; }
  return true;
}
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function validateEntry(raw) {
  const name = String(raw.name || '').trim(), vlan = String(raw.vlan || '').trim(), note = String(raw.note || '').trim();
  if (!name || name.length > 60) throw Error('子网名称须为 1—60 字');
  if (vlan.length > 30 || note.length > 160) throw Error('VLAN 或备注过长');
  const block = parseCidr(raw.cidr);
  const used = Number(raw.used);
  if (!Number.isInteger(used) || used < 0 || used > 2 ** 32) throw Error('已用地址数须为非负整数');
  return { id: raw.id || uid(), name, cidr: block.cidr, vlan, used, note };
}
function validBackup(value) {
  if (value?.app !== 'yj-ipam-planner' || value.version !== 1 || !value.state || !Array.isArray(value.state.entries) || value.state.entries.length > 300) return null;
  try {
    const parent = parseCidr(value.state.parent).cidr;
    const entries = value.state.entries.map(item => {
      if (!item || typeof item.id !== 'string' || item.id.length > 100 || typeof item.name !== 'string' || typeof item.cidr !== 'string' || typeof item.vlan !== 'string' || typeof item.note !== 'string' || typeof item.used !== 'number') throw Error('备份字段无效');
      return validateEntry(item);
    });
    if (new Set(entries.map(item => item.id)).size !== entries.length) return null;
    return { parent, entries };
  } catch { return null; }
}
function resetForm() {
  editing = null;
  $('form-title').textContent = '添加子网'; $('save-entry').textContent = '添加子网'; $('cancel-edit').hidden = true;
  for (const id of ['entry-name', 'entry-cidr', 'entry-vlan', 'entry-note']) $(id).value = '';
  $('entry-used').value = '0';
}
function beginEdit(entry) {
  editing = entry.id; $('form-title').textContent = '编辑子网'; $('save-entry').textContent = '保存修改'; $('cancel-edit').hidden = false;
  $('entry-name').value = entry.name; $('entry-cidr').value = entry.cidr; $('entry-vlan').value = entry.vlan;
  $('entry-used').value = entry.used; $('entry-note').value = entry.note; $('entry-name').focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function button(label, action, title = '') {
  const element = document.createElement('button'); element.type = 'button'; element.textContent = label; element.title = title || label; element.addEventListener('click', action); return element;
}
function render() {
  window.dispatchEvent(new Event('yj-ipam-update'));
  const plan = analyzePool(state.parent, state.entries);
  $('parent').value = state.parent;
  $('total').textContent = fmt(plan.parent.size);
  $('free').textContent = fmt(plan.free);
  $('conflicts').textContent = fmt(plan.conflictPairs);
  $('conflicts').className = plan.conflictPairs ? 'problem' : '';
  $('range-start').textContent = formatIp(plan.parent.start);
  $('range-end').textContent = formatIp(plan.parent.end);
  $('count').textContent = `${state.entries.length} 条`;
  const track = $('network-track'); track.replaceChildren();
  for (const item of plan.entries) {
    if (!item.block || !item.inParent) continue;
    const bar = document.createElement('i');
    bar.className = item.conflicts.length || item.errors.length ? 'bad' : '';
    bar.style.left = `${(item.block.start - plan.parent.start) / plan.parent.size * 100}%`;
    bar.style.width = `${item.block.size / plan.parent.size * 100}%`;
    bar.title = `${item.name} · ${item.block.cidr}`;
    track.append(bar);
  }
  if (!track.childElementCount) { const empty = document.createElement('span'); empty.className = 'empty-track'; empty.textContent = '尚未划分子网'; track.append(empty); }
  track.setAttribute('aria-label', `${plan.parent.cidr}：总计 ${fmt(plan.parent.size)} 个地址，未划分 ${fmt(plan.free)} 个，重叠 ${plan.conflictPairs} 对`);
  const issues = $('issues'); issues.replaceChildren();
  const issueTexts = [];
  for (const item of plan.entries) {
    for (const error of item.errors) issueTexts.push(`${item.name}：${error}`);
    for (const other of item.conflicts.filter(index => index > item.index)) issueTexts.push(`${item.name} 与 ${plan.entries[other].name} 网段重叠`);
  }
  if (!issueTexts.length) issueTexts.push('当前没有检测到重叠或越界。');
  for (const text of issueTexts.slice(0, 8)) { const li = document.createElement('li'); li.textContent = text; if (issueTexts.length > 1 || plan.conflictPairs) li.className = 'bad'; issues.append(li); }
  if (issueTexts.length > 8) { const li = document.createElement('li'); li.textContent = `还有 ${issueTexts.length - 8} 项，请查看下方清单。`; issues.append(li); }
  const rows = $('rows'); rows.replaceChildren();
  if (!plan.entries.length) { const tr = rows.insertRow(); const td = tr.insertCell(); td.colSpan = 5; td.className = 'network-empty'; td.textContent = '还没有子网，先添加一条，或载入演示。'; return; }
  for (const item of plan.entries) {
    const tr = rows.insertRow();
    if (item.conflicts.length) tr.className = 'conflict-row'; else if (item.errors.length) tr.className = 'warning-row';
    const name = tr.insertCell(); name.textContent = item.name;
    if (item.vlan) { const small = document.createElement('small'); small.textContent = `VLAN ${item.vlan}`; name.append(small); }
    const cidr = tr.insertCell(); cidr.textContent = item.block?.cidr || item.cidr;
    const capacity = tr.insertCell(); capacity.textContent = item.block ? `${fmt(item.used)} / ${fmt(item.capacity)} 台` : '—';
    if (item.note) { const small = document.createElement('small'); small.textContent = item.note; capacity.append(small); }
    const status = tr.insertCell(); const badge = document.createElement('span'); badge.className = `network-badge ${item.conflicts.length ? 'bad' : item.errors.length ? 'warn' : ''}`;
    badge.textContent = item.conflicts.length ? `重叠 ${item.conflicts.length} 处` : item.errors.length ? item.errors[0] : '正常'; status.append(badge);
    const actions = tr.insertCell(); const row = document.createElement('div'); row.className = 'row';
    row.append(button('编辑', () => beginEdit(item)), button('删除', () => {
      if (!window.confirm(`删除“${item.name}”这条规划记录？可先导出完整备份。`)) return;
      state.entries = state.entries.filter(entry => entry.id !== item.id); if (editing === item.id) resetForm(); save(); render();
    })); actions.append(row);
  }
}

$('parent').addEventListener('change', () => {
  try { state.parent = parseCidr($('parent').value).cidr; save(); render(); message('父网段已更新；越界子网仍保留并标记。', 'success'); }
  catch (error) { $('parent').value = state.parent; message(error.message, 'error'); }
});
$('suggest').addEventListener('click', () => {
  try { const plan = analyzePool(state.parent, state.entries); const cidr = suggestSubnet(plan, $('suggest-prefix').value); $('suggest-result').textContent = cidr ? `第一个可用空档：${cidr}。已填入下方表单，确认后再添加。` : '当前条件下没有足够且对齐的空档。'; if (cidr) $('entry-cidr').value = cidr; }
  catch (error) { $('suggest-result').textContent = error.message; }
});
$('save-entry').addEventListener('click', () => {
  try {
    const entry = validateEntry({ id: editing || uid(), name: $('entry-name').value, cidr: $('entry-cidr').value, vlan: $('entry-vlan').value, used: $('entry-used').value, note: $('entry-note').value });
    if (editing) state.entries[state.entries.findIndex(item => item.id === editing)] = entry;
    else { if (state.entries.length >= 300) throw Error('最多保存 300 条子网'); state.entries.push(entry); }
    const changed = editing ? '已更新子网。' : '已添加子网。'; resetForm(); save(); render(); message(changed, 'success');
  } catch (error) { message(error.message, 'error'); }
});
$('cancel-edit').addEventListener('click', () => { resetForm(); message('已取消编辑。'); });
$('example').addEventListener('click', () => {
  if (!window.confirm('载入演示会替换当前规划。请先导出完整备份，是否继续？')) return;
  state = { parent: '10.24.0.0/16', entries: [
    { id: uid(), name: '业务生产区', cidr: '10.24.0.0/20', vlan: '110', used: 580, note: '演示数据' },
    { id: uid(), name: '办公区', cidr: '10.24.16.0/22', vlan: '120', used: 135, note: '演示数据' },
    { id: uid(), name: '测试区', cidr: '10.24.32.0/21', vlan: '130', used: 70, note: '演示数据' }
  ] }; resetForm(); save(); render(); message('已载入演示规划。', 'success');
});
$('clear').addEventListener('click', () => {
  if (!window.confirm('清空当前浏览器中的全部子网规划？请先导出完整备份。')) return;
  state = defaults(); resetForm(); save(); render(); message('本机规划已清空。', 'success');
});
$('export').addEventListener('click', () => download('IP%e5%9c%b0%e5%9d%80%e8%a7%84%e5%88%92-%e5%ae%8c%e6%95%b4%e5%a4%87%e4%bb%bd.json.html', JSON.stringify({ app: 'yj-ipam-planner', version: 1, exportedAt: new Date().toISOString(), state }, null, 2), 'application/json'));
$('import').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try { if (file.size > 4 * 1024 * 1024) throw Error('备份不能超过 4 MB'); const next = validBackup(JSON.parse(await file.text())); if (!next) throw Error('备份格式或字段无效'); if (window.confirm(`将恢复 ${next.entries.length} 个子网、${next.addresses.length} 个地址、${next.pools.length} 个 DHCP 池。替换当前规划？请先下载完整备份。`)) { state = next; resetForm(); save(); render(); message('完整备份已恢复。', 'success'); } }
  catch (error) { message(`恢复失败：${error.message}`, 'error'); } finally { event.target.value = ''; }
});
$('export-csv').addEventListener('click', () => {
  const rows = [['name', 'cidr', 'vlan', 'used', 'note'], ...state.entries.map(item => [item.name, item.cidr, item.vlan, item.used, item.note])];
  download('IP地址规划-清单.csv', '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
});
$('import-csv').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    if (file.size > 128 * 1024) throw Error('CSV 不能超过 128 KB');
    const rows = parseCsv((await file.text()).replace(/^\ufeff/, ''));
    if (rows[0]?.map(item => item.trim().toLowerCase()).join(',') !== 'name,cidr,vlan,used,note') throw Error('CSV 首行须为 name,cidr,vlan,used,note');
    if (state.entries.length + rows.length - 1 > 300) throw Error('导入后不能超过 300 条');
    const additions = rows.slice(1).map(row => { if (row.length !== 5) throw Error('CSV 每行须有 5 列'); return validateEntry({ id: uid(), name: row[0], cidr: row[1], vlan: row[2], used: row[3], note: row[4] }); });
    if (window.confirm(`追加 ${additions.length} 条子网？重叠会在清单中标出。`)) { state.entries.push(...additions); save(); render(); message(`已追加 ${additions.length} 条子网。`, 'success'); }
  } catch (error) { message(`导入失败：${error.message}`, 'error'); } finally { event.target.value = ''; }
});
try { const saved = validBackup(JSON.parse(localStorage.getItem(KEY) || 'null')); if (saved) state = saved; } catch { /* Keep the blank local plan if storage is unreadable. */ }
render();
window.IpamApp = { state: () => OpsModels.copy(state), update: next => { const checked = validBackup({ app: 'yj-ipam-planner', version: 1, state: next }); if (!checked) throw Error('地址方案校验失败'); const previous=state; state = checked; if(!save()){state=previous;render();throw Error('浏览器存储失败，未应用此次修改')} render(); }, backup: () => $('export').click() };
