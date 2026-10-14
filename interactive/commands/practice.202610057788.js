import { el, btn, field, select, panel, row, grid, download, dialog } from '../ops-ui.js';
import { GUIDES, RUNBOOKS, fillTemplate } from 'practice-model.20261005.js';
const p = panel('常用命令详解与排障组合', '从常用命令开始补深：所在视图、版本边界、参数生成和输出解读。教学输出均为虚构示意，不是设备检测结果。页面不连接或执行任何命令。');
const choose = select('详解命令', GUIDES.map((g, i) => [String(i), `${g.platform} · ${g.title}`])), book = select('排障流程', Object.keys(RUNBOOKS).map(k => [k, k])), body = el('div'), plan = el('div');
p.append(grid(choose.label, book.label), body, plan);
function generator(g, parent) {
  const inputs = {}, fields = Object.entries(g.parameters).map(([key, [label, value]]) => { const f = field(label, 'text', value); inputs[key] = f.input; return f.label; }), out = el('pre', g.command), status = el('p', '', { class: 'ops-status', role: 'status' });
  const generate = () => { try { out.textContent = fillTemplate(g.command, Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, v.value])), g.parameters); status.textContent = g.generic ? '模板不保证只读或参数含义正确，请按原条目风险标记审核。' : '生成的是只读诊断命令，仍须核对平台与授权。'; return out.textContent; } catch (e) { out.textContent = '参数不合法，未生成命令。'; status.textContent = e.message; return null; } };
  Object.values(inputs).forEach(input => input.addEventListener('input', () => { out.textContent = '参数已改变，请重新生成。'; }));
  parent.append(grid(...fields), row(btn('生成命令', generate, 'primary'), btn('复制生成结果', async () => { const command = generate(); if (command && (!g.generic || confirm('请先核对原条目的权限与风险。确认复制此模板命令？页面不会执行。'))) await navigator.clipboard.writeText(command); })), out, status);
}
function renderGuide() {
  const g = GUIDES[Number(choose.input.value)]; body.replaceChildren(); body.append(el('h3', g.title), el('p', `${g.scope} · 视图 / 权限：${g.mode}`, { class: 'ops-note' })); generator(g, body);
  body.append(el('h3', '输出如何看'), el('p', g.observe), el('pre', '# 教学输出示意（非真实数据）\n' + g.output));
  body.append(el('a', '官方语法参考 ↗', { href: g.source, target: '_blank', rel: 'noopener noreferrer' }));
}
function renderBook() {
  plan.replaceChildren(el('h3', book.input.value)); const notes = [];
  RUNBOOKS[book.input.value].forEach((index, i) => { const g = GUIDES[index], d = el('details'); d.append(el('summary', `${i + 1}. ${g.title}`), el('p', '判断要点：' + g.observe)); generator(g, d); const note = field('人工观察结论（仅本次会话）', 'textarea'); notes.push({ guide: g, input: note.input }); d.append(note.label); plan.append(d); });
  plan.append(row(btn('导出排障记录', () => download('%e6%8e%92%e9%9a%9c%e8%a7%82%e5%af%9f%e8%ae%b0%e5%bd%95.html', '# ' + book.input.value + '\n只读命令模板，须填写参数后再执行。观察结论由用户填写。\n\n' + notes.map(({ guide, input }, i) => `${i + 1}. ${guide.title}\n${guide.command}\n观察：${input.value || '未填写'}\n`).join('\n')))));
}
choose.input.addEventListener('change', renderGuide); book.input.addEventListener('change', renderBook); renderGuide(); renderBook();
// Parameter-fill entry for existing tldr templates. It never executes the result.
function decorate() {
  document.querySelectorAll('.command-card').forEach(card => {
    const command = card.querySelector('code')?.textContent || ''; if (!command.includes('{{') || card.querySelector('[data-fill-template]')) return;
    const open = btn('填写模板参数', () => {
      const d = dialog('填写参数 · 不执行命令'), parameters = Object.fromEntries([...command.matchAll(/\{\{([^{}]+)\}\}/g)].map(([, key]) => [key, [key, '', 'token']]));
      d.append(el('p', '通用模板只做安全字符替换，不保证参数含义正确。路径含空格、复杂表达式等请人工编辑。高风险命令仍需审核与回退计划。', { class: 'ops-warning' })); generator({ command, parameters, generic:true }, d); d.append(row(btn('关闭', () => d.close()))); d.showModal();
    }); open.dataset.fillTemplate = 'true'; card.querySelector('.command-card-actions')?.append(open);
  });
}
const observer=new MutationObserver(decorate); observer.observe(document.getElementById('results'), {childList:true});decorate();
