/* Spatial planning estimates are deliberately simple and vendor-neutral. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SpatialModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
  const distance = (a, b, width, height) => Math.hypot((a.x - b.x) * width, (a.y - b.y) * height);
  function lineCrosses(a, b, c, d) {
    const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const x = cross(a, b, c), y = cross(a, b, d), z = cross(c, d, a), w = cross(c, d, b);
    return x * y < -1e-10 && z * w < -1e-10;
  }
  function blocked(from, to, walls) {
    return walls.some(w => lineCrosses(from, to, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }));
  }
  function coneCovers(item, point, plan, field = 'fov') {
    const meters = distance(item, point, plan.width, plan.height);
    if (meters > item.range || blocked(item, point, plan.walls)) return false;
    const dx = (point.x - item.x) * plan.width, dy = (point.y - item.y) * plan.height;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const diff = ((angle - item.angle + 540) % 360) - 180;
    return Math.abs(diff) <= item[field] / 2;
  }
  function cameraZone(item, point, plan) {
    if (!coneCovers(item, point, plan)) return 0;
    return item.identifyRange > 0 && distance(item, point, plan.width, plan.height) <= item.identifyRange ? 2 : 1;
  }
  function fieldWidthAtDistance(horizontalFov, meters) {
    return +(2 * Number(meters) * Math.tan(Number(horizontalFov) * Math.PI / 360)).toFixed(1);
  }
  function cameraEstimate(plan) {
    const cameras = plan.items.filter(i => i.type === 'camera');
    const cols = 40, rows = Math.max(12, Math.round(cols * plan.height / plan.width));
    let seen = 0, identifiable = 0;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const p = { x: (x + .5) / cols, y: (y + .5) / rows };
      let zone = 0;
      for (const camera of cameras) { zone = Math.max(zone, cameraZone(camera, p, plan)); if (zone === 2) break; }
      if (zone) seen++;
      if (zone === 2) identifiable++;
    }
    const bitrate = cameras.reduce((n, c) => n + c.bitrate, 0);
    const dailyGB = bitrate * 86400 / 8000;
    return {
      cameras: cameras.length, coveredPct: Math.round(100 * seen / (cols * rows)),
      identifiablePct: cameras.some(c => c.identifyRange > 0) ? Math.round(100 * identifiable / (cols * rows)) : null,
      bitrateMbps: bitrate, dailyGB: +dailyGB.toFixed(1),
      retentionTB: +(dailyGB * plan.settings.days / 1000).toFixed(2),
      poeW: cameras.reduce((n, c) => n + c.power, 0)
    };
  }
  function cableLength(device, switchItem, plan) {
    if (!switchItem) return null;
    const path = [switchItem, ...(device.waypoints || []), device];
    let length = 0;
    for (let i = 1; i < path.length; i++) length += distance(path[i - 1], path[i], plan.width, plan.height);
    return +((length + Math.max(0, Number(device.verticalM) || 0)) * (1 + plan.settings.slack / 100)).toFixed(1);
  }
  const poeTiers = [
    { id: 'af', label: '802.3af', pdW: 13, pseW: 15.4 },
    { id: 'at', label: '802.3at', pdW: 25.5, pseW: 30 },
    { id: 'bt3', label: '802.3bt Type 3', pdW: 51, pseW: 60 },
    { id: 'bt4', label: '802.3bt Type 4', pdW: 71.3, pseW: 90 }
  ];
  const tierIndex = id => poeTiers.findIndex(tier => tier.id === id);
  function cableEstimate(plan) {
    const switches = plan.items.filter(i => i.type === 'switch');
    const devices = plan.items.filter(i => i.type !== 'switch');
    const rows = devices.map(d => {
      const sw = switches.find(s => s.id === d.switchId);
      const pdW = Math.max(0, Number(d.power) || 0);
      const autoTier = poeTiers.find(tier => pdW <= tier.pdW);
      const declaredTier = poeTiers.find(tier => tier.id === d.poeType);
      const tier = autoTier && declaredTier ? poeTiers[Math.max(tierIndex(autoTier.id), tierIndex(declaredTier.id))] : autoTier || null;
      const allocatedW = tier ? tier.pseW : Math.max(pdW, 90);
      const runningW = Math.max(0, Number(d.runningPower ?? d.power) || 0);
      const length = cableLength(d, sw, plan);
      const channelLength = length === null ? null : +(length + Math.max(0, Number(d.patchM) || 0)).toFixed(1);
      return { id: d.id, name: d.name, type: d.type, switchId: sw?.id || '',
        switchName: sw?.name || '未连接', watts: pdW, runningW, allocatedW,
        poeType: tier?.id || 'unsupported', declaredPoeType: declaredTier?.id || 'auto', portNumber: Number(d.portNumber) || 0,
        length, channelLength, issues: [] };
    });
    const budgets = switches.map(sw => {
      const ports = rows.filter(r => r.switchId === sw.id);
      const usedNumbers = new Set();
      for (const row of ports.filter(r => r.portNumber > 0)) {
        if (row.portNumber > sw.ports || !Number.isInteger(row.portNumber)) row.issues.push('端口号超出范围');
        else if (usedNumbers.has(row.portNumber)) row.issues.push('端口号重复');
        else usedNumbers.add(row.portNumber);
      }
      for (const row of ports.filter(r => !r.portNumber)) {
        let number = 1;
        while (usedNumbers.has(number) && number <= sw.ports) number++;
        if (number > sw.ports) row.issues.push('端口不足');
        else { row.portNumber = number; usedNumbers.add(number); }
      }
      const swTier = tierIndex(sw.poeType || 'at');
      const portLimitW = Math.max(0, Number(sw.perPortW) || poeTiers[Math.max(0, swTier)].pseW);
      for (const row of ports) {
        const pdTier = tierIndex(row.poeType);
        if (pdTier < 0) row.issues.push('超过标准 PoE Type 4 参考范围');
        if (row.declaredPoeType !== 'auto' && row.watts > poeTiers[tierIndex(row.declaredPoeType)].pdW) row.issues.push('设备最大功耗超过所选供电类型');
        if (pdTier > swTier || row.allocatedW > portLimitW) row.issues.push('单端口 PoE 能力不足');
        if (row.length > 90) row.issues.push('永久链路超过 90 m');
        if (row.channelLength > 100) row.issues.push('含跳线信道超过 100 m');
      }
      const watts = ports.reduce((n, r) => n + r.allocatedW, 0);
      const runningW = ports.reduce((n, r) => n + r.runningW, 0);
      const reservePct = Math.min(50, Math.max(0, Number(plan.settings.reservePct) || 0));
      const usableW = +(sw.budget * (1 - reservePct / 100)).toFixed(1);
      return { id: sw.id, name: sw.name, portsUsed: ports.length, ports: sw.ports,
        watts: +watts.toFixed(1), runningW: +runningW.toFixed(1), budget: sw.budget,
        usableW, portLimitW, poeType: sw.poeType || 'at',
        reserveExceeded: watts > usableW, overloaded: watts > sw.budget || ports.length > sw.ports };
    });
    for (const row of rows.filter(r => !r.switchId)) row.issues.push('未分配交换机');
    return { rows, budgets, totalM: +rows.reduce((n, r) => n + (r.length || 0), 0).toFixed(1),
      tooLong: rows.filter(r => r.length !== null && r.length > 90).length,
      channelTooLong: rows.filter(r => r.channelLength !== null && r.channelLength > 100).length,
      disconnected: rows.filter(r => !r.switchId).length,
      issues: rows.reduce((n, r) => n + r.issues.length, 0) + budgets.filter(b => b.reserveExceeded || b.overloaded).length };
  }
  function cameraFacePixels(camera, seat, plan) {
    const meters = Math.max(.5, distance(camera, seat, plan.width, plan.height));
    const frameWidth = 2 * meters * Math.tan(clamp(camera.fov, 5, 170) * Math.PI / 360);
    return Math.round((Number(camera.hPixels) || 3840) * .16 / frameWidth);
  }
  function screenTextArcMinutes(screen, seat, plan) {
    const meters = Math.max(.5, distance(screen, seat, plan.width, plan.height));
    const height = (Number(screen.diagonalIn) || 75) * .0254 * 9 / Math.hypot(16, 9);
    const letterHeight = height * (Number(screen.textPx) || 40) / (Number(screen.contentHeightPx) || 1080);
    return +(2 * Math.atan(letterHeight / (2 * meters)) * 180 / Math.PI * 60).toFixed(1);
  }
  function speakerLevel(speaker, seat, plan) {
    const meters = Math.max(1, distance(speaker, seat, plan.width, plan.height));
    return +((Number(speaker.spl1m) || 85) - 20 * Math.log10(meters)).toFixed(1);
  }
  function audioZone(item, seat, plan) {
    if (distance(item, seat, plan.width, plan.height) > item.range || blocked(item, seat, plan.walls)) return false;
    return (Number(item.fov) || 360) >= 359 || coneCovers(item, seat, plan);
  }
  function avEstimate(plan) {
    const seats = plan.items.filter(i => i.type === 'seat');
    const byType = type => plan.items.filter(i => i.type === type);
    const settings = plan.settings || {};
    const targetSpl = Number(settings.targetSplDb) || 65;
    const acousticRisks = [];
    if ((Number(settings.noiseDb) || 0) > 45) acousticRisks.push('背景噪声偏高，需现场测量信噪比');
    if ((Number(settings.rt60) || 0) > .6) acousticRisks.push('混响时间偏长，需现场试听并考虑吸声处理');
    const scores = seats.map(seat => {
      const mics = byType('mic').filter(i => audioZone(i, seat, plan));
      const speakers = byType('speaker').filter(i => audioZone(i, seat, plan));
      const cameras = byType('camera').filter(i => coneCovers(i, seat, plan));
      const screens = byType('screen').filter(i => coneCovers(i, seat, plan));
      const mic = mics.length > 0, speaker = speakers.length > 0;
      const camera = cameras.length > 0, screen = screens.length > 0;
      const facePx = camera ? Math.max(...cameras.map(i => cameraFacePixels(i, seat, plan))) : null;
      const textArcMin = screen ? Math.max(...screens.map(i => screenTextArcMinutes(i, seat, plan))) : null;
      const speakerDb = speaker ? Math.max(...speakers.map(i => speakerLevel(i, seat, plan))) : null;
      const cameraClear = cameras.some(i => cameraFacePixels(i, seat, plan) >= (Number(i.minFacePx) || 40));
      const screenReadable = screens.some(i => screenTextArcMinutes(i, seat, plan) >= (Number(i.minTextArcMin) || 16));
      const speakerLevelOk = speakerDb !== null && speakerDb >= targetSpl;
      return { id: seat.id, name: seat.name, mic, speaker, camera, screen, facePx, textArcMin, speakerDb,
        cameraClear, screenReadable, speakerLevelOk,
        ready: mic && speakerLevelOk && cameraClear && screenReadable };
    });
    return { seats: scores, ready: scores.filter(s => s.ready).length,
      missingMic: scores.filter(s => !s.mic).length, missingSpeaker: scores.filter(s => !s.speaker).length,
      missingCamera: scores.filter(s => !s.camera).length, missingScreen: scores.filter(s => !s.screen).length,
      weakCamera: scores.filter(s => s.camera && !s.cameraClear).length,
      weakScreen: scores.filter(s => s.screen && !s.screenReadable).length,
      weakSpeaker: scores.filter(s => s.speaker && !s.speakerLevelOk).length,
      acousticRisks };
  }
  return { clamp, distance, blocked, coneCovers, cameraZone, fieldWidthAtDistance, cameraEstimate, cableLength, cableEstimate, poeTiers,
    cameraFacePixels, screenTextArcMinutes, speakerLevel, avEstimate };
});
