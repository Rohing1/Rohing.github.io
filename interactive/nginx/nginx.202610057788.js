import {FEATURES, RECIPES, LESSONS} from 'catalog.js';
import {understand, searchRecipes, expandFeatures, buildConfig, inspectConfig} from 'engine.js';

const $=id=>document.getElementById(id);
const selected=new Set();
let generated=null, activeGroup='全部', lessonIndex=0;
const completed=new Set();
const groups=['全部',...new Set(RECIPES.map(item=>item.group))];
const fields=['edition','domain','backends','route','stripPrefix','algorithm','root','cert','key','allowIp','authFile','redirectTarget','rate','upload','timeout','cacheDir','publicCache'];
const casePresets={p08:{route:'/api/',stripPrefix:true},b03:{algorithm:'least_conn'},b04:{algorithm:'ip_hash'},b05:{backends:'192.0.2.10:8080 weight=2\n192.0.2.11:8080'},b13:{algorithm:'ip_hash'},b14:{algorithm:'least_conn'},w04:{timeout:'300'},w07:{timeout:'300'}};
const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
const clear=node=>node.replaceChildren();
const getValues=()=>Object.fromEntries(fields.map(id=>[id,$(id).type==='checkbox'?$(id).checked:$(id).value]));

function activate(name){
  document.querySelectorAll('[data-tab]').forEach(button=>button.classList.toggle('active',button.dataset.tab===name));
  document.querySelectorAll('.tab-panel').forEach(panel=>panel.classList.toggle('active',panel.id===name));
  window.scrollTo({top:0,behavior:'smooth'});
}
function invalidate(){if(generated){generated=null;$('copy').disabled=true;$('download').disabled=true;$('result-status').textContent='输入或功能已更改，请重新生成。';}}
document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>activate(button.dataset.tab)));
$('case-count').textContent=String(RECIPES.length);
$('feature-count').textContent=String(Object.keys(FEATURES).length);

function renderFeatures(){
  const list=$('feature-list');clear(list);
  for(const [key,feature] of Object.entries(FEATURES)){
    const label=el('label','feature');const input=el('input');input.type='checkbox';input.checked=selected.has(key);
    input.addEventListener('change',()=>{input.checked?selected.add(key):selected.delete(key);updateFields();invalidate();});
    label.append(input,document.createTextNode(feature.name));list.append(label);
  }
  updateFields();
}
function updateFields(){
  const active=expandFeatures(selected);
  document.querySelectorAll('[data-show]').forEach(node=>{node.hidden=!active.has(node.dataset.show);});
  if(active.has('static')&&active.has('proxy')&&$('route').value==='/')$('route').value='../../api/index.html';
}
function applyFeatures(features){selected.clear();for(const key of features)selected.add(key);renderFeatures();invalidate();}
function renderAnalysis(result){
  const box=$('analysis');clear(box);
  const summary=el('p','',result.features.size?`识别到：${[...result.features].map(key=>FEATURES[key]?.name||key).join('、')}。请逐项核对。`:'没有可靠识别到已支持的功能；请从下方手动选择，或换种描述。');box.append(summary);
  if(result.unsupported.length){box.append(el('p','bad',`暂不支持自动生成：${result.unsupported.join('、')}。这些内容不会被混入配置。`));}
  $('partial-row').hidden=!result.unsupported.length;$('partial-ok').checked=false;
  if(result.matched.length){box.append(el('p','',`参考案例：${result.matched.slice(0,3).map(x=>x.title).join('、')}。可在案例库查看。`));}
}
$('analyze').addEventListener('click',()=>{const result=understand($('need').value);applyFeatures(result.features);renderAnalysis(result);});
$('clear-need').addEventListener('click',()=>{$('need').value='';$('analysis').textContent='描述已清空；已选功能保留。';$('partial-row').hidden=true;$('partial-ok').checked=false;invalidate();});
$('need').addEventListener('input',()=>{$('partial-ok').checked=false;invalidate();});
$('reset-form').addEventListener('click',()=>{invalidate();for(const id of fields){const input=$(id);if(input.type==='checkbox')input.checked=false;else if(id==='edition')input.value='oss';else input.value=input.defaultValue;}updateFields();});

