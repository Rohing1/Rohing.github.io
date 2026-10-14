import { KINDS, MAX_OVERLAYS, normalizeOverlay, validBackup, formatClock, drawOutput } from 'redact-model.js';

const KEY = 'yj-video-redact-v1';
const $ = id => document.getElementById(id);
const video = $('source-video'), canvas = $('canvas'), ctx = canvas.getContext('2d');
const scratch = document.createElement('canvas');
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const names = { cover: '实心遮挡', blur: '模糊', mosaic: '马赛克', box: '强调框', arrow: '箭头', text: '文字标注' };
let sourceFile=null;let overlays = [], selectedId = null, selectedKind = 'cover', videoUrl = null;
let dragging = null, exporting = false, recorder = null, cancelled = false;
let audioContext = null, audioSource = null, audioDestination = null, monitorGain = null;

function message(text, error = false, target = 'status') {
  $(target).textContent = text;
  $(target).className = `media-status${error ? ' error' : ''}`;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ app: 'yj-video-redact', version: 1, overlays }));
    message('区域配置已自动保存在此浏览器；视频仍需重新选择，请定期导出区域备份。');
  } catch { message('区域配置保存失败，请立即导出备份。', true); }
}

function button(label, action) {
  const element = document.createElement('button'); element.type = 'button'; element.textContent = label;
  element.addEventListener('click', action); return element;
}

function videoReady() { return video.readyState >= 2 && Number.isFinite(video.duration) && video.duration > 0; }
function canExport() { return videoReady() && ($('save-mode').value === 'file' || video.duration <= 1200); }
function refreshExportAvailability() { $('export').disabled = exporting || !canExport(); }

function paint(preview = true) {
  if (!videoReady()) return;
  drawOutput(ctx, video, overlays, video.currentTime, scratch);
  if (preview && selectedId && !exporting) {
    const item = overlays.find(row => row.id === selectedId);
    if (item && video.currentTime >= item.start && video.currentTime < item.end) {
      ctx.save(); ctx.strokeStyle = '#54e0d0'; ctx.lineWidth = Math.max(2, canvas.width * .003);
      ctx.setLineDash([10, 7]); ctx.strokeRect(item.x * canvas.width, item.y * canvas.height, item.w * canvas.width, item.h * canvas.height);
      ctx.restore();
    }
  }
  if (dragging && preview) {
    ctx.save(); ctx.strokeStyle = '#64f1dd'; ctx.lineWidth = 3; ctx.setLineDash([8, 5]);
    ctx.strokeRect(dragging.x * canvas.width, dragging.y * canvas.height, dragging.w * canvas.width, dragging.h * canvas.height);
    ctx.restore();
  }
}

function paintLoop() {
  if (video.paused || video.ended) return;
  paint(!exporting);
  if ('requestVideoFrameCallback' in video) video.requestVideoFrameCallback(paintLoop);
  else requestAnimationFrame(paintLoop);
}

function updateClock() {
  const time = video.currentTime || 0, duration = video.duration || 0;
  $('clock').textContent = formatClock(time);
  $('live-time').textContent = `${formatClock(time)} / ${formatClock(duration)}`;
  $('seek').value = duration > 0 ? Math.round(time / duration * 1000) : 0;
  if (exporting) {
    $('progress').value = Math.min(100, duration > 0 ? time / duration * 100 : 0);
    message(`正在本地处理 ${Math.round($('progress').value)}% · 请保持页面在前台`, false, 'export-status');
  }
}

