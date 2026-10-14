'use strict';

(function () {
  function fullscreen() {
    return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function syncFullscreen() {
    if (document.body) document.body.classList.toggle('yj-guide-fullscreen', fullscreen());
  }

  function textOf(root) {
    return (root && root.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function mountGuide() {
    if (!document.body || document.querySelector('.yj-tool-guide')) return;
    const main = document.querySelector('main');
    if (!main) return;
    const description = document.querySelector('meta[name="description"]')?.content?.trim() ||
      textOf(main.querySelector('.description,.lead,.hint')).slice(0, 180) ||
      '按页面提示填写或导入内容，检查结果后再导出。';
    const bodyText = textOf(main).slice(0, 16000);
    const hasFiles = Boolean(main.querySelector('input[type="file"]'));
    const hasCanvas = Boolean(main.querySelector('canvas,svg'));
    const hasBackup = /导出完整备份|恢复备份|备份与恢复/.test(bodyText);
    const hasExport = /导出|下载|保存结果|生成文件/.test(bodyText);
    const local = /本地|当前浏览器|此浏览器|不上传|离线|本机/.test(bodyText + ' ' + description);

    const details = document.createElement('details');
    details.className = 'yj-tool-guide';
    const summary = document.createElement('summary');
    summary.textContent = '使用说明';
    const content = document.createElement('div');
    content.className = 'yj-tool-guide__body';
    const intro = document.createElement('p');
    const introTitle = document.createElement('strong');
    introTitle.textContent = '这个工具做什么';
    intro.append(introTitle, document.createTextNode(description));
    const stepsWrap = document.createElement('div');
    const stepsTitle = document.createElement('strong');
    stepsTitle.textContent = '建议操作顺序';
    const steps = document.createElement('ol');
    steps.className = 'yj-tool-guide__steps';
    const stepTexts = [
      '先阅读页面中的范围、格式和隐私提示；首次使用可从示例开始。',
      hasFiles ? '选择文件后先检查预览，再调整参数；原文件不会因预览而被覆盖。' : hasCanvas ? '先填写基础参数，再在画布或预览区完成摆放、选择和调整。' : '从页面上方开始填写，修改参数后留意结果区是否同步更新。',
      hasBackup ? '需要长期保留时，完成后导出完整备份；清理浏览器数据前务必先备份。' : hasExport ? '确认结果无误后再下载或导出；重要结果建议另存一份。' : '确认结果无误后再用于实际工作，页面结论仅作为辅助参考。'
    ];
    stepTexts.forEach(function (value) {
      const item = document.createElement('li');
      item.textContent = value;
      steps.appendChild(item);
    });
    stepsWrap.append(stepsTitle, steps);
    const note = document.createElement('p');
    note.className = 'yj-tool-guide__note' + (local ? '' : ' is-neutral');
    note.textContent = local
      ? '数据提示：本页包含本地处理或浏览器存储功能。不同设备之间不会自动同步；具体保存范围以页面提示为准。'
      : '边界提示：请以页面中的结果说明为准；涉及生产、财务、安全或合规的结论需要再次人工核验。';
    content.append(intro, stepsWrap, note);
    details.append(summary, content);

    const introBlock = main.querySelector(':scope > .intro,:scope > .sandbox-intro,:scope > .hero');
    if (introBlock && introBlock.nextSibling) main.insertBefore(details, introBlock.nextSibling);
    else main.insertBefore(details, main.firstChild);
    syncFullscreen();
  }

  document.addEventListener('fullscreenchange', syncFullscreen);
  document.addEventListener('webkitfullscreenchange', syncFullscreen);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountGuide, { once: true });
  else mountGuide();
})();

