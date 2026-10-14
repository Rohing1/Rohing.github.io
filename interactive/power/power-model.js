export const DEFAULT = Object.freeze({
  groups: [
    { id: 'g1', name: '计算服务器', count: 20, watts: 450 },
    { id: 'g2', name: '存储设备', count: 4, watts: 900 },
    { id: 'g3', name: '网络与安全设备', count: 12, watts: 150 },
  ],
  growthPct: 25,
  protectedPct: 100,
  upsAuxKW: 0,
  upsTargetPct: 80,
  upsPowerFactor: 0.9,
  upsEfficiencyPct: 94,
  upsTopology: 'n1',
  upsModuleKVA: 20,
  runtimeMin: 15,
  batteryUsablePct: 80,
  batteryAgingPct: 80,
  batteryInverterPct: 90,
  batteryInstalledKWh: 0,
  roomHeatKW: 2,
  coolingReservePct: 15,
  coolingCOP: 3,
  coolingUnitKW: 12,
  coolingRedundancy: 'n1',
  coolingOnUPSPct: 0,
  directAuxKW: 3,
  distributionLossPct: 3,
  voltage: 400,
  utilityPowerFactor: 0.9,
  utilityTargetPct: 80,
  utilityMode: 'dual',
  utilityInstalledKVA: 0,
  generatorRatedKVA: 0,
  generatorPowerFactor: 0.8,
  generatorTransferSec: 0,
  averageITPct: 55,
  electricityPrice: 0.8,
});

const SPEC = {
  growthPct: [0, 300], protectedPct: [0, 100], upsAuxKW: [0, 100000],
  upsTargetPct: [30, 100], upsPowerFactor: [0.5, 1], upsEfficiencyPct: [50, 100],
  upsModuleKVA: [1, 10000], runtimeMin: [1, 480], batteryUsablePct: [10, 100],
  batteryAgingPct: [10, 100], batteryInverterPct: [50, 100], batteryInstalledKWh: [0, 1000000],
  roomHeatKW: [0, 100000], coolingReservePct: [0, 100], coolingCOP: [1, 10],
  coolingUnitKW: [0.1, 100000], coolingOnUPSPct: [0, 100], directAuxKW: [0, 100000],
  distributionLossPct: [0, 30], voltage: [200, 1000], utilityPowerFactor: [0.5, 1],
  utilityTargetPct: [30, 100], utilityInstalledKVA: [0, 1000000],
  generatorRatedKVA: [0, 1000000], generatorPowerFactor: [0.5, 1], generatorTransferSec: [0, 3600],
  averageITPct: [0, 100], electricityPrice: [0, 100],
};

function numeric(value, fallback, min, max) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

export function normalize(input = {}) {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const result = {};
  for (const [key, [min, max]] of Object.entries(SPEC)) {
    result[key] = numeric(value[key], DEFAULT[key], min, max);
  }
  result.upsTopology = ['n', 'n1', '2n'].includes(value.upsTopology) ? value.upsTopology : DEFAULT.upsTopology;
  result.coolingRedundancy = ['n', 'n1'].includes(value.coolingRedundancy) ? value.coolingRedundancy : DEFAULT.coolingRedundancy;
  result.utilityMode = ['single', 'dual'].includes(value.utilityMode) ? value.utilityMode : DEFAULT.utilityMode;
  result.groups = (Array.isArray(value.groups) ? value.groups : DEFAULT.groups).slice(0, 100).map((raw, index) => ({
    id: typeof raw?.id === 'string' && /^[a-zA-Z0-9-]{1,50}$/.test(raw.id) ? raw.id : `g${index + 1}`,
    name: String(raw?.name ?? `设备组 ${index + 1}`).trim().slice(0, 60) || `设备组 ${index + 1}`,
    count: Math.round(numeric(raw?.count, 0, 0, 100000)),
    watts: numeric(raw?.watts, 0, 0, 1000000),
  }));
  if (!result.groups.length) result.groups = [{ id: 'g1', name: 'IT 设备', count: 0, watts: 0 }];
  const used = new Set();
  let suffix = 1;
  for (const group of result.groups) {
    if (used.has(group.id)) { while (used.has(`g${suffix}`)) suffix++; group.id = `g${suffix++}`; }
    used.add(group.id);
  }
  return result;
}

