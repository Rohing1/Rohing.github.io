(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const ui = {
    badge: $('connection-badge'), port: $('port-label'), warning: $('support-warning'), message: $('connection-message'),
    connect: $('connect'), disconnect: $('disconnect'), baud: $('baud-rate'), dataBits: $('data-bits'), stopBits: $('stop-bits'), parity: $('parity'), flow: $('flow-control'),
    unlock: $('unlock-send'), send: $('send'), sendInput: $('send-input'), sendMode: $('send-mode'), lineEnding: $('line-ending'), sendHint: $('send-hint'), recordSent: $('record-sent'),
    terminal: $('terminal'), viewMode: $('view-mode'), autoscroll: $('autoscroll'), bytesIn: $('bytes-in'), bytesOut: $('bytes-out'), bufferInfo: $('buffer-info'),
    exportTxt: $('export-txt'), exportJson: $('export-json'), clearLog: $('clear-log')
  };
  const MAX_RX_BYTES = 1024 * 1024;
  const MAX_ENTRIES = 2000;
  const ENDINGS = {none: '', cr: '\r', lf: '\n', crlf: '\r\n'};
  const supported = 'serial' in navigator && window.isSecureContext;
  let port = null;
  let reader = null;
  let readTask = null;
  let writeTask = null;
  let pending = false;
  let entries = [];
  let retainedRxBytes = 0;
  let dropped = 0;
  let received = 0;
  let sent = 0;
  let renderTimer = null;

  function status(message, error = false) {
    ui.message.textContent = message;
    ui.message.classList.toggle('error', error);
    ui.message.classList.toggle('success', !error && Boolean(port));
  }

  function bytesLabel(value) {
    return value < 1024 ? `${value} B` : value < 1024 * 1024 ? `${(value / 1024).toFixed(1)} KiB` : `${(value / 1024 / 1024).toFixed(2)} MiB`;
  }

  function refreshControls() {
    const connected = Boolean(port);
    ui.connect.disabled = !supported || pending || connected;
    ui.disconnect.disabled = pending || !connected;
    ui.send.disabled = pending || !connected || !ui.unlock.checked;
    for (const input of [ui.baud, ui.dataBits, ui.stopBits, ui.parity, ui.flow]) input.disabled = pending || connected;
    ui.badge.dataset.state = pending ? 'busy' : connected ? 'on' : 'off';
    ui.badge.textContent = pending ? '● 正在处理' : connected ? '● 已连接' : '● 未连接';
    ui.bytesIn.textContent = bytesLabel(received);
    ui.bytesOut.textContent = bytesLabel(sent);
    const hasLog = entries.length > 0;
    ui.exportTxt.disabled = !hasLog;
    ui.exportJson.disabled = !hasLog;
    ui.clearLog.disabled = !hasLog;
    ui.bufferInfo.textContent = hasLog ? `当前保留 ${bytesLabel(retainedRxBytes)} 接收数据 · ${entries.length} 条片段${dropped ? ` · 较早片段已丢弃 ${dropped} 条` : ''}` : '会话缓冲区为空';
  }

  function log(kind, value) {
    const item = {time: new Date().toISOString(), kind, value};
    if (kind === 'rx') retainedRxBytes += value.length;
    entries.push(item);
    while (entries.length > MAX_ENTRIES || retainedRxBytes > MAX_RX_BYTES) {
      const removed = entries.shift();
      if (removed.kind === 'rx') retainedRxBytes -= removed.value.length;
      dropped++;
    }
    refreshControls();
    scheduleRender();
  }

  function timestamp(iso) {
    return new Date(iso).toLocaleTimeString('zh-CN', {hour12: false});
  }

  function hex(bytes) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ');
  }

  function render() {
    renderTimer = null;
    if (!entries.length) {
      ui.terminal.textContent = '连接串口后，设备输出将显示在这里。';
      return;
    }
    const decoder = new TextDecoder('utf-8', {fatal: false});
    const isHex = ui.viewMode.value === 'hex';
    let output = dropped ? `[较早的 ${dropped} 条片段已从内存中移除]\n` : '';
    for (const item of entries) {
      if (item.kind === 'rx') {
        if (isHex) output += `[${timestamp(item.time)}] RX  ${hex(item.value)}\n`;
        else output += decoder.decode(item.value, {stream: true});
      } else {
        if (output && !output.endsWith('\n')) output += '\n';
        output += `[${timestamp(item.time)}] ${item.kind.toUpperCase()}  ${item.value}\n`;
      }
    }
    if (!isHex) output += decoder.decode();
    const nearBottom = ui.terminal.scrollHeight - ui.terminal.scrollTop - ui.terminal.clientHeight < 80;
    ui.terminal.textContent = output || '等待设备输出…';
    if (ui.autoscroll.checked && nearBottom) ui.terminal.scrollTop = ui.terminal.scrollHeight;
  }

  function scheduleRender() {
    if (renderTimer === null) renderTimer = window.setTimeout(render, 120);
  }

  function connectionOptions() {
    const baudRate = Number(ui.baud.value);
    if (!Number.isInteger(baudRate) || baudRate < 1 || baudRate > 4000000) throw new Error('波特率需为 1 到 4,000,000 之间的整数。');
    return {baudRate, dataBits: Number(ui.dataBits.value), stopBits: Number(ui.stopBits.value), parity: ui.parity.value, flowControl: ui.flow.value};
  }

  function deviceName(selected) {
    const info = selected.getInfo?.() || {};
    if (info.usbVendorId !== undefined && info.usbProductId !== undefined) {
      return `USB VID ${info.usbVendorId.toString(16).padStart(4, '0').toUpperCase()} · PID ${info.usbProductId.toString(16).padStart(4, '0').toUpperCase()}`;
    }
    return '用户授权的串口设备';
  }

  async function readLoop(selected) {
    let failure = '';
    try {
      while (selected === port && selected.readable) {
        const activeReader = selected.readable.getReader();
        reader = activeReader;
        try {
          while (selected === port) {
            const {value, done} = await activeReader.read();
            if (done) break;
            if (value?.length) {
              const copy = Uint8Array.from(value);
              received += copy.length;
              log('rx', copy);
            }
          }
        } finally {
          activeReader.releaseLock();
          if (reader === activeReader) reader = null;
        }
        if (selected === port) break;
      }
    } catch (error) {
      failure = error?.message || String(error);
    } finally {
      if (selected === port) {
        port = null;
        ui.unlock.checked = false;
        refreshControls();
        status(failure ? `串口读取中断：${failure}` : '设备连接已结束。', Boolean(failure));
        log('system', failure ? '读取中断，连接已结束。' : '连接已结束。');
        try { await selected.close(); } catch { /* 设备拔出时关闭可能失败 */ }
      }
    }
  }

  async function connect() {
    if (!navigator.serial || pending || port) return;
    let options;
    try { options = connectionOptions(); } catch (error) { status(error.message, true); return; }
    pending = true;
    refreshControls();
    let selected;
    try {
      selected = await navigator.serial.requestPort();
      await selected.open(options);
      port = selected;
      ui.port.textContent = deviceName(selected);
      status(`已连接 · ${options.baudRate} baud。`);
      log('system', `已连接 · ${ui.port.textContent} · ${options.baudRate} baud。`);
      readTask = readLoop(selected);
    } catch (error) {
      if (error?.name === 'NotFoundError') status('已取消选择串口。');
      else status(`连接失败：${error?.message || error}。请检查权限、驱动及端口占用。`, true);
      if (selected && !port) try { await selected.close(); } catch { /* 端口可能尚未打开 */ }
    } finally {
      pending = false;
      refreshControls();
    }
  }

  async function disconnect(message = '已手动断开连接。') {
    if (!port || pending) return;
    pending = true;
    const selected = port;
    port = null;
    ui.unlock.checked = false;
    refreshControls();
    try {
      if (reader) await reader.cancel();
      if (readTask) await readTask;
      if (writeTask) await writeTask.catch(() => {});
      await selected.close();
      status(message);
      log('system', message);
    } catch (error) {
      status(`连接已断开，但关闭端口时出现提示：${error?.message || error}`, true);
      log('system', '连接已断开；关闭端口时出现提示。');
    } finally {
      reader = null;
      readTask = null;
      writeTask = null;
      pending = false;
      refreshControls();
    }
  }

  function parseHex(input) {
    const clean = input.replace(/\s+/g, '');
    if (!clean || clean.length % 2 || /[^0-9a-f]/i.test(clean)) throw new Error('十六进制内容须由完整的两位字节组成，例如 48 65 6C 6C 6F。');
    return Uint8Array.from(clean.match(/../g), (pair) => parseInt(pair, 16));
  }

  function payload() {
    const raw = ui.sendInput.value;
    if (!raw.trim()) throw new Error('请先输入要发送的内容。');
    if (ui.sendMode.value === 'hex') return parseHex(raw);
    const ending = ENDINGS[ui.lineEnding.value] || '';
    return new TextEncoder().encode(raw + ending);
  }

  async function send() {
    if (!port || pending || !ui.unlock.checked || writeTask) return;
    let bytes;
    try { bytes = payload(); } catch (error) { status(error.message, true); return; }
    const selected = port;
    ui.send.disabled = true;
    writeTask = (async () => {
      const writer = selected.writable.getWriter();
      try { await writer.write(bytes); } finally { writer.releaseLock(); }
    })();
    try {
      await writeTask;
      sent += bytes.length;
      const detail = ui.recordSent.checked ? (ui.sendMode.value === 'hex' ? hex(bytes) : ui.sendInput.value) : '内容未记录';
      log('tx', `${bytes.length} 字节 · ${detail}`);
      ui.sendInput.value = '';
      status(`已发送 ${bytes.length} 字节。`);
    } catch (error) {
      status(`发送失败：${error?.message || error}`, true);
    } finally {
      writeTask = null;
      refreshControls();
    }
  }

  function download(filename, content, type) {
    const blob = new Blob([content], {type});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function exportLog(format) {
    if (!entries.length) return;
    const date = new Date().toISOString().replace(/[:.]/g, '-');
    if (format === 'txt') {
      render();
      download(`serial-session-${date}.txt`, ui.terminal.textContent, 'text/plain;charset=utf-8');
      return;
    }
    const decoder = new TextDecoder('utf-8', {fatal: false});
    const exportItems = entries.map((item) => item.kind === 'rx'
      ? {time: item.time, direction: 'receive', hex: hex(item.value), text: decoder.decode(item.value, {stream: true})}
      : {time: item.time, direction: item.kind, message: item.value});
    download(`serial-session-${date}.json`, JSON.stringify({version: 1, note: '仅包含当前会话缓冲区；发送内容可能未记录。', droppedEntries: dropped, receivedBytes: received, sentBytes: sent, entries: exportItems}, null, 2), 'application/json;charset=utf-8');
  }

  ui.connect.addEventListener('click', connect);
  ui.disconnect.addEventListener('click', () => disconnect());
  ui.unlock.addEventListener('change', refreshControls);
  ui.send.addEventListener('click', send);
  ui.sendInput.addEventListener('keydown', (event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); send(); } });
  ui.sendMode.addEventListener('change', () => { ui.lineEnding.disabled = ui.sendMode.value === 'hex'; ui.sendInput.placeholder = ui.sendMode.value === 'hex' ? '例如：48 65 6C 6C 6F' : '例如：show version'; });
  ui.viewMode.addEventListener('change', render);
  ui.exportTxt.addEventListener('click', () => exportLog('txt'));
  ui.exportJson.addEventListener('click', () => exportLog('json'));
  ui.clearLog.addEventListener('click', () => { entries = []; retainedRxBytes = 0; dropped = 0; refreshControls(); render(); status('已清空当前显示；收发总字节数仍按本次会话累计。'); });
  if ('serial' in navigator) {
    navigator.serial.addEventListener('disconnect', (event) => { if (event.target === port || event.port === port) disconnect('设备已拔出，连接已断开。'); });
  } else {
    ui.warning.hidden = false;
    ui.warning.textContent = '当前浏览器不支持 Web Serial。请使用支持该接口的桌面浏览器，并通过 HTTPS 打开本页面；也请确认设备驱动已安装。';
    ui.connect.disabled = true;
    status('当前环境无法连接串口。', true);
  }
  if (!window.isSecureContext) {
    ui.warning.hidden = false;
    ui.warning.textContent = '串口访问需要安全上下文。请通过 HTTPS 打开本页面；普通 HTTP 页面无法使用 Web Serial。';
    ui.connect.disabled = true;
    status('当前页面不是安全上下文。', true);
  }
  refreshControls();
})();
