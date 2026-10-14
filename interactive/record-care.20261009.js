(function (root) {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const specs = {
    assets: { items: '物品', entries: '出入库流水', stocktakes: '盘点任务' },
    rack: { racks: '机柜', devices: '设备', connections: '接线', maintenance: '维护记录', 'room.structures': '设施与隔断' },
    projects: { projects: '项目', versions: '版本', issues: '任务', relations: '依赖关系', comments: '评论', timeEntries: '工时', wiki: '知识页', baselines: '计划基线', 'agile.sprints': '迭代', 'agile.filters': '保存的查询' }
  };
  const list = (d, path) => path.split('.').reduce((v, k) => v?.[k], d) || [];
  function put(d, path, value) { const keys = path.split('.'); let at = d; keys.slice(0, -1).forEach(k => { at[k] ||= {}; at = at[k]; }); at[keys.at(-1)] = value; }
  function stable(v) { if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']'; if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}'; return JSON.stringify(v); }
  const same = (a, b) => stable(a) === stable(b);
  const label = r => String(r?.name || r?.subject || r?.assetNo || r?.content || r?.text || r?.label || r?.id || '记录').slice(0, 120);
  function trash(kind, value) {
    if (value == null) return [];
    if (!Array.isArray(value) || value.length > 200) throw Error('回收站最多保留 200 批，请先备份并清理回收站');
    const ids = new Set();
    for (const t of value) {
      if (!t || typeof t.id !== 'string' || !/^[\w-]{1,100}$/.test(t.id) || ids.has(t.id) || typeof t.name !== 'string' || t.name.length > 200 || !Number.isFinite(Date.parse(t.at)) || !t.records || typeof t.records !== 'object' || Array.isArray(t.records) || !Array.isArray(t.updates)) throw Error('回收站记录格式无效');
      ids.add(t.id);
      for (const [path, rows] of Object.entries(t.records)) {
        if (!Object.hasOwn(specs[kind], path) || !Array.isArray(rows) || rows.length > 100000) throw Error('回收站包含未知记录类型');
        const seen = new Set();
        for (const r of rows) { if (!r || typeof r.id !== 'string' || seen.has(r.id)) throw Error('回收站记录标识无效'); seen.add(r.id); }
      }
      for (const u of t.updates) if (!Object.hasOwn(specs[kind], u.path) || !u.before || !u.after || typeof u.before.id !== 'string' || u.before.id !== u.after.id) throw Error('回收站关联变化无效');
    }
    if (new TextEncoder().encode(JSON.stringify(value)).length > 10 * 1024 * 1024) throw Error('回收站超过 10 MB，请下载完整备份后清理');
    return copy(value);
  }
  // One deletion transaction keeps all removed children and reference changes together.
  function capture(kind, before, next) {
    next.trash = trash(kind, next.trash);
    const records = {}, updates = [];
    for (const path of Object.keys(specs[kind])) {
      const after = new Map(list(next, path).map(r => [r.id, r]));
      const removed = list(before, path).filter(r => !after.has(r.id));
      if (removed.length) records[path] = copy(removed);
      for (const r of list(before, path)) if (after.has(r.id) && !same(r, after.get(r.id))) updates.push({ path, before: copy(r), after: copy(after.get(r.id)) });
    }
    if (Object.keys(records).length && !next.trash.some(t => same(t.records, records) && same(t.updates, updates))) {
      const first = Object.keys(records)[0];
      next.trash.unshift({ id: root.crypto.randomUUID(), at: new Date().toISOString(), name: specs[kind][first] + ' · ' + label(records[first][0]), records, updates });
    }
    trash(kind, next.trash);
    return next;
  }
  function restore(kind, state, id) {
    const next = copy(state), t = trash(kind, state.trash).find(t => t.id === id);
    if (!t) throw Error('该记录已恢复或已清理，请重新打开回收站');
    for (const [path, rows] of Object.entries(t.records)) {
      const current = list(next, path);
      if (rows.some(r => current.some(c => c.id === r.id))) throw Error(specs[kind][path] + '已有同标识记录，未覆盖；请先核对现有内容');
      put(next, path, current.concat(copy(rows)));
    }
    for (const u of t.updates) {
      const current = list(next, u.path), i = current.findIndex(r => r.id === u.after.id);
      if (i < 0 || !same(current[i], u.after)) throw Error('关联记录在删除后已修改，无法安全恢复：' + label(u.before));
      current[i] = copy(u.before);
    }
    next.trash = next.trash.filter(x => x.id !== id);
    return next;
  }
  function diff(kind, local, incoming) {
    const paths = Object.keys(specs[kind]).filter(p => p !== 'room.structures').concat(kind === 'projects' ? ['activity', 'trash'] : ['trash']);
    const rows = [];
    for (const path of paths) {
      const old = new Map(list(local, path).map(r => [r.id, r]));
      for (const record of list(incoming, path)) {
        const before = old.get(record.id);
        if (!same(before, record)) rows.push({ path, id: record.id, before, after: record, type: before ? 'conflict' : 'new', title: label(record) });
      }
    }
    if (kind === 'rack' && !same(local.room, incoming.room)) rows.push({ path: 'room', id: 'room', before: local.room, after: incoming.room, type: 'conflict', title: '机房图纸、设施与布局（整体选择）' });
    if (rows.length > 100000) throw Error('差异超过 10 万条，请按工具整理备份后再导入');
    return rows;
  }
  function merge(kind, local, incoming, rows, selected) {
    const next = copy(local), patches = new Map();
    for (const index of selected) {
      const r = rows[index]; if (!r) throw Error('差异选择已失效');
      if (r.path === 'room') { next.room = copy(r.after); continue; }
      if (!patches.has(r.path)) patches.set(r.path, new Map());
      patches.get(r.path).set(r.id, copy(r.after));
    }
    for (const [path, changes] of patches) {
      const result = list(next, path).map(r => { if (!changes.has(r.id)) return r; const replacement = changes.get(r.id); changes.delete(r.id); return replacement; });
      put(next, path, result.concat([...changes.values()]));
    }
    if (kind === 'projects') next.seq = Math.max(local.seq, incoming.seq);
    // Preserve existing ledger order (timestamps can be backdated). New records are
    // appended in backup order; the tool validator rejects inconsistent transactions.
    return next;
  }
  const api = { specs, copy, trash, capture, restore, diff, merge, same };
  root.RecordCare = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (!root.document) return;

  const adapters = new Map();
  const node = (tag, text, cls) => { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; };
  function button(text, fn) { const b = node('button', text); b.type = 'button'; b.onclick = fn; return b; }
  function download(a, state, suffix) {
    const value = a.kind === 'projects' ? { app: 'yj-project-desk', exportedAt: new Date().toISOString(), data: state } : state;
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
    const link = node('a'); link.href = url; link.download = a.name + '-' + suffix + '-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    if (a.kind !== 'projects') { try { const s=JSON.stringify(state);let x=2166136261,y=5381;for(let i=0;i<s.length;i++){x=Math.imul(x^s.charCodeAt(i),16777619);y=Math.imul(y,33)^s.charCodeAt(i);}localStorage.setItem('yj-backup-meta-'+a.kind,JSON.stringify({at:Date.now(),fingerprint:s.length+':'+(x>>>0)+':'+(y>>>0)})); } catch (_) {} }
  }
  function modal(title) {
    const d = node('dialog', '', 'record-care-dialog'), head = node('header'), h = node('h2', title), close = button('关闭 ×', () => d.close());
    head.append(h, close); d.append(head); document.body.append(d);
    d.addEventListener('close', () => d.remove(), { once: true }); d.showModal(); return d;
  }
  function check(a) { if (a.blocked() || localStorage.getItem(a.key) !== a.raw()) { a.refresh(); throw Error('当前记录已变化，未覆盖。请导出当前内存，再载入本机最新版本。'); } }
  api.mount = function (a) {
    adapters.set(a.kind, a);
    const panel = node('section', '', 'record-care-panel'), title = node('strong', '数据保护'), controls = node('div', '', 'record-care-actions'), alert = node('div', '', 'record-care-alert');
    alert.setAttribute('role', 'status'); alert.hidden = true;
    const message = node('span');
    alert.append(message, button('导出当前内存', () => download(a, a.get(), '当前内存')), button('载入最新版本', () => {
      if (!confirm('当前页面内容将被本机最新版本替换。未保存内容请先导出。继续？')) return;
      try { a.reload(); a.refresh(); } catch (e) { message.textContent = e.message; }
    }));
    controls.append(button('回收站', () => showTrash(a)), button('导入差异与合并', () => input.click()), button('导出完整备份', () => download(a, a.get(), '完整备份')));
    const note = node('small', '回收站随完整备份保存，仅在本浏览器；清除网站数据仍会丢失，请定期下载备份。');
    const input = node('input'); input.type = 'file'; input.accept = '.json,application/json'; input.hidden = true;
    input.onchange = async () => {
      const file = input.files[0]; input.value = ''; if (!file) return;
      try { if (file.size > 20 * 1024 * 1024) throw Error('备份不能超过 20 MB'); const v = JSON.parse(await file.text()); await api.preview(a.kind, a.kind === 'projects' ? (v.app === 'yj-project-desk' ? v.data : v) : v); }
      catch (e) { const d = modal('无法导入'); d.append(node('p', e.message)); }
    };
    panel.append(title, controls, note, alert, input);
    const parent = document.querySelector('main') || document.body;
    parent.prepend(panel);
    a.refresh = () => { let changed = true; try { changed = a.blocked() || localStorage.getItem(a.key) !== a.raw(); } catch (_) {} alert.hidden = !changed; message.textContent = '其他标签页修改了记录，或旧记录读取异常。当前页已停止覆盖保存；可先导出当前内存。'; };
    root.addEventListener('storage', e => { if (e.key === a.key || e.key === null) a.refresh(); });
    root.addEventListener('focus', a.refresh); document.addEventListener('visibilitychange', () => { if (!document.hidden) a.refresh(); });
    a.refresh();
  };
  function showTrash(a) {
    const d = modal('回收站 · ' + a.name), body = node('div'), status = node('p', '', 'record-care-message'); status.setAttribute('role', 'status');
    d.append(node('p', '按删除批次恢复，包括当时一并移除的关联记录。资产有未归还借用、任务有子任务或工时等原有保护仍然有效。'), body, status);
    function paint() {
      body.replaceChildren(); const entries = a.get().trash || [];
      if (!entries.length) { body.append(node('p', '回收站为空。上线前已删除且未备份的记录无法找回。')); return; }
      for (const t of entries) {
        const card = node('article', '', 'record-care-trash'), desc = Object.entries(t.records).map(([path, rows]) => specs[a.kind][path] + ' ' + rows.length).join(' · ');
        const actions = node('div', '', 'record-care-actions');
        actions.append(button('恢复这一批', () => {
          try { check(a); const next = a.validate(restore(a.kind, a.get(), t.id)); a.apply(next); paint(); status.textContent = '已恢复；关联记录校验通过。'; }
          catch (e) { status.textContent = '未恢复：' + e.message; }
        }), button('彻底删除', () => {
          if (!confirm('彻底删除这一批回收记录？此操作不能撤销，建议先下载完整备份。')) return;
          try { check(a); const next = a.get(); next.trash = next.trash.filter(x => x.id !== t.id); a.apply(a.validate(next)); paint(); status.textContent = '该批回收记录已彻底删除；如有完整备份，可从备份找回。'; }
          catch (e) { status.textContent = e.message; }
        }));
        card.append(node('strong', t.name), node('small', new Date(t.at).toLocaleString() + ' · ' + desc), actions); body.append(card);
      }
    }
    paint();
  }
  api.preview = async function (kind, value) {
    const a = adapters.get(kind); if (!a) throw Error('数据保护模块尚未加载');
    const incoming = a.validate(copy(value)); incoming.trash = trash(kind, incoming.trash);
    // Invalid stored content must remain exportable and explicitly recoverable,
    // without using this path to bypass a genuine concurrent-tab conflict.
    const disk = localStorage.getItem(a.key); let invalid = false;
    if (a.blocked() && disk === a.raw() && disk != null) { try { a.validate(JSON.parse(disk)); } catch (_) { invalid = true; } }
    if (invalid) {
      const d = modal('损坏记录恢复'), status = node('p', '', 'record-care-message');
      d.append(node('p', '本机原始记录无法解析，不能进行差异合并。请先下载原始文件留存，再明确选择用已校验的完整备份替换。'), button('下载本机原始记录', () => {
        const url = URL.createObjectURL(new Blob([disk], {type:'application/json'})), link = node('a'); link.href=url; link.download=a.name+'-原始记录-待检查.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
      }), button('用此备份恢复全部内容', () => {
        try { if (localStorage.getItem(a.key) !== disk) throw Error('本机记录又发生变化，请重新打开页面后恢复');
          if (!confirm('将用此完整备份替换无法解析的本机记录。原始记录只有下载后才能留存。确认恢复？')) return;
          if (localStorage.getItem(a.key) !== disk) throw Error('本机记录已变化，未覆盖');
          a.apply(incoming, true); a.refresh(); d.close();
        } catch(e) { status.textContent = '未恢复：'+e.message; }
      }), status); return;
    }
    check(a);
    const local = a.get(), baseline = stable(local);
    const rows = diff(kind, local, incoming), selected = new Set(rows.map((r, i) => r.type === 'new' ? i : -1).filter(i => i >= 0));
    const d = modal('导入差异预览 · ' + a.name), summary = node('p'), tools = node('div', '', 'record-care-actions'), content = node('div'), paging = node('div', '', 'record-care-actions'), status = node('p', '', 'record-care-message'), actions = node('footer', '', 'record-care-actions');
    status.setAttribute('role', 'status'); let page = 0;
    const newCount = rows.filter(r => r.type === 'new').length;
    d.append(node('p', '默认只选新增记录；同标识但内容不同的记录视为冲突，默认保留本地。未出现在备份里的本地记录不会删除。请一并选择关联的父记录、流水或任务；校验不通过时不会写入。不同来源使用相同编号时也需人工核对。'), summary, tools, content, paging, status, actions);
    tools.append(button('仅选新增', () => { selected.clear(); rows.forEach((r, i) => { if (r.type === 'new') selected.add(i); }); paint(); }), button('全部取消', () => { selected.clear(); paint(); }));
    function candidate() {
      check(a); if (stable(a.get()) !== baseline) throw Error('预览期间当前页记录已修改，请关闭并重新导入');
      const next = a.validate(merge(kind, local, incoming, rows, selected)); next.trash = trash(kind, next.trash); return next;
    }
    const apply = button('应用所选合并', () => {
      try {
        if (!selected.size) throw Error('请先选择需要导入的记录');
        const next = candidate(), conflicts = [...selected].filter(i => rows[i].type === 'conflict').length;
        if (!confirm('将合并 ' + selected.size + ' 条差异，其中替换 ' + conflicts + ' 条同标识内容。建议先下载合并前备份。确认？')) return;
        check(a); if (stable(a.get()) !== baseline) throw Error('记录已变化，请重新预览');
        a.apply(next); status.textContent = '合并成功，未选中的本地记录保持不变。'; apply.disabled = true; tools.querySelectorAll('button').forEach(b => b.disabled = true); content.querySelectorAll('input').forEach(b => b.disabled = true);
      } catch (e) { status.textContent = '未合并：' + e.message; }
    });
    actions.append(button('下载合并前备份', () => download(a, local, '合并前备份')), button('检查所选关联', () => { try { candidate(); status.textContent = '校验通过。可以应用；当前尚未写入。'; } catch (e) { status.textContent = '未写入：' + e.message; } }), apply, button('整份替换恢复…', () => {
      try {
        check(a); if (stable(a.get()) !== baseline) throw Error('当前内容已变化，请重新导入');
        if (!confirm('注意：整份恢复会替换当前工具的全部内容及回收站，不采用上面的勾选。请先下载合并前备份。确定继续？')) return;
        check(a); if (stable(a.get()) !== baseline) throw Error('当前内容已变化，请重新导入');
        a.apply(a.validate(copy(incoming))); d.close();
      } catch (e) { status.textContent = '未恢复：' + e.message; }
    }));
    function paint() {
      summary.textContent = '新增 ' + newCount + ' · 内容冲突 ' + (rows.length - newCount) + ' · 已选 ' + selected.size + '（相同记录已跳过）';
      content.replaceChildren();
      for (let i = page * 40; i < Math.min(rows.length, (page + 1) * 40); i++) {
        const r = rows[i], card = node('article', '', 'record-care-diff'), caption = node('label'), box = node('input'); box.type = 'checkbox'; box.checked = selected.has(i);
        box.onchange = () => { if (box.checked) selected.add(i); else selected.delete(i); summary.textContent = '新增 ' + newCount + ' · 内容冲突 ' + (rows.length - newCount) + ' · 已选 ' + selected.size; };
        caption.append(box, document.createTextNode((r.type === 'new' ? '新增' : '冲突 / 采用备份') + ' · ' + (specs[kind][r.path] || ({trash:'回收站',activity:'活动记录',room:'机房布局'}[r.path])) + ' · ' + r.title));
        const detail = node('details'); detail.append(node('summary', '查看字段差异'));
        // Large plans and embedded images stay local and are represented by a length summary, never painted as markup.
        const fields = [...new Set([...Object.keys(r.before || {}), ...Object.keys(r.after || {})])].filter(k => !same(r.before?.[k], r.after?.[k]));
        const short = v => { const s = v == null ? '（无）' : typeof v === 'string' ? v : JSON.stringify(v); return s.length > 700 ? s.slice(0, 120) + '…（共 ' + s.length + ' 字符）' : s; };
        for (const field of fields) detail.append(node('pre', field + '\n本地：' + short(r.before?.[field]) + '\n备份：' + short(r.after?.[field])));
        card.append(caption, detail); content.append(card);
      }
      if (!rows.length) content.append(node('p', '没有需要合并的差异。'));
      paging.replaceChildren(); const prev = button('上一页', () => { page--; paint(); }), next = button('下一页', () => { page++; paint(); }); prev.disabled = page === 0; next.disabled = (page + 1) * 40 >= rows.length;
      paging.append(prev, node('span', (page + 1) + ' / ' + Math.max(1, Math.ceil(rows.length / 40))), next);
    }
    paint();
  };
})(typeof window === 'undefined' ? globalThis : window);
