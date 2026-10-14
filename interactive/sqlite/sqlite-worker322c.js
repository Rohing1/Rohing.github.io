import sqlite3InitModule from 'vendor/package/dist/index.mjs';

const MAX_BYTES = 64 * 1024 * 1024;
const PAGE_SIZE = 100;
const MAX_COLUMNS = 60;
const MAX_TEXT_BYTES = 4000;
const decoder = new TextDecoder();
const magic = new TextEncoder().encode('SQLite format 3\0');
let sqlite;
let database;
let catalog = [];

async function engine() {
  if (!sqlite) sqlite = await sqlite3InitModule();
  return sqlite;
}

function closeDatabase() {
  if (database) database.close();
  database = null;
  catalog = [];
}

function quoteIdentifier(name) {
  return `"${String(name).replaceAll('"', '""')}"`;
}

function selectStatement(sql) {
  if (typeof sql !== 'string' || sql.length > 10000) throw new Error('查询语句不能为空，且最多 10,000 个字符。');
  const clean = sql.trim().replace(/;\s*$/, '').trim();
  if (!/^(SELECT|WITH)\b/i.test(clean)) throw new Error('只能运行单条 SELECT 或 WITH 查询。');
  return clean;
}

function readCell(stmt, index) {
  const capi = sqlite.capi;
  const type = capi.sqlite3_column_type(stmt, index);
  if (type === capi.SQLITE_NULL) return {kind: 'null', text: 'NULL'};
  if (type === capi.SQLITE_BLOB) {
    return {kind: 'blob', text: `[BLOB ${capi.sqlite3_column_bytes(stmt, index)} B]`};
  }
  if (type === capi.SQLITE_TEXT) {
    const length = capi.sqlite3_column_bytes(stmt, index);
    // The capi wrapper converts text to a JS string; use the raw pointer so a huge cell is never copied whole.
    const pointer = sqlite.wasm.exports.sqlite3_column_text(stmt.pointer, index);
    const shown = Math.min(length, MAX_TEXT_BYTES);
    const text = pointer ? decoder.decode(sqlite.wasm.heap8u().subarray(pointer, pointer + shown)) : '';
    return {kind: 'text', text: length > shown ? `${text}… [已截短]` : text};
  }
  return {kind: 'number', text: String(stmt.get(index))};
}

function collect(stmt, maxRows) {
  const columns = stmt.getColumnNames();
  if (columns.length > MAX_COLUMNS) throw new Error(`结果超过 ${MAX_COLUMNS} 列，请缩小 SELECT 的字段范围。`);
  const rows = [];
  while (rows.length < maxRows && stmt.step()) {
    const row = [];
    for (let index = 0; index < columns.length; index++) row.push(readCell(stmt, index));
    rows.push(row);
  }
  return {columns, rows};
}

async function openFile(file) {
  if (!(file instanceof File)) throw new Error('请先选择数据库文件。');
  if (file.size < 100 || file.size > MAX_BYTES) throw new Error('只支持 100 字节至 64 MiB 的 SQLite 文件。');
  const header = new Uint8Array(await file.slice(0, 100).arrayBuffer());
  if (!magic.every((byte, index) => header[index] === byte)) throw new Error('文件头不是标准 SQLite 数据库。');
  if (header[18] === 2 || header[19] === 2) throw new Error('这是 WAL 模式数据库。请先导出一致性备份，再打开备份文件。');

  const module = await engine();
  closeDatabase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pointer = module.wasm.allocFromTypedArray(bytes);
  const db = new module.oo1.DB();
  db.onclose = {after() { module.wasm.dealloc(pointer); }};
  try {
    const flags = module.capi.SQLITE_DESERIALIZE_READONLY;
    db.checkRc(module.capi.sqlite3_deserialize(db.pointer, 'main', pointer, bytes.byteLength, bytes.byteLength, flags));
    // Defense in depth: even if a future SQL path changes, the connection must remain read-only.
    db.exec('PRAGMA query_only=ON');
    const records = db.selectObjects("SELECT name, type FROM sqlite_schema WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name LIMIT 501");
    database = db;
    catalog = records.slice(0, 500);
    return {name: file.name, size: file.size, version: module.version.libVersion, tables: catalog, truncated: records.length > 500};
  } catch (error) {
    db.close();
    throw error;
  }
}

function structure(name) {
  if (!database) throw new Error('请先打开数据库。');
  const selected = catalog.find(item => item.name === name);
  if (!selected) throw new Error('找不到这张表或视图。');
  const rows = database.selectObjects(`PRAGMA table_xinfo(${quoteIdentifier(name)})`).slice(0, 200);
  return {name, type: selected.type, columns: rows.map(row => ({name: row.name, type: row.type || '—', pk: row.pk || 0, notnull: !!row.notnull, defaultValue: row.dflt_value === null ? '—' : String(row.dflt_value)}))};
}

function relationships(){
  if(!database)throw Error('请先打开数据库');const tables=catalog.filter(x=>x.type==='table').slice(0,100),links=[];
  for(const table of tables){for(const r of database.selectObjects(`PRAGMA foreign_key_list(${quoteIdentifier(table.name)})`).slice(0,100)){links.push({from:table.name,field:r.from,to:r.table,target:r.to||'(目标主键)',id:r.id,sequence:r.seq});if(links.length>=1000)break;}if(links.length>=1000)break;}
  return {tables:tables.map(x=>x.name),links,truncated:catalog.filter(x=>x.type==='table').length>100||links.length>=1000};
}

function query(sql, page, explain) {
  if (!database) throw new Error('请先打开数据库。');
  const clean = selectStatement(sql);
  if (!Number.isInteger(page) || page < 0 || page > 100000) throw new Error('页码无效。');
  const statement = explain
    ? `EXPLAIN QUERY PLAN ${clean}`
    : `SELECT * FROM (${clean}) LIMIT ${PAGE_SIZE + 1} OFFSET ${page * PAGE_SIZE}`;
  const stmt = database.prepare(statement);
  try {
    if (!stmt.isReadOnly()) throw new Error('此语句不是只读查询。');
    const result = collect(stmt, explain ? PAGE_SIZE : PAGE_SIZE + 1);
    const hasMore = !explain && result.rows.length > PAGE_SIZE;
    if (hasMore) result.rows.pop();
    return {...result, page, hasMore, explain: !!explain};
  } finally {
    stmt.finalize();
  }
}

self.onmessage = async event => {
  const {id, type, payload = {}} = event.data || {};
  try {
    let result;
    if (type === 'open') result = await openFile(payload.file);
    else if (type === 'schema') result = structure(payload.name);
    else if (type === 'relationships') result = relationships();
    else if (type === 'query') result = query(payload.sql, payload.page, payload.explain);
    else if (type === 'close') { closeDatabase(); result = null; }
    else throw new Error('未知操作。');
    self.postMessage({id, ok: true, result});
  } catch (error) {
    self.postMessage({id, ok: false, error: error instanceof Error ? error.message : '处理失败。'});
  }
};
