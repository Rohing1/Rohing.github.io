export const MAX_CUES = 1200;
export const MAX_CHAPTERS = 200;

export function parseTime(value) {
  if (typeof value !== 'string') return NaN;
  const match = value.trim().match(/^(?:(\d{1,3}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/);
  if (!match) return NaN;
  const [, hours, minutes, seconds, fraction = '0'] = match;
  if (+minutes > 59 || +seconds > 59) return NaN;
  return +(+(hours || 0) * 3600 + +minutes * 60 + +seconds + +fraction.padEnd(3, '0') / 1000).toFixed(3);
}

export function formatTime(seconds, separator = '.') {
  if (!Number.isFinite(seconds) || seconds < 0) throw Error('时间不能为负数');
  const total = Math.round(seconds * 1000);
  const pad = (value, length = 2) => String(value).padStart(length, '0');
  return `${pad(Math.floor(total / 3600000))}:${pad(Math.floor(total / 60000) % 60)}:${pad(Math.floor(total / 1000) % 60)}${separator}${pad(total % 1000, 3)}`;
}

export function normalizeCue(raw) {
  if (!raw || typeof raw !== 'object') throw Error('字幕格式无效');
  const start = typeof raw.start === 'number' ? raw.start : parseTime(raw.start);
  const end = typeof raw.end === 'number' ? raw.end : parseTime(raw.end);
  const text = String(raw.text ?? '').replace(/\r\n?/g, '\n').trim();
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > 48 * 3600) throw Error('字幕时间无效');
  if (!text || text.length > 500 || text.split('\n').length > 4) throw Error('字幕内容须为 1–500 字，最多 4 行');
  return { id: typeof raw.id === 'string' && raw.id.length < 100 ? raw.id : '', start, end, text };
}

export function normalizeChapter(raw) {
  if (!raw || typeof raw !== 'object') throw Error('章节格式无效');
  const time = typeof raw.time === 'number' ? raw.time : parseTime(raw.time);
  const title = String(raw.title ?? '').trim();
  if (!Number.isFinite(time) || time < 0 || time > 48 * 3600 || !title || title.length > 100 || /[\r\n]/.test(title)) throw Error('章节时间或标题无效');
  return { id: typeof raw.id === 'string' && raw.id.length < 100 ? raw.id : '', time, title };
}

export function parseSubtitles(input) {
  const source = String(input).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!source) throw Error('字幕文件为空');
  if (source.length > 2_000_000) throw Error('字幕文件过大');
  const blocks = source.replace(/^WEBVTT[^\n]*\n/, '').split(/\n\s*\n/);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split('\n').map(line => line.trimEnd());
    if (!lines.length || /^(NOTE|STYLE|REGION)(\s|$)/.test(lines[0])) continue;
    const index = lines.findIndex(line => line.includes('-->'));
    if (index < 0) continue;
    const times = lines[index].match(/^\s*(\S+)\s+-->\s+(\S+)/);
    if (!times) throw Error('字幕时间轴格式无效');
    const cue = normalizeCue({ start: times[1], end: times[2], text: lines.slice(index + 1).join('\n') });
    cues.push(cue);
    if (cues.length > MAX_CUES) throw Error(`最多导入 ${MAX_CUES} 条字幕`);
  }
  if (!cues.length) throw Error('没有找到有效的 SRT/VTT 字幕');
  return cues.sort((a, b) => a.start - b.start || a.end - b.end);
}

export function toSrt(cues) {
  return cues.map((raw, index) => {
    const cue = normalizeCue(raw);
    return `${index + 1}\r\n${formatTime(cue.start, ',')} --> ${formatTime(cue.end, ',')}\r\n${cue.text.replace(/\n/g, '\r\n')}`;
  }).join('\r\n\r\n') + '\r\n';
}

export function toVtt(cues) {
  return 'WEBVTT\n\n' + cues.map(raw => {
    const cue = normalizeCue(raw);
    return `${formatTime(cue.start)} --> ${formatTime(cue.end)}\n${cue.text}`;
  }).join('\n\n') + '\n';
}

export function chaptersToVtt(chapters, duration) {
  const sorted = chapters.map(normalizeChapter).sort((a, b) => a.time - b.time);
  if (!sorted.length) throw Error('还没有章节');
  const endOfVideo = Number.isFinite(duration) && duration > 0 ? duration : sorted.at(-1).time + 60;
  return 'WEBVTT\n\n' + sorted.map((chapter, index) => {
    const next = index + 1 < sorted.length ? sorted[index + 1].time : endOfVideo;
    if (next <= chapter.time) throw Error('章节时间必须递增且不能重复');
    return `${formatTime(chapter.time)} --> ${formatTime(next)}\n${chapter.title}`;
  }).join('\n\n') + '\n';
}

export function validProject(value) {
  if (value?.app !== 'yj-subtitles-studio' || value.version !== 1 || !Array.isArray(value.cues) || !Array.isArray(value.chapters) || value.cues.length > MAX_CUES || value.chapters.length > MAX_CHAPTERS) throw Error('备份格式不正确');
  const cues = value.cues.map(normalizeCue), chapters = value.chapters.map(normalizeChapter);
  for (const items of [cues, chapters]) {
    const ids = items.map(item => item.id).filter(Boolean);
    if (new Set(ids).size !== ids.length) throw Error('备份含重复 ID');
  }
  return { cues, chapters };
}
