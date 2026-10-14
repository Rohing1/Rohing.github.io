/* Two local, explicitly saved planning snapshots. No network requests. */
(function () {
  'use strict';
  const DB = 'yj-scenario-comparison-v1';
  const STORE = 'snapshots';
  const open = () => new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(Error('当前浏览器不支持本地方案库'));
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || Error('方案库打开失败'));
  });
  async function read(key) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      request.onsuccess = () => { db.close(); resolve(request.result || null); };
      request.onerror = () => { db.close(); reject(request.error || Error('读取失败')); };
    });
  }
  async function write(key, value) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put(value, key);
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => { db.close(); reject(transaction.error || Error('写入失败')); };
      transaction.onabort = () => { db.close(); reject(transaction.error || Error('写入已中止')); };
    });
  }
  const node = (tag, label, cls) => { const element = document.createElement(tag); if (label != null) element.textContent = label; if (cls) element.className = cls; return element; };
  const clone = value => JSON.parse(JSON.stringify(value));
  window.ScenarioCompare = { mount(config) {
    const target = document.querySelector(config.after);
    if (!target) throw Error('找不到方案对比挂载点');
    const root = node('section', null, 'scenario-compare panel');
    root.setAttribute('aria-label', 'A/B 方案对比');
    const heading = node('div', null, 'scenario-compare-heading');
    heading.append(node('h2', 'A/B 方案对比'), node('p', '分别保存两套参数，比较结果与关键假设。编辑当前方案不会自动覆盖已保存的快照。'));
    const actions = node('div', null, 'scenario-compare-actions');
    const status = node('p', '正在读取本机方案库…', 'scenario-compare-status'); status.setAttribute('role', 'status');
    const scroll = node('div', null, 'scenario-compare-scroll');
    const table = node('table'); const caption = node('caption', '两套方案的同口径估算结果'); table.append(caption);
    const thead = node('thead'); const header = node('tr'); ['指标', '方案 A', '方案 B', 'B 相对 A'].forEach(label => header.append(node('th', label))); thead.append(header); table.append(thead);
    const body = node('tbody'); table.append(body); scroll.append(table);
    const assumptions = node('div', null, 'scenario-compare-assumptions');
    const caution = node('p', config.caution, 'scenario-compare-caution');
    root.append(heading, actions, status, scroll, assumptions, caution); target.after(root);
    let slots = { A: null, B: null };
    const say = message => { status.textContent = message; };
    const key = slot => `${config.id}:${slot}`;
    function valid(raw) { const result = config.validate(clone(raw)); if (!result) throw Error('方案内容无效'); return result; }
    function paint() {
      body.replaceChildren(); assumptions.replaceChildren();
      const sets = {};
      for (const slot of ['A', 'B']) {
        if (!slots[slot]) continue;
        try { sets[slot] = config.metrics(valid(slots[slot].data)); }
        catch { say(`方案 ${slot} 读取异常，请重新保存或导入备份。`); }
      }
      const rows = sets.A || sets.B || [];
      if (!rows.length) { const tr = node('tr'); const td = node('td', '先点击“保存当前为 A / B”，即可比较。'); td.colSpan = 4; tr.append(td); body.append(tr); }
      for (let i = 0; i < rows.length; i++) {
        const a = sets.A?.[i], b = sets.B?.[i], tr = node('tr');
        tr.append(node('th', (a || b).label));
        tr.append(node('td', a?.display ?? '—'), node('td', b?.display ?? '—'));
        const delta = a && b && Number.isFinite(a.value) && Number.isFinite(b.value) ? b.value - a.value : null;
        tr.append(node('td', delta === null ? '—' : `${delta > 0 ? '+' : ''}${config.formatDelta(delta, (a || b).unit)}`));
        body.append(tr);
      }
      for (const slot of ['A', 'B']) {
        const card = node('div', null, 'scenario-compare-card');
        card.append(node('strong', `方案 ${slot}${slots[slot] ? ' · ' + new Date(slots[slot].savedAt).toLocaleString('zh-CN') : ' · 未保存'}`));
        if (slots[slot]) {
          try { card.append(node('p', config.assumptions(valid(slots[slot].data)))); }
          catch { card.append(node('p', '方案内容无法解析')); }
        }
        assumptions.append(card);
      }
      for (const button of actions.querySelectorAll('[data-load]')) button.disabled = !slots[button.dataset.load];
    }
    async function save(slot) {
      try {
        const data = valid(config.get());
        const record = { savedAt: new Date().toISOString(), data };
        await write(key(slot), record); slots[slot] = record; paint(); say(`当前参数已保存为方案 ${slot}。请另行导出对比备份，以防浏览器数据被清除。`);
      } catch (error) { say(`保存方案 ${slot} 失败：${error.message}。当前编辑未丢失。`); }
    }
    for (const slot of ['A', 'B']) {
      const saveButton = node('button', `保存当前为 ${slot}`); saveButton.type = 'button'; saveButton.onclick = () => save(slot); actions.append(saveButton);
      const loadButton = node('button', `载入 ${slot}`); loadButton.type = 'button'; loadButton.dataset.load = slot; loadButton.onclick = () => {
        if (!slots[slot] || !confirm(`载入方案 ${slot} 会替换当前正在编辑的参数。建议先保存当前方案，继续？`)) return;
        try { config.apply(valid(slots[slot].data)); say(`已载入方案 ${slot}；保存的 A/B 快照未改变。`); }
        catch (error) { say(`载入失败：${error.message}`); }
      }; actions.append(loadButton);
    }
    const exportButton = node('button', '导出 A/B 备份'); exportButton.type = 'button'; exportButton.onclick = () => {
      if (!slots.A && !slots.B) return say('请先保存至少一套方案。');
      const blob = new Blob([JSON.stringify({ app: config.id, schema: 1, exportedAt: new Date().toISOString(), slots })], { type: 'application/json' });
      const url = URL.createObjectURL(blob), link = node('a'); link.href = url; link.download = `${config.id}-A-B-方案备份.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      say('已发起 A/B 备份下载；请确认浏览器下载成功。备份可能包含图纸或敏感信息。');
    }; actions.append(exportButton);
    const importLabel = node('label', '恢复 A/B 备份', 'scenario-compare-import');
    const input = node('input'); input.type = 'file'; input.accept = '.json,application/json'; input.setAttribute('aria-label', '恢复 A/B 方案备份'); importLabel.append(input); actions.append(importLabel);
    input.onchange = async () => {
      const file = input.files?.[0]; input.value = ''; if (!file) return;
      try {
        if (file.size > (config.maxBackupBytes || 18 * 1024 * 1024)) throw Error('备份过大');
        const data = JSON.parse(await file.text());
        if (data.app !== config.id || data.schema !== 1 || !data.slots || !Object.keys(data.slots).every(s => ['A', 'B'].includes(s))) throw Error('不是本页的 A/B 备份');
        const next = {};
        for (const slot of ['A', 'B']) if (data.slots[slot]) next[slot] = { savedAt: data.slots[slot].savedAt, data: valid(data.slots[slot].data) };
        if (!next.A && !next.B) throw Error('备份内没有方案');
        if (!confirm('恢复将覆盖本页已保存的 A/B 快照，但不会修改当前正在编辑的方案。确认继续？')) return;
        for (const slot of Object.keys(next)) await write(key(slot), next[slot]);
        slots = { ...slots, ...next }; paint(); say('A/B 方案备份已恢复。可按需载入其中一套。');
      } catch (error) { say(`恢复 A/B 备份失败：${error.message}`); }
    };
    Promise.all(['A', 'B'].map(async slot => { const record = await read(key(slot)); if (record) slots[slot] = record; }))
      .then(() => { paint(); say('方案 A/B 保存在此浏览器，清理站点数据会丢失；请定期导出 A/B 备份。'); })
      .catch(error => { paint(); say(`无法读取本机方案库：${error.message}。请检查浏览器存储权限。`); });
    return { refresh: paint };
  }};
})();
