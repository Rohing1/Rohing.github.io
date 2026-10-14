'use strict';
(() => {
  const { $ } = UI;
  const settings = ['mode', 'quality', 'fps', 'system-audio', 'microphone', 'camera', 'camera-position'];
  const maxShortBytes = 256 * 1048576;
  const maxQueuedBytes = 64 * 1048576;
  let recorder = null, streams = [], audioCtx = null, drawTimer = null, clock = null;
  let chunks = [], bytes = 0, result = null, resultUrl = null, downloaded = true;
  let preparing = false, finishing = false, token = 0, activeSince = 0, activeMs = 0;
  let saveHandle = null, writable = null, writeQueue = Promise.resolve(), queuedBytes = 0, writeError = null;
  let activeMode = 'short';

  const status = message => { $('#status').textContent = message; };
  const supported = () => !!(navigator.mediaDevices?.getDisplayMedia && window.MediaRecorder && window.isSecureContext);
  const preferredMime = () => ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type));
  const longSupported = () => supported() && typeof window.showSaveFilePicker === 'function' && !!preferredMime();
  function formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const prefix = minutes >= 60 ? String(Math.floor(minutes / 60)).padStart(2, '0') + ':' : '';
    return prefix + String(minutes % 60).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
  }
  function elapsed() { return activeMs + (recorder?.state === 'recording' ? Date.now() - activeSince : 0); }
  function locks() {
    const busy = !!(recorder && recorder.state !== 'inactive') || preparing || finishing;
    for (const id of settings) $('#' + id).disabled = busy;
    $('#choose-file').disabled = busy || !longSupported();
    $('#start').disabled = busy || !supported() || ($('#mode').value === 'long' && (!longSupported() || !saveHandle));
    $('#cancel-start').hidden = !preparing;
    $('#pause').disabled = !recorder || recorder.state === 'inactive' || finishing;
    $('#stop').disabled = !recorder || recorder.state === 'inactive' || finishing;
    $('#download').disabled = !result?.size || !resultUrl || busy || activeMode === 'long';
    $('#clear').disabled = (!result && !resultUrl) || busy;
  }
  function cleanup() {
    clearInterval(drawTimer); clearInterval(clock); drawTimer = clock = null;
    for (const stream of streams) for (const track of stream.getTracks()) track.stop();
    streams = [];
    if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null; }
  }
  function discardPreview() {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = result = null;
    downloaded = true;
    const preview = $('#preview');
    preview.pause(); preview.srcObject = null; preview.removeAttribute('src');
    preview.hidden = true; $('#placeholder').hidden = false;
  }
  async function videoOf(stream) {
    const video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.srcObject = stream;
    await video.play();
    if (!video.videoWidth) await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('视频源没有就绪')), 5000);
      video.onloadedmetadata = () => { clearTimeout(timeout); resolve(); };
    });
    return video;
  }
  function stop() {
    if (!recorder || recorder.state === 'inactive' || finishing) return;
    if (recorder.state === 'recording') activeMs += Date.now() - activeSince;
    finishing = true;
    $('#phase').textContent = '正在保存';
    recorder.stop();
    locks();
  }
  async function finishRecording() {
    cleanup();
    const preview = $('#preview');
    preview.pause(); preview.srcObject = null;
    try {
      if (activeMode === 'long') {
        await writeQueue;
        if (writeError) throw writeError;
        if (!bytes) throw Error('未收集到有效画面');
        await writable.close();
        writable = null;
        try { result = await saveHandle.getFile(); }
        catch { result = null; }
        downloaded = true;
        status('已保存到本地文件“' + saveHandle.name + '”。请用本地播放器抽查画面与声音。下次录制需重新选择保存位置。' + (result ? '' : '浏览器未授予页面重新读取文件的权限，页面内无法预览。'));
        saveHandle = null;
        $('#file-choice').textContent = '本次已保存；下次录制请重新选择文件。';
      } else {
        result = new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type || 'video/webm' });
        downloaded = false;
        status(result.size ? '录制已完成，请预览并下载。离开页面后未下载的视频不会保留。' : '未收集到有效画面，请重新录制。');
      }
      if (result?.size) {
        resultUrl = URL.createObjectURL(result);
        preview.src = resultUrl;
        preview.hidden = false;
        $('#placeholder').hidden = true;
        preview.dataset.recordedDuration = String(activeMs / 1000);
        preview.muted = false;
        preview.dispatchEvent(new Event('recordingready'));
      } else {
        preview.hidden = true; $('#placeholder').hidden = false;
      }
      $('#phase').textContent = activeMode === 'long' ? '已保存' : result?.size ? '录制完成' : '录制失败';
      $('#download').textContent = activeMode === 'long' ? '已保存到本地' : '下载视频';
    } catch (error) {
      if (writable) { try { await writable.abort(); } catch {} writable = null; }
      result = null;
      preview.hidden = true; $('#placeholder').hidden = false;
      $('#phase').textContent = '保存失败';
      status('本地文件未确认保存成功：' + (error.message || '写入失败') + '。请检查磁盘空间与权限，勿将本次录制视为已保存。');
    } finally {
      chunks = []; writeQueue = Promise.resolve(); queuedBytes = 0; writeError = null;
      finishing = false; $('#elapsed').textContent = formatTime(activeMs); locks();
    }
  }
  function captureChunk(blob) {
    if (!blob.size) return;
    bytes += blob.size;
    $('#size').textContent = (bytes / 1048576).toFixed(1) + ' MB';
    if (activeMode === 'short') {
      chunks.push(blob);
      if (bytes >= maxShortBytes) { status('已达到短录大小上限，正在结束，请下载视频。'); stop(); }
      return;
    }
    if (writeError) return;
    queuedBytes += blob.size;
    writeQueue = writeQueue.then(() => writable.write(blob)).catch(error => {
      writeError = error;
      status('写入本地文件失败，正在停止录制：' + (error.message || '请检查磁盘空间和权限'));
      stop();
    }).finally(() => { queuedBytes -= blob.size; });
    if (queuedBytes >= maxQueuedBytes && !finishing) {
      status('本地磁盘写入跟不上录制速度，正在结束并保存已录片段。');
      stop();
    }
  }

  $('#mode').onchange = () => {
    const long = $('#mode').value === 'long';
    $('#file-picker-row').hidden = !long;
    $('#download').textContent = result && activeMode === 'long' ? '已保存到本地' : '下载视频';
    if (long && !longSupported()) status('当前浏览器不支持选择本地文件持续写入，请使用桌面 Chrome / Edge 的 HTTPS 页面。');
    else status(long ? '请先选择本地保存位置，再选择屏幕开始录制。' : '短录完成后需手动下载视频。');
    locks();
  };
  $('#choose-file').onclick = async () => {
    if (!longSupported() || preparing || finishing || recorder?.state !== 'inactive' && recorder) return;
    const mime = preferredMime();
    const mp4 = mime.startsWith('video/mp4');
    try {
      const handle = await window.showSaveFilePicker({
        id: 'yanjian-recorder',
        suggestedName: '本地录屏-' + new Date().toISOString().replace(/[:.]/g, '-') + (mp4 ? '.mp4' : '.webm'),
        types: [{ description: mp4 ? 'MP4 视频' : 'WebM 视频', accept: mp4 ? { 'video/mp4': ['.mp4'] } : { 'video/webm': ['.webm'] } }],
        excludeAcceptAllOption: true
      });
      saveHandle = handle;
      $('#file-choice').textContent = '已选择：' + handle.name + '。录制开始后将写入此文件；如选现有文件，原内容可能被替换。';
      status('保存位置已选好。请点击“选择屏幕并开始”，并在浏览器分享窗口确认需要的音频。');
    } catch (error) {
      if (error.name !== 'AbortError') status('无法选择本地文件：' + (error.message || '请检查浏览器权限'));
    }
    locks();
  };
  $('#start').onclick = async () => {
    if (!supported() || preparing || finishing || recorder && recorder.state !== 'inactive') return;
    if ($('#mode').value === 'long' && (!longSupported() || !saveHandle)) { status('请先选择本地保存位置。'); return; }
    if (result && !downloaded && !confirm('当前短录视频尚未下载，开始新录制会替换它。继续？')) return;
    preparing = true;
    const mine = ++token;
    const mode = $('#mode').value;
    const selectedHandle = saveHandle;
    const pending = [];
    let pendingWriter = null;
    let newPreview = false;
    locks(); $('#phase').textContent = '等待授权';
    status('请选择屏幕或会议标签页；若需录入对方声音，请确认分享窗口中的音频选项。');
    try {
      const width = Number($('#quality').value), fps = Number($('#fps').value);
      // getDisplayMedia 必须直接从本次按钮点击调用，不能排在文件选择器之后。
      const screen = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: width, max: width }, height: { ideal: width * 9 / 16, max: width * 9 / 16 }, frameRate: { ideal: fps, max: fps } },
        audio: $('#system-audio').checked
      });
      pending.push(screen);
      if (mine !== token) throw Error('准备已取消');
      streams = pending;
      let user = null;
      if ($('#microphone').checked || $('#camera').checked) {
        user = await navigator.mediaDevices.getUserMedia({ audio: $('#microphone').checked, video: $('#camera').checked ? { width: { ideal: 640 }, height: { ideal: 480 } } : false });
        pending.push(user);
      }
      if (mine !== token) throw Error('准备已取消');
      streams = pending;
      let output = new MediaStream(screen.getVideoTracks());
      if ($('#camera').checked) {
        const screenVideo = await videoOf(screen), cameraVideo = await videoOf(user);
        if (mine !== token) throw Error('准备已取消');
        const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
        const ratio = Math.min(1, width / screenVideo.videoWidth);
        canvas.width = Math.max(2, Math.round(screenVideo.videoWidth * ratio));
        canvas.height = Math.max(2, Math.round(screenVideo.videoHeight * ratio));
        const draw = () => {
          ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
          const w = Math.round(canvas.width * .22), h = Math.round(w * cameraVideo.videoHeight / cameraVideo.videoWidth);
          const margin = Math.max(8, canvas.width * .015);
          const x = $('#camera-position').value === 'left' ? margin : canvas.width - w - margin;
          ctx.fillStyle = '#fff'; ctx.fillRect(x - 3, canvas.height - h - margin - 3, w + 6, h + 6);
          ctx.drawImage(cameraVideo, x, canvas.height - h - margin, w, h);
        };
        draw(); drawTimer = setInterval(draw, 1000 / fps);
        output = canvas.captureStream(fps); streams.push(output);
      }
      const displayAudio = screen.getAudioTracks();
      const micAudio = user?.getAudioTracks() || [];
      const audioTracks = [...displayAudio, ...micAudio];
      if (audioTracks.length) {
        audioCtx = new AudioContext();
        const context = audioCtx;
        await context.resume();
        if (mine !== token) throw Error('准备已取消');
        const destination = context.createMediaStreamDestination();
        for (const track of audioTracks) context.createMediaStreamSource(new MediaStream([track])).connect(destination);
        for (const track of destination.stream.getAudioTracks()) output.addTrack(track);
        streams.push(destination.stream);
      }
      if (mine !== token) throw Error('准备已取消');
      const mime = preferredMime();
      const instance = new MediaRecorder(output, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: width === 1920 ? 5000000 : 2500000 });
      if (mode === 'long') {
        pendingWriter = await selectedHandle.createWritable();
        if (mine !== token) throw Error('准备已取消');
        writable = pendingWriter;
      }
      discardPreview();
      newPreview = true;
      recorder = instance; activeMode = mode; chunks = []; bytes = activeMs = queuedBytes = 0;
      writeQueue = Promise.resolve(); writeError = null; activeSince = Date.now();
      $('#elapsed').textContent = '00:00'; $('#size').textContent = '0 MB';
      const preview = $('#preview');
      preview.controls = false; preview.muted = true; preview.dataset.recordedDuration = '0';
      preview.srcObject = output; preview.hidden = false; $('#placeholder').hidden = true;
      await preview.play();
      if (mine !== token) throw Error('准备已取消');
      instance.ondataavailable = event => captureChunk(event.data);
      instance.onstop = finishRecording;
      instance.onerror = () => { status('浏览器录制失败，正在尝试保存已录片段。'); stop(); };
      screen.getVideoTracks()[0].addEventListener('ended', stop, { once: true });
      instance.start(1000);
      preparing = false; $('#phase').textContent = '正在录制'; $('#pause').textContent = '暂停录制';
      const audioStatus = '音频：' + (displayAudio.length ? '已获得分享对象音轨' : '未获得分享对象音轨') + '；' + (micAudio.length ? '已获得本机麦克风音轨' : '未获得本机麦克风音轨') + '。';
      status('录制中。' + audioStatus + '请先短录测试，确认对方声音确实可听见。');
      clock = setInterval(() => {
        const ms = elapsed(); $('#elapsed').textContent = formatTime(ms);
        if (activeMode === 'short' && ms >= 20 * 60000) { status('已达到短录时长上限，正在结束。'); stop(); }
      }, 500);
      locks();
    } catch (error) {
      for (const stream of pending) for (const track of stream.getTracks()) track.stop();
      if (mine !== token) {
        if (pendingWriter) { try { await pendingWriter.abort(); } catch {} }
        if (writable === pendingWriter) writable = null;
        return;
      }
      cleanup();
      if (writable) { try { await writable.abort(); } catch {} writable = null; }
      if (newPreview) {
        $('#preview').pause(); $('#preview').srcObject = null;
        $('#preview').hidden = true; $('#placeholder').hidden = false;
      }
      recorder = null; preparing = false; finishing = false;
      $('#phase').textContent = '未开始';
      status(error.name === 'NotAllowedError' ? '授权被取消或未允许，未开始录制。' : error.message || '无法开始录制');
      locks();
    }
  };
  $('#cancel-start').onclick = () => {
    token++; preparing = false; cleanup();
    if (writable) { writable.abort().catch(() => {}); writable = null; }
    if (recorder?.state === 'inactive') {
      recorder = null;
      $('#preview').pause(); $('#preview').srcObject = null;
      $('#preview').hidden = true; $('#placeholder').hidden = false;
    }
    $('#phase').textContent = '尚未录制'; locks();
    status('准备已取消。浏览器分享窗口若仍存在，请关闭；迟到的授权会立即释放。');
  };
  $('#stop').onclick = stop;
  $('#pause').onclick = () => {
    if (recorder?.state === 'recording') {
      activeMs += Date.now() - activeSince; recorder.pause();
      $('#pause').textContent = '继续录制'; $('#phase').textContent = '已暂停';
    } else if (recorder?.state === 'paused') {
      activeSince = Date.now(); recorder.resume();
      $('#pause').textContent = '暂停录制'; $('#phase').textContent = '正在录制';
    }
  };
  $('#download').onclick = () => {
    if (!result?.size || activeMode === 'long') return;
    const link = document.createElement('a'); link.href = resultUrl;
    link.download = '本地录屏-' + new Date().toISOString().replace(/[:.]/g, '-') + (result.type.includes('mp4') ? '.mp4' : '.webm');
    link.click(); downloaded = true; status('已发起视频下载，请确认文件已保存。');
  };
  $('#clear').onclick = () => {
    if (!confirm(activeMode === 'long' ? '清除页面预览？已保存的本地文件不会被删除。' : '清除当前视频？请确认已下载。')) return;
    discardPreview(); $('#phase').textContent = '尚未录制';
    $('#elapsed').textContent = '00:00'; $('#size').textContent = '0 MB';
    status(activeMode === 'long' ? '已清除预览，本地文件不受影响。' : '已清除当前视频。'); locks();
  };
  window.addEventListener('beforeunload', event => {
    if (preparing || finishing || recorder && recorder.state !== 'inactive' || result && !downloaded) {
      event.preventDefault(); event.returnValue = '';
    }
  });
  window.addEventListener('pagehide', () => {
    token++; cleanup();
    if (resultUrl) URL.revokeObjectURL(resultUrl);
  });
  if (!longSupported()) $('#mode').querySelector('[value=long]').disabled = true;
  $('#capability').textContent = !supported() ? '当前环境不支持录屏，请使用桌面 Chrome / Edge 的 HTTPS 页面。' : longSupported() ? '可使用长会议模式；先选本地文件，再另点一次按钮授权屏幕。' : '当前浏览器仅支持普通短录，长会议需使用桌面 Chrome / Edge 的 HTTPS 页面。';
  locks();
window.MediaWorkbench={busy:()=>preparing||finishing||!!(recorder&&recorder.state!=='inactive'),result:()=>result,project:()=>Object.fromEntries(settings.map(id=>[id,$('#'+id).type==='checkbox'?$('#'+id).checked:$('#'+id).value])),restore:async v=>{if(preparing||finishing||recorder&&recorder.state!=='inactive')throw Error('录制中不能恢复设置');if(!v||typeof v!=='object')throw Error('录屏参数无效');for(const id of settings){const n=$('#'+id);if(n.type==='checkbox'){if(typeof v[id]!=='boolean')throw Error('录屏开关无效');}else if(![...n.options].some(o=>o.value===v[id]&&!o.disabled))throw Error('此浏览器不支持备份中的录制选项');}for(const id of settings){const n=$('#'+id);if(n.type==='checkbox')n.checked=v[id];else n.value=v[id];n.dispatchEvent(new Event('change'));}locks();}};
})();
