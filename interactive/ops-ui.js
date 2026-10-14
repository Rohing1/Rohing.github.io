export const clone = value => JSON.parse(JSON.stringify(value));
export function el(tag, text, attrs = {}) {
  const n = document.createElement(tag);
  if (text != null) n.textContent = text;
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') n.className = value;
    else if (key in n) n[key] = value;
    else n.setAttribute(key, value);
  }
  return n;
}
export function btn(text, action, kind = '') {
  const n = el('button', text, { type: 'button', class: kind });
  n.addEventListener('click', () => Promise.resolve().then(action).catch(error => alert(error.message)));
  return n;
}
export function field(title, type = 'text', value = '') {
  const input = el(type === 'textarea' ? 'textarea' : 'input', null, type === 'textarea' ? { rows: 3, value } : { type, value });
  const label = el('label', title); label.append(input); return { label, input };
}
export function select(title, options) {
  const input = el('select'); for (const [value, text] of options) input.add(new Option(text, value));
  const label = el('label', title); label.append(input); return { label, input };
}
export function panel(title, note, parent = document.querySelector('main')) {
  const n = el('section', null, { class: 'ops-panel' }); n.append(el('h2', title), el('p', note, { class: 'ops-note' }));
  const footer=parent.querySelector(':scope > footer');if(footer)parent.insertBefore(n,footer);else parent.append(n); return n;
}
export function row(...nodes) { const n = el('div', null, { class: 'ops-row' }); n.append(...nodes); return n; }
export function grid(...nodes) { const n = el('div', null, { class: 'ops-grid' }); n.append(...nodes); return n; }
export function download(name, content, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type })), a = el('a', null, { href: url, download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export function csv(rows) { return '\ufeff' + rows.map(r => r.map(v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replaceAll('"', '""') + '"'; }).join(',')).join('\r\n'); }
export function dialog(title) {
  const n = el('dialog', null, { class: 'ops-dialog' }); n.append(el('h2', title)); document.body.append(n);
  n.addEventListener('close', () => n.remove()); return n;
}
export function table(headers, rows, pageSize = 25) {
  let page = 0;
  const host = el('div'), wrap = el('div', null, { class: 'ops-scroll' }), t = el('table'), head = el('thead'), body = el('tbody'), hr = el('tr');
  headers.forEach(h => hr.append(el('th', h))); head.append(hr); t.append(head, body); wrap.append(t);
  const label = el('span', null, { class: 'ops-note' }), prev = btn('上一页', () => { page--; render(); }), next = btn('下一页', () => { page++; render(); });
  host.append(wrap, row(prev, label, next));
  function render() {
    const count = Math.max(1, Math.ceil(rows.length / pageSize)); page = Math.max(0, Math.min(page, count - 1)); body.replaceChildren();
    for (let values of rows.slice(page * pageSize, (page + 1) * pageSize)) {
      if (typeof values === 'function') values = values();
      const tr = el('tr'); for (const v of values) { const td = el('td'); if (v instanceof Node) td.append(v); else td.textContent = String(v ?? '—'); tr.append(td); } body.append(tr);
    }
    if (!rows.length) { const td = el('td', '暂无记录', { colSpan: headers.length }); const tr = el('tr'); tr.append(td); body.append(tr); }
    label.textContent = `${page + 1} / ${count} 页 · ${rows.length} 条`; prev.disabled = !page; next.disabled = page >= count - 1;
  }
  render(); return host;
}
export async function ready(name) {
  if (document.readyState === 'loading') await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  for(let i=0;i<100&&!window[name];i++) await new Promise(resolve=>setTimeout(resolve,50));
  if (!window[name]) throw Error(`工具初始化未完成：${name}`); return window[name];
}
export async function confirmRestore(summary, backupAction) {
  return new Promise(resolve => {
    const d = dialog('导入预览与恢复确认'); d.append(el('p', summary), el('p', '恢复将替换当前工作区。建议先下载当前完整备份。', { class: 'ops-warning' }));
    let decided = false;
    d.addEventListener('close', () => { if (!decided) resolve(false); });
    d.append(row(btn('先下载当前备份', backupAction), btn('确认恢复', () => { decided = true; resolve(true); d.close(); }, 'primary'), btn('取消', () => d.close()))); d.showModal();
  });
}
