import { parseIp, parseCidr, contains, overlaps } from '../network-core.20261001.js';

export function parsePorts(value) {
  const text = String(value || 'any').trim().toLowerCase();
  if (text === 'any' || text === '*') return { start: 0, end: 65535, text: 'any' };
  const match = /^(\d{1,5})(?:\s*-\s*(\d{1,5}))?$/.exec(text);
  if (!match) throw Error('端口填写 any、80 或 8000-8080');
  const start = Number(match[1]), end = Number(match[2] ?? match[1]);
  if (start < 0 || end > 65535 || start > end) throw Error('端口须在 0—65535 且起点不大于终点');
  return { start, end, text: start === end ? String(start) : `${start}-${end}` };
}

export function parseRule(rule) {
  const name = String(rule.name || '').trim();
  if (!name || name.length > 60) throw Error('规则名称须为 1—60 字');
  if (!['allow', 'deny'].includes(rule.action)) throw Error('规则动作须为允许或拒绝');
  if (!['any', 'tcp', 'udp', 'icmp'].includes(rule.protocol)) throw Error('协议无效');
  const source = parseCidr(rule.source);
  const destination = parseCidr(rule.destination);
  const port = parsePorts(rule.port);
  if ((rule.protocol === 'icmp' || rule.protocol === 'any') && port.text !== 'any') throw Error('任意协议或 ICMP 的端口须为 any');
  return { ...rule, name, source, destination, port, enabled: rule.enabled !== false };
}

const protocolCovers = (a, b) => a === 'any' || a === b;
const protocolOverlaps = (a, b) => a === 'any' || b === 'any' || a === b;
const portCovers = (a, b) => a.start <= b.start && a.end >= b.end;
const portOverlaps = (a, b) => a.start <= b.end && b.start <= a.end;

export function ruleCovers(earlier, later) {
  return contains(earlier.source, later.source) && contains(earlier.destination, later.destination)
    && protocolCovers(earlier.protocol, later.protocol)
    && (earlier.protocol === 'any' || later.protocol === 'icmp' || portCovers(earlier.port, later.port));
}

export function ruleOverlaps(a, b) {
  return overlaps(a.source, b.source) && overlaps(a.destination, b.destination)
    && protocolOverlaps(a.protocol, b.protocol)
    && (a.protocol === 'any' || b.protocol === 'any' || a.protocol === 'icmp' || b.protocol === 'icmp' || portOverlaps(a.port, b.port));
}

export function analyzeRules(rawRules) {
  if (!Array.isArray(rawRules) || rawRules.length > 200) throw Error('最多 200 条规则');
  const rules = rawRules.map(parseRule);
  const findings = rules.map((rule, index) => {
    if (!rule.enabled) return { kind: 'disabled', earlier: null, overlaps: [] };
    const earlier = rules.slice(0, index).map((other, i) => ({ other, i })).filter(item => item.other.enabled);
    const shadow = earlier.find(({ other }) => ruleCovers(other, rule));
    if (shadow) return { kind: shadow.other.action === rule.action ? 'redundant' : 'conflict', earlier: shadow.i, overlaps: [] };
    const partial = earlier.filter(({ other }) => ruleOverlaps(other, rule)).map(item => item.i);
    return { kind: partial.length ? 'partial' : 'clear', earlier: null, overlaps: partial };
  });
  return { rules, findings };
}

export function simulatePacket(rawRules, packet) {
  const source = parseIp(packet.source), destination = parseIp(packet.destination);
  if (!['tcp', 'udp', 'icmp'].includes(packet.protocol)) throw Error('测试协议无效');
  const port = packet.protocol === 'icmp' ? null : Number(packet.port);
  if (packet.protocol !== 'icmp' && (!Number.isInteger(port) || port < 0 || port > 65535 || String(packet.port).trim() === '')) throw Error('测试端口须在 0—65535');
  const rules = rawRules.map(parseRule);
  const matches = [];
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (!rule.enabled) continue;
    if (source < rule.source.start || source > rule.source.end || destination < rule.destination.start || destination > rule.destination.end) continue;
    if (rule.protocol !== 'any' && rule.protocol !== packet.protocol) continue;
    if (packet.protocol !== 'icmp' && rule.protocol !== 'any' && (port < rule.port.start || port > rule.port.end)) continue;
    matches.push(i);
  }
  return { first: matches[0] ?? null, matches, action: matches.length ? rules[matches[0]].action : 'deny' };
}
