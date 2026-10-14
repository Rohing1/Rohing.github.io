(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HarModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const PHASES = [
    ['blocked', '排队/阻塞'], ['dns', 'DNS'], ['connect', '连接'],
    ['ssl', 'TLS'], ['send', '发送'], ['wait', '等待首字节'], ['receive', '接收']
  ];
  const SENSITIVE = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-auth-token)$/i;
  const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const positive = value => Math.max(0, finite(value));
  function phases(timings) {
    const t = timings && typeof timings === 'object' ? timings : {};
    const ssl = positive(t.ssl);
    return {
      blocked: positive(t.blocked), dns: positive(t.dns),
      connect: Math.max(0, positive(t.connect) - ssl), ssl,
      send: positive(t.send), wait: positive(t.wait), receive: positive(t.receive)
    };
  }
  function safeAddress(value) {
    try {
      const url = new URL(String(value || ''));
      if (!/^https?:$/.test(url.protocol)) return { host: '其他协议', label: '非 HTTP 请求' };
      const segments = url.pathname.split('/').filter(Boolean);
      const tail = segments.slice(-2).map(segment => /@|^(?:[A-Za-z0-9_-]{30,}|[a-f\d]{32,})$/i.test(segment) ? '[隐藏片段]' : segment).join('/') || '/';
      return { host: url.host, label: '/' + tail + (url.search ? ' ?…' : '') };
    } catch (_) { return { host: '未知主机', label: '无法解析的地址' }; }
  }
  function headerCount(headers) {
    return Array.isArray(headers) ? headers.filter(h => SENSITIVE.test(String(h && h.name || ''))).length : 0;
  }
  function parseHar(input) {
    const log = input && input.log;
    if (!log || !Array.isArray(log.entries)) throw new Error('不是有效的 HAR：缺少 log.entries 数组。');
    if (log.entries.length > 25000) throw new Error('请求超过 25,000 条，请先在浏览器开发者工具中筛选或截取问题时段。');
    const rows = log.entries.map((entry, index) => {
      if (!entry || typeof entry !== 'object') return null;
      const started = Date.parse(entry.startedDateTime);
      if (!Number.isFinite(started)) return null;
      const p = phases(entry.timings);
      const phaseSum = Object.values(p).reduce((a, b) => a + b, 0);
      const duration = positive(entry.time) || phaseSum;
      const response = entry.response || {};
      const request = entry.request || {};
      const address = safeAddress(request.url);
      const size = positive(response.bodySize) || positive(response.content && response.content.size);
      const status = Number.isFinite(Number(response.status)) ? Number(response.status) : 0;
      const alerts = [];
      if (status >= 400) alerts.push('HTTP ' + status);
      if (duration >= 2000) alerts.push('耗时超过 2 秒');
      if (p.wait >= 800) alerts.push('等待首字节较长');
      if (p.dns >= 400) alerts.push('DNS 时间较长');
      if (p.connect + p.ssl >= 600) alerts.push('建连时间较长');
      if (size >= 2 * 1024 * 1024) alerts.push('响应体较大');
      return {
        index, started, duration, end: started + duration, phases: p,
        host: address.host, label: address.label,
        method: String(request.method || 'GET').slice(0, 12),
        status, size, mime: String(response.content && response.content.mimeType || '').split(';')[0].slice(0, 80),
        protocol: String(response.httpVersion || '').slice(0, 24),
        alert: alerts, sensitiveHeaders: headerCount(request.headers) + headerCount(response.headers)
      };
    }).filter(Boolean).sort((a, b) => a.started - b.started || a.index - b.index);
    if (!rows.length) throw new Error('HAR 中没有可分析的请求时间戳。');
    const first = rows[0].started;
    const last = Math.max(...rows.map(row => row.end));
    const totals = Object.fromEntries(PHASES.map(([key]) => [key, rows.reduce((sum, row) => sum + row.phases[key], 0)]));
    const hosts = new Map();
    for (const row of rows) {
      const item = hosts.get(row.host) || { host: row.host, count: 0, bytes: 0, duration: 0 };
      item.count++; item.bytes += row.size; item.duration += row.duration;
      hosts.set(row.host, item);
    }
    return {
      rows, first, duration: Math.max(1, last - first), totals,
      hosts: [...hosts.values()].sort((a, b) => b.duration - a.duration),
      bytes: rows.reduce((sum, row) => sum + row.size, 0),
      issueCount: rows.filter(row => row.alert.length).length,
      sensitiveCount: rows.reduce((sum, row) => sum + row.sensitiveHeaders, 0),
      invalidCount: log.entries.length - rows.length,
      pages: Array.isArray(log.pages) ? log.pages.length : 0
    };
  }
  return { PHASES, phases, parseHar, safeAddress };
});
