export const DEFAULTS = Object.freeze({
  scenario: 'site', intervalHours: 12, offsiteDelayHours: 2, retentionDays: 7,
  failureHour: 157, missedLatest: false, corruptLatest: false,
  dataGB: 500, restoreMBps: 120, prepareMinutes: 45, verifyMinutes: 30,
  rpoTargetHours: 24, rtoTargetHours: 3
});

const number = (value, fallback, min, max) => {
  const result = Number(value);
  return Number.isFinite(result) && result >= min && result <= max ? result : fallback;
};

export function normalize(input = {}) {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return {
    scenario: ['host', 'site'].includes(value.scenario) ? value.scenario : DEFAULTS.scenario,
    intervalHours: number(value.intervalHours, DEFAULTS.intervalHours, 1, 168),
    offsiteDelayHours: number(value.offsiteDelayHours, DEFAULTS.offsiteDelayHours, 0, 72),
    retentionDays: number(value.retentionDays, DEFAULTS.retentionDays, 1, 30),
    failureHour: number(value.failureHour, DEFAULTS.failureHour, 1, 168),
    missedLatest: value.missedLatest === true,
    corruptLatest: value.corruptLatest === true,
    dataGB: number(value.dataGB, DEFAULTS.dataGB, 1, 100000),
    restoreMBps: number(value.restoreMBps, DEFAULTS.restoreMBps, 1, 5000),
    prepareMinutes: number(value.prepareMinutes, DEFAULTS.prepareMinutes, 0, 1440),
    verifyMinutes: number(value.verifyMinutes, DEFAULTS.verifyMinutes, 0, 1440),
    rpoTargetHours: number(value.rpoTargetHours, DEFAULTS.rpoTargetHours, 0, 168),
    rtoTargetHours: number(value.rtoTargetHours, DEFAULTS.rtoTargetHours, 0, 240)
  };
}

export function derive(raw) {
  const config = normalize(raw);
  const { failureHour, intervalHours, retentionDays, offsiteDelayHours, scenario } = config;
  const cutoff = failureHour - retentionDays * 24;
  const availableBy = scenario === 'site' ? failureHour - offsiteDelayHours : failureHour;
  const snapshots = [];
  for (let at = 0; at < failureHour; at += intervalHours) {
    snapshots.push({ at, status: at < cutoff ? 'expired' : at > availableBy ? 'copying' : 'candidate' });
  }
  const candidates = snapshots.filter(item => item.status === 'candidate').reverse();
  let cursor = 0;
  if (config.missedLatest && candidates[cursor]) candidates[cursor++].status = 'missed';
  if (config.corruptLatest && candidates[cursor]) candidates[cursor++].status = 'corrupt';
  const selected = candidates[cursor] || null;
  if (selected) selected.status = 'selected';

  const dataLossHours = selected ? failureHour - selected.at : null;
  const transferHours = config.dataGB * 1000 / config.restoreMBps / 3600;
  const recoveryHours = selected ? config.prepareMinutes / 60 + transferHours + config.verifyMinutes / 60 : null;
  return {
    config, snapshots, selected, dataLossHours, transferHours, recoveryHours,
    rpoPass: dataLossHours !== null && dataLossHours <= config.rpoTargetHours,
    rtoPass: recoveryHours !== null && recoveryHours <= config.rtoTargetHours
  };
}
