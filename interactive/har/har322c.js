(() => {
  'use strict';
  const M = window.HarModel;
  const $ = selector => document.querySelector(selector);
  const els = Object.fromEntries(['file','dropzone','demo','clear','file-label','status','results','warnings','m-requests','m-pages','m-duration','m-bytes','m-issues','phase-bars','findings','hosts','search','filter','sort','shown','rows','prev','next','page-label','detail','detail-title','detail-content','close-detail'].map(id => [id, document.getElementById(id)]));
  const colors = {blocked:'#98a7b8',dns:'#6e81cd',connect:'#de9a54',ssl:'#c16bc8',send:'#5db6aa',wait:'#eeaa42',receive:'#3d9fd1'};
  let report = null, page = 0, filtered = [];
  let parsingWorker=null, parseId=0, abortParsing=null;
  const cancelParse=document.createElement('button');cancelParse.type='button';cancelParse.id='cancel-parse';cancelParse.textContent='取消解析';cancelParse.hidden=true;els.clear.after(cancelParse);
  const comparePanel=document.createElement('section');comparePanel.className='wb-panel';comparePanel.innerHTML='<h2>优化前 / 优化后对比</h2><p class="wb-note">按请求方法、主机和完整路径的哈希匹配，不使用查询参数；显示路径仍经过隐藏处理。对比耗时中位数、P95、错误率和平均响应大小。请尽量保持采集条件、缓存状态和请求样本一致；结果不是性能改善的因果证明。</p><div class="wb-grid"><label>优化前 HAR<input type="file" id="compare-before" accept=".har,.json"></label><label>优化后 HAR<input type="file" id="compare-after" accept=".har,.json"></label></div><div class="wb-row"><button id="compare-run">开始后台对比</button><button id="compare-export" disabled>导出当前对比 CSV</button></div><p id="compare-status" class="wb-status" role="status"></p><div id="compare-output"></div>';
  document.querySelector('.import-panel').after(comparePanel);
  function cancelWorker(){parseId++;const abort=abortParsing;abortParsing=null;if(abort)abort();parsingWorker?.terminate();parsingWorker=null;cancelParse.hidden=true;}
  cancelParse.onclick=()=>{cancelWorker();status('后台解析已取消，原有结果保留。');document.getElementById('compare-status').textContent='解析或对比已取消。';};
  function background(payload){cancelWorker();const id=++parseId;cancelParse.hidden=false;return new Promise((resolve,reject)=>{const w=new Worker('parse-worker322c.js?v=20261005c');parsingWorker=w;const timeout=setTimeout(()=>{if(parsingWorker===w){finish();reject(Error('解析超过 60 秒，已终止；请缩小问题时段。'));}},60000);const finish=()=>{clearTimeout(timeout);if(parsingWorker===w)abortParsing=null;w.terminate();if(parsingWorker===w){parsingWorker=null;cancelParse.hidden=true;}};abortParsing=()=>{finish();reject(Error('解析已取消'));};w.onmessage=e=>{if(e.data.id!==id)return;finish();if(e.data.ok)resolve(e.data);else reject(Error(e.data.error));};w.onerror=()=>{finish();reject(Error('后台解析组件加载失败，请刷新或检查浏览器支持。'));};w.postMessage({id,...payload});});}
  let comparison=[];for(const id of ['compare-before','compare-after'])document.getElementById(id).onchange=()=>{cancelWorker();comparison=[];document.getElementById('compare-export').disabled=true;document.getElementById('compare-output').replaceChildren();document.getElementById('compare-status').textContent='文件已变更，请重新对比。';};
  document.getElementById('compare-run').onclick=async()=>{const before=document.getElementById('compare-before').files[0],after=document.getElementById('compare-after').files[0],out=document.getElementById('compare-status');if(!before||!after){out.textContent='请选择前后两份 HAR';return;}if(before.size>32*1048576||after.size>32*1048576){out.textContent='每个文件上限 32 MiB';return;}out.textContent='正在后台解析并比较…';comparison=[];document.getElementById('compare-output').replaceChildren();document.getElementById('compare-export').disabled=true;const expected=parseId+2;try{const r=await background({type:'compare',before,after});if(parseId!==expected)return;comparison=r.comparison;out.textContent=`前 ${r.summary.before.requests} 条，后 ${r.summary.after.requests} 条；共 ${comparison.length} 个接口分组。`;const table=el('table','wb-table'),head=el('thead'),tr=el('tr'),body=el('tbody');for(const h of ['接口 / 状态','样本数 前→后','中位数 前→后','P95 前→后','错误率 前→后','平均大小 前→后'])tr.append(el('th','',h));head.append(tr);table.append(head,body);for(const x of comparison.slice(0,100)){const t=el('tr');const vals=[x.label+' · '+x.change,`${x.before?.count??'—'} → ${x.after?.count??'—'}`,`${x.before?formatMs(x.before.median):'—'} → ${x.after?formatMs(x.after.median):'—'}`,`${x.before?formatMs(x.before.p95):'—'} → ${x.after?formatMs(x.after.p95):'—'}`,`${x.before?x.before.errorRate.toFixed(1)+'%':'—'} → ${x.after?x.after.errorRate.toFixed(1)+'%':'—'}`,`${x.before?formatBytes(x.before.averageBytes):'—'} → ${x.after?formatBytes(x.after.averageBytes):'—'}`];vals.forEach(v=>t.append(el('td','',v)));body.append(t);}const scroll=el('div','wb-table-scroll');scroll.append(table);document.getElementById('compare-output').append(scroll,el('p','wb-note','页面显示变化最大的前 100 组；CSV 包含所有分组，不包含请求头、正文或查询参数。'));document.getElementById('compare-export').disabled=false;}catch(e){if(parseId===expected)out.textContent=e.message;}};
  document.getElementById('compare-export').onclick=()=>{const value=x=>{let s=String(x??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};const rows=[['接口','状态','前样本','后样本','前中位数ms','后中位数ms','前P95ms','后P95ms','前错误率%','后错误率%','前平均响应B','后平均响应B'],...comparison.map(x=>[x.label,x.change,x.before?.count,x.after?.count,x.before?.median,x.after?.median,x.before?.p95,x.after?.p95,x.before?.errorRate,x.after?.errorRate,x.before?.averageBytes,x.after?.averageBytes])];const u=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.map(value).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'})),a=el('a');a.href=u;a.download='HAR前后对比.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),5000);};
  const formatMs = n => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 1 : 2) + ' s' : Math.round(n) + ' ms';
  const formatBytes = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MiB' : n >= 1024 ? (n / 1024).toFixed(1) + ' KiB' : Math.round(n) + ' B';
  function el(tag, className, content) { const node=document.createElement(tag); if(className)node.className=className; if(content!==undefined)node.textContent=content; return node; }
  function status(message, error=false) { els.status.textContent=message; els.status.className='status'+(error?' error':''); }
  function show(reportValue, label) {
    report=reportValue;page=0;els.results.hidden=false;els.clear.disabled=false;els['file-label'].textContent=label;
    els['m-requests'].textContent=report.rows.length.toLocaleString('zh-CN');els['m-pages'].textContent=report.pages+' 个页面记录';
    els['m-duration'].textContent=formatMs(report.duration);els['m-bytes'].textContent=formatBytes(report.bytes);els['m-issues'].textContent=report.issueCount;
    const warnings=[];
    if(report.sensitiveCount)warnings.push(`检测到 ${report.sensitiveCount} 个敏感名称的请求头/响应头；本页不会展示其值，请勿分享原始 HAR。`);
    if(report.invalidCount)warnings.push(`${report.invalidCount} 条记录缺少有效时间戳，已跳过。`);
    warnings.push('HAR 时间和大小依赖浏览器导出字段；缓存、并行请求、Service Worker 与页面脚本执行不在本页完整建模范围内。');
    els.warnings.textContent=warnings.join(' ');els.warnings.hidden=false;
    renderPhases();renderFindings();renderHosts();renderRows();status(`已在本地解析 ${report.rows.length} 条请求。`);
  }
  function renderPhases() {
    els['phase-bars'].replaceChildren();const max=Math.max(1,...Object.values(report.totals));
    for(const [key,label] of M.PHASES){const line=el('div','phase-item');line.append(el('span','',label));const track=el('div','phase-track'),bar=el('i');bar.style.width=(report.totals[key]/max*100)+'%';bar.style.background=colors[key];track.append(bar);line.append(track,el('b','',formatMs(report.totals[key])));els['phase-bars'].append(line);}
  }
  function renderFindings() {
    els.findings.replaceChildren();const candidates=report.rows.filter(r=>r.alert.length).sort((a,b)=>b.alert.length-a.alert.length||b.duration-a.duration).slice(0,8);
    if(!candidates.length){els.findings.append(el('p','hint','当前规则没有发现显著线索。'));return;}
    for(const r of candidates){const item=el('div','finding');item.append(el('strong','',r.host+r.label),el('span','',r.alert.join(' · ')+' · '+formatMs(r.duration)));els.findings.append(item);}
  }
  function renderHosts() {
    els.hosts.replaceChildren();for(const host of report.hosts.slice(0,12)){const item=el('div','host-item');item.append(el('strong','',host.host),el('span','',`${host.count} 个请求 · ${formatBytes(host.bytes)} · 累计 ${formatMs(host.duration)}`));els.hosts.append(item);}
  }
  function renderRows() {
    if(!report)return;
    const q=els.search.value.trim().toLowerCase();filtered=report.rows.filter(r=>(!q||(r.host+r.label).toLowerCase().includes(q))&&(els.filter.value==='all'||els.filter.value==='issues'&&r.alert.length||els.filter.value==='errors'&&r.status>=400));
    if(els.sort.value==='slow')filtered.sort((a,b)=>b.duration-a.duration);else if(els.sort.value==='size')filtered.sort((a,b)=>b.size-a.size);else filtered.sort((a,b)=>a.started-b.started||a.index-b.index);
    const pages=Math.max(1,Math.ceil(filtered.length/50));page=Math.min(page,pages-1);els.rows.replaceChildren();
    for(const r of filtered.slice(page*50,page*50+50)){
      const tr=el('tr');const request=el('td','request-cell'),button=el('button');button.type='button';button.append(el('strong','',r.method+' '+r.host),el('small','',r.label));button.addEventListener('click',()=>openDetail(r));request.append(button);tr.append(request);
      tr.append(el('td','status-code '+(r.status>=400?'error':r.status>=300?'redirect':''),r.status||'—'),el('td','',formatMs(r.duration)),el('td','',formatBytes(r.size)));
      const cell=el('td');const track=el('div','water-track'),bar=el('div','water-bar');bar.style.left=Math.min(100,(r.started-report.first)/report.duration*100)+'%';bar.style.width=Math.max(.3,Math.min(100-(r.started-report.first)/report.duration*100,r.duration/report.duration*100))+'%';bar.title='开始 +'+formatMs(r.started-report.first)+' · 耗时 '+formatMs(r.duration);
      const total=Object.values(r.phases).reduce((a,b)=>a+b,0);if(total){for(const [key] of M.PHASES){if(r.phases[key]<=0)continue;const segment=el('i');segment.style.width=(r.phases[key]/total*100)+'%';segment.style.background=colors[key];bar.append(segment);}}else{bar.style.background='#9aaabc';}
      track.append(bar);cell.append(track);tr.append(cell);els.rows.append(tr);
    }
    if(!filtered.length){const tr=el('tr'),td=el('td','hint','没有符合筛选条件的请求。');td.colSpan=5;tr.append(td);els.rows.append(tr);}
    els.shown.textContent=`显示 ${filtered.length} / ${report.rows.length} 条`;
    els['page-label'].textContent=`${page+1} / ${pages} 页`;els.prev.disabled=page===0;els.next.disabled=page>=pages-1;
  }
  function openDetail(r) {
    els['detail-title'].textContent=r.method+' '+r.host;els['detail-content'].replaceChildren();const grid=el('div','detail-grid');
    for(const [label,value] of [['路径（已隐藏查询参数）',r.label],['状态',r.status||'未知'],['总耗时',formatMs(r.duration)],['响应体估算',formatBytes(r.size)],['内容类型',r.mime||'未知'],['HTTP 版本',r.protocol||'未知'],['开始偏移',formatMs(r.started-report.first)],['排查线索',r.alert.join(' · ')||'无']]){const item=el('div');item.append(el('span','',label),el('strong','',String(value)));grid.append(item);}
    els['detail-content'].append(grid);const phases=el('div','detail-phases');for(const [key,label] of M.PHASES){const line=el('div');line.append(el('span','',label),el('strong','',formatMs(r.phases[key])));phases.append(line);}els['detail-content'].append(phases);els.detail.showModal();
  }
  async function loadFile(file) {
    if(!file)return;if(file.size>32*1024*1024){status('文件超过 32 MiB，请先筛选或截取问题时段。',true);return;}
    status('正在后台读取和解析，可取消…');const expected=parseId+2;
    try{const data=await background({type:'parse',file});if(parseId===expected)show(data.report,file.name+' · '+formatBytes(file.size));}
    catch(error){if(parseId===expected)status('解析失败：'+error.message,true);}
    finally{els.file.value='';}
  }
  function demo() {
    const start=Date.now(), specs=[['https://demo.example/','text/html',200,420,22,16500],['https://demo.example/app.js','application/javascript',200,780,130,310000],['https://api.demo.example/data?token=HIDDEN','application/json',200,1510,930,48000],['https://img.demo.example/hero.webp','image/webp',200,2900,160,2800000],['https://api.demo.example/missing','application/json',503,360,240,1200]];
    const entries=specs.map(([url,mime,status,time,wait,bodySize],i)=>({startedDateTime:new Date(start+i*180).toISOString(),time,request:{method:'GET',url,headers:i===2?[{name:'Authorization',value:'demo-secret'}]:[]},response:{status,httpVersion:'HTTP/2',bodySize,content:{mimeType:mime,size:bodySize},headers:[]},timings:{blocked:8,dns:i?0:24,connect:i?0:40,ssl:i?0:22,send:2,wait,receive:Math.max(0,time-wait-100)}}));
    show(M.parseHar({log:{pages:[{}],entries}}),'演示样本（虚构数据）');
  }
  els.file.addEventListener('change',e=>loadFile(e.target.files[0]));
  for(const name of ['dragenter','dragover'])els.dropzone.addEventListener(name,e=>{e.preventDefault();els.dropzone.classList.add('drag');});
  for(const name of ['dragleave','drop'])els.dropzone.addEventListener(name,e=>{e.preventDefault();els.dropzone.classList.remove('drag');});
  els.dropzone.addEventListener('drop',e=>loadFile(e.dataTransfer.files[0]));
  els.demo.addEventListener('click',()=>{cancelWorker();demo();});els.clear.addEventListener('click',()=>{cancelWorker();report=null;els.results.hidden=true;els.clear.disabled=true;els['file-label'].textContent='尚未选择文件';status('当前结果已从页面清除。');});
  for(const name of ['search','filter','sort'])els[name].addEventListener(name==='search'?'input':'change',()=>{page=0;renderRows();});
  els.prev.addEventListener('click',()=>{page--;renderRows();});els.next.addEventListener('click',()=>{page++;renderRows();});els['close-detail'].addEventListener('click',()=>els.detail.close());
  window.addEventListener('pagehide',cancelWorker);
})();
