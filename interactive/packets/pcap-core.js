/* Local-only PCAP/PCAPNG reader. No network APIs or persistent storage. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PcapCore = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';
  const MAX_PREVIEW = 80;
  const decoder = new TextDecoder('utf-8', {fatal: false});
  const hex = (n, width = 2) => n.toString(16).padStart(width, '0');
  const u16 = (v, p, le = false) => v.getUint16(p, le);
  const u32 = (v, p, le = false) => v.getUint32(p, le);
  const has = (v, p, size) => p >= 0 && size >= 0 && p + size <= v.byteLength;
  const ip4 = (v, p) => [0, 1, 2, 3].map(i => v.getUint8(p + i)).join('.');
  const ip6 = (v, p) => Array.from({length: 8}, (_, i) => hex(u16(v, p + i * 2), 4)).join(':');
  const addr = (v, p, length) => Array.from({length}, (_, i) => hex(v.getUint8(p + i))).join(':');
  const ascii = (v, p, size) => decoder.decode(new Uint8Array(v.buffer, v.byteOffset + p, size));
  const preview = (v, p, size) => Array.from(new Uint8Array(v.buffer, v.byteOffset + p, Math.min(size, MAX_PREVIEW)), n => hex(n)).join(' ');
  const endpoint = (host, port) => host ? (port == null ? host : `${host.includes(':') ? `[${host}]` : host}:${port}`) : '—';

  function dnsName(v, start, end) {
    let p = start, jumped = false, next = start, hops = 0;
    const parts = [];
    while (has(v, p, 1) && p < end && hops++ < 24) {
      const length = v.getUint8(p);
      if (length === 0) { if (!jumped) next = p + 1; return {name: parts.join('.') || '.', next}; }
      if ((length & 0xc0) === 0xc0) {
        if (!has(v, p, 2) || p + 2 > end) return null;
        const target = start - 12 + (u16(v, p) & 0x3fff);
        if (!jumped) next = p + 2;
        if (target < start - 12 || target >= end) return null;
        p = target; jumped = true; continue;
      }
      if (length > 63 || !has(v, p + 1, length) || p + 1 + length > end) return null;
      const label = ascii(v, p + 1, length).replace(/[\x00-\x1f\x7f]/g, '?');
      parts.push(label.slice(0, 63)); p += length + 1;
      if (!jumped) next = p;
    }
    return null;
  }

  function decodePacket(v, dataStart, caplen, wirelen, timestamp, linkType, index) {
    const end = dataStart + caplen;
    const packet = {index, time: timestamp, length: wirelen, captured: caplen, linkType,
      protocol: 'OTHER', source: '—', target: '—', src: '', dst: '', srcPort: null, dstPort: null,
      info: '未识别链路层', marks: [], hex: preview(v, dataStart, caplen)};
    let p = dataStart, etherType = 0;
    if (linkType === 1 && caplen >= 14) {
      etherType = u16(v, p + 12); p += 14;
      for (let i = 0; i < 3 && [0x8100, 0x88a8, 0x9100].includes(etherType); i++) {
        if (p + 4 > end) return packet;
        etherType = u16(v, p + 2); p += 4;
      }
    } else if (linkType === 101 && caplen >= 1) {
      const version = v.getUint8(p) >> 4;
      etherType = version === 4 ? 0x0800 : version === 6 ? 0x86dd : 0;
    } else if (linkType === 113 && caplen >= 16) {
      etherType = u16(v, p + 14); p += 16;
    } else if (linkType === 276 && caplen >= 20) {
      etherType = u16(v, p); p += 20;
    } else {
      packet.info = `链路类型 ${linkType} 暂不解析`; return packet;
    }
    if (etherType === 0x0806) {
      packet.protocol = 'ARP';
      if (p + 28 <= end && u16(v, p + 2) === 0x0800 && v.getUint8(p + 4) === 6 && v.getUint8(p + 5) === 4) {
        packet.src = ip4(v, p + 14); packet.dst = ip4(v, p + 24);
        packet.source = packet.src; packet.target = packet.dst;
        packet.info = `${u16(v, p + 6) === 1 ? 'Who has' : 'Reply'} ${packet.dst} · ${addr(v, p + 8, 6)}`;
      } else packet.info = 'ARP 帧';
      return packet;
    }
    let next, payloadEnd;
    if (etherType === 0x0800 && p + 20 <= end && (v.getUint8(p) >> 4) === 4) {
      const ihl = (v.getUint8(p) & 15) * 4;
      if (ihl < 20 || p + ihl > end) return packet;
      const total = u16(v, p + 2);
      if (total < ihl) return packet;
      payloadEnd = Math.min(end, p + total);
      packet.src = ip4(v, p + 12); packet.dst = ip4(v, p + 16);
      next = v.getUint8(p + 9);
      const frag = u16(v, p + 6);
      p += ihl;
      if (frag & 0x1fff) {
        packet.protocol = 'IPv4 fragment'; packet.info = '非首片，未解析传输层';
        packet.source = packet.src; packet.target = packet.dst; return packet;
      }
    } else if (etherType === 0x86dd && p + 40 <= end && (v.getUint8(p) >> 4) === 6) {
      packet.src = ip6(v, p + 8); packet.dst = ip6(v, p + 24);
      payloadEnd = Math.min(end, p + 40 + u16(v, p + 4));
      next = v.getUint8(p + 6); p += 40;
      for (let i = 0; i < 8 && [0, 43, 44, 60, 51].includes(next); i++) {
        if (p + 2 > payloadEnd) break;
        const current = next, following = v.getUint8(p);
        const length = current === 44 ? 8 : current === 51 ? (v.getUint8(p + 1) + 2) * 4 : (v.getUint8(p + 1) + 1) * 8;
        if (length < 2 || p + length > payloadEnd) break;
        if (current === 44 && (u16(v, p + 2) & 0xfff8)) {
          packet.protocol = 'IPv6 fragment'; packet.info = '非首片，未解析传输层';
          packet.source = packet.src; packet.target = packet.dst; return packet;
        }
        p += length; next = following;
      }
    } else { packet.info = etherType ? `EtherType 0x${hex(etherType, 4)}` : '帧头不完整'; return packet; }
    packet.source = packet.src; packet.target = packet.dst;
    if (next === 6 && p + 20 <= payloadEnd) {
      packet.protocol = 'TCP';
      packet.srcPort = u16(v, p); packet.dstPort = u16(v, p + 2);
      packet.source = endpoint(packet.src, packet.srcPort); packet.target = endpoint(packet.dst, packet.dstPort);
      packet.seq = u32(v, p + 4); packet.ack = u32(v, p + 8);
      const header = (v.getUint8(p + 12) >> 4) * 4;
      if (header < 20 || p + header > payloadEnd) { packet.info = 'TCP 头不完整'; return packet; }
      const flags = v.getUint8(p + 13);
      packet.flags = flags;
      packet.payloadLength = Math.max(0, payloadEnd - p - header);
      packet.info = `${flags & 2 ? 'SYN ' : ''}${flags & 16 ? 'ACK ' : ''}${flags & 1 ? 'FIN ' : ''}${flags & 4 ? 'RST ' : ''}seq=${packet.seq} ack=${packet.ack} len=${packet.payloadLength}`.trim();
      if (flags & 4) packet.marks.push('RST');
      const payload = p + header;
      if (packet.payloadLength > 0) {
        const size = Math.min(packet.payloadLength, 240);
        const first = ascii(v, payload, size).split('\r\n')[0].split('\n')[0];
        if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) \S+ HTTP\/1\.[01]$/.test(first)) {
          packet.protocol = 'HTTP';
          const pieces = first.split(' ');
          packet.info = `${pieces[0]} ${pieces[1].split('?')[0].slice(0, 100)} HTTP/1.x`;
        } else if (/^HTTP\/1\.[01] [1-5]\d\d/.test(first)) {
          packet.protocol = 'HTTP'; packet.info = first.slice(0, 120);
        } else if (v.getUint8(payload) === 0x16 && size >= 3 && v.getUint8(payload + 1) === 3) {
          packet.protocol = 'TLS'; packet.info = 'TLS 握手记录（加密内容不可读）';
        } else if ([443, 8443].includes(packet.srcPort) || [443, 8443].includes(packet.dstPort)) {
          packet.protocol = 'TLS'; packet.info = '加密连接数据（内容不可读）';
        }
      }
      return packet;
    }
    if (next === 17 && p + 8 <= payloadEnd) {
      packet.protocol = 'UDP'; packet.srcPort = u16(v, p); packet.dstPort = u16(v, p + 2);
      packet.source = endpoint(packet.src, packet.srcPort); packet.target = endpoint(packet.dst, packet.dstPort);
      packet.payloadLength = Math.max(0, Math.min(u16(v, p + 4), payloadEnd - p) - 8);
      packet.info = `UDP payload=${packet.payloadLength}`;
      const dnsStart = p + 8, dnsEnd = dnsStart + packet.payloadLength;
      if ((packet.srcPort === 53 || packet.dstPort === 53) && packet.payloadLength >= 12) {
        const flags = u16(v, dnsStart + 2), response = Boolean(flags & 0x8000), id = u16(v, dnsStart);
        const question = u16(v, dnsStart + 4) ? dnsName(v, dnsStart + 12, dnsEnd) : null;
        packet.protocol = 'DNS'; packet.dns = {id, response, name: question?.name || '', code: flags & 15};
        packet.info = `${response ? '响应' : '查询'} ${question?.name || '(名称不可读)'}${response ? ` · RCODE ${flags & 15}` : ''}`.slice(0, 170);
        if (response && (flags & 15)) packet.marks.push('DNS 错误');
      }
      return packet;
    }
    if ([1, 58].includes(next) && p + 2 <= payloadEnd) {
      packet.protocol = next === 1 ? 'ICMP' : 'ICMPv6';
      packet.info = `type=${v.getUint8(p)} code=${v.getUint8(p + 1)}`;
      return packet;
    }
    packet.protocol = 'IP'; packet.info = `IP 协议号 ${next}`;
    return packet;
  }

  function parseCapture(buffer, options = {}) {
    if (!(buffer instanceof ArrayBuffer)) throw new Error('请选择有效的抓包文件。');
    const view = new DataView(buffer), bytes = new Uint8Array(buffer);
    if (view.byteLength < 24) throw new Error('文件过短，无法识别抓包格式。');
    const limit = Math.max(1, Math.min(Number(options.maxPackets) || 75000, 150000));
    const packets = [], warnings = [], interfaces = [];
    let position = 0, format = '', le = true, timestampScale = 1e6, linkType = 1, truncated = false, skippedLinks = 0;
    const magic = Array.from(bytes.subarray(0, 4), b => hex(b)).join('');
    if (magic === 'd4c3b2a1' || magic === 'a1b2c3d4' || magic === '4d3cb2a1' || magic === 'a1b23c4d') {
      format = 'PCAP'; le = magic === 'd4c3b2a1' || magic === '4d3cb2a1';
      timestampScale = magic === '4d3cb2a1' || magic === 'a1b23c4d' ? 1e9 : 1e6;
      linkType = u32(view, 20, le) & 0xffff; position = 24;
      while (position + 16 <= view.byteLength && packets.length < limit) {
        const sec = u32(view, position, le), fraction = u32(view, position + 4, le);
        const cap = u32(view, position + 8, le), wire = u32(view, position + 12, le);
        position += 16;
        if (cap > view.byteLength - position) { truncated = true; break; }
        packets.push(decodePacket(view, position, cap, wire, sec * 1000 + fraction * 1000 / timestampScale, linkType, packets.length + 1));
        position += cap;
      }
    } else if (magic === '0a0d0d0a') {
      format = 'PCAPNG'; let sectionInterfaces = [];
      while (position + 12 <= view.byteLength && packets.length < limit) {
        const isSection = bytes[position] === 10 && bytes[position + 1] === 13 && bytes[position + 2] === 13 && bytes[position + 3] === 10;
        if (isSection) {
          const bom = Array.from(bytes.subarray(position + 8, position + 12), b => hex(b)).join('');
          if (bom !== '4d3c2b1a' && bom !== '1a2b3c4d') throw new Error('PCAPNG 字节序标记无效。');
          le = bom === '4d3c2b1a'; sectionInterfaces = [];
        }
        const type = u32(view, position, le), size = u32(view, position + 4, le);
        if (size < 12 || size % 4 !== 0 || position + size > view.byteLength || u32(view, position + size - 4, le) !== size) { truncated = true; break; }
        if (type === 1 && size >= 20) {
          const iface = {linkType: u16(view, position + 8, le), tickRate: 1e6, offset: 0};
          let opt = position + 16, optEnd = position + size - 4;
          while (opt + 4 <= optEnd) {
            const code = u16(view, opt, le), length = u16(view, opt + 2, le); opt += 4;
            if (!code || opt + length > optEnd) break;
            if (code === 9 && length >= 1) {
              const resolution = view.getUint8(opt);
              iface.tickRate = resolution & 128 ? 2 ** (resolution & 127) : 10 ** resolution;
            }
            if (code === 14 && length === 8) {
              const raw = view.getBigInt64(opt, le);
              iface.offset = Number(raw);
            }
            opt += (length + 3) & ~3;
          }
          sectionInterfaces.push(iface); interfaces.push(iface.linkType);
        } else if (type === 6 && size >= 32) {
          const iface = sectionInterfaces[u32(view, position + 8, le)];
          const cap = u32(view, position + 20, le), wire = u32(view, position + 24, le);
          const data = position + 28;
          if (iface && cap <= position + size - 4 - data) {
            const ticks = (BigInt(u32(view, position + 12, le)) << 32n) | BigInt(u32(view, position + 16, le));
            const time = Number(ticks) * 1000 / iface.tickRate + iface.offset * 1000;
            packets.push(decodePacket(view, data, cap, wire, time, iface.linkType, packets.length + 1));
          }
        } else if (type === 3 && size >= 16 && sectionInterfaces[0]) {
          const wire = u32(view, position + 8, le), cap = Math.min(wire, size - 16);
          packets.push(decodePacket(view, position + 12, cap, wire, null, sectionInterfaces[0].linkType, packets.length + 1));
        }
        position += size;
      }
    } else throw new Error('仅支持 PCAP 和 PCAPNG 文件。');
    if (truncated) warnings.push('文件尾部不完整或包含无效块，已展示此前可读取的包。');
    if (packets.length >= limit && position < view.byteLength) warnings.push(`已达到 ${limit.toLocaleString()} 包上限，仅分析文件前半部分。`);
    if (position < view.byteLength && !truncated && packets.length < limit) warnings.push('文件尾部存在未解析字节。');
    skippedLinks = packets.filter(p => p.protocol === 'OTHER' && /链路类型/.test(p.info)).length;
    if (skippedLinks) warnings.push(`${skippedLinks} 个包使用暂不支持的链路类型，保留在列表中。`);
    const counts = {}, conversations = new Map(), findings = [], seqSeen = new Set(), queries = new Map();
    let bytesTotal = 0;
    for (const p of packets) {
      counts[p.protocol] = (counts[p.protocol] || 0) + 1; bytesTotal += p.length;
      if (p.src && p.dst) {
        const pair = [p.source, p.target].sort(); const key = pair.join(' ↔ ');
        const session = conversations.get(key) || {a: pair[0], b: pair[1], packets: 0, bytes: 0, protocols: new Set()};
        session.packets++; session.bytes += p.length; session.protocols.add(p.protocol); conversations.set(key, session);
      }
      if (p.flags != null && (p.flags & 2) && !(p.flags & 16)) {
        const key = `${p.source}>${p.target}:SYN:${p.seq}`;
        if (seqSeen.has(key)) p.marks.push('SYN 重试候选'); else seqSeen.add(key);
      } else if (p.seq != null && p.payloadLength > 0) {
        const key = `${p.source}>${p.target}:${p.seq}:${p.payloadLength}`;
        if (seqSeen.has(key)) p.marks.push('重传候选'); else seqSeen.add(key);
      }
      if (p.dns) {
        const key = `${p.dns.response ? p.target : p.source}>${p.dns.response ? p.source : p.target}:${p.dns.id}`;
        if (p.dns.response) queries.delete(key); else queries.set(key, p);
      }
      for (const mark of p.marks) if (findings.length < 100) findings.push({index: p.index, mark, detail: `${p.source} → ${p.target} · ${p.info}`});
    }
    for (const p of queries.values()) {
      p.marks.push('抓包中未见 DNS 响应');
      if (findings.length < 100) findings.push({index: p.index, mark: '抓包中未见 DNS 响应', detail: `${p.source} → ${p.target} · ${p.info}`});
    }
    const sessionCount = conversations.size;
    const sessions = [...conversations.values()].map(s => ({...s, protocols: [...s.protocols].join(' / ')})).sort((a, b) => b.bytes - a.bytes).slice(0, 100);
    return {format, packets, counts, sessions, sessionCount, findings, warnings, bytesTotal, interfaces: format === 'PCAP' ? [linkType] : interfaces};
  }
  return {parseCapture};
});
