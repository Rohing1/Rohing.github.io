export const KINDS = ['cover', 'blur', 'mosaic', 'box', 'arrow', 'text'];
export const MAX_OVERLAYS = 120;

export function normalizeOverlay(raw) {
  if (!raw || !KINDS.includes(raw.kind)) throw Error('区域类型无效');
  const values = ['start', 'end', 'x', 'y', 'w', 'h'].map(key => Number(raw[key]));
  const [start, end, x, y, w, h] = values;
  if (values.some(value => !Number.isFinite(value)) || start < 0 || end <= start || end > 4 * 3600) throw Error('区域时间无效');
  if (x < 0 || y < 0 || w < .01 || h < .01 || x + w > 1.001 || y + h > 1.001) throw Error('区域位置或大小无效');
  const text = String(raw.text ?? '').trim();
  if (text.length > 80 || (raw.kind === 'text' && !text)) throw Error('标注文字须为 1–80 字');
  return { id: typeof raw.id === 'string' && raw.id.length < 100 ? raw.id : '', kind: raw.kind, start, end, x, y, w, h, text };
}

export function activeOverlays(overlays, time) {
  // Keep the boundary frame covered, including a mask ending at video.duration.
  return overlays.filter(overlay => time >= overlay.start - 1 / 30 && time <= overlay.end + 1 / 30);
}

export function validBackup(value) {
  if (value?.app !== 'yj-video-redact' || value.version !== 1 || !Array.isArray(value.overlays) || value.overlays.length > MAX_OVERLAYS) throw Error('备份格式不正确');
  const overlays = value.overlays.map(normalizeOverlay);
  const ids = overlays.map(item => item.id).filter(Boolean);
  if (new Set(ids).size !== ids.length) throw Error('备份含重复 ID');
  return overlays;
}

export function formatClock(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const pad = number => String(number).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}

export function drawOutput(ctx, video, overlays, time, scratch) {
  const width = ctx.canvas.width, height = ctx.canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(video, 0, 0, width, height);
  const active = activeOverlays(overlays, time);
  const masks = active.filter(item => ['cover', 'blur', 'mosaic'].includes(item.kind));
  const marks = active.filter(item => !['cover', 'blur', 'mosaic'].includes(item.kind));
  for (const item of [...masks, ...marks]) {
    const x = Math.round(item.x * width), y = Math.round(item.y * height);
    const w = Math.max(1, Math.round(item.w * width)), h = Math.max(1, Math.round(item.h * height));
    ctx.save();
    if (item.kind === 'cover') {
      ctx.fillStyle = '#07111c'; ctx.fillRect(x, y, w, h);
    } else if (item.kind === 'blur') {
      ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      ctx.filter = `blur(${Math.max(12, Math.round(width * .024))}px)`;
      ctx.drawImage(video, 0, 0, width, height);
      ctx.filter = 'none';
    } else if (item.kind === 'mosaic') {
      const smallW = Math.max(1, Math.floor(w / 18)), smallH = Math.max(1, Math.floor(h / 18));
      scratch.width = smallW; scratch.height = smallH;
      const small = scratch.getContext('2d', { willReadFrequently: false });
      small.drawImage(video, item.x * video.videoWidth, item.y * video.videoHeight,
        item.w * video.videoWidth, item.h * video.videoHeight, 0, 0, smallW, smallH);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(scratch, x, y, w, h);
      ctx.imageSmoothingEnabled = true;
    } else if (item.kind === 'box') {
      ctx.strokeStyle = '#ffd166'; ctx.lineWidth = Math.max(3, width * .005); ctx.strokeRect(x, y, w, h);
    } else if (item.kind === 'arrow') {
      const size = Math.max(12, width * .024), angle = Math.atan2(h, w);
      ctx.strokeStyle = '#ffd166'; ctx.fillStyle = '#ffd166'; ctx.lineWidth = Math.max(4, width * .006);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + w, y + h);
      ctx.lineTo(x + w - size * Math.cos(angle - .55), y + h - size * Math.sin(angle - .55));
      ctx.lineTo(x + w - size * Math.cos(angle + .55), y + h - size * Math.sin(angle + .55));
      ctx.closePath(); ctx.fill();
    } else if (item.kind === 'text') {
      const font = Math.max(18, Math.round(width * .032));
      ctx.font = `700 ${font}px system-ui, sans-serif`;
      const label = item.text;
      const textWidth = Math.min(width - x - 8, ctx.measureText(label).width + 18);
      ctx.fillStyle = '#07111cdd'; ctx.fillRect(x, y, Math.max(30, textWidth), font * 1.55);
      ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'top'; ctx.fillText(label, x + 8, y + 5, Math.max(20, textWidth - 16));
    }
    ctx.restore();
  }
}