function renderList() {
  $('overlay-count').textContent = `${overlays.length} 个`;
  const list = $('overlays'); list.replaceChildren();
  if (!overlays.length) {
    const empty = document.createElement('div'); empty.className = 'media-empty';
    empty.textContent = '还没有区域。选择工具并在预览画面拖拽。'; list.append(empty);
  }
  for (const item of overlays) {
    const row = document.createElement('div'); row.className = `media-item redact-item${item.id === selectedId ? ' active' : ''}`;
    const head = document.createElement('div'); head.className = 'media-item-head';
    const title = document.createElement('strong'); title.textContent = `${names[item.kind]} · ${formatClock(item.start)}–${formatClock(item.end)}`;
    const actions = document.createElement('div'); actions.className = 'media-item-actions';
    actions.append(button('选中', () => select(item.id)), button('删除', () => remove(item.id)));
    head.append(title, actions); row.append(head);
    if (item.text) { const p = document.createElement('p'); p.textContent = item.text; row.append(p); }
    list.append(row);
  }
  const selected = overlays.find(item => item.id === selectedId);
  $('inspector').hidden = !selected;
  if (selected) {
    for (const key of ['start', 'end']) $(`edit-${key}`).value = selected[key].toFixed(1);
    for (const key of ['x', 'y', 'w', 'h']) $(`edit-${key}`).value = (selected[key] * 100).toFixed(1);
    $('edit-text').value = selected.text;
    $('edit-text').disabled = selected.kind !== 'text';
  }
  paint();
}

function select(id) {
  selectedId = id; renderList();
  const item = overlays.find(row => row.id === id);
  if (item && videoReady()) { video.currentTime = Math.min(item.start, video.duration - .01); }
}

function remove(id) {
  if (exporting || !confirm('删除这个区域？')) return;
  overlays = overlays.filter(row => row.id !== id);
  if (selectedId === id) selectedId = null;
  save(); renderList();
}

function download(name, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function pointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
}

canvas.addEventListener('pointerdown', event => {
  if (!videoReady() || exporting) return;
  event.preventDefault(); canvas.setPointerCapture(event.pointerId);
  const point = pointerPosition(event);
  dragging = { origin: point, x: point.x, y: point.y, w: 0, h: 0 };
});
canvas.addEventListener('pointermove', event => {
  if (!dragging || exporting) return;
  const point = pointerPosition(event), origin = dragging.origin;
  dragging.x = Math.min(origin.x, point.x); dragging.y = Math.min(origin.y, point.y);
  dragging.w = Math.abs(point.x - origin.x); dragging.h = Math.abs(point.y - origin.y);
  paint();
});
canvas.addEventListener('pointerup', event => {
  if (!dragging || exporting) return;
  const point = pointerPosition(event), origin = dragging.origin;
  const rect = { x: Math.min(origin.x, point.x), y: Math.min(origin.y, point.y), w: Math.abs(point.x - origin.x), h: Math.abs(point.y - origin.y) };
  dragging = null;
  if (rect.w < .02 || rect.h < .025) { paint(); message('区域太小，请拖出更大的范围。', true); return; }
  try {
    if (overlays.length >= MAX_OVERLAYS) throw Error(`最多添加 ${MAX_OVERLAYS} 个区域`);
    const start = Number($('new-start').value), end = Number($('new-end').value);
    if (!$('new-start').value.trim() || !$('new-end').value.trim() || end > video.duration + .1) throw Error('请填写视频长度内的开始和结束时间');
    const item = normalizeOverlay({ id: uid(), kind: selectedKind, start, end, ...rect, text: $('new-text').value });
    overlays.push(item); selectedId = item.id; save(); renderList(); message(`已添加${names[item.kind]}；请播放视频检查整个时间段。`);
  } catch (error) { paint(); message(error.message, true); }
});
canvas.addEventListener('pointercancel', () => { dragging = null; paint(); });

