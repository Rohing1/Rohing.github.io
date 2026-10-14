export function parseCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else cell += char;
    } else if (char === '"' && cell === '' && !closed) quoted = true;
    else if (char === ',' || char === '\n' || char === '\r') {
      row.push(cell); cell = ''; closed = false;
      if (char !== ',') { if (char === '\r' && text[i + 1] === '\n') i++; if (row.some(value => value !== '')) rows.push(row); row = []; }
    } else if (closed || char === '"') throw Error('CSV 引号格式无效');
    else cell += char;
  }
  if (quoted) throw Error('CSV 引号未闭合');
  row.push(cell); if (row.some(value => value !== '')) rows.push(row);
  return rows;
}

export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