function renderMessages(result){
  const box=$('messages');clear(box);
  for(const [kind,items] of [['error',result.errors],['warning',result.warnings]])if(items.length){const list=el('ul',`message-list ${kind}`);for(const item of items)list.append(el('li','',item));box.append(list);}
}
function renderResult(result){
  generated=result;renderMessages(result);
  $('code').textContent=result.code||'请修正上方问题后重新生成。';
  $('result-status').textContent=result.errors.length?'参数检查未通过。':result.isDemo?'已生成教学草案；请替换示例域名与文档 IP 后再导出。':'草案已生成。部署前须人工审查并在目标主机执行 nginx -t。';
  $('copy').disabled=!result.canExport;$('download').disabled=!result.canExport;
  const checks=$('checks');clear(checks);
  if(result.checks){checks.append(el('h3','','目标主机验证步骤'));const pre=el('pre');pre.textContent=result.checks.join('\n');checks.append(pre);}
  const sources=$('sources');clear(sources);
  if(result.code){sources.append(el('h3','','相关官方文档'));for(const key of expandFeatures(selected)){const feature=FEATURES[key];if(!feature)continue;const a=el('a','',`${feature.name} ↗`);a.href=feature.url;a.target='_blank';a.rel='noopener noreferrer';sources.append(a);}}
}
$('generate').addEventListener('click',()=>{
  const unsupported=understand($('need').value).unsupported;
  $('partial-row').hidden=!unsupported.length;
  if(unsupported.length&&!$('partial-ok').checked){renderResult({code:'',checks:[],errors:[`需求包含暂不支持的内容：${unsupported.join('、')}。请先明确移除，或勾选“只生成已支持部分”。`],warnings:[],canExport:false,isDemo:false});return;}
  const result=buildConfig(selected,getValues());
  if(unsupported.length){result.warnings.push(`仅生成已支持部分，未覆盖：${unsupported.join('、')}。请勿将此草案当作完整方案。`);result.canExport=false;}
  renderResult(result);
});
$('copy').addEventListener('click',async()=>{if(!generated?.canExport)return;try{await navigator.clipboard.writeText(generated.code);$('copy').textContent='已复制';setTimeout(()=>$('copy').textContent='复制',1800);}catch{$('result-status').textContent='浏览器未允许复制；请手动选中配置。';}});
$('download').addEventListener('click',()=>{if(!generated?.canExport)return;const blob=new Blob([generated.code],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='nginx.conf';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
for(const id of fields)$(id).addEventListener('input',invalidate);

function renderCases(){
  const query=$('case-search').value.trim();const matches=searchRecipes(query);
  const filtered=matches.filter(recipe=>activeGroup==='全部'||recipe.group===activeGroup);
  $('case-result').textContent=`显示 ${filtered.length} / ${RECIPES.length} 个案例`;
  const grid=$('case-grid');clear(grid);
  for(const recipe of filtered){const button=el('button','case-card');button.type='button';button.append(el('span','',`${recipe.group} · ${recipe.id.toUpperCase()}`),el('strong','',recipe.title),el('small','',recipe.features.map(key=>FEATURES[key]?.name||key).join(' · ')));
    button.addEventListener('click',()=>{applyFeatures(recipe.features);$('need').value=recipe.title;for(const [id,value] of Object.entries(casePresets[recipe.id]||{})){if($(id).type==='checkbox')$(id).checked=value;else $(id).value=value;}$('partial-row').hidden=true;$('partial-ok').checked=false;$('analysis').textContent=`已选「${recipe.title}」。请核对功能并补齐真实参数；案例本身不是部署配置。`;activate('compose');});grid.append(button);}
  if(!filtered.length)grid.append(el('p','muted','没有找到匹配案例。可改用较短关键词，或直接在需求页选择功能。'));
}
for(const group of groups){const button=el('button',group==='全部'?'active':'',`${group}${group==='全部'?'':` · ${RECIPES.filter(item=>item.group===group).length}`}`);button.type='button';button.addEventListener('click',()=>{activeGroup=group;document.querySelectorAll('#case-filters button').forEach(item=>item.classList.toggle('active',item===button));renderCases();});$('case-filters').append(button);}
$('case-search').addEventListener('input',renderCases);

function showLesson(index){lessonIndex=index;const lesson=LESSONS[index];$('lesson-num').textContent=`LEVEL ${index+1} / ${LESSONS.length}`;$('lesson-title').textContent=lesson.title;$('lesson-description').textContent=lesson.description;$('lesson-code').value=lesson.starter;$('lesson-feedback').textContent='填写后点击“检查本关”。';$('lesson-next').disabled=index===LESSONS.length-1;renderLessonList();}
function renderLessonList(){const list=$('lesson-list');clear(list);LESSONS.forEach((lesson,index)=>{const button=el('button',`${index===lessonIndex?'active ':''}${completed.has(index)?'done':''}`,`${String(index+1).padStart(2,'0')} · ${lesson.title}`);button.type='button';button.addEventListener('click',()=>showLesson(index));list.append(button);});}
$('lesson-check').addEventListener('click',()=>{const lesson=LESSONS[lessonIndex],source=$('lesson-code').value;const missing=lesson.checks.filter(([pattern])=>!new RegExp(pattern,'i').test(source)).map(([,hint])=>hint);const box=$('lesson-feedback');clear(box);if(missing.length){box.append(el('b','bad','还差一点：'));for(const hint of missing)box.append(el('p','',`· ${hint}`));}else{completed.add(lessonIndex);box.append(el('b','good','本关规则检查通过。仍需在真实 NGINX 环境验证。'));renderLessonList();}});
$('lesson-reset').addEventListener('click',()=>showLesson(lessonIndex));$('lesson-next').addEventListener('click',()=>{if(lessonIndex<LESSONS.length-1)showLesson(lessonIndex+1);});

$('conf-file').addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file)return;if(file.size>800000){$('inspect-result').textContent='文件超过 800 KB；请先摘取需要检查的片段。';return;}try{$('conf-input').value=await file.text();$('inspect-result').textContent=`已在本地读取 ${file.name}，点击“运行基础体检”。`;}catch{$('inspect-result').textContent='本地文件读取失败。';}});
$('inspect-run').addEventListener('click',()=>{const source=$('conf-input').value;if(!source.trim()){$('inspect-result').textContent='请先粘贴配置或选择文件。';return;}const result=inspectConfig(source);const box=$('inspect-result');clear(box);box.append(el('p','',`约 ${result.bytes} 字节 · ${result.servers} 个 server · ${result.upstreams} 个 upstream · ${result.locations} 个 location · ${result.includes} 个 include`));if(!result.findings.length)box.append(el('p','good','预置规则未发现问题；这并不代表配置可用。'));else for(const item of result.findings)box.append(el('p',item.level==='error'?'bad':'',`第 ${item.line} 行 · ${item.message}`));box.append(el('p','muted','仅供线索排查。请在目标主机执行 nginx -t 并检查所有 include 文件。'));});
$('inspect-clear').addEventListener('click',()=>{$('conf-input').value='';$('conf-file').value='';$('inspect-result').textContent='已清空，本页没有保存配置内容。';});

renderFeatures();renderCases();showLesson(0);
window.NginxApp={generated:()=>generated,progress:()=>({lesson:lessonIndex,completed:[...completed]}),validateProgress:value=>{if(!value||!Number.isInteger(value.lesson)||value.lesson<0||value.lesson>=LESSONS.length||!Array.isArray(value.completed)||value.completed.some(i=>!Number.isInteger(i)||i<0||i>=LESSONS.length))throw Error('学习进度格式无效');return {lesson:value.lesson,completed:[...new Set(value.completed)]}},restoreProgress:value=>{const next=window.NginxApp.validateProgress(value);completed.clear();next.completed.forEach(i=>completed.add(i));showLesson(next.lesson)}};