for (const item of $('tools').querySelectorAll('[data-kind]')) item.addEventListener('click', () => {
  selectedKind = item.dataset.kind;
  for (const button of $('tools').querySelectorAll('[data-kind]')) button.classList.toggle('active', button === item);
});
$('set-current').addEventListener('click', () => {
  const time = video.currentTime || 0; $('new-start').value = time.toFixed(1);
  $('new-end').value = (videoReady() ? Math.min(time + 5, video.duration) : time + 5).toFixed(1);
});
$('full-duration').addEventListener('click', () => {
  if (!videoReady()) { message('请先选择视频。', true); return; }
  $('new-start').value = '0'; $('new-end').value = video.duration.toFixed(1);
});
$('save-overlay').addEventListener('click', () => {
  if (exporting) return;
  const index = overlays.findIndex(item => item.id === selectedId); if (index < 0) return;
  const original = overlays[index];
  try {
    const fields = ['start', 'end', 'x', 'y', 'w', 'h'];
    if (fields.some(key => !$(`edit-${key}`).value.trim())) throw Error('请填完时间和位置');
    const next = normalizeOverlay({ ...original,
      start: Number($('edit-start').value), end: Number($('edit-end').value),
      x: Number($('edit-x').value) / 100, y: Number($('edit-y').value) / 100,
      w: Number($('edit-w').value) / 100, h: Number($('edit-h').value) / 100,
      text: $('edit-text').value });
    if (videoReady() && next.end > video.duration + .1) throw Error('结束时间超出当前视频');
    overlays[index] = next; save(); renderList(); message('区域已更新；请在对应时间段重新预览。');
  } catch (error) { message(error.message, true); }
});
$('delete-overlay').addEventListener('click', () => { if (selectedId) remove(selectedId); });

$('video-file').addEventListener('change', event => {
  const file = event.target.files?.[0]; if (!file) return;
  if (!file.type.startsWith('video/') && !/\.(mp4|webm|mov)$/i.test(file.name)) { message('请选择视频文件。', true); return; }
  if (exporting) return;
  video.pause(); if (videoUrl) URL.revokeObjectURL(videoUrl);
  sourceFile=file;videoUrl = URL.createObjectURL(file); video.src = videoUrl; video.load();
  $('video-info').textContent = `${file.name} · ${(file.size / 1048576).toFixed(1)} MB · 不上传`;
  event.target.value = '';
});
video.addEventListener('loadedmetadata', () => {
  if (!Number.isFinite(video.duration)) {
    message('无法获取视频时长；请换用可在浏览器播放的本地视频。', true);
  } else {
    $('new-end').value = Math.min(5, video.duration).toFixed(1);
    if (video.duration > 1200) message('这是长视频，请使用“直接保存到本地文件”；处理按实际播放时长进行。');
  }
  refreshExportAvailability();
  const scale = Math.min(1, 1280 / video.videoWidth, 720 / video.videoHeight);
  canvas.width = Math.max(2, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(2, Math.round(video.videoHeight * scale));
  $('stage').style.aspectRatio = `${canvas.width} / ${canvas.height}`;
  $('stage').classList.add('ready');
  $('seek').disabled = false; $('play').disabled = false;
  if (overlays.some(item => item.end > video.duration + .1)) {
    message('已有区域的结束时间超出当前视频。请确认是否选错源文件，并逐一检查区域。', true);
  }
  updateClock();
});
video.addEventListener('loadeddata', () => paint());
video.addEventListener('seeked', () => { updateClock(); paint(); });
video.addEventListener('timeupdate', updateClock);
video.addEventListener('play', () => { $('play').textContent = '暂停'; paintLoop(); });
video.addEventListener('pause', () => { $('play').textContent = '播放'; paint(); });
video.addEventListener('ended', () => { $('play').textContent = '播放'; paint(); });
video.addEventListener('error', () => message('浏览器无法解码此视频。请换用受支持的 MP4 / WebM。', true));
$('play').addEventListener('click', async () => {
  if (!videoReady() || exporting) return;
  try { if (video.paused) await video.play(); else video.pause(); }
  catch { message('浏览器无法播放此视频。', true); }
});
$('seek').addEventListener('input', event => {
  if (!videoReady() || exporting) return;
  video.currentTime = Number(event.target.value) / 1000 * video.duration;
});

$('backup').addEventListener('click', () => download('%e7%94%bb%e9%9d%a2%e8%84%b1%e6%95%8f-%e5%8c%ba%e5%9f%9f%e5%a4%87%e4%bb%bd.json.html', new Blob([JSON.stringify({ app: 'yj-video-redact', version: 1, exportedAt: new Date().toISOString(), overlays }, null, 2)], { type: 'application/json' })));
$('restore').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    if (file.size > 300_000) throw Error('区域备份不能超过 300 KB');
    const loaded = validBackup(JSON.parse(await file.text()));
    if (!confirm('恢复会替换当前区域配置；视频文件需重新选择。是否继续？')) return;
    overlays = loaded.map(item => ({ ...item, id: item.id || uid() })); selectedId = null;
    save(); renderList(); message('区域配置已恢复；请载入原视频逐段检查位置。');
  } catch (error) { message(error.message, true); }
  finally { event.target.value = ''; }
});

