(function (root) {
  'use strict';
  var TRACKERS = ['task', 'feature', 'bug', 'support'];
  var STATUSES = ['new', 'doing', 'blocked', 'resolved', 'closed'];
  var PRIORITIES = ['low', 'normal', 'high', 'urgent'];
  var VERSION_STATUSES = ['open', 'locked', 'closed'];
  var PROJECT_STATUSES = ['active', 'archived'];
  function empty() { return { schema: 1, seq: 0, projects: [], versions: [], issues: [], relations: [], comments: [], timeEntries: [], wiki: [], activity: [] }; }
  function id(data, prefix) { data.seq += 1; return prefix + data.seq; }
  function clean(value, max) { return String(value == null ? '' : value).trim().slice(0, max); }
  function number(value, min, max) { var n = Number(value); if (!Number.isFinite(n) || n < min || n > max) throw Error('数值超出允许范围'); return n; }
  function choice(value, list, fallback) { return list.includes(value) ? value : fallback; }
  function date(value) { var s = clean(value, 10); if (!s) return ''; if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s + 'T00:00:00')) || new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) !== s) throw Error('日期格式不正确'); return s; }
  function list(value, max) { return (Array.isArray(value) ? value : String(value || '').split(/[,，\n]/)).map(function (v) { return clean(v, max); }).filter(Boolean).slice(0, 50); }
  function get(data, kind, itemId) { return data[kind].find(function (x) { return x.id === itemId; }); }
  function requireProject(data, projectId) { var p = get(data, 'projects', projectId); if (!p) throw Error('项目不存在'); return p; }
  function projectDescendant(data, ancestor, target) { var seen = new Set(); var current = get(data, 'projects', target); while (current && current.parentId) { if (seen.has(current.id)) break; seen.add(current.id); if (current.parentId === ancestor) return true; current = get(data, 'projects', current.parentId); } return false; }
  function issueDescendant(data, ancestor, target) { var seen = new Set(); var current = get(data, 'issues', target); while (current && current.parentId) { if (seen.has(current.id)) break; seen.add(current.id); if (current.parentId === ancestor) return true; current = get(data, 'issues', current.parentId); } return false; }
  function log(data, projectId, issueId, text) { data.activity.unshift({ id: id(data, 'a'), projectId: projectId, issueId: issueId || '', text: clean(text, 500), at: new Date().toISOString() }); data.activity = data.activity.slice(0, 1000); }
  function upsertProject(data, raw, projectId) {
    var name = clean(raw.name, 80), key = clean(raw.key, 16).toUpperCase();
    if (!name || !/^[A-Z0-9-]{2,16}$/.test(key)) throw Error('请填写项目名称和 2–16 位英数字项目代号');
    if (data.projects.some(function (p) { return p.key === key && p.id !== projectId; })) throw Error('项目代号已存在');
    var parentId = clean(raw.parentId, 40);
    if (parentId) { requireProject(data, parentId); if (parentId === projectId || projectDescendant(data, projectId, parentId)) throw Error('父项目不能形成循环'); }
    var record = projectId ? requireProject(data, projectId) : { id: id(data, 'p'), createdAt: new Date().toISOString() };
    Object.assign(record, { name: name, key: key, parentId: parentId, status: choice(raw.status, PROJECT_STATUSES, 'active'), description: clean(raw.description, 2000), members: list(raw.members, 120), categories: list(raw.categories, 60) });
    if (!projectId) data.projects.push(record);
    log(data, record.id, '', (projectId ? '更新项目：' : '创建项目：') + name);
    return record;
  }
  function upsertVersion(data, raw, versionId, projectId) {
    requireProject(data, projectId);
    var name = clean(raw.name, 80); if (!name) throw Error('请输入版本名称');
    if (data.versions.some(function (v) { return v.projectId === projectId && v.name === name && v.id !== versionId; })) throw Error('当前项目已存在同名版本');
    var record = versionId ? get(data, 'versions', versionId) : { id: id(data, 'v'), projectId: projectId };
    if (!record || record.projectId !== projectId) throw Error('版本不存在');
    Object.assign(record, { name: name, dueDate: date(raw.dueDate), status: choice(raw.status, VERSION_STATUSES, 'open'), description: clean(raw.description, 2000) });
    if (!versionId) data.versions.push(record);
    log(data, projectId, '', (versionId ? '更新版本：' : '创建版本：') + name);
    return record;
  }
  function upsertIssue(data, raw, issueId) {
    var projectId = clean(raw.projectId, 40); var project = requireProject(data, projectId);
    if (project.status === 'archived') throw Error('已归档项目不能新增或修改任务');
    var subject = clean(raw.subject, 160); if (!subject) throw Error('请输入任务主题');
    var parentId = clean(raw.parentId, 40), versionId = clean(raw.versionId, 40);
    if (parentId) { var parent = get(data, 'issues', parentId); if (!parent || parent.projectId !== projectId || parentId === issueId || issueDescendant(data, issueId, parentId)) throw Error('上级任务无效或形成循环'); }
    if (versionId) { var version = get(data, 'versions', versionId); if (!version || version.projectId !== projectId) throw Error('目标版本不属于当前项目'); }
    var startDate = date(raw.startDate), dueDate = date(raw.dueDate);
    if (startDate && dueDate && startDate > dueDate) throw Error('截止日期不能早于开始日期');
    var record = issueId ? get(data, 'issues', issueId) : { id: id(data, 'i'), number: data.seq, createdAt: new Date().toISOString() };
    if (!record) throw Error('任务不存在');
    if (issueId && record.projectId !== projectId) throw Error('已有任务暂不支持跨项目移动');
    var before = issueId ? { status: record.status, assignee: record.assignee, doneRatio: record.doneRatio } : null;
    Object.assign(record, { projectId: projectId, parentId: parentId, versionId: versionId, subject: subject, description: clean(raw.description, 10000), tracker: choice(raw.tracker, TRACKERS, 'task'), status: choice(raw.status, STATUSES, 'new'), priority: choice(raw.priority, PRIORITIES, 'normal'), assignee: clean(raw.assignee, 80), category: clean(raw.category, 60), startDate: startDate, dueDate: dueDate, estimatedHours: number(raw.estimatedHours || 0, 0, 100000), doneRatio: number(raw.doneRatio || 0, 0, 100), tags: list(raw.tags, 40), updatedAt: new Date().toISOString() });
    if (!issueId) data.issues.push(record);
    var changes = [];
    if (before) {
      if (before.status !== record.status) changes.push('状态 ' + before.status + ' → ' + record.status);
      if (before.assignee !== record.assignee) changes.push('负责人 ' + (before.assignee || '未指派') + ' → ' + (record.assignee || '未指派'));
      if (before.doneRatio !== record.doneRatio) changes.push('进度 ' + before.doneRatio + '% → ' + record.doneRatio + '%');
    }
    log(data, projectId, record.id, (issueId ? '更新 #' : '创建 #') + record.number + ' ' + subject + (changes.length ? ' · ' + changes.join(' · ') : ''));
    return record;
  }
  function addComment(data, issueId, author, text) {
    var issue = get(data, 'issues', issueId); if (!issue) throw Error('任务不存在');
    var body = clean(text, 5000); if (!body) throw Error('评论不能为空');
    var record = { id: id(data, 'c'), issueId: issueId, author: clean(author, 80) || '匿名', text: body, at: new Date().toISOString() };
    data.comments.push(record); log(data, issue.projectId, issueId, '评论 #' + issue.number + ' · ' + record.author); return record;
  }
  function addRelation(data, issueId, targetId, kind) {
    var issue = get(data, 'issues', issueId), target = get(data, 'issues', targetId);
    if (!issue || !target || issueId === targetId || issue.projectId !== target.projectId) throw Error('只能关联同一项目中的另一条任务');
    kind = choice(kind, ['related', 'blocks', 'precedes'], 'related');
    if (data.relations.some(function (r) { return (r.issueId === issueId && r.targetId === targetId) || (r.issueId === targetId && r.targetId === issueId); })) throw Error('这两条任务已经有关联');
    var record = { id: id(data, 'r'), issueId: issueId, targetId: targetId, kind: kind };
    data.relations.push(record); log(data, issue.projectId, issueId, '关联 #' + issue.number + ' 与 #' + target.number); return record;
  }
  function removeRelation(data, relationId) {
    var relation = get(data, 'relations', relationId); if (!relation) throw Error('关联不存在');
    var issue = get(data, 'issues', relation.issueId);
    data.relations = data.relations.filter(function (r) { return r.id !== relationId; });
    log(data, issue.projectId, issue.id, '移除任务关联');
  }
  function addTime(data, raw, projectId) {
    requireProject(data, projectId);
    var issueId = clean(raw.issueId, 40); if (issueId && (!get(data, 'issues', issueId) || get(data, 'issues', issueId).projectId !== projectId)) throw Error('关联任务不属于当前项目');
    var user = clean(raw.user, 80); if (!user) throw Error('请输入登记人员');
    var record = { id: id(data, 't'), projectId: projectId, issueId: issueId, date: date(raw.date), hours: number(raw.hours, 0.25, 24), activity: clean(raw.activity, 40) || '其他', user: user, note: clean(raw.note, 1000) };
    if (!record.date) throw Error('请选择工时日期');
    data.timeEntries.push(record); log(data, projectId, issueId, user + ' 登记 ' + record.hours + ' 小时工时'); return record;
  }
  function upsertWiki(data, raw, wikiId, projectId) {
    requireProject(data, projectId);
    var title = clean(raw.title, 120); if (!title) throw Error('请输入知识页标题');
    var record = wikiId ? get(data, 'wiki', wikiId) : { id: id(data, 'w'), projectId: projectId };
    if (!record || record.projectId !== projectId) throw Error('知识页不存在');
    Object.assign(record, { title: title, body: clean(raw.body, 30000), updatedAt: new Date().toISOString() });
    if (!wikiId) data.wiki.push(record);
    log(data, projectId, '', (wikiId ? '更新知识页：' : '创建知识页：') + title); return record;
  }
  function deleteIssue(data, issueId) {
    var issue = get(data, 'issues', issueId); if (!issue) throw Error('任务不存在');
    if (data.issues.some(function (x) { return x.parentId === issueId; }) || data.timeEntries.some(function (x) { return x.issueId === issueId; })) throw Error('该任务有子任务或工时记录，请先处理关联数据；可改为“已关闭”以保留历史');
    data.issues = data.issues.filter(function (x) { return x.id !== issueId; });
    data.relations = data.relations.filter(function (x) { return x.issueId !== issueId && x.targetId !== issueId; });
    data.comments = data.comments.filter(function (x) { return x.issueId !== issueId; });
    log(data, issue.projectId, '', '删除 #' + issue.number + ' ' + issue.subject);
  }
  function validate(data) {
    if (!data || data.schema !== 1 || !Number.isSafeInteger(data.seq) || data.seq < 0) throw Error('备份版本或数据结构不受支持');
    ['projects', 'versions', 'issues', 'relations', 'comments', 'timeEntries', 'wiki', 'activity'].forEach(function (key) { if (!Array.isArray(data[key]) || data[key].length > 100000) throw Error('备份中 ' + key + ' 列表无效'); });
    var all = new Set();
    ['projects', 'versions', 'issues', 'relations', 'comments', 'timeEntries', 'wiki', 'activity'].forEach(function (key) { data[key].forEach(function (x) { var idMatch = x && typeof x.id === 'string' && x.id.match(/^[a-z](\d+)$/); if (!idMatch || Number(idMatch[1]) > data.seq || all.has(x.id)) throw Error('备份包含无效或重复 ID'); all.add(x.id); }); });
    function str(value, max) { return typeof value === 'string' && value.length <= max; }
    function strings(values, count, max) { return Array.isArray(values) && values.length <= count && values.every(function (s) { return str(s, max); }); }
    function validDate(value) { try { return !value || (str(value, 10) && date(value) === value); } catch (_) { return false; } }
    data.projects.forEach(function (p) { if (!str(p.name, 80) || !str(p.key, 16) || !str(p.description, 2000) || !strings(p.members, 50, 120) || !strings(p.categories, 50, 60) || !PROJECT_STATUSES.includes(p.status)) throw Error('备份项目无效'); if (p.parentId && !get(data, 'projects', p.parentId)) throw Error('备份父项目不存在'); if (projectDescendant(data, p.id, p.id)) throw Error('备份项目层级循环'); });
    data.versions.forEach(function (v) { if (!get(data, 'projects', v.projectId) || !str(v.name, 80) || !str(v.description, 2000) || !validDate(v.dueDate) || !VERSION_STATUSES.includes(v.status)) throw Error('备份版本无效'); });
    data.issues.forEach(function (i) { if (!get(data, 'projects', i.projectId) || !Number.isSafeInteger(i.number) || i.number < 1 || i.number > data.seq || !str(i.subject, 160) || !str(i.description, 10000) || !str(i.assignee, 80) || !str(i.category, 60) || !strings(i.tags, 50, 40) || !TRACKERS.includes(i.tracker) || !STATUSES.includes(i.status) || !PRIORITIES.includes(i.priority) || !validDate(i.startDate) || !validDate(i.dueDate) || !Number.isFinite(i.estimatedHours) || !Number.isFinite(i.doneRatio) || i.doneRatio < 0 || i.doneRatio > 100) throw Error('备份任务无效'); if (i.parentId && (!get(data, 'issues', i.parentId) || get(data, 'issues', i.parentId).projectId !== i.projectId || issueDescendant(data, i.id, i.id))) throw Error('备份任务层级无效'); if (i.versionId && (!get(data, 'versions', i.versionId) || get(data, 'versions', i.versionId).projectId !== i.projectId)) throw Error('备份任务版本无效'); });
    data.relations.forEach(function (r) { var a = get(data, 'issues', r.issueId), b = get(data, 'issues', r.targetId); if (!a || !b || a.projectId !== b.projectId || a.id === b.id || !['related', 'blocks', 'precedes'].includes(r.kind)) throw Error('备份任务关联无效'); });
    data.timeEntries.forEach(function (t) { if (!get(data, 'projects', t.projectId) || (t.issueId && (!get(data, 'issues', t.issueId) || get(data, 'issues', t.issueId).projectId !== t.projectId)) || !validDate(t.date) || !Number.isFinite(t.hours) || t.hours < 0.25 || t.hours > 24 || !str(t.user, 80) || !str(t.activity, 40) || !str(t.note, 1000)) throw Error('备份工时无效'); });
    data.comments.forEach(function (c) { if (!get(data, 'issues', c.issueId) || !str(c.author, 80) || !str(c.text, 5000)) throw Error('备份评论无效'); });
    data.wiki.forEach(function (w) { if (!get(data, 'projects', w.projectId) || !str(w.title, 120) || !str(w.body, 30000)) throw Error('备份知识页无效'); });
    data.activity.forEach(function (a) { if (!get(data, 'projects', a.projectId) || !str(a.text, 500)) throw Error('备份活动记录无效'); });
    return data;
  }
  function demo() {
    var data = empty();
    var p = upsertProject(data, { name: '示例 · 官网改版', key: 'DEMO', description: '纯虚构示例，用来体验任务、版本与工时的关联。', members: ['小林 · 项目负责人', '小周 · 设计', '小陈 · 开发'], categories: ['页面', '内容', '测试'] });
    var v = upsertVersion(data, { name: 'v1.0 首发', dueDate: '2026-12-15', status: 'open', description: '完成首批页面与验收。' }, '', p.id);
    var a = upsertIssue(data, { projectId: p.id, subject: '梳理页面结构', tracker: 'task', status: 'resolved', priority: 'normal', assignee: '小林', category: '页面', versionId: v.id, startDate: '2026-11-01', dueDate: '2026-11-05', estimatedHours: 8, doneRatio: 100, description: '列出导航与页面清单。' });
    var design = upsertIssue(data, { projectId: p.id, subject: '制作首页设计稿', tracker: 'feature', status: 'doing', priority: 'high', assignee: '小周', category: '页面', versionId: v.id, parentId: a.id, startDate: '2026-11-06', dueDate: '2026-11-20', estimatedHours: 20, doneRatio: 50 });
    upsertIssue(data, { projectId: p.id, subject: '移动端回归测试', tracker: 'bug', status: 'new', priority: 'normal', assignee: '小陈', category: '测试', versionId: v.id, startDate: '2026-11-21', dueDate: '2026-12-01', estimatedHours: 12, doneRatio: 0 });
    addTime(data, { issueId: design.id, date: '2026-11-08', hours: 2.5, user: '小周', activity: '设计', note: '整理首页布局方案' }, p.id);
    addComment(data, design.id, '小林', '请在下一次评审前补充移动端样式。');
    upsertWiki(data, { title: '项目约定', body: '这是纯虚构示例。\n每周检查任务状态；交付前核对版本清单与测试结果。' }, '', p.id);
    return data;
  }
  TRACKERS.push('milestone');
  function dependencyOrder(data, extra) {
    var links=data.relations.filter(function(r){return r.kind!=='related';}).concat(extra?[extra]:[]),indegree=new Map(data.issues.map(function(i){return[i.id,0];})),adj=new Map(data.issues.map(function(i){return[i.id,[]];}));
    links.forEach(function(r){if(!adj.has(r.issueId)||!indegree.has(r.targetId))throw Error('依赖任务不存在');adj.get(r.issueId).push(r.targetId);indegree.set(r.targetId,indegree.get(r.targetId)+1);});
    var queue=data.issues.filter(function(i){return indegree.get(i.id)===0;}).map(function(i){return i.id;}),order=[];
    for(var index=0;index<queue.length;index++){var current=queue[index];order.push(current);adj.get(current).forEach(function(id){indegree.set(id,indegree.get(id)-1);if(indegree.get(id)===0)queue.push(id);});}
    if(order.length!==data.issues.length)throw Error('前置 / 阻塞依赖形成循环，请移除其中一条关联');return{order:order,adj:adj};
  }
  var originalRelation=addRelation;addRelation=function(data,issueId,targetId,kind){if(['blocks','precedes'].includes(kind))dependencyOrder(data,{issueId:issueId,targetId:targetId,kind:kind});return originalRelation(data,issueId,targetId,kind);};
  var originalIssue=upsertIssue;upsertIssue=function(data,raw,issueId){var recurrenceDays=raw.recurrenceDays==null?0:number(raw.recurrenceDays,0,3650);if(!Number.isInteger(recurrenceDays))throw Error('重复间隔须为整数天');if(raw.tracker==='milestone'){if(!raw.dueDate)throw Error('里程碑必须有截止日期');if(raw.startDate&&raw.startDate!==raw.dueDate)throw Error('里程碑开始与截止应为同一天');}var record=originalIssue(data,raw,issueId);record.recurrenceDays=recurrenceDays;return record;};
  var originalValidate=validate;validate=function(data){originalValidate(data);dependencyOrder(data);data.issues.forEach(function(i){if(i.recurrenceDays==null)i.recurrenceDays=0;if(!Number.isInteger(i.recurrenceDays)||i.recurrenceDays<0||i.recurrenceDays>3650)throw Error('重复间隔格式无效');if(i.recurrenceOrigin!=null&&(typeof i.recurrenceOrigin!=='string'||i.recurrenceOrigin.length>40))throw Error('重复任务关联无效');});if(data.baselines==null)data.baselines=[];if(!Array.isArray(data.baselines)||data.baselines.length>20)throw Error('计划基线最多 20 份');var baselineIds=new Set();data.baselines.forEach(function(b){if(!b||typeof b.id!=='string'||baselineIds.has(b.id)||!get(data,'projects',b.projectId)||!strBaseline(b.name,100)||!Number.isFinite(Date.parse(b.at))||!Array.isArray(b.items)||b.items.length>5000)throw Error('计划基线无效');baselineIds.add(b.id);var ids=new Set();b.items.forEach(function(i){if(!i||!strBaseline(i.id,40)||ids.has(i.id)||!strBaseline(i.subject,160)||!validBaselineDate(i.startDate)||!validBaselineDate(i.dueDate))throw Error('基线任务字段无效');ids.add(i.id);});});return data;};
  function strBaseline(s,max){return typeof s==='string'&&s.length<=max;}
  function validBaselineDate(s){try{return typeof s==='string'&&date(s)===s;}catch(_){return false;}}
  function captureBaseline(data,projectId,name){requireProject(data,projectId);var cleanName=clean(name,100);if(!cleanName)throw Error('请输入基线名称');data.baselines=data.baselines||[];if(data.baselines.length>=20)throw Error('最多 20 份基线，请先下载备份并清理旧基线');var items=data.issues.filter(function(i){return i.projectId===projectId;});if(items.length>5000)throw Error('每份基线最多 5000 条任务');var record={id:id(data,'b'),projectId:projectId,name:cleanName,at:new Date().toISOString(),items:items.map(function(i){return{id:i.id,subject:i.subject,startDate:i.startDate,dueDate:i.dueDate};})};data.baselines.push(record);log(data,projectId,'','保存排期基线：'+cleanName);return record;}
  function shiftDay(value,days){if(!value)return'';var d=new Date(value+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
  function repeatIssue(data,issueId){var source=get(data,'issues',issueId);if(!source||!source.recurrenceDays||!source.dueDate)throw Error('先设置重复间隔与截止日期');var due=shiftDay(source.dueDate,source.recurrenceDays);if(data.issues.some(function(i){return i.recurrenceOrigin===source.id&&i.dueDate===due;}))throw Error('此任务的下一期已创建');var raw=Object.assign({},source,{startDate:shiftDay(source.startDate,source.recurrenceDays),dueDate:due,status:'new',doneRatio:0,parentId:source.parentId,description:source.description+'\n重复自 #'+source.number}),next=upsertIssue(data,raw);next.recurrenceOrigin=source.id;return next;}
  function schedule(data,projectId){var topo=dependencyOrder(data),issues=data.issues.filter(function(i){return i.projectId===projectId;}),ids=new Set(issues.map(function(i){return i.id;})),score=new Map(),previous=new Map(),warnings=[];function duration(i){return i.tracker==='milestone'?0:i.startDate&&i.dueDate?Math.max(1,(Date.parse(i.dueDate)-Date.parse(i.startDate))/86400000+1):1;}topo.order.filter(function(id){return ids.has(id);}).forEach(function(id){var issue=get(data,'issues',id);score.set(id,(score.get(id)||0)+duration(issue));topo.adj.get(id).filter(function(next){return ids.has(next);}).forEach(function(next){var target=get(data,'issues',next);if(issue.dueDate&&target.startDate&&issue.dueDate>=target.startDate)warnings.push('#'+issue.number+' 截止 '+issue.dueDate+'，但后续 #'+target.number+' 在 '+target.startDate+' 开始；按完成后开始的关系存在重叠');if(!['resolved','closed'].includes(issue.status)&&['doing','resolved','closed'].includes(target.status))warnings.push('#'+target.number+' 已启动 / 完成，但前置 #'+issue.number+' 尚未完成');if((score.get(next)||0)<score.get(id)){score.set(next,score.get(id));previous.set(next,id);}});});var last=issues.reduce(function(best,i){return(score.get(i.id)||0)>(score.get(best)||0)?i.id:best;},''),chain=[];for(var current=last;current;current=previous.get(current))chain.unshift(current);return{warnings:warnings,chain:chain,days:score.get(last)||0};}
  var api = { empty: empty, get: get, upsertProject: upsertProject, upsertVersion: upsertVersion, upsertIssue: upsertIssue, addComment: addComment, addRelation: addRelation, removeRelation: removeRelation, addTime: addTime, upsertWiki: upsertWiki, deleteIssue: deleteIssue, validate: validate, demo: demo, dependencyOrder:dependencyOrder,captureBaseline:captureBaseline,repeatIssue:repeatIssue,schedule:schedule,TRACKERS: TRACKERS, STATUSES: STATUSES, PRIORITIES: PRIORITIES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ProjectModel = api;
})(typeof window === 'undefined' ? globalThis : window);
