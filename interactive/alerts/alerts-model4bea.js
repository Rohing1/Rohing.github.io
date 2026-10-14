export const DEFAULTS = Object.freeze({
  name: 'CPU 使用率过高', comparator: '>', threshold: 80,
  intervalMinutes: 1, forMinutes: 3,
  samples: '42, 55, 79, 84, 88, 91, 94, 86, 70, 72, 83, 87, 90, 69'
});

export const PRESETS = Object.freeze({
  cpu: DEFAULTS,
  disk: { name: '剩余空间过低', comparator: '<', threshold: 15, intervalMinutes: 1, forMinutes: 2, samples: '29, 26, 21, 18, 14, 12, 10, 9, 16, 18, 12, 11' },
  errors: { name: '5xx 比例升高', comparator: '>=', threshold: 5, intervalMinutes: 2, forMinutes: 4, samples: '0.5, 1, 4, 6, 9, 12, 10, 3, 2, 6, 8, 2' }
});

const numeric = (value, fallback, min, max) => {
  const result = Number(value);
  return Number.isFinite(result) && result >= min && result <= max ? result : fallback;
};

export function normalize(raw = {}) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    name: typeof value.name === 'string' && value.name.trim() && value.name.length <= 60 ? value.name.trim() : DEFAULTS.name,
    comparator: ['>', '>=', '<', '<='].includes(value.comparator) ? value.comparator : DEFAULTS.comparator,
    threshold: numeric(value.threshold, DEFAULTS.threshold, -1e9, 1e9),
    intervalMinutes: numeric(value.intervalMinutes, DEFAULTS.intervalMinutes, 1, 60),
    forMinutes: numeric(value.forMinutes, DEFAULTS.forMinutes, 0, 240),
    samples: typeof value.samples === 'string' && value.samples.length <= 5000 ? value.samples : DEFAULTS.samples
  };
}

export function parseSamples(text) {
  const tokens = text.trim().split(/[\s,;]+/).filter(Boolean);
  if (tokens.length < 2 || tokens.length > 300) throw Error('请输入 2—300 个样本值，以逗号、空格或换行分隔。');
  return tokens.map((token, index) => {
    if (/^(NA|N\/A|-)$/i.test(token)) return null;
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(token)) throw Error(`第 ${index + 1} 个样本不是数字或 NA。`);
    const value = Number(token);
    if (!Number.isFinite(value) || Math.abs(value) > 1e9) throw Error(`第 ${index + 1} 个样本超出范围。`);
    return value;
  });
}

export function evaluate(raw) {
  const config = normalize(raw);
  const samples = parseSamples(config.samples);
  const compare = {
    '>': value => value > config.threshold, '>=': value => value >= config.threshold,
    '<': value => value < config.threshold, '<=': value => value <= config.threshold
  }[config.comparator];
  let since = null, firing = false, episodes = 0, firstFiring = null, firingSamples = 0;
  const points = samples.map((value, index) => {
    const minute = index * config.intervalMinutes;
    const matched = value !== null && compare(value);
    const wasFiring = firing;
    let state = value === null ? 'nodata' : 'normal';
    if (matched) {
      if (since === null) since = minute;
      firing = minute - since >= config.forMinutes;
      state = firing ? 'firing' : 'pending';
    } else { since = null; firing = false; }
    let event = '';
    if (firing && !wasFiring) {
      event = '触发'; episodes++;
      if (firstFiring === null) firstFiring = minute;
    } else if (!firing && wasFiring) event = '恢复';
    if (firing) firingSamples++;
    return { index, minute, value, state, event };
  });
  return { config, points, episodes, firstFiring, firingSamples, noData: points.filter(point => point.state === 'nodata').length };
}