export function calculate(input) {
  const s = normalize(input);
  const installedITKW = s.groups.reduce((sum, group) => sum + group.count * group.watts / 1000, 0);
  const designITKW = installedITKW * (1 + s.growthPct / 100);
  const coolingHeatKW = designITKW + s.roomHeatKW;
  const coolingDesignKW = coolingHeatKW * (1 + s.coolingReservePct / 100);
  const coolingElectricalKW = coolingDesignKW / s.coolingCOP;
  const coolingWorkingUnits = Math.ceil(coolingDesignKW / s.coolingUnitKW);
  const coolingInstalledUnits = coolingWorkingUnits + (s.coolingRedundancy === 'n1' && coolingWorkingUnits ? 1 : 0);
  const coolingSurvivorKW = Math.max(0, coolingInstalledUnits - 1) * s.coolingUnitKW;

  const protectedITKW = designITKW * s.protectedPct / 100;
  const protectedCoolingKW = coolingElectricalKW * s.coolingOnUPSPct / 100;
  const upsOutputKW = protectedITKW + protectedCoolingKW + s.upsAuxKW;
  const upsMinimumKW = upsOutputKW / (s.upsTargetPct / 100);
  const upsPerPathKVA = upsMinimumKW / s.upsPowerFactor;
  const upsWorkingModules = upsOutputKW > 0 ? Math.ceil(upsPerPathKVA / s.upsModuleKVA) : 0;
  const upsInstalledModules = upsWorkingModules + (s.upsTopology === 'n1' && upsWorkingModules ? 1 : 0);
  const upsInstalledKVA = s.upsTopology === '2n' ? 2 * upsPerPathKVA
    : s.upsTopology === 'n1' ? upsInstalledModules * s.upsModuleKVA : upsPerPathKVA;
  const upsInputKW = upsOutputKW / (s.upsEfficiencyPct / 100);
  const upsLossKW = upsInputKW - upsOutputKW;

  const batteryRequiredPerPathKWh = upsOutputKW * s.runtimeMin / 60 /
    ((s.batteryUsablePct / 100) * (s.batteryAgingPct / 100) * (s.batteryInverterPct / 100));
  const batteryInstalledTotalKWh = batteryRequiredPerPathKWh * (s.upsTopology === '2n' ? 2 : 1);
  const batteryEstimatedMinutes = upsOutputKW > 0 ? s.batteryInstalledKWh *
    (s.batteryUsablePct / 100) * (s.batteryAgingPct / 100) * (s.batteryInverterPct / 100) /
    upsOutputKW * 60 : 0;

  const directKW = designITKW - protectedITKW + coolingElectricalKW - protectedCoolingKW + s.directAuxKW;
  const utilityBeforeDistributionKW = upsInputKW + directKW;
  const utilityPeakKW = utilityBeforeDistributionKW / (1 - s.distributionLossPct / 100);
  const distributionLossKW = utilityPeakKW - utilityBeforeDistributionKW;
  const utilityPerFeedKVA = utilityPeakKW / s.utilityPowerFactor / (s.utilityTargetPct / 100);
  const utilityPerFeedA = utilityPeakKW * 1000 / (Math.sqrt(3) * s.voltage * s.utilityPowerFactor);
  const utilityInstalledKVA = utilityPerFeedKVA * (s.utilityMode === 'dual' ? 2 : 1);
  const generatorBaseKVA = Math.max(utilityPeakKW / s.generatorPowerFactor, utilityPeakKW / s.utilityPowerFactor);

  const averageITKW = installedITKW * s.averageITPct / 100;
  const averageCoolingKW = (averageITKW + s.roomHeatKW) / s.coolingCOP;
  const averageUPSKW = averageITKW * s.protectedPct / 100 + averageCoolingKW * s.coolingOnUPSPct / 100 + s.upsAuxKW;
  const averageDirectKW = averageITKW * (1 - s.protectedPct / 100) + averageCoolingKW * (1 - s.coolingOnUPSPct / 100) + s.directAuxKW;
  const utilityAverageKW = (averageUPSKW / (s.upsEfficiencyPct / 100) + averageDirectKW) / (1 - s.distributionLossPct / 100);
  const monthlyKWh = utilityAverageKW * 24 * 30;
  const monthlyCost = monthlyKWh * s.electricityPrice;

  const warnings = [];
  if (!installedITKW) warnings.push('尚未录入 IT 设备负载；当前结果不适合做容量决策。');
  if (s.protectedPct < 100) warnings.push('有部分 IT 负载未由 UPS 保护，市电中断时不能按全部设备持续运行估算。');
  if (s.coolingOnUPSPct === 0 && s.runtimeMin >= 15) warnings.push('制冷未接入 UPS：停电期间即使 IT 有续航，机房温度仍可能快速上升。');
  if (s.upsTopology === '2n' && s.utilityMode === 'single') warnings.push('2N UPS 不等于双路独立市电；上游仍存在单点。');
  if (s.batteryInstalledKWh > 0 && s.batteryInstalledKWh < batteryRequiredPerPathKWh) warnings.push('填写的单路电池标称容量低于当前模型的续航估算需求。');
  if (s.utilityInstalledKVA > 0 && s.utilityInstalledKVA < utilityPerFeedKVA) warnings.push('填写的单路市电/变压器额定容量低于本方案的单路规划值。');
  if (s.generatorRatedKVA > 0 && s.generatorRatedKVA + 1e-9 < generatorBaseKVA) warnings.push('填写的发电机额定 kVA 不满足稳态有功或视在负载基线；尚未考虑启动冲击与环境降额。');
  if (s.generatorTransferSec > 0 && s.generatorTransferSec > s.runtimeMin * 60) warnings.push('备用电源预期切换时间超过目标电池续航；切换期间关键负载可能失电。');
  if (s.coolingRedundancy === 'n1' && coolingSurvivorKW + 1e-9 < coolingDesignKW) warnings.push('制冷 N+1 校验未通过，请复核单台可用显冷量。');
  return {
    config: s, installedITKW, designITKW, coolingHeatKW, coolingDesignKW, coolingElectricalKW,
    coolingWorkingUnits, coolingInstalledUnits, coolingSurvivorKW, protectedITKW, protectedCoolingKW,
    upsOutputKW, upsMinimumKW, upsPerPathKVA, upsWorkingModules, upsInstalledModules,
    upsInstalledKVA, upsInputKW, upsLossKW, batteryRequiredPerPathKWh, batteryInstalledTotalKWh,
    batteryEstimatedMinutes, directKW, utilityBeforeDistributionKW, utilityPeakKW, distributionLossKW,
    utilityPerFeedKVA, utilityPerFeedA, utilityInstalledKVA, generatorBaseKVA, averageITKW, averageCoolingKW,
    utilityAverageKW, monthlyKWh, monthlyCost, warnings,
  };
}