function recorderType() {
  for (const type of ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4']) {
    if (MediaRecorder.isTypeSupported(type)) return { type, extension: type.includes('mp4') ? 'mp4' : 'webm' };
  }
  throw Error('此浏览器不支持录制处理后的视频。建议使用桌面版 Chrome / Edge。');
}

async function audioTracks() {
  if (!audioContext) {
    audioContext = new AudioContext();
    audioSource = audioContext.createMediaElementSource(video);
    audioDestination = audioContext.createMediaStreamDestination();
    monitorGain = audioContext.createGain(); monitorGain.gain.value = 1;
    audioSource.connect(audioDestination); audioSource.connect(monitorGain); monitorGain.connect(audioContext.destination);
  }
  await audioContext.resume();
  monitorGain.gain.value = 0;
  return audioDestination.stream.getAudioTracks();
}

function setBusy(busy) {
  exporting = busy; refreshExportAvailability();
  $('cancel').hidden = !busy; $('play').disabled = busy || !videoReady(); $('seek').disabled = busy || !videoReady();
  $('progress').hidden = !busy;
  $('video-file').disabled = busy;
}

$('cancel').addEventListener('click', () => {
  cancelled = true; video.pause();
  if (recorder?.state === 'recording') recorder.stop();
  message('正在取消并清理临时输出…', false, 'export-status');
});

