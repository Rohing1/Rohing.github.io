/* 墨页书房：所有用户书籍与笔记只写入当前浏览器的 IndexedDB。 */
(() => {
  'use strict';
  const BUILTINS = [
    { id: 'builtin-lighthouse', file: 'books/lighthouse.epub', title: '灯塔的最后一封信', author: '墨页原创', color: '#49677c', genre: '悬疑 · 短篇', scope: '微型短篇 · 约 900 字' },
    { id: 'builtin-station', file: 'books/station.epub', title: '末班车站', author: '墨页原创', color: '#76624d', genre: '都市 · 短篇', scope: '微型短篇 · 约 800 字' },
    { id: 'builtin-garden', file: 'books/garden.epub', title: '云端花园', author: '墨页原创', color: '#617b60', genre: '科幻 · 短篇', scope: '微型短篇 · 约 800 字' },
    { id: 'builtin-river', file: 'books/river.epub', title: '借来的河流', author: '墨页原创', color: '#6a607d', genre: '成长 · 短篇', scope: '微型短篇 · 约 800 字' },
    { id: 'builtin-liaozhai', file: 'books/liaozhai-zhiyi.epub', title: '聊斋志异', author: '蒲松龄', color: '#6c514c', genre: '古典志怪 · 中文', label: '古典公版作品', scope: '多卷古典作品 · 约 50 万字' },
    { id: 'builtin-byte-of-python', file: 'books/byte-of-python.epub', title: 'A Byte of Python', author: 'Swaroop C H', color: '#3f6174', genre: '编程入门 · 英文', label: 'CC BY-SA 4.0', scope: '英文教程 · 多章节' },
    { id: 'builtin-o-henry', file: 'books/o-henry-selected.epub', title: '欧·亨利短篇精选', author: '欧·亨利', color: '#806448', genre: '外国文学 · 中文新译 / 英文', label: '3 篇 · AI 辅助新译', scope: '精选 3 篇 · 非全集', description: '仅收录《麦琪的礼物》《警察与赞美诗》《二十年后》；所选篇目均附中文新译和英文原文，不是欧·亨利全集。' },
    { id: 'builtin-wilde', file: 'books/wilde-selected.epub', title: '王尔德童话精选', author: '奥斯卡·王尔德', color: '#5b7262', genre: '外国童话 · 中文新译 / 英文', label: '3 篇 · AI 辅助新译', scope: '精选 3 篇 · 非全集', description: '仅收录《快乐王子》《夜莺与玫瑰》《自私的巨人》；所选篇目均附中文新译和英文原文，不是王尔德童话全集。' },
    { id: 'builtin-million-pound', file: 'books/million-pound.epub', title: '百万英镑', author: '马克·吐温', color: '#78647f', genre: '幽默讽刺 · 中文新译 / 英文', label: 'AI 辅助新译', scope: '单篇短篇 · 非同名故事集', description: '完整短篇《百万英镑》，附英文原文；并非同名故事集的全部篇目。' },
    { id: 'builtin-busy-broker', file: 'books/busy-broker.epub', title: '忙碌经纪人的浪漫事', author: '欧·亨利', color: '#6a7286', genre: '职场幽默 · 中文新译 / 英文', label: 'AI 辅助新译', scope: '单篇完整短篇 · 非《四百万》全集', description: '完整短篇《忙碌经纪人的浪漫事》，附英文原文；不是《四百万》全书。' },
    { id: 'builtin-service-of-love', file: 'books/service-of-love.epub', title: '爱的奉献', author: '欧·亨利', color: '#7b5f72', genre: '温情故事 · 中文新译 / 英文', label: 'AI 辅助新译', scope: '单篇完整短篇 · 非《四百万》全集', description: '完整短篇《爱的奉献》，附英文原文；不是《四百万》全书。情节含轻微烫伤。' }
  ];
  const MAX_FILE = 80 * 1024 * 1024;
  const MAX_LIBRARY = 300 * 1024 * 1024;
  const MAX_BOOKS = 60;
  const MAX_COVER = 1024 * 1024;
  const BACKUP_INTERVAL = 7 * 24 * 60 * 60 * 1000;
  const DB_NAME = 'moye-reader-v1';
  const BOOK_CACHE = 'moye-reader-books-v1';
  const TYPO_DEFAULTS = { fontSize: 100, lineHeight: 1.75, fontFamily: 'book', pageMargin: 0, contentWidth: 1050, paragraphSpacing: 0.6 };
  const HIGHLIGHT_COLORS = { gold: '#e2b650', mint: '#7bc9a8', blue: '#8db9e8', pink: '#eaa4b9' };
  const IOS_TOUCH = /iP(ad|hone|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const $ = (selector) => document.querySelector(selector);
  let iosSelecting = false;
  const state = { db: null, imported: [], records: {}, settings: { theme: 'paper', fontSize: 100, lineHeight: 1.75, flow: 'paginated', swipeNext: 'right', shelfSort: 'recent' }, typographyByBook: {}, typography: { ...TYPO_DEFAULTS }, backupMeta: { lastFullAt: null, lastLightAt: null, bookMutationAt: null, recordMutationAt: null, firstUnbackedRecordAt: null, lastReminderAt: null }, filter: 'all', book: null, rendition: null, currentId: null, currentCfi: null, toc: [], flatToc: [], activeChapterIndex: -1, selection: null, editingNoteId: null, searchAbort: false, saveTimer: null, controlsTimer: null, gestureUntil: 0, lastProgressMarked: {}, lastTouchAt: 0 };

  function toast(message) {
    const node = $('#toast'); node.textContent = message; node.classList.add('show');
    clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove('show'), 3500);
  }
  function message(node, text) { node.textContent = text; }
  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => { const db = request.result; db.createObjectStore('books', { keyPath: 'id' }); db.createObjectStore('state', { keyPath: 'key' }); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  function dbRequest(store, mode, callback) {
    return new Promise((resolve, reject) => {
      const tx = state.db.transaction(store, mode); const request = callback(tx.objectStore(store));
      let result;
      request.onsuccess = () => { result = request.result; };
      tx.oncomplete = () => resolve(result);
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('本地保存事务已中止'));
    });
  }
  const getAllBooks = () => dbRequest('books', 'readonly', (store) => store.getAll());
  const putBook = (item) => dbRequest('books', 'readwrite', (store) => store.put(item));
  const deleteBook = (id) => dbRequest('books', 'readwrite', (store) => store.delete(id));
  async function saveState() {
    if (!state.db) return;
    await dbRequest('state', 'readwrite', (store) => store.put({ key: 'reader', records: state.records, settings: state.settings, typographyByBook: state.typographyByBook, backupMeta: state.backupMeta }));
  }
  function scheduleSave() { clearTimeout(state.saveTimer); state.saveTimer = setTimeout(() => saveState().catch(() => toast('保存失败，请检查浏览器可用空间')), 450); }
  function bookRecord(id) { return state.records[id] ||= { cfi: null, percent: 0, bookmarks: [], notes: [], updated: null }; }
  function allBooks() { return [...BUILTINS.map((item) => ({ ...item, builtin: true })), ...state.imported.map((item) => ({ ...item, builtin: false }))]; }
  function safeName(name) { return String(name || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim().slice(0, 90) || '电子书'; }
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
  function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
  function formatSize(bytes) { return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`; }
  function bookUrl(info) { return new URL(info.file, location.href).href; }
  function bookIdentity(item) { return `${String(item.title || '').trim().toLocaleLowerCase()}|${String(item.author || '').trim().toLocaleLowerCase()}|${Number(item.size) || 0}`; }
  function normalizeZipPath(base, href) {
    const pieces = `${base}${decodeURIComponent(String(href || '').split(/[?#]/)[0])}`.replace(/\\/g, '/').split('/'); const stack = [];
    for (const part of pieces) { if (!part || part === '.') continue; if (part === '..') { if (!stack.length) return ''; stack.pop(); } else stack.push(part); }
    return stack.join('/');
  }
  async function inspectEpub(zip, fallbackTitle) {
    const parser = new DOMParser(); const container = parser.parseFromString(await zip.file('META-INF/container.html').async('string'), 'application/xml');
    const root = container.getElementsByTagNameNS('*', 'rootfile')[0]; const opfPath = root?.getAttribute('full-path');
    const opfFile = opfPath && zip.file(opfPath); if (!opfFile) return { title: fallbackTitle, author: '未知作者' };
    const opf = parser.parseFromString(await opfFile.async('string'), 'application/xml');
    const firstText = (tag) => opf.getElementsByTagNameNS('*', tag)[0]?.textContent?.trim() || '';
    const clean = (value, length) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, length);
    const result = { title: clean(firstText('title'), 100) || fallbackTitle, author: clean(firstText('creator'), 80) || '未知作者', description: clean(firstText('description'), 500), subject: clean(firstText('subject'), 60) };
    const items = [...opf.getElementsByTagNameNS('*', 'item')];
    const coverId = [...opf.getElementsByTagNameNS('*', 'meta')].find((node) => node.getAttribute('name') === 'cover')?.getAttribute('content');
    const cover = items.find((node) => (node.getAttribute('properties') || '').split(/\s+/).includes('cover-image')) || items.find((node) => node.getAttribute('id') === coverId);
    const mime = cover?.getAttribute('media-type') || '';
    if (/^image\/(png|jpeg|webp|gif)$/.test(mime)) {
      const path = normalizeZipPath(opfPath.slice(0, opfPath.lastIndexOf('/') + 1), cover.getAttribute('href')); const entry = zip.file(path);
      if (entry && (entry._data?.uncompressedSize || 0) <= MAX_COVER) result.coverData = `data:${mime};base64,${await entry.async('base64')}`;
    }
    return result;
  }
  async function fileDigest(buffer) {
    if (!crypto.subtle?.digest) return null;
    try { const hash = await crypto.subtle.digest('SHA-256', buffer); return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join(''); }
    catch { return null; }
  }
  function markBackupChange(kind) {
    const now = new Date().toISOString(); state.backupMeta[kind === 'books' ? 'bookMutationAt' : 'recordMutationAt'] = now;
    if (kind !== 'books' && !state.backupMeta.firstUnbackedRecordAt) state.backupMeta.firstUnbackedRecordAt = now;
    scheduleSave(); renderBackupReminder();
  }
  function renderBackupReminder() {
    const meta = state.backupMeta; const now = Date.now(); const fullNeeded = meta.bookMutationAt && (!meta.lastFullAt || meta.bookMutationAt > meta.lastFullAt);
    const latestReadingBackup = Math.max(Date.parse(meta.lastFullAt) || 0, Date.parse(meta.lastLightAt) || 0);
    const lightNeeded = meta.recordMutationAt && Date.parse(meta.recordMutationAt) > latestReadingBackup && (now - (latestReadingBackup || Date.parse(meta.firstUnbackedRecordAt || meta.recordMutationAt)) > BACKUP_INTERVAL);
    const show = (fullNeeded || lightNeeded) && now - (Date.parse(meta.lastReminderAt) || 0) > BACKUP_INTERVAL;
    $('#backup-reminder').hidden = !show;
    if (show) { $('#backup-reminder-text').textContent = fullNeeded ? '书架有新导入或移除的书。建议下载完整备份，避免清理浏览器后丢书。' : '阅读进度或笔记已有更新。建议下载轻量备份，换设备时可恢复阅读记录。'; $('#backup-reminder-action').dataset.kind = fullNeeded ? 'full' : 'light'; }
  }
  function normalizeTypography(value = {}) {
    const clamp = (number, min, max, fallback) => Number.isFinite(Number(number)) ? Math.min(max, Math.max(min, Number(number))) : fallback;
    return {
      fontSize: clamp(value.fontSize, 75, 180, 100), lineHeight: clamp(value.lineHeight, 1.3, 2.3, 1.75),
      fontFamily: ['book', 'serif', 'sans'].includes(value.fontFamily) ? value.fontFamily : 'book',
      pageMargin: clamp(value.pageMargin, 0, 24, 0), contentWidth: clamp(value.contentWidth, 600, 1050, 1050),
      paragraphSpacing: clamp(value.paragraphSpacing, 0, 1.6, 0.6)
    };
  }
  function saveTypography() {
    if (!state.currentId) return;
    state.typographyByBook[state.currentId] = { ...state.typography }; applyTheme(); scheduleSave();
    clearTimeout(state.typeReflowTimer);
    const rendition = state.rendition; const cfi = state.currentCfi;
    state.typeReflowTimer = setTimeout(() => { if (rendition !== state.rendition) return; try { const render = $('#book-render'); rendition.resize(render.clientWidth, render.clientHeight); if (cfi) rendition.display(cfi); } catch {} }, 250);
  }

  function renderShelf() {
    const query = $('#shelf-search').value.trim().toLocaleLowerCase();
    const recent = allBooks().filter((item) => bookRecord(item.id).updated).sort((a, b) => String(bookRecord(b.id).updated).localeCompare(String(bookRecord(a.id).updated)))[0];
    const resume = $('#resume-reading'); resume.hidden = !recent;
    if (recent) { resume.textContent = `继续阅读《${recent.title}》 · 已读 ${Math.round((bookRecord(recent.id).percent || 0) * 100)}% →`; resume.onclick = () => openBook(recent.id); }
    const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
    const books = allBooks().filter((item) => (state.filter === 'all' || (state.filter === 'builtin') === item.builtin) && (!query || `${item.title} ${item.author} ${item.subject || ''} ${item.genre || ''} ${item.scope || ''}`.toLocaleLowerCase().includes(query)));
    const sort = state.settings.shelfSort;
    books.sort((a, b) => {
      if (sort === 'title') return collator.compare(a.title, b.title);
      if (sort === 'author') return collator.compare(a.author, b.author) || collator.compare(a.title, b.title);
      if (sort === 'progress') return (bookRecord(b.id).percent || 0) - (bookRecord(a.id).percent || 0) || collator.compare(a.title, b.title);
      if (sort === 'newest') return String(b.importedAt || '').localeCompare(String(a.importedAt || '')) || collator.compare(a.title, b.title);
      return String(bookRecord(b.id).updated || '').localeCompare(String(bookRecord(a.id).updated || '')) || String(b.importedAt || '').localeCompare(String(a.importedAt || '')) || collator.compare(a.title, b.title);
    });
    const grid = $('#book-grid'); grid.replaceChildren();
    if (!books.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = '还没有符合条件的书。可以导入自己的 EPUB，或看看内置书籍。'; grid.append(empty); refreshOfflineShelf(); renderBackupReminder(); return; }
    for (const item of books) {
      const record = bookRecord(item.id); const tile = document.createElement('div'); tile.className = 'book-tile';
      const button = document.createElement('button'); button.type = 'button'; button.className = 'book-card';
      button.innerHTML = `<span class="book-cover${item.coverData ? ' has-image' : ''}" style="--cover:${escapeHtml(item.color || '#627362')}">${item.coverData ? '' : `<span class="cover-kicker">${escapeHtml(item.label || (item.builtin ? '墨页原创短篇' : '我的电子书'))}</span><strong>${escapeHtml(item.title)}</strong>`}</span><span class="book-meta"><span class="badge">${escapeHtml(item.subject || item.genre || (item.builtin ? '原创短篇' : '本地导入'))}</span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.author)}</small>${item.scope ? `<span class="book-scope">${escapeHtml(item.scope)}</span>` : ''}<span class="book-progress">${record.updated ? `已读 ${Math.round((record.percent || 0) * 100)}% · 继续阅读` : '开始阅读 →'}</span></span>`;
      if (item.coverData) { const image = document.createElement('img'); image.src = item.coverData; image.alt = `${item.title}封面`; image.loading = 'lazy'; button.querySelector('.book-cover').append(image); }
      button.addEventListener('click', () => openBook(item.id)); tile.append(button);
      if (item.builtin) {
        const controls = document.createElement('div'); controls.className = 'offline-controls'; controls.dataset.offlineId = item.id;
        const status = document.createElement('span'); status.className = 'offline-book-status'; status.textContent = '检查缓存中…';
        const action = document.createElement('button'); action.type = 'button'; action.className = 'offline-book-action'; action.textContent = '离线下载';
        action.addEventListener('click', () => toggleOfflineBook(item, action)); controls.append(status, action); tile.append(controls);
      } else {
        if (item.description) { const details = document.createElement('details'); details.className = 'book-details'; const heading = document.createElement('summary'); heading.textContent = '查看简介'; const content = document.createElement('p'); content.textContent = item.description; details.append(heading, content); tile.append(details); }
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'book-remove'; remove.textContent = '移除书籍'; remove.addEventListener('click', () => removeBook(item)); tile.append(remove);
      }
      grid.append(tile);
      if (item.builtin && item.description) { const details = document.createElement('details'); details.className = 'book-details'; const heading = document.createElement('summary'); heading.textContent = '篇目与版本'; const content = document.createElement('p'); content.textContent = item.description; details.append(heading, content); tile.append(details); }
    }
    refreshOfflineShelf();
    renderBackupReminder();
  }
  async function refreshOfflineShelf() {
    const summary = $('#offline-library-status');
    if (!('caches' in window)) { summary.textContent = '当前浏览器不支持离线缓存；导入的书仍保存在本机。'; return; }
    try {
      const cache = await caches.open(BOOK_CACHE); let ready = 0; let downloadedSize = 0;
      for (const info of BUILTINS) {
        const response = await cache.match(bookUrl(info)); const controls = [...document.querySelectorAll('[data-offline-id]')].find((node) => node.dataset.offlineId === info.id);
        if (response) { ready++; downloadedSize += Number(response.headers.get('content-length')) || (await response.clone().blob()).size; }
        if (!controls) continue;
        controls.querySelector('.offline-book-status').textContent = response ? '已下载 · 可离线' : '未下载 · 需联网';
        controls.querySelector('.offline-book-action').textContent = response ? '清除离线副本' : '离线下载';
        controls.querySelector('.offline-book-action').dataset.cached = String(Boolean(response));
      }
      const estimate = await navigator.storage?.estimate?.();
      const usage = estimate?.usage ? `；本站存储约 ${formatSize(estimate.usage)}${estimate.quota ? ` / 配额约 ${formatSize(estimate.quota)}` : ''}` : '';
      summary.textContent = `内置书籍离线 ${ready}/${BUILTINS.length} 本，约 ${formatSize(downloadedSize)}${usage}。浏览器清理站点数据时仍会丢失，请定期备份。`;
    } catch { summary.textContent = '无法读取离线缓存状态；请检查浏览器存储权限。'; }
  }
  async function toggleOfflineBook(info, button) {
    if (!('caches' in window)) { toast('当前浏览器不支持离线缓存'); return; }
    button.disabled = true;
    try {
      const cache = await caches.open(BOOK_CACHE); const url = bookUrl(info);
      if (await cache.match(url)) { await cache.delete(url); toast(`已清除《${info.title}》的离线副本，阅读记录保留`); }
      else {
        if (!navigator.onLine) throw Error('当前离线，请联网后下载');
        button.textContent = '下载中…'; const response = await fetch(url, { cache: 'reload' });
        if (!response.ok) throw Error('下载失败，请稍后重试');
        await cache.put(url, response); toast(`《${info.title}》已下载，可离线阅读`);
      }
    } catch (error) { toast(error.message || '离线缓存操作失败'); }
    finally { button.disabled = false; refreshOfflineShelf(); }
  }
  async function removeBook(item) {
    if (!confirm(`移除《${item.title}》以及它的进度、书签和摘录？建议先下载完整备份。`)) return;
    if (state.currentId === item.id) closeBook();
    await deleteBook(item.id); state.imported = state.imported.filter((book) => book.id !== item.id); delete state.records[item.id]; markBackupChange('books'); await saveState(); renderShelf(); toast('已从本机书架移除');
  }
  async function importBooks(files) {
    for (const file of [...files]) {
      try {
        if (!/\.epub$/i.test(file.name)) throw Error('请选择 .epub 文件');
        if (file.size > MAX_FILE) throw Error('单本最多 80 MB；大书建议在专用阅读器中打开');
        if (state.imported.length >= MAX_BOOKS) throw Error('当前书架最多导入 60 本');
        if (state.imported.reduce((total, item) => total + (item.size || 0), 0) + file.size > MAX_LIBRARY) throw Error('导入书库合计最多 300 MB，请先移除或备份旧书');
        const buffer = await file.arrayBuffer(); const zip = await JSZip.loadAsync(buffer, { checkCRC32: false });
        if (!zip.file('META-INF/container.html') || !zip.file('mimetype')) throw Error('不是有效的 EPUB 文件');
        const mime = (await zip.file('mimetype').async('string')).trim(); if (mime !== 'application/epub+zip') throw Error('EPUB 文件标识不正确');
        const probe = ePub(buffer.slice(0)); let metadata;
        try { metadata = await probe.loaded.metadata; await probe.ready; } finally { probe.destroy(); }
        const details = await inspectEpub(zip, String(metadata.title || file.name.replace(/\.epub$/i, '')).trim().slice(0, 100));
        const title = details.title || String(metadata.title || '').trim().slice(0, 100);
        const author = details.author !== '未知作者' ? details.author : String(metadata.creator || '未知作者').trim().slice(0, 80);
        const hash = await fileDigest(buffer);
        if (hash && state.imported.some((book) => book.hash === hash)) { toast(`《${title}》已经在书架中，未重复导入`); continue; }
        if (state.imported.some((book) => bookIdentity(book) === bookIdentity({ title, author, size: buffer.byteLength })) && !confirm(`书架中已有同名、同作者且大小相同的《${title}》。仍要导入？`)) continue;
        const item = { id: `import-${crypto.randomUUID()}`, title, author, color: ['#49677c', '#76624d', '#617b60', '#6a607d'][state.imported.length % 4], genre: '本地导入', description: details.description || String(metadata.description || '').replace(/<[^>]*>/g, ' ').trim().slice(0, 500), subject: details.subject || String(metadata.subject || '').slice(0, 60), coverData: details.coverData || '', hash, metadataScanned: true, filename: safeName(file.name), size: buffer.byteLength, data: buffer, importedAt: new Date().toISOString() };
        await putBook(item); state.imported.push({ ...item, data: undefined }); markBackupChange('books'); renderShelf(); toast(`已导入《${title}》`);
      } catch (error) { toast(`${file.name}：${error.message || '导入失败'}`); }
    }
    $('#book-import').value = '';
  }
  async function enrichExistingBooks() {
    for (const info of [...state.imported].filter((item) => !item.metadataScanned)) {
      try {
        const stored = await dbRequest('books', 'readonly', (store) => store.get(info.id));
        if (!stored?.data || !state.imported.some((item) => item.id === info.id)) continue;
        const zip = await JSZip.loadAsync(stored.data, { checkCRC32: false }); const details = await inspectEpub(zip, stored.title);
        const next = { ...stored, description: stored.description || details.description || '', subject: stored.subject || details.subject || '', coverData: stored.coverData || details.coverData || '', metadataScanned: true };
        if (!state.imported.some((item) => item.id === info.id)) continue;
        await putBook(next); state.imported = state.imported.map((item) => item.id === info.id ? { ...next, data: undefined } : item); renderShelf();
      } catch { /* 旧书仍能正常阅读；不因某本元数据异常阻断书架。 */ }
    }
  }

  async function openBook(id, targetCfi = null) {
    try {
      closeBook(); const info = allBooks().find((item) => item.id === id); if (!info) throw Error('找不到这本书');
      message($('#storage-message'), '正在打开电子书…');
      let buffer;
      if (info.builtin) { const response = await fetch(info.file).catch(() => { throw Error('无法读取内置作品：请联网或先下载离线副本'); }); if (!response.ok) throw Error('无法读取内置作品：请联网或先下载离线副本'); buffer = await response.arrayBuffer(); }
      else { const item = await dbRequest('books', 'readonly', (store) => store.get(id)); if (!item?.data) throw Error('本地书籍数据不存在'); buffer = item.data; }
      const book = ePub(buffer); state.book = book; state.currentId = id;
      state.typography = normalizeTypography({ ...TYPO_DEFAULTS, fontSize: state.settings.fontSize, lineHeight: state.settings.lineHeight, ...(state.typographyByBook[id] || {}) });
      $('#current-title').textContent = info.title; $('#current-author').textContent = info.scope ? `${info.author} · ${info.scope}` : info.author;
      $('#shelf-view').hidden = true; $('#reader-view').hidden = false; message($('#storage-message'), ''); showReaderControls();
      const rendition = book.renderTo('book-render', { width: '100%', height: '100%', flow: state.settings.flow, manager: 'default', allowScriptedContent: false });
      state.rendition = rendition; iosSelecting = false; updateIosGestureLayer(); applyTheme();
      rendition.hooks.content.register((contents) => { bindPageGestures(contents.document, contents.window); applyTypographyToDocument(contents.document); });
      rendition.on('relocated', (location) => {
        if (state.currentId !== id) return;
        state.lastLocation = location;
        state.currentCfi = location?.start?.cfi || null;
        const record = bookRecord(id); record.cfi = state.currentCfi; record.updated = new Date().toISOString();
        if (book.locations?.length?.()) record.percent = Math.max(0, Math.min(1, book.locations.percentageFromCfi(state.currentCfi) || 0));
        updateProgress(); saveState().catch(() => toast('阅读进度保存失败，请检查浏览器可用空间')); scheduleControlsHide();
        if (Math.abs((record.percent || 0) - (state.lastProgressMarked[id] ?? -1)) >= 0.05) { state.lastProgressMarked[id] = record.percent || 0; markBackupChange('records'); }
      });
      rendition.on('selected', (cfiRange, contents) => {
        const quote = contents?.window?.getSelection()?.toString()?.trim();
        if (quote) { state.selection = { cfi: cfiRange, quote: quote.slice(0, 3000) }; openNoteDialog(); contents.window.getSelection()?.removeAllRanges(); }
      });
      rendition.on('keyup', (event) => { if (event.key === 'ArrowRight') rendition.next(); if (event.key === 'ArrowLeft') rendition.prev(); });
      const record = bookRecord(id); book.readerDisplayTask = rendition.display(targetCfi || record.cfi || undefined); await book.readerDisplayTask;
      if (state.book !== book) return;
      if (IOS_TOUCH) {
        try { if (!sessionStorage.getItem('moye-ios-gesture-hint-v4')) { toast('正文左右滑动翻页；选文请点“选文摘录”，滑动方向可在 Aa 设置中调整'); sessionStorage.setItem('moye-ios-gesture-hint-v4', '1'); } } catch {}
      } else if (matchMedia('(pointer: coarse)').matches) {
        try { if (!sessionStorage.getItem('moye-swipe-hint')) { toast('右滑下一页，左滑上一页；可在“Aa 设置”中切换方向'); sessionStorage.setItem('moye-swipe-hint', '1'); } } catch {}
      }
      const navigation = await book.loaded.navigation; if (state.currentId !== id) return; state.toc = navigation.toc || []; state.flatToc = flattenToc(state.toc); updateProgress();
      for (const note of record.notes) addHighlight(note);
      book.readerLocationsTask = book.locations.generate(1600).then(() => { if (state.book === book && state.currentCfi) { record.percent = book.locations.percentageFromCfi(state.currentCfi) || 0; updateProgress(); scheduleSave(); } }).catch(() => {});
    } catch (error) { closeBook(); message($('#storage-message'), error.message || '打开失败'); toast(error.message || '打开失败'); }
  }
  function closeBook() {
    closeDrawer();
    clearTimeout(state.controlsTimer); clearTimeout(state.typeReflowTimer); $('#reader-view').classList.remove('controls-hidden'); $('#controls-toggle').hidden = true;
    const oldRendition = state.rendition; const oldBook = state.book;
    // A section may still be loading for first display or page-count generation.
    // Wait before destroying its hooks; the shelf itself can appear immediately.
    if (oldBook) Promise.allSettled([oldBook.ready, oldBook.readerDisplayTask, oldBook.readerLocationsTask]).then(() => {
      try { oldRendition?.destroy(); } catch {}
      try { oldBook.destroy(); } catch {}
    });
    $('#book-render').replaceChildren();
    state.book = null; state.rendition = null; state.currentId = null; state.currentCfi = null; state.toc = []; state.flatToc = []; state.activeChapterIndex = -1; state.lastLocation = null; state.selection = null; state.editingNoteId = null; state.gestureUntil = 0; iosSelecting = false; updateIosGestureLayer();
    $('#reader-view').hidden = true; $('#shelf-view').hidden = false; document.body.classList.remove('reader-theme-sepia', 'reader-theme-dark'); renderShelf();
  }
  function scheduleControlsHide() {
    clearTimeout(state.controlsTimer);
    if (!state.currentId || !matchMedia('(max-width: 750px)').matches) return;
    state.controlsTimer = setTimeout(() => {
      if (!state.currentId || iosSelecting || !$('#side-drawer').hidden || $('#note-dialog').open || $('#backup-dialog').open) return;
      $('#reader-view').classList.add('controls-hidden'); $('#controls-toggle').hidden = false;
    }, 6000);
  }
  function showReaderControls() {
    $('#reader-view').classList.remove('controls-hidden'); $('#controls-toggle').hidden = true; scheduleControlsHide();
  }
  function handleReaderTap(x, left, width) {
    if (!state.rendition || state.settings.flow !== 'paginated' || Date.now() < state.gestureUntil) return;
    const fraction = (x - left) / width;
    if (fraction < 0.25) state.rendition.prev();
    else if (fraction > 0.75) state.rendition.next();
    else showReaderControls();
  }
  function updateGestureHint() {
    $('#gesture-hint').textContent = state.settings.flow === 'scrolled-doc' ? '连续滚动模式 · 长按选文可摘录' : `轻点两侧翻页 · ${IOS_TOUCH ? '选文请点“选文摘录”' : '长按选文'} · ${state.settings.swipeNext === 'left' ? '左滑' : '右滑'}下一页`;
    updateIosGestureLayer();
  }
  function updateIosGestureLayer() {
    const layer = $('#ios-page-gestures'); if (!layer) return;
    layer.hidden = !IOS_TOUCH || !state.rendition || iosSelecting || state.settings.flow !== 'paginated';
    $('#ios-select-text').hidden = !IOS_TOUCH || !state.rendition;
    $('#ios-select-text').textContent = iosSelecting ? '保存选文' : '选文摘录';
    $('#ios-cancel-select').hidden = !iosSelecting;
    $('#ios-selection-hint').hidden = !iosSelecting;
  }
  function saveIosSelection() {
    if (!iosSelecting) { iosSelecting = true; updateIosGestureLayer(); showReaderControls(); return; }
    for (const contents of state.rendition?.getContents?.() || []) {
      const selection = contents.window.getSelection(); const quote = selection?.toString()?.trim();
      if (!quote || !selection.rangeCount) continue;
      try {
        const cfiRange = contents.cfiFromRange(selection.getRangeAt(0));
        state.selection = { cfi: cfiRange, quote: quote.slice(0, 3000) };
        iosSelecting = false; updateIosGestureLayer(); openNoteDialog(); selection.removeAllRanges(); return;
      } catch { toast('未能定位选文，请重新选择'); return; }
    }
    toast('请先长按正文选择文字，再点“保存选文”；也可取消返回翻页');
  }
  function bindIosGestureLayer() {
    const layer = $('#ios-page-gestures');
    if (!IOS_TOUCH || !layer) return;
    // WebKit blocks callbacks in sandboxed EPUB frames. Keep that sandbox intact.
    bindTouchSwipes(layer, window, false);
    let tap = null;
    layer.addEventListener('touchstart', event => { const t = event.touches.length === 1 && event.touches[0]; tap = t ? { x: t.clientX, y: t.clientY, at: Date.now() } : null; }, { passive: true });
    layer.addEventListener('touchend', event => { const start = tap; tap = null; const t = event.changedTouches[0]; if (!start || event.changedTouches.length !== 1 || Date.now() - start.at > 330 || Math.hypot(t.clientX - start.x, t.clientY - start.y) > 12) return; const box = layer.getBoundingClientRect(); handleReaderTap(t.clientX, box.left, box.width); }, { passive: true });
    layer.addEventListener('touchcancel', () => { tap = null; }, { passive: true });
    $('#ios-select-text').onclick = saveIosSelection;
    $('#ios-cancel-select').onclick = () => { for (const contents of state.rendition?.getContents?.() || []) contents.window.getSelection()?.removeAllRanges(); iosSelecting = false; updateIosGestureLayer(); showReaderControls(); };
  }
  function turnBySwipe(horizontalMove) {
    if (!state.rendition || !state.currentId || state.settings.flow !== 'paginated' || !$('#side-drawer').hidden || $('#note-dialog').open || $('#backup-dialog').open || Date.now() < state.gestureUntil) return;
    state.gestureUntil = Date.now() + 380;
    const next = (horizontalMove > 0) === (state.settings.swipeNext !== 'left');
    (next ? state.rendition.next() : state.rendition.prev()).catch(() => toast('翻页未完成，请重试或使用两侧箭头'));
  }
  function bindTouchSwipes(target, win, bookScoped = true) {
    if (!target || target.__moyeTouchBound) return;
    target.__moyeTouchBound = true;
    let start = null;
    const activeRendition = state.rendition;
    const selectedText = () => Boolean(win?.getSelection?.()?.toString().trim());
    const enabled = () => state.rendition && (!bookScoped || activeRendition === state.rendition) && state.settings.flow === 'paginated' && $('#side-drawer').hidden && !$('#note-dialog').open && !$('#backup-dialog').open;
    const interactive = (node) => Boolean(node?.closest?.('a,button,input,textarea,select,[contenteditable]:not([contenteditable="false"])'));
    function finishSwipe(x, y) {
      if (!start || start.axis === 'vertical' || !enabled()) return;
      const dx = x - start.x;
      const dy = y - start.y;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.35 || Date.now() - start.at > 1200 || selectedText()) return;
      turnBySwipe(dx);
    }
    target.addEventListener('touchstart', (event) => {
      state.lastTouchAt = Date.now();
      const touch = event.touches.length === 1 && event.touches[0];
      start = touch && enabled() && !selectedText() && !interactive(event.target) ? { id: touch.identifier, x: touch.clientX, y: touch.clientY, lastX: touch.clientX, lastY: touch.clientY, at: Date.now(), axis: '' } : null;
      // Register before the first move, without preventing taps or native text selection.
    }, { capture: true, passive: false });
    target.addEventListener('touchmove', (event) => {
      if (!start) return;
      if (event.touches.length !== 1 || !enabled() || selectedText()) { start = null; return; }
      const touch = event.touches[0];
      if (touch.identifier !== start.id) { start = null; return; }
      start.lastX = touch.clientX; start.lastY = touch.clientY;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (!start.axis) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 4) return;
        // Long presses remain selection gestures; vertically started gestures remain scrolling.
        if (Date.now() - start.at > 450) { start = null; return; }
        start.axis = Math.abs(dx) > Math.abs(dy) * 1.35 ? 'horizontal' : 'vertical';
      }
      if (start.axis !== 'horizontal') return;
      // Safari can claim native scrolling before the old 18px threshold is reached.
      if (event.cancelable) event.preventDefault();
      // Wait for release: replacing an EPUB iframe during touchmove loses the remaining events.
    }, { capture: true, passive: false });
    target.addEventListener('touchend', (event) => {
      state.lastTouchAt = Date.now();
      if (!start || event.changedTouches.length !== 1) { start = null; return; }
      const touch = event.changedTouches[0];
      if (touch.identifier === start.id) finishSwipe(touch.clientX, touch.clientY);
      start = null;
    }, { capture: true, passive: true });
    target.addEventListener('touchcancel', () => {
      state.lastTouchAt = Date.now();
      if (start?.axis === 'horizontal') finishSwipe(start.lastX, start.lastY);
      start = null;
    }, { capture: true, passive: true });
  }
  function bindPageGestures(doc, win) {
    if (!doc || doc.__moyeGesturesBound) return;
    doc.__moyeGesturesBound = true;
    // EPUB input stays inside its iframe; parent-document listeners do not receive it.
    const touchAction = state.settings.flow === 'paginated' ? 'pan-y pinch-zoom' : 'auto';
    doc.documentElement.style.touchAction = touchAction;
    if (doc.body) doc.body.style.touchAction = touchAction;
    bindTouchSwipes(doc, win);
    let tapStart = null;
    doc.addEventListener('touchstart', (event) => {
      const touch = event.touches.length === 1 && event.touches[0];
      tapStart = touch ? { x: touch.clientX, y: touch.clientY, at: Date.now(), interactive: Boolean(event.target.closest?.('a,button,input,textarea,select,[contenteditable]')) } : null;
    }, { passive: true });
    doc.addEventListener('touchend', (event) => {
      const start = tapStart; tapStart = null;
      if (!start || start.interactive || event.changedTouches.length !== 1 || state.settings.flow !== 'paginated') return;
      const touch = event.changedTouches[0];
      if (Date.now() - start.at > 330 || Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > 12) return;
      state.lastTouchAt = Date.now();
      setTimeout(() => { if (!win.getSelection()?.toString().trim()) handleReaderTap(touch.clientX, 0, doc.documentElement.clientWidth); }, 30);
    }, { passive: true });
    doc.addEventListener('click', (event) => {
      if (!matchMedia('(pointer: coarse)').matches || Date.now() - state.lastTouchAt < 500 || event.target.closest?.('a,button,input,textarea,select,[contenteditable]') || win.getSelection()?.toString().trim()) return;
      handleReaderTap(event.clientX, 0, doc.documentElement.clientWidth);
    });
    let wheelX = 0; let wheelAt = 0;
    doc.addEventListener('wheel', (event) => {
      if (state.settings.flow !== 'paginated' || Math.abs(event.deltaX) <= Math.abs(event.deltaY) * 1.25 || win.getSelection()?.toString().trim()) return;
      event.preventDefault();
      if (Date.now() - wheelAt > 320) wheelX = 0;
      wheelAt = Date.now(); wheelX += event.deltaX;
      if (Math.abs(wheelX) >= 70) { turnBySwipe(-wheelX); wheelX = 0; }
    }, { passive: false });
  }
  function updateProgress() {
    const record = bookRecord(state.currentId); const percent = Math.round((record.percent || 0) * 100);
    $('#progress-label').textContent = `全书 ${percent}%`; $('#progress-slider').value = Math.round((record.percent || 0) * 1000);
    const location = state.lastLocation || state.rendition?.currentLocation(); const href = location?.start?.href;
    const sameFile = (a, b) => a?.split('#')[0] === b?.split('#')[0];
    if (href && state.flatToc.length) {
      if (!sameFile(state.flatToc[state.activeChapterIndex]?.href, href)) state.activeChapterIndex = state.flatToc.findIndex((item) => sameFile(item.href, href));
    }
    const section = state.flatToc[state.activeChapterIndex] || findToc(state.toc, href);
    $('#chapter-label').textContent = section?.label?.trim() || '阅读中';
    const displayed = location?.start?.displayed;
    $('#chapter-progress').textContent = displayed?.total > 0 ? `本节 ${displayed.page}/${displayed.total} 页` : '';
  }
  function flattenToc(items, depth = 0, output = []) { for (const item of items) { if (item.href) output.push({ href: item.href, label: item.label || '未命名章节', depth }); flattenToc(item.subitems || [], depth + 1, output); } return output; }
  function jumpChapter(delta) {
    if (!state.rendition || !state.flatToc.length) return;
    const next = state.activeChapterIndex < 0 ? (delta > 0 ? 0 : state.flatToc.length - 1) : state.activeChapterIndex + delta;
    if (next < 0 || next >= state.flatToc.length) { toast(delta > 0 ? '已经是最后一章' : '已经是第一章'); return; }
    state.activeChapterIndex = next; state.rendition.display(state.flatToc[next].href); closeDrawer(); showReaderControls();
  }
  function findToc(nodes, href) { for (const item of nodes) { if (href && item.href?.split('#')[0] === href.split('#')[0]) return item; const found = findToc(item.subitems || [], href); if (found) return found; } return null; }
  function applyTheme() {
    if (!state.rendition) return;
    const typography = state.typography;
    const themes = {
      paper: { body: { background: '#faf8f2', color: '#28312d' } },
      sepia: { body: { background: '#f2e5cd', color: '#4c3d2c' } },
      dark: { body: { background: '#202523', color: '#e1e4da' } }
    };
    for (const [name, theme] of Object.entries(themes)) state.rendition.themes.register(name, theme);
    state.rendition.themes.select(state.settings.theme); state.rendition.themes.fontSize(`${typography.fontSize}%`);
    state.rendition.themes.override('line-height', String(typography.lineHeight), true);
    const surface = $('.reading-surface'); surface.style.maxWidth = `${typography.contentWidth}px`; surface.style.paddingInline = `${typography.pageMargin}px`;
    for (const contents of state.rendition.getContents?.() || []) applyTypographyToDocument(contents.document);
    document.body.classList.toggle('reader-theme-sepia', state.settings.theme === 'sepia'); document.body.classList.toggle('reader-theme-dark', state.settings.theme === 'dark');
  }
  function applyTypographyToDocument(doc) {
    if (!doc?.head) return;
    let style = doc.getElementById('moye-typography-style');
    if (!style) { style = doc.createElement('style'); style.id = 'moye-typography-style'; doc.head.append(style); }
    const font = state.typography.fontFamily === 'serif' ? 'Georgia,"Songti SC",STSong,serif' : state.typography.fontFamily === 'sans' ? '-apple-system,BlinkMacSystemFont,"Microsoft YaHei",sans-serif' : '';
    const touchAction = state.settings.flow === 'paginated' ? 'pan-y pinch-zoom' : 'auto';
    doc.documentElement.style.touchAction = touchAction;
    if (doc.body) doc.body.style.touchAction = touchAction;
    style.textContent = `html,body{touch-action:${touchAction}!important} ${font ? `body,p,li,blockquote,h1,h2,h3,h4,h5,h6{font-family:${font}!important}` : ''} body,p,li,blockquote{-webkit-user-select:text!important;user-select:text!important} p{line-height:${state.typography.lineHeight}!important;margin-bottom:${state.typography.paragraphSpacing}em!important}`;
  }

  function openDrawer(title, render) { showReaderControls(); $('#drawer-title').textContent = title; const body = $('#drawer-body'); body.replaceChildren(); render(body); $('#drawer-backdrop').hidden = false; $('#side-drawer').hidden = false; }
  function closeDrawer() { $('#drawer-backdrop').hidden = true; $('#side-drawer').hidden = true; scheduleControlsHide(); }
  function makeButton(label, action, subtitle) { const button = document.createElement('button'); button.className = 'drawer-item'; button.type = 'button'; button.textContent = label; if (subtitle) { const small = document.createElement('small'); small.textContent = subtitle; button.append(small); } button.addEventListener('click', action); return button; }
  function renderToc() {
    openDrawer('目录', (body) => { if (!state.toc.length) { body.textContent = '这本书没有提供章节目录。'; return; }
      const nav = document.createElement('div'); nav.className = 'chapter-nav';
      for (const [label, delta] of [['← 上一章', -1], ['下一章 →', 1]]) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.onclick = () => jumpChapter(delta);
        button.disabled = state.activeChapterIndex >= 0 && (state.activeChapterIndex + delta < 0 || state.activeChapterIndex + delta >= state.flatToc.length); nav.append(button);
      }
      body.append(nav);
      const add = (items, parent, depth = 0) => { for (const item of items) {
        const children = item.subitems || []; let target = parent;
        if (children.length) { const group = document.createElement('details'); group.className = 'toc-group'; group.open = depth === 0; const summary = document.createElement('summary'); summary.textContent = item.label?.trim() || '未命名分组'; group.append(summary); parent.append(group); target = group; }
        if (item.href) { const button = makeButton(children.length ? `阅读：${item.label?.trim() || '本章'}` : item.label?.trim() || '未命名章节', () => { state.activeChapterIndex = state.flatToc.findIndex((entry) => entry.href === item.href); state.rendition.display(item.href); closeDrawer(); }); button.style.paddingLeft = `${13 + Math.min(depth, 4) * 16}px`; target.append(button); }
        if (children.length) add(children, target, depth + 1);
      } }; add(state.toc, body);
    });
  }
  function renderSettings() {
    openDrawer('阅读设置', (body) => {
      body.innerHTML = `<p>以下排版设置仅对当前这本书生效，并会随备份保存。</p><label>字体<select id="family-select"><option value="book">跟随原书</option><option value="serif">衬线字体</option><option value="sans">无衬线字体</option></select></label><label>字号 <output id="font-output"></output><input id="font-range" type="range" min="75" max="180" step="5"></label><label>行距 <output id="line-output"></output><input id="line-range" type="range" min="1.3" max="2.3" step="0.1"></label><label>段落间距 <output id="paragraph-output"></output><input id="paragraph-range" type="range" min="0" max="1.6" step="0.1"></label><label>页边距 <output id="margin-output"></output><input id="margin-range" type="range" min="0" max="24" step="4"></label><label>正文最大宽度 <output id="width-output"></output><input id="width-range" type="range" min="600" max="1050" step="50"></label><label>纸张色调<select id="theme-select"><option value="paper">柔白纸张</option><option value="sepia">暖黄护眼</option><option value="dark">深色阅读</option></select></label><label>翻阅方式<select id="flow-select"><option value="paginated">翻页</option><option value="scrolled-doc">连续滚动</option></select></label><label>滑动翻页方向<select id="swipe-select"><option value="right">右滑下一页（默认）</option><option value="left">左滑下一页</option></select></label><p>手机上轻点正文两侧翻页、长按直接选文；连续滚动模式不启用滑动翻页。少数复杂 EPUB 会保留原书排版。</p>`;
      body.querySelector('#family-select').value = state.typography.fontFamily;
      for (const [key, value, output] of [['font', state.typography.fontSize, `${state.typography.fontSize}%`], ['line', state.typography.lineHeight, state.typography.lineHeight], ['paragraph', state.typography.paragraphSpacing, `${state.typography.paragraphSpacing}em`], ['margin', state.typography.pageMargin, `${state.typography.pageMargin}px`], ['width', state.typography.contentWidth, `${state.typography.contentWidth}px`]]) { body.querySelector(`#${key}-range`).value = value; body.querySelector(`#${key}-output`).textContent = output; }
      if (IOS_TOUCH) body.lastElementChild.textContent = 'iPhone / iPad 可左右滑动或轻点正文两侧翻页；摘录时先点“选文摘录”，长按选择后点“保存选文”。连续滚动模式不启用滑动翻页。少数复杂 EPUB 会保留原书排版。';
      body.querySelector('#theme-select').value = state.settings.theme; body.querySelector('#flow-select').value = state.settings.flow; body.querySelector('#swipe-select').value = state.settings.swipeNext;
      body.querySelector('#theme-select').onchange = (event) => { state.settings.theme = event.target.value; applyTheme(); scheduleSave(); };
      body.querySelector('#family-select').onchange = (event) => { state.typography.fontFamily = event.target.value; saveTypography(); };
      for (const [control, field, suffix] of [['font', 'fontSize', '%'], ['line', 'lineHeight', ''], ['paragraph', 'paragraphSpacing', 'em'], ['margin', 'pageMargin', 'px'], ['width', 'contentWidth', 'px']]) {
        body.querySelector(`#${control}-range`).oninput = (event) => { state.typography[field] = Number(event.target.value); body.querySelector(`#${control}-output`).textContent = `${state.typography[field]}${suffix}`; saveTypography(); };
      }
      body.querySelector('#flow-select').onchange = async (event) => { state.settings.flow = event.target.value; iosSelecting = false; updateGestureHint(); state.rendition.flow(state.settings.flow); for (const contents of state.rendition.getContents?.() || []) applyTypographyToDocument(contents.document); await state.rendition.display(state.currentCfi || undefined); scheduleSave(); };
      body.querySelector('#swipe-select').onchange = (event) => { state.settings.swipeNext = event.target.value; updateGestureHint(); scheduleSave(); };
    });
  }
  function addBookmark() {
    if (!state.currentCfi) { toast('页面尚未准备好'); return; }
    const record = bookRecord(state.currentId);
    if (record.bookmarks.some((item) => item.cfi === state.currentCfi)) { toast('这一页已经添加过书签'); return; }
    record.bookmarks.push({ id: crypto.randomUUID(), cfi: state.currentCfi, label: $('#chapter-label').textContent, percent: record.percent || 0, createdAt: new Date().toISOString() }); markBackupChange('records'); toast('已添加书签');
  }
  function renderNotes() {
    openDrawer('书签与摘录', (body) => {
      const record = bookRecord(state.currentId); const title = document.createElement('h3'); title.textContent = `书签 · ${record.bookmarks.length}`; body.append(title);
      for (const item of record.bookmarks) {
        const button = makeButton(`${item.label || '位置'} · ${Math.round(item.percent * 100)}%`, () => { state.rendition.display(item.cfi); closeDrawer(); }, new Date(item.createdAt).toLocaleDateString('zh-CN'));
        const remove = document.createElement('span'); remove.className = 'remove'; remove.textContent = '删除'; remove.onclick = (event) => { event.stopPropagation(); record.bookmarks = record.bookmarks.filter((mark) => mark.id !== item.id); markBackupChange('records'); renderNotes(); }; button.append(remove); body.append(button);
      }
      const noteTitle = document.createElement('h3'); noteTitle.textContent = `摘录 · ${record.notes.length}`; body.append(noteTitle);
      body.append(makeButton('＋ 在当前位置写笔记', () => { state.selection = null; openNoteDialog(); }));
      if (!record.notes.length) { const hint = document.createElement('p'); hint.textContent = '在正文中选中文字，即可摘录并写下想法。'; body.append(hint); }
      for (const item of record.notes) {
        const row = document.createElement('div'); row.className = 'note-row';
        const button = makeButton(item.quote?.slice(0, 85) || item.note?.slice(0, 85) || '本页笔记', () => { state.rendition.display(item.cfi); closeDrawer(); }, `${(item.tags || []).join(' · ')}${item.tags?.length ? ' · ' : ''}${item.note || new Date(item.createdAt).toLocaleDateString('zh-CN')}`);
        button.style.borderLeft = `4px solid ${HIGHLIGHT_COLORS[item.color] || HIGHLIGHT_COLORS.gold}`;
        const actions = document.createElement('div'); actions.className = 'note-row-actions';
        const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = '编辑'; edit.onclick = () => openNoteDialog(item);
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '删除'; remove.onclick = () => { if (!confirm('删除这条摘录？')) return; record.notes = record.notes.filter((note) => note.id !== item.id); try { state.rendition.annotations.remove(item.cfi, 'highlight'); } catch {} markBackupChange('records'); renderNotes(); };
        actions.append(edit, remove); row.append(button, actions); body.append(row);
      }
      const exportButton = makeButton('导出本书摘录 Markdown', () => exportNotes(record)); body.append(exportButton);
    });
  }
  function allNotes() {
    return allBooks().flatMap((book) => (bookRecord(book.id).notes || []).map((note) => ({ ...note, bookId: book.id, bookTitle: book.title }))).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }
  function renderAllNotes() {
    openDrawer('全部摘录', (body) => {
      const input = document.createElement('input'); input.type = 'search'; input.placeholder = '搜索书名、摘录、笔记或标签'; input.maxLength = 80; input.setAttribute('aria-label', '搜索全部摘录');
      const results = document.createElement('div'); body.append(input, results);
      const render = () => {
        results.replaceChildren(); const query = input.value.trim().toLocaleLowerCase();
        const matches = allNotes().filter((item) => !query || `${item.bookTitle} ${item.quote || ''} ${item.note || ''} ${(item.tags || []).join(' ')}`.toLocaleLowerCase().includes(query));
        const count = document.createElement('p'); count.textContent = `${matches.length} 条摘录`; results.append(count);
        for (const item of matches) {
          const button = makeButton(`${item.bookTitle} · ${(item.quote || item.note || '本页笔记').slice(0, 70)}`, async () => { closeDrawer(); await openBook(item.bookId, item.cfi); }, `${(item.tags || []).join(' · ')}${item.tags?.length ? ' · ' : ''}${item.note || ''}`);
          button.style.borderLeft = `4px solid ${HIGHLIGHT_COLORS[item.color] || HIGHLIGHT_COLORS.gold}`; results.append(button);
        }
      };
      input.oninput = render; render();
      body.append(makeButton('导出全部摘录 Markdown', exportAllNotes));
    });
  }
  function exportAllNotes() {
    const lines = ['# 墨页书房 · 全部摘录', ''];
    for (const item of allNotes()) lines.push(`## ${item.bookTitle}`, '', item.quote ? `> ${item.quote.replace(/\n/g, '\n> ')}` : '', '', item.note || '', '', `标签：${(item.tags || []).join('、') || '无'} · ${new Date(item.createdAt).toLocaleString('zh-CN')}`, '');
    downloadBlob(new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' }), '%e5%a2%a8%e9%a1%b5%e4%b9%a6%e6%88%bf-%e5%85%a8%e9%83%a8%e6%91%98%e5%bd%95.md.html');
  }
  function renderSearch() {
    openDrawer('书内搜索', (body) => {
      const input = document.createElement('input'); input.type = 'search'; input.placeholder = '输入正文关键词'; input.maxLength = 60; input.setAttribute('aria-label', '书内搜索关键词');
      const results = document.createElement('div'); const hint = document.createElement('p'); hint.textContent = '仅在当前电子书中检索。长篇作品可能需要稍等。';
      body.append(input, hint, results);
      let timer;
      input.addEventListener('input', () => { clearTimeout(timer); const query = input.value.trim(); if (query.length < 2) { results.replaceChildren(); return; } timer = setTimeout(() => searchBook(query, results), 350); });
    });
  }
  async function searchBook(query, output) {
    if (!state.book) return;
    const book = state.book; const serial = (state.searchSerial = (state.searchSerial || 0) + 1);
    output.textContent = '正在检索…'; const matches = [];
    try {
      for (const section of book.spine.spineItems) {
        if (serial !== state.searchSerial || book !== state.book) return;
        await section.load(book.load.bind(book));
        for (const hit of section.find(query)) { matches.push(hit); if (matches.length >= 100) break; }
        section.unload(); if (matches.length >= 100) break;
      }
      if (serial !== state.searchSerial) return;
      output.replaceChildren();
      if (!matches.length) { output.textContent = '没有找到匹配的正文。'; return; }
      const count = document.createElement('p'); count.textContent = `找到 ${matches.length}${matches.length >= 100 ? '＋' : ''} 处`; output.append(count);
      for (const hit of matches) output.append(makeButton(hit.excerpt || query, () => { state.rendition.display(hit.cfi); closeDrawer(); }));
    } catch (error) { if (serial === state.searchSerial) output.textContent = `搜索失败：${error.message}`; }
  }
  function exportNotes(record) {
    const title = $('#current-title').textContent; const lines = [`# ${title} · 阅读摘录`, ''];
    for (const item of record.notes) { lines.push(item.quote ? `> ${item.quote.replace(/\n/g, '\n> ')}` : '', '', item.note || '', '', `标签：${(item.tags || []).join('、') || '无'} · ${new Date(item.createdAt).toLocaleString('zh-CN')}`, ''); }
    downloadBlob(new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' }), `${safeName(title)}-摘录.md`);
  }
  function openNoteDialog(existing = null) {
    showReaderControls(); state.editingNoteId = existing?.id || null;
    $('#note-dialog-title').textContent = existing ? '编辑摘录' : '保存摘录';
    $('#selected-quote').textContent = existing?.quote || state.selection?.quote || '当前阅读位置';
    $('#note-text').value = existing?.note || ''; $('#note-color').value = HIGHLIGHT_COLORS[existing?.color] ? existing.color : 'gold';
    $('#note-tags').value = (existing?.tags || []).join(', '); $('#note-dialog').showModal();
  }
  function addHighlight(note) { if (note.quote && note.cfi) { try { state.rendition.annotations.highlight(note.cfi, {}, () => renderNotes(), 'reader-highlight', { fill: HIGHLIGHT_COLORS[note.color] || HIGHLIGHT_COLORS.gold, 'fill-opacity': '0.3' }); } catch {} } }
  function saveNote() {
    if (!state.currentId) return;
    const selection = state.selection || { cfi: state.currentCfi, quote: '' };
    const record = bookRecord(state.currentId); const existing = record.notes.find((item) => item.id === state.editingNoteId);
    const note = existing || { id: crypto.randomUUID(), cfi: selection.cfi || state.currentCfi, quote: selection.quote, createdAt: new Date().toISOString() };
    note.note = $('#note-text').value.trim(); note.color = $('#note-color').value in HIGHLIGHT_COLORS ? $('#note-color').value : 'gold';
    note.tags = [...new Set($('#note-tags').value.split(/[,，]/).map((tag) => tag.trim().slice(0, 24)).filter(Boolean))].slice(0, 8);
    if (!note.quote && !note.note) { toast('请写下笔记，或先选中一段文字'); return; }
    if (existing) { try { state.rendition.annotations.remove(existing.cfi, 'highlight'); } catch {} note.updatedAt = new Date().toISOString(); }
    else record.notes.push(note);
    addHighlight(note); markBackupChange('records'); $('#note-dialog').close(); state.selection = null; state.editingNoteId = null; toast(existing ? '摘录已更新' : '摘录已保存到本机');
    if (!$('#side-drawer').hidden) renderNotes();
  }

  async function exportBackup() {
    const button = $('#export-backup'); button.disabled = true; message($('#backup-message'), '正在打包，请不要关闭页面…');
    try {
      const zip = new JSZip(); const items = await getAllBooks();
      const manifest = { app: 'moye-reader', version: 1, createdAt: new Date().toISOString(), settings: state.settings, typographyByBook: state.typographyByBook, records: state.records, books: [] };
      for (const item of items) { const filename = `books/${item.id}.epub`; zip.file(filename, item.data); manifest.books.push({ id: item.id, title: item.title, author: item.author, color: item.color, genre: item.genre, description: item.description || '', subject: item.subject || '', hash: item.hash || null, filename: item.filename, size: item.data.byteLength, importedAt: item.importedAt, path: filename }); }
      zip.file('manifest.json.html', JSON.stringify(manifest, null, 2));
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } });
      downloadBlob(blob, `墨页书房-完整备份-${new Date().toISOString().slice(0, 10)}.zip`);
      state.backupMeta.lastFullAt = new Date().toISOString(); state.backupMeta.lastLightAt = state.backupMeta.lastFullAt; state.backupMeta.firstUnbackedRecordAt = null; await saveState(); renderBackupReminder();
      message($('#backup-message'), `完整备份已生成：${items.length} 本导入书籍，包含阅读进度和笔记。请确认文件已保存到设备。`);
    } catch (error) { message($('#backup-message'), `备份失败：${error.message}`); } finally { button.disabled = false; }
  }
  async function exportLightBackup() {
    const button = $('#export-light-backup'); button.disabled = true;
    try {
      const payload = { app: 'moye-reader', kind: 'reading-data', version: 1, createdAt: new Date().toISOString(), settings: state.settings, books: allBooks().map((book) => { const record = state.records[book.id]; return { id: book.id, title: book.title, author: book.author, size: book.size || 0, hash: book.hash || null, record: record?.updated || record?.bookmarks?.length || record?.notes?.length ? record : null, typography: state.typographyByBook[book.id] || null }; }) };
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json;charset=utf-8' });
      downloadBlob(blob, `墨页书房-阅读记录-${new Date().toISOString().slice(0, 10)}.json`);
      state.backupMeta.lastLightAt = new Date().toISOString(); state.backupMeta.firstUnbackedRecordAt = null; await saveState(); renderBackupReminder();
      message($('#backup-message'), `轻量备份已生成（${formatSize(blob.size)}）。换设备时请先导入同一本 EPUB，再恢复此文件。`);
    } catch (error) { message($('#backup-message'), `轻量备份失败：${error.message}`); } finally { button.disabled = false; }
  }
  async function restoreLightBackup(file) {
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw Error('轻量备份超过 10 MB，请检查文件');
      const payload = JSON.parse(await file.text());
      if (payload.app !== 'moye-reader' || payload.kind !== 'reading-data' || payload.version !== 1 || !Array.isArray(payload.books) || payload.books.length > MAX_BOOKS + BUILTINS.length || !payload.settings) throw Error('不是受支持的轻量备份');
      const current = allBooks(); const matches = []; let approximate = 0; let missing = 0;
      for (const source of payload.books) {
        if (!source || typeof source.id !== 'string' || !source.record) continue;
        let target = current.find((item) => item.id === source.id);
        if (!target && source.hash) target = current.find((item) => item.hash && item.hash === source.hash);
        if (!target && !source.id.startsWith('builtin-')) {
          const candidates = current.filter((item) => !item.builtin && bookIdentity(item) === bookIdentity(source));
          if (candidates.length === 1) { target = candidates[0]; approximate++; }
        }
        if (!target) { missing++; continue; }
        matches.push({ source, target });
      }
      if (!matches.length) throw Error('未找到对应书籍。请先导入与备份相同的 EPUB，再恢复阅读记录');
      if (!confirm(`将覆盖 ${matches.length} 本匹配书籍的进度、书签和摘录；${missing} 本未匹配会跳过。${approximate ? `其中 ${approximate} 本仅按书名、作者和文件大小匹配，请确认是同一版本。` : ''}继续？`)) return;
      const nextRecords = { ...state.records }; const nextTypography = { ...state.typographyByBook };
      for (const { source, target } of matches) {
        if (!Array.isArray(source.record.bookmarks) || !Array.isArray(source.record.notes)) throw Error('阅读记录格式不正确，未进行恢复');
        nextRecords[target.id] = source.record;
        if (source.typography) nextTypography[target.id] = normalizeTypography(source.typography);
      }
      const nextSettings = { ...state.settings, ...payload.settings }; const nextMeta = { ...state.backupMeta, lastLightAt: new Date().toISOString(), firstUnbackedRecordAt: null };
      await dbRequest('state', 'readwrite', (store) => store.put({ key: 'reader', records: nextRecords, settings: nextSettings, typographyByBook: nextTypography, backupMeta: nextMeta }));
      closeBook(); state.records = nextRecords; state.typographyByBook = nextTypography; state.settings = nextSettings; state.backupMeta = nextMeta;
      $('#shelf-sort').value = state.settings.shelfSort || 'recent'; updateGestureHint(); renderShelf();
      message($('#backup-message'), `已恢复 ${matches.length} 本书的阅读记录；${missing} 本未匹配，未导入或修改书籍文件。`);
    } catch (error) { message($('#backup-message'), `轻量恢复失败：${error.message}`); }
    finally { $('#restore-light-backup').value = ''; }
  }
  async function restoreBackup(file) {
    if (!file) return;
    if (!confirm('恢复将替换当前导入书籍和所有阅读记录。确认已备份现有数据，并继续恢复？')) return;
    message($('#backup-message'), '正在校验备份…');
    try {
      if (file.size > 350 * 1024 * 1024) throw Error('备份超过 350 MB，浏览器可能无法安全处理');
      const zip = await JSZip.loadAsync(file); const raw = await zip.file('manifest.json.html')?.async('string'); if (!raw) throw Error('找不到备份清单');
      const manifest = JSON.parse(raw); if (manifest.app !== 'moye-reader' || manifest.version !== 1 || !Array.isArray(manifest.books) || !manifest.records || !manifest.settings) throw Error('备份格式或版本不受支持');
      if (manifest.books.length > MAX_BOOKS) throw Error('备份中的书籍数量超过上限');
      const restored = []; let totalSize = 0;
      for (const item of manifest.books) {
        if (!/^import-[a-f0-9-]{36}$/.test(item.id) || item.path !== `books/${item.id}.epub`) throw Error('备份中有无效的书籍条目');
        const entry = zip.file(item.path); if (!entry) throw Error('备份缺少电子书文件');
        const claimedSize = entry._data?.uncompressedSize || Number(item.size) || 0;
        if (claimedSize > MAX_FILE || totalSize + claimedSize > MAX_LIBRARY) throw Error('备份中的电子书超出浏览器安全容量');
        const data = await entry.async('arraybuffer'); if (data.byteLength > MAX_FILE) throw Error('备份中有超过单本大小限制的书');
        totalSize += data.byteLength; if (totalSize > MAX_LIBRARY) throw Error('备份中的书库超过 300 MB');
        const coverData = /^data:image\/(png|jpeg|webp|gif);base64,/.test(item.coverData || '') && item.coverData.length < 1.5 * 1024 * 1024 ? item.coverData : '';
        restored.push({ id: item.id, title: String(item.title).slice(0, 100), author: String(item.author).slice(0, 80), color: item.color || '#627362', genre: item.genre || '本地导入', description: String(item.description || '').slice(0, 500), subject: String(item.subject || '').slice(0, 60), coverData, hash: /^[a-f0-9]{64}$/.test(item.hash || '') ? item.hash : null, metadataScanned: Boolean(coverData), filename: safeName(item.filename), size: data.byteLength, importedAt: item.importedAt, data });
      }
      // 校验全部完成后才开启写事务；出错时 IndexedDB 会整笔回滚。
      await new Promise((resolve, reject) => {
        const tx = state.db.transaction(['books', 'state'], 'readwrite'); const books = tx.objectStore('books'); books.clear(); for (const item of restored) books.put(item);
        tx.objectStore('state').put({ key: 'reader', records: manifest.records, settings: manifest.settings, typographyByBook: manifest.typographyByBook || {}, backupMeta: { ...state.backupMeta, lastFullAt: new Date().toISOString(), lastLightAt: new Date().toISOString(), firstUnbackedRecordAt: null } });
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
      closeBook(); state.imported = restored.map(({ data, ...item }) => item); state.records = manifest.records; state.settings = { theme: 'paper', fontSize: 100, lineHeight: 1.75, flow: 'paginated', swipeNext: 'right', shelfSort: 'recent', ...manifest.settings }; state.typographyByBook = manifest.typographyByBook || {}; state.backupMeta.lastFullAt = new Date().toISOString(); state.backupMeta.lastLightAt = state.backupMeta.lastFullAt; state.backupMeta.firstUnbackedRecordAt = null; $('#shelf-sort').value = state.settings.shelfSort; updateGestureHint(); renderShelf(); setTimeout(enrichExistingBooks, 500);
      message($('#backup-message'), `恢复完成：${restored.length} 本导入书籍。`); toast('书架和阅读记录已恢复');
    } catch (error) { message($('#backup-message'), `恢复失败，当前数据未替换：${error.message}`); }
    $('#restore-backup').value = '';
  }

  function bind() {
    const leaveReader = async () => {
      try { clearTimeout(state.saveTimer); await saveState(); closeBook(); }
      catch { toast('保存失败，请检查浏览器可用空间，或先导出阅读备份'); }
    };
    $('#library-button').onclick = leaveReader; $('#back-to-shelf').onclick = leaveReader;
    $('#backup-button').onclick = () => $('#backup-dialog').showModal(); $('#export-backup').onclick = exportBackup; $('#export-light-backup').onclick = exportLightBackup; $('#restore-backup').onchange = (event) => restoreBackup(event.target.files[0]); $('#restore-light-backup').onchange = (event) => restoreLightBackup(event.target.files[0]);
    $('#backup-reminder-action').onclick = () => { $('#backup-dialog').showModal(); ($('#backup-reminder-action').dataset.kind === 'full' ? $('#export-backup') : $('#export-light-backup')).focus(); };
    $('#backup-reminder-dismiss').onclick = () => { state.backupMeta.lastReminderAt = new Date().toISOString(); scheduleSave(); renderBackupReminder(); };
    $('#book-import').onchange = (event) => importBooks(event.target.files); $('#shelf-search').oninput = renderShelf; $('#shelf-sort').onchange = (event) => { state.settings.shelfSort = event.target.value; scheduleSave(); renderShelf(); }; $('#all-notes-button').onclick = renderAllNotes;
    document.querySelectorAll('[data-filter]').forEach((button) => button.onclick = () => { state.filter = button.dataset.filter; document.querySelectorAll('[data-filter]').forEach((item) => item.classList.toggle('active', item === button)); renderShelf(); });
    $('#prev-page').onclick = () => state.rendition?.prev(); $('#next-page').onclick = () => state.rendition?.next();
    $('#controls-toggle').onclick = showReaderControls;
    $('#toc-button').onclick = renderToc; $('#find-button').onclick = renderSearch; $('#bookmark-button').onclick = addBookmark; $('#note-button').onclick = renderNotes; $('#settings-button').onclick = renderSettings;
    $('#drawer-backdrop').onclick = closeDrawer; $('#drawer-close').onclick = closeDrawer; $('#save-note').onclick = saveNote; $('#cancel-note').onclick = () => { $('#note-dialog').close(); state.selection = null; state.editingNoteId = null; };
    $('#progress-slider').onchange = (event) => { if (!state.book?.locations?.length?.()) return; const cfi = state.book.locations.cfiFromPercentage(Number(event.target.value) / 1000); if (cfi) state.rendition.display(cfi); };
    document.addEventListener('keydown', (event) => { if (state.currentId && !$('#side-drawer').hidden) return; if (state.currentId && !event.target.closest('input,textarea,select,button,dialog')) { if (event.key === 'ArrowRight') state.rendition?.next(); if (event.key === 'ArrowLeft') state.rendition?.prev(); } });
    window.addEventListener('online', updateNetwork); window.addEventListener('offline', updateNetwork);
    navigator.serviceWorker?.addEventListener('controllerchange', refreshOfflineShelf);
  }
  function updateNetwork() { $('#offline-status').textContent = navigator.onLine ? '仅在本机阅读' : '当前离线 · 可读已缓存作品'; }
  async function init() {
    bind(); bindIosGestureLayer(); updateNetwork();
    try { state.db = await openDb(); const saved = await dbRequest('state', 'readonly', (store) => store.get('reader')); if (saved) { state.records = saved.records || {}; state.settings = { ...state.settings, ...saved.settings }; state.typographyByBook = saved.typographyByBook || {}; state.backupMeta = { ...state.backupMeta, ...saved.backupMeta }; } state.imported = (await getAllBooks()).map(({ data, ...item }) => ({ ...item, size: item.size || data?.byteLength || 0 })); if (state.imported.length && !state.backupMeta.lastFullAt && !state.backupMeta.bookMutationAt) { state.backupMeta.bookMutationAt = new Date().toISOString(); scheduleSave(); } $('#shelf-sort').value = state.settings.shelfSort || 'recent'; updateGestureHint(); renderShelf(); setTimeout(enrichExistingBooks, 500); }
    catch (error) { message($('#storage-message'), '浏览器存储不可用：导入、进度和笔记无法保存。请允许本站使用站点存储。'); $('#book-import').disabled = true; renderShelf(); }
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((registration) => registration.update()).catch(() => {});
  }
  init();
})();
