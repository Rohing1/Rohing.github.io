(function(root){
  'use strict';
  const M=root.ProjectModel||(typeof require==='function'?require('projects-model.20261005.js'):null);
  const copy=v=>JSON.parse(JSON.stringify(v)),now=()=>new Date().toISOString(),text=(v,n)=>String(v??'').trim().slice(0,n);
  const names={new:'待办',doing:'进行中',testing:'测试',review:'验收',blocked:'受阻',resolved:'完成',closed:'关闭'};
  for(const t of ['epic','story','subtask'])if(!M.TRACKERS.includes(t))M.TRACKERS.push(t);
  for(const s of ['testing','review'])if(!M.STATUSES.includes(s))M.STATUSES.push(s);
  const codes=Object.keys(names),done=i=>['resolved','closed'].includes(i.status),estimated=i=>!['epic','subtask','milestone'].includes(i.tracker);
  const get=(d,k,id)=>M.get(d,k,id),project=(d,id)=>{const p=get(d,'projects',id);if(!p)throw Error('项目不存在');return p;};
  function active(d,id){const p=project(d,id);if(p.status==='archived')throw Error('归档项目只读');return p;}
  function points(v){const n=Number(v||0);if(!Number.isFinite(n)||n<0||n>10000||n*2%1)throw Error('故事点应为 0～10000 的整数或半点');return n;}
  function day(v){const s=text(v,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw Error('日期无效');return s;}
  function defaultWorkflow(){return{columns:codes.map(code=>({code,name:names[code],wip:0,targets:codes.filter(c=>c!==code)})),requireAssignee:false,requireAcceptance:false,requireChildren:false,requireDependencies:false};}
  function wf(d,id){return project(d,id).workflow||defaultWorkflow();}
  function statusLabel(d,id,code){return (id&&get(d,'projects',id)?.workflow?.columns.find(c=>c.code===code)?.name)||names[code]||code;}
  function init(d){
    if(d.agile==null)d.agile={version:1,sprints:[],filters:[]};
    if(d.agile.version!==1||!Array.isArray(d.agile.sprints)||!Array.isArray(d.agile.filters))throw Error('敏捷数据版本不受支持');
    for(const i of d.issues){if(i.storyPoints==null)i.storyPoints=0;if(i.sprintId==null)i.sprintId='';if(i.rank==null)i.rank=i.number;if(i.acceptance==null)i.acceptance='';if(i.agileHistory==null)i.agileHistory=[];}
    return d;
  }
  function sprint(d,id){const s=d.agile.sprints.find(s=>s.id===id);if(!s)throw Error('迭代不存在');return s;}
  function issueKey(d,i){return project(d,i.projectId).key+'-'+i.number;}
  function issueRows(d,s){return d.issues.filter(i=>i.sprintId===s.id).map(i=>({id:i.id,key:issueKey(d,i),subject:i.subject,points:estimated(i)?i.storyPoints:0,status:i.status,done:done(i),assignee:i.assignee}));}
  function snapshot(d,s,at=now()){
    const items=issueRows(d,s);if(items.length>5000)throw Error('单迭代最多 5000 条任务');
    return{at,items,total:items.reduce((n,i)=>n+i.points,0),remaining:items.filter(i=>!i.done).reduce((n,i)=>n+i.points,0)};
  }
  function track(d,ids){for(const id of new Set(ids.filter(Boolean))){const s=d.agile.sprints.find(s=>s.id===id);if(s?.status==='active'){if(s.history.length>=2000)throw Error('迭代历史已达 2000 次，请结束迭代并备份');s.history.push(snapshot(d,s));}}}
  function hierarchy(d,raw,id){
    const type=raw.tracker,parent=raw.parentId&&get(d,'issues',raw.parentId);
    if(type==='epic'&&raw.parentId)throw Error('Epic 必须是顶层目标');
    if(type==='story'&&parent&&parent.tracker!=='epic')throw Error('故事只能属于 Epic，或独立存在');
    if(type==='subtask'&&(!parent||!['story','task','feature','bug','support'].includes(parent.tracker)))throw Error('子任务必须属于故事或普通任务，不能直接属于 Epic');
    if(parent?.tracker==='subtask')throw Error('子任务不能再包含下级任务');
    for(const c of d.issues.filter(i=>i.parentId===id)){
      if(c.tracker==='story'&&type!=='epic'||c.tracker==='subtask'&&!['story','task','feature','bug','support'].includes(type)||type==='subtask')throw Error('先调整下级任务，再修改当前任务类型');
    }
  }
  function transitions(d,i,to,raw=i){
    const workflow=wf(d,i.projectId),column=workflow.columns.find(c=>c.code===to);
    if(!column)throw Error('该状态未加入项目工作流');
    if(i.status!==to){const source=workflow.columns.find(c=>c.code===i.status);if(!source?.targets.includes(to))throw Error('工作流不允许 '+statusLabel(d,i.projectId,i.status)+' → '+column.name);}
    if(i.status===to)return;
    if(to!=='new'&&to!=='blocked'&&workflow.requireAssignee&&!text(raw.assignee,80))throw Error('进入此状态前需指定负责人');
    if(['resolved','closed'].includes(to)){
      if(workflow.requireAcceptance&&!text(raw.acceptance,5000))throw Error('完成前需填写验收条件 / 结论');
      if(workflow.requireChildren&&d.issues.some(c=>c.parentId===i.id&&!done(c)))throw Error('仍有未完成子任务');
    }
    if(workflow.requireDependencies&&!['new','blocked'].includes(to)&&d.relations.some(r=>r.targetId===i.id&&r.kind!=='related'&&!done(get(d,'issues',r.issueId))))throw Error('前置 / 阻塞任务尚未完成');
    if(column.wip&& !['resolved','closed'].includes(to)&&d.issues.filter(x=>x.projectId===i.projectId&&x.status===to&&x.id!==i.id).length>=column.wip)throw Error('该列已达到 WIP 上限 '+column.wip);
  }
  const oldIssue=M.upsertIssue,oldValidate=M.validate,oldDelete=M.deleteIssue,oldDemo=M.demo,oldEmpty=M.empty;
  M.empty=()=>init(oldEmpty());
  M.upsertIssue=function(d,input,id){
    init(d);const before=id&&get(d,'issues',id),previous=before&&{status:before.status,sprintId:before.sprintId,points:before.storyPoints},raw={...(before||{}),...input},p=active(d,raw.projectId);
    const sp=points(raw.storyPoints),acceptance=text(raw.acceptance,5000),sprintId=text(raw.sprintId,40),rank=Number(raw.rank??before?.rank??d.seq+1);
    if(!Number.isFinite(rank)||rank<0||rank>1e12)throw Error('排序值无效');
    hierarchy(d,raw,id);
    if(raw.tracker==='epic'&&(sprintId||sp))throw Error('Epic 不直接分配迭代或估算点数，请规划下级故事');
    if(raw.tracker==='subtask'&&sp)throw Error('子任务使用预估工时，故事点在上级故事估算，避免重复计算');
    if(raw.tracker==='milestone'&&sp)throw Error('里程碑不计故事点');
    if(sprintId){const s=sprint(d,sprintId);if(s.projectId!==p.id)throw Error('迭代不属于此项目');if(s.status==='closed'&&before?.sprintId!==sprintId)throw Error('不能向已结束迭代追加任务');}
    if(before?.sprintId&&sprint(d,before.sprintId).status==='closed'&&before.sprintId!==sprintId)throw Error('已结束迭代任务保留归属；如需新一轮工作，请创建新任务');
    transitions(d,before||{id:'',projectId:p.id,status:'new'},raw.status||'new',{...raw,acceptance});
    for(const sid of new Set([sprintId,previous?.sprintId].filter(Boolean))){const s=sprint(d,sid);if(s.status==='active'&&s.history.length>=2000)throw Error('迭代历史已达 2000 次，请结束迭代并备份');}
    const i=oldIssue(d,raw,id);Object.assign(i,{storyPoints:sp,sprintId,rank,acceptance,agileHistory:before?.agileHistory||[]});
    if(['resolved','closed'].includes(i.status))i.doneRatio=100;
    if(!previous||previous.status!==i.status||previous.sprintId!==i.sprintId||previous.points!==sp){const at=now();i.agileHistory.push({at,status:i.status,sprintId,points:sp});i.agileHistory=i.agileHistory.slice(-500);track(d,[sprintId,previous?.sprintId]);}return i;
  };
  M.deleteIssue=(d,id)=>{init(d);const i=get(d,'issues',id);active(d,i.projectId);if(i.sprintId)throw Error('有迭代记录的任务请保留历史，关闭任务或先移回待办池');oldDelete(d,id);};
  function upsertSprint(d,raw,id){
    init(d);active(d,raw.projectId);const s=id?sprint(d,id):{id:'s'+(++d.seq),projectId:raw.projectId,status:'planned',history:[]};
    if(s.projectId!==raw.projectId||s.status!=='planned')throw Error('仅可编辑本项目未开始的迭代');
    const name=text(raw.name,80),start=day(raw.startDate),end=day(raw.endDate),capacity=points(raw.capacity);
    if(!name||end<start||(Date.parse(end)-Date.parse(start))/86400000>90)throw Error('请输入名称，迭代周期须在 1～91 个自然日内');
    if(d.agile.sprints.some(x=>x.id!==id&&x.projectId===s.projectId&&x.name===name))throw Error('项目内迭代名称已存在');
    if(!id&&d.agile.sprints.length>=1000)throw Error('迭代最多 1000 个，请备份并清理');
    Object.assign(s,{name,goal:text(raw.goal,2000),startDate:start,endDate:end,capacity});if(!id)d.agile.sprints.push(s);return s;
  }
  function startSprint(d,id){init(d);const s=sprint(d,id);active(d,s.projectId);if(s.status!=='planned')throw Error('此迭代已开始或结束');if(d.agile.sprints.some(x=>x.projectId===s.projectId&&x.status==='active'))throw Error('同一项目只允许一个进行中迭代');const snap=snapshot(d,s);if(!snap.items.length)throw Error('先把任务安排到迭代');s.status='active';s.startedAt=snap.at;s.history=[snap];}
  function completeSprint(d,id,target=''){
    init(d);const s=sprint(d,id);active(d,s.projectId);if(s.status!=='active')throw Error('只能结束进行中的迭代');
    if(target){const next=sprint(d,target);if(next.projectId!==s.projectId||next.status!=='planned')throw Error('未完成工作仅能移至本项目计划中迭代');}
    const snap=snapshot(d,s);s.history.push(snap);s.summary=snap;s.closedAt=snap.at;s.status='closed';
    for(const i of d.issues.filter(i=>i.sprintId===id&&!done(i))){i.sprintId=target;i.agileHistory.push({at:snap.at,status:i.status,sprintId:target,points:i.storyPoints});i.agileHistory=i.agileHistory.slice(-500);}
  }
  function deleteSprint(d,id){init(d);const s=sprint(d,id);active(d,s.projectId);if(s.status!=='planned'||d.issues.some(i=>i.sprintId===id))throw Error('只能删除没有任务的计划迭代');d.agile.sprints=d.agile.sprints.filter(x=>x.id!==id);}
  function setWorkflow(d,id,value){
    active(d,id);validateWorkflow(value);const live=new Set(d.issues.filter(i=>i.projectId===id).map(i=>i.status));for(const code of live)if(!value.columns.some(c=>c.code===code))throw Error('不能移除仍有任务使用的状态 '+code);project(d,id).workflow=copy(value);
  }
  function validateWorkflow(w){
    if(!w||!Array.isArray(w.columns)||w.columns.length<2||w.columns.length>7)throw Error('工作流需要 2～7 列');const used=new Set();
    for(const c of w.columns){if(!codes.includes(c.code)||used.has(c.code)||typeof c.name!=='string'||!c.name.trim()||c.name.length>24||!Number.isInteger(c.wip)||c.wip<0||c.wip>10000||!Array.isArray(c.targets)||new Set(c.targets).size!==c.targets.length)throw Error('工作流列格式无效');used.add(c.code);}
    if(!used.has('new')||!used.has('resolved')||!used.has('closed'))throw Error('需保留待办、完成和关闭状态');
    for(const c of w.columns)if(c.targets.some(t=>!used.has(t)||t===c.code))throw Error('流转目标无效');
    for(const k of ['requireAssignee','requireAcceptance','requireChildren','requireDependencies'])if(typeof w[k]!=='boolean')throw Error('流转条件无效');
  }
  function query(d,projectId,f={}){
    const needle=text(f.q,300).toLowerCase();return d.issues.filter(i=>{
      if(projectId&&i.projectId!==projectId)return false;
      if(needle&&!(issueKey(d,i)+' '+i.subject+' '+i.description+' '+i.tags.join(' ')).toLowerCase().includes(needle))return false;
      for(const k of ['status','tracker','priority','versionId','assignee'])if(f[k]&&i[k]!==f[k])return false;
      if(f.tag&&!i.tags.includes(f.tag))return false;
      if(f.sprintId&&(f.sprintId==='backlog'?i.sprintId!=='':i.sprintId!==f.sprintId))return false;
      if(f.epicId){const parent=get(d,'issues',i.parentId);if(i.id!==f.epicId&&i.parentId!==f.epicId&&parent?.parentId!==f.epicId)return false;}
      if(f.overdue&&(!i.dueDate||done(i)||i.dueDate>=f.today))return false;return true;
    }).sort((a,b)=>f.sort==='rank'?a.rank-b.rank||a.number-b.number:f.sort==='priority'?M.PRIORITIES.indexOf(b.priority)-M.PRIORITIES.indexOf(a.priority):f.sort==='due'?(a.dueDate||'9999').localeCompare(b.dueDate||'9999'):b.number-a.number);
  }
  function saveFilter(d,projectId,name,value,id){init(d);project(d,projectId);name=text(name,80);if(!name)throw Error('请输入查询名称');if(!id&&d.agile.filters.length>=100)throw Error('最多保存 100 个查询');const f=id?d.agile.filters.find(f=>f.id===id):{id:'f'+(++d.seq),projectId};if(!f||f.projectId!==projectId)throw Error('查询不存在');f.name=name;f.value=copy(value);if(!id)d.agile.filters.push(f);return f;}
  function summary(d,id){init(d);const s=sprint(d,id),current=s.status==='closed'?s.summary:snapshot(d,s),initial=s.history[0]||current;return{s,current,initial,completed:current.total-current.remaining,scopeDelta:current.total-initial.total,unestimated:current.items.filter(i=>i.points===0).length};}
  function validateSnapshot(x){if(!x||!Number.isFinite(Date.parse(x.at))||!Array.isArray(x.items)||x.items.length>5000)throw Error('迭代快照无效');const ids=new Set();let total=0,remaining=0;for(const i of x.items){if(!i||typeof i.id!=='string'||ids.has(i.id)||typeof i.subject!=='string'||i.subject.length>160||typeof i.key!=='string'||i.key.length>40||typeof i.assignee!=='string'||i.assignee.length>80||!codes.includes(i.status)||typeof i.done!=='boolean'||i.done!==done(i))throw Error('迭代快照任务无效');ids.add(i.id);total+=points(i.points);if(!i.done)remaining+=i.points;}if(x.total!==total||x.remaining!==remaining)throw Error('迭代快照统计不一致');}
  M.validate=function(d){
    if(!d||typeof d!=='object'||['__proto__','constructor','prototype'].some(k=>Object.hasOwn(d,k)))throw Error('项目对象含不安全字段');
    init(d);oldValidate(d);if(d.agile.sprints.length>1000||d.agile.filters.length>100)throw Error('敏捷记录超出限制');
    const ids=new Set();for(const s of d.agile.sprints){if(!s||!/^s\d+$/.test(s.id)||ids.has(s.id)||Number(s.id.slice(1))>d.seq||!get(d,'projects',s.projectId)||!['planned','active','closed'].includes(s.status)||typeof s.name!=='string'||!s.name||s.name.length>80||typeof s.goal!=='string'||s.goal.length>2000||!Array.isArray(s.history)||s.history.length>2001)throw Error('迭代数据无效');ids.add(s.id);day(s.startDate);day(s.endDate);if(s.endDate<s.startDate||(Date.parse(s.endDate)-Date.parse(s.startDate))/86400000>90)throw Error('迭代日期无效');points(s.capacity);s.history.forEach(validateSnapshot);if(s.status!=='planned'&&(!s.history.length||!Number.isFinite(Date.parse(s.startedAt))))throw Error('缺少迭代开始历史');if(s.status==='closed'){validateSnapshot(s.summary);if(!Number.isFinite(Date.parse(s.closedAt)))throw Error('迭代结束时间无效');}}
    for(const p of d.projects){if(p.workflow)validateWorkflow(p.workflow);if(d.agile.sprints.filter(s=>s.projectId===p.id&&s.status==='active').length>1)throw Error('项目含多个进行中迭代');}
    for(const i of d.issues){points(i.storyPoints);if(typeof i.sprintId!=='string'||typeof i.acceptance!=='string'||i.acceptance.length>5000||!Number.isFinite(i.rank)||i.rank<0||i.rank>1e12||!Array.isArray(i.agileHistory)||i.agileHistory.length>500)throw Error('敏捷任务字段无效');hierarchy(d,i,i.id);if(i.sprintId&&sprint(d,i.sprintId).projectId!==i.projectId)throw Error('迭代归属无效');if(['epic','subtask','milestone'].includes(i.tracker)&&i.storyPoints||i.tracker==='epic'&&i.sprintId)throw Error('层级点数 / 迭代无效');if(!wf(d,i.projectId).columns.some(c=>c.code===i.status))throw Error('任务状态不在项目工作流');for(const h of i.agileHistory)if(!Number.isFinite(Date.parse(h.at))||!codes.includes(h.status)||typeof h.sprintId!=='string'||!Number.isFinite(h.points)||h.points<0)throw Error('任务敏捷历史无效');}
    const filterIds=new Set();for(const f of d.agile.filters){if(!f||!/^f\d+$/.test(f.id)||filterIds.has(f.id)||Number(f.id.slice(1))>d.seq||!get(d,'projects',f.projectId)||typeof f.name!=='string'||f.name.length>80||!f.value||typeof f.value!=='object'||JSON.stringify(f.value).length>5000)throw Error('保存查询无效');filterIds.add(f.id);}
    return d;
  };
  M.demo=()=>{const d=init(oldDemo()),p=d.projects[0],epic=M.upsertIssue(d,{projectId:p.id,subject:'Epic · 全站体验升级',tracker:'epic'});const a=M.upsertIssue(d,{projectId:p.id,parentId:epic.id,subject:'故事 · 用户能快速找到工具',tracker:'story',storyPoints:5,assignee:'小陈',acceptance:'手机和电脑均可按需求找到工具'});M.upsertIssue(d,{projectId:p.id,parentId:a.id,subject:'子任务 · 增加搜索提示',tracker:'subtask',estimatedHours:2});const s=upsertSprint(d,{projectId:p.id,name:'示例迭代 1',startDate:'2026-10-06',endDate:'2026-10-19',capacity:13,goal:'验证完整的需求到交付流程'});M.upsertIssue(d,{...a,sprintId:s.id},a.id);return M.validate(d);};
  M.agile={init,codes,names,defaultWorkflow,workflow:wf,statusLabel,done,estimated,issueKey,transitions,upsertSprint,startSprint,completeSprint,deleteSprint,setWorkflow,query,saveFilter,summary,snapshot};
  if(typeof module!=='undefined'&&module.exports)module.exports=M;
})(typeof window==='undefined'?globalThis:window);
