(function () {
  'use strict';
  var M = window.ProjectModel, KEY = 'yj-project-desk-v1';
  var data = M.empty(), selectedProject = '', view = 'overview', issuePage = 1, calendarMonth = localDay(new Date()).slice(0, 7), selectedWiki = '', editingProject = '', editingIssue = '', editingVersion = '', editingWiki = '', detailIssue = '';
  var filters = { q: '', status: '', tracker: '', assignee: '', priority: '' };
  var customViews = {}, lastSaved = JSON.stringify(data), storageInvalid = false, lastDisk = null;
  var sharedModel=M;M=Object.assign({},sharedModel);const baseCareValidate=M.validate;M.validate=function(v){const next=baseCareValidate(v);next.trash=RecordCare.trash('projects',v.trash);if(new Set(next.projects.map(p=>p.key.toUpperCase())).size!==next.projects.length)throw Error('项目代号重复，无法合并');if(new Set(next.issues.map(i=>i.number)).size!==next.issues.length)throw Error('任务编号重复，无法合并');return next};
  ['upsertProject','upsertIssue','upsertVersion','addComment','addRelation','removeRelation','addTime','upsertWiki','deleteIssue'].forEach(function(name){M[name]=function(){var before=JSON.stringify(data);try{if(storageInvalid||localStorage.getItem(KEY)!==lastDisk)throw Error('本机记录已变化，请先导出当前内存并载入最新版本');var result=sharedModel[name].apply(sharedModel,arguments);sharedModel.validate(data);return result;}catch(error){data=JSON.parse(before);throw error;}};});
  var originalRender=render;render=function(){originalRender();window.dispatchEvent(new Event('yj-project-update'));};
  var $ = function (selector) { return document.querySelector(selector); };
  var $$ = function (selector) { return Array.from(document.querySelectorAll(selector)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function txt(s) { return esc(s).replace(/\n/g, '<br>'); }
  function label(kind, value) {
    if (kind === 'status' && M.agile) return M.agile.statusLabel(data, selectedProject, value);
    if (kind === 'tracker' && {epic:'Epic · 大目标',story:'故事',subtask:'子任务'}[value]) return {epic:'Epic · 大目标',story:'故事',subtask:'子任务'}[value];
    var maps = { status: { 'new': '新建', doing: '进行中', blocked: '受阻', resolved: '已解决', closed: '已关闭' }, tracker: { task: '任务', feature: '需求', bug: '缺陷', support: '支持', milestone:'里程碑' }, priority: { low: '低', normal: '普通', high: '高', urgent: '紧急' }, version: { open: '计划中', locked: '已锁定', closed: '已发布' } };
    return (maps[kind] && maps[kind][value]) || value || '—';
  }
  function shortDate(s) { return s ? esc(s) : '—'; }
  function stamp(s) { return s ? new Date(s).toLocaleString('zh-CN', { hour12: false }) : '—'; }
  function localDay(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function today() { return localDay(new Date()); }
  function byId(kind, id) { return M.get(data, kind, id); }
  function projectName(id) { var p = byId('projects', id); return p ? p.name : '未知项目'; }
  function issueName(id) { var i = byId('issues', id); return i ? '#' + i.number + ' ' + i.subject : '—'; }
  function allProjectIds(projectId) {
    if (!projectId) return data.projects.map(function (p) { return p.id; });
    var out = [projectId], changed = true;
    while (changed) { changed = false; data.projects.forEach(function (p) { if (p.parentId && out.includes(p.parentId) && !out.includes(p.id)) { out.push(p.id); changed = true; } }); }
    return out;
  }
  function scopeIssues() { var ids = allProjectIds(selectedProject); return data.issues.filter(function (i) { return ids.includes(i.projectId); }); }
  function scopeTime() { var ids = allProjectIds(selectedProject); return data.timeEntries.filter(function (t) { return ids.includes(t.projectId); }); }
  function save() { try { if(storageInvalid)throw Error('旧记录读取失败，请先下载原始记录'); if(localStorage.getItem(KEY)!==lastDisk)throw Error('其他标签页已修改数据，未覆盖。请导出当前内存并载入最新版本'); data=M.validate(RecordCare.capture('projects',JSON.parse(lastSaved),data)); var serialized=JSON.stringify(data);localStorage.setItem(KEY,serialized);lastSaved=serialized;lastDisk=serialized;return true; } catch(error){toast('未保存：'+error.message+'；当前内容仍在内存，请先导出。',true);return false;} }
  function toast(message, error) { var el = $('#toast'); el.textContent = message; el.style.background = error ? '#9e2c31' : '#163249'; el.hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(function () { el.hidden = true; }, 5000); }
  function commit(message) { var saved=save(); render(); if (saved&&message) toast(message); }
  function download(name, content, type) { var blob = new Blob([content], { type: type }); var url = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 30000); }
  function option(value, title, current) { return '<option value="' + esc(value) + '"' + (current === value ? ' selected' : '') + '>' + esc(title) + '</option>'; }
  function setOptions(select, entries, current, first) { select.innerHTML = first + entries.map(function (x) { return option(x.id, x.name || x.subject, current); }).join(''); }
  function renderSidebar() {
    var q = $('#project-search').value.trim().toLowerCase();
    var projects = data.projects.filter(function (p) { return !q || (p.name + ' ' + p.key + ' ' + p.description).toLowerCase().includes(q); });
    projects.sort(function (a, b) { return a.name.localeCompare(b.name, 'zh-CN'); });
    $('#project-list').innerHTML = projects.length ? projects.map(function (p) {
      var depth = p.parentId ? (byId('projects', p.parentId) && byId('projects', p.parentId).parentId ? 2 : 1) : 0;
      return '<button class="project-item depth-' + depth + (selectedProject === p.id ? ' active' : '') + (p.status === 'archived' ? ' archived' : '') + '" data-project="' + esc(p.id) + '"><strong>' + esc(p.name) + '</strong><small>' + esc(p.key) + (p.status === 'archived' ? ' · 已归档' : '') + '</small></button>';
    }).join('') : '<div class="subtle">暂无项目</div>';
    $('#all-projects').classList.toggle('active', !selectedProject);
  }
  function renderHeading() {
    var p = byId('projects', selectedProject);
    $('#project-kicker').textContent = p ? p.key + (p.parentId ? ' · 子项目' : '') : 'ALL PROJECTS';
    $('#project-title').textContent = p ? p.name : '全部项目';
    $('#project-description').textContent = p ? (p.description || '尚未填写项目描述') : '汇总当前浏览器中的项目和任务。选择左侧项目查看详细视图。';
    $('#edit-project').hidden = !p; $('#new-version').hidden = !p || p.status === 'archived';
    $('#new-issue').disabled = !data.projects.some(function (x) { return x.status === 'active'; });
    $$('[data-view]').forEach(function (b) { b.classList.toggle('active', b.dataset.view === view); });
  }
  function render() { renderSidebar(); renderHeading(); var map = { overview: renderOverview, issues: renderIssues, board: renderBoard, timeline: renderTimeline, calendar: renderCalendar, roadmap: renderRoadmap, time: renderTime, wiki: renderWiki }; if(customViews[view])customViews[view]();else (map[view]||renderOverview)(); }
  function metric(title, value, detail) { return '<div class="stat"><span>' + esc(title) + '</span><strong>' + esc(value) + '</strong><small>' + esc(detail) + '</small></div>'; }
  function renderOverview() {
    var items = scopeIssues(), open = items.filter(function (i) { return !['resolved', 'closed'].includes(i.status); }), overdue = open.filter(function (i) { return i.dueDate && i.dueDate < today(); }), hours = scopeTime().reduce(function (n, t) { return n + Number(t.hours); }, 0), versions = data.versions.filter(function (v) { return allProjectIds(selectedProject).includes(v.projectId); });
    var recent = data.activity.filter(function (a) { return allProjectIds(selectedProject).includes(a.projectId); }).slice(0, 8);
    var upcoming = items.filter(function (i) { return i.dueDate && !['resolved', 'closed'].includes(i.status); }).sort(function (a, b) { return a.dueDate.localeCompare(b.dueDate); }).slice(0, 6);
    $('#view').innerHTML = '<div class="stats">' + metric('项目 / 子项目', allProjectIds(selectedProject).length, '本地项目') + metric('未完成任务', open.length, '共 ' + items.length + ' 条任务') + metric('逾期任务', overdue.length, '按截止日期统计') + metric('已登记工时', hours.toFixed(2) + ' h', versions.length + ' 个版本') + '</div><div class="two-col"><section class="panel"><div class="section-head"><h3>临近截止</h3><button data-jump="issues">查看任务单</button></div>' + (upcoming.length ? '<div class="mini-list">' + upcoming.map(function (i) { return '<div class="mini-row"><button data-detail="' + esc(i.id) + '">#' + i.number + ' ' + esc(i.subject) + '</button><small class="' + (i.dueDate < today() ? 'overdue' : '') + '">' + esc(i.dueDate) + '</small></div>'; }).join('') + '</div>' : '<div class="muted-empty">暂无待完成的定期任务</div>') + '</section><section class="panel"><div class="section-head"><h3>最近动态</h3></div>' + (recent.length ? '<div class="mini-list">' + recent.map(function (a) { return '<div class="mini-row"><span>' + esc(a.text) + '<br><small>' + esc(projectName(a.projectId)) + '</small></span><small>' + stamp(a.at) + '</small></div>'; }).join('') + '</div>' : '<div class="muted-empty">创建项目后，变更会出现在这里</div>') + '</section></div>' + (!data.projects.length ? '<section class="panel"><div class="muted-empty"><h3>从第一个项目开始</h3><p>新建项目后就能记录任务、版本、工时与知识页，也可先载入虚构示例看看各视图。</p><button data-action="new-project" class="primary">＋ 新建项目</button></div></section>' : '');
  }
  function filteredIssues() {
    var q = filters.q.toLowerCase(); return scopeIssues().filter(function (i) { return (!q || (i.subject + ' ' + i.description + ' ' + i.number + ' ' + i.assignee + ' ' + i.tags.join(' ')).toLowerCase().includes(q)) && (!filters.status || i.status === filters.status) && (!filters.tracker || i.tracker === filters.tracker) && (!filters.priority || i.priority === filters.priority) && (!filters.assignee || i.assignee === filters.assignee); }).sort(function (a, b) { return b.number - a.number; });
  }
  function renderIssues() {
    var assignees = Array.from(new Set(scopeIssues().map(function (i) { return i.assignee; }).filter(Boolean))).sort(), items = filteredIssues(), pages = Math.max(1, Math.ceil(items.length / 20)); issuePage = Math.min(issuePage, pages);
    var start = (issuePage - 1) * 20, pageItems = items.slice(start, start + 20);
    $('#view').innerHTML = '<section class="panel"><div class="section-head"><h3>任务单 · ' + items.length + ' 条</h3><div class="row"><button data-action="csv">导出筛选结果 CSV</button><button data-action="new-issue" class="primary">＋ 新建任务</button></div></div><div class="toolbar"><label class="grow">搜索<input id="filter-q" type="search" placeholder="主题、编号、标签、负责人…" value="' + esc(filters.q) + '"></label><label>状态<select id="filter-status">' + option('', '全部状态', filters.status) + M.STATUSES.map(function (s) { return option(s, label('status', s), filters.status); }).join('') + '</select></label><label>类型<select id="filter-tracker">' + option('', '全部类型', filters.tracker) + M.TRACKERS.map(function (s) { return option(s, label('tracker', s), filters.tracker); }).join('') + '</select></label><label>优先级<select id="filter-priority">' + option('', '全部优先级', filters.priority) + M.PRIORITIES.map(function (s) { return option(s, label('priority', s), filters.priority); }).join('') + '</select></label><label>负责人<select id="filter-assignee">' + option('', '全部人员', filters.assignee) + assignees.map(function (s) { return option(s, s, filters.assignee); }).join('') + '</select></label><button data-action="clear-filters">清除</button></div>' + (items.length ? '<div class="table-scroll"><table class="data-table"><thead><tr><th>编号 / 主题</th><th>项目</th><th>类型</th><th>状态</th><th>优先级</th><th>负责人</th><th>截止</th><th>进度</th></tr></thead><tbody>' + pageItems.map(function (i) { return '<tr><td><button class="link" data-detail="' + esc(i.id) + '">#' + i.number + ' ' + esc(i.subject) + '</button>' + (i.parentId ? '<br><small class="subtle">↳ ' + esc(issueName(i.parentId)) + '</small>' : '') + '</td><td>' + esc(projectName(i.projectId)) + '</td><td>' + esc(label('tracker', i.tracker)) + '</td><td><span class="badge ' + esc(i.status) + '">' + esc(label('status', i.status)) + '</span></td><td><span class="badge ' + esc(i.priority) + '">' + esc(label('priority', i.priority)) + '</span></td><td>' + esc(i.assignee || '未指派') + '</td><td class="' + (i.dueDate && i.dueDate < today() && !['closed', 'resolved'].includes(i.status) ? 'overdue' : '') + '">' + shortDate(i.dueDate) + '</td><td>' + Number(i.doneRatio) + '%</td></tr>'; }).join('') + '</tbody></table></div><div class="pagination"><button data-page="-1"' + (issuePage === 1 ? ' disabled' : '') + '>上一页</button><span>' + issuePage + ' / ' + pages + ' 页</span><button data-page="1"' + (issuePage === pages ? ' disabled' : '') + '>下一页</button></div>' : '<div class="muted-empty">当前筛选下没有任务单</div>') + '</section>';
  }
  function renderBoard() {
    var items = scopeIssues().slice().sort(function (a, b) { return b.number - a.number; });
    $('#view').innerHTML = '<section class="panel"><div class="section-head"><h3>状态看板</h3><span class="subtle">可拖动卡片，触摸设备可用卡片内状态菜单。归档项目不可调整。</span></div><div class="board">' + M.STATUSES.map(function (status) {
      var group = items.filter(function (i) { return i.status === status; });
      return '<div class="board-col" data-drop="' + status + '"><h3>' + label('status', status) + '<span>' + group.length + '</span></h3>' + (group.length ? group.map(function (i) {
        return '<div class="board-card" draggable="' + (byId('projects', i.projectId).status === 'active') + '" data-drag="' + esc(i.id) + '"><button class="link" data-detail="' + esc(i.id) + '">#' + i.number + ' ' + esc(i.subject) + '</button><div class="meta">' + esc(projectName(i.projectId)) + ' · ' + esc(i.assignee || '未指派') + '</div><div class="progress"><i style="width:' + Number(i.doneRatio) + '%"></i></div><select data-change-status="' + esc(i.id) + '" aria-label="改变任务状态" ' + (byId('projects', i.projectId).status === 'archived' ? 'disabled' : '') + '>' + M.STATUSES.map(function (s) { return option(s, label('status', s), status); }).join('') + '</select></div>';
      }).join('') : '<div class="subtle">暂无任务</div>') + '</div>';
    }).join('') + '</div></section>';
  }
  function renderTimeline() {
    var items = scopeIssues().filter(function (i) { return i.startDate || i.dueDate; }).sort(function (a, b) { return (a.startDate || a.dueDate).localeCompare(b.startDate || b.dueDate); });
    var now = new Date(), months = [], start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    for (var k = 0; k < 12; k++) months.push(localDay(new Date(start.getFullYear(), start.getMonth() + k, 1)).slice(0, 7));
    $('#view').innerHTML = '<section class="panel"><div class="section-head"><h3>甘特时间线 · 前后 12 个月</h3><span class="subtle">以任务开始 / 截止日期展示排期，非自动资源调度。</span></div>' + (items.length ? '<div class="timeline-scroll"><div class="timeline"><div class="timeline-head"><span>任务</span>' + months.map(function (m) { return '<span>' + esc(m.slice(0, 7)) + '</span>'; }).join('') + '</div>' + items.map(function (i) { var a = i.startDate || i.dueDate, b = i.dueDate || i.startDate; return '<div class="timeline-row"><span title="' + esc(i.subject) + '">#' + i.number + ' ' + esc(i.subject) + '</span>' + months.map(function (m) { var first = m + '-01', last = localDay(new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)), show = a <= last && b >= first; return '<span class="timeline-cell">' + (show ? '<i class="timeline-bar ' + (i.status === 'closed' ? 'done' : (i.dueDate && i.dueDate < today() && i.status !== 'resolved' ? 'over' : '')) + '" title="' + esc(a + ' 至 ' + b) + '"></i>' : '') + '</span>'; }).join('') + '</div>'; }).join('') + '</div></div>' : '<div class="muted-empty">给任务添加开始日期或截止日期，即可查看时间线</div>') + '</section>';
  }
  function renderCalendar() {
    var parts = calendarMonth.split('-').map(Number), year = parts[0], month = parts[1], firstWeekday = new Date(year, month - 1, 1).getDay(), total = new Date(year, month, 0).getDate(), previous = new Date(year, month - 1, 0).getDate(), cells = [];
    for (var i = 0; i < 42; i++) { var day = i - firstWeekday + 1, current = day >= 1 && day <= total, shown = current ? day : (day < 1 ? previous + day : day - total), date = year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0'), matches = current ? scopeIssues().filter(function (x) { return x.dueDate === date; }) : []; cells.push('<div class="calendar-cell ' + (!current ? 'other' : (date === today() ? 'today' : '')) + '"><strong>' + shown + '</strong>' + matches.slice(0, 3).map(function (x) { return '<button class="calendar-event" data-detail="' + esc(x.id) + '" title="' + esc(x.subject) + '">#' + x.number + ' ' + esc(x.subject) + '</button>'; }).join('') + (matches.length > 3 ? '<small class="subtle">另 ' + (matches.length - 3) + ' 项</small>' : '') + '</div>'); }
    $('#view').innerHTML = '<section class="panel"><div class="section-head"><h3>截止日期日历</h3><div class="calendar-controls"><button data-month="-1">←</button><strong>' + year + ' 年 ' + month + ' 月</strong><button data-month="1">→</button><button data-month="0">今天</button></div></div><div class="calendar-grid">' + ['日', '一', '二', '三', '四', '五', '六'].map(function (x) { return '<div class="calendar-day-name">周' + x + '</div>'; }).join('') + cells.join('') + '</div></section>';
  }
  function renderRoadmap() {
    var ids = allProjectIds(selectedProject), versions = data.versions.filter(function (v) { return ids.includes(v.projectId); }).sort(function (a, b) { return (a.dueDate || '9999').localeCompare(b.dueDate || '9999'); });
    $('#view').innerHTML = '<section class="panel"><div class="section-head"><h3>版本路线</h3><button data-action="new-version" ' + (!selectedProject ? 'disabled title="先选择项目"' : '') + '>＋ 新建版本</button></div>' + (versions.length ? versions.map(function (v) { var items = data.issues.filter(function (i) { return i.versionId === v.id; }), done = items.filter(function (i) { return ['resolved', 'closed'].includes(i.status); }).length, pct = items.length ? Math.round(done / items.length * 100) : 0; return '<div class="version-card"><div class="version-top"><div><h3>' + esc(v.name) + ' <span class="badge">' + esc(label('version', v.status)) + '</span></h3><div class="subtle">' + esc(projectName(v.projectId)) + ' · 计划 ' + shortDate(v.dueDate) + '</div></div><button data-edit-version="' + esc(v.id) + '">编辑</button></div><p>' + esc(v.description || '暂无版本说明') + '</p><div class="progress"><i style="width:' + pct + '%"></i></div><div class="subtle">完成 ' + done + ' / ' + items.length + ' 条任务 · ' + pct + '%</div>' + (items.length ? '<div class="mini-list" style="margin-top:12px">' + items.slice(0, 6).map(function (i) { return '<div class="mini-row"><button data-detail="' + esc(i.id) + '">#' + i.number + ' ' + esc(i.subject) + '</button><span class="badge ' + esc(i.status) + '">' + esc(label('status', i.status)) + '</span></div>'; }).join('') + '</div>' : '') + '</div>'; }).join('') : '<div class="muted-empty">还没有版本。选择项目后创建版本，再把任务关联到目标版本。</div>') + '</section>';
  }
  function renderTime() {
    var entries = scopeTime().slice().sort(function (a, b) { return b.date.localeCompare(a.date); }), total = entries.reduce(function (n, t) { return n + Number(t.hours); }, 0), byUser = {};
    entries.forEach(function (t) { byUser[t.user] = (byUser[t.user] || 0) + Number(t.hours); });
    $('#view').innerHTML = '<section class="panel"><div class="section-head"><h3>工时登记 · ' + total.toFixed(2) + ' 小时</h3><button data-action="new-time" ' + (!selectedProject ? 'disabled title="先选择项目"' : '') + '>＋ 登记工时</button></div>' + (entries.length ? '<div class="stats">' + Object.keys(byUser).sort().slice(0, 4).map(function (name) { return metric(name, byUser[name].toFixed(2) + ' h', '累计登记'); }).join('') + '</div><div class="table-scroll"><table class="data-table"><thead><tr><th>日期</th><th>人员</th><th>项目</th><th>关联任务</th><th>活动</th><th>时长</th><th>说明</th></tr></thead><tbody>' + entries.slice(0, 200).map(function (t) { return '<tr><td>' + esc(t.date) + '</td><td>' + esc(t.user) + '</td><td>' + esc(projectName(t.projectId)) + '</td><td>' + esc(issueName(t.issueId)) + '</td><td>' + esc(t.activity) + '</td><td>' + Number(t.hours).toFixed(2) + ' h</td><td>' + esc(t.note || '—') + '</td></tr>'; }).join('') + '</tbody></table></div>' + (entries.length > 200 ? '<p>这里只显示最近 200 条，完整数据包含在备份中。</p>' : '') : '<div class="muted-empty">选择项目后登记工作时长，可关联到具体任务单。</div>') + '</section>';
  }
  function renderWiki() {
    if (!selectedProject) { $('#view').innerHTML = '<section class="panel"><div class="muted-empty">请先选择一个项目，查看该项目的知识页。</div></section>'; return; }
    var pages = data.wiki.filter(function (w) { return w.projectId === selectedProject; }).sort(function (a, b) { return a.title.localeCompare(b.title, 'zh-CN'); });
    if (!pages.some(function (p) { return p.id === selectedWiki; })) selectedWiki = pages.length ? pages[0].id : '';
    var current = byId('wiki', selectedWiki);
    $('#view').innerHTML = '<section class="panel"><div class="section-head"><h3>项目知识页</h3><button data-action="new-wiki">＋ 新建知识页</button></div><div class="wiki-layout"><div class="wiki-list">' + (pages.length ? pages.map(function (w) { return '<button data-wiki="' + esc(w.id) + '" class="' + (w.id === selectedWiki ? 'active' : '') + '">' + esc(w.title) + '</button>'; }).join('') : '<div class="subtle">暂无知识页</div>') + '</div><div>' + (current ? '<div class="section-head"><div><h3>' + esc(current.title) + '</h3><small class="subtle">更新于 ' + stamp(current.updatedAt) + '</small></div><button data-edit-wiki="' + esc(current.id) + '">编辑</button></div><div class="wiki-body">' + txt(current.body) + '</div>' : '<div class="muted-empty">用知识页保存项目约定、操作说明或会议纪要，内容为纯文本。</div>') + '</div></div></section>';
  }
  function showDialog(selector) { $(selector).showModal(); }
  function closeDialog(selector) { $(selector).close(); }
  function formValues(form) { return Object.fromEntries(new FormData(form).entries()); }
  function fill(form, values) { Object.keys(values).forEach(function (k) { var control = form.elements.namedItem(k); if (control) control.value = Array.isArray(values[k]) ? values[k].join(k === 'members' ? '\n' : ', ') : (values[k] == null ? '' : values[k]); }); }
  function openProject(id) {
    editingProject = id || ''; var form = $('#project-form'); form.reset();
    var current = byId('projects', id);
    setOptions(form.elements.parentId, data.projects.filter(function (p) { return p.id !== id; }), current ? current.parentId : '', '<option value="">无 · 顶层项目</option>');
    if (current) fill(form, current);
    $('#project-dialog-title').textContent = current ? '编辑项目' : '新建项目';
    showDialog('#project-dialog');
  }
  function issueDependencies(form, projectId, current) {
    if(M.agile){var status=current?current.status:'new',workflow=M.agile.workflow(data,projectId);form.elements.status.replaceChildren();workflow.columns.forEach(function(c){var o=new Option(c.name,c.code);if(current&&current.status!==c.code&&!workflow.columns.find(function(s){return s.code===current.status;}).targets.includes(c.code))o.disabled=true;form.elements.status.add(o);});form.elements.status.value=status;}
    var project = byId('projects', projectId), versions = data.versions.filter(function (v) { return v.projectId === projectId; }), issues = data.issues.filter(function (i) { return i.projectId === projectId && i.id !== editingIssue; });
    setOptions(form.elements.versionId, versions, current ? current.versionId : '', '<option value="">未指定</option>');
    setOptions(form.elements.parentId, issues.map(function (i) { return { id: i.id, name: '#' + i.number + ' ' + i.subject }; }), current ? current.parentId : '', '<option value="">无</option>');
    $('#member-suggestions').innerHTML = project ? project.members.map(function (m) { return '<option value="' + esc(m.split(' · ')[0]) + '"></option>'; }).join('') : '';
    $('#category-suggestions').innerHTML = project ? project.categories.map(function (c) { return '<option value="' + esc(c) + '"></option>'; }).join('') : '';
  }
  function openIssue(id) {
    editingIssue = id || ''; var form = $('#issue-form'); form.reset();
    var current = byId('issues', id), projects = data.projects.filter(function (p) { return p.status === 'active' || (current && p.id === current.projectId); });
    if (!projects.length) { toast('请先创建一个进行中的项目', true); return; }
    var projectId = current ? current.projectId : (selectedProject && byId('projects', selectedProject).status === 'active' ? selectedProject : projects[0].id);
    setOptions(form.elements.projectId, projects, projectId, '');
    issueDependencies(form, projectId, current);
    if (current) fill(form, current);
    $('#issue-dialog-title').textContent = current ? '编辑任务单 #' + current.number : '新建任务单';
    window.dispatchEvent(new CustomEvent('yj-issue-open',{detail:{id:id||'',projectId:projectId}}));
    showDialog('#issue-dialog');
  }
  function openVersion(id) {
    if (!selectedProject) { toast('请先选择项目', true); return; }
    editingVersion = id || ''; var form = $('#version-form'); form.reset(); var current = byId('versions', id);
    if (current) fill(form, current);
    $('#version-dialog-title').textContent = current ? '编辑版本' : '新建版本'; showDialog('#version-dialog');
  }
  function openTime(issueId) {
    var projectId = issueId ? byId('issues', issueId).projectId : selectedProject;
    if (!projectId) { toast('请先选择项目', true); return; }
    $('#time-form').reset(); $('#time-form').elements.date.value = today();
    setOptions($('#time-form').elements.issueId, data.issues.filter(function (i) { return i.projectId === projectId; }).map(function (i) { return { id: i.id, name: '#' + i.number + ' ' + i.subject }; }), issueId || '', '<option value="">项目级工时</option>');
    $('#time-form').dataset.projectId = projectId; showDialog('#time-dialog');
  }
  function openWiki(id) {
    if (!selectedProject) return;
    editingWiki = id || ''; var form = $('#wiki-form'); form.reset(), current = byId('wiki', id);
    if (current) fill(form, current);
    $('#wiki-dialog-title').textContent = current ? '编辑知识页' : '新建知识页'; showDialog('#wiki-dialog');
  }
  function showDetail(issueId) {
    var i = byId('issues', issueId); if (!i) return; detailIssue = issueId;
    var comments = data.comments.filter(function (c) { return c.issueId === issueId; }), children = data.issues.filter(function (x) { return x.parentId === issueId; }), hours = data.timeEntries.filter(function (t) { return t.issueId === issueId; }).reduce(function (n, t) { return n + Number(t.hours); }, 0), version = byId('versions', i.versionId);
    $('#detail-content').innerHTML = '<div class="section-head"><div><span class="eyebrow">' + esc(projectName(i.projectId)) + ' · #' + i.number + '</span><h2>' + esc(i.subject) + '</h2></div><button data-close-detail>关闭 ×</button></div><div class="row"><span class="badge ' + esc(i.status) + '">' + esc(label('status', i.status)) + '</span><span class="badge ' + esc(i.priority) + '">' + esc(label('priority', i.priority)) + '</span><span class="badge">' + esc(label('tracker', i.tracker)) + '</span></div><div class="detail-meta"><div><span>负责人</span><strong>' + esc(i.assignee || '未指派') + '</strong></div><div><span>目标版本</span><strong>' + esc(version ? version.name : '未指定') + '</strong></div><div><span>截止日期</span><strong>' + shortDate(i.dueDate) + '</strong></div><div><span>进度</span><strong>' + Number(i.doneRatio) + '%</strong></div><div><span>预估 / 已登记</span><strong>' + Number(i.estimatedHours) + ' / ' + hours.toFixed(2) + ' 小时</strong></div><div><span>上级任务</span><strong>' + esc(issueName(i.parentId)) + '</strong></div></div><div class="detail-block"><h3>详细说明</h3><div class="detail-description">' + (i.description ? txt(i.description) : '<span class="subtle">暂无说明</span>') + '</div></div>' + (children.length ? '<div class="detail-block"><h3>子任务</h3><div class="mini-list">' + children.map(function (x) { return '<div class="mini-row"><button data-detail="' + esc(x.id) + '">#' + x.number + ' ' + esc(x.subject) + '</button><span class="badge ' + esc(x.status) + '">' + esc(label('status', x.status)) + '</span></div>'; }).join('') + '</div></div>' : '') + '<div class="detail-block"><h3>评论 · ' + comments.length + '</h3>' + (comments.length ? comments.map(function (c) { return '<div class="comment"><strong>' + esc(c.author) + '</strong> <small>' + stamp(c.at) + '</small><div class="detail-description">' + txt(c.text) + '</div></div>'; }).join('') : '<p class="subtle">还没有评论</p>') + '<form id="comment-form" class="comment-form"><input name="author" maxlength="80" placeholder="你的名字（可选）"><textarea name="text" maxlength="5000" rows="3" required placeholder="记录讨论结果、验收结论…"></textarea><button class="primary" type="submit">添加评论</button></form></div><div class="dialog-actions"><button data-add-time="' + esc(i.id) + '">＋ 登记工时</button><button data-edit-issue="' + esc(i.id) + '">编辑任务</button><button data-delete-issue="' + esc(i.id) + '" class="danger">删除任务</button></div>';
    var related = data.relations.filter(function (r) { return r.issueId === issueId || r.targetId === issueId; }), otherIssues = data.issues.filter(function (x) { return x.projectId === i.projectId && x.id !== issueId && !related.some(function (r) { return r.issueId === x.id || r.targetId === x.id; }); }), history = data.activity.filter(function (a) { return a.issueId === issueId; }).slice(0, 12);
    var relationHtml = '<div class="detail-block"><h3>关联任务 · ' + related.length + '</h3>' + (related.length ? '<div class="mini-list">' + related.map(function (r) { var other = byId('issues', r.issueId === issueId ? r.targetId : r.issueId), relationLabel = { related: '相关', blocks: r.issueId === issueId ? '阻塞' : '被阻塞于', precedes: r.issueId === issueId ? '先于' : '后于' }[r.kind]; return '<div class="mini-row"><span><span class="badge">' + relationLabel + '</span> #' + other.number + ' ' + esc(other.subject) + '</span><button data-remove-relation="' + esc(r.id) + '" aria-label="移除关联">移除</button></div>'; }).join('') + '</div>' : '<p class="subtle">暂无关联任务</p>') + (otherIssues.length ? '<form id="relation-form" class="row"><select name="targetId" required aria-label="选择关联任务"><option value="">选择任务</option>' + otherIssues.map(function (x) { return option(x.id, '#' + x.number + ' ' + x.subject, ''); }).join('') + '</select><select name="kind" aria-label="关联类型"><option value="related">相关</option><option value="blocks">阻塞目标</option><option value="precedes">先于目标</option></select><button type="submit">添加关联</button></form>' : '') + '</div><div class="detail-block"><h3>变更历史</h3>' + (history.length ? '<div class="mini-list">' + history.map(function (a) { return '<div class="mini-row"><span>' + esc(a.text) + '</span><small>' + stamp(a.at) + '</small></div>'; }).join('') + '</div>' : '<p class="subtle">暂无变更</p>') + '</div>';
    $('#detail-content .dialog-actions').insertAdjacentHTML('beforebegin', relationHtml);
    if (!$('#detail-dialog').open) {if(window.innerWidth>=1000)$('#detail-dialog').show();else showDialog('#detail-dialog');}
  }
  function exportCsv() {
    var rows = [['编号', '项目', '主题', '类型', '状态', '优先级', '负责人', '开始日期', '截止日期', '预估工时', '进度', '版本', '分类', '标签', '说明']];
    filteredIssues().forEach(function (i) { var v = byId('versions', i.versionId); rows.push([i.number, projectName(i.projectId), i.subject, label('tracker', i.tracker), label('status', i.status), label('priority', i.priority), i.assignee, i.startDate, i.dueDate, i.estimatedHours, i.doneRatio, v ? v.name : '', i.category, i.tags.join('、'), i.description]); });
    download('项目任务-' + today() + '.csv', '\ufeff' + rows.map(function (row) { return row.map(function (cell) { return '"' + String(cell == null ? '' : cell).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n'), 'text/csv;charset=utf-8');
  }
  function bind() {
    $('#new-project').addEventListener('click', function () { openProject(); });
    $('#new-issue').addEventListener('click', function () { openIssue(); });
    $('#edit-project').addEventListener('click', function () { openProject(selectedProject); });
    $('#new-version').addEventListener('click', function () { openVersion(); });
    $('#project-search').addEventListener('input', renderSidebar);
    $('#all-projects').addEventListener('click', function () { selectedProject = ''; render(); });
    $$('[data-view]').forEach(function (b) { b.addEventListener('click', function () { view = b.dataset.view; render(); }); });
    $('#export-backup').addEventListener('click', function () { if(storageInvalid){download('项目原始记录-待检查-'+today()+'.json',localStorage.getItem(KEY)||'','application/json;charset=utf-8');toast('原始记录已下载，尚未覆盖');return;}download('项目管理完整备份-' + today() + '.json', JSON.stringify({ app: 'yj-project-desk', exportedAt: new Date().toISOString(), data: data }, null, 2), 'application/json;charset=utf-8'); toast('完整备份已开始下载'); });
    $('#import-backup').addEventListener('change', async function (event) {
      var file = event.target.files[0]; event.target.value = ''; if (!file) return;
      if (file.size > 20 * 1024 * 1024) { toast('备份文件超过 20 MB，请检查文件', true); return; }
      try { var parsed=JSON.parse(await file.text());if(parsed.app!=='yj-project-desk')throw Error('不是本工具备份');await RecordCare.preview('projects',parsed.data); } catch(error){toast('未导入：'+error.message,true);}
    });
    $('#demo-data').addEventListener('click', function () { if (data.projects.length && !confirm('载入虚构示例会替换当前项目数据。请先导出备份。确认继续？')) return; if(storageInvalid||localStorage.getItem(KEY)!==lastDisk){toast('本机记录已变化，请先处理冲突',true);return;}data = M.demo(); selectedProject = data.projects[0].id; commit('已载入虚构示例'); });
    $$('dialog [data-close]').forEach(function (button) { button.addEventListener('click', function () { button.closest('dialog').close(); }); });
    $('#project-form').addEventListener('submit', function (e) { e.preventDefault(); try { var p = M.upsertProject(data, formValues(e.target), editingProject); selectedProject = p.id; closeDialog('#project-dialog'); commit('项目已保存'); } catch (error) { toast(error.message, true); } });
    $('#issue-form').elements.projectId.addEventListener('change', function (e) { issueDependencies($('#issue-form'), e.target.value, null); });
    $('#issue-form').addEventListener('submit', function (e) { e.preventDefault(); try { var i = M.upsertIssue(data, formValues(e.target), editingIssue); selectedProject = i.projectId; closeDialog('#issue-dialog'); commit('任务单已保存'); if (detailIssue === i.id && $('#detail-dialog').open) showDetail(i.id); } catch (error) { toast(error.message, true); } });
    $('#version-form').addEventListener('submit', function (e) { e.preventDefault(); try { M.upsertVersion(data, formValues(e.target), editingVersion, selectedProject); closeDialog('#version-dialog'); commit('版本已保存'); } catch (error) { toast(error.message, true); } });
    $('#time-form').addEventListener('submit', function (e) { e.preventDefault(); try { M.addTime(data, formValues(e.target), e.target.dataset.projectId); closeDialog('#time-dialog'); commit('工时已登记'); if (detailIssue && $('#detail-dialog').open) showDetail(detailIssue); } catch (error) { toast(error.message, true); } });
    $('#wiki-form').addEventListener('submit', function (e) { e.preventDefault(); try { var w = M.upsertWiki(data, formValues(e.target), editingWiki, selectedProject); selectedWiki = w.id; closeDialog('#wiki-dialog'); commit('知识页已保存'); } catch (error) { toast(error.message, true); } });
    $('#detail-dialog').addEventListener('submit', function (e) { if (e.target.id === 'comment-form') { e.preventDefault(); try { M.addComment(data, detailIssue, e.target.elements.author.value, e.target.elements.text.value); if(save()){showDetail(detailIssue);render();toast('评论已添加');} } catch (error) { toast(error.message, true); } } if (e.target.id === 'relation-form') { e.preventDefault(); try { M.addRelation(data, detailIssue, e.target.elements.targetId.value, e.target.elements.kind.value); if(save()){showDetail(detailIssue);render();toast('任务关联已添加');} } catch (error) { toast(error.message, true); } } });
    document.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.project) { selectedProject = b.dataset.project; selectedWiki = ''; render(); }
      if (b.dataset.view) return;
      if (b.dataset.jump) { view = b.dataset.jump; render(); }
      if (b.dataset.detail) showDetail(b.dataset.detail);
      if (b.dataset.wiki) { selectedWiki = b.dataset.wiki; renderWiki(); }
      if (b.dataset.editWiki) openWiki(b.dataset.editWiki);
      if (b.dataset.editVersion) { selectedProject = byId('versions', b.dataset.editVersion).projectId; openVersion(b.dataset.editVersion); }
      if (b.dataset.editIssue) { closeDialog('#detail-dialog'); openIssue(b.dataset.editIssue); }
      if (b.dataset.addTime) openTime(b.dataset.addTime);
      if (b.dataset.closeDetail !== undefined) closeDialog('#detail-dialog');
      if (b.dataset.deleteIssue) { var i = byId('issues', b.dataset.deleteIssue); if (confirm('移入回收站 #' + i.number + '「' + i.subject + '」及其评论、关联？可以从回收站恢复。')) try { M.deleteIssue(data, i.id); closeDialog('#detail-dialog'); commit('任务单已移入回收站'); } catch (error) { toast(error.message, true); } }
      if (b.dataset.removeRelation) { try { M.removeRelation(data, b.dataset.removeRelation); save(); showDetail(detailIssue); render(); toast('任务关联已移除'); } catch (error) { toast(error.message, true); } }
      if (b.dataset.page) { issuePage += Number(b.dataset.page); renderIssues(); }
      if (b.dataset.month) { var parts = calendarMonth.split('-').map(Number), next = b.dataset.month === '0' ? new Date() : new Date(parts[0], parts[1] - 1 + Number(b.dataset.month), 1); calendarMonth = next.getFullYear() + '-' + String(next.getMonth() + 1).padStart(2, '0'); renderCalendar(); }
      if (b.dataset.action === 'new-project') openProject();
      if (b.dataset.action === 'new-issue') openIssue();
      if (b.dataset.action === 'new-version') openVersion();
      if (b.dataset.action === 'new-time') openTime();
      if (b.dataset.action === 'new-wiki') openWiki();
      if (b.dataset.action === 'csv') exportCsv();
      if (b.dataset.action === 'clear-filters') { filters = { q: '', status: '', tracker: '', assignee: '', priority: '' }; issuePage = 1; renderIssues(); }
    });
    document.addEventListener('input', function (e) { if (e.target.id === 'filter-q') { filters.q = e.target.value; issuePage = 1; var pos = e.target.selectionStart; renderIssues(); var input = $('#filter-q'); input.focus(); input.setSelectionRange(pos, pos); } });
    document.addEventListener('change', function (e) {
      var id = e.target.id; if (id.startsWith('filter-') && id !== 'filter-q') { filters[id.slice(7)] = e.target.value; issuePage = 1; renderIssues(); }
      if (e.target.dataset.changeStatus) { try { var i = byId('issues', e.target.dataset.changeStatus); M.upsertIssue(data, Object.assign({}, i, { status: e.target.value }), i.id); commit('任务状态已更新'); } catch (error) { toast(error.message, true); } }
    });
    document.addEventListener('dragstart', function (e) { var card = e.target.closest('[data-drag]'); if (card && card.draggable) e.dataTransfer.setData('text/plain', card.dataset.drag); });
    document.addEventListener('dragover', function (e) { if (e.target.closest('[data-drop]')) e.preventDefault(); });
    document.addEventListener('drop', function (e) { var col = e.target.closest('[data-drop]'); if (!col) return; e.preventDefault(); var i = byId('issues', e.dataTransfer.getData('text/plain')); if (!i || i.status === col.dataset.drop) return; try { M.upsertIssue(data, Object.assign({}, i, { status: col.dataset.drop }), i.id); commit('任务状态已更新'); } catch (error) { toast(error.message, true); } });
  }
  try { var stored = localStorage.getItem(KEY);lastDisk=stored; if (stored) data = M.validate(JSON.parse(stored));lastSaved=JSON.stringify(data); } catch (error) { storageInvalid=true;setTimeout(function () { toast('本地数据读取失败，禁止覆盖原记录。请下载原始记录后检查或恢复有效备份。', true); }, 200); }
  var compactQuery = window.matchMedia('(max-width: 720px)');
  $('#data-tools').open = !compactQuery.matches;
  compactQuery.addEventListener('change', function (e) { $('#data-tools').open = !e.matches; });
  bind(); render();
  window.ProjectDesk={state:function(){return JSON.parse(JSON.stringify(data));},selected:function(){return selectedProject;},update:function(fn){if(storageInvalid||localStorage.getItem(KEY)!==lastDisk)throw Error('本机记录已变化，请先导出并载入最新版本');var next=JSON.parse(JSON.stringify(data));fn(next);M.validate(next);var previous=data;data=next;if(!save()){data=previous;throw Error('保存失败，未应用本批修改，请下载现有完整备份');}render();},backup:function(){$('#export-backup').click();},openIssue:openIssue,detail:showDetail,navigate:function(name){view=name;render();},registerView:function(name,fn){customViews[name]=fn;},refresh:render};
  RecordCare.mount({kind:'projects',name:'项目管理',key:KEY,get:()=>JSON.parse(JSON.stringify(data)),raw:()=>lastDisk,blocked:()=>storageInvalid,validate:M.validate,
  apply:(next,repair=false)=>{if((storageInvalid&&!repair)||localStorage.getItem(KEY)!==lastDisk)throw Error('本机记录已变化，未覆盖');const checked=M.validate(next),serialized=JSON.stringify(checked);localStorage.setItem(KEY,serialized);data=checked;storageInvalid=false;lastDisk=serialized;lastSaved=serialized;selectedProject='';render()},
  reload:()=>{const fresh=localStorage.getItem(KEY),next=fresh?M.validate(JSON.parse(fresh)):M.validate(M.empty());data=next;lastDisk=fresh;lastSaved=JSON.stringify(data);storageInvalid=false;document.querySelectorAll('dialog[open]').forEach(d=>d.close());selectedProject='';render()}});
})();
