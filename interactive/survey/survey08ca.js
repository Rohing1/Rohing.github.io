'use strict';

(function () {
  const STORAGE_KEY = 'yj-local-survey-v1';
  const MAX_QUESTIONS = 50;
  const typeNames = { single: '单选', multiple: '多选', rating: '评分', short: '简答', long: '长文本' };
  const defaultState = () => ({
    version: 1,
    form: {
      title: '培训满意度调查',
      description: '预计用时 2 分钟。答卷只保存在这台设备的当前浏览器中。',
      thanks: '感谢填写，请将设备交给下一位。',
      questions: [
        { id: id(), type: 'rating', title: '您对本次培训的整体满意度如何？', required: true, options: [] },
        { id: id(), type: 'single', title: '课程内容是否符合您的实际需要？', required: true, options: ['非常符合', '比较符合', '一般', '不太符合', '完全不符合'] },
        { id: id(), type: 'multiple', title: '哪些方面对您最有帮助？', required: false, options: ['知识讲解', '案例演示', '动手练习', '答疑交流'] },
        { id: id(), type: 'long', title: '您还有哪些建议？', required: false, options: [] }
      ]
    },
    responses: [],
    updatedAt: new Date().toISOString()
  });

  function id() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function cleanText(value, max) {
    return String(value || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, max);
  }

  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || !raw.form) throw new Error('备份结构不正确');
    const questions = Array.isArray(raw.form.questions) ? raw.form.questions.slice(0, MAX_QUESTIONS).map(function (q) {
      const type = Object.prototype.hasOwnProperty.call(typeNames, q.type) ? q.type : 'short';
      return {
        id: cleanText(q.id, 80) || id(), type: type,
        title: cleanText(q.title, 160) || '未命名题目', required: Boolean(q.required),
        options: ['single', 'multiple'].includes(type) && Array.isArray(q.options)
          ? q.options.map(v => cleanText(v, 80).trim()).filter(Boolean).slice(0, 50) : []
      };
    }) : [];
    const validIds = new Set(questions.map(q => q.id));
    const responses = Array.isArray(raw.responses) ? raw.responses.slice(-5000).map(function (r) {
      const answers = {};
      if (r.answers && typeof r.answers === 'object') {
        Object.entries(r.answers).forEach(function ([key, value]) {
          if (!validIds.has(key)) return;
          answers[key] = Array.isArray(value) ? value.map(v => cleanText(v, 500)).slice(0, 50) : cleanText(value, 4000);
        });
      }
      return { id: cleanText(r.id, 80) || id(), createdAt: r.createdAt || new Date().toISOString(), answers: answers };
    }) : [];
    return {
      version: 1,
      form: {
        title: cleanText(raw.form.title, 80) || '未命名问卷',
        description: cleanText(raw.form.description, 500),
        thanks: cleanText(raw.form.thanks, 120) || '感谢填写。',
        questions: questions
      }, responses: responses, updatedAt: raw.updatedAt || new Date().toISOString()
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? normalize(JSON.parse(raw)) : defaultState();
    } catch (_) { return defaultState(); }
  }

  let state = load();
  let activeTab = 'edit';
  let saveTimer = 0;
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function persist(message) {
    state.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      const label = $('#save-state');
      label.textContent = message || '已自动保存到当前浏览器';
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { label.textContent = '已启用本机自动保存'; }, 2200);
    } catch (_) {
      $('#save-state').textContent = '保存失败：浏览器空间可能不足，请立即导出备份';
    }
  }

  function download(name, content, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: type || 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function switchTab(name) {
    activeTab = name;
    document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('[data-view]').forEach(v => { v.hidden = v.dataset.view !== name; });
    if (name === 'fill') renderFill();
    if (name === 'results') renderResults();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateBasics() {
    state.form.title = cleanText($('#survey-title').value, 80);
    state.form.description = cleanText($('#survey-description').value, 500);
    state.form.thanks = cleanText($('#survey-thanks').value, 120);
    persist(); renderPreview();
  }

  function questionTemplate(q, index) {
    const options = ['single', 'multiple'].includes(q.type) ? `<label class="question-options">选项（每行一个）<textarea rows="4" data-field="options" maxlength="4000">${esc(q.options.join('\n'))}</textarea></label>` : '';
    return `<article class="question-card" data-id="${esc(q.id)}"><div class="question-card__top"><strong>第 ${index + 1} 题 · ${typeNames[q.type]}</strong><div class="question-card__actions"><button type="button" data-action="up" aria-label="上移">↑</button><button type="button" data-action="down" aria-label="下移">↓</button><button type="button" data-action="duplicate">复制</button><button type="button" data-action="delete" class="danger">删除</button></div></div><div class="question-grid"><label>题目<input data-field="title" maxlength="160" value="${esc(q.title)}"></label><label>题型<select data-field="type">${Object.entries(typeNames).map(([value, label]) => `<option value="${value}"${q.type === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label></div>${options}<label class="check question-required"><input type="checkbox" data-field="required"${q.required ? ' checked' : ''}> 必填题</label></article>`;
  }

  function renderQuestions() {
    const list = $('#question-list');
    list.innerHTML = state.form.questions.length ? state.form.questions.map(questionTemplate).join('') : '<div class="question-empty">还没有题目，请从下方选择一种题型。</div>';
    $('#question-count').textContent = state.form.questions.length + ' 题';
    $('#metric-questions').textContent = state.form.questions.length;
    renderPreview();
  }

  function renderPreview() {
    const root = $('#builder-preview');
    root.innerHTML = `<div class="preview-sheet"><h3>${esc(state.form.title || '未命名问卷')}</h3><p class="muted">${esc(state.form.description || '尚未填写问卷说明')}</p>${state.form.questions.map(function (q, index) {
      let body = '';
      if (q.type === 'single' || q.type === 'multiple') body = (q.options.length ? q.options : ['请先填写选项']).slice(0, 5).map(v => `<span class="fake-option"><i class="${q.type === 'single' ? 'fake-dot' : 'fake-box'}"></i>${esc(v)}</span>`).join('');
      else if (q.type === 'rating') body = `<div class="fake-rating">${[1,2,3,4,5].map(n => `<span>${n}</span>`).join('')}</div>`;
      else body = `<div class="fake-option"><span>${q.type === 'long' ? '长文本输入区域' : '文本输入框'}</span></div>`;
      return `<div class="preview-question"><strong>${index + 1}. ${esc(q.title)}${q.required ? '<span class="required-mark">*</span>' : ''}</strong>${body}</div>`;
    }).join('') || '<div class="question-empty">添加题目后将在这里预览。</div>'}</div>`;
    $('#response-count-tab').textContent = state.responses.length;
  }

  function addQuestion(type) {
    if (state.form.questions.length >= MAX_QUESTIONS) return alert('最多支持 ' + MAX_QUESTIONS + ' 道题。');
    const q = { id: id(), type: type, title: type === 'rating' ? '请为这一项评分' : '请输入题目', required: false, options: ['single', 'multiple'].includes(type) ? ['选项一', '选项二'] : [] };
    state.form.questions.push(q); persist(); renderQuestions();
    document.querySelector(`[data-id="${q.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function changeQuestion(card, target) {
    const q = state.form.questions.find(x => x.id === card.dataset.id); if (!q) return;
    if (target.dataset.field === 'title') q.title = cleanText(target.value, 160);
    if (target.dataset.field === 'required') q.required = target.checked;
    if (target.dataset.field === 'options') q.options = target.value.split(/\r?\n/).map(v => cleanText(v, 80).trim()).filter(Boolean).slice(0, 50);
    if (target.dataset.field === 'type') {
      q.type = target.value;
      q.options = ['single', 'multiple'].includes(q.type) ? (q.options.length ? q.options : ['选项一', '选项二']) : [];
      renderQuestions();
    }
    persist(); renderPreview();
  }

  function actionQuestion(card, action) {
    const index = state.form.questions.findIndex(q => q.id === card.dataset.id); if (index < 0) return;
    if (action === 'delete') state.form.questions.splice(index, 1);
    if (action === 'up' && index > 0) [state.form.questions[index - 1], state.form.questions[index]] = [state.form.questions[index], state.form.questions[index - 1]];
    if (action === 'down' && index < state.form.questions.length - 1) [state.form.questions[index + 1], state.form.questions[index]] = [state.form.questions[index], state.form.questions[index + 1]];
    if (action === 'duplicate' && state.form.questions.length < MAX_QUESTIONS) state.form.questions.splice(index + 1, 0, { ...state.form.questions[index], id: id(), options: state.form.questions[index].options.slice(), title: state.form.questions[index].title + '（副本）' });
    persist(); renderQuestions();
  }

  function renderFill() {
    $('#fill-title').textContent = state.form.title || '未命名问卷';
    $('#fill-description').textContent = state.form.description;
    $('#fill-status').textContent = '';
    const form = $('#response-form');
    form.hidden = false;
    $('#fill-actions').hidden = false;
    $('#fill-complete').hidden = true;
    form.innerHTML = state.form.questions.map(function (q, index) {
      const required = q.required ? ' required' : '';
      let input = '';
      if (q.type === 'single') input = `<div class="response-options">${q.options.map((v, i) => `<label><input type="radio" name="${q.id}" value="${esc(v)}"${i === 0 && q.required ? required : ''}> <span>${esc(v)}</span></label>`).join('')}</div>`;
      if (q.type === 'multiple') input = `<div class="response-options">${q.options.map(v => `<label><input type="checkbox" name="${q.id}" value="${esc(v)}"> <span>${esc(v)}</span></label>`).join('')}</div>`;
      if (q.type === 'rating') input = `<div class="response-options rating-options">${[1,2,3,4,5].map((n, i) => `<label><input type="radio" name="${q.id}" value="${n}"${i === 0 && q.required ? required : ''}> ${n}</label>`).join('')}</div>`;
      if (q.type === 'short') input = `<input type="text" name="${q.id}" maxlength="500"${required}>`;
      if (q.type === 'long') input = `<textarea name="${q.id}" rows="5" maxlength="4000"${required}></textarea>`;
      return `<section class="response-question"><h3>${index + 1}. ${esc(q.title)}${q.required ? '<span class="required-mark">*</span>' : ''}</h3>${input}</section>`;
    }).join('') || '<div class="question-empty">当前问卷没有题目，请先返回设计。</div>';
  }

  function submitResponse(event) {
    event.preventDefault();
    if (!state.form.questions.length) return;
    for (const q of state.form.questions.filter(q => q.type === 'multiple' && q.required)) {
      const checkboxes = [...event.currentTarget.querySelectorAll(`[name="${CSS.escape(q.id)}"]`)];
      if (!checkboxes.some(c => c.checked)) {
        alert('请完成必填多选题：' + q.title);
        checkboxes[0]?.focus();
        return;
      }
    }
    if (!event.currentTarget.reportValidity()) return;
    const data = new FormData(event.currentTarget); const answers = {};
    state.form.questions.forEach(function (q) {
      const values = data.getAll(q.id).map(v => cleanText(v, q.type === 'long' ? 4000 : 500));
      answers[q.id] = q.type === 'multiple' ? values : (values[0] || '');
    });
    state.responses.push({ id: id(), createdAt: new Date().toISOString(), answers: answers });
    persist('答卷已保存到当前浏览器');
    event.currentTarget.reset();
    event.currentTarget.hidden = true;
    $('#fill-actions').hidden = true;
    $('#fill-complete-message').textContent = state.form.thanks || '感谢填写。';
    $('#fill-complete-count').textContent = `这是当前浏览器保存的第 ${state.responses.length} 份答卷。请将设备交给下一位。`;
    $('#fill-complete').hidden = false;
    $('#response-count-tab').textContent = state.responses.length;
    $('#next-response').focus();
  }

  function startNextResponse() {
    renderFill();
    $('.fill-shell').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => $('#response-form').querySelector('input, textarea')?.focus(), 250);
  }

  function answerSummary(response) {
    return state.form.questions.slice(0, 3).map(q => {
      const value = response.answers[q.id];
      return Array.isArray(value) ? value.join('、') : value;
    }).filter(Boolean).join('；').slice(0, 160) || '未填写可摘要内容';
  }

  function resultCard(q) {
    const answers = state.responses.map(r => r.answers[q.id]).filter(v => Array.isArray(v) ? v.length : String(v || '').trim());
    if (q.type === 'short' || q.type === 'long') {
      return `<article class="result-card"><h3>${esc(q.title)}</h3><p class="hint">${answers.length} 条文本回答</p>${answers.slice(-8).reverse().map(v => `<div class="text-answer">${esc(v)}</div>`).join('') || '<p class="muted">暂无回答</p>'}</article>`;
    }
    const labels = q.type === 'rating' ? ['1','2','3','4','5'] : q.options;
    const counts = Object.fromEntries(labels.map(v => [v, 0]));
    answers.forEach(v => (Array.isArray(v) ? v : [v]).forEach(x => { if (Object.prototype.hasOwnProperty.call(counts, x)) counts[x]++; }));
    const total = q.type === 'multiple' ? state.responses.length : answers.length;
    const avg = q.type === 'rating' && answers.length ? (answers.reduce((sum, v) => sum + Number(v), 0) / answers.length).toFixed(2) : '';
    return `<article class="result-card"><h3>${esc(q.title)}</h3><p class="hint">${answers.length} 份有效回答${avg ? ' · 平均 ' + avg + ' 分' : ''}</p>${labels.map(label => { const count = counts[label] || 0; const percent = total ? Math.round(count / total * 100) : 0; return `<div class="bar-row"><span title="${esc(label)}">${esc(label)}</span><i class="bar-track"><i class="bar-fill" style="width:${percent}%"></i></i><b>${count} · ${percent}%</b></div>`; }).join('')}</article>`;
  }

  function renderResults() {
    $('#metric-responses').textContent = state.responses.length;
    $('#metric-questions').textContent = state.form.questions.length;
    const latest = state.responses[state.responses.length - 1];
    $('#metric-latest').textContent = latest ? new Date(latest.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '—';
    $('#metric-latest-date').textContent = latest ? new Date(latest.createdAt).toLocaleDateString('zh-CN') : '还没有答卷';
    $('#result-charts').innerHTML = state.responses.length ? state.form.questions.map(resultCard).join('') : '<div class="empty-result">还没有本机答卷。切换到“现场填写”，提交后即可查看统计。</div>';
    $('#response-rows').innerHTML = state.responses.slice().reverse().map(r => `<tr data-response-id="${esc(r.id)}"><td>${esc(new Date(r.createdAt).toLocaleString('zh-CN'))}</td><td>${esc(answerSummary(r))}</td><td><button type="button" class="danger" data-delete-response>删除</button></td></tr>`).join('') || '<tr><td colspan="3">暂无答卷</td></tr>';
    $('#response-count-tab').textContent = state.responses.length;
  }

  function exportCsv() {
    if (!state.responses.length) return alert('当前还没有答卷。');
    const headers = ['提交时间', ...state.form.questions.map(q => q.title)];
    const rows = state.responses.map(r => [new Date(r.createdAt).toLocaleString('zh-CN'), ...state.form.questions.map(q => Array.isArray(r.answers[q.id]) ? r.answers[q.id].join('|') : (r.answers[q.id] || ''))]);
    const csv = '\ufeff' + [headers, ...rows].map(row => row.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\r\n');
    download('本地问卷答卷-' + new Date().toISOString().slice(0, 10) + '.csv', csv, 'text/csv;charset=utf-8');
  }

  function bind() {
    $('#survey-title').value = state.form.title; $('#survey-description').value = state.form.description; $('#survey-thanks').value = state.form.thanks;
    ['#survey-title','#survey-description','#survey-thanks'].forEach(s => $(s).addEventListener('input', updateBasics));
    document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.go)));
    $('#open-fill').addEventListener('click', () => switchTab('fill'));
    document.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => addQuestion(b.dataset.add)));
    $('#question-list').addEventListener('input', e => { const card = e.target.closest('.question-card'); if (card) changeQuestion(card, e.target); });
    $('#question-list').addEventListener('change', e => { const card = e.target.closest('.question-card'); if (card) changeQuestion(card, e.target); });
    $('#question-list').addEventListener('click', e => { const button = e.target.closest('[data-action]'); const card = e.target.closest('.question-card'); if (button && card) actionQuestion(card, button.dataset.action); });
    $('#response-form').addEventListener('submit', submitResponse);
    $('#next-response').addEventListener('click', startNextResponse);
    $('#fill-fullscreen').addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('.fill-shell').requestFullscreen(); } catch (_) { alert('当前浏览器未允许全屏。'); } });
    $('#refresh-results').addEventListener('click', renderResults);
    $('#backup').addEventListener('click', () => download('本地问卷完整备份-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify({ ...state, exportedAt: new Date().toISOString(), notice: '仅包含当前浏览器中的本地问卷与答卷' }, null, 2)));
    $('#export-csv').addEventListener('click', exportCsv);
    $('#restore').addEventListener('change', async e => { const file = e.target.files[0]; e.target.value = ''; if (!file) return; if (file.size > 10 * 1024 * 1024) return alert('备份文件不能超过 10 MB。'); try { const next = normalize(JSON.parse(await file.text())); if (!confirm(`将用备份中的 ${next.responses.length} 份答卷替换当前数据，是否继续？`)) return; state = next; persist('备份恢复完成'); location.reload(); } catch (error) { alert('恢复失败：' + error.message); } });
    $('#load-sample').addEventListener('click', () => { if (!confirm('将用满意度示例替换当前问卷，并清空现有答卷，是否继续？')) return; state = defaultState(); persist('已载入满意度示例'); location.reload(); });
    $('#clear-responses').addEventListener('click', () => { if (!state.responses.length || !confirm('确定清空当前浏览器中的全部答卷吗？此操作无法撤销。')) return; state.responses = []; persist('答卷已清空'); renderResults(); });
    $('#response-rows').addEventListener('click', e => { const button = e.target.closest('[data-delete-response]'); if (!button) return; const row = button.closest('[data-response-id]'); if (!confirm('删除这份答卷？')) return; state.responses = state.responses.filter(r => r.id !== row.dataset.responseId); persist('答卷已删除'); renderResults(); });
  }

  bind(); renderQuestions(); renderResults(); switchTab(activeTab);
})();

