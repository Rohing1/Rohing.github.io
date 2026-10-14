(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const ui = {
    source: $('source'), info: $('file-info'), preview: $('preview'), placeholder: $('placeholder'),
    start: $('start-time'), end: $('end-time'), markStart: $('mark-start'), markEnd: $('mark-end'),
    mute: $('mute'), saveMode: $('save-mode'), saveHint: $('save-hint'), export: $('export'),
    cancel: $('cancel'), status: $('status'), progressWrap: $('progress-wrap'), progress: $('progress'),
    progressLabel: $('progress-label'), durationChip: $('duration-chip'), capture: $('capture'), playhead: $('playhead')
  };
  const pickerAvailable = typeof window.showSaveFilePicker === 'function';
  let media = null;
  let selected = null;
  let previewUrl = null;
  let conversion = null;
  let working = false;
  let loadingSource=false;let loadId = 0;let lastOutput=null,pendingProject=null;
  function applyProject(){if(!pendingProject||!selected)return;if(pendingProject.source&&(pendingProject.source.name!==selected.file.name||pendingProject.source.size!==selected.file.size)){setStatus('工程素材名称或大小不匹配，参数未应用，请选择原素材。','error');return;}if(pendingProject.end>selected.duration+.05){setStatus('工程选区超出素材时长，参数未应用。','error');return;}ui.start.value=pendingProject.start;ui.end.value=pendingProject.end;ui.mute.checked=pendingProject.mute;pendingProject=null;setStatus('原素材匹配，工程选区已恢复，请核对。','success');}

  if (!pickerAvailable) {
    ui.saveMode.value = 'download';
    ui.saveMode.querySelector('[value="file"]').disabled = true;
    ui.saveHint.textContent = '此浏览器不支持直接写入本地文件，只能处理较短片段并在完成后下载。大文件请使用桌面版 Chrome / Edge。';
  }

  const fmtTime = (seconds) => {
    const n = Math.max(0, Math.floor(seconds || 0));
    return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
  };
  const fmtSize = (bytes) => bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  const setStatus = (message, type = '') => {
    ui.status.textContent = message;
    ui.status.className = `status ${type}`.trim();
  };
  const safeName = (name) => name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '-').slice(0, 80) || 'video';
  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  const setWorking = (value) => {
    working = value;
    ui.source.disabled = value;
    ui.export.disabled = value || !media;
    ui.cancel.hidden = !value;
    ui.capture.disabled = value || !media;
    ui.markStart.disabled = value || !media;
    ui.markEnd.disabled = value || !media;
    ui.saveMode.disabled = value;
    ui.start.disabled = value;
    ui.end.disabled = value;
    ui.mute.disabled = value;
  };
  const updatePlayhead = () => {
    ui.playhead.textContent = `当前 ${fmtTime(ui.preview.currentTime)}`;
  };
  ui.preview.addEventListener('timeupdate', updatePlayhead);
  ui.preview.addEventListener('seeked', updatePlayhead);
  ui.markStart.addEventListener('click', () => { lastOutput=null;ui.start.value = ui.preview.currentTime.toFixed(2); });
  ui.markEnd.addEventListener('click', () => { lastOutput=null;ui.end.value = ui.preview.currentTime.toFixed(2); });

  async function openSource(file) {
    const token = ++loadId;lastOutput=null;loadingSource=true;
    media = null;
    selected = null;
    ui.export.disabled = true;
    ui.capture.disabled = true;
    ui.markStart.disabled = true;
    ui.markEnd.disabled = true;
    ui.durationChip.hidden = true;
    ui.preview.pause();
    ui.preview.removeAttribute('src');
    ui.preview.load();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    ui.preview.hidden = true;
    ui.placeholder.hidden = false;
    if (!file) { loadingSource=false;ui.info.textContent = '未选择视频。'; setStatus(''); return; }
    ui.info.textContent = `${file.name} · ${fmtSize(file.size)} · 正在检查格式…`;
    setStatus('正在读取视频元数据，文件不会上传。');
    let input;
    try {
      media ??= await import('./mediabunny.1.60.0.min.js');
      input = new media.Input({ source: new media.BlobSource(file), formats: media.ALL_FORMATS });
      if (!await input.canRead()) throw new Error('无法识别这个视频容器。请选择 MP4 或 WebM。');
      const format = await input.getFormat();
      const outputType = format instanceof media.WebMInputFormat ? 'webm'
        : format instanceof media.Mp4InputFormat || format instanceof media.QuickTimeInputFormat ? 'mp4' : null;
      if (!outputType) throw new Error('目前仅支持 MP4、MOV 或 WebM 容器的快速剪切。');
      const videoTrack = await input.getPrimaryVideoTrack();
      if (!videoTrack) throw new Error('此文件没有可识别的视频轨。');
      const audioTrack = await input.getPrimaryAudioTrack();
      const videoCodec = await videoTrack.getCodec();
      const audioCodec = audioTrack ? await audioTrack.getCodec() : null;
      let duration = await input.getDurationFromMetadata();
      if (!Number.isFinite(duration) || duration <= 0) duration = await input.computeDuration();
      if (!Number.isFinite(duration) || duration <= 0) throw new Error('无法确认视频时长，不能安全剪切这个文件。');
      if (token !== loadId) return;
      selected = { file, outputType, duration, videoCodec, audioCodec, hasAudio: !!audioTrack };
      previewUrl = URL.createObjectURL(file);
      ui.preview.src = previewUrl;
      ui.preview.hidden = false;
      ui.placeholder.hidden = true;
      ui.start.value = '0';
      ui.end.value = Math.min(duration, 60).toFixed(2);
      ui.durationChip.textContent = `总时长 ${fmtTime(duration)}`;
      ui.durationChip.hidden = false;
      ui.info.textContent = `${file.name} · ${fmtSize(file.size)} · ${fmtTime(duration)} · ${String(videoCodec || '未知').toUpperCase()}${audioCodec ? ` / ${String(audioCodec).toUpperCase()}` : ''}`;
      ui.export.disabled = false;
      ui.capture.disabled = false;
      ui.markStart.disabled = false;
      ui.markEnd.disabled = false;
      setStatus('就绪。默认选取前 60 秒，可拖动预览并标记起止点。', 'success');applyProject();
    } catch (error) {
      if (token === loadId) setStatus(error.message || '读取视频失败。', 'error');
      media = media || null;
    } finally {
      input?.dispose();if(token===loadId)loadingSource=false;
    }
  }
  ui.source.addEventListener('change', () => { void openSource(ui.source.files?.[0]); });for(const x of [ui.start,ui.end,ui.mute])x.addEventListener('input',()=>lastOutput=null);

  ui.capture.addEventListener('click', () => {
    if (!selected || !ui.preview.videoWidth || !ui.preview.videoHeight) {
      setStatus('请先播放或定位到可以显示的画面，再提取封面。', 'error');
      return;
    }
    const scale = Math.min(1, 1920 / Math.max(ui.preview.videoWidth, ui.preview.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(ui.preview.videoWidth * scale);
    canvas.height = Math.round(ui.preview.videoHeight * scale);
    canvas.getContext('2d').drawImage(ui.preview, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) { setStatus('封面生成失败。', 'error'); return; }
      downloadBlob(blob, `${safeName(selected.file.name)}-cover-${Math.floor(ui.preview.currentTime)}s.png`);
      setStatus('封面已在本机生成并下载。', 'success');
    }, 'image/png');
  });

  ui.cancel.addEventListener('click', () => {
    if (conversion) {
      setStatus('正在取消处理…');
      void conversion.cancel();
    }
  });

  ui.export.addEventListener('click', async () => {
    if (working || !selected) return;
    const begin = Number(ui.start.value);
    const end = Number(ui.end.value);
    const span = end - begin;
    const mobile = matchMedia('(pointer: coarse)').matches;
    const maxSpan = mobile ? 90 : 30 * 60;
    if (!Number.isFinite(begin) || !Number.isFinite(end) || begin < 0 || span <= 0.1 || end > selected.duration + 0.05) {
      setStatus('请填写有效的开始与结束时间，结束时间不能超过视频总时长。', 'error'); return;
    }
    if (span > maxSpan) {
      setStatus(`单次最多剪切 ${mobile ? '90 秒' : '30 分钟'}。较长素材可分段处理，避免浏览器长时间占用资源。`, 'error'); return;
    }
    const direct = ui.saveMode.value === 'file';
    if (direct && !pickerAvailable) { setStatus('当前浏览器不支持直接保存到本地文件。', 'error'); return; }
    const estimated = selected.file.size * span / selected.duration;
    if (!direct && (span > (mobile ? 60 : 180) || estimated > 48 * 1024 ** 2)) {
      setStatus('普通下载模式只适合短片段（桌面 ≤3 分钟，手机 ≤1 分钟，预计 ≤48 MB）。请改用直接保存到本地文件。', 'error'); return;
    }
    const extension = selected.outputType;
    const filename = `${safeName(selected.file.name)}-clip-${Math.floor(begin)}-${Math.ceil(end)}.${extension}`;
    let handle;
    try {
      // The picker must run directly inside the click handler, before any asynchronous media work.
      if (direct) handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: extension.toUpperCase() + ' 视频', accept: { [extension === 'mp4' ? 'video/mp4' : 'video/webm']: ['.' + extension] } }]
      });
    } catch (error) {
      if (error.name !== 'AbortError') setStatus('无法选择保存位置：' + error.message, 'error');
      return;
    }

    lastOutput=null;setWorking(true);
    ui.progressWrap.hidden = false;
    ui.progress.value = 0;
    ui.progressLabel.textContent = '0%';
    setStatus('正在检查音视频编码与剪切位置…');
    let input;
    let fileWriter;
    let completed = false;
    try {
      input = new media.Input({ source: new media.BlobSource(selected.file), formats: media.ALL_FORMATS });
      const target = direct ? new media.StreamTarget(new WritableStream({
        async write(chunk) {
          await fileWriter.write({ type: 'write', position: chunk.position, data: chunk.data });
        },
        async close() { await fileWriter.close(); },
        async abort() { try { await fileWriter.abort(); } catch (_) { /* already closed */ } }
      })) : new media.BufferTarget();
      const output = new media.Output({
        format: extension === 'mp4' ? new media.Mp4OutputFormat({ fastStart: false }) : new media.WebMOutputFormat(),
        target
      });
      conversion = await media.Conversion.init({
        input, output, tracks: 'primary', trim: { start: begin, end },
        video: {}, audio: { discard: ui.mute.checked },
        copy: { mode: 'forced', boundaryPolicy: 'expand', shiftTolerance: Infinity },
        showWarnings: false
      });
      const usedVideo = await input.getPrimaryVideoTrack();
      const usedAudio = await input.getPrimaryAudioTrack();
      if (!conversion.isValid || !conversion.utilizedTracks.includes(usedVideo) ||
        (!ui.mute.checked && usedAudio && !conversion.utilizedTracks.includes(usedAudio))) {
        throw new Error('此视频编码无法直接复制剪切。为避免长时间转码，本工具未处理该文件；可换成常见 H.264/AAC MP4 或 VP8/VP9/Opus WebM。');
      }
      if (direct) fileWriter = await handle.createWritable();
      conversion.onProgress = (fraction) => {
        const n = Math.min(99, Math.max(0, Math.round(fraction * 100)));
        ui.progress.value = n;
        ui.progressLabel.textContent = `${n}%`;
      };
      if (!direct) {
        target.onwrite = (_, endOffset) => {
          if (endOffset > 60 * 1024 ** 2) void conversion.cancel();
        };
      }
      setStatus('正在本地剪切。大文件请耐心等待，页面保持打开。');
      await conversion.execute();
      if (!direct) {
        if (!target.buffer) throw new Error('未能生成输出文件。');
        lastOutput=new File([target.buffer],filename,{type:extension==='mp4'?'video/mp4':'video/webm'});downloadBlob(lastOutput,filename);
      }
      if(direct){try{const f=await handle.getFile();if(f.size<=64*1048576)lastOutput=f;}catch{}}completed = true;
      ui.progress.value = 100;
      ui.progressLabel.textContent = '100%';
      setStatus(`已完成：${filename}。快剪按关键帧对齐，请播放成品核对实际起止。`, 'success');
    } catch (error) {
      if (error instanceof media.ConversionCanceledError) {
        setStatus('处理已取消；未完成的文件不可使用。', 'error');
      } else {
        setStatus(`处理失败：${error.message || '未知错误'}`, 'error');
      }
    } finally {
      if (!completed && fileWriter) { try { await fileWriter.abort(); } catch (_) { /* already closed */ } }
      input?.dispose();
      conversion = null;
      setWorking(false);
    }
  });
window.MediaWorkbench={busy:()=>working||loadingSource,source:()=>selected?.file||null,result:()=>lastOutput,accept:async file=>{if(working)throw Error('当前正在处理');await openSource(file);if(!selected)throw Error('素材无法载入，请检查格式');},project:()=>({start:Number(ui.start.value)||0,end:Number(ui.end.value)||0,mute:ui.mute.checked,source:selected?{name:selected.file.name,size:selected.file.size,duration:selected.duration}:null}),restore:async v=>{if(working)throw Error('当前正在处理');if(!v||!Number.isFinite(v.start)||!Number.isFinite(v.end)||v.start<0||v.end<v.start||v.end>86400||typeof v.mute!=='boolean'||v.source&&(!Number.isFinite(v.source.size)||typeof v.source.name!=='string'||v.source.name.length>300))throw Error('剪辑工程参数无效');pendingProject=JSON.parse(JSON.stringify(v));applyProject();lastOutput=null;}};
})();