$('export').addEventListener('click', async () => {
  if (!videoReady() || exporting) return;
  let writable = null, stream = null;
  let writeQueue = Promise.resolve(), writeError = null, chunks = [], total = 0;
  cancelled = false;
  try {
    if (!canExport()) throw Error('超过 20 分钟的视频请切换为“直接保存到本地文件”。');
    if (!canvas.captureStream || !window.MediaRecorder) throw Error('此浏览器不支持画面导出；建议使用桌面版 Chrome / Edge。');
    if (document.visibilityState !== 'visible') throw Error('请先切回此页面再开始导出。');
    const { type, extension } = recorderType();
    if ($('save-mode').value === 'file') {
      if (!window.showSaveFilePicker) throw Error('此浏览器不支持直接写入本地文件；请选择“完成后下载”。');
      const handle = await window.showSaveFilePicker({ suggestedName: `已脱敏视频.${extension}`, types: [{ description: '处理后的视频', accept: { [type.split(';')[0]]: [`.${extension}`] } }] });
      writable = await handle.createWritable();
    }
    video.pause();
    if (video.currentTime > .05) {
      const seeked = new Promise(resolve => video.addEventListener('seeked', resolve, { once: true }));
      video.currentTime = 0; await seeked;
    }
    setBusy(true); paint(false);
    const canvasStream = canvas.captureStream(24);
    const tracks = await audioTracks();
    stream = new MediaStream([...canvasStream.getVideoTracks(), ...tracks]);
    recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 3_000_000, audioBitsPerSecond: 128_000 });
    const stopped = new Promise((resolve, reject) => {
      recorder.onstop = resolve;
      recorder.onerror = event => reject(event.error || Error('视频编码失败'));
    });
    recorder.ondataavailable = event => {
      if (!event.data?.size || cancelled) return;
      total += event.data.size;
      if (writable) {
        writeQueue = writeQueue.then(() => writable.write(event.data)).catch(error => {
          writeError = error;
          if (recorder?.state === 'recording') recorder.stop();
        });
      } else {
        chunks.push(event.data);
        if (total > 160 * 1048576) {
          writeError = Error('下载模式超过 160 MB；请使用直接保存到本地文件。');
          if (recorder?.state === 'recording') recorder.stop();
        }
      }
    };
    const onEnded = () => { if (recorder?.state === 'recording') recorder.stop(); };
    video.addEventListener('ended', onEnded, { once: true });
    recorder.start(1000);
    try { await video.play(); }
    catch (error) { recorder.stop(); throw error; }
    await stopped;
    video.removeEventListener('ended', onEnded);
    await writeQueue;
    if (cancelled) throw Error('处理已取消，未保留临时结果。');
    if (writeError) throw writeError;
    if (writable) { await writable.close(); writable = null; }
    else {
      if (!chunks.length) throw Error('浏览器没有生成视频数据');
      download(`已脱敏视频.${extension}`, new Blob(chunks, { type }));
    }
    message(`处理完成，格式 ${extension.toUpperCase()}，大小 ${(total / 1048576).toFixed(1)} MB。请立即试听并逐段复核遮挡。`, false, 'export-status');
  } catch (error) {
    if (writable) { try { await writeQueue; await writable.abort(); } catch { /* browser may already close it */ } }
    message(error.name === 'AbortError' ? '已取消保存。' : error.message, error.name !== 'AbortError' && !cancelled, 'export-status');
  } finally {
    video.pause();
    stream?.getVideoTracks().forEach(track => track.stop());
    if (monitorGain) monitorGain.gain.value = 1;
    recorder = null; chunks = []; setBusy(false); paint();
  }
});
$('save-mode').addEventListener('change', () => {
  refreshExportAvailability();
  if (videoReady() && video.duration > 1200 && $('save-mode').value === 'download') message('下载模式仅适合 20 分钟内的视频；请使用直接保存。', true);
});

try {
  const raw = localStorage.getItem(KEY);
  if (raw) { overlays = validBackup(JSON.parse(raw)).map(item => ({ ...item, id: item.id || uid() })); message('已载入此浏览器的区域配置；请重新选择对应视频并复核位置。'); }
} catch { message('本机区域配置无法读取；可通过区域备份恢复。', true); }
renderList();
window.addEventListener('beforeunload', () => { if (videoUrl) URL.revokeObjectURL(videoUrl); });

window.MediaWorkbench={busy:()=>exporting,source:()=>sourceFile,project:()=>({overlays:JSON.parse(JSON.stringify(overlays)),source:sourceFile?{name:sourceFile.name,size:sourceFile.size}:null}),restore:async v=>{if(exporting)throw Error('当前正在导出');overlays=validBackup({...v,app:'yj-video-redact',version:1}).map(x=>({...x,id:x.id||uid()}));selectedId=null;save();renderList();message('工程参数已恢复，请选择对应原视频并核对时间。');},accept:async f=>{if(exporting)throw Error('当前正在导出');if(!f.type.startsWith('video/')&&!/\.(mp4|webm|mov)$/i.test(f.name))throw Error('请选择视频文件');const input=$('video-file'),dt=new DataTransfer();dt.items.add(f);const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{clean();reject(Error('视频预览超时，暂存素材保留'));},15000);const done=()=>{clean();resolve();},fail=()=>{clean();reject(Error('浏览器无法解码，暂存素材保留'));},clean=()=>{clearTimeout(timer);video.removeEventListener('loadedmetadata',done);video.removeEventListener('error',fail);};video.addEventListener('loadedmetadata',done);video.addEventListener('error',fail);});input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));await ready;}};
