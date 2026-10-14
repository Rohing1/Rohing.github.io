'use strict';
(()=>{
 const {$,el}=UI,key='yj-flashcards-v1',pref='yj-flashcards-save-v1',grades=['again','hard','good','easy'],days=[1,3,7,14,30,60],DAY=86400000;
 const empty=()=>({app:'yj-flashcards',version:1,cards:[],reviews:[]}),clone=v=>JSON.parse(JSON.stringify(v));
 let data=empty(),remember=true,storedRaw=null,stale=false,corrupt=false,undo=[],editing=null,pending=null,incoming=null,tab='review',page=1;
 let session={ids:[],index:0,started:false,revealed:false,graded:0};
 const status=(s,error=false)=>{$('#status').textContent=s;$('#status').className='status'+(error?' error':'')};
 const str=(v,max,required=false)=>{if(typeof v!=='string'||v.length>max||required&&!v.trim())throw Error('文字字段为空、过长或格式不正确');return v};
 const num=(v,min,max)=>{if(!Number.isInteger(v)||v<min||v>max)throw Error('学习记录数值不正确');return v};
 function validate(v){
  if(!v||v.app!=='yj-flashcards'||v.version!==1||!Array.isArray(v.cards)||!Array.isArray(v.reviews)||v.cards.length>1000||v.reviews.length>5000)throw Error('不是本工具的有效备份，或超过 1000 张卡片 / 5000 条学习记录');
  if(JSON.stringify(v).length>1500000)throw Error('内容总量过大，请精简卡片后再导入（最多约 150 万字符）');
  const ids=new Set();const cards=v.cards.map(c=>{
   if(!c||typeof c.id!=='string'||!c.id||c.id.length>100||ids.has(c.id))throw Error('卡片 ID 重复或不正确');ids.add(c.id);
   if(c.lastGrade!==null&&!grades.includes(c.lastGrade))throw Error('卡片评分不正确');
   if(typeof c.paused!=='boolean')throw Error('卡片暂停状态不正确');
   return{id:c.id,category:str(c.category,80)||'未分类',question:str(c.question,2000,true),answer:str(c.answer,6000,true),tags:str(c.tags,200),created:num(c.created,0,4102444800000),updated:num(c.updated,0,4102444800000),due:num(c.due,0,4102444800000),lastReviewed:num(c.lastReviewed,0,4102444800000),level:num(c.level,0,6),reviewCount:num(c.reviewCount,0,1000000),lapses:num(c.lapses,0,1000000),lastGrade:c.lastGrade,paused:c.paused};
  });
  const reviews=v.reviews.map(r=>{if(!r||!ids.has(r.cardId)||!grades.includes(r.grade))throw Error('学习记录引用不正确');return{cardId:r.cardId,at:num(r.at,0,4102444800000),grade:r.grade}});
  return{app:'yj-flashcards',version:1,cards,reviews};
 }
 try{remember=localStorage.getItem(pref)!=='false';storedRaw=localStorage.getItem(key);if(remember&&storedRaw)data=validate(JSON.parse(storedRaw))}catch{stale=true;corrupt=true;status('旧记录读取失败，未覆盖。可先导出原始记录，再恢复有效备份。',true)}
 $('#remember').checked=remember;
 function saveHint(text,error=false){$('#save-status').textContent=text;$('#save-status').classList.toggle('save-failed',error)}
 function fresh(force=false){
  if(remember){try{if(localStorage.getItem(key)!==storedRaw)stale=true}catch{}}
  if(stale&&!force){$('#reload').hidden=false;throw Error('本机记录已变化或无法读取。先导出当前内容，再载入最新版本；完整恢复或清空必须另行确认。')}
 }
 function persist(){
  if(!remember){saveHint('仅保存在本页内存；离开前请导出备份。');return false}
  try{fresh();const raw=JSON.stringify(data);localStorage.setItem(key,raw);storedRaw=raw;saveHint('已保存在当前浏览器，未上传。请定期导出备份。');return true}catch(e){saveHint('未能保存！当前内容仍在本页内存，请立即导出备份。'+e.message,true);return false}
 }
 function mutate(fn,force=false){
  try{fresh(force);const before={data:clone(data),session:clone(session),tab};try{fn();data=validate(data)}catch(e){data=before.data;session=before.session;tab=before.tab;throw e}
   if(force){storedRaw=localStorage.getItem(key);stale=false;corrupt=false;$('#reload').hidden=true}
   undo.push(before);if(undo.length>10)undo.shift();persist();draw();return true;
  }catch(e){status(e.message,true);return false}
 }
 function confirm(title,text,fn){pending=fn;$('#confirm-title').textContent=title;$('#confirm-text').textContent=text;$('#confirm-dialog').showModal()}
 $('#confirm-cancel').onclick=()=>{$('#confirm-dialog').close();pending=null};
 $('#confirm-accept').onclick=()=>{const fn=pending;pending=null;$('#confirm-dialog').close();fn?.()};
 function resetSession(){session={ids:[],index:0,started:false,revealed:false,graded:0}}
 function wrong(c){return c.lastGrade==='again'||c.lastGrade==='hard'}
 function filtered(includePaused=false){const category=$('#category').value,term=$('#search').value.trim().toLowerCase();return data.cards.filter(c=>(includePaused||!c.paused)&&(!category||c.category===category)&&(!term||[c.question,c.answer,c.tags,c.category].join(' ').toLowerCase().includes(term)))}
 function stamp(n){return n?new Date(n).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'立即'}
 function dayKey(n){const d=new Date(n);return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate()}
 function schedule(c,grade,now=Date.now()){
  const level=grade==='again'?0:grade==='hard'?c.level:Math.min(6,c.level+(grade==='easy'?2:1));
  const delay=grade==='again'?600000:grade==='hard'?DAY:days[Math.max(0,level-1)]*DAY;
  return{level,due:now+delay,delay};
 }
 function setTab(value){tab=value;$('#review-panel').hidden=tab!=='review';$('#manage-panel').hidden=tab!=='manage';for(const name of ['review','manage']){$('#tab-'+name).classList.toggle('primary',tab===name);$('#tab-'+name).setAttribute('aria-pressed',String(tab===name))}}
 function drawStats(){const now=Date.now(),active=data.cards.filter(c=>!c.paused),today=data.reviews.filter(r=>dayKey(r.at)===dayKey(now)).length;$('#stats').replaceChildren(...[['我的卡片',data.cards.length],['到期 / 新卡',active.filter(c=>c.due<=now).length],['今日复习次数',today],['待回顾错题',active.filter(wrong).length]].map(([name,value])=>{const d=el('div',{class:'stat'});d.append(el('strong',{},value),el('small',{},name));return d}))}
 function drawCategories(){const previous=$('#category').value,values=[...new Set(data.cards.map(c=>c.category))].sort((a,b)=>a.localeCompare(b,'zh-CN'));$('#category').replaceChildren(el('option',{value:''},'全部分类'),...values.map(v=>el('option',{value:v},v)));if(values.includes(previous))$('#category').value=previous;$('#categories').replaceChildren(...values.map(v=>el('option',{value:v})))}
 function drawManager(){
  const pool=filtered($('#include-paused').checked).slice().sort((a,b)=>b.updated-a.updated),size=innerWidth<=720?6:12,pages=Math.max(1,Math.ceil(pool.length/size));page=Math.min(page,pages);const current=pool.slice((page-1)*size,page*size);$('#filter-info').textContent='当前范围 '+filtered().length+' 张有效卡片';
  $('#card-list').replaceChildren(...current.map(c=>{
   const node=el('article',{class:'panel knowledge-card'+(c.paused?' paused':''),'data-card':c.id});node.append(el('div',{class:'card-top'},c.category+(c.paused?' · 已暂停':'')),el('h3',{},c.question),el('p',{class:'card-tags'},c.tags||'无标签'));
   const details=el('details');details.append(el('summary',{},'查看答案'),el('div',{class:'card-answer'},c.answer));node.append(details);
   node.append(el('div',{class:'card-progress'},'已复习 '+c.reviewCount+' 次 · 不会 '+c.lapses+' 次\n'+(c.paused?'暂停复习':c.due<=Date.now()?'现在可复习':'下次：'+stamp(c.due))+(wrong(c)?' · 需错题回顾':'')));
   const actions=el('div',{class:'row card-actions'}),edit=el('button',{'data-edit':c.id},'编辑'),pause=el('button',{'data-pause':c.id},c.paused?'恢复复习':'暂停'),reset=el('button',{'data-reset':c.id},'重置进度'),del=el('button',{class:'danger','data-delete':c.id},'删除');
   edit.onclick=()=>editCard(c.id);pause.onclick=()=>{mutate(()=>{c.paused=!c.paused;c.updated=Date.now();resetSession()})};
   reset.onclick=()=>confirm('重置这张卡片的学习进度？','问题与答案保留，评分、错题与复习计划将清零。',()=>mutate(()=>{const item=data.cards.find(x=>x.id===c.id);Object.assign(item,{due:0,lastReviewed:0,level:0,reviewCount:0,lapses:0,lastGrade:null,updated:Date.now()});data.reviews=data.reviews.filter(r=>r.cardId!==c.id);resetSession()}));
   del.onclick=()=>confirm('删除这张卡片？','会删除卡片及其本地学习记录。需要保留时请先导出。',()=>mutate(()=>{data.cards=data.cards.filter(x=>x.id!==c.id);data.reviews=data.reviews.filter(r=>r.cardId!==c.id);resetSession()}));actions.append(edit,pause,reset,del);node.append(actions);return node;
  }));
  $('#manager-empty').hidden=pool.length>0;$('#manager-empty h3').textContent=data.cards.length?'当前条件下没有卡片':'还没有卡片';$('#manager-empty p').textContent=data.cards.length?'可调整分类、搜索或“显示暂停卡片”。卡片没有被删除。':'点击“新建卡片”，填写问题与答案。不会读取其他页面或平台的资料。';$('#page-info').textContent=page+' / '+pages+' 页 · '+pool.length+' 张';$('#prev').disabled=page<=1;$('#next').disabled=page>=pages;
 }
 function drawReview(){
  const card=session.started?data.cards.find(c=>c.id===session.ids[session.index]):null,done=session.started&&!card;$('#welcome').hidden=session.started;$('#study-card').hidden=!card;$('#session-done').hidden=!done;$('#stop').hidden=!session.started||done;
  $('#welcome-info').textContent=data.cards.length?'当前范围有 '+filtered().length+' 张有效卡片，待复习 '+filtered().filter(c=>c.due<=Date.now()).length+' 张。':'首次使用没有预置卡片。点击“新建卡片”，或导入你自己的备份。';
  if(done){$('#done-text').textContent='本轮已自评 '+session.graded+' 张。复习计划已按你的评分更新。';return}
  if(!card)return;
  $('#card-category').textContent=card.category;$('#progress').textContent=(session.index+1)+' / '+session.ids.length+' 张';$('#question').textContent=card.question;$('#card-tags').textContent=card.tags;$('#answer').textContent=card.answer;$('#answer-wrap').hidden=!session.revealed;$('#reveal').hidden=session.revealed;
  for(const [i,grade]of grades.entries()){const next=schedule(card,grade),name=['不会','模糊','记住','很熟'][i],time=grade==='again'?'10 分钟后':Math.round(next.delay/DAY)+' 天后';const b=$('[data-grade="'+grade+'"]');b.replaceChildren(el('strong',{},(i+1)+'. '+name),el('small',{},time+'复习'));b.disabled=!session.revealed}
 }
 function draw(){drawStats();drawCategories();drawManager();drawReview();setTab(tab);$('#undo').disabled=!undo.length}
 function start(){
  try{fresh()}catch(e){status(e.message,true);return}
  if(session.started&&session.index<session.ids.length){confirm('重新开始这一轮？','已提交评分会保留，当前未评分卡片不会改变进度。',()=>{resetSession();start()});return}
  const mode=$('#review-mode').value;let cards=filtered().filter(c=>mode==='all'?true:mode==='wrong'?wrong(c):c.due<=Date.now());
  if(!cards.length){resetSession();drawReview();status(mode==='wrong'?'当前范围没有待回顾错题。':mode==='due'?'当前范围没有到期卡片，可选择“全部有效卡片”抽查。':'当前范围没有有效卡片。');return}
  cards=$('#shuffle').checked?UI.shuffle(cards):cards.sort((a,b)=>a.due-b.due||a.created-b.created);
  session={ids:cards.slice(0,Number($('#session-limit').value)).map(c=>c.id),index:0,started:true,revealed:false,graded:0};$('#recall').value='';setTab('review');drawReview();status('先回忆，再看答案。只有自评会更新学习记录。');$('#study').scrollIntoView({block:'start',behavior:'instant'});
 }
 function reveal(){if(!session.started||session.index>=session.ids.length)return;session.revealed=true;drawReview();$('[data-grade="again"]').focus()}
 function grade(value){
  if(!grades.includes(value)||!session.revealed)return;const card=data.cards.find(c=>c.id===session.ids[session.index]);if(!card)return;
  const ok=mutate(()=>{const now=Date.now(),next=schedule(card,value,now);card.level=next.level;card.due=next.due;card.lastReviewed=now;card.updated=now;card.reviewCount++;if(value==='again')card.lapses++;card.lastGrade=value;data.reviews.push({cardId:card.id,at:now,grade:value});data.reviews=data.reviews.slice(-5000);session.index++;session.graded++;session.revealed=false});
  if(ok){$('#recall').value='';status('评分已记录。下次复习：'+stamp(card.due));if(session.index<session.ids.length)$('#reveal').focus();else $('#restart').focus()}
 }
 function editCard(id=null){
  if(!id&&data.cards.length>=1000){status('最多 1000 张卡片，请精简或导出后建立另一份卡片库。',true);return}
  editing=id;const c=data.cards.find(x=>x.id===id)||{category:'',question:'',answer:'',tags:''};$('#edit-title').textContent=id?'编辑卡片':'新建卡片';for(const k of ['category','question','answer','tags'])$('#edit-'+k).value=c[k];$('#edit-error').textContent='';$('#edit-dialog').showModal();$('#edit-question').focus();
 }
 $('#edit-form').onsubmit=e=>{e.preventDefault();const question=$('#edit-question').value.trim(),answer=$('#edit-answer').value.trim();if(!question||!answer){$('#edit-error').textContent='请填写问题和答案。';return}
  const ok=mutate(()=>{const now=Date.now(),existing=data.cards.find(c=>c.id===editing),fields={category:$('#edit-category').value.trim()||'未分类',question,answer,tags:$('#edit-tags').value.trim(),updated:now};if(existing)Object.assign(existing,fields);else data.cards.push({id:crypto.randomUUID(),...fields,created:now,due:0,lastReviewed:0,level:0,reviewCount:0,lapses:0,lastGrade:null,paused:false});resetSession()});if(ok){$('#edit-dialog').close();status('卡片已保存。先回忆和自评，才会更新学习进度。')}else $('#edit-error').textContent=$('#status').textContent;
 };
 $('#add-card').onclick=()=>editCard();$('#edit-cancel').onclick=()=>$('#edit-dialog').close();$('#tab-review').onclick=()=>setTab('review');$('#tab-manage').onclick=()=>setTab('manage');$('#done-manage').onclick=()=>setTab('manage');$('#start').onclick=start;$('#restart').onclick=()=>{resetSession();start()};$('#reveal').onclick=reveal;document.querySelectorAll('[data-grade]').forEach(b=>b.onclick=()=>grade(b.dataset.grade));
 $('#stop').onclick=()=>confirm('结束本轮复习？','已提交的评分保留，未评分卡片的计划不变。',()=>{resetSession();drawReview();status('本轮已结束。')});
 for(const id of ['category','review-mode'])$('#'+id).onchange=()=>{resetSession();page=1;draw()};$('#search').oninput=()=>{resetSession();page=1;drawManager();drawReview()};$('#include-paused').onchange=()=>{page=1;drawManager()};$('#prev').onclick=()=>{page--;drawManager();$('#manage-panel').scrollIntoView({block:'start'})};$('#next').onclick=()=>{page++;drawManager();$('#manage-panel').scrollIntoView({block:'start'})};window.addEventListener('resize',drawManager);
 $('#undo').onclick=()=>{if(!undo.length)return;try{fresh();const before=undo.pop();data=before.data;session=before.session;tab=before.tab;$('#recall').value='';persist();draw();status('已撤销上次修改 / 评分。')}catch(e){status(e.message,true)}};
 $('#export').onclick=()=>{if(corrupt&&storedRaw){UI.download('%e7%9f%a5%e8%af%86%e5%8d%a1%e7%89%87-%e5%8e%9f%e5%a7%8b%e5%bc%82%e5%b8%b8%e8%ae%b0%e5%bd%95.json.html',storedRaw);status('原始记录已导出，不保证它是有效备份。');return}UI.download('%e7%9f%a5%e8%af%86%e5%8d%a1%e7%89%87-%e5%ae%8c%e6%95%b4%e5%a4%87%e4%bb%bd.json.html',JSON.stringify(data,null,2));status('备份已下载。请妥善保管其中的卡片与学习记录。')};
 $('#import').onchange=async e=>{try{const file=e.target.files[0];UI.size(file,8*1024*1024);incoming=validate(JSON.parse(await file.text()));$('#import-info').textContent='文件包含 '+incoming.cards.length+' 张卡片、'+incoming.reviews.length+' 条学习记录。当前有 '+data.cards.length+' 张卡片。';$('[name="import-mode"][value="merge"]').checked=true;$('#import-dialog').showModal()}catch(err){status(err.message,true)}e.target.value=''};
 $('#import-cancel').onclick=()=>{$('#import-dialog').close();incoming=null};
 $('#import-accept').onclick=()=>{if(!incoming)return;const replacement=$('[name="import-mode"]:checked').value==='replace';const commit=()=>{const ok=mutate(()=>{if(replacement)data=clone(incoming);else{const existing=new Set(data.cards.map(c=>c.id)),added=incoming.cards.filter(c=>!existing.has(c.id)),newIds=new Set(added.map(c=>c.id));data.cards.push(...clone(added));data.reviews.push(...clone(incoming.reviews.filter(r=>newIds.has(r.cardId))));data.reviews=data.reviews.slice(-5000)}resetSession();page=1},replacement);if(ok){incoming=null;$('#import-dialog').close();status(replacement?'完整备份已恢复。':'卡片已合并，同 ID 的现有卡片没有覆盖。')}};if(replacement){$('#import-dialog').close();confirm('完整恢复将替换全部卡片，继续？','当前卡片和学习记录会被替换，其他工具不受影响。请先导出备份。',()=>{commit()})}else commit()};
 $('#remember').onchange=()=>{const wanted=$('#remember').checked;$('#remember').checked=remember;if(wanted){try{fresh();remember=true;localStorage.setItem(pref,'true');$('#remember').checked=true;storedRaw=localStorage.getItem(key);persist()}catch(e){remember=false;$('#remember').checked=false;status(e.message,true)}}else confirm('关闭本机保存？','会移除此工具已保存的数据，但当前内容仍在本页内存。离开前请导出备份。',()=>{try{fresh();localStorage.removeItem(key);storedRaw=null;localStorage.setItem(pref,'false');remember=false;$('#remember').checked=false;saveHint('已关闭保存：当前内容仅在本页内存，离开前请导出。')}catch(e){status(e.message,true)}})};
 $('#wipe').onclick=()=>confirm('清空知识卡片与学习记录？','仅清除此工具的卡片与记录，无法通过撤销恢复。其他页面的数据不受影响。请先导出。',()=>{try{localStorage.removeItem(key);storedRaw=null;data=empty();undo=[];stale=false;corrupt=false;incoming=null;editing=null;resetSession();$('#reload').hidden=true;draw();saveHint('本工具记录已清空。新内容遵循当前保存设置。');status('已清空，没有读取或清除其他工具的数据。')}catch(e){status('清空失败：'+e.message,true)}});
 $('#reload').onclick=()=>confirm('载入本机最新记录？','会替换当前内存，建议先导出。当前复习轮次将结束。',()=>{try{const raw=localStorage.getItem(key);const next=raw?validate(JSON.parse(raw)):empty();data=next;storedRaw=raw;stale=false;corrupt=false;undo=[];resetSession();$('#reload').hidden=true;draw();saveHint('已载入本机最新版本。')}catch(e){status('载入失败：'+e.message,true)}});
 window.addEventListener('storage',e=>{if(e.key===key){stale=true;$('#reload').hidden=false;saveHint('另一标签页已修改本机记录。先导出当前内容，再载入最新版本。',true)}});
 document.addEventListener('keydown',e=>{if(e.repeat||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||$('dialog[open]')||tab!=='review')return;if(e.code==='Space'&&session.started&&!session.revealed){e.preventDefault();reveal()}else if(session.revealed&&/^[1-4]$/.test(e.key)){e.preventDefault();grade(grades[Number(e.key)-1])}});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)drawStats()});
 draw();saveHint(stale?'旧记录无法读取，未覆盖。请先导出原始记录再恢复。':remember?'已启用本机保存。首次进入没有预置卡片，请定期导出备份。':'仅本页内存，离开前请导出备份。',stale);
 window.Flashcards={validate,schedule,state:()=>clone(data)};
ToolBackup.register({id:'flashcards',name:'知识卡片',get:()=>data,import:'#import',export:'#export',canMark:()=>!corrupt});
})();
