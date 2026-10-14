import { BUILTIN as BASE_BUILTIN } from 'commands-library.20261001.js';
import { loadNetworkIndex } from 'network-library.20261001.js';
import { searchCatalog, validateCustom } from 'catalog4bea.js?v=20261001';
import { parseCsv, csvCell } from '../network-csv.20261001.js';

const $ = id => document.getElementById(id);
const DATABASE = 'yj-command-reference-v1';
const LIMIT = 10000;
const PAGE_SIZE = 50;
let database = null, custom = [], favorites = new Set(), page = 0, matches = [], storeQueue = Promise.resolve(), searchTimer = null, networkLoaded = false;
let BUILTIN = BASE_BUILTIN;
let networkCount = BASE_BUILTIN.filter(item => item.platform !== 'Linux').length;

function status(text, type = '') { $('form-message').textContent = text; $('form-message').className = `command-message ${type}`; }
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('data');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function getSaved() {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('data', 'readonly');
    const request = transaction.objectStore('data').get('library');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function putSaved(snapshot) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('data', 'readwrite');
    transaction.objectStore('data').put(snapshot, 'library');
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
function save() {
  if (!database) return Promise.resolve(false);
  const snapshot = { app: 'yj-command-reference', version: 1, commands: custom, favorites: [...favorites] };
  storeQueue = storeQueue.catch(() => {}).then(() => putSaved(snapshot));
  return storeQueue.then(() => {
    $('save-status').textContent = '个人命令和收藏已保存在此浏览器。';
    return true;
  }, error => {
    $('save-status').textContent = '本机保存失败，请立即导出完整备份。';
    status(`保存失败：${error.message}`, 'error');
    return false;
  });
}
function download(name, value) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function downloadCsv(name, rows) {
  const content = '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function validateSet(raw) {
  if (!Array.isArray(raw) || raw.length > LIMIT) throw Error(`个人命令不能超过 ${LIMIT.toLocaleString()} 条`);
  const entries = raw.map(validateCustom);
  const keys = new Set(), ids = new Set();
  for (const item of entries) {
    const key = `${item.platform.toLocaleLowerCase()}\u0000${item.command.toLocaleLowerCase()}`;
    if (keys.has(key)) throw Error(`同平台出现重复命令：${item.command}`);
    keys.add(key);
    if (ids.has(item.id)) throw Error('个人命令 ID 重复');
    ids.add(item.id);
  }
  return entries;
}
function renderFilters() {
  const platform = $('platform').value, category = $('category').value;
  const all = [...BUILTIN, ...custom];
  $('platform').replaceChildren(new Option('全部平台', ''));
  for (const value of [...new Set(all.map(item => item.platform))].sort((a, b) => a.localeCompare(b, 'zh'))) $('platform').add(new Option(value, value));
  if ([...$('platform').options].some(option => option.value === platform)) $('platform').value = platform;
  const categories = all.filter(item => !$('platform').value || item.platform === $('platform').value).map(item => item.category);
  $('category').replaceChildren(new Option('全部分类', ''));
  for (const value of [...new Set(categories)].sort((a, b) => a.localeCompare(b, 'zh'))) $('category').add(new Option(value, value));
  if ([...$('category').options].some(option => option.value === category)) $('category').value = category;
}
function button(text, action, label = text) {
  const element = document.createElement('button'); element.type = 'button'; element.textContent = text; element.setAttribute('aria-label', label); element.addEventListener('click', action); return element;
}
function renderResults() {
  $('builtin-count').textContent = BUILTIN.length.toLocaleString();
  $('network-count').textContent = networkCount.toLocaleString();
  $('custom-count').textContent = custom.length.toLocaleString();
  const filters = { query: $('query').value, platform: $('platform').value, category: $('category').value, safety: $('safety').value, favorites: $('only-favorites').checked ? favorites : null };
  matches = searchCatalog([...BUILTIN, ...custom], filters);
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  page = Math.min(page, pages - 1);
  $('result-count').textContent = `找到 ${matches.length.toLocaleString()} 条 · 内置 ${BUILTIN.length.toLocaleString()} 条（网络 ${networkCount.toLocaleString()} · Linux ${(BUILTIN.length - networkCount).toLocaleString()}）`;
  $('page-status').textContent = `${page + 1} / ${pages}`;
  $('prev').disabled = page === 0; $('next').disabled = page >= pages - 1;
  const root = $('results'); root.replaceChildren();
  if (!matches.length) { const empty = document.createElement('div'); empty.className = 'command-empty'; empty.textContent = '没有匹配项。试试缩短关键字、切换平台，或加入自己的命令。'; root.append(empty); return; }
  for (const item of matches.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) {
    const card = document.createElement('article'); card.className = `command-card${item.origin === 'official-index' ? ' official-index' : ''}`;
    const top = document.createElement('div'); top.className = 'command-card-top';
    const code = document.createElement('code'); code.textContent = item.command;
    const badge = document.createElement('span'); badge.className = `command-badge ${item.safety === 'read' ? '' : item.safety}`; badge.textContent = { read: '查询 / 只读', change: '改变状态', high: '高风险', unknown: '风险待核对' }[item.safety];
    top.append(code, badge);
    const title = document.createElement('p'); title.textContent = item.title;
    const origin = item.id.startsWith('u-') ? '我的条目' : item.origin === 'tldr' ? `tldr-pages ${item.locale === 'zh' ? '中文' : '英文'}` : item.origin === 'official-index' ? '官方语法索引' : '中文精选';
    const scope = item.origin === 'official-index' ? ` · ${item.family} · ${item.version}${item.mode ? ` · ${item.mode}` : ''}` : '';
    const meta = document.createElement('small'); meta.textContent = `${item.platform} · ${item.category} · ${origin}${scope}`;
    card.append(top, title, meta);
    if (item.note) { const note = document.createElement('p'); note.className = 'note'; note.textContent = `注意：${item.note}`; card.append(note); }
    if (item.origin === 'tldr' && item.command.includes('{{')) { const note = document.createElement('p'); note.className = 'note'; note.textContent = '这是命令模板；复制后须替换 {{…}} 占位符，并核对适用版本。'; card.append(note); }
    if (item.origin === 'official-index') { const note = document.createElement('p'); note.className = 'note'; note.textContent = '仅为官方目录中的命令名称，可能缺少参数或视图前提；不要直接在设备执行。'; card.append(note); }
    const actions = document.createElement('div'); actions.className = 'command-card-actions';
    actions.append(button(item.origin === 'official-index' ? '复制名称' : '复制', async () => {
      if (item.safety === 'high' && !window.confirm('这是高风险命令。已核对目标、参数和回退方案，再复制？')) return;
      try { await navigator.clipboard.writeText(item.command); status(item.origin === 'official-index' ? '命令名称已复制；请打开官方原文核对完整语法、视图和适用版本，勿直接执行。' : '命令已复制；执行前请修改示例参数并核对适用版本。', 'success'); }
      catch { status('浏览器未允许复制，请手动选择命令文本。', 'error'); }
    }, `复制 ${item.command}`));
    actions.append(button(favorites.has(item.id) ? '★ 已收藏' : '☆ 收藏', async () => {
      if (favorites.has(item.id)) favorites.delete(item.id); else favorites.add(item.id);
      await save(); renderResults();
    }, `收藏 ${item.command}`));
    if (item.source) { const link = document.createElement('a'); link.href = item.source; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = item.origin === 'tldr' ? '社区原页 ↗' : item.origin === 'official-index' ? '官方原文 ↗' : item.id.startsWith('u-') ? '参考链接 ↗' : '官方资料 ↗'; actions.append(link); }
    if (item.id.startsWith('u-')) actions.append(button('删除', async () => {
      if (!window.confirm(`删除个人命令“${item.command}”？请先导出完整备份。`)) return;
      custom = custom.filter(entry => entry.id !== item.id); favorites.delete(item.id); await save(); renderFilters(); renderResults(); status('个人命令已删除。', 'success');
    }));
    card.append(actions); root.append(card);
  }
}
function updateResults() { page = 0; renderResults(); }
function updateLibrary() { renderFilters(); updateResults(); }

$('query').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(updateResults, 100); });
$('platform').addEventListener('change', updateLibrary);
$('category').addEventListener('change', updateResults);
$('safety').addEventListener('change', updateResults);
$('only-favorites').addEventListener('change', updateResults);
$('prev').addEventListener('click', () => { page--; renderResults(); $('results').scrollIntoView({ block: 'start' }); });
$('next').addEventListener('click', () => { page++; renderResults(); $('results').scrollIntoView({ block: 'start' }); });
$('add-command').addEventListener('click', async () => {
  try {
    if (!database) throw Error('本机存储不可用');
    if (custom.length >= LIMIT) throw Error('个人命令已达到 10,000 条上限');
    const entry = validateCustom({ platform: $('new-platform').value, category: $('new-category').value, command: $('new-command').value, title: $('new-title').value, safety: $('new-safety').value, note: $('new-note').value });
    const duplicate = custom.find(item => item.platform.toLocaleLowerCase() === entry.platform.toLocaleLowerCase() && item.command.toLocaleLowerCase() === entry.command.toLocaleLowerCase());
    if (duplicate) throw Error('个人命令库已有相同平台和命令；请先删除旧条目');
    custom.push(entry); const saved = await save(); updateLibrary();
    $('new-command').value = ''; $('new-title').value = ''; $('new-note').value = '';
    status(saved ? '已加入个人命令库。' : '条目在当前页面，但保存失败；请立即导出完整备份。', saved ? 'success' : 'error');
  } catch (error) { status(error.message, 'error'); }
});
$('template').addEventListener('click', () => download('%e5%91%bd%e4%bb%a4%e9%80%9f%e6%9f%a5%e4%b8%8e%e8%af%ad%e6%b3%95%e7%b4%a2%e5%bc%95-%e5%af%bc%e5%85%a5%e6%a8%a1%e6%9d%bf.json.html', { commands: [{ platform: 'Linux', category: '自定义检查', command: 'example --help', title: '示例：查看帮助', safety: 'read', note: '替换为你自己的命令', source: 'https://www.gnu.org/software/coreutils/manual/coreutils.html' }] }));
$('csv-template').addEventListener('click', () => downloadCsv('命令速查与语法索引-导入模板.csv', [['platform', 'category', 'command', 'title', 'safety', 'note', 'source'], ['Linux', '自定义检查', 'example --help', '示例：查看帮助', 'read', '替换为你自己的命令', '']]));
$('backup').addEventListener('click', () => download('%e5%91%bd%e4%bb%a4%e9%80%9f%e6%9f%a5%e4%b8%8e%e8%af%ad%e6%b3%95%e7%b4%a2%e5%bc%95-%e5%ae%8c%e6%95%b4%e5%a4%87%e4%bb%bd.json.html', { app: 'yj-command-reference', version: 1, exportedAt: new Date().toISOString(), commands: custom, favorites: [...favorites] }));
$('import-commands').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    if (!database) throw Error('本机存储不可用');
    if (file.size > 64 * 1024 * 1024) throw Error('文件不能超过 64 MB');
    let rows;
    if (/\.csv$/i.test(file.name)) {
      const parsed = parseCsv((await file.text()).replace(/^\ufeff/, ''));
      if (parsed[0]?.map(item => item.trim().toLowerCase()).join(',') !== 'platform,category,command,title,safety,note,source') throw Error('CSV 首行列名不符，请下载模板');
      rows = parsed.slice(1).map(row => {
        if (row.length !== 7) throw Error('CSV 每行须有 7 列');
        return Object.fromEntries(['platform', 'category', 'command', 'title', 'safety', 'note', 'source'].map((key, index) => [key, row[index]]));
      });
    } else { const parsed = JSON.parse(await file.text()); rows = Array.isArray(parsed) ? parsed : parsed?.commands; }
    const imported = validateSet(rows);
    const merged = new Map(custom.map(item => [`${item.platform.toLocaleLowerCase()}\u0000${item.command.toLocaleLowerCase()}`, item]));
    for (const item of imported) { const key = `${item.platform.toLocaleLowerCase()}\u0000${item.command.toLocaleLowerCase()}`; const old = merged.get(key); merged.set(key, { ...item, id: old?.id || item.id }); }
    if (merged.size > LIMIT) throw Error('合并后超过 10,000 条上限');
    if (window.confirm(`导入 ${imported.length} 条个人命令，合并后共 ${merged.size} 条？不上传服务器。`)) { custom = [...merged.values()]; const saved = await save(); updateLibrary(); status(saved ? `已导入 ${imported.length} 条，个人命令库现有 ${custom.length} 条。` : '导入成功但本机保存失败，请立即导出完整备份。', saved ? 'success' : 'error'); }
  } catch (error) { status(`导入失败：${error.message}`, 'error'); } finally { event.target.value = ''; }
});
$('restore').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    if (!database) throw Error('本机存储不可用');
    if (file.size > 64 * 1024 * 1024) throw Error('备份不能超过 64 MB');
    const parsed = JSON.parse(await file.text());
    if (parsed?.app !== 'yj-command-reference' || parsed.version !== 1 || !Array.isArray(parsed.favorites) || parsed.favorites.length > BUILTIN.length + LIMIT || parsed.favorites.some(id => typeof id !== 'string' || !/^[bntu]-[a-zA-Z0-9-]{1,100}$/.test(id))) throw Error('备份标识或收藏格式无效');
    const next = validateSet(parsed.commands);
    if (window.confirm('恢复会替换当前个人命令和收藏。请先导出当前完整备份，是否继续？')) { custom = next; const ids = new Set([...BUILTIN, ...custom].map(item => item.id)); favorites = new Set(parsed.favorites.filter(id => ids.has(id) || (!networkLoaded && id.startsWith('n-')))); const saved = await save(); updateLibrary(); status(saved ? '完整备份已恢复。' : '恢复到当前页面，但本机保存失败；请立即再次导出备份。', saved ? 'success' : 'error'); }
  } catch (error) { status(`恢复失败：${error.message}`, 'error'); } finally { event.target.value = ''; }
});
$('clear-custom').addEventListener('click', async () => {
  if (!database || !window.confirm('清空全部个人命令？请先导出完整备份。内置条目和收藏会保留。')) return;
  const removed = new Set(custom.map(item => item.id)); custom = []; favorites = new Set([...favorites].filter(id => !removed.has(id)));
  const saved = await save(); updateLibrary(); status(saved ? '个人命令已清空。' : '当前页面已清空，但本机保存失败；请检查浏览器存储。', saved ? 'success' : 'error');
});

