import { DEFAULT_RULES, parseLiterals, createSanitizer } from 'redact-engine4bea.js?v=20261001';

const $ = id => document.getElementById(id);
const labels = { credentials: '凭据字段', bearer: 'Bearer', jwt: 'JWT', privateKey: '私钥块', email: '邮箱', ipv4: 'IPv4', phone: '手机号', literals: '自定义词' };
const maximumBytes = 40 * 1024 * 1024;
let output = null, scannedSources = null, scannedOptions = null, generation = 0, busy = false, findings = null;

function sources() {
  const value = window.LocalLogs.state();
  return [...(value.source ? [{ name: '手动输入', source: value.source }] : []), ...value.files.map(item => ({ name: item.name, source: item.source }))];
}

function options() {
  return {
    rules: { ...DEFAULT_RULES, email: $('redact-email').checked, ipv4: $('redact-ipv4').checked,
      phone: $('redact-phone').checked, literals: $('redact-literals').checked },
    terms: $('redact-terms').value
  };
}

function sameInput() {
  if (!scannedSources || scannedOptions !== JSON.stringify(options())) return false;
  const current = sources();
  return current.length === scannedSources.length && current.every((item, index) => item.name === scannedSources[index].name && item.source === scannedSources[index].source);
}

function invalidate() {
  generation++;
  output = null;
  scannedSources = null;
  scannedOptions = null;
  findings = null;
  $('redact-download').disabled = true;
  $('redact-findings').replaceChildren();
  $('redact-preview').textContent = '内容或规则已变化，请重新扫描。';
  $('redact-status').textContent = '扫描结果已失效，请重新扫描后下载。';
  if (busy) { busy = false; $('redact-progress').hidden = true; $('redact-cancel').hidden = true; $('redact-scan').disabled = false; }
}

function renderFindings() {
  const host = $('redact-findings');
  host.replaceChildren();
  for (const [key, name] of Object.entries(labels)) {
    const badge = document.createElement('span');
    badge.textContent = `${name} ${findings[key]} 处`;
    host.append(badge);
  }
}

async function scan() {
  if (busy) return;
  const current = sources();
  const selected = options();
  let terms;
  try {
    if (!current.length) throw Error('请先粘贴或导入日志。');
    if (current.length > 5) throw Error('最多扫描 5 份日志。');
    terms = parseLiterals(selected.terms);
    const bytes = new Blob(current.map(item => item.source)).size;
    if (bytes > maximumBytes) throw Error('当前日志合计超过 40 MB，请先减少来源。');
  } catch (error) { $('redact-status').textContent = error.message; return; }

  const run = ++generation;
  output = null;
  scannedSources = null;
  $('redact-download').disabled = true;
  busy = true;
  $('redact-scan').disabled = true;
  $('redact-cancel').hidden = false;
  $('redact-progress').hidden = false;
  const total = current.reduce((sum, item) => sum + item.source.length, 0);
  $('redact-progress').max = Math.max(total, 1);
  $('redact-progress').value = 0;
  $('redact-status').textContent = '正在本机扫描全部日志…';
  const parts = [];
  const counts = Object.fromEntries(Object.keys(DEFAULT_RULES).map(key => [key, 0]));
  let processed = 0, lines = 0;
  try {
    for (let index = 0; index < current.length; index++) {
      const item = current[index];
      const engine = createSanitizer(selected.rules, terms);
      parts.push(`===== 来源 ${index + 1} =====`);
      let position = 0;
      while (position <= item.source.length) {
        if (run !== generation) return;
        const end = item.source.indexOf('\n', position);
        const last = end < 0;
        const line = item.source.slice(position, last ? undefined : end).replace(/\r$/, '');
        parts.push(engine.line(line));
        processed += line.length + (last ? 0 : 1);
        lines++;
        if (lines > 200000) throw Error('日志超过 20 万行，未生成分享副本。');
        if (lines % 400 === 0) {
          $('redact-progress').value = Math.min(processed, total);
          $('redact-status').textContent = `已扫描 ${lines.toLocaleString('zh-CN')} 行…`;
          await new Promise(requestAnimationFrame);
        }
        if (last) break;
        position = end + 1;
      }
      const one = engine.finish();
      for (const key of Object.keys(counts)) counts[key] += one[key];
      parts.push('');
    }
    if (run !== generation) return;
    output = parts.join('\n');
    findings = counts;
    scannedSources = current;
    scannedOptions = JSON.stringify(selected);
    $('redact-progress').value = total;
    $('redact-download').disabled = false;
    $('redact-preview').textContent = output.slice(0, 12000) + (output.length > 12000 ? '\n…（仅预览前 12,000 字，请下载后人工检查全文）' : '');
    renderFindings();
    $('redact-status').textContent = `已扫描 ${lines.toLocaleString('zh-CN')} 行、${current.length} 份来源；命中 ${Object.values(counts).reduce((sum, count) => sum + count, 0)} 处。仅生成本机脱敏副本，原始日志未改动。`;
  } catch (error) {
    output = null;
    findings = null;
    scannedSources = null;
    $('redact-download').disabled = true;
    $('redact-preview').textContent = '未生成可分享副本。';
    $('redact-status').textContent = `扫描未完成：${error.message}`;
  } finally {
    if (run === generation) {
      busy = false;
      $('redact-scan').disabled = false;
      $('redact-cancel').hidden = true;
      $('redact-progress').hidden = true;
    }
  }
}

function download() {
  if (output === null || !sameInput()) { invalidate(); return; }
  if (!window.confirm('自动脱敏不能保证识别全部敏感内容。请在分享前人工检查下载文件，继续下载吗？')) return;
  const url = URL.createObjectURL(new Blob([output], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = '%e6%97%a5%e5%bf%97-%e5%88%86%e4%ba%ab%e5%89%8d%e8%84%b1%e6%95%8f%e5%89%af%e6%9c%ac.html';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

window.addEventListener('load', () => {
  if (!window.LocalLogs?.state) { $('redact-status').textContent = '日志分析模块未加载，暂时无法扫描。'; return; }
  $('redact-scan').addEventListener('click', scan);
  $('redact-cancel').addEventListener('click', () => { invalidate(); $('redact-status').textContent = '扫描已取消，没有生成下载文件。'; });
  $('redact-download').addEventListener('click', download);
  for (const id of ['redact-email', 'redact-ipv4', 'redact-phone', 'redact-literals', 'redact-terms']) $(id).addEventListener('input', invalidate);
  $('source').addEventListener('input', invalidate);
  $('log-file').addEventListener('change', invalidate);
  $('file-list').addEventListener('click', event => { if (event.target.closest('button')) invalidate(); });
  $('sample').addEventListener('click', invalidate);
  $('clear').addEventListener('click', invalidate);
  window.addEventListener('storage', event => { if (event.key === 'yj-logs-v1') invalidate(); });
});
