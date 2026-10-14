import { MAX_CUES, MAX_CHAPTERS, parseTime, formatTime, normalizeCue, normalizeChapter, parseSubtitles, toSrt, toVtt, chaptersToVtt, validProject } from 'subtitles-model.js';

const KEY = 'yj-subtitles-studio-v1';
const $ = id => document.getElementById(id);
const video = $('video');
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let project = { cues: [], chapters: [] };
let videoUrl = null;let sourceFile=null;
let editingCue = null;
let editingChapter = null;

function message(text, error = false) {
  $('status').textContent = text;
  $('status').className = `media-status${error ? ' error' : ''}`;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ app: 'yj-subtitles-studio', version: 1, ...project }));
    message('字幕和章节文本已保存在此浏览器；请定期导出完整备份。');
  } catch {
    message('浏览器保存失败！请立即导出完整备份。', true);
  }
}

function download(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function button(label, action, title = '') {
  const element = document.createElement('button');
  element.type = 'button'; element.textContent = label; element.title = title || label;
  element.addEventListener('click', action);
  return element;
}

function clearCueForm() {
  editingCue = null;
  $('cue-start').value = '00:00:00.000';
  $('cue-end').value = '00:00:03.000';
  $('cue-text').value = '';
  $('add-cue').textContent = '添加字幕';
  $('cancel-cue').hidden = true;
}

function clearChapterForm() {
  editingChapter = null;
  $('chapter-time').value = '00:00:00.000';
  $('chapter-title').value = '';
  $('add-chapter').textContent = '添加章节';
  $('cancel-chapter').hidden = true;
}

function seek(time) {
  if (!video.src || !Number.isFinite(video.duration)) {
    message('先选择视频才能跳转播放位置。', true);
    return;
  }
  video.currentTime = Math.min(time, Math.max(0, video.duration - .01));
  video.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function render() {
  project.cues.sort((a, b) => a.start - b.start || a.end - b.end);
  project.chapters.sort((a, b) => a.time - b.time);
  $('cue-count').textContent = `${project.cues.length} 条`;
  $('chapter-count').textContent = `${project.chapters.length} 个`;
  const cueList = $('cues'); cueList.replaceChildren();
  if (!project.cues.length) {
    const empty = document.createElement('div'); empty.className = 'media-empty'; empty.textContent = '尚无字幕。可添加一条，或导入 SRT / VTT。'; cueList.append(empty);
  }
  for (const cue of project.cues) {
    const item = document.createElement('div'); item.className = 'media-item';
    const head = document.createElement('div'); head.className = 'media-item-head';
    const title = document.createElement('strong'); title.textContent = `${formatTime(cue.start)} → ${formatTime(cue.end)}`;
    const actions = document.createElement('div'); actions.className = 'media-item-actions';
    actions.append(button('跳转', () => seek(cue.start)), button('编辑', () => {
      editingCue = cue.id; $('cue-start').value = formatTime(cue.start); $('cue-end').value = formatTime(cue.end); $('cue-text').value = cue.text;
      $('add-cue').textContent = '保存字幕'; $('cancel-cue').hidden = false; $('cue-text').focus();
    }), button('删除', () => {
      if (!confirm('删除这条字幕？')) return;
      project.cues = project.cues.filter(row => row.id !== cue.id);
      if (editingCue === cue.id) clearCueForm(); save(); render();
    }));
    head.append(title, actions);
    const content = document.createElement('p'); content.textContent = cue.text;
    item.append(head, content); cueList.append(item);
  }
  const chapterList = $('chapters'); chapterList.replaceChildren();
  if (!project.chapters.length) {
    const empty = document.createElement('div'); empty.className = 'media-empty'; empty.textContent = '尚无章节。给长视频加几个定位点吧。'; chapterList.append(empty);
  }
  for (const chapter of project.chapters) {
    const item = document.createElement('div'); item.className = 'media-item';
    const head = document.createElement('div'); head.className = 'media-item-head';
    const title = document.createElement('strong'); title.textContent = `${formatTime(chapter.time)} · ${chapter.title}`;
    const actions = document.createElement('div'); actions.className = 'media-item-actions';
    actions.append(button('跳转', () => seek(chapter.time)), button('编辑', () => {
      editingChapter = chapter.id; $('chapter-time').value = formatTime(chapter.time); $('chapter-title').value = chapter.title;
      $('add-chapter').textContent = '保存章节'; $('cancel-chapter').hidden = false; $('chapter-title').focus();
    }), button('删除', () => {
      if (!confirm('删除这个章节？')) return;
      project.chapters = project.chapters.filter(row => row.id !== chapter.id);
      if (editingChapter === chapter.id) clearChapterForm(); save(); render();
    }));
    head.append(title, actions); item.append(head); chapterList.append(item);
  }
  updatePreview();
}

function updatePreview() {
  const time = video.currentTime || 0;
  $('playhead').textContent = formatTime(time);
  const active = project.cues.find(cue => time >= cue.start && time < cue.end);
  $('caption-preview').textContent = active?.text || '';
}

function addCue() {
  try {
    const cue = normalizeCue({ id: editingCue || uid(), start: $('cue-start').value, end: $('cue-end').value, text: $('cue-text').value });
    if (video.src && Number.isFinite(video.duration) && cue.end > video.duration + .5) throw Error('字幕结束时间超出了当前视频长度');
    if (!editingCue && project.cues.length >= MAX_CUES) throw Error(`最多保存 ${MAX_CUES} 条字幕`);
    const index = project.cues.findIndex(row => row.id === editingCue);
    if (editingCue && index < 0) throw Error('正在编辑的字幕已不存在');
    if (index >= 0) project.cues[index] = cue; else project.cues.push(cue);
    clearCueForm(); save(); render();
  } catch (error) { message(error.message, true); }
}

function addChapter() {
  try {
    const chapter = normalizeChapter({ id: editingChapter || uid(), time: $('chapter-time').value, title: $('chapter-title').value });
    if (video.src && Number.isFinite(video.duration) && chapter.time >= video.duration) throw Error('章节时间必须早于视频结束');
    if (!editingChapter && project.chapters.length >= MAX_CHAPTERS) throw Error(`最多保存 ${MAX_CHAPTERS} 个章节`);
    if (project.chapters.some(row => row.id !== editingChapter && Math.abs(row.time - chapter.time) < .001)) throw Error('同一时间不能设置两个章节');
    const index = project.chapters.findIndex(row => row.id === editingChapter);
    if (editingChapter && index < 0) throw Error('正在编辑的章节已不存在');
    if (index >= 0) project.chapters[index] = chapter; else project.chapters.push(chapter);
    clearChapterForm(); save(); render();
  } catch (error) { message(error.message, true); }
}

$('video-file').addEventListener('change', event => {
  const file = event.target.files?.[0]; if (!file) return;
  if (!file.type.startsWith('video/') && !/\.(mp4|webm|mov)$/i.test(file.name)) { message('请选择视频文件。', true); return; }
  video.pause();
  if (videoUrl) URL.revokeObjectURL(videoUrl);
  sourceFile=file;videoUrl = URL.createObjectURL(file); video.src = videoUrl;
  $('video-placeholder').hidden = true;
  $('video-info').textContent = `${file.name} · ${(file.size / 1048576).toFixed(1)} MB · 仅本机预览`;
  video.load(); event.target.value = '';
});
video.addEventListener('loadedmetadata', () => {
  $('video-info').textContent += ` · ${formatTime(video.duration)}`;
  updatePreview();
});
video.addEventListener('error', () => message('浏览器无法解码此视频，请换用支持的 MP4 / WebM 文件。', true));
video.addEventListener('timeupdate', updatePreview);
video.addEventListener('seeked', updatePreview);
video.addEventListener('play', () => { const loop = () => { updatePreview(); if (!video.paused && !video.ended) requestAnimationFrame(loop); }; requestAnimationFrame(loop); });

$('cue-at-playhead').addEventListener('click', () => {
  const start = video.currentTime || 0; $('cue-start').value = formatTime(start);
  $('cue-end').value = formatTime(Math.min(start + 3, Number.isFinite(video.duration) ? video.duration : start + 3));
});
$('chapter-at-playhead').addEventListener('click', () => { $('chapter-time').value = formatTime(video.currentTime || 0); });
$('add-cue').addEventListener('click', addCue);
$('add-chapter').addEventListener('click', addChapter);
$('cancel-cue').addEventListener('click', clearCueForm);
$('cancel-chapter').addEventListener('click', clearChapterForm);
$('subtitle-file').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    if (file.size > 2_000_000) throw Error('字幕文件不能超过 2 MB');
    const parsed = parseSubtitles(await file.text()).map(cue => ({ ...cue, id: uid() }));
    if (project.cues.length && !confirm(`导入会替换当前 ${project.cues.length} 条字幕；章节不变。是否继续？`)) return;
    project.cues = parsed; clearCueForm(); save(); render(); message(`已导入 ${parsed.length} 条字幕；请校对时间和内容。`);
  } catch (error) { message(error.message, true); }
  finally { event.target.value = ''; }
});

