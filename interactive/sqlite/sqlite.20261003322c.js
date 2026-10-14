(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const ui = Object.fromEntries(['file','drop-zone','file-name','open','stop','clear','status','database','db-name','db-meta','table-count','table-search','tables','sql','run','explain','export','query-status','schema-panel','schema-title','schema-type','schema-rows','empty','result-wrap','result-head','result-body','result-meta','pager','prev','next','page-label'].map(id => [id, $(id)]));
  const HARD_LIMIT = 64 * 1024 * 1024;
  const WARN_LIMIT = 32 * 1024 * 1024;
  let worker;
  let nextId = 0;
  let pending = new Map();
  let file = null;
  let opened = false;
  let busy = false;
  let catalog = [];
  let selected = '';
  let activeSql = '';
  let activeExplain = false;
  let currentResult = null;
  let selectedColumns=[];
  const visual=document.createElement('section');visual.className='wb-panel';visual.id='visual-query';visual.innerHTML='<h2>可视化只读查询</h2><p class="wb-note">先选择表，再勾选字段、设置最多 3 个条件与排序。本页仅生成 SELECT，点击运行前可查看 SQL；默认不保存语句或数据库内容。</p><div id="visual-fields" class="wb-row"></div><div id="visual-conditions" class="wb-grid"></div><div class="wb-row"><label>条件组合<select id="visual-join"><option value="AND">全部满足</option><option value="OR">任一满足</option></select></label><label>排序字段<select id="visual-sort"></select></label><select id="visual-direction" aria-label="排序方向"><option value="ASC">升序</option><option value="DESC">降序</option></select><button id="visual-build" disabled>生成 SQL</button><button id="visual-run" disabled>生成并运行</button></div><p id="visual-status" class="wb-status" role="status"></p>';
  document.querySelector('.query-panel').before(visual);
  const saved=document.createElement('details');saved.className='wb-panel';saved.innerHTML='<summary>查询模板收藏（需主动保存）</summary><p class="wb-note">收藏只保存 SQL 和模板名称，不保存数据库。SQL 也可能包含敏感条件，请确认后保存；最多 30 条。</p><div class="wb-row"><input id="query-name" maxlength="80" placeholder="模板名称" aria-label="模板名称"><button id="query-save">保存当前 SQL 为模板</button><select id="query-saved" aria-label="查询模板"></select><button id="query-load">载入所选模板</button><button id="query-delete">删除所选模板</button></div><p id="template-status" role="status"></p>';
  visual.after(saved);
  const relations=document.createElement('details');relations.className='wb-panel';relations.innerHTML='<summary>字段关系图</summary><p class="wb-note">只展示数据库明确声明的外键，不根据名称猜测关系。最多检查 100 张表、1,000 条字段关系；结构名称也可能敏感。</p><button id="relations-load">读取并绘制关系</button><div id="relations-output" class="wb-relationships"></div>';
  saved.after(relations);
  const quote=name=>'"'+String(name).replaceAll('"','""')+'"';
  const make=(t,text)=>{const e=document.createElement(t);if(text!=null)e.textContent=text;return e;};
  function fillVisual(result){selectedColumns=result.columns.map(c=>c.name);const fields=document.getElementById('visual-fields');fields.replaceChildren();for(const c of result.columns.slice(0,60)){const l=make('label'),x=make('input');x.type='checkbox';x.value=c.name;x.checked=result.columns.length<=60;l.append(x,document.createTextNode(c.name));fields.append(l);}const conditions=document.getElementById('visual-conditions');conditions.replaceChildren();for(let i=0;i<3;i++){const row=make('div');row.className='wb-row';const col=make('select'),op=make('select'),value=make('input');col.setAttribute('aria-label',`条件 ${i+1} 字段`);op.setAttribute('aria-label',`条件 ${i+1} 运算符`);value.setAttribute('aria-label',`条件 ${i+1} 值`);col.add(new Option('不使用条件',''));for(const c of selectedColumns)col.add(new Option(c,c));for(const[o,l]of [['=','等于'],['!=','不等于'],['>','大于'],['<','小于'],['contains','包含文字'],['IS NULL','为空'],['IS NOT NULL','非空']])op.add(new Option(l,o));value.maxLength=1000;op.onchange=()=>value.disabled=op.value.startsWith('IS');row.append(col,op,value);conditions.append(row);}const sort=document.getElementById('visual-sort');sort.replaceChildren(new Option('不排序',''));for(const c of selectedColumns)sort.add(new Option(c,c));document.getElementById('visual-build').disabled=document.getElementById('visual-run').disabled=false;}
  function buildSQL(){if(!opened||!selected)throw Error('先选择表');const fields=[...document.querySelectorAll('#visual-fields input:checked')].map(x=>x.value);if(!fields.length)throw Error('至少勾选一个字段');const clauses=[];for(const row of document.getElementById('visual-conditions').children){const[col,op,val]=row.children;if(!col.value)continue;if(!selectedColumns.includes(col.value))throw Error('字段无效');const ident=quote(col.value),literal="'"+val.value.replaceAll("'","''")+"'";if(op.value.startsWith('IS'))clauses.push(ident+' '+op.value);else if(op.value==='contains')clauses.push(`instr(CAST(${ident} AS TEXT),${literal}) > 0`);else{if(!['=','!=','>','<'].includes(op.value))throw Error('运算符无效');const text=val.value.trim(),number=/^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)&&Number.isFinite(Number(text));clauses.push(ident+' '+op.value+' '+(number?text:literal));}}const join=document.getElementById('visual-join').value==='OR'?' OR ':' AND ',sort=document.getElementById('visual-sort').value,direction=document.getElementById('visual-direction').value==='DESC'?'DESC':'ASC';return 'SELECT '+fields.map(quote).join(', ')+' FROM '+quote(selected)+(clauses.length?' WHERE '+clauses.map(x=>'('+x+')').join(join):'')+(sort?' ORDER BY '+quote(sort)+' '+direction:'');}
  document.getElementById('visual-build').onclick=()=>{try{if(busy)throw Error('请等待当前操作');ui.sql.value=buildSQL();document.getElementById('visual-status').textContent='已生成，可编辑后运行。';}catch(e){document.getElementById('visual-status').textContent=e.message;}};
  document.getElementById('visual-run').onclick=()=>{try{if(busy)throw Error('请等待当前操作');ui.sql.value=buildSQL();void runQuery(0,false,ui.sql.value);}catch(e){document.getElementById('visual-status').textContent=e.message;}};
  let templates=[];try{const data=JSON.parse(localStorage.getItem('yj-sqlite-queries-v1')||'[]');if(Array.isArray(data)&&data.length<=30)templates=data.filter(x=>x&&typeof x.name==='string'&&x.name.length<=80&&typeof x.sql==='string'&&x.sql.length<=10000);}catch{}
  function templateList(){const list=document.getElementById('query-saved');list.replaceChildren();templates.forEach((x,i)=>list.add(new Option(x.name,String(i))));}templateList();
  function saveTemplates(){localStorage.setItem('yj-sqlite-queries-v1',JSON.stringify(templates));templateList();}
  document.getElementById('query-save').onclick=()=>{try{const name=document.getElementById('query-name').value.trim(),sql=ui.sql.value.trim();if(!name||!sql||sql.length>10000)throw Error('请输入名称和有效 SQL（最多 10,000 字符）');if(templates.length>=30)throw Error('最多 30 个模板，请先删除不用的');if(!confirm('确认将这段 SQL 保存在当前浏览器？它可能包含敏感筛选条件。'))return;const next=[...templates,{name,sql}];localStorage.setItem('yj-sqlite-queries-v1',JSON.stringify(next));templates=next;templateList();document.getElementById('template-status').textContent='已保存模板，未保存数据库内容。';}catch(e){document.getElementById('template-status').textContent=e.message;}};
  document.getElementById('query-load').onclick=()=>{if(!busy&&templates[Number(document.getElementById('query-saved').value)])ui.sql.value=templates[Number(document.getElementById('query-saved').value)].sql;};
  document.getElementById('query-delete').onclick=()=>{try{const i=Number(document.getElementById('query-saved').value);if(templates[i]&&confirm('删除所选 SQL 模板？')){const next=templates.filter((_,n)=>n!==i);localStorage.setItem('yj-sqlite-queries-v1',JSON.stringify(next));templates=next;templateList();}}catch(e){document.getElementById('template-status').textContent=e.message;}};
  document.getElementById('relations-load').onclick=async()=>{const out=document.getElementById('relations-output');if(!opened||busy){out.textContent='请先打开数据库并等待当前操作';return;}setBusy(true);try{const r=await request('relationships',{},8000);out.replaceChildren();for(const name of r.tables){const card=make('article'),title=make('strong',name);card.append(title);const links=r.links.filter(x=>x.from===name);for(const l of links){const p=make('div',l.field+' → '+l.to+'.'+l.target);p.className='wb-relation';card.append(p);}if(!links.length)card.append(make('p','未声明外键'));out.append(card);}if(r.truncated)out.append(make('p','关系较多，当前显示已截断。'));}catch(e){out.textContent=e.message;}finally{setBusy(false);}};

  function newWorker() {
    worker = new Worker('sqlite-worker322c.js?v=20261005c', {type: 'module'});
    worker.onmessage = event => {
      const reply = pending.get(event.data?.id);
      if (!reply) return;
      clearTimeout(reply.timer);
      pending.delete(event.data.id);
      if (event.data.ok) reply.resolve(event.data.result);
      else reply.reject(new Error(event.data.error || '处理失败。'));
    };
    worker.onerror = () => {
      worker.terminate();
      worker = null;
      for (const reply of pending.values()) { clearTimeout(reply.timer); reply.reject(new Error('数据库引擎加载失败。请检查浏览器是否支持 WebAssembly，或刷新后重试。')); }
      pending.clear();
      opened = false;
      resetDataView();
      setStatus('数据库引擎加载失败。请检查浏览器兼容性或刷新页面。', true);
    };
  }

  function replaceWorker(reason = '操作已中止。') {
    if (worker) worker.terminate();
    for (const reply of pending.values()) { clearTimeout(reply.timer); reply.reject(new Error(reason)); }
    pending.clear();
    newWorker();
  }

  function request(type, payload, timeoutMs) {
    return new Promise((resolve, reject) => {
      if (!worker) newWorker();
      const id = ++nextId;
      const timer = setTimeout(() => {
        replaceWorker(`${type === 'query' ? '查询' : '操作'}超时，后台线程已重启。请重新打开数据库。`);
        opened = false;
        resetDataView();
      }, timeoutMs);
      pending.set(id, {resolve, reject, timer});
      worker.postMessage({id, type, payload});
    });
  }

  function setStatus(message, error = false) {
    ui.status.textContent = message;
    ui.status.classList.toggle('error', error);
  }

  function setBusy(value) {
    busy = value;
    ui.open.disabled = value || !file;
    ui.stop.hidden = !value;
    ui.clear.disabled = value || (!file && !opened);
    ui.file.disabled = value;
    ui.sql.disabled = value || !opened;
    ui.run.disabled = value || !opened;
    ui.explain.disabled = value || !opened;
    ui.prev.disabled = value || !currentResult || currentResult.page === 0;
    ui.next.disabled = value || !currentResult || !currentResult.hasMore;
    ui.export.disabled = value || !currentResult || !currentResult.rows.length;
  }

  function resetDataView() {
    opened = false;
    catalog = [];
    selected = '';
    activeSql = '';
    currentResult = null;
    ui.database.hidden = true;
    ui['schema-panel'].hidden = true;
    ui['result-wrap'].hidden = true;
    ui.pager.hidden = true;
    ui.empty.hidden = false;
    ui['result-meta'].textContent = '尚无结果';
    ui['query-status'].textContent = '打开数据库后选择一张表，或输入查询语句。';
    ui.sql.value = '';
    selectedColumns=[];document.getElementById('visual-fields').replaceChildren();document.getElementById('visual-conditions').replaceChildren();document.getElementById('visual-sort').replaceChildren();document.getElementById('visual-build').disabled=document.getElementById('visual-run').disabled=true;document.getElementById('relations-output').replaceChildren();
    setBusy(false);
  }

  function chooseFile(chosen) {
    if (!chosen) return;
    if (busy) return;
    replaceWorker();
    file = chosen;
    resetDataView();
    ui['file-name'].textContent = `${chosen.name} · ${(chosen.size / 1048576).toFixed(2)} MiB`;
    if (chosen.size > HARD_LIMIT) setStatus('文件超过 64 MiB，当前版本不会载入。建议使用桌面 SQLite 工具。', true);
    else setStatus('文件已选择；点击“打开数据库”。不会上传文件。');
  }

  async function openFile() {
    if (!file || busy) return;
    if (file.size > HARD_LIMIT) { setStatus('文件超过 64 MiB，无法打开。', true); return; }
    if (file.size > WARN_LIMIT && !window.confirm('文件超过 32 MiB，可能占用较多浏览器内存。仍要尝试打开吗？')) return;
    resetDataView();
    setBusy(true);
    setStatus('正在后台检查并打开数据库…');
    try {
      const result = await request('open', {file}, 30000);
      opened = true;
      catalog = result.tables;
      ui.database.hidden = false;
      ui['db-name'].textContent = result.name;
      ui['db-meta'].textContent = `${(result.size / 1048576).toFixed(2)} MiB · SQLite ${result.version}`;
      ui['table-count'].textContent = `${catalog.length}${result.truncated ? '+' : ''}`;
      renderTables();
      setStatus(`已打开 ${catalog.length}${result.truncated ? '+' : ''} 张表或视图。点击名称查看数据。`);
    } catch (error) {
      setStatus(error.message, true);
    } finally { setBusy(false); }
  }

  function renderTables() {
    const term = ui['table-search'].value.trim().toLocaleLowerCase();
    ui.tables.replaceChildren();
    const visible = catalog.filter(item => item.name.toLocaleLowerCase().includes(term));
    for (const item of visible) {
      const button = document.createElement('button');
      button.type = 'button';
      button.classList.toggle('active', item.name === selected);
      const name = document.createElement('span'); name.textContent = item.name;
      const kind = document.createElement('small'); kind.textContent = item.type === 'view' ? '视图' : '表';
      button.append(name, kind);
      button.addEventListener('click', () => selectTable(item));
      ui.tables.append(button);
    }
    if (!visible.length) {
      const note = document.createElement('p'); note.className = 'hint'; note.textContent = term ? '没有匹配的表或视图。' : '此数据库没有普通表或视图。'; ui.tables.append(note);
    }
  }

  async function selectTable(item) {
    if (busy || !opened) return;
    selected = item.name;
    renderTables();
    const quoted = `"${item.name.replaceAll('"', '""')}"`;
    ui.sql.value = `SELECT * FROM ${quoted}`;
    setBusy(true);
    ui['query-status'].textContent = `正在读取“${item.name}”的字段结构…`;
    try {
      const result = await request('schema', {name: item.name}, 8000);
      fillVisual(result);
      ui['schema-panel'].hidden = false;
      ui['schema-title'].textContent = result.name;
      ui['schema-type'].textContent = result.type === 'view' ? '视图' : '表';
      ui['schema-rows'].replaceChildren();
      for (const column of result.columns) {
        const tr = document.createElement('tr');
        for (const value of [column.name, column.type, column.pk ? `第 ${column.pk} 列` : '—', column.notnull ? '是' : '否', column.defaultValue]) {
          const td = document.createElement('td'); td.textContent = value; tr.append(td);
        }
        ui['schema-rows'].append(tr);
      }
    } catch (error) {
      ui['schema-panel'].hidden = true;
      ui['query-status'].textContent = `字段结构读取失败：${error.message}`;
      if (!opened) { setBusy(false); return; }
    } finally { setBusy(false); }
    await runQuery(0, false, ui.sql.value);
  }

  function renderResult(result) {
    currentResult = result;
    ui['result-head'].replaceChildren();
    ui['result-body'].replaceChildren();
    const header = document.createElement('tr');
    for (const name of result.columns) { const th = document.createElement('th'); th.textContent = name; header.append(th); }
    ui['result-head'].append(header);
    for (const row of result.rows) {
      const tr = document.createElement('tr');
      for (const cell of row) { const td = document.createElement('td'); td.textContent = cell.text; tr.append(td); }
      ui['result-body'].append(tr);
    }
    ui.empty.hidden = result.rows.length > 0;
    ui.empty.textContent = '查询完成，没有匹配的数据。';
    ui['result-wrap'].hidden = result.rows.length === 0;
    ui.pager.hidden = result.explain || (result.page === 0 && !result.hasMore);
    ui['page-label'].textContent = `第 ${result.page + 1} 页 · 本页 ${result.rows.length} 行${result.hasMore ? ' · 还有更多' : ''}`;
    ui['result-meta'].textContent = result.explain ? `执行计划 · ${result.rows.length} 行` : `第 ${result.page + 1} 页 · ${result.rows.length} 行${result.hasMore ? ' · 还有更多' : ''}`;
    setBusy(false);
  }

  async function runQuery(page = 0, explain = false, sql = ui.sql.value) {
    if (!opened || busy) return;
    setBusy(true);
    ui['query-status'].textContent = explain ? '正在后台生成执行计划…' : '正在后台执行，只获取当前页…';
    try {
      const result = await request('query', {sql, page, explain}, 8000);
      activeSql = sql;
      activeExplain = explain;
      renderResult(result);
      ui['query-status'].textContent = explain ? '已生成执行计划；不会执行写入操作。' : '查询完成。原数据库未修改。';
    } catch (error) {
      ui['query-status'].textContent = error.message;
      if (!opened) setStatus(error.message, true);
    } finally { setBusy(false); }
  }

  function csvValue(cell) {
    if (cell.kind === 'null') return '';
    let value = cell.text;
    if (cell.kind === 'text' && /^\s*[=+\-@\t\r]/.test(value)) value = `'${value}`;
    return `"${value.replaceAll('"', '""')}"`;
  }

  function exportPage() {
    if (!currentResult || !currentResult.rows.length) return;
    const lines = [currentResult.columns.map(name => csvValue({kind: 'text', text: name})).join(',')];
    for (const row of currentResult.rows) lines.push(row.map(csvValue).join(','));
    const blob = new Blob(['\ufeff', lines.join('\r\n')], {type: 'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `sqlite-result-page-${currentResult.page + 1}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  ui.file.addEventListener('change', event => chooseFile(event.target.files?.[0]));
  ui.open.addEventListener('click', openFile);
  ui.stop.addEventListener('click', () => { replaceWorker('当前操作已停止；请重新打开数据库。'); resetDataView(); setStatus('后台线程已停止。原文件未修改，点击“打开数据库”可以重新开始。'); });
  ui.clear.addEventListener('click', () => { replaceWorker(); file = null; ui.file.value = ''; ui['file-name'].textContent = '尚未选择文件'; resetDataView(); setStatus('已清除本页的临时数据库与查询结果。'); });
  ui['table-search'].addEventListener('input', renderTables);
  ui.run.addEventListener('click', () => runQuery(0, false));
  ui.explain.addEventListener('click', () => runQuery(0, true));
  ui.prev.addEventListener('click', () => { if (currentResult?.page > 0) runQuery(currentResult.page - 1, activeExplain, activeSql); });
  ui.next.addEventListener('click', () => { if (currentResult?.hasMore) runQuery(currentResult.page + 1, activeExplain, activeSql); });
  ui.export.addEventListener('click', exportPage);
  ui['drop-zone'].addEventListener('dragover', event => { event.preventDefault(); ui['drop-zone'].classList.add('dragover'); });
  ui['drop-zone'].addEventListener('dragleave', () => ui['drop-zone'].classList.remove('dragover'));
  ui['drop-zone'].addEventListener('drop', event => { event.preventDefault(); ui['drop-zone'].classList.remove('dragover'); chooseFile(event.dataTransfer?.files?.[0]); });
  window.addEventListener('pagehide', () => worker?.terminate());
  newWorker();
  setBusy(false);
})();
