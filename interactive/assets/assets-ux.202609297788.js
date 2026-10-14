/* Presentation-only enhancements. The ledger schema and storage keys are unchanged. */
(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const activeTab = () => $('.tabs [data-tab].active')?.dataset.tab || 'asset';
  const add = $('#add');
  const batch = $('#batch-add');
  const labels = $('#asset-labels');
  const csv = $('#export-csv');
  const wipe = $('#wipe');
  const oldWipePanel = wipe.closest('.panel');
  const originalAdd = add.onclick;
  const more = make('details', 'asset-more');
  more.id = 'asset-more';
  const summary = make('summary', 'button', '更多功能');
  summary.setAttribute('aria-label', '展开批量操作与数据管理');
  const moreBody = make('div', 'asset-more-body');
  const makeGroup = (title, description) => {
    const section = make('section', 'asset-more-group');
    section.append(make('h3', '', title), make('p', 'hint', description));
    moreBody.append(section);
    return section;
  };
  const batchGroup = makeGroup('批量与标签', '已有多件资产时使用；日常单件建档、借出和领用无需进入这里。');
  batch.textContent = '批量建立多件资产';
  batchGroup.append(batch, labels);
  const dataGroup = makeGroup('数据导出', '流水 CSV 仅供查阅，不能用来恢复台账；恢复请使用页面下方的“完整备份”。');
  csv.textContent = '导出流水 CSV（仅查阅）';
  dataGroup.append(csv);
  const danger = make('details', 'asset-danger');
  danger.append(make('summary', '', '危险操作'), make('p', 'hint', '清空会移除本工具所有物品和流水。请先下载完整备份。'), wipe);
  moreBody.append(danger);
  more.append(summary, moreBody);
  add.parentElement.insertBefore(more, add);
  for (const button of [batch, labels, csv]) button.addEventListener('click', () => { more.open = false; });
  // Moving the button leaves its former panel with only duplicate explanatory text.
  if (oldWipePanel && oldWipePanel !== more) oldWipePanel.hidden = true;

  const table = $('#rows').closest('.local-table');
  const pager = $('#prev').parentElement;
  const filters = $('#search').parentElement;
  const rulesText = pager.nextElementSibling;
  const rules = make('details', 'asset-rules');
  rules.append(make('summary', '', '查看台账规则与操作说明'), rulesText);
  pager.after(rules);

  const empty = make('div', 'asset-empty');
  empty.id = 'asset-empty';
  empty.hidden = true;
  $('.local-table').before(empty);
  const emptyTitle = make('h3');
  const emptyText = make('p', 'hint');
  const emptyAction = make('button', 'primary');
  emptyAction.type = 'button';
  empty.append(emptyTitle, emptyText, emptyAction);

  function updateEmpty() {
    const tab = activeTab();
    const data = window.LocalAssets?.state();
    if (!data) return;
    const hasItems = data.items.length > 0;
    const hasActiveItems = data.items.some(item => !item.archived);
    $('#metrics').hidden = !hasItems;
    $('#asset-scan').closest('.asset-qr-toolbar').hidden = !hasActiveItems;
    labels.disabled = !hasActiveItems;
    filters.hidden = !hasItems && !data.entries.length;
    const rows = $('#rows').children.length;
    table.hidden = rows === 0;
    pager.hidden = rows === 0;
    $('#loans-panel').hidden = tab === 'consumable' || $('#loans').children.length === 0;
    empty.hidden = rows > 0;
    if (rows) return;
    const count = tab === 'history' ? data.entries.length
      : data.items.filter(item => item.kind === tab && !item.archived).length;
    if (count) {
      emptyTitle.textContent = '没有匹配的记录';
      emptyText.textContent = '试试清除搜索词和筛选条件，或勾选“包括归档物品”。';
      emptyAction.textContent = '清除筛选';
      emptyAction.onclick = () => {
        $('#search').value = '';
        $('#archived').checked = false;
        $('#category-filter').value = 'all';
        $('#condition-filter').value = 'all';
        $('#search').dispatchEvent(new Event('input'));
      };
    } else if (tab === 'consumable') {
      emptyTitle.textContent = '先登记第一种耗材';
      emptyText.textContent = '例如网线或墨盒：按数量记录入库和领用，库存偏低时会提示。';
      emptyAction.textContent = '＋ 新建耗材';
      emptyAction.onclick = () => add.click();
    } else if (tab === 'history') {
      emptyTitle.textContent = '还没有流水记录';
      emptyText.textContent = '建档并登记借出、归还、入库或领用后，这里会自动留下记录。';
      emptyAction.textContent = '去资产借还';
      emptyAction.onclick = () => $('[data-tab="asset"]').click();
    } else {
      emptyTitle.textContent = '先登记第一件资产';
      emptyText.textContent = '例如笔记本或显示器：每件独立编号，之后可登记借出与归还。';
      emptyAction.textContent = '＋ 新建资产';
      emptyAction.onclick = () => add.click();
    }
  }

  function updateTab() {
    add.textContent = activeTab() === 'consumable' ? '＋ 新建耗材'
      : activeTab() === 'asset' ? '＋ 新建资产' : '＋ 新建物品';
    updateEmpty();
  }
  add.onclick = (event) => {
    originalAdd.call(add, event);
    const kind = activeTab();
    if (kind === 'consumable') {
      $('#item-kind').value = 'consumable';
      $('#item-kind').dispatchEvent(new Event('change'));
      $('#item-heading').textContent = '新建耗材';
    } else if (kind === 'asset') {
      $('#item-heading').textContent = '新建资产';
    }
    more.open = false;
  };
  $('#item-kind').addEventListener('change', () => {
    const heading = $('#item-heading');
    if (heading.textContent.startsWith('新建')) {
      heading.textContent = $('#item-kind').value === 'asset' ? '新建资产' : '新建耗材';
    }
  });
  for (const tab of document.querySelectorAll('[data-tab]')) {
    const original = tab.onclick;
    tab.onclick = (event) => { original.call(tab, event); updateTab(); };
  }

  function decorateRows() {
    const tab = activeTab();
    if (tab === 'history') return;
    for (const row of $('#rows').children) {
      const operation = row.lastElementChild;
      const register = [...operation.querySelectorAll('button')].find(button => button.textContent === '登记');
      for (const button of operation.querySelectorAll('button')) {
        if (button.textContent === '归档') button.title = '从日常列表隐藏，但保留流水；有库存或未归还时不能归档。';
        if (button.textContent === '报废') button.title = '记录资产退役，并保留历史流水；不是删除。';
        if (button.textContent === '删除') button.title = '删除本地物品及其关联流水；建议先下载完整备份。';
      }
      if (!register) continue;
      const original = register.onclick;
      if (tab === 'asset') {
        const status = row.children[1]?.textContent || '';
        const condition = row.children[4]?.textContent || '';
        if (status !== '在库' || /故障|维修中|报废/.test(condition)) {
          register.hidden = true;
        } else {
          register.textContent = '借出';
          register.onclick = (event) => { original.call(register, event); labelOperation(); };
        }
      } else {
        register.textContent = '领用';
        register.onclick = (event) => { original.call(register, event); labelOperation(); };
        const replenish = make('button', register.className, '入库 / 盘点');
        replenish.type = 'button';
        replenish.onclick = () => {
          register.click();
          $('#action').value = 'in';
          $('#action').dispatchEvent(new Event('change'));
        };
        register.after(replenish);
      }
    }
  }
  function labelOperation() {
    const action = $('#action');
    if (!$('#op-dialog').open || !action.value) return;
    const name = $('#op-heading').textContent.replace(/^[^：]+：/, '');
    $('#op-heading').textContent = action.selectedOptions[0].textContent + '：' + name;
    $('#person').closest('label').hidden = !['lend', 'consume', 'return'].includes(action.value);
    $('#due').closest('label').hidden = action.value !== 'lend';
  }
  $('#action').addEventListener('change', labelOperation);
  new MutationObserver(() => { decorateRows(); updateEmpty(); })
    .observe($('#rows'), { childList: true });
  updateTab();
  decorateRows();
})();
