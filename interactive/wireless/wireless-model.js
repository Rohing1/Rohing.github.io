(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.WirelessModel = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';
  const PROFILES = {
    cisco9120: {vendor: 'Cisco', label: 'Catalyst 9120AXI', scene: '室内通用', radiusM: 20, detail: 'Wi-Fi 6 · 室内 · 2.4+5 GHz；支持双 5 GHz 模式', modes: ['dual', 'dual5'], source: 'https://www.cisco.com/c/en/us/products/collateral/wireless/catalyst-9120ax-series-access-points/datasheet-c78-742115.html'},
    cisco9130: {vendor: 'Cisco', label: 'Catalyst 9130AXI', scene: '室内高密', radiusM: 20, detail: 'Wi-Fi 6 · 室内高密 · 双射频或 2.4+双 5 GHz', modes: ['dual', 'tri'], source: 'https://www.cisco.com/c/en/us/products/collateral/wireless/catalyst-9100ax-access-points/nb-06-cat-9130-ser-ap-ds-cte-en.html'},
    cisco9124: {vendor: 'Cisco', label: 'Catalyst 9124AXI', scene: '室外全向', radiusM: 40, detail: 'Wi-Fi 6 · 室外全向天线 · 2.4+5 GHz', modes: ['dual'], source: 'https://www.cisco.com/c/en/us/products/collateral/wireless/catalyst-9100ax-access-points/nb-06-cat9124-ser-ap-ds-cte-en.html'},
    huawei5762: {vendor: 'Huawei', label: 'AirEngine 5762-12', scene: '室内通用', radiusM: 20, detail: 'Wi-Fi 6 · 室内 · 2.4 GHz 2×2 + 5 GHz 2×2', modes: ['dual'], source: 'https://e.huawei.com/mx/products/wlan/indoor-access-points/airengine-5762-12'},
    huawei5761: {vendor: 'Huawei', label: 'AirEngine 5761-11', scene: '室内基础', radiusM: 20, detail: 'Wi-Fi 6 · 室内 · 2.4+5 GHz 双频', modes: ['dual'], source: 'https://e.huawei.com/ae/products/wlan/indoor-access-points/airengine-5761-11'},
    huawei6760: {vendor: 'Huawei', label: 'AirEngine 6760-X1', scene: '室内高密', radiusM: 20, detail: 'Wi-Fi 6 · 室内高密 · 双射频；三射频模式需核对许可与配置', modes: ['dual', 'tri'], source: 'https://e.huawei.com/en/products/wlan/indoor-access-points/airengine-6760-x1-6760-x1e'},
    huawei6760r: {vendor: 'Huawei', label: 'AirEngine 6760R-51', scene: '室外覆盖', radiusM: 40, detail: 'Wi-Fi 6 · 室外 · 2.4+5 GHz 双频；内置智能天线', modes: ['dual'], source: 'https://e.huawei.com/de/products/wlan/outdoor-access-points/airengine-6760r-51-airengine-6760r-51e'},
    h3c6638: {vendor: 'H3C', label: 'WA6638', scene: '室内高密', radiusM: 20, detail: 'Wi-Fi 6 · 室内高密 · 2.4 GHz + 双 5 GHz', modes: ['tri'], source: 'https://www.h3c.com/cn/Products_And_Solution/InterConnect/Products/IP_Wlan/Products/AP/Wi_Fi_6/WA6638/'},
    h3c6520: {vendor: 'H3C', label: 'WA6520', scene: '室内通用', radiusM: 20, detail: 'Wi-Fi 6 · 室内 · 2.4+5 GHz 双频', modes: ['dual'], source: 'https://www.h3c.com/cn/Products_And_Solution/InterConnect/Products/IP_Wlan/Products/FAT_AP/Wifi_6/WA6520/'},
    h3c6620x: {vendor: 'H3C', label: 'WA6620X', scene: '室外覆盖', radiusM: 40, detail: 'Wi-Fi 6 · 室外 · 2.4+5 GHz 或双 5 GHz 模式', modes: ['dual', 'dual5'], source: 'https://www.h3c.com/cn/Products_And_Solution/InterConnect/Products/IP_Wlan/Products/Outdoor_AP/WiFi_6/WA6620X/'}
  };
  const WALLS = {
    drywall: {label: '轻质隔墙', loss24: 4, loss5: 7, color: '#7da7c6'},
    glass: {label: '玻璃', loss24: 4, loss5: 7, color: '#63c5d5'},
    concrete: {label: '混凝土墙', loss24: 10, loss5: 15, color: '#9a8198'},
    metal: {label: '金属隔断', loss24: 25, loss5: 30, color: '#f29d68'}
  };
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const id = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  function radiosFor(profileId, mode) {
    const validMode = PROFILES[profileId]?.modes.includes(mode) ? mode : PROFILES[profileId]?.modes[0] || 'dual';
    if (validMode === 'dual5') return [{id: '5a', band: '5', channel: 36, width: 20, eirp: 17, enabled: true}, {id: '5b', band: '5', channel: 149, width: 20, eirp: 17, enabled: true}];
    if (validMode === 'tri') return [{id: '24', band: '2.4', channel: 1, width: 20, eirp: 17, enabled: true}, {id: '5a', band: '5', channel: 36, width: 20, eirp: 17, enabled: true}, {id: '5b', band: '5', channel: 149, width: 20, eirp: 17, enabled: true}];
    return [{id: '24', band: '2.4', channel: 1, width: 20, eirp: 17, enabled: true}, {id: '5a', band: '5', channel: 36, width: 20, eirp: 17, enabled: true}];
  }
  function makeAp(profileId, x, y, name, mode) {
    const profile = PROFILES[profileId] || PROFILES.cisco9120;
    const radioMode = profile.modes.includes(mode) ? mode : profile.modes[0];
    return {id: id(), name: name || `${profile.vendor} AP`, profileId: PROFILES[profileId] ? profileId : 'cisco9120', mode: radioMode, x: clamp(x, 0, 1), y: clamp(y, 0, 1), height: 2.7, radiusM: profile.radiusM, clients: 20, radios: radiosFor(profileId, radioMode)};
  }
  function makeWall(type, x1, y1, x2, y2) {
    return {id: id(), type: WALLS[type] ? type : 'drywall', x1: clamp(x1, 0, 1), y1: clamp(y1, 0, 1), x2: clamp(x2, 0, 1), y2: clamp(y2, 0, 1)};
  }
  function scenario(kind = 'office', profileId = 'cisco9120') {
    const plan = {version: 1, title: '无线覆盖方案', defaultProfileId: PROFILES[profileId] ? profileId : 'cisco9120', widthM: 30, heightM: 18, imageData: '', aps: [], walls: [], route: [], settings: {band: '5', view: 'rssi', threshold: -67, noise: -92, exponent: 2.7, hysteresis: 6, showGrid: true, showHeat: true, showLabels: true, showRadius: true}};
    const ap = (x, y, name) => plan.aps.push(makeAp(profileId, x, y, name));
    const wall = (type, x1, y1, x2, y2) => plan.walls.push(makeWall(type, x1, y1, x2, y2));
    if (kind === 'office') {
      plan.title = '开放办公 · 示例'; ap(.22, .30, '办公 AP-1'); ap(.73, .32, '办公 AP-2'); ap(.49, .78, '办公 AP-3');
      wall('glass', .48, .05, .48, .39); wall('drywall', .10, .58, .38, .58); wall('glass', .62, .62, .91, .62);
      plan.route = [{x: .10, y: .86}, {x: .49, y: .52}, {x: .89, y: .16}];
    } else if (kind === 'rooms') {
      plan.title = '多房间 · 示例'; plan.widthM = 24; plan.heightM = 16;
      ap(.20, .27, '会议室 AP'); ap(.74, .27, '办公区 AP'); ap(.49, .76, '公共区 AP');
      wall('concrete', .46, .06, .46, .52); wall('concrete', .05, .53, .38, .53); wall('concrete', .61, .53, .95, .53);
      wall('glass', .46, .53, .46, .94);
      plan.route = [{x: .15, y: .82}, {x: .33, y: .64}, {x: .52, y: .50}, {x: .82, y: .29}];
    } else if (kind === 'corridor') {
      plan.title = '长走廊 · 示例'; plan.widthM = 45; plan.heightM = 12;
      ap(.17, .50, '西侧 AP'); ap(.50, .50, '中段 AP'); ap(.83, .50, '东侧 AP');
      wall('drywall', .07, .30, .93, .30); wall('drywall', .07, .70, .93, .70);
      plan.route = [{x: .08, y: .50}, {x: .92, y: .50}];
    } else if (kind === 'dense') {
      plan.title = '高密会议 · 示例'; plan.widthM = 32; plan.heightM = 20;
      ap(.27, .29, '会场 AP-1'); ap(.70, .29, '会场 AP-2'); ap(.26, .74, '会场 AP-3'); ap(.72, .73, '会场 AP-4');
      plan.aps.forEach(item => { item.clients = 60; item.radios.forEach(radio => { if (radio.band === '5') radio.width = 20; }); });
      plan.route = [{x: .10, y: .88}, {x: .50, y: .52}, {x: .90, y: .12}];
    } else if (kind === 'outdoor') {
      plan.title = '室外广场 · 示例'; plan.widthM = 80; plan.heightM = 45; plan.settings.exponent = 2.3;
      ap(.24, .46, '广场西侧 AP'); ap(.76, .46, '广场东侧 AP');
      plan.route = [{x: .06, y: .52}, {x: .50, y: .52}, {x: .94, y: .52}];
    } else { plan.title = '空白方案'; }
    return plan;
  }
  function orientation(ax, ay, bx, by, cx, cy) { return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); }
  function intersects(a, b, wall) {
    const d1 = orientation(a.x, a.y, b.x, b.y, wall.x1, wall.y1);
    const d2 = orientation(a.x, a.y, b.x, b.y, wall.x2, wall.y2);
    const d3 = orientation(wall.x1, wall.y1, wall.x2, wall.y2, a.x, a.y);
    const d4 = orientation(wall.x1, wall.y1, wall.x2, wall.y2, b.x, b.y);
    return d1 * d2 < -1e-9 && d3 * d4 < -1e-9;
  }
  function received(plan, ap, radio, x, y) {
    const dx = (x - ap.x) * plan.widthM, dy = (y - ap.y) * plan.heightM;
    const distance = Math.max(1, Math.hypot(dx, dy, ap.height || 2.7));
    const fspl1m = radio.band === '2.4' ? 40.05 : 46.42;
    const exponent = clamp(Number(plan.settings.exponent) || 2.7, 2, 4);
    let loss = 0;
    for (const wall of plan.walls) if (intersects(ap, {x, y}, wall)) loss += radio.band === '2.4' ? WALLS[wall.type].loss24 : WALLS[wall.type].loss5;
    return Number(radio.eirp) - fspl1m - 10 * exponent * Math.log10(distance) - loss;
  }
  function signalAt(plan, x, y, band = plan.settings.band) {
    const signals = [];
    for (const ap of plan.aps) for (const radio of ap.radios) {
      if (radio.enabled && radio.band === band) signals.push({apId: ap.id, apName: ap.name, radioId: radio.id, channel: Number(radio.channel), width: Number(radio.width), rssi: received(plan, ap, radio, x, y)});
    }
    signals.sort((a, b) => b.rssi - a.rssi);
    const best = signals[0] || null;
    return {best, second: best ? signals.find(signal => signal.apId !== best.apId) || null : null, signals, snr: best ? best.rssi - Number(plan.settings.noise) : null};
  }
  function channelOverlap(a, b) {
    if (a.band !== b.band) return false;
    return Math.abs(Number(a.channel) - Number(b.channel)) * 5 < (Number(a.width) + Number(b.width)) / 2;
  }
  function channelWarnings(plan, band = plan.settings.band) {
    const radios = plan.aps.flatMap(ap => ap.radios.filter(r => r.enabled && r.band === band).map(r => ({...r, ap})));
    const pairs = [];
    for (let i = 0; i < radios.length; i++) for (let j = i + 1; j < radios.length; j++) {
      const a = radios[i], b = radios[j];
      if (a.ap.id === b.ap.id || !channelOverlap(a, b)) continue;
      const meters = Math.hypot((a.ap.x - b.ap.x) * plan.widthM, (a.ap.y - b.ap.y) * plan.heightM);
      if (meters <= 25) pairs.push({a: a.ap.name, b: b.ap.name, channelA: a.channel, channelB: b.channel, meters: Math.round(meters)});
    }
    return pairs;
  }
  function coverage(plan, band = plan.settings.band, columns = 42, rows = 28) {
    let covered = 0, overlap = 0, total = 0, minimum = Infinity, maximum = -Infinity;
    for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
      const value = signalAt(plan, (x + .5) / columns, (y + .5) / rows, band);
      total++;
      if (value.best && value.best.rssi >= plan.settings.threshold) covered++;
      if (value.second && value.second.rssi >= plan.settings.threshold) overlap++;
      if (value.best) { minimum = Math.min(minimum, value.best.rssi); maximum = Math.max(maximum, value.best.rssi); }
    }
    return {coveredPct: Math.round(covered / total * 100), overlapPct: Math.round(overlap / total * 100), minimum: Number.isFinite(minimum) ? Math.round(minimum) : null, maximum: Number.isFinite(maximum) ? Math.round(maximum) : null};
  }
  function roam(plan, band = plan.settings.band) {
    if (plan.route.length < 2) return {samples: [], handoffs: [], weakPct: 0, distance: 0};
    const samples = [], handoffs = [];
    let current = null, distance = 0, weak = 0;
    for (let i = 1; i < plan.route.length; i++) {
      const a = plan.route[i - 1], b = plan.route[i];
      const meters = Math.hypot((b.x - a.x) * plan.widthM, (b.y - a.y) * plan.heightM);
      const steps = Math.max(1, Math.ceil(meters / .5));
      for (let step = i === 1 ? 0 : 1; step <= steps; step++) {
        const t = step / steps, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
        const point = signalAt(plan, x, y, band);
        let associated = current && point.signals.find(s => s.apId === current);
        const best = point.best;
        const margin = Number(plan.settings.hysteresis);
        if (best && (!associated || best.apId !== associated.apId && (best.rssi >= associated.rssi + margin || associated.rssi < -82 && best.rssi > associated.rssi))) {
          const next = best.apId;
          if (current && current !== next) handoffs.push({x, y, from: associated?.apName || '原 AP', to: best.apName, at: distance + meters * t});
          current = next; associated = best;
        }
        const rssi = associated?.rssi ?? best?.rssi ?? -120;
        if (rssi < Number(plan.settings.threshold)) weak++;
        samples.push({x, y, rssi, apName: associated?.apName || best?.apName || '无信号'});
      }
      distance += meters;
    }
    return {samples, handoffs, weakPct: Math.round(weak / samples.length * 100), distance: Math.round(distance * 10) / 10};
  }
  return {PROFILES, WALLS, radiosFor, makeAp, makeWall, scenario, signalAt, channelOverlap, channelWarnings, coverage, roam, clamp};
});
