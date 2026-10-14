const PACKS = {
  cisco: () => import('network-cisco.20261001.js'),
  huawei: () => import('network-huawei.20261001.js'),
  h3c: () => import('network-h3c.20261001.js'),
  juniper: () => import('network-juniper.20261001.js'),
};

export const NETWORK_SOURCES = Object.freeze({
  cisco: { platform: 'Cisco IOS/IOS XE', version: 'IOS XE 17.17.x', family: 'Catalyst 9300' },
  huawei: { platform: 'Huawei VRP', version: 'V200R023C00', family: 'S300/S500/S2700/S5700/S6700' },
  h3c: { platform: 'H3C Comware', version: 'Comware 7 R0615', family: 'MSR 路由器' },
  juniper: { platform: 'Juniper Junos', version: '依官方条目', family: 'Junos OS / Evolved' },
});

export async function loadNetworkIndex(vendors = Object.keys(PACKS)) {
  const groups = await Promise.all(vendors.map(async vendor => {
    const metadata = NETWORK_SOURCES[vendor];
    if (!metadata) throw Error(`未知网络厂商：${vendor}`);
    const { ROWS } = await PACKS[vendor]();
    return ROWS.map(([id, command, category, safety, source, mode]) => ({
      id,
      platform: metadata.platform,
      category,
      command,
      title: `${category} · 官方命令索引项；用途与完整语法请查看原文`,
      safety,
      source,
      note: '',
      origin: 'official-index',
      version: metadata.version,
      family: metadata.family,
      mode,
    }));
  }));
  return groups.flat();
}
