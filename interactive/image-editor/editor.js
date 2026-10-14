(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const art = $('art'), overlay = $('overlay'), viewport = $('viewport'), wrap = $('canvasWrap');
  const ctx = art.getContext('2d', { willReadFrequently: true });
  const guide = overlay.getContext('2d');
  const MAX_PIXELS = 16_000_000, MAX_TOTAL_PIXELS = 64_000_000, MAX_SIDE = 5000, MAX_LAYERS = 60, MAX_FILE = 80 * 1024 * 1024;
  const DB_NAME = 'yanjian-image-editor-v1';
  const DEFAULT_FILTERS = () => ({ brightness: 100, contrast: 100, saturate: 100, hue: 0, grayscale: 0, sepia: 0, blur: 0 });
  let doc = { width: 1400, height: 900, background: '#ffffff', layers: [] };
  let selectedId = null, tool = 'move', zoom = .5, autoFit = true, selection = null, crop = null, gesture = null;
  let undoStack = [], redoStack = [], restoreBusy = false, saveTimer = null, draftValue = null, useHand = false;
  let nextId = 1;
  let imageMode = 'open';

  function status(message) { $('status').textContent = message; }
  function clamp(n, low, high) { return Math.min(high, Math.max(low, n)); }
  function layer() { return doc.layers.find(item => item.id === selectedId) || null; }
  function freshCanvas(w, h) { const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; return canvas; }
  function validSize(w, h) { return Number.isInteger(w) && Number.isInteger(h) && w >= 16 && h >= 16 && w <= MAX_SIDE && h <= MAX_SIDE && w * h <= MAX_PIXELS; }
  function validRasterSize(w, h) { return Number.isInteger(w) && Number.isInteger(h) && w >= 1 && h >= 1 && w <= MAX_SIDE && h <= MAX_SIDE && w * h <= MAX_PIXELS; }
  function rectFromPoints(a, b) { const x = clamp(Math.round(Math.min(a.x, b.x)), 0, doc.width), y = clamp(Math.round(Math.min(a.y, b.y)), 0, doc.height); return { x, y, width: clamp(Math.round(Math.abs(b.x - a.x)), 0, doc.width - x), height: clamp(Math.round(Math.abs(b.y - a.y)), 0, doc.height - y) }; }
  function makeRaster(name = '像素图层', width = doc.width, height = doc.height) {
    return { id: nextId++, type: 'raster', name, x: 0, y: 0, width, height, rotation: 0, opacity: 1, blend: 'source-over', visible: true, locked: false, filters: DEFAULT_FILTERS(), canvas: freshCanvas(width, height), mask: null, maskEnabled: true };
  }
  function makeShape(type, box) {
    return { id: nextId++, type, name: type === 'rect' ? '矩形' : '椭圆', ...box, rotation: 0, opacity: 1, blend: 'source-over', visible: true, locked: false, filters: DEFAULT_FILTERS(), fill: $('paintColor').value, stroke: $('paintColor').value, strokeWidth: 0 };
  }
  function rasterPixels(item) { return item.type === 'raster' ? item.canvas.width * item.canvas.height * (item.mask ? 2 : 1) : 0; }
  function totalPixels() { return doc.layers.reduce((total, item) => total + rasterPixels(item), 0); }
  function addLayer(item) { if (doc.layers.length >= MAX_LAYERS) { status('最多支持 60 个图层；请先合并或删除部分图层。'); return false; } if (totalPixels() + rasterPixels(item) > MAX_TOTAL_PIXELS) { status('像素图层总量超过安全上限，请先缩小图片或合并图层。'); return false; } doc.layers.push(item); selectedId = item.id; refresh(); checkpoint(); return true; }
  function filterString(item) { const f = item.filters || DEFAULT_FILTERS(); return `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturate}%) hue-rotate(${f.hue}deg) grayscale(${f.grayscale}%) sepia(${f.sepia}%) blur(${f.blur}px)`; }
  function maskedBitmap(item) {
    if (!item.mask || !item.maskEnabled) return item.canvas;
    const temp = freshCanvas(item.canvas.width, item.canvas.height), t = temp.getContext('2d');
    t.drawImage(item.canvas, 0, 0); t.globalCompositeOperation = 'destination-in'; t.drawImage(item.mask, 0, 0); return temp;
  }
  function drawLayer(target, item) {
    if (!item.visible) return;
    target.save(); target.globalAlpha = item.opacity; target.globalCompositeOperation = item.blend || 'source-over'; target.filter = filterString(item);
    target.translate(item.x + item.width / 2, item.y + item.height / 2); target.rotate((item.rotation || 0) * Math.PI / 180); target.translate(-item.width / 2, -item.height / 2);
    if (item.type === 'raster') target.drawImage(maskedBitmap(item), 0, 0, item.width, item.height);
    else if (item.type === 'rect' || item.type === 'ellipse') {
      target.beginPath(); if (item.type === 'rect') target.rect(0, 0, item.width, item.height); else target.ellipse(item.width / 2, item.height / 2, item.width / 2, item.height / 2, 0, 0, Math.PI * 2);
      if (item.fill) { target.fillStyle = item.fill; target.fill(); }
      if (item.strokeWidth > 0) { target.strokeStyle = item.stroke || '#000000'; target.lineWidth = item.strokeWidth; target.stroke(); }
    } else if (item.type === 'text') {
      target.fillStyle = item.fill || '#14283c'; target.font = `${item.fontWeight || '700'} ${item.fontSize || 56}px ${item.fontFamily || 'Microsoft YaHei, sans-serif'}`;
      target.textBaseline = 'top'; target.textAlign = item.textAlign || 'left';
      const lines = wrapText(target, item.text || '', item.width);
      const lineHeight = (item.fontSize || 56) * 1.32;
      for (let i = 0; i < lines.length && (i + 1) * lineHeight <= item.height + lineHeight / 3; i++) {
        const x = item.textAlign === 'center' ? item.width / 2 : item.textAlign === 'right' ? item.width : 0;
        target.fillText(lines[i], x, i * lineHeight, item.width);
      }
    }
    target.restore();
  }
  function wrapText(target, text, maxWidth) {
    const result = [];
    for (const paragraph of String(text).split('\n')) {
      if (!paragraph) { result.push(''); continue; }
      let line = '';
      for (const char of paragraph) {
        if (line && target.measureText(line + char).width > maxWidth) { result.push(line); line = char; } else line += char;
      }
      result.push(line);
    }
    return result;
  }
  function drawDocument(target, opaque = false) {
    target.clearRect(0, 0, doc.width, doc.height);
    if (opaque || doc.background !== 'transparent') { target.fillStyle = opaque && doc.background === 'transparent' ? '#ffffff' : doc.background; target.fillRect(0, 0, doc.width, doc.height); }
    for (const item of doc.layers) drawLayer(target, item);
  }
  function render() { drawDocument(ctx); drawGuides(); }
  function drawGuides() {
    guide.clearRect(0, 0, doc.width, doc.height);
    const selected = layer();
    if (selected && selected.visible) { guide.save(); guide.strokeStyle = '#54aaff'; guide.lineWidth = Math.max(1, 1 / zoom); guide.setLineDash([Math.max(5, 6 / zoom), Math.max(3, 4 / zoom)]); guide.translate(selected.x + selected.width / 2, selected.y + selected.height / 2); guide.rotate((selected.rotation || 0) * Math.PI / 180); guide.strokeRect(-selected.width / 2, -selected.height / 2, selected.width, selected.height); guide.restore(); }
    if (selected && selected.visible && !selected.locked && !selected.rotation && tool === 'move') { guide.save(); guide.setLineDash([]); const size = 8 / zoom; for (const p of handlePoints(selected)) { guide.fillStyle = '#f5fbff'; guide.strokeStyle = '#377ce8'; guide.lineWidth = 1.5 / zoom; guide.fillRect(p.x - size / 2, p.y - size / 2, size, size); guide.strokeRect(p.x - size / 2, p.y - size / 2, size, size); } guide.restore(); }
    for (const [box, color] of [[selection, '#ffffff'], [crop, '#ffc071']]) if (box) { guide.save(); guide.strokeStyle = color; guide.lineWidth = Math.max(1, 1.5 / zoom); guide.setLineDash([9 / zoom, 5 / zoom]); guide.strokeRect(box.x, box.y, box.width, box.height); guide.restore(); }
    if (gesture?.preview) { const box = gesture.preview; guide.save(); guide.strokeStyle = '#72baff'; guide.lineWidth = Math.max(1, 2 / zoom); guide.setLineDash([8 / zoom, 4 / zoom]); if (gesture.tool === 'ellipse') { guide.beginPath(); guide.ellipse(box.x + box.width / 2, box.y + box.height / 2, box.width / 2, box.height / 2, 0, 0, Math.PI * 2); guide.stroke(); } else guide.strokeRect(box.x, box.y, box.width, box.height); guide.restore(); }
  }
  function resizeCanvases() {
    for (const canvas of [art, overlay]) { canvas.width = doc.width; canvas.height = doc.height; canvas.style.width = `${doc.width * zoom}px`; canvas.style.height = `${doc.height * zoom}px`; }
    wrap.style.width = `${doc.width * zoom}px`; wrap.style.height = `${doc.height * zoom}px`;
    $('docInfo').textContent = `${doc.width} × ${doc.height} px · ${doc.layers.length} 图层`;
    render();
  }
  function setZoom(value, manual = true) { zoom = clamp(value, .1, 3); if (manual) autoFit = false; resizeCanvases(); $('zoomRange').value = Math.round(zoom * 100); $('zoomLabel').textContent = `${Math.round(zoom * 100)}%`; }
  function fitZoom() { const width = Math.max(280, viewport.clientWidth - 95), height = Math.max(200, viewport.clientHeight - 95); setZoom(Math.min(1.5, Math.max(.1, Math.min(width / doc.width, height / doc.height))), false); autoFit = true; }
  function refresh() { resizeCanvases(); drawLayers(); syncProperties(); updateButtons(); }
  function drawLayers() {
    const container = $('layers'); container.replaceChildren(); $('layerCount').textContent = doc.layers.length;
    for (const item of [...doc.layers].reverse()) {
      const row = document.createElement('div'); row.className = `layer-row${item.id === selectedId ? ' selected' : ''}`; row.setAttribute('role', 'option'); row.setAttribute('aria-selected', String(item.id === selectedId)); row.tabIndex = 0;
      const eye = document.createElement('button'); eye.textContent = item.visible ? '◉' : '◌'; eye.title = item.visible ? '隐藏图层' : '显示图层'; eye.setAttribute('aria-label', eye.title); eye.onclick = (event) => { event.stopPropagation(); item.visible = !item.visible; refresh(); checkpoint(); };
      const icon = document.createElement('span'); icon.className = 'layer-icon'; icon.textContent = item.type === 'raster' ? '▧' : item.type === 'text' ? 'T' : item.type === 'rect' ? '▭' : '◯';
      const label = document.createElement('span'); label.className = 'layer-label'; const strong = document.createElement('strong'); strong.textContent = item.name; const small = document.createElement('small'); small.textContent = `${Math.round(item.opacity * 100)}% · ${item.type === 'raster' ? '像素' : item.type === 'text' ? '文字' : '形状'}${item.mask ? ' · 蒙版' : ''}`; label.append(strong, small);
      const lock = document.createElement('button'); lock.textContent = item.locked ? '🔒' : '♧'; lock.title = item.locked ? '解锁图层' : '锁定图层'; lock.setAttribute('aria-label', lock.title); lock.onclick = (event) => { event.stopPropagation(); item.locked = !item.locked; refresh(); checkpoint(); };
      row.append(eye, icon, label, lock); row.onclick = () => { if (selectedId !== item.id) $('editMask').checked = false; selectedId = item.id; drawLayers(); syncProperties(); drawGuides(); updateButtons(); }; row.onkeydown = (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); row.click(); } }; container.append(row);
    }
    if (!doc.layers.length) { const empty = document.createElement('p'); empty.className = 'empty-state'; empty.textContent = '暂无图层。打开图片，或点击“＋图层”开始。'; container.append(empty); }
  }
  function syncProperties() {
    const item = layer(); $('noLayer').hidden = Boolean(item); $('properties').hidden = !item; if (!item) return;
    $('layerName').value = item.name; $('layerX').value = Math.round(item.x); $('layerY').value = Math.round(item.y); $('layerW').value = Math.round(item.width); $('layerH').value = Math.round(item.height);
    $('layerRotation').value = item.rotation || 0; $('rotationValue').textContent = `${Math.round(item.rotation || 0)}°`;
    $('layerOpacity').value = Math.round(item.opacity * 100); $('opacityValue').textContent = `${Math.round(item.opacity * 100)}%`; $('layerBlend').value = item.blend || 'source-over';
    $('textFields').hidden = item.type !== 'text'; $('shapeFields').hidden = !['rect', 'ellipse'].includes(item.type); $('maskFields').hidden = item.type !== 'raster' || !item.mask;
    if (item.type === 'text') { $('textContent').value = item.text; $('fontSize').value = item.fontSize; $('fontWeight').value = item.fontWeight; $('fontFamily').value = item.fontFamily; $('textAlign').value = item.textAlign; $('textColor').value = item.fill; }
    if (item.type === 'rect' || item.type === 'ellipse') { $('shapeFill').value = item.fill; $('shapeStroke').value = item.stroke; $('shapeStrokeWidth').value = item.strokeWidth; }
    if (item.type === 'raster' && item.mask) $('maskEnabled').checked = item.maskEnabled;
    for (const key of ['Brightness', 'Contrast', 'Saturate', 'Hue', 'Grayscale', 'Sepia', 'Blur']) { const input = $(`adj${key}`); input.value = item.filters[key.toLowerCase()]; input.nextElementSibling.textContent = `${input.value}${key === 'Blur' ? ' px' : key === 'Hue' ? '°' : '%'}`; }
  }
  function updateButtons() {
    const item = layer(), idx = doc.layers.findIndex(entry => entry.id === selectedId);
    for (const id of ['duplicateLayer', 'deleteLayer']) $(id).disabled = !item;
    $('moveLayerUp').disabled = !item || idx === doc.layers.length - 1; $('moveLayerDown').disabled = !item || idx <= 0; $('mergeLayer').disabled = !item || idx <= 0;
    $('addMask').disabled = !item || item.type !== 'raster' || Boolean(item.mask); $('copySelection').disabled = !item || !selection; $('clearSelection').disabled = !item || !selection || item.type !== 'raster' || item.locked;
    $('deselect').disabled = !selection; $('applyCrop').hidden = !crop; $('undo').disabled = undoStack.length <= 1; $('redo').disabled = !redoStack.length;
  }
  function serialize() {
    return { kind: 'yanjian-image-project', version: 1, width: doc.width, height: doc.height, background: doc.background,
      layers: doc.layers.map(item => { const base = { ...item, canvas: undefined, mask: undefined, filters: { ...item.filters } }; if (item.type === 'raster') { base.bitmap = item.canvas.toDataURL('image/png'); if (item.mask) base.maskBitmap = item.mask.toDataURL('image/png'); } return base; }) };
  }
  function checkpoint() { if (restoreBusy) return; try { undoStack.push(serialize()); const bytes = snapshot => snapshot.layers.reduce((sum, item) => sum + (item.bitmap?.length || 0) + (item.maskBitmap?.length || 0), 0); let total = undoStack.reduce((sum, item) => sum + bytes(item), 0); while (undoStack.length > 2 && (undoStack.length > 16 || total > 120_000_000)) total -= bytes(undoStack.shift()); redoStack = []; updateButtons(); scheduleSave(); } catch (error) { status(`无法记录撤销历史：${error.message}`); } }
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(async () => { try { await putDraft(serialize()); status('草稿已自动保存到此浏览器 · 请定期导出完整工程'); } catch { status('浏览器草稿保存失败，请立即导出完整工程备份。'); } }, 1600); }
  async function imageFromUrl(url) { return await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('图像数据无法读取')); img.src = url; }); }
  function pngDimensions(url) {
    if (typeof url !== 'string' || !url.startsWith('data:image/png;base64,') || url.length > 90_000_000) throw new Error('像素图层数据无效');
    let header;
    try { header = atob(url.slice(22, 66)); } catch { throw new Error('PNG 编码无效'); }
    if (header.length < 24 || header.slice(0, 8) !== '\x89PNG\r\n\x1a\n' || header.slice(12, 16) !== 'IHDR') throw new Error('PNG 文件头无效');
    const dimension = offset => ((header.charCodeAt(offset) * 0x1000000) + (header.charCodeAt(offset + 1) << 16) + (header.charCodeAt(offset + 2) << 8) + header.charCodeAt(offset + 3)) >>> 0;
    const width = dimension(16), height = dimension(20);
    if (!validRasterSize(width, height)) throw new Error('图层像素尺寸超过安全上限');
    return { width, height };
  }
  function validateProject(data) {
    if (!data || data.kind !== 'yanjian-image-project' || data.version !== 1 || !validSize(data.width, data.height) || !Array.isArray(data.layers) || data.layers.length > MAX_LAYERS) throw new Error('工程格式或尺寸不受支持');
    if (!(data.background === 'transparent' || /^#[0-9a-fA-F]{6}$/.test(data.background))) throw new Error('背景设置无效');
    const ids = new Set(); let backingPixels = 0;
    for (const item of data.layers) {
      if (!['raster', 'rect', 'ellipse', 'text'].includes(item.type) || typeof item.name !== 'string' || item.name.length > 80) throw new Error('图层数据无效');
      if (!Number.isSafeInteger(item.id) || item.id < 1 || ids.has(item.id)) throw new Error('图层编号无效');
      ids.add(item.id);
      for (const key of ['x', 'y', 'width', 'height', 'rotation', 'opacity']) if (!Number.isFinite(item[key])) throw new Error('图层位置或透明度无效');
      if (item.width < 1 || item.height < 1 || item.width > 10000 || item.height > 10000 || Math.abs(item.x) > 10000 || Math.abs(item.y) > 10000) throw new Error('图层尺寸越界');
      if (Math.abs(item.rotation) > 180 || item.opacity < 0 || item.opacity > 1 || typeof item.visible !== 'boolean' || typeof item.locked !== 'boolean') throw new Error('图层属性超出范围');
      if (!['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'difference'].includes(item.blend)) throw new Error('图层混合模式无效');
      for (const [key, min, max] of [['brightness', 0, 200], ['contrast', 0, 200], ['saturate', 0, 200], ['hue', -180, 180], ['grayscale', 0, 100], ['sepia', 0, 100], ['blur', 0, 30]]) {
        if (item.filters?.[key] !== undefined && (!Number.isFinite(item.filters[key]) || item.filters[key] < min || item.filters[key] > max)) throw new Error('滤镜数值超出范围');
      }
      if (item.type === 'raster') {
        const size = pngDimensions(item.bitmap); backingPixels += size.width * size.height;
        if (item.maskBitmap) { const maskSize = pngDimensions(item.maskBitmap); if (maskSize.width !== size.width || maskSize.height !== size.height) throw new Error('蒙版尺寸不匹配'); backingPixels += size.width * size.height; }
        if (backingPixels > MAX_TOTAL_PIXELS) throw new Error('工程图层总像素超过安全上限');
      }
      if (item.type === 'text' && (typeof item.text !== 'string' || item.text.length > 4000)) throw new Error('文字图层数据无效');
      if (item.type === 'text' && (!Number.isFinite(item.fontSize) || item.fontSize < 8 || item.fontSize > 600 || !['400', '700'].includes(item.fontWeight) || !['left', 'center', 'right'].includes(item.textAlign))) throw new Error('文字属性无效');
      if (item.type === 'text' && !['Microsoft YaHei, sans-serif', 'SimSun, serif', 'Arial, sans-serif', 'Georgia, serif', 'monospace'].includes(item.fontFamily)) throw new Error('文字字体无效');
      if ((item.type === 'text' || item.type === 'rect' || item.type === 'ellipse') && !/^#[0-9a-fA-F]{6}$/.test(item.fill || '')) throw new Error('图层颜色无效');
      if (['rect', 'ellipse'].includes(item.type) && (!/^#[0-9a-fA-F]{6}$/.test(item.stroke || '') || !Number.isFinite(item.strokeWidth) || item.strokeWidth < 0 || item.strokeWidth > 100)) throw new Error('形状描边属性无效');
    }
  }
  async function restoreProject(data, resetHistory = true) {
    validateProject(data); restoreBusy = true;
    try {
      const restored = []; let backingPixels = 0;
      for (const source of data.layers) {
        const item = { ...source, filters: { ...DEFAULT_FILTERS(), ...(source.filters || {}) } }; delete item.bitmap; delete item.maskBitmap;
        if (source.type === 'raster') {
          const img = await imageFromUrl(source.bitmap); if (!validRasterSize(img.width, img.height)) throw new Error('图层像素尺寸过大');
          backingPixels += img.width * img.height; if (backingPixels > MAX_TOTAL_PIXELS) throw new Error('工程图层总像素超过安全上限');
          item.canvas = freshCanvas(img.width, img.height); item.canvas.getContext('2d').drawImage(img, 0, 0);
          item.mask = null;
          if (source.maskBitmap) { const mask = await imageFromUrl(source.maskBitmap); if (mask.width !== img.width || mask.height !== img.height) throw new Error('蒙版尺寸不匹配'); backingPixels += mask.width * mask.height; if (backingPixels > MAX_TOTAL_PIXELS) throw new Error('工程图层总像素超过安全上限'); item.mask = freshCanvas(mask.width, mask.height); item.mask.getContext('2d').drawImage(mask, 0, 0); }
        }
        restored.push(item);
      }
      doc = { width: data.width, height: data.height, background: data.background, layers: restored };
      nextId = Math.max(1, ...restored.map(item => Number(item.id) || 0)) + 1; selectedId = restored.at(-1)?.id || null; selection = null; crop = null; $('editMask').checked = false;
      if (resetHistory) { undoStack = []; redoStack = []; undoStack.push(serialize()); }
      refresh(); fitZoom(); status('工程已恢复，可继续编辑。');
    } finally { restoreBusy = false; }
  }
  async function undo() { if (undoStack.length <= 1 || restoreBusy) return; clearTimeout(saveTimer); const current = undoStack.pop(); redoStack.push(current); await restoreProject(undoStack.at(-1), false); updateButtons(); scheduleSave(); status('已撤销'); }
  async function redo() { if (!redoStack.length || restoreBusy) return; clearTimeout(saveTimer); const next = redoStack.pop(); undoStack.push(next); await restoreProject(next, false); updateButtons(); scheduleSave(); status('已重做'); }
  function openDatabase() { return new Promise((resolve, reject) => { if (!window.indexedDB) { reject(new Error('IndexedDB 不可用')); return; } const request = indexedDB.open(DB_NAME, 1); request.onupgradeneeded = () => request.result.createObjectStore('projects'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
  async function putDraft(value) { const db = await openDatabase(); return new Promise((resolve, reject) => { const tx = db.transaction('projects', 'readwrite'); tx.objectStore('projects').put(value, 'draft'); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error); }; }); }
  async function getDraft() { const db = await openDatabase(); return new Promise((resolve, reject) => { const tx = db.transaction('projects', 'readonly'); const req = tx.objectStore('projects').get('draft'); req.onsuccess = () => { db.close(); resolve(req.result); }; req.onerror = () => { db.close(); reject(req.error); }; }); }
  function download(blob, name) { const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000); }
  function fileStem() { return `图片工程-${new Date().toISOString().replaceAll(':', '-').slice(0, 19)}`; }
  function saveProject() { try { const payload = JSON.stringify(serialize()); download(new Blob([payload], { type: 'application/json' }), `${fileStem()}.json`); status(`完整工程已下载（${(payload.length / 1048576).toFixed(1)} MB）。请妥善保存。`); } catch (error) { status(`工程导出失败：${error.message}`); } }
  async function exportImage() {
    const format = $('exportFormat').value, canvas = freshCanvas(doc.width, doc.height), target = canvas.getContext('2d'); drawDocument(target, format === 'jpeg');
    const mime = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png', quality = Number($('quality').value) / 100;
    const blob = await new Promise(resolve => canvas.toBlob(resolve, mime, quality)); if (!blob) { status('图片导出失败，浏览器可能不支持该格式。'); return; }
    download(blob, `${fileStem()}.${format === 'jpeg' ? 'jpg' : format}`); status(`已下载 ${format.toUpperCase()} · ${(blob.size / 1048576).toFixed(1)} MB`);
  }
  function assignDimensions(w, h, background = '#ffffff') { doc = { width: w, height: h, background, layers: [] }; selectedId = null; selection = null; crop = null; undoStack = []; redoStack = []; checkpoint(); refresh(); fitZoom(); }
  async function addImageFile(file, openAsDoc = false) {
    if (!file || file.size > MAX_FILE) throw new Error('单个图片最大 80 MB');
    if (/\.psd$/i.test(file.name) || file.type === 'image/vnd.adobe.photoshop') return importPsd(file, openAsDoc);
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/avif'].includes(file.type)) throw new Error('支持 PNG、JPG、WebP、GIF、BMP、AVIF 或 PSD；不执行 SVG 内容。');
    const url = URL.createObjectURL(file); let img;
    try { img = await imageFromUrl(url); } finally { URL.revokeObjectURL(url); }
    let width = img.naturalWidth, height = img.naturalHeight; if (!width || !height) throw new Error('无法读取图片尺寸');
    const scale = Math.min(1, MAX_SIDE / width, MAX_SIDE / height, Math.sqrt(MAX_PIXELS / (width * height)));
    width = Math.max(16, Math.round(width * scale)); height = Math.max(16, Math.round(height * scale));
    if (openAsDoc) assignDimensions(width, height, 'transparent');
    else if (doc.layers.length >= MAX_LAYERS) throw new Error('图层数量已达上限');
    const item = makeRaster(file.name.replace(/\.[^.]+$/, '').slice(0, 80) || '导入图片', width, height); item.canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    if (!openAsDoc) { const fit = Math.min(1, doc.width / width, doc.height / height); item.width = Math.max(1, Math.round(width * fit)); item.height = Math.max(1, Math.round(height * fit)); item.x = Math.round((doc.width - item.width) / 2); item.y = Math.round((doc.height - item.height) / 2); }
    addLayer(item); if (openAsDoc) fitZoom(); status(scale < 1 ? '图片尺寸过大，已缩小以适应浏览器处理上限。' : '图片已载入本地画布。');
  }
  function walkPsd(nodes, out) { for (const node of [...nodes].reverse()) { if (node.children) walkPsd(node.children, out); else if (node.canvas) out.push(node); } }
  async function importPsd(file, openAsDoc) {
    if (!window.agPsd?.readPsd) throw new Error('PSD 模块未加载');
    const raw = await file.arrayBuffer(); const psd = window.agPsd.readPsd(raw, { skipThumbnail: true });
    if (!validSize(psd.width, psd.height)) throw new Error('PSD 尺寸超过本工具上限');
    if (!openAsDoc && doc.layers.length + (psd.children?.length || 1) > MAX_LAYERS) throw new Error('导入后图层数量将超过上限');
    const nodes = []; walkPsd(psd.children || [], nodes);
    if (!nodes.length && psd.canvas) nodes.push({ canvas: psd.canvas, name: 'PSD 合成图', left: 0, top: 0 });
    if (!nodes.length) throw new Error('该 PSD 没有可读取的位图图层');
    const prepared = []; let newPixels = 0;
    for (const node of nodes) {
      if ((openAsDoc ? prepared.length : doc.layers.length + prepared.length) >= MAX_LAYERS) break;
      const bitmap = node.canvas, item = makeRaster(String(node.name || 'PSD 图层').slice(0, 80), bitmap.width, bitmap.height);
      item.canvas.getContext('2d').drawImage(bitmap, 0, 0); item.x = Number(node.left) || 0; item.y = Number(node.top) || 0;
      item.opacity = clamp(Number.isFinite(node.opacity) ? node.opacity : 1, 0, 1); item.visible = !node.hidden;
      if (!openAsDoc) { const ratio = Math.min(1, doc.width / psd.width, doc.height / psd.height); item.x = Math.round((doc.width - psd.width * ratio) / 2 + item.x * ratio); item.y = Math.round((doc.height - psd.height * ratio) / 2 + item.y * ratio); item.width *= ratio; item.height *= ratio; }
      newPixels += rasterPixels(item); if (newPixels + (openAsDoc ? 0 : totalPixels()) > MAX_TOTAL_PIXELS) throw new Error('PSD 图层总像素超过安全上限'); prepared.push(item);
    }
    if (openAsDoc) assignDimensions(psd.width, psd.height, 'transparent');
    doc.layers.push(...prepared); selectedId = prepared.at(-1)?.id || null;
    checkpoint(); refresh(); if (openAsDoc) fitZoom(); status(`已导入 ${prepared.length} 个 PSD 位图图层。复杂文字与智能对象可能已栅格化，请核对画面。`);
  }
  async function exportPsd() {
    if (!window.agPsd?.writePsd) { status('PSD 模块未加载，无法导出。'); return; }
    try {
      const children = [...doc.layers].reverse().map(item => { const canvas = freshCanvas(doc.width, doc.height); drawLayer(canvas.getContext('2d'), { ...item, blend: 'source-over', opacity: 1 }); return { name: item.name, canvas, left: 0, top: 0, right: doc.width, bottom: doc.height, hidden: !item.visible, opacity: item.opacity }; });
      const buffer = window.agPsd.writePsd({ width: doc.width, height: doc.height, children });
      download(new Blob([buffer], { type: 'image/vnd.adobe.photoshop' }), `${fileStem()}.psd`);
      status('PSD 已导出。文字、形状、蒙版及调色按位图图层保存，请保留 JSON 完整工程供继续编辑。');
    } catch (error) { status(`PSD 导出失败：${error.message}`); }
  }
  function point(event) { const box = overlay.getBoundingClientRect(); return { x: clamp((event.clientX - box.left) * doc.width / box.width, 0, doc.width), y: clamp((event.clientY - box.top) * doc.height / box.height, 0, doc.height) }; }
  function handlePoints(item) { return [{ name: 'nw', x: item.x, y: item.y }, { name: 'ne', x: item.x + item.width, y: item.y }, { name: 'sw', x: item.x, y: item.y + item.height }, { name: 'se', x: item.x + item.width, y: item.y + item.height }]; }
  function hitHandle(item, p) { if (!item || item.rotation || item.locked || !item.visible) return null; const radius = 11 / zoom; return handlePoints(item).find(handle => Math.abs(handle.x - p.x) <= radius && Math.abs(handle.y - p.y) <= radius) || null; }
  function pickLayer(p) { for (const item of [...doc.layers].reverse()) if (item.visible && !item.locked && p.x >= item.x && p.x <= item.x + item.width && p.y >= item.y && p.y <= item.y + item.height) return item; return null; }
  function paintPoint(item, p) { return { x: (p.x - item.x) * item.canvas.width / item.width, y: (p.y - item.y) * item.canvas.height / item.height }; }
  function paintSegment(item, from, to) {
    const editingMask = Boolean(item.mask && $('editMask').checked); const canvas = editingMask ? item.mask : item.canvas; const brush = canvas.getContext('2d');
    const start = paintPoint(item, from), end = paintPoint(item, to), size = Number($('brushSize').value) * canvas.width / item.width;
    brush.save(); if (selection) { brush.beginPath(); brush.rect((selection.x - item.x) * canvas.width / item.width, (selection.y - item.y) * canvas.height / item.height, selection.width * canvas.width / item.width, selection.height * canvas.height / item.height); brush.clip(); }
    brush.lineWidth = size; brush.lineCap = 'round'; brush.lineJoin = 'round'; brush.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over'; brush.strokeStyle = editingMask ? '#ffffff' : $('paintColor').value;
    brush.beginPath(); brush.moveTo(start.x, start.y); brush.lineTo(end.x + .01, end.y + .01); brush.stroke(); brush.restore(); render();
  }
  function setTool(name) { tool = name; document.querySelectorAll('.tool').forEach(button => button.classList.toggle('active', button.dataset.tool === name)); overlay.style.cursor = name === 'move' ? 'default' : name === 'hand' ? 'grab' : name === 'text' ? 'text' : name === 'eyedropper' ? 'crosshair' : 'crosshair'; status(`${document.querySelector(`.tool[data-tool="${name}"]`)?.querySelector('span')?.textContent || name}工具已选择`); }
  function addText(p) { const item = { id: nextId++, type: 'text', name: '文字', x: Math.round(p.x), y: Math.round(p.y), width: Math.min(520, doc.width - p.x), height: 180, rotation: 0, opacity: 1, blend: 'source-over', visible: true, locked: false, filters: DEFAULT_FILTERS(), text: '在右侧编辑文字', fontSize: 56, fontWeight: '700', fontFamily: 'Microsoft YaHei, sans-serif', textAlign: 'left', fill: $('paintColor').value }; if (item.width < 50) item.width = 200; if (addLayer(item)) { setTool('move'); $('textContent').focus(); $('textContent').select(); } }
  function fillCurrent() { const item = layer(); if (!item || item.type !== 'raster' || item.locked) { status('请先选择未锁定的像素图层。'); return; } if (item.rotation) { status('旋转图层请先归零后再填充。'); return; } const brush = item.canvas.getContext('2d'), box = selection || { x: item.x, y: item.y, width: item.width, height: item.height }; brush.save(); brush.fillStyle = $('paintColor').value; brush.fillRect((box.x - item.x) * item.canvas.width / item.width, (box.y - item.y) * item.canvas.height / item.height, box.width * item.canvas.width / item.width, box.height * item.canvas.height / item.height); brush.restore(); render(); checkpoint(); status(selection ? '已填充选区。' : '已填充当前像素图层。'); }
  function copySelection() { const item = layer(); if (!item || !selection) return; const canvas = freshCanvas(doc.width, doc.height), target = canvas.getContext('2d'); target.save(); target.beginPath(); target.rect(selection.x, selection.y, selection.width, selection.height); target.clip(); drawLayer(target, item); target.restore(); const added = makeRaster(`${item.name} · 选区副本`); added.canvas = canvas; addLayer(added); status('选区已复制到新图层。'); }
  function clearSelection() { const item = layer(); if (!item || !selection || item.type !== 'raster' || item.locked) return; if (item.rotation) { status('旋转图层请先归零后再清除选区。'); return; } item.canvas.getContext('2d').clearRect((selection.x - item.x) * item.canvas.width / item.width, (selection.y - item.y) * item.canvas.height / item.height, selection.width * item.canvas.width / item.width, selection.height * item.canvas.height / item.height); render(); checkpoint(); status('已清除当前像素图层的选区内容。'); }
  function cropDocument() { if (!crop || crop.width < 16 || crop.height < 16) { status('裁剪区域太小。'); return; } for (const item of doc.layers) { item.x -= crop.x; item.y -= crop.y; } doc.width = crop.width; doc.height = crop.height; crop = null; selection = null; refresh(); checkpoint(); fitZoom(); status('画布已裁剪。'); }
  function handlePointerDown(event) {
    if (event.button !== 0) return; const p = point(event); overlay.setPointerCapture(event.pointerId); overlay.focus({ preventScroll: true });
    if (tool === 'eyedropper') { const data = ctx.getImageData(Math.min(doc.width - 1, Math.floor(p.x)), Math.min(doc.height - 1, Math.floor(p.y)), 1, 1).data; $('paintColor').value = `#${[data[0], data[1], data[2]].map(n => n.toString(16).padStart(2, '0')).join('')}`; status('已拾取颜色'); return; }
    if (tool === 'text') { addText(p); return; }
    if (tool === 'fill') { fillCurrent(); return; }
    if (tool === 'hand' || useHand) { gesture = { tool: 'hand', pointer: event.pointerId, x: event.clientX, y: event.clientY, scrollLeft: viewport.scrollLeft, scrollTop: viewport.scrollTop }; return; }
    if (tool === 'move') { const current = layer(), handle = hitHandle(current, p); if (handle) { const opposite = handlePoints(current).find(entry => entry.name === ({ nw: 'se', ne: 'sw', sw: 'ne', se: 'nw' })[handle.name]); gesture = { tool: 'resize', pointer: event.pointerId, handle: handle.name, opposite, width: current.width, height: current.height, moved: false }; return; } const hit = pickLayer(p); if (hit) { selectedId = hit.id; drawLayers(); syncProperties(); updateButtons(); gesture = { tool: 'move', pointer: event.pointerId, start: p, x: hit.x, y: hit.y, moved: false }; drawGuides(); } return; }
    if (tool === 'brush' || tool === 'eraser') { const item = layer(); if (!item || item.type !== 'raster' || item.locked || !item.visible) { status('请先选择可见、未锁定的像素图层。'); return; } if (item.rotation) { status('旋转的像素图层暂不能直接画笔编辑，请先将旋转设为 0°。'); return; } gesture = { tool, pointer: event.pointerId, last: p }; paintSegment(item, p, p); return; }
    gesture = { tool, pointer: event.pointerId, start: p, preview: { x: p.x, y: p.y, width: 0, height: 0 } };
  }
  function handlePointerMove(event) {
    if (!gesture || gesture.pointer !== event.pointerId) { if (tool === 'move') { const handle = hitHandle(layer(), point(event)); overlay.style.cursor = handle ? (handle.name === 'nw' || handle.name === 'se' ? 'nwse-resize' : 'nesw-resize') : 'default'; } return; }
    if (gesture.tool === 'hand') { viewport.scrollLeft = gesture.scrollLeft - (event.clientX - gesture.x); viewport.scrollTop = gesture.scrollTop - (event.clientY - gesture.y); return; }
    const p = point(event);
    if (gesture.tool === 'resize') { const item = layer(); if (!item) return; let current = p; if (event.shiftKey) { const ratio = gesture.width / gesture.height; let dx = Math.abs(p.x - gesture.opposite.x), dy = Math.abs(p.y - gesture.opposite.y); if (dy === 0 || dx / dy > ratio) dy = dx / ratio; else dx = dy * ratio; current = { x: gesture.opposite.x + dx * (gesture.handle.includes('w') ? -1 : 1), y: gesture.opposite.y + dy * (gesture.handle.includes('n') ? -1 : 1) }; } const box = rectFromPoints(gesture.opposite, current); if (box.width >= 10 && box.height >= 10) { Object.assign(item, box); gesture.moved = true; syncProperties(); render(); } return; }
    if (gesture.tool === 'move') { const item = layer(); if (!item) return; item.x = Math.round(gesture.x + p.x - gesture.start.x); item.y = Math.round(gesture.y + p.y - gesture.start.y); gesture.moved = true; syncProperties(); render(); return; }
    if (gesture.tool === 'brush' || gesture.tool === 'eraser') { paintSegment(layer(), gesture.last, p); gesture.last = p; return; }
    gesture.preview = rectFromPoints(gesture.start, p);
    if (gesture.tool === 'select') selection = gesture.preview; if (gesture.tool === 'crop') crop = gesture.preview;
    drawGuides(); updateButtons();
  }
  function handlePointerUp(event) {
    if (!gesture || gesture.pointer !== event.pointerId) return;
    if (gesture.tool === 'rect' || gesture.tool === 'ellipse') { const box = gesture.preview; if (box.width >= 3 && box.height >= 3) addLayer(makeShape(gesture.tool, box)); }
    else if ((gesture.tool === 'move' || gesture.tool === 'resize') && gesture.moved || gesture.tool === 'brush' || gesture.tool === 'eraser') checkpoint();
    gesture = null; drawGuides(); updateButtons();
  }
  function duplicateLayer() { const item = layer(); if (!item) return; if (doc.layers.length >= MAX_LAYERS || totalPixels() + rasterPixels(item) > MAX_TOTAL_PIXELS) { status('图层数量或总像素已达安全上限。'); return; } const copy = { ...item, id: nextId++, name: `${item.name} 副本`, filters: { ...item.filters } }; if (item.type === 'raster') { copy.canvas = freshCanvas(item.canvas.width, item.canvas.height); copy.canvas.getContext('2d').drawImage(item.canvas, 0, 0); if (item.mask) { copy.mask = freshCanvas(item.mask.width, item.mask.height); copy.mask.getContext('2d').drawImage(item.mask, 0, 0); } } const idx = doc.layers.indexOf(item); doc.layers.splice(idx + 1, 0, copy); selectedId = copy.id; refresh(); checkpoint(); }
  function mergeDown() { const idx = doc.layers.findIndex(item => item.id === selectedId); if (idx <= 0) return; const top = doc.layers[idx], bottom = doc.layers[idx - 1], canvas = freshCanvas(doc.width, doc.height), target = canvas.getContext('2d'); drawLayer(target, bottom); drawLayer(target, top); const merged = makeRaster(`${bottom.name} + ${top.name}`); merged.canvas = canvas; doc.layers.splice(idx - 1, 2, merged); selectedId = merged.id; refresh(); checkpoint(); status('两层已合并。可撤销恢复。'); }
  function addMask() { const item = layer(); if (!item || item.type !== 'raster' || item.mask) return; if (totalPixels() + item.canvas.width * item.canvas.height > MAX_TOTAL_PIXELS) { status('蒙版会超过安全像素上限，请先缩小或合并图层。'); return; } item.mask = freshCanvas(item.canvas.width, item.canvas.height); const brush = item.mask.getContext('2d'); brush.fillStyle = '#ffffff'; brush.fillRect(0, 0, item.mask.width, item.mask.height); item.maskEnabled = true; refresh(); checkpoint(); status('蒙版已添加。勾选“用画笔编辑蒙版”开始局部显隐。'); }
  function setProperty(id, key, parse = value => value) { $(id).addEventListener('change', () => { const item = layer(); if (!item) return; item[key] = parse($(id).value); refresh(); checkpoint(); }); }
  function propertyHandlers() {
    setProperty('layerName', 'name', value => value.slice(0, 80) || '未命名图层');
    for (const [id, key] of [['layerX', 'x'], ['layerY', 'y'], ['layerW', 'width'], ['layerH', 'height']]) setProperty(id, key, value => key === 'width' || key === 'height' ? clamp(Math.round(Number(value) || 1), 1, 10000) : clamp(Math.round(Number(value) || 0), -10000, 10000));
    setProperty('layerBlend', 'blend');
    for (const [id, key, calc, out] of [['layerRotation', 'rotation', v => Number(v), 'rotationValue'], ['layerOpacity', 'opacity', v => Number(v) / 100, 'opacityValue']]) { $(id).addEventListener('input', () => { const item = layer(); if (!item) return; item[key] = calc($(id).value); $(out).textContent = `${$(id).value}${key === 'rotation' ? '°' : '%'}`; render(); }); $(id).addEventListener('change', () => { drawLayers(); checkpoint(); }); }
    setProperty('textContent', 'text'); setProperty('fontSize', 'fontSize', v => clamp(Number(v) || 56, 8, 600)); setProperty('fontWeight', 'fontWeight'); setProperty('fontFamily', 'fontFamily'); setProperty('textAlign', 'textAlign'); setProperty('textColor', 'fill');
    $('shapeFill').addEventListener('change', () => { const item = layer(); if (item) { item.fill = $('shapeFill').value; render(); checkpoint(); } });
    setProperty('shapeStroke', 'stroke'); setProperty('shapeStrokeWidth', 'strokeWidth', v => clamp(Number(v) || 0, 0, 100));
    $('maskEnabled').addEventListener('change', () => { const item = layer(); if (item?.mask) { item.maskEnabled = $('maskEnabled').checked; render(); checkpoint(); } });
    $('removeMask').onclick = () => { const item = layer(); if (!item?.mask || !confirm('移除蒙版？隐藏部分会重新显示。')) return; item.mask = null; $('editMask').checked = false; refresh(); checkpoint(); };
    for (const key of ['Brightness', 'Contrast', 'Saturate', 'Hue', 'Grayscale', 'Sepia', 'Blur']) { const input = $(`adj${key}`); input.addEventListener('input', () => { const item = layer(); if (!item) return; item.filters[key.toLowerCase()] = Number(input.value); input.nextElementSibling.textContent = `${input.value}${key === 'Blur' ? ' px' : key === 'Hue' ? '°' : '%'}`; render(); }); input.addEventListener('change', checkpoint); }
    $('resetAdjustments').onclick = () => { const item = layer(); if (!item) return; item.filters = DEFAULT_FILTERS(); refresh(); checkpoint(); };
  }
  function setup() {
    document.querySelectorAll('[data-tool]').forEach(button => button.onclick = () => setTool(button.dataset.tool));
    overlay.addEventListener('pointerdown', handlePointerDown); overlay.addEventListener('pointermove', handlePointerMove); overlay.addEventListener('pointerup', handlePointerUp); overlay.addEventListener('pointercancel', handlePointerUp);
    $('brushSize').oninput = () => $('brushSizeValue').textContent = `${$('brushSize').value} px`;
    $('quality').oninput = () => $('qualityValue').textContent = `${$('quality').value}%`;
    $('undo').onclick = () => undo().catch(error => status(error.message)); $('redo').onclick = () => redo().catch(error => status(error.message));
    $('zoomRange').oninput = () => setZoom(Number($('zoomRange').value) / 100); $('zoomIn').onclick = () => setZoom(zoom * 1.25); $('zoomOut').onclick = () => setZoom(zoom / 1.25); $('zoomFit').onclick = fitZoom;
    $('saveProject').onclick = saveProject; $('exportImage').onclick = () => exportImage().catch(error => status(error.message)); $('exportPsd').onclick = () => exportPsd().catch(error => status(error.message));
    $('openImage').onclick = () => { imageMode = 'open'; $('imageInput').click(); };
    $('addImage').onclick = () => { imageMode = 'add'; $('imageInput').click(); };
    $('imageInput').onchange = async event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; if (imageMode === 'open' && doc.layers.length && !confirm('打开图片会替换当前画布。请确认已经下载完整工程备份。继续？')) return; try { await addImageFile(file, imageMode === 'open'); } catch (error) { status(`打开失败：${error.message}`); } };
    $('openProject').onclick = () => $('projectInput').click();
    $('projectInput').onchange = async event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; if (file.size > MAX_FILE) { status('工程文件超过 80 MB，本工具暂不支持。'); return; } if (doc.layers.length && !confirm('恢复工程会替换当前画布。请先导出备份。继续？')) return; try { await restoreProject(JSON.parse(await file.text())); checkpoint(); status('完整工程已恢复。'); } catch (error) { status(`工程恢复失败：${error.message}`); } };
    $('newDoc').onclick = () => $('newDialog').showModal();
    $('newDialog').addEventListener('close', () => { if ($('newDialog').returnValue !== 'create') return; const w = Number($('newWidth').value), h = Number($('newHeight').value); if (!validSize(w, h)) { status('画布尺寸需在 16–5000 px 且总像素不超过 1600 万。'); return; } if (doc.layers.length && !confirm('新建画布会替换当前工程。请先导出备份。继续？')) return; assignDimensions(w, h, $('newBackground').value); addLayer(makeRaster('像素图层 1')); status('新画布已创建，可直接使用画笔。'); });
    $('addRaster').onclick = () => { addLayer(makeRaster()); status('像素图层已添加。'); };
    $('addMask').onclick = addMask; $('copySelection').onclick = copySelection; $('clearSelection').onclick = clearSelection; $('deselect').onclick = () => { selection = null; drawGuides(); updateButtons(); }; $('applyCrop').onclick = cropDocument;
    $('duplicateLayer').onclick = duplicateLayer; $('mergeLayer').onclick = mergeDown;
    $('deleteLayer').onclick = () => { const idx = doc.layers.findIndex(item => item.id === selectedId); if (idx < 0) return; doc.layers.splice(idx, 1); selectedId = doc.layers.at(-1)?.id || null; refresh(); checkpoint(); status('图层已删除，可撤销。'); };
    $('moveLayerUp').onclick = () => { const idx = doc.layers.findIndex(item => item.id === selectedId); if (idx < 0 || idx === doc.layers.length - 1) return; [doc.layers[idx], doc.layers[idx + 1]] = [doc.layers[idx + 1], doc.layers[idx]]; refresh(); checkpoint(); };
    $('moveLayerDown').onclick = () => { const idx = doc.layers.findIndex(item => item.id === selectedId); if (idx <= 0) return; [doc.layers[idx], doc.layers[idx - 1]] = [doc.layers[idx - 1], doc.layers[idx]]; refresh(); checkpoint(); };
    propertyHandlers();
    document.addEventListener('keydown', event => {
      const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
      if (event.code === 'Space' && !editing) { event.preventDefault(); useHand = true; overlay.style.cursor = 'grab'; return; }
      if ((event.ctrlKey || event.metaKey) && !editing) { const key = event.key.toLowerCase(); if (key === 'z') { event.preventDefault(); (event.shiftKey ? redo() : undo()).catch(error => status(error.message)); } if (key === 'y') { event.preventDefault(); redo().catch(error => status(error.message)); } if (key === 's') { event.preventDefault(); saveProject(); } if (key === 'd') { event.preventDefault(); selection = null; drawGuides(); updateButtons(); } return; }
      if (editing || event.altKey || event.ctrlKey || event.metaKey) return;
      const shortcuts = { v: 'move', m: 'select', c: 'crop', b: 'brush', e: 'eraser', g: 'fill', t: 'text', r: 'rect', o: 'ellipse', i: 'eyedropper', h: 'hand' }; const next = shortcuts[event.key.toLowerCase()]; if (next) setTool(next);
      if ((event.key === 'Delete' || event.key === 'Backspace') && selection) { event.preventDefault(); clearSelection(); }
    });
    document.addEventListener('keyup', event => { if (event.code === 'Space') { useHand = false; setTool(tool); } });
    viewport.addEventListener('dragover', event => { event.preventDefault(); }); viewport.addEventListener('drop', async event => { event.preventDefault(); const file = event.dataTransfer?.files?.[0]; if (file) try { await addImageFile(file, false); } catch (error) { status(error.message); } });
    document.addEventListener('paste', async event => { if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return; const file = [...(event.clipboardData?.files || [])].find(item => item.type.startsWith('image/')); if (file) { event.preventDefault(); try { await addImageFile(file, false); } catch (error) { status(error.message); } } });
    $('restoreDraft').onclick = async () => { $('draftPrompt').hidden = true; try { await restoreProject(draftValue); status('已恢复此浏览器的自动草稿。'); } catch (error) { status(`草稿恢复失败：${error.message}`); } };
    $('dismissDraft').onclick = () => { $('draftPrompt').hidden = true; draftValue = null; };
    window.addEventListener('resize', () => { if (autoFit) fitZoom(); });
    undoStack.push(serialize()); refresh(); requestAnimationFrame(fitZoom);
    getDraft().then(value => { if (value?.kind === 'yanjian-image-project') { draftValue = value; $('draftPrompt').hidden = false; } }).catch(() => status('此浏览器无法自动保存草稿，请手动导出工程。'));
  }
  setup();
})();
