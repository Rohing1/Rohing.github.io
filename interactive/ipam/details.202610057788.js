import { el, btn, field, select, panel, row, grid, table, download, csv, ready, clone } from '../ops-ui.js';
const api = await ready('IpamApp'), M = window.OpsModels;
const p = panel('地址台账与 DHCP 池', '登记网关、静态与保留地址，核对 DHCP 池。只检查本机方案，不扫描网络。不同 VRF / 租户请使用独立方案，避免将可复用地址误判为冲突。');
const subnet = select('所属子网', []), kind = select('登记类型', [['static', '静态地址'], ['reserved', '保留地址'], ['gateway', '网关'], ['pool', 'DHCP 池']]);
const ip = field('地址 / 池起点'), end = field('池终点'), name = field('名称 / 用途'), owner = field('负责人称呼（选填）'), note = field('备注（选填）');
for (const f of [ip, end]) { f.input.maxLength = 15; f.input.placeholder = '例如 10.0.1.10'; }
name.input.maxLength = 100; owner.input.maxLength = 80; note.input.maxLength = 300;
const message = el('p', '', { class: 'ops-status', role: 'status' }), findings = el('div'), list = el('div');
let editing = null, previous = null;
const add = btn('添加登记', commit, 'primary'), cancel = btn('取消编辑', reset), undo = btn('撤销本面板上次修改', () => { if (!previous) return; const current = api.state(); api.update(previous); previous = current; reset(); render(); });
cancel.hidden = true;
p.append(grid(subnet.label, kind.label, ip.label, end.label, name.label, owner.label, note.label), row(add, cancel, undo, btn('导出地址与池 CSV', () => {
  const s = api.state(); download('IP地址台账.csv', csv([['类型', '子网', '地址/起点', '终点', '名称', '负责人', '备注'], ...(s.addresses || []).map(r => [r.kind, s.entries.find(e => e.id === r.subnetId)?.cidr || '子网已删除', r.ip, '', r.name, r.owner, r.note]), ...(s.pools || []).map(r => ['DHCP', s.entries.find(e => e.id === r.subnetId)?.cidr || '子网已删除', r.start, r.end, r.name, '', ''])]), 'text/csv;charset=utf-8');
})), message, findings, list);
kind.input.addEventListener('change', toggle);
function toggle() { end.label.hidden = kind.input.value !== 'pool'; owner.label.hidden = note.label.hidden = kind.input.value === 'pool'; }
function reset() { editing = null; for (const f of [ip, end, name, owner, note]) f.input.value = ''; add.textContent = '添加登记'; cancel.hidden = true; kind.input.disabled = false; toggle(); }
function mutate(fn) { const next = api.state(); previous = clone(next); fn(next); api.update(next); render(); }
function commit() {
  try {
    if (!subnet.input.value) throw Error('请先在上方添加子网');
    const type = kind.input.value, s = api.state(), id = editing || crypto.randomUUID();
    const details = M.validateIpDetails({ addresses: type === 'pool' ? s.addresses || [] : [...(s.addresses || []).filter(r => r.id !== id), { id, subnetId: subnet.input.value, ip: ip.input.value.trim(), kind: type, name: name.input.value.trim(), owner: owner.input.value.trim(), note: note.input.value.trim() }], pools: type !== 'pool' ? s.pools || [] : [...(s.pools || []).filter(r => r.id !== id), { id, subnetId: subnet.input.value, start: ip.input.value.trim(), end: end.input.value.trim(), name: name.input.value.trim() }] });
    mutate(next => Object.assign(next, details)); reset(); message.textContent = '登记已更新，冲突不会被隐藏，请核对下方检查结果。';
  } catch (e) { message.textContent = e.message; }
}
function edit(r, pool) { editing = r.id; subnet.input.value = r.subnetId; kind.input.value = pool ? 'pool' : r.kind; kind.input.disabled = true; ip.input.value = pool ? r.start : r.ip; end.input.value = r.end || ''; name.input.value = r.name; owner.input.value = r.owner || ''; note.input.value = r.note || ''; add.textContent = '保存修改'; cancel.hidden = false; toggle(); ip.input.focus(); }
function render() {
  const s = api.state(), old = subnet.input.value; subnet.input.replaceChildren(); s.entries.forEach(e => subnet.input.add(new Option(`${e.name} · ${e.cidr}`, e.id))); if ([...subnet.input.options].some(o => o.value === old)) subnet.input.value = old;
  const details = M.validateIpDetails(s), issues = M.ipIssues(s.entries, details); findings.replaceChildren(el('h3', `台账检查 · ${issues.length} 项`));
  findings.append(table(['问题 / 提醒'], issues.map(text => [text])));
  const rows = [...details.addresses.map(r => ({ r, pool: false })), ...details.pools.map(r => ({ r, pool: true }))].map(({ r, pool }) => [pool ? 'DHCP 池' : { static: '静态', reserved: '保留', gateway: '网关' }[r.kind], s.entries.find(e => e.id === r.subnetId)?.name || '子网已删除', pool ? `${r.start}—${r.end}` : r.ip, r.name || '—', r.owner || '—', row(btn('编辑', () => edit(r, pool)), btn('删除', () => { if (confirm('删除此登记？可使用本面板撤销或完整备份恢复。')) mutate(next => { next[pool ? 'pools' : 'addresses'] = (next[pool ? 'pools' : 'addresses'] || []).filter(x => x.id !== r.id); }); }))]);
  list.replaceChildren(table(['类型', '子网', '地址 / 池', '用途', '负责人', '操作'], rows)); undo.disabled = !previous;
}
window.addEventListener('yj-ipam-update', render); toggle(); render();
