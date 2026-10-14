export function tokens(source) {
  const out = []; let i = 0, line = 1;
  while (i < source.length) {
    const c = source[i]; if (/\s/.test(c)) { if (c === '\n') line++; i++; continue; }
    if (c === '#') { while (i < source.length && source[i] !== '\n') i++; continue; }
    const start = i, at = line;
    if ('{};'.includes(c)) { out.push({ value: c, start, end: ++i, line: at, kind: 'symbol' }); continue; }
    if (c === '"' || c === "'") {
      const quote = c; let value = ''; i++;
      while (i < source.length && source[i] !== quote) { if (source[i] === '\\' && i + 1 < source.length) { value += source.slice(i, i + 2); i += 2; } else { if (source[i] === '\n') line++; value += source[i++]; } }
      if (source[i] !== quote) throw Error(`第 ${at} 行引号未闭合`); i++; out.push({ value, start, end: i, line: at, kind: 'string' }); continue;
    }
    let value = ''; while (i < source.length && !/[\s{};#]/.test(source[i])) { if (source[i] === '\\' && i + 1 < source.length) { value += source.slice(i, i + 2); i += 2; } else value += source[i++]; }
    out.push({ value, start, end: i, line: at, kind: 'word' });
  }
  return out;
}
function normalize(path) {
  const parts = path.replaceAll('\\', '/').split('/'); if (parts.includes('..') || path.includes('\0')) throw Error('配置路径不能含 .. 或空字符');
  return '/' + parts.filter(p => p && p !== '.').join('/');
}
export function expandBundle(files, root, prefix = '/etc/nginx') {
  if (!Array.isArray(files) || files.length > 30) throw Error('最多 30 个配置文件');
  const base = normalize(prefix), map = new Map(), warnings = [], visited = new Set();
  for (const f of files) { const path = normalize(f.path.startsWith('/') ? f.path : base + '/' + f.path); if (map.has(path)) throw Error('配置路径重复：' + path); if (typeof f.text !== 'string') throw Error('配置内容无效'); map.set(path, f.text); }
  if ([...map.values()].reduce((n, s) => n + new TextEncoder().encode(s).length, 0) > 2000000) throw Error('配置文件合计最多 2 MB');
  function matches(value) {
    if (value.includes('$')) { warnings.push(`变量 include 无法离线展开：${value}`); return []; }
    const path = normalize(value.startsWith('/') ? value : base + '/' + value), re = new RegExp('^' + path.split('').map(c => c === '*' ? '[^/]*' : c === '?' ? '[^/]' : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('') + '$');
    return [...map.keys()].filter(p => re.test(p)).sort();
  }
  let expandedBytes = 0;
  function visit(path, stack) {
    if (stack.includes(path)) throw Error('include 循环：' + [...stack, path].join(' → ')); if (stack.length > 20) throw Error('include 深度超过 20 层');
    const source = map.get(path); if (source === undefined) throw Error('主配置路径不存在'); visited.add(path);
    expandedBytes += source.length; if (expandedBytes > 4000000) throw Error('展开配置超过 4 MB，可能存在重复 include');
    const ts = tokens(source); let output = '', last = 0;
    for (let i = 0; i < ts.length; i++) if (ts[i].kind === 'word' && ts[i].value === 'include') {
      const argument = ts[i + 1], end = ts[i + 2]; if (!argument || !['word', 'string'].includes(argument.kind) || end?.value !== ';') { warnings.push(`${path}:${ts[i].line} include 格式不支持`); continue; }
      const found = matches(argument.value); if (!found.length) warnings.push(`${path}:${ts[i].line} 未找到 include：${argument.value}（目录不存在和空通配符须在主机核对）`);
      output += source.slice(last, ts[i].start) + found.map(p => '\n# 本地展开 ' + p + '\n' + visit(p, [...stack, path])).join('\n'); last = end.end; i += 2;
    }
    return output + source.slice(last);
  }
  const rootPath = normalize(root.startsWith('/') ? root : base + '/' + root), code = visit(rootPath, []);
  let depth = 0; for (const t of tokens(code)) { if (t.kind === 'symbol' && t.value === '{') depth++; if (t.kind === 'symbol' && t.value === '}' && --depth < 0) throw Error('展开配置存在多余关闭括号'); } if (depth) throw Error('展开配置括号未闭合');
  for (const path of map.keys()) if (!visited.has(path)) warnings.push(`未被主配置引用：${path}`);
  return { code, warnings, files: [...visited], rootPath };
}
export function configurationKit(code) {
  const ts = tokens(code), servers = []; let depth = 0;
  for (let i = 0; i < ts.length; i++) {
    if (ts[i].value === 'server' && ts[i].kind === 'word' && ts[i + 1]?.value === '{' && depth === 1) {
      let end = i + 1, inner = 0; for (; end < ts.length; end++) { if (ts[end].kind === 'symbol' && ts[end].value === '{') inner++; if (ts[end].kind === 'symbol' && ts[end].value === '}' && --inner === 0) break; }
      if (end >= ts.length) throw Error('生成配置括号不完整'); servers.push({ start: ts[i].start, end: ts[end].end });
    }
    if (ts[i].kind === 'symbol' && ts[i].value === '{') depth++; if (ts[i].kind === 'symbol' && ts[i].value === '}') depth--;
  }
  const files = {}; let root = code;
  servers.forEach((s, i) => { files[`sites-enabled/site-${String(i + 1).padStart(3, '0')}.conf`] = code.slice(s.start, s.end) + '\n'; });
  for (let i = servers.length - 1; i >= 0; i--) { const s = servers[i]; root = root.slice(0, s.start) + `include sites-enabled/site-${String(i + 1).padStart(3, '0')}.conf;` + root.slice(s.end); }
  files['nginx.conf'] = root;
  files['DEPLOY-CHECKLIST.txt'] = '本工具生成草案，不自动部署。相对 include 路径按 NGINX 配置 prefix 解析。\n\n部署前：\n1. 核对 NGINX 版本、模块、授权、证书路径、文件权限与真实后端。\n2. 备份整份当前配置与 include 文件，记录备份位置及文件权限。\n3. 将新配置先放入独立目录，不直接覆盖线上文件。\n4. 在目标主机执行 nginx -t -p /你实际的配置目录/ -c nginx.conf，检查所有引用文件。\n5. 人工批准变更窗口，确认回退负责人、步骤和验收标准。\n\n上线：\n6. 按实际服务部署方式替换配置，重新 nginx -t 成功后才重载。\n7. 检查 HTTP 状态、API 路径、HTTPS、访问日志和错误日志。\n\n回退：\n8. 恢复先前备份的整份配置与 include 文件，不只恢复 nginx.conf。\n9. nginx -t 成功后重载并执行相同验收测试。\n10. 保留变更前后配置及异常记录。任何命令均须人工核对，不在网页执行。\n';
  return files;
}
export function lineDiff(before, after) {
  const a = before.split(/\r?\n/), b = after.split(/\r?\n/); if (a.length > 4000 || b.length > 4000) throw Error('差异比较每份最多 4000 行');
  const result = []; let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (a[i] === b[j] && i < a.length && j < b.length) { i++; j++; continue; }
    // Bounded look-ahead preserves common inserted / deleted lines without quadratic memory.
    const ai = b[j] === undefined ? -1 : a.slice(i, i + 50).indexOf(b[j]), bj = a[i] === undefined ? -1 : b.slice(j, j + 50).indexOf(a[i]);
    if (ai > 0 && (bj < 1 || ai <= bj)) { for (let n = 0; n < ai; n++) result.push(`- ${i + 1} ${a[i++]}`); }
    else if (bj > 0) { for (let n = 0; n < bj; n++) result.push(`+ ${j + 1} ${b[j++]}`); }
    else { if (i < a.length) result.push(`- ${i + 1} ${a[i++]}`); if (j < b.length) result.push(`+ ${j + 1} ${b[j++]}`); }
  }
  return result;
}