$('export-srt').addEventListener('click', () => {
  try { if (!project.cues.length) throw Error('还没有可导出的字幕'); download('字幕.srt', '\uFEFF' + toSrt(project.cues), 'application/x-subrip;charset=utf-8'); }
  catch (error) { message(error.message, true); }
});
$('export-vtt').addEventListener('click', () => {
  try { if (!project.cues.length) throw Error('还没有可导出的字幕'); download('字幕.vtt', toVtt(project.cues), 'text/vtt;charset=utf-8'); }
  catch (error) { message(error.message, true); }
});
$('export-chapters').addEventListener('click', () => {
  try { download('章节.vtt', chaptersToVtt(project.chapters, video.duration), 'text/vtt;charset=utf-8'); }
  catch (error) { message(error.message, true); }
});
$('backup').addEventListener('click', () => download('%e5%ad%97%e5%b9%95%e4%b8%8e%e7%ab%a0%e8%8a%82-%e5%ae%8c%e6%95%b4%e5%a4%87%e4%bb%bd.json.html', JSON.stringify({ app: 'yj-subtitles-studio', version: 1, exportedAt: new Date().toISOString(), ...project }, null, 2), 'application/json;charset=utf-8'));
$('restore').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    if (file.size > 2_000_000) throw Error('备份不能超过 2 MB');
    const next = validProject(JSON.parse(await file.text()));
    if (!confirm('恢复会替换当前字幕和章节文本；当前视频不会改变。是否继续？')) return;
    project = { cues: next.cues.map(cue => ({ ...cue, id: cue.id || uid() })), chapters: next.chapters.map(chapter => ({ ...chapter, id: chapter.id || uid() })) };
    clearCueForm(); clearChapterForm(); save(); render(); message('字幕与章节备份已恢复；请重新载入对应视频校对。');
  } catch (error) { message(error.message, true); }
  finally { event.target.value = ''; }
});

