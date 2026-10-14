import { el, btn, field, select, panel, row, grid, table, download, ready, confirmRestore } from '../ops-ui.js';
import { expandBundle, configurationKit, lineDiff } from 'kit-model.20261005.js';
import { inspectConfig } from 'engine.js';
const api = await ready('NginxApp'), key = 'yj-nginx-learning-v1';
const learning = panel('学习进度与备份', '仅保存已通过关卡和当前关卡，不保存需求、配置输入、文件或练习代码。进度在浏览器本地，清理站点数据会丢失。');
const remember = el('input', null, { type: 'checkbox', checked: true }), label = el('label', '在此浏览器保存学习进度', { class: 'ops-check' }); label.prepend(remember);
const progressStatus = el('p', '', { class: 'ops-status', role: 'status' }), restore = el('input', null, { type: 'file', accept: '.json,application/json' });
function backupProgress() { download('NGINX%e5%ad%a6%e4%b9%a0%e8%bf%9b%e5%ba%a6.json.html', JSON.stringify({ app: 'yj-nginx-learning', version: 1, ...api.progress() }, null, 2), 'application/json'); }
learning.append(row(label, btn('导出学习进度备份', backupProgress), restore), progressStatus);
function saveProgress() { if (!remember.checked) return; try { localStorage.setItem(key, JSON.stringify(api.progress())); progressStatus.textContent = `已保存 ${api.progress().completed.length} 个通过关卡；练习代码未保存。`; } catch { progressStatus.textContent = '学习进度保存失败，请下载备份。'; } }
try { const saved = JSON.parse(localStorage.getItem(key) || 'null'); if (saved) api.restoreProgress(saved); } catch { progressStatus.textContent = '旧进度无法读取，未覆盖；可恢复有效备份。'; }
document.getElementById('lesson-check').addEventListener('click', saveProgress);
document.getElementById('lesson-next').addEventListener('click', saveProgress);
document.getElementById('lesson-list').addEventListener('click', saveProgress);
remember.addEventListener('change', () => { if (remember.checked) saveProgress(); else { if (!confirm('关闭并移除本机保存的学习进度？请先下载备份。')) { remember.checked = true; return; } localStorage.removeItem(key); progressStatus.textContent = '进度只在本次页面会话保留。'; } });
restore.addEventListener('change', async () => { try { const f = restore.files[0]; if (!f) return; if (f.size > 16000) throw Error('学习进度备份最多 16 KB'); const value = JSON.parse(await f.text()); if (value.app !== 'yj-nginx-learning' || value.version !== 1) throw Error('不是学习进度备份'); api.validateProgress(value); if (await confirmRestore(`将恢复 ${value.completed.length} 个已通过关卡。`, backupProgress)) { api.restoreProgress(value); saveProgress(); } } catch (e) { progressStatus.textContent = e.message; } finally { restore.value = ''; } });
const kit = panel('多文件配置包与部署交付', '可把已通过参数检查的生成草案拆成 nginx.conf 与站点文件，附上线和回退检查清单。不会连接主机，也不会执行命令。配置包仍须在目标主机 nginx -t。');
const old = field('变更前配置（仅内存，粘贴脱敏内容）', 'textarea'), diff = el('pre', '尚未比较。'), kitStatus = el('p', '', { class: 'ops-status', role: 'status' }); old.input.maxLength = 800000;
kit.append(row(btn('下载配置交付 ZIP', async () => {
  const generated = api.generated(); if (!generated?.canExport) throw Error('请先生成可导出的完整草案，教学示例和部分需求不支持导出');
  if (!window.JSZip) await new Promise((resolve, reject) => { const s = el('script', null, { src: '../epub-reader/vendor/jszip.min.js' }); s.onload = resolve; s.onerror = () => reject(Error('ZIP 组件加载失败')); document.head.append(s); });
  const files = configurationKit(generated.code), zip = new window.JSZip(); Object.entries(files).forEach(([path, text]) => zip.file(path, text)); const blob = await zip.generateAsync({ type: 'blob' }); const url = URL.createObjectURL(blob), a = el('a', null, { href: url, download: 'nginx-config-kit.zip' }); a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); kitStatus.textContent = `已打包 ${Object.keys(files).length} 个文件，仅包含生成草案与检查清单。`;
}, 'primary'), btn('比较变更前后', () => { const generated = api.generated(); if (!generated?.code) throw Error('请先生成草案'); const lines = lineDiff(old.input.value, generated.code); diff.textContent = lines.length ? lines.slice(0, 300).join('\n') + (lines.length > 300 ? '\n…界面截取前 300 行' : '') : '未发现差异。'; kitStatus.textContent = `发现 ${lines.length} 行变更（有界逐行对齐，不是完整语法语义比较）。`; })), old.label, diff, kitStatus);
const bundle = panel('现有多文件配置基础体检', '仅解析主动选择的本地文件。支持常量 include、* / ? 通配符与循环检测；变量 include、模块、实际文件权限和完整 NGINX 语法仍需主机验证。文件不会自动保存或包含在学习备份中。');
const prefix = field('目标主机配置 prefix（Linux 路径）', 'text', '/etc/nginx'), root = select('主配置文件', []), upload = el('input', null, { type: 'file', multiple: true, accept: '.conf,.txt,text/plain' }), directory = el('input', null, { type: 'file', multiple: true }); directory.setAttribute('webkitdirectory', '');
const fileList = el('div'), out = el('div'), bundleStatus = el('p', '', { class: 'ops-status', role: 'status' }); let files = [];
bundle.append(grid(prefix.label, root.label), el('p', '选文件可逐个编辑其目标路径；选目录会保留相对路径。目录中只读取 .conf 文件，最多 30 个、合计 2 MB。', { class: 'ops-note' }), row(upload, directory, btn('展开与基础体检', inspect, 'primary'), btn('清空配置文件', () => { files = []; renderFiles(); out.replaceChildren(); bundleStatus.textContent = '已清空内存中的配置文件。'; })), fileList, bundleStatus, out);
async function read(input) {
  const selected = [...input.files].filter(f => /\.(?:conf|txt)$/i.test(f.name)); input.value = '';
  try { if (!selected.length) throw Error('未选到 .conf / .txt 文件'); if (selected.length > 30 || selected.reduce((n, f) => n + f.size, 0) > 2000000) throw Error('最多 30 个文件、合计 2 MB'); const pending = []; for (const f of selected) pending.push({ path: f.webkitRelativePath || f.name, text: await f.text() }); files = pending; renderFiles(); out.replaceChildren(); bundleStatus.textContent = `已读取 ${files.length} 个文件，仅在内存。请核对每个目标路径及 prefix。`; } catch (e) { bundleStatus.textContent = e.message; }
}
upload.addEventListener('change', () => read(upload)); directory.addEventListener('change', () => read(directory));
function renderFiles() { root.input.replaceChildren(); files.forEach((f, i) => root.input.add(new Option(f.path, String(i)))); const index = files.findIndex(f => f.path.endsWith('nginx.conf')); if (index >= 0) root.input.value = index; fileList.replaceChildren(table(['目标路径（可修改）', '字数'], files.map(f => { const input = field('', 'text', f.path).input; input.addEventListener('change', () => { f.path = input.value; renderFiles(); }); return [input, f.text.length]; }))); }
function inspect() { try { if (!files.length) throw Error('先导入配置文件'); const result = expandBundle(files, files[Number(root.input.value)].path, prefix.input.value), checked = inspectConfig(result.code); out.replaceChildren(table(['引用文件'], result.files.map(f => [f])), table(['待核对项'], [...result.warnings, ...checked.findings.map(f => `展开后第 ${f.line} 行：${f.message}`)].map(s => [s]))); bundleStatus.textContent = `展开 ${result.files.length} 份配置；只通过有界结构与预置规则检查，不能替代 nginx -t。`; } catch (e) { bundleStatus.textContent = e.message; out.replaceChildren(); } }