async function boot() {
  try {
    const expanded = await loadNetworkIndex();
    if (expanded.length !== 4890) throw Error('网络设备索引条目数量不符');
    BUILTIN = Object.freeze([...BASE_BUILTIN, ...expanded]);
    networkCount += expanded.length;
    networkLoaded = true;
  } catch (error) {
    $('save-status').textContent = '网络命令索引加载失败；请刷新页面，原有精选命令仍可查询。';
    status(`网络命令索引加载失败：${error.message}`, 'error');
  }
  try {
    database = await openDatabase();
  } catch (error) {
    $('save-status').textContent = '浏览器存储不可用，个人命令无法持久保存；内置命令仍可查询。';
    status(`本机存储不可用：${error.message}`, 'error'); updateLibrary(); return;
  }
  try {
    const saved = await getSaved();
    if (saved?.app === 'yj-command-reference' && saved.version === 1) {
      custom = validateSet(saved.commands);
      const ids = new Set([...BUILTIN, ...custom].map(item => item.id));
      favorites = new Set(Array.isArray(saved.favorites) ? saved.favorites.filter(id => ids.has(id) || (!networkLoaded && typeof id === 'string' && id.startsWith('n-'))) : []);
    }
    $('save-status').textContent = networkLoaded ? '个人命令和收藏保存在此浏览器，请定期下载完整备份。' : '网络索引暂未加载；相关收藏已保留，请刷新后重试。';
  } catch (error) {
    $('save-status').textContent = '已有本机命令数据无法读取；请先检查备份，恢复功能仍可使用。';
    status(`读取失败：${error.message}`, 'error');
  }
  updateLibrary();
}
boot();