try {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    const saved = validProject(JSON.parse(raw));
    project = { cues: saved.cues.map(cue => ({ ...cue, id: cue.id || uid() })), chapters: saved.chapters.map(chapter => ({ ...chapter, id: chapter.id || uid() })) };
    message('已载入此浏览器保存的字幕和章节；视频仍需重新选择。');
  }
} catch { message('本机字幕记录无法读取；请使用完整备份恢复。', true); }
render();
window.addEventListener('beforeunload', () => { if (videoUrl) URL.revokeObjectURL(videoUrl); });

window.MediaWorkbench={busy:()=>false,source:()=>sourceFile,project:()=>({...JSON.parse(JSON.stringify(project)),source:sourceFile?{name:sourceFile.name,size:sourceFile.size}:null}),restore:async v=>{const next=validProject({...v,app:'yj-subtitles-studio',version:1});project={cues:next.cues.map(c=>({...c,id:c.id||uid()})),chapters:next.chapters.map(c=>({...c,id:c.id||uid()}))};clearCueForm();clearChapterForm();save();render();message('工程参数已恢复，请选择对应原视频并核对时间。');},accept:async f=>{if(!f.type.startsWith('video/')&&!/\.(mp4|webm|mov)$/i.test(f.name))throw Error('请选择视频文件');const input=$('video-file'),dt=new DataTransfer();dt.items.add(f);const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{clean();reject(Error('视频预览超时，暂存素材保留'));},15000);const done=()=>{clean();resolve();},fail=()=>{clean();reject(Error('浏览器无法解码，暂存素材保留'));},clean=()=>{clearTimeout(timer);video.removeEventListener('loadedmetadata',done);video.removeEventListener('error',fail);};video.addEventListener('loadedmetadata',done);video.addEventListener('error',fail);});input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));await ready;}};
