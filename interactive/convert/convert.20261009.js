// Unified local media queue, release 2026-10-09.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const ui = {
    files: $('files'), drop: $('drop-zone'), jobs: $('jobs'), count: $('count'), start: $('start'),
    pause: $('pause'), cancel: $('cancel'), clear: $('clear'), zip: $('zip'), status: $('status'),
    saveMode: $('save-mode'), saveNote: $('save-note'), videoSize: $('video-size'),
    videoQuality: $('video-quality'), audioBitrate: $('audio-bitrate'), imageSize: $('image-size'),
    imageQuality: $('image-quality')
  };
  const LIMIT = 12;
  const mobile = matchMedia('(pointer:coarse)').matches;
  const DOWNLOAD_LIMIT = (mobile ? 48 : 120) * 1024 ** 2;
  const ZIP_LIMIT = (mobile ? 32 : 100) * 1024 ** 2;
  const mime = { mp4: 'video/mp4', webm: 'video/webm', wav: 'audio/wav', mp3: 'audio/mpeg', m4a: 'audio/mp4', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  const labels = { mp4: 'MP4 视频', webm: 'WebM 视频', wav: 'WAV 音频', mp3: 'MP3 音频', m4a: 'M4A 音频', jpg: 'JPG 图片', png: 'PNG 图片', webp: 'WebP 图片' };
  const jobs = [];
  let nextId = 1;
  let mediaPromise;
  let running = false;
  let pauseAfterCurrent = false;
  let cancelCurrent = null;
  let directory = null;
  let stopRequested = false;
  let activeJob = null;
  let inspecting = 0;
  let inspectionTail = Promise.resolve();
  let trialUrl = null;
  let packing = false;
  let cancelPacking = null;
  const summary = $('queue-summary');
  const idle = () => !running && !packing;
  const canceled = (job) => { if (job.canceled || stopRequested) throw Error('已取消当前任务。'); };
  const settings = () => ({ videoSize: Number(ui.videoSize.value), videoQuality: ui.videoQuality.value,
    audioBitrate: Number(ui.audioBitrate.value), imageSize: Number(ui.imageSize.value), imageQuality: Number(ui.imageQuality.value) });
  function closeTrial() {
    const player = $('trial-player'); player.pause(); player.removeAttribute('src'); player.load();
    if (trialUrl) URL.revokeObjectURL(trialUrl); trialUrl = null; $('trial-panel').hidden = true;
  }
  $('trial-close').onclick = closeTrial;
  function outputName(job) {
    const prefix = $('name-prefix').value.trim();
    const stem = (prefix ? safeName(prefix + '.tmp') + '-' : '') + safeName((job.outputStem || safeName(job.file.name) + '-converted') + '.tmp');
    const reserved = new Set(jobs.filter(x => x !== job && x.filename).map(x => x.filename.toLowerCase()));
    for (let n = 0; n < 1000; n++) { const name = `${stem}${n ? '-' + (n + 1) : ''}.${job.format}`; if (!reserved.has(name.toLowerCase())) return name; }
    throw Error('同名任务过多，请修改输出名称。');
  }
  function range(job) {
    const start = Number(job.start || 0), end = job.end === '' ? job.duration : Number(job.end);
    if (!Number.isFinite(start) || start < 0 || (end != null && (!Number.isFinite(end) || end <= start || (job.duration && end > job.duration + .05)))) throw Error('裁剪时间无效：结束须晚于开始，且不得超过素材时长。');
    if (end == null && start > 0) throw Error('此文件没有可靠时长，请填写裁剪结束秒数。');
    return end == null ? null : { start, end: job.preview ? Math.min(end, start + 5) : end };
  }
  function progress(job, value) {
    const actual = jobs.find(x => x.id === job.id);
    const next = Math.max(0, Math.min(99, Math.round(value)));
    if (actual && actual.progress !== next) { actual.progress = next; render(); }
  }
  const pickerAvailable = typeof window.showDirectoryPicker === 'function';
  if (!pickerAvailable) {
    ui.saveMode.value = 'download';
    ui.saveMode.querySelector('[value="file"]').disabled = true;
    ui.saveNote.textContent = '此浏览器没有文件夹选择器，只能使用普通下载。视频和音频下载模式限较小文件，建议桌面版 Chrome / Edge。';
  }
  const loadMedia = () => mediaPromise ??= import('../video/mediabunny.1.60.0.min.js');
  const size = (n) => n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`;
  const safeName = (name) => {
    const clean = name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').trim().slice(0, 90).replace(/[. ]+$/, '') || 'converted';
    return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(clean) ? '_' + clean : clean;
  };
  const kindOf = (file) => {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (['mp4', 'mov', 'mkv', 'webm'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac'].includes(ext)) return 'audio';
    if (['jpg', 'jpeg', 'png', 'webp', 'bmp'].includes(ext)) return 'image';
    return file.type.startsWith('image/') ? 'image' : null;
  };
  const status = (message, error = false) => { ui.status.textContent = message; ui.status.className = `status${error ? ' error' : ''}`; };
  const download = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = filename;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  const addText = (parent, className, content) => { const el = document.createElement('div'); el.className = className; el.textContent = content; parent.append(el); return el; };
  const titleForState = { checking: '检查中', ready: '待处理', running: '处理中', done: '已完成', error: '失败', canceled: '已取消' };

  function formatsFor(job) {
    if (job.kind === 'image') return ['jpg', 'png', 'webp'];
    if (job.kind === 'audio') return ['mp3', 'm4a', 'wav'];
    if (job.kind === 'video') return job.hasAudio ? ['mp4', 'webm', 'm4a', 'wav'] : ['mp4', 'webm'];
    return [];
  }
  function formatSupported(job, format) {
    if (job.state === 'checking') return true;
    if (format === 'mp3') return job.duration !== null && job.duration <= (mobile ? 120 : 600);
    if (job.kind === 'image') return format !== 'webp' || job.webpSupported;
    if (format === 'mp4') return !!job.canAvc && (!job.hasAudio || !!job.canAac);
    if (format === 'webm') return !!job.canVp9 && (!job.hasAudio || !!job.canOpus);
    if (format === 'm4a') return !!job.canAac;
    return true;
  }
  function estimate(job) {
    if (!Number.isFinite(job.duration) || !job.duration) return '';
    const seconds = Math.max(0, Number(job.end || job.duration) - Number(job.start || 0));
    if (job.format === 'mp3' || job.format === 'm4a') return ` · 粗估 ${size(seconds * Number(ui.audioBitrate.value) * 1000 / 8)}`;
    if (job.format === 'wav') return ` · 粗估 ${size(seconds * 44100 * 2 * 2)}`;
    return '';
  }
  const metadata = job => `${job.kind === 'video' ? '视频' : job.kind === 'audio' ? '音频' : job.kind === 'image' ? '图片' : '未知类型'} · ${size(job.file.size)}${job.info ? ` · ${job.info}` : ''}${estimate(job)}`;
  function refreshEstimates() {
    for (const job of jobs) {
      const node = ui.jobs.querySelector(`[data-id="${job.id}"] .job-meta`);
      if (node) node.textContent = metadata(job);
    }
  }
  function render() {
    ui.jobs.replaceChildren();
    ui.count.textContent = `${jobs.length} / ${LIMIT}`;
    summary.textContent = `待处理 ${jobs.filter(j => j.state === 'ready').length} · 检查中 ${jobs.filter(j => j.state === 'checking').length} · 已完成 ${jobs.filter(j => j.state === 'done').length} · 失败 / 取消 ${jobs.filter(j => ['error','canceled'].includes(j.state)).length} · 临时结果 ${size(jobs.reduce((s,j) => s + (j.blob?.size || 0), 0))}`;
    if (!jobs.length) addText(ui.jobs, 'empty', '还没有任务。选择本地视频、音频或图片开始。');
    for (const job of jobs) {
      const card = document.createElement('article'); card.className = 'job'; card.dataset.id = String(job.id);
      const top = document.createElement('div'); top.className = 'job-top';
      const nameBlock = document.createElement('div');
      addText(nameBlock, 'job-name', job.file.name);
      addText(nameBlock, 'job-meta', metadata(job));
      const badge = addText(top, `job-state ${job.state}`, titleForState[job.state]);
      top.prepend(nameBlock); card.append(top);
      const controls = document.createElement('div'); controls.className = 'job-controls';
      if (job.kind) {
        const label = document.createElement('label'); label.textContent = '输出格式';
        const select = document.createElement('select'); select.dataset.action = 'format'; select.dataset.id = String(job.id);
        select.disabled = !idle() || job.state === 'checking' || job.state === 'done';
        for (const format of formatsFor(job)) {
          const option = document.createElement('option'); option.value = format;
          option.textContent = `${labels[format]}${formatSupported(job, format) ? '' : '（此浏览器不可用）'}`;
          option.disabled = !formatSupported(job, format); option.selected = job.format === format;
          select.append(option);
        }
        label.append(select); controls.append(label);
        const nameLabel = document.createElement('label'); nameLabel.textContent = '输出名称（不含扩展名）';
        const name = document.createElement('input'); name.value = job.outputStem; name.maxLength = 90;
        name.dataset.action = 'outputStem'; name.dataset.id = String(job.id); name.setAttribute('aria-label', `${job.file.name}输出名称`);
        name.disabled = !idle() || job.state === 'done'; nameLabel.append(name); controls.append(nameLabel);
      }
      if (job.state === 'done' && job.blob) {
        const button = document.createElement('button'); button.type = 'button'; button.dataset.action = 'download'; button.dataset.id = String(job.id); button.textContent = job.downloaded ? '重新下载' : '下载结果'; controls.append(button);
      }
      if (job.state === 'error' || job.state === 'canceled') {
        const button = document.createElement('button'); button.type = 'button'; button.dataset.action = 'retry'; button.dataset.id = String(job.id); button.disabled = !idle() || !job.kind; button.textContent = '重新排队'; controls.append(button);
      }
      if (job.state !== 'running') {
        const button = document.createElement('button'); button.type = 'button'; button.dataset.action = 'remove'; button.dataset.id = String(job.id); button.disabled = !idle(); button.textContent = '移除'; controls.append(button);
      }
      card.append(controls);
      if (['audio','video'].includes(job.kind)) {
        const details = document.createElement('details'); details.className = 'job-options'; details.open = !!job.optionsOpen;
        const heading = document.createElement('summary'); heading.textContent = '裁剪与声音设置（可选）'; details.append(heading);
        const fields = document.createElement('div'); fields.className = 'job-controls';
        for (const [key, title] of [['start','开始（秒）'],['end','结束（秒，空白为全部）']]) {
          const label = document.createElement('label'); label.textContent = title;
          const input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.step = '0.01'; input.value = job[key]; input.dataset.action = key; input.dataset.id = String(job.id); input.disabled = !idle() || job.state === 'done'; label.append(input); fields.append(label);
        }
        if (job.kind === 'video') {
          const label = document.createElement('label'); label.className = 'check'; const input = document.createElement('input'); input.type = 'checkbox'; input.checked = job.mute; input.dataset.action = 'mute'; input.dataset.id = String(job.id); input.disabled = !idle() || job.state === 'done'; label.append(input, '静音（仅视频输出）'); fields.append(label);
        }
        details.append(fields); details.addEventListener('toggle', () => { job.optionsOpen = details.open; }); card.append(details);
        if (job.state !== 'done') {
          const trial = document.createElement('button'); trial.type = 'button'; trial.dataset.action = 'trial'; trial.dataset.id = String(job.id); trial.textContent = '试处理前 5 秒'; trial.disabled = !idle() || job.state !== 'ready' || !formatSupported(job, job.format); controls.append(trial);
        }
      }
      if (job.state === 'running') {
        const progress = document.createElement('progress'); progress.max = 100; progress.value = job.progress; progress.setAttribute('aria-label', `${job.file.name}处理进度`); card.append(progress); addText(card, 'job-detail', `${job.progress}%`);
      }
      if (job.message) addText(card, `job-detail${job.state === 'error' ? ' error' : ''}`, job.message);
      ui.jobs.append(card);
    }
    ui.start.disabled = !idle() || inspecting > 0 || !jobs.some((job) => job.state === 'ready' && formatSupported(job, job.format));
    ui.clear.disabled = !idle() || !jobs.some((job) => job.state === 'done');
    ui.zip.disabled = !idle() || !jobs.some((job) => job.state === 'done' && job.blob);
    $('retry-all').disabled = !idle() || !jobs.some(j => ['error','canceled'].includes(j.state) && j.kind);
    ui.pause.hidden = !running; ui.cancel.hidden = !running && !packing;
    ui.pause.textContent = pauseAfterCurrent ? '已请求暂停' : '本项完成后暂停';
    ui.pause.disabled = pauseAfterCurrent || !!activeJob?.preview;
    ui.files.disabled = !idle();
    ui.saveMode.disabled = !idle();
    for (const setting of [ui.videoSize, ui.videoQuality, ui.audioBitrate, ui.imageSize, ui.imageQuality, $('name-prefix'), $('auto-download')]) setting.disabled = !idle();
  }
  function addFiles(fileList) {
    const files = [...fileList];
    if (!files.length || !idle()) return;
    if (jobs.length + files.length > LIMIT) { status(`最多保留 ${LIMIT} 个任务，请先移除部分文件。`, true); return; }
    for (const file of files) {
      const kind = kindOf(file);
      const job = { id: nextId++, file, kind, state: kind ? 'checking' : 'error', format: kind === 'video' ? 'mp4' : kind === 'audio' ? 'mp3' : 'jpg', progress: 0, message: kind ? '正在读取格式与浏览器能力…' : '不支持此文件类型。', info: '', duration: null, blob: null, filename: '', hasAudio: false, outputStem: safeName(file.name) + '-converted', start: '0', end: '', mute: false, inspected: false, downloaded: false };
      jobs.push(job);
      if (kind) enqueueInspect(job);
    }
    ui.files.value = '';
    render();
    status(`已添加 ${files.length} 个文件；检查完成后可选择目标格式。`);
  }
  function enqueueInspect(job) {
    inspecting++; job.state = 'checking';
    inspectionTail = inspectionTail.then(async () => { if (jobs.includes(job)) await inspect(job); }).finally(() => { inspecting--; render(); });
  }
  async function inspect(job) {
    let input;
    try {
      if (job.kind === 'image') {
        if (job.file.size > 40 * 1024 ** 2) throw Error('图片超过 40 MB；请先用桌面工具缩小。');
        const bitmap = await createImageBitmap(job.file);
        job.info = `${bitmap.width} × ${bitmap.height}`;
        if (bitmap.width * bitmap.height > 30e6) { bitmap.close(); throw Error('图片超过 3000 万像素，本页为避免内存溢出不处理。'); }
        bitmap.close();
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
        job.webpSupported = canvas.toDataURL('image/webp').startsWith('data:image/webp');
        job.format = job.file.type === 'image/png' ? (job.webpSupported ? 'webp' : 'png') : 'jpg';
      } else {
        const media = await loadMedia();
        input = new media.Input({ source: new media.BlobSource(job.file), formats: media.ALL_FORMATS });
        if (!await input.canRead()) throw Error('无法识别该媒体容器或文件已损坏。');
        const video = await input.getPrimaryVideoTrack();
        const audio = await input.getPrimaryAudioTrack();
        if (job.kind === 'video' && !video) throw Error('没有可读取的视频轨。');
        if (job.kind === 'audio' && !audio) throw Error('没有可读取的音频轨。');
        job.hasAudio = !!audio;
        let duration = await input.getDurationFromMetadata();
        if ((!Number.isFinite(duration) || duration <= 0) && job.file.size < 100 * 1024 ** 2) duration = await input.computeDuration();
        job.duration = Number.isFinite(duration) && duration > 0 ? duration : null;
        const videoCodec = video ? await video.getCodec() : null;
        const audioCodec = audio ? await audio.getCodec() : null;
        if (video) { job.width = await video.getDisplayWidth(); job.height = await video.getDisplayHeight(); }
        job.info = `${job.duration ? `${Math.round(job.duration)} 秒 · ` : ''}${video ? `${job.width} × ${job.height} · ${String(videoCodec || '未知').toUpperCase()}` : ''}${audioCodec ? `${video ? ' / ' : ''}${String(audioCodec).toUpperCase()}` : ''}`;
        if (job.kind === 'video') {
          const check = async (promise) => { try { return await promise; } catch (_) { return false; } };
          job.canAvc = await check(media.canEncodeVideo('avc', { width: Math.min(job.width || 640, 1920), height: Math.min(job.height || 360, 1080) }));
          job.canVp9 = await check(media.canEncodeVideo('vp9', { width: Math.min(job.width || 640, 1920), height: Math.min(job.height || 360, 1080) }));
          job.canOpus = !audio || await check(media.canEncodeAudio('opus'));
          job.canAac = !audio || await check(media.canEncodeAudio('aac'));
          job.format = job.canAvc && job.canAac ? 'mp4' : job.canVp9 && job.canOpus ? 'webm' : 'wav';
          if (job.format === 'wav' && !audio) throw Error('浏览器不能编码该视频的目标格式。');
        } else {
          try { job.canAac = await media.canEncodeAudio('aac'); } catch (_) { job.canAac = false; }
          job.format = job.duration === null || job.duration > (mobile ? 120 : 600) ? (job.canAac ? 'm4a' : 'wav') : 'mp3';
        }
      }
      job.inspected = true; job.state = 'ready'; job.message = '可处理。可先试处理短片，结果不会覆盖原文件。';
    } catch (error) {
      job.state = 'error'; job.message = error.message || '检查文件失败。';
    } finally { input?.dispose(); render(); }
  }
  ui.files.addEventListener('change', () => addFiles(ui.files.files));
  for (const event of ['dragenter', 'dragover']) ui.drop.addEventListener(event, (e) => { e.preventDefault(); ui.drop.classList.add('dragging'); });
  for (const event of ['dragleave', 'drop']) ui.drop.addEventListener(event, (e) => { e.preventDefault(); ui.drop.classList.remove('dragging'); });
  ui.drop.addEventListener('drop', (e) => { if (!running) addFiles(e.dataTransfer.files); });
  ui.jobs.addEventListener('change', (e) => {
    if (!idle()) return;
    const job = jobs.find((item) => item.id === Number(e.target.dataset.id));
    if (!job || job.state === 'done') return;
    const action = e.target.dataset.action;
    if (action === 'format' && formatSupported(job, e.target.value)) job.format = e.target.value;
    else if (['start','end','outputStem'].includes(action)) job[action] = e.target.value;
    else if (action === 'mute') job.mute = e.target.checked;
    else return;
    closeTrial(); job.blob = null; refreshEstimates();
  });
  ui.jobs.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-action]'); if (!button) return;
    const job = jobs.find((item) => item.id === Number(button.dataset.id)); if (!job) return;
    if (button.dataset.action === 'download' && job.blob) { download(job.blob, job.filename); job.downloaded = true; }
    if (!idle()) return;
    if (button.dataset.action === 'remove') {
      if (job.blob && !job.downloaded && !confirm('此任务结果尚未下载，仍要移除？原文件不会删除。')) return;
      jobs.splice(jobs.indexOf(job), 1); closeTrial();
    }
    if (button.dataset.action === 'retry') retry(job);
    if (button.dataset.action === 'trial') { void runTrial(job); return; }
    render();
  });
  function retry(job) {
    job.progress = 0; job.message = '准备重新处理。';
    if (!job.inspected) enqueueInspect(job); else job.state = 'ready';
  }
  $('retry-all').onclick = () => { if (!idle()) return; for (const job of jobs) if (['error','canceled'].includes(job.state) && job.kind) retry(job); render(); status('已重新排队，请点击开始处理。'); };
  ui.clear.addEventListener('click', () => {
    if (!idle()) return;
    if (jobs.some(j => j.state === 'done' && j.blob && !j.downloaded) && !confirm('存在尚未下载的结果，仍要清除已完成任务？原文件不受影响。')) return;
    for (let i = jobs.length - 1; i >= 0; i--) if (jobs[i].state === 'done') jobs.splice(i, 1); closeTrial(); render();
  });
  ui.pause.addEventListener('click', () => { pauseAfterCurrent = true; status('当前任务完成后暂停队列。'); render(); });
  ui.cancel.addEventListener('click', () => {
    stopRequested = true; pauseAfterCurrent = true; if (activeJob) activeJob.canceled = true;
    status('正在取消当前项并停止队列；等待中的任务保留。浏览器解码阶段须等本阶段结束后释放。');
    cancelCurrent?.(); render();
    cancelPacking?.();
  });
  for (const setting of [ui.videoSize, ui.videoQuality, ui.audioBitrate, ui.imageSize, ui.imageQuality, $('name-prefix')]) setting.addEventListener('change', () => { closeTrial(); refreshEstimates(); });

  async function uniqueFile(directoryHandle, base) {
    const dot = base.lastIndexOf('.'); const stem = base.slice(0, dot); const ext = base.slice(dot);
    for (let n = 0; n < 1000; n++) {
      const name = n ? `${stem}-${n + 1}${ext}` : base;
      try { await directoryHandle.getFileHandle(name); }
      catch (error) { if (error.name === 'NotFoundError') return { name, handle: await directoryHandle.getFileHandle(name, { create: true }) }; throw error; }
    }
    throw Error('同名文件过多，请更换保存文件夹。');
  }
  async function saveBlob(job, blob, suggested) {
    canceled(job);
    if (job.preview) {
      if (blob.size > 16 * 1024 ** 2) throw Error('试处理结果超过 16 MB，请降低画面尺寸或质量。');
      job.blob = blob; return;
    }
    if (job.direct) {
      const dest = await uniqueFile(directory, suggested); const writer = await dest.handle.createWritable();
      try { canceled(job); await writer.write(blob); canceled(job); await writer.close(); }
      catch (error) { try { await writer.abort(); } catch (_) { /* writer may be closed */ } throw error; }
      job.filename = dest.name; job.blob = null;
    } else {
      if (blob.size > DOWNLOAD_LIMIT || jobs.reduce((s,j) => s + (j === job ? 0 : j.blob?.size || 0), 0) + blob.size > DOWNLOAD_LIMIT) throw Error(`临时结果合计超过 ${size(DOWNLOAD_LIMIT)}；请先下载并清除已完成项，或改用文件夹保存后重试。`);
      job.filename = suggested; job.blob = blob;
      if ($('auto-download').checked) { download(blob, suggested); job.downloaded = true; }
    }
  }
  async function convertImage(job) {
    const bitmap = await createImageBitmap(job.file);
    let width = bitmap.width, height = bitmap.height;
    const limit = job.settings.imageSize;
    if (limit && Math.max(width, height) > limit) { const ratio = limit / Math.max(width, height); width = Math.max(1, Math.round(width * ratio)); height = Math.max(1, Math.round(height * ratio)); }
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: job.format !== 'jpg' });
    if (job.format === 'jpg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); }
    ctx.drawImage(bitmap, 0, 0, width, height); bitmap.close();
    if (job.canceled) throw Error('已取消当前图片任务。');
    const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(Error('浏览器无法生成该图片格式。')), mime[job.format], job.settings.imageQuality));
    if (blob.type !== mime[job.format]) throw Error('浏览器未生成选定格式，已阻止错误下载。');
    if (job.canceled) throw Error('已取消当前图片任务。');
    await saveBlob(job, blob, job.filename);
    job.progress = 100;
  }
  async function convertMp3(job) {
    const maxSeconds = mobile ? 120 : 600, maxBytes = (mobile ? 32 : 80) * 1024 ** 2;
    if (job.file.size > maxBytes || job.duration === null || job.duration > maxSeconds) throw Error(`MP3 需要全量解码，限单文件 ${size(maxBytes)}、${maxSeconds/60} 分钟且须有可靠时长（短片试听也受此限制）；请选择 M4A / WAV 或桌面软件。`);
    const ctx = new OfflineAudioContext(2, 1, 44100);
    const buffer = await ctx.decodeAudioData(await job.file.arrayBuffer());
    if (buffer.duration > maxSeconds || buffer.numberOfChannels > 2) throw Error('MP3 编码素材超出当前浏览器限制，仅支持单声道或立体声。');
    if (job.canceled) throw Error('已取消当前任务。');
    const trim = range(job) || {start:0,end:buffer.duration};
    if (trim.end > buffer.duration + .05 || trim.start >= buffer.duration) throw Error('裁剪时间超过实际解码时长。');
    const planes = Array.from({ length: buffer.numberOfChannels }, (_, n) => buffer.getChannelData(n).slice(Math.round(trim.start * buffer.sampleRate), Math.min(buffer.length, Math.round(trim.end * buffer.sampleRate))));
    const blob = await new Promise((resolve, reject) => {
      const worker = new Worker('../audio/encode-worker.20260928.js');
      cancelCurrent = () => { job.canceled = true; worker.terminate(); reject(Error('已取消当前 MP3 转换。')); };
      worker.onmessage = ({ data }) => {
        if (data.progress !== undefined) { progress(job, data.progress); return; }
        worker.terminate(); cancelCurrent = null;
        if (data.error) reject(Error(data.error));
        else resolve(new Blob([data.buffer], { type: 'audio/mpeg' }));
      };
      worker.onerror = () => { worker.terminate(); cancelCurrent = null; reject(Error('MP3 编码组件加载失败。')); };
      worker.postMessage({ format: 'mp3', rate: 44100, bitrate: job.settings.audioBitrate, planes }, planes.map((plane) => plane.buffer));
    });
    if (job.canceled) throw Error('已取消当前任务。');
    await saveBlob(job, blob, job.filename);
    job.progress = 100;
  }
  async function convertMedia(job) {
    if (job.format === 'mp3') return convertMp3(job);
    const media = await loadMedia();
    const input = new media.Input({ source: new media.BlobSource(job.file), formats: media.ALL_FORMATS });
    let conversion, writer, target, completed = false;
    const direct = job.direct;
    try {
      canceled(job);
      if (!direct && !job.preview && job.file.size > DOWNLOAD_LIMIT) throw Error(`源文件超过普通下载模式 ${size(DOWNLOAD_LIMIT)} 限额；请选择直接保存到本地文件。`);
      target = direct ? new media.StreamTarget(new WritableStream({
        async write(chunk) { await writer.write({ type: 'write', position: chunk.position, data: chunk.data }); },
        async close() { await writer.close(); },
        async abort() { try { await writer.abort(); } catch (_) { /* already closed */ } }
      })) : new media.BufferTarget();
      const outputFormat = job.format === 'mp4' || job.format === 'm4a' ? new media.Mp4OutputFormat({ fastStart: false })
        : job.format === 'webm' ? new media.WebMOutputFormat() : new media.WavOutputFormat();
      const output = new media.Output({ format: outputFormat, target });
      const videoOptions = job.format === 'mp4' || job.format === 'webm'
        ? { codec: job.format === 'mp4' ? 'avc' : 'vp9', quality: new media.Quality(job.settings.videoQuality) } : { discard: true };
      if (job.kind === 'video' && !videoOptions.discard && job.settings.videoSize && Math.max(job.width, job.height) > job.settings.videoSize) {
        const ratio = job.settings.videoSize / Math.max(job.width, job.height);
        videoOptions.width = Math.max(2, Math.round(job.width * ratio / 2) * 2);
        videoOptions.height = Math.max(2, Math.round(job.height * ratio / 2) * 2);
      }
      const audioCodec = job.format === 'mp4' || job.format === 'm4a' ? 'aac' : job.format === 'webm' ? 'opus' : 'pcm-s16';
      const trim = range(job);
      if (job.preview && !trim) throw Error('此文件无法读取时长，请先填写结束秒数再试处理。');
      const mute = job.mute && !videoOptions.discard;
      conversion = await media.Conversion.init({ input, output, tracks: 'primary', video: videoOptions, ...(trim ? { trim } : {}),
        audio: mute ? { discard:true } : { codec: audioCodec, quality: new media.Quality({ bitrate: job.settings.audioBitrate * 1000 }) },
        copy: false, showWarnings: false });
      const sourceVideo = await input.getPrimaryVideoTrack(); const sourceAudio = await input.getPrimaryAudioTrack();
      const needVideo = job.format === 'mp4' || job.format === 'webm';
      if (!conversion.isValid || (needVideo && (!sourceVideo || !conversion.utilizedTracks.includes(sourceVideo))) ||
          (!mute && sourceAudio && !conversion.utilizedTracks.includes(sourceAudio))) {
        const reasons = conversion.discardedTracks.map(({ reason }) => reason).join(', ');
        throw Error(`此输入或目标编码在当前浏览器不可用${reasons ? `（${reasons}）` : ''}。`);
      }
      canceled(job);
      if (direct) {
        const dest = await uniqueFile(directory, job.filename);
        job.filename = dest.name; writer = await dest.handle.createWritable();
      } else {
        const budget = job.preview ? 16 * 1024 ** 2 : Math.max(0, DOWNLOAD_LIMIT - jobs.reduce((s,j) => s + (j === job ? 0 : j.blob?.size || 0), 0));
        target.onwrite = (data, offset) => { if (offset + data.byteLength > budget) { job.overLimit = true; void conversion.cancel(); } };
      }
      cancelCurrent = () => { job.canceled = true; void conversion.cancel(); };
      conversion.onProgress = (fraction) => {
        progress(job, fraction * 100);
      };
      canceled(job);
      await conversion.execute();
      if (job.canceled) throw Error('已取消当前任务。');
      if (job.overLimit) throw Error('输出超过临时内存预算；请降低质量或选择文件夹保存。');
      if (!direct) {
        if (!target.buffer) throw Error('没有生成输出文件。');
        await saveBlob(job, new Blob([target.buffer], { type: mime[job.format] }), job.filename);
      } else job.blob = null;
      completed = true; job.progress = 100;
    } finally {
      cancelCurrent = null;
      if (!completed && writer) { try { await writer.abort(); } catch (_) { /* already closed */ } }
      input.dispose();
    }
  }
  async function runQueue() {
    if (!idle() || inspecting > 0) return;
    const direct = ui.saveMode.value === 'file';
    const snapshot = settings();
    directory = null; running = true; pauseAfterCurrent = false; stopRequested = false; closeTrial(); render();
    try {
      if (direct) {
        try { directory = await window.showDirectoryPicker({ mode: 'readwrite' }); }
        catch (error) { status(error.name === 'AbortError' ? '已取消选择文件夹，任务未开始。' : `无法选择保存文件夹：${error.message}`, error.name !== 'AbortError'); return; }
      }
      for (const job of jobs) {
        if (pauseAfterCurrent || stopRequested) break;
        if (job.state !== 'ready') continue;
        if (!formatSupported(job, job.format)) { job.state = 'error'; job.message = '该目标格式在此浏览器不可用。'; render(); continue; }
        job.state = 'running'; job.progress = 0; job.canceled = false; job.overLimit = false; job.downloaded = false; job.settings = snapshot; job.direct = direct; activeJob = job; job.message = '正在本地处理，文件未上传。'; render();
        status(`正在转换：${job.file.name}`);
        try {
          job.filename = outputName(job);
          if (job.kind !== 'image') range(job);
          if (job.kind === 'image') { cancelCurrent = () => { job.canceled = true; }; await convertImage(job); }
          else await convertMedia(job);
          canceled(job);
          job.state = 'done'; job.message = `已生成 ${job.filename}。请打开成品核对画面、声音或图片质量。`;
        } catch (error) {
          job.state = job.canceled || (error.name === 'ConversionCanceledError' && !job.overLimit) ? 'canceled' : 'error';
          job.message = job.overLimit ? `输出超过临时结果 ${size(DOWNLOAD_LIMIT)} 合计预算，请下载并清除已完成项或改用文件夹保存。` : error.message || '转换未完成。';
        } finally { cancelCurrent = null; activeJob = null; render(); }
      }
      status(stopRequested ? '队列已停止；等待项未运行，取消项可重新排队。' : pauseAfterCurrent ? '队列已暂停，点击“开始处理”继续。' : '队列处理完毕；失败任务可单独重新排队。');
    } finally { running = false; directory = null; activeJob = null; pauseAfterCurrent = false; render(); }
  }
  ui.start.addEventListener('click', () => { void runQueue(); });

  async function runTrial(original) {
    if (!idle() || original.state !== 'ready') return;
    closeTrial(); running = true; stopRequested = false; pauseAfterCurrent = false;
    const job = { ...original, settings: settings(), preview:true, direct:false, blob:null, canceled:false, overLimit:false };
    activeJob = job; original.state = 'running'; original.progress = 0; original.message = '正在生成前 5 秒成品试听 / 试看…'; render();
    try {
      await convertMedia(job); canceled(job);
      if (!(job.blob instanceof Blob)) throw Error('没有生成试处理结果。');
      trialUrl = URL.createObjectURL(job.blob); $('trial-player').src = trialUrl;
      $('trial-player').classList.toggle('audio-trial', !['mp4','webm'].includes(job.format));
      $('trial-title').textContent = `${original.file.name} · 前 5 秒 · ${labels[job.format]}`;
      $('trial-panel').hidden = false;
      original.message = '试处理已生成，播放试听 / 试看后可开始完整处理；本项仍在队列中。'; status(original.message);
    } catch (error) {
      original.message = job.canceled || stopRequested ? '已取消试处理，完整任务未执行。' : `试处理失败：${error.message}`; status(original.message, !job.canceled && !stopRequested);
    } finally { original.state = 'ready'; original.progress = 0; running = false; activeJob = null; cancelCurrent = null; pauseAfterCurrent = false; render(); }
  }

  // Packaging is serial and worker-backed; original File references remain local.
  async function zipDone() {
    if (!idle()) return;
    const selected = jobs.filter((job) => job.state === 'done' && job.blob);
    if (!selected.length) return;
    if (selected.reduce((sum, job) => sum + job.blob.size, 0) > ZIP_LIMIT) { status(`已完成文件合计超过 ${size(ZIP_LIMIT)}，无法在浏览器内打包；请单独下载。`, true); return; }
    packing = true; render(); status('正在本地打包已完成的小文件…');
    try {
      const blob = await new Promise((resolve,reject) => {
        const worker = new Worker('zip-worker.20261009.js');
        const finish = (error,value) => { worker.terminate(); cancelPacking=null; error ? reject(error) : resolve(value); };
        cancelPacking = () => finish(Error('已取消打包，原结果保留。'));
        worker.onerror = () => finish(Error('打包组件加载失败，仍可逐项下载。'));
        worker.onmessage = ({data}) => {
          if (data.progress != null) { status(`正在本地打包：${data.progress}%`); return; }
          finish(data.error ? Error(data.error) : null,data.blob);
        };
        worker.postMessage({files:selected.map(job=>({name:job.filename,blob:job.blob}))});
      });
      download(blob, 'converted-files.zip');
      selected.forEach(job => { job.downloaded = true; });
      status(`已打包 ${selected.length} 个本地结果。`);
    } catch (error) { status(`打包失败：${error.message}`, true); }
    finally { cancelPacking=null; packing = false; render(); }
  }
  ui.zip.addEventListener('click', () => { void zipDone(); });
  window.MediaWorkbench = {
    busy: () => !idle(),
    accept: async file => {
      if (!idle() || jobs.length >= LIMIT) throw Error('队列忙或已满，请稍后重新接收。');
      addFiles([file]); await inspectionTail;
    },
    project: () => ({ ...settings() }),
    restore: async () => { throw Error('队列素材仅保留在当前页，请重新选择文件。'); },
  };
  window.addEventListener('beforeunload', event => {
    if (running || packing || inspecting || jobs.some(j => j.blob && !j.downloaded)) { event.preventDefault(); event.returnValue = ''; }
  });
  window.addEventListener('pagehide', () => { stopRequested = true; if (activeJob) activeJob.canceled = true; cancelCurrent?.(); cancelPacking?.(); closeTrial(); });
  render();
})();
