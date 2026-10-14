/* Original local workbench rules. No network requests, telemetry, or private assets. */
(function (root) {
  'use strict';
  const copy = v => JSON.parse(JSON.stringify(v));
  const text = (v, max = 160) => { if (typeof v !== 'string' || v.length > max) throw Error('文字字段无效或超长'); return v.trim(); };
  const list = (v, max) => { if (!Array.isArray(v) || v.length > max) throw Error('记录列表无效或超限'); return v; };
  const unique = values => { if (new Set(values).size !== values.length) throw Error('记录标识重复'); };
  function ipv4(value) {
    if (typeof value !== 'string' || !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) throw Error('请输入有效 IPv4 地址');
    if(value.split('.').some(p=>p.length>1&&p.startsWith('0'))) throw Error('IPv4 地址不要使用前导零');
    const parts = value.split('.').map(Number); if (parts.some(n => n > 255)) throw Error('IPv4 地址超出范围');
    return parts.reduce((n, p) => n * 256 + p, 0);
  }
  function block(cidr) { const [ip, prefix] = String(cidr).split('/'); if (!/^\d{1,2}$/.test(prefix) || +prefix > 32) throw Error('CIDR 无效'); const size = 2 ** (32 - +prefix), start = Math.floor(ipv4(ip) / size) * size; return { start, end: start + size - 1, prefix: +prefix }; }
  function validateIpDetails(value = {}) {
    const addresses = list(value.addresses || [], 3000).map(r => {
      if (!r || !['static', 'reserved', 'gateway'].includes(r.kind)) throw Error('地址登记类型无效');
      ipv4(r.ip); return { id: text(r.id, 100), subnetId: text(r.subnetId, 100), ip: r.ip, kind: r.kind, name: text(r.name), owner: text(r.owner, 80), note: text(r.note, 300) };
    });
    const pools = list(value.pools || [], 300).map(r => { if (!r || ipv4(r.start) > ipv4(r.end)) throw Error('DHCP 池起止地址无效'); return { id: text(r.id, 100), subnetId: text(r.subnetId, 100), start: r.start, end: r.end, name: text(r.name, 100) }; });
    if (addresses.some(r => !r.id || !r.subnetId) || pools.some(r => !r.id || !r.subnetId)) throw Error('地址记录 ID 或所属子网为空'); unique([...addresses, ...pools].map(r => r.id));
    return { addresses, pools };
  }
  function ipIssues(entries, details) {
    const issues = [], subnets = new Map(entries.map(e => [e.id, block(e.cidr)])), seen = new Map();
    function check(ip, subnetId, label) { const b = subnets.get(subnetId), n = ipv4(ip); if (!b) issues.push(`${label}：所属子网已删除`); else if (n < b.start || n > b.end) issues.push(`${label}：不在所属子网内`); else if (b.prefix < 31 && (n === b.start || n === b.end)) issues.push(`${label}：占用了网络或广播地址`); return n; }
    for (const r of details.addresses) {
      const n = check(r.ip, r.subnetId, r.ip); if (seen.has(n)) issues.push(`${r.ip}：重复登记（${seen.get(n)} / ${r.name || r.kind}）`); seen.set(n, r.name || r.kind);
      for (const p of details.pools) if (n >= ipv4(p.start) && n <= ipv4(p.end)) issues.push(`${r.ip}：${r.kind === 'gateway' ? '网关' : '静态 / 保留地址'}与 DHCP 池「${p.name}」重叠`);
    }
    for (let i = 0; i < details.pools.length; i++) {
      const p = details.pools[i]; check(p.start, p.subnetId, `DHCP ${p.name} 起点`); check(p.end, p.subnetId, `DHCP ${p.name} 终点`);
      for (const q of details.pools.slice(i + 1)) if (ipv4(p.start) <= ipv4(q.end) && ipv4(q.start) <= ipv4(p.end)) issues.push(`DHCP 池「${p.name}」与「${q.name}」重叠`);
    }
    return issues;
  }
  function stocktakes(raw = []) {
    const tasks = list(raw, 30).map(t => {
      if (!t || !['open', 'closed'].includes(t.status) || !Number.isFinite(Date.parse(t.at))) throw Error('盘点任务格式无效');
      const items = list(t.items, 2000).map(i => {
        if (!i || !['asset', 'consumable'].includes(i.kind) || !['pending', 'found', 'mismatch', 'missing'].includes(i.result)) throw Error('盘点条目无效');
        if (!Number.isSafeInteger(i.expected) || i.expected < 0 || i.expected > 1000000 || i.actual !== null && (!Number.isSafeInteger(i.actual) || i.actual < 0 || i.actual > 1000000)) throw Error('盘点数量无效');
        if (!['unknown', 'good', 'faulty', 'maintenance', 'retired'].includes(i.condition)) throw Error('盘点状态无效');
        if(i.kind==='consumable'&&i.result!=='pending'&&i.actual===null)throw Error('耗材实盘数量不能为空');
        if(i.result==='missing'&&i.actual!==0)throw Error('未找到的实盘数量应为 0');
        return { id: text(i.id, 100), name: text(i.name, 100), assetNo: text(i.assetNo, 80), kind: i.kind, expected: i.expected, location: text(i.location), originalCondition: text(i.originalCondition, 30), result: i.result, actual: i.actual, observedLocation: text(i.observedLocation), condition: i.condition, note: text(i.note, 300) };
      }); unique(items.map(i => i.id));
      return { id: text(t.id, 100), name: text(t.name, 100), at: t.at, status: t.status, items, closedAt: text(t.closedAt || '', 50) };
    }); unique(tasks.map(t => t.id)); return tasks;
  }
  function stocktakeChanges(task, data, stocks) {
    const changes = [], warnings = [];
    for (const r of task.items) {
      const item = data.items.find(i => i.id === r.id);
      if (r.result === 'pending') { warnings.push(`${r.assetNo} 尚未盘点`); continue; }
      if (!item) { warnings.push(`${r.assetNo} 已从台账删除`); continue; }
      if (stocks.get(r.id) !== r.expected || item.location !== r.location || item.condition !== r.originalCondition) { warnings.push(`${r.assetNo} 台账在盘点期间已变化，请新建盘点任务`); continue; }
      if (item.kind === 'asset') {
        if (r.result === 'missing') { warnings.push(`${r.assetNo} 未找到，仅记盘点差异，不自动报废或归还`); continue; }
        if (r.condition === 'retired' || item.condition === 'retired') { warnings.push(`${r.assetNo} 报废必须走报废流水，不能由盘点修改`); continue; }
        if (r.observedLocation !== item.location || r.condition !== item.condition) changes.push({ id: r.id, kind: 'asset', location: r.observedLocation, condition: r.condition });
      } else if (r.actual !== null && r.actual !== r.expected) changes.push({ id: r.id, kind: 'consumable', delta: r.actual - r.expected, note: r.note || `${task.name}：实盘 ${r.actual}` });
    }
    return { changes, warnings };
  }
  function requestId(line) {
    try { const j = JSON.parse(line); const value = j.requestId ?? j.request_id ?? j.traceId ?? j.trace_id ?? j.correlationId; if (typeof value === 'string' || typeof value === 'number') return String(value).slice(0, 160); } catch {}
    return line.match(/\b(?:request[_-]?id|trace[_-]?id|correlation[_-]?id)\s*[:=]\s*["']?([\w.:-]{1,160})/i)?.[1] || '';
  }
  function shiftedTime(record, shift) { return record.at == null ? null : record.at + (Number(shift[record.source]) || 0) * 60000; }
  function timeline(records, shifts = {}, request = '', sort = true) {
    const result = records.filter(r => !request || requestId(r.text) === request).map(r => ({ ...r, adjustedAt: shiftedTime(r, shifts), requestId: requestId(r.text) }));
    return sort ? result.sort((a, b) => (a.adjustedAt ?? Infinity) - (b.adjustedAt ?? Infinity) || a.index - b.index) : result;
  }
  function fingerprint(line) { return line.replace(/^.*?\b(?:ERROR|WARN|FATAL)\b\s*/i, '').replace(/\b[\da-f]{8}-[\da-f-]{27,}\b/gi, '<id>').replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '<ip>').replace(/\b\d+(?:\.\d+)?\b/g, '<n>').slice(0, 240); }
  function aggregate(records, shifts = {}) {
    const clusters = new Map(), minutes = new Map();
    for (const r of records) {
      if (!['ERROR', 'FATAL', 'WARN'].includes(r.level)) continue;
      const key = fingerprint(r.text), c = clusters.get(key) || { key, count: 0, sample: r, sources: new Set() }; c.count++; c.sources.add(r.source); clusters.set(key, c);
      const at = shiftedTime(r, shifts); if (at !== null) { const minute = Math.floor(at / 60000) * 60000; minutes.set(minute, (minutes.get(minute) || 0) + 1); }
    }
    return { clusters: [...clusters.values()].sort((a, b) => b.count - a.count), minutes: [...minutes].sort((a, b) => a[0] - b[0]) };
  }
  function validateConnections(raw, devices) {
    const ids = new Set(devices.map(d => d.id));
    const connections = list(raw || [], 1500).map(c => {
      if (!c || !['network', 'powerA', 'powerB'].includes(c.kind) || !ids.has(c.from) || !ids.has(c.to) || c.from === c.to) throw Error('接线引用或类型无效');
      const r = { id: text(c.id, 100), from: c.from, to: c.to, fromPort: text(c.fromPort, 60), toPort: text(c.toPort, 60), kind: c.kind, label: text(c.label, 100) };
      if (!r.id || !r.fromPort || !r.toPort) throw Error('请输入两端接口 / 插口编号'); return r;
    }); unique(connections.map(c => c.id)); return connections;
  }
  function connectionIssues(connections, devices) {
    const issues = [], slots = new Map();
    for (const c of connections) {
      for (const [id, port] of [[c.from, c.fromPort], [c.to, c.toPort]]) {
        const key = id + '\0' + port.toLowerCase(), name = devices.find(d => d.id === id)?.name || id;
        if (slots.has(key)) issues.push(`${name} 接口 ${port} 重复登记：${slots.get(key)} / ${c.label || c.id}`); slots.set(key, c.label || c.id);
      }
    }
    for (const d of devices) {
      const feeds = connections.filter(c => c.from === d.id && /^power/.test(c.kind)), a = feeds.find(c => c.kind === 'powerA'), b = feeds.find(c => c.kind === 'powerB');
      if (a && b && a.to === b.to) issues.push(`${d.name} A/B 路连接到同一台设备，请核对独立供电设计`);
      if (feeds.length === 1) issues.push(`${d.name} 只登记了一路供电（不代表实物故障）`);
    }
    return issues;
  }
  function segmentHits(a, b, box) {
    if (a.x === b.x) return a.x > box.x && a.x < box.x + box.w && Math.max(a.y, b.y) > box.y && Math.min(a.y, b.y) < box.y + box.h;
    if (a.y === b.y) return a.y > box.y && a.y < box.y + box.h && Math.max(a.x, b.x) > box.x && Math.min(a.x, b.x) < box.x + box.w;
    return false;
  }
  function orthogonalRoute(start, end, boxes) {
    // Visibility grid: bounded by 150 editor nodes, run only for opt-in links.
    const xs = [...new Set([start.x, end.x, ...boxes.flatMap(b => [b.x - 12, b.x + b.w + 12])])].sort((a, b) => a - b);
    const ys = [...new Set([start.y, end.y, ...boxes.flatMap(b => [b.y - 12, b.y + b.h + 12])])].sort((a, b) => a - b);
    if (xs.length * ys.length > 4096) return null;
    const points = [], keys = new Map();
    for (let y = 0; y < ys.length; y++) for (let x = 0; x < xs.length; x++) {
      const p = { x: xs[x], y: ys[y] }; if (boxes.some(b => p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h)) continue;
      keys.set(x + ':' + y, points.length); points.push({ ...p, xi: x, yi: y });
    }
    const source = keys.get(xs.indexOf(start.x) + ':' + ys.indexOf(start.y)), target = keys.get(xs.indexOf(end.x) + ':' + ys.indexOf(end.y));
    if (source == null || target == null) return null;
    const dist = new Map([[source, 0]]), previous = new Map(), pending = new Set([source]), done = new Set();
    let expanded=0;
    while (pending.size) {
      if(++expanded>2000)return null;
      let current = null, best = Infinity; for (const id of pending) { const p = points[id], score = dist.get(id) + Math.abs(p.x - end.x) + Math.abs(p.y - end.y); if (score < best) { best = score; current = id; } }
      if (current === target) break; pending.delete(current); done.add(current); const p = points[current];
      for (const [x, y] of [[p.xi - 1, p.yi], [p.xi + 1, p.yi], [p.xi, p.yi - 1], [p.xi, p.yi + 1]]) {
        const next = keys.get(x + ':' + y); if (next == null || done.has(next) || boxes.some(b => segmentHits(p, points[next], b))) continue;
        const q = points[next], value = dist.get(current) + Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
        if (value < (dist.get(next) ?? Infinity)) { dist.set(next, value); previous.set(next, current); pending.add(next); }
      }
    }
    if (!dist.has(target)) return null; const path = []; for (let id = target; id != null; id = previous.get(id)) path.unshift({ x: points[id].x, y: points[id].y });
    return path.filter((p, i) => !i || i === path.length - 1 || !(path[i - 1].x === p.x && p.x === path[i + 1].x || path[i - 1].y === p.y && p.y === path[i + 1].y));
  }
  const api = { copy, text, ipv4, block, validateIpDetails, ipIssues, stocktakes, stocktakeChanges, requestId, shiftedTime, timeline, fingerprint, aggregate, validateConnections, connectionIssues, segmentHits, orthogonalRoute };
  root.OpsModels = api; if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
