export const LEVELS = Object.freeze({
  '0': { name: 'RAID 0', minimum: 2, rule: '条带化 · 无冗余' },
  '1': { name: 'RAID 1', minimum: 2, rule: '全盘镜像 · 多盘镜像依赖设备支持' },
  '5': { name: 'RAID 5', minimum: 3, rule: '单校验 · 任意 1 块成员盘可失效' },
  '6': { name: 'RAID 6', minimum: 4, rule: '双校验 · 任意 2 块成员盘可失效' },
  '10': { name: 'RAID 10', minimum: 4, rule: '镜像后条带化 · 每对最多失效 1 块' }
});

export const DEFAULTS = Object.freeze({
  level: '6', disks: 8, spares: 0, diskTB: 8, reserve: 20,
  rebuildMBps: 100, failed: [], replacements: []
});

const integer = (value, fallback, min, max) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
};

const decimal = (value, fallback, min, max) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
};

export function normalize(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const disks = integer(source.disks, DEFAULTS.disks, 2, 48);
  const spares = integer(source.spares, DEFAULTS.spares, 0, Math.min(8, disks - 2));
  const active = disks - spares;
  const level = Object.hasOwn(LEVELS, String(source.level)) ? String(source.level) : DEFAULTS.level;
  const failed = [...new Set(Array.isArray(source.failed) ? source.failed.filter(n => Number.isInteger(n) && n >= 0 && n < active) : [])].sort((a, b) => a - b);
  const usedMembers = new Set();
  const usedSpares = new Set();
  const replacements = [];
  let rebuildingSeen = false;
  for (const item of Array.isArray(source.replacements) ? source.replacements : []) {
    if (!item || !failed.includes(item.member) || !Number.isInteger(item.spare) || item.spare < 0 || item.spare >= spares
      || !['rebuilding', 'complete'].includes(item.status) || usedMembers.has(item.member) || usedSpares.has(item.spare)
      || (item.status === 'rebuilding' && rebuildingSeen)) continue;
    usedMembers.add(item.member);
    usedSpares.add(item.spare);
    if (item.status === 'rebuilding') rebuildingSeen = true;
    replacements.push({ member: item.member, spare: item.spare, status: item.status });
  }
  // A spare is a replacement, not extra parity. Start only one simulated rebuild at a time.
  const activeFailures = failed.filter(n => !replacements.some(item => item.member === n && item.status === 'complete'));
  if (capacityTB(level, active, 1) !== null && level !== '0' && spares > usedSpares.size && !replacements.some(item => item.status === 'rebuilding')
    && !isUnavailable(level, active, activeFailures)) {
    const member = activeFailures.find(n => !usedMembers.has(n));
    const spare = Array.from({ length: spares }, (_, n) => n).find(n => !usedSpares.has(n));
    if (member !== undefined && spare !== undefined) replacements.push({ member, spare, status: 'rebuilding' });
  }
  return {
    level,
    disks,
    spares,
    diskTB: decimal(source.diskTB, DEFAULTS.diskTB, 0.25, 100),
    reserve: integer(source.reserve, DEFAULTS.reserve, 0, 50),
    rebuildMBps: integer(source.rebuildMBps, DEFAULTS.rebuildMBps, 25, 1000),
    failed,
    replacements
  };
}

function isUnavailable(level, active, failed) {
  if (level === '0') return failed.length > 0;
  if (level === '1') return failed.length >= active;
  if (level === '5') return failed.length > 1;
  if (level === '6') return failed.length > 2;
  return Array.from({ length: active / 2 }, (_, pair) => failed.includes(pair * 2) && failed.includes(pair * 2 + 1)).some(Boolean);
}

export function toggleFailure(raw, member) {
  const config = normalize(raw);
  if (!Number.isInteger(member) || member < 0 || member >= config.disks - config.spares) return config;
  const failed = config.failed.includes(member) ? config.failed.filter(n => n !== member) : [...config.failed, member];
  return normalize({ ...config, failed, replacements: config.replacements.filter(item => item.member !== member) });
}

export function completeRebuild(raw) {
  const model = derive(raw);
  if (model.state === 'unavailable' || model.state === 'invalid' || !model.rebuilding) return model.config;
  return normalize({ ...model.config, replacements: model.config.replacements.map(item =>
    item.member === model.rebuilding.member && item.spare === model.rebuilding.spare
      ? { ...item, status: 'complete' } : item) });
}

export function capacityTB(level, active, diskTB) {
  if (!Object.hasOwn(LEVELS, level) || active < LEVELS[level].minimum || (level === '10' && active % 2)) return null;
  const units = { '0': active, '1': 1, '5': active - 1, '6': active - 2, '10': active / 2 }[level];
  return units * diskTB;
}

export function derive(raw) {
  const config = normalize(raw);
  const active = config.disks - config.spares;
  const usableTB = capacityTB(config.level, active, config.diskTB);
  const rawTB = config.disks * config.diskTB;
  const spareTB = config.spares * config.diskTB;
  const overheadTB = usableTB === null ? null : active * config.diskTB - usableTB;
  const reserveTB = usableTB === null ? null : usableTB * config.reserve / 100;
  const plannedTB = usableTB === null ? null : usableTB - reserveTB;
  const failed = config.failed;
  const activeFailures = failed.filter(n => !config.replacements.some(item => item.member === n && item.status === 'complete'));
  const rebuilding = config.replacements.find(item => item.status === 'rebuilding') || null;
  const completed = config.replacements.filter(item => item.status === 'complete');
  let state = 'invalid';
  let reason = active < LEVELS[config.level].minimum
    ? `${LEVELS[config.level].name} 至少需要 ${LEVELS[config.level].minimum} 块成员盘。`
    : 'RAID 10 的成员盘数必须为偶数，请调整总盘数或热备数。';
  if (usableTB !== null) {
    const unavailable = isUnavailable(config.level, active, activeFailures);
    state = unavailable ? 'unavailable' : activeFailures.length ? rebuilding ? 'rebuilding' : 'degraded' : 'healthy';
    reason = unavailable
      ? rebuilding ? `第 ${rebuilding.spare + 1} 块热备正在接管磁盘 ${rebuilding.member + 1}，但重建尚未完成；又有成员盘故障，模拟阵列不可用。`
        : '成员盘故障超过此 RAID 级别的容忍范围，模拟阵列不可用。'
      : rebuilding ? `热备 ${rebuilding.spare + 1} 已接管磁盘 ${rebuilding.member + 1}，正在模拟重建；完成前仍按故障成员盘计算，不能把热备当作额外校验。`
        : activeFailures.length ? `${activeFailures.length} 块成员盘故障，冗余降低；没有可用热备正在重建。`
          : completed.length ? `热备重建已模拟完成，冗余恢复；原故障盘仍需更换或处理。`
            : config.level === '0' ? '正常运行，但 RAID 0 没有磁盘冗余。' : '正常运行；请点击成员盘模拟故障路径。';
  }
  const rebuildHours = config.diskTB * 1_000_000 / (config.rebuildMBps * 3600);
  return { config, active, usableTB, rawTB, spareTB, overheadTB, reserveTB, plannedTB, state, reason, rebuildHours, activeFailures, rebuilding, completed };
}
