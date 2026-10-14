(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const ui = {
    file: $('file'), zone: $('dropzone'), demo: $('demo'), clear: $('clear'), label: $('file-label'), status: $('status'), results: $('results'), warnings: $('warnings'),
    packets: $('metric-packets'), bytes: $('metric-bytes'), sessionsTotal: $('metric-sessions'), findingTotal: $('metric-findings'), format: $('metric-format'),
    timeline: $('timeline'), range: $('time-range'), protocols: $('protocols'), findings: $('findings'), findingsCount: $('findings-count'), sessions: $('sessions'),
    search: $('search'), protocolFilter: $('protocol-filter'), clues: $('clues-only'), filterCount: $('filter-count'), rows: $('packet-rows'), prev: $('previous'), next: $('next'), page: $('page-label'),
    dialog: $('detail'), close: $('close-detail'), detailTitle: $('detail-title'), fields: $('detail-fields'), detailHex: $('detail-hex')
  };
  const PAGE_SIZE = 50;
  const MAX_FILE = 128 * 1024 * 1024;
  let result = null, filtered = [], page = 0, worker = null, job = 0, searchTimer = 0;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }
  function bytes(n) {
    return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KiB` : `${(n / 1048576).toFixed(2)} MiB`;
  }
  function time(n) {
    if (n == null || !Number.isFinite(n)) return '无时间戳';
    return `${new Date(n).toLocaleTimeString('zh-CN', {hour12: false})}.${String(Math.floor(n % 1000)).padStart(3, '0')}`;
  }
  function status(message, error = false) {
    ui.status.textContent = message;
    ui.status.classList.toggle('error', error);
    ui.status.classList.toggle('success', !error && Boolean(result));
  }
  function clear() {
    job++;
    if (worker) { worker.terminate(); worker = null; }
    result = null; filtered = []; page = 0; ui.file.value = '';
    ui.label.textContent = '尚未载入文件'; ui.results.hidden = true; ui.clear.disabled = true;
    ui.search.value = ''; ui.clues.checked = false; ui.protocolFilter.replaceChildren(element('option', '', '全部协议'));
    ui.protocolFilter.firstChild.value = '';
    status('等待读取本地文件。');
  }
  async function readFile(file) {
    if (!file) return;
    if (file.size > MAX_FILE) { status('文件超过 128 MiB。请先截取需要排查的时间段。', true); return; }
    if (!file.size) { status('文件为空。', true); return; }
    const thisJob = ++job;
    if (worker) worker.terminate(); worker = null;
    result = null; ui.results.hidden = true; ui.clear.disabled = false;
    ui.label.textContent = `${file.name} · ${bytes(file.size)}`;
    status('正在本地读取文件…');
    try {
      const buffer = await file.arrayBuffer();
      if (thisJob !== job) return;
      status('正在后台解析，较大的抓包可能需要几秒…');
      worker = new Worker('pcap-worker.js');
      worker.onmessage = event => {
        if (thisJob !== job) return;
        worker.terminate(); worker = null;
        if (!event.data.ok) { status(event.data.error, true); return; }
        result = event.data.result; render();
        status(`已在本地读取 ${result.packets.length.toLocaleString()} 个包。`);
      };
      worker.onerror = () => {
        if (thisJob !== job) return;
        worker.terminate(); worker = null;
        status('后台解析失败。请检查文件是否为有效 PCAP/PCAPNG。', true);
      };
      worker.postMessage({buffer}, [buffer]);
    } catch (error) { if (thisJob === job) status(`无法读取文件：${error.message || '未知错误'}`, true); }
  }
  function renderTimeline() {
    ui.timeline.replaceChildren();
    const timestamps = result.packets.map(p => p.time).filter(n => n != null && Number.isFinite(n));
    if (!timestamps.length) { ui.timeline.append(element('p', 'empty-state', '此文件没有可用时间戳。')); ui.range.textContent = '例如 PCAPNG 的 Simple Packet Block 不包含时间戳。'; return; }
    const min = Math.min(...timestamps), max = Math.max(...timestamps), buckets = Array(30).fill(0);
    for (const stamp of timestamps) buckets[Math.min(29, Math.floor((stamp - min) / (max - min || 1) * 29))]++;
    const peak = Math.max(...buckets);
    for (let i = 0; i < buckets.length; i++) {
      const bar = element('div', 'time-bar');
      bar.style.height = `${Math.max(4, buckets[i] / peak * 100)}%`;
      bar.title = `第 ${i + 1} 段：${buckets[i]} 包`;
      bar.setAttribute('aria-label', bar.title);
      ui.timeline.append(bar);
    }
    ui.range.textContent = `${new Date(min).toLocaleString('zh-CN')} → ${new Date(max).toLocaleString('zh-CN')} · ${((max - min) / 1000).toFixed(2)} 秒`;
  }
  function renderProtocols() {
    ui.protocols.replaceChildren();
    const entries = Object.entries(result.counts).sort((a, b) => b[1] - a[1]);
    ui.protocolFilter.replaceChildren(element('option', '', '全部协议'));
    ui.protocolFilter.firstChild.value = '';
    for (const [name, count] of entries) {
      const option = element('option', '', name); option.value = name; ui.protocolFilter.append(option);
      const row = element('div', 'protocol-row');
      const label = element('div', 'protocol-label'); label.append(element('strong', '', name), element('span', '', `${count.toLocaleString()} 包 · ${(count / result.packets.length * 100).toFixed(1)}%`));
      const track = element('div', 'protocol-track'); const fill = element('div', 'protocol-fill'); fill.style.width = `${count / result.packets.length * 100}%`; track.append(fill);
      row.append(label, track); ui.protocols.append(row);
    }
    if (!entries.length) ui.protocols.append(element('p', 'empty-state', '没有可显示的数据包。'));
  }
  function renderFindings() {
    ui.findings.replaceChildren();
    ui.findingsCount.textContent = `${result.findings.length} 条${result.findings.length === 100 ? '（达到展示上限）' : ''}`;
    if (!result.findings.length) { ui.findings.append(element('p', 'empty-state', '暂未发现预设线索；这不代表流量一定正常。')); return; }
    for (const item of result.findings.slice(0, 20)) {
      const button = element('button', 'finding-item'); button.type = 'button';
      const tag = element('span', 'finding-tag', item.mark), detail = element('span', 'finding-detail', `#${item.index} · ${item.detail}`);
      button.append(tag, detail); button.addEventListener('click', () => openPacket(item.index)); ui.findings.append(button);
    }
    if (result.findings.length > 20) ui.findings.append(element('p', 'hint', `还有 ${result.findings.length - 20} 条线索；可在下方勾选“只看线索包”。`));
  }
  function renderSessions() {
    ui.sessions.replaceChildren();
    if (!result.sessions.length) { ui.sessions.append(element('p', 'empty-state', '没有可归并的双向 IP 会话。')); return; }
    for (const session of result.sessions.slice(0, 10)) {
      const row = element('div', 'session-item');
      const path = element('strong', 'session-path', `${session.a} ↔ ${session.b}`);
      const meta = element('span', 'session-meta', `${session.protocols} · ${session.packets} 包 · ${bytes(session.bytes)}`);
      row.append(path, meta); ui.sessions.append(row);
    }
  }
  function applyFilter() {
    if (!result) return;
    const query = ui.search.value.trim().toLocaleLowerCase(), protocol = ui.protocolFilter.value, clues = ui.clues.checked;
    filtered = result.packets.filter(p => (!protocol || p.protocol === protocol) && (!clues || p.marks.length) &&
      (!query || `${p.source} ${p.target} ${p.protocol} ${p.info} ${p.marks.join(' ')}`.toLocaleLowerCase().includes(query)));
    page = 0; renderPage();
  }
  function renderPage() {
    ui.rows.replaceChildren();
    const start = page * PAGE_SIZE, slice = filtered.slice(start, start + PAGE_SIZE);
    for (const packet of slice) {
      const row = element('tr', packet.marks.length ? 'marked' : ''); row.tabIndex = 0;
      for (const value of [packet.index, time(packet.time), packet.source, packet.target, packet.protocol, `${packet.length} B`, `${packet.info}${packet.marks.length ? ` · ${packet.marks.join(' / ')}` : ''}`]) row.append(element('td', '', value));
      row.addEventListener('click', () => openPacket(packet.index));
      row.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPacket(packet.index); } });
      ui.rows.append(row);
    }
    if (!slice.length) { const row = element('tr'); const cell = element('td', 'empty-state', '没有匹配的数据包。'); cell.colSpan = 7; row.append(cell); ui.rows.append(row); }
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    ui.page.textContent = `${page + 1} / ${totalPages} 页`;
    ui.prev.disabled = page === 0; ui.next.disabled = page + 1 >= totalPages;
    ui.filterCount.textContent = `显示 ${filtered.length.toLocaleString()} / ${result.packets.length.toLocaleString()} 包`;
  }
  function openPacket(index) {
    const packet = result?.packets[index - 1]; if (!packet) return;
    ui.detailTitle.textContent = `数据包 #${packet.index}`; ui.fields.replaceChildren();
    const fields = [['时间', time(packet.time)], ['来源', packet.source], ['目标', packet.target], ['协议', packet.protocol],
      ['长度', `${packet.length} B（已捕获 ${packet.captured} B）`], ['摘要', packet.info], ['线索', packet.marks.join(' / ') || '无'], ['链路类型', String(packet.linkType)]];
    if (packet.seq != null) fields.push(['TCP 序号 / 确认号', `${packet.seq} / ${packet.ack}`]);
    if (packet.dns) fields.push(['DNS 事务 ID', `0x${packet.dns.id.toString(16).padStart(4, '0')}`]);
    for (const [name, value] of fields) ui.fields.append(element('dt', '', name), element('dd', '', value));
    ui.detailHex.textContent = packet.hex || '无可显示字节'; ui.dialog.showModal();
  }
  function render() {
    ui.results.hidden = false; ui.clear.disabled = false;
    ui.packets.textContent = result.packets.length.toLocaleString(); ui.bytes.textContent = bytes(result.bytesTotal);
    ui.sessionsTotal.textContent = result.sessionCount.toLocaleString(); ui.findingTotal.textContent = result.findings.length.toLocaleString();
    ui.format.textContent = `${result.format} · 链路类型 ${[...new Set(result.interfaces)].join(', ') || '未知'}`;
    ui.warnings.replaceChildren();
    for (const item of result.warnings) ui.warnings.append(element('p', '', item));
    ui.warnings.hidden = !result.warnings.length;
    renderTimeline(); renderProtocols(); renderFindings(); renderSessions(); applyFilter();
  }
  function demoCapture() {
    const records = [];
    const push16 = (arr, n) => arr.push(n >> 8 & 255, n & 255);
    const push32le = (arr, n) => arr.push(n & 255, n >>> 8 & 255, n >>> 16 & 255, n >>> 24 & 255);
    const ethIp = (proto, from, to, payload) => {
      const frame = [0, 17, 34, 51, 68, 85, 102, 119, 136, 153, 170, 187, 8, 0, 0x45, 0];
      push16(frame, 20 + payload.length); frame.push(0, 1, 0, 0, 64, proto, 0, 0, ...from, ...to, ...payload); return frame;
    };
    const udp = (sourcePort, targetPort, payload) => {
      const value = []; push16(value, sourcePort); push16(value, targetPort); push16(value, 8 + payload.length); push16(value, 0); return [...value, ...payload];
    };
    const tcp = (sourcePort, targetPort, seq, ack, flags, payload = []) => {
      const value = []; push16(value, sourcePort); push16(value, targetPort);
      for (const n of [seq, ack]) value.push(n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255);
      value.push(0x50, flags, 0x20, 0, 0, 0, 0, 0); return [...value, ...payload];
    };
    const domain = [7, ...'example'.split('').map(c => c.charCodeAt(0)), 3, ...'com'.split('').map(c => c.charCodeAt(0)), 0];
    const dnsQuery = [0x12, 0x34, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, ...domain, 0, 1, 0, 1];
    const dnsAnswer = [0x12, 0x34, 0x81, 0x80, 0, 1, 0, 1, 0, 0, 0, 0, ...domain, 0, 1, 0, 1, 0xc0, 0x0c, 0, 1, 0, 1, 0, 0, 0, 30, 0, 4, 93, 184, 215, 14];
    const client = [192, 0, 2, 10], dns = [192, 0, 2, 53], server = [93, 184, 215, 14];
    records.push(ethIp(17, client, dns, udp(53000, 53, dnsQuery)));
    records.push(ethIp(17, dns, client, udp(53, 53000, dnsAnswer)));
    records.push(ethIp(6, client, server, tcp(51234, 80, 1000, 0, 2)));
    records.push(ethIp(6, server, client, tcp(80, 51234, 9000, 1001, 18)));
    const get = [...new TextEncoder().encode('GET /guide?sample=1 HTTP/1.1\r\nHost: example.com\r\n\r\n')];
    records.push(ethIp(6, client, server, tcp(51234, 80, 1001, 9001, 24, get)));
    records.push(ethIp(6, client, server, tcp(51234, 80, 1001, 9001, 24, get)));
    records.push(ethIp(6, server, client, tcp(80, 51234, 9001, 1001 + get.length, 20)));
    const output = [0xd4, 0xc3, 0xb2, 0xa1, 2, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff, 0, 0, 1, 0, 0, 0];
    records.forEach((record, index) => { push32le(output, 1730000000 + index); push32le(output, 0); push32le(output, record.length); push32le(output, record.length); output.push(...record); });
    return new File([new Uint8Array(output)], '演示样本.pcap', {type: 'application/vnd.tcpdump.pcap'});
  }
  ui.file.addEventListener('change', () => readFile(ui.file.files[0]));
  ui.demo.addEventListener('click', () => readFile(demoCapture()));
  ui.clear.addEventListener('click', clear);
  for (const eventName of ['dragenter', 'dragover']) ui.zone.addEventListener(eventName, event => { event.preventDefault(); ui.zone.classList.add('dragging'); });
  for (const eventName of ['dragleave', 'drop']) ui.zone.addEventListener(eventName, event => { event.preventDefault(); ui.zone.classList.remove('dragging'); });
  ui.zone.addEventListener('drop', event => readFile(event.dataTransfer.files[0]));
  ui.search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(applyFilter, 120); });
  ui.protocolFilter.addEventListener('change', applyFilter); ui.clues.addEventListener('change', applyFilter);
  ui.prev.addEventListener('click', () => { page--; renderPage(); });
  ui.next.addEventListener('click', () => { page++; renderPage(); });
  ui.close.addEventListener('click', () => ui.dialog.close());
})();
