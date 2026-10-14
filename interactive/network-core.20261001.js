const MAX_IPV4 = 0xffffffff;

export function parseIp(text) {
  const parts = String(text).trim().split('.');
  if (parts.length !== 4 || parts.some(part => !/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255)) throw Error('IPv4 地址格式无效');
  return parts.reduce((value, part) => value * 256 + Number(part), 0);
}

export function formatIp(value) {
  if (!Number.isInteger(value) || value < 0 || value > MAX_IPV4) throw Error('IPv4 数值无效');
  return [24, 16, 8, 0].map(shift => Math.floor(value / 2 ** shift) % 256).join('.');
}

export function parseCidr(text) {
  const match = /^([^/]+)\/(\d{1,2})$/.exec(String(text).trim());
  if (!match) throw Error('请输入 IPv4/CIDR，例如 10.0.0.0/24');
  const ip = parseIp(match[1]);
  const prefix = Number(match[2]);
  if (prefix > 32) throw Error('前缀长度须在 0—32 之间');
  const size = 2 ** (32 - prefix);
  const start = Math.floor(ip / size) * size;
  const end = start + size - 1;
  return { start, end, prefix, size, cidr: `${formatIp(start)}/${prefix}`, normalized: ip !== start };
}

export const contains = (outer, inner) => outer.start <= inner.start && outer.end >= inner.end;
export const overlaps = (left, right) => left.start <= right.end && right.start <= left.end;
export const usableHosts = block => block.prefix >= 31 ? block.size : block.size - 2;

export function analyzePool(parentText, items) {
  const parent = parseCidr(parentText);
  if (!Array.isArray(items) || items.length > 300) throw Error('子网最多 300 条');
  const entries = items.map((item, index) => {
    try {
      const block = parseCidr(item.cidr);
      const used = Number(item.used);
      if (!Number.isInteger(used) || used < 0) throw Error('已用地址数须为非负整数');
      const inParent = contains(parent, block);
      const capacity = usableHosts(block);
      return { ...item, index, block, used, capacity, inParent, overUsed: used > capacity, errors: [], conflicts: [] };
    } catch (error) {
      return { ...item, index, block: null, used: item.used, capacity: null, inParent: false, overUsed: false, errors: [error.message], conflicts: [] };
    }
  });
  for (const entry of entries) {
    if (entry.block && !entry.inParent) entry.errors.push('超出规划父网段');
    if (entry.overUsed) entry.errors.push('已用数超过传统可用主机数');
  }
  for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
    if (entries[i].block && entries[j].block && overlaps(entries[i].block, entries[j].block)) {
      entries[i].conflicts.push(j);
      entries[j].conflicts.push(i);
    }
  }
  const occupied = entries.filter(entry => entry.block && entry.inParent).map(entry => entry.block).sort((a, b) => a.start - b.start);
  const gaps = [];
  let cursor = parent.start;
  for (const block of occupied) {
    if (block.start > cursor) gaps.push({ start: cursor, end: block.start - 1 });
    cursor = Math.max(cursor, block.end + 1);
  }
  if (cursor <= parent.end) gaps.push({ start: cursor, end: parent.end });
  return { parent, entries, gaps, free: gaps.reduce((sum, gap) => sum + gap.end - gap.start + 1, 0), conflictPairs: entries.reduce((sum, entry) => sum + entry.conflicts.length, 0) / 2 };
}

export function suggestSubnet(analysis, prefix) {
  const length = Number(prefix);
  if (!Number.isInteger(length) || length < analysis.parent.prefix || length > 32) throw Error(`目标前缀须在 /${analysis.parent.prefix}—/32 之间`);
  const size = 2 ** (32 - length);
  for (const gap of analysis.gaps) {
    const aligned = Math.ceil(gap.start / size) * size;
    if (aligned + size - 1 <= gap.end) return `${formatIp(aligned)}/${length}`;
  }
  return null;
}
