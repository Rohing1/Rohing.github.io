'use strict';
// Search runs off the UI thread. Only static, public index shards are fetched.
const shardCache = new Map();
let manifestPromise;
const stop = /^(怎么|如何|什么|哪些|有没有|是否|请问|网站|页面|文章|相关|关于|可以|能够|里面|这里|那个|这个|一下|介绍|说明|的是|进行|需要|使用|还有|一下子|我的|一个|以及|支持)$/;
const canonicalRules = [
  [/\bsqllite\b|\bsqlite3\b/gi, 'sqlite'],
  [/机桂|机贵/g, '机柜'],
  [/\bhwawei\b|\bhuawie\b/gi, 'huawei 华为'],
  [/\bh3c\b|华三/gi, 'h3c 华三'],
  [/\bcisco\b|思科/gi, 'cisco 思科'],
  [/\bwi[\s-]?fi\b/gi, 'wifi 无线'],
  [/\bhot\s*spare\b/gi, '热备盘'],
  [/\bk8s\b/gi, 'kubernetes k8s'],
  [/\bpgsql\b/gi, 'postgresql'],
  [/清空缓存|删除缓存|删缓存/g, '清理浏览器数据']
];
const entityDefinitions = {
  vendor: [
    { id: 'huawei', pattern: /华为|\bhuawei\b/i },
    { id: 'h3c', pattern: /华三|\bh3c\b/i },
    { id: 'cisco', pattern: /思科|\bcisco\b/i },
    { id: 'hikvision', pattern: /海康|\bhikvision\b/i },
    { id: 'dahua', pattern: /大华|\bdahua\b/i }
  ],
  platform: [
    { id: 'windows', pattern: /\bwindows\b|微软服务器/i },
    { id: 'linux', pattern: /\blinux\b|ubuntu|centos|debian|rocky\s*linux|alma\s*linux|麒麟|统信/i },
    { id: 'macos', pattern: /\bmacos\b|\bmac\s*os\b/i },
    { id: 'ios', pattern: /\bios\b|iphone|ipad/i },
    { id: 'android', pattern: /\bandroid\b|安卓/i }
  ],
  product: [
    { id: 'nginx', pattern: /\bnginx\b/i },
    { id: 'apache', pattern: /\bapache\b/i },
    { id: 'docker', pattern: /\bdocker\b|容器引擎/i },
    { id: 'kubernetes', pattern: /\bkubernetes\b|\bk8s\b/i },
    { id: 'mysql', pattern: /\bmysql\b|mariadb/i },
    { id: 'postgresql', pattern: /\bpostgres(?:ql)?\b|\bpgsql\b/i },
    { id: 'redis', pattern: /\bredis\b/i },
    { id: 'sqlite', pattern: /\bsqlite\b/i },
    { id: 'raid', pattern: /\braid\b|磁盘阵列|热备盘/i },
    { id: 'poe', pattern: /\bpoe\b|以太网供电/i },
    { id: 'wireless', pattern: /\bwifi\b|\bwi-fi\b|\bwlan\b|\bap\b|无线接入|无线覆盖/i },
    { id: 'dns', pattern: /\bdns\b|域名解析|解析记录/i },
    { id: 'firewall', pattern: /防火墙|\bfirewall\b|\bacl\b/i },
    { id: 'vmware', pattern: /\bvmware\b|\bvsphere\b|\besxi\b/i },
    { id: 'ups', pattern: /\bups\b|不间断电源/i }
  ]
};
const aliases = [
  [/\bpoe\b|以太网供电/i, 'poe 供电 交换机 功率预算'],
  [/raid|磁盘阵列|热备盘/i, 'raid 硬盘 阵列 热备 故障'],
  [/清缓存|清除缓存|清理浏览器/i, '浏览器 网站数据 清理 本地保存 备份'],
  [/机柜|机房|rack/i, '机柜 机房 本地 设备'],
  [/借还|借用|耗材/i, '资产 借还 耗材 库存'],
  [/sqlite|数据库/i, 'sqlite 数据库 查询'],
  [/sqllite|sqlite3/i, 'sqlite 数据库 查询'],
  [/机桂|机贵/, '机柜 机房 本地 设备'],
  [/无线|ap\b|wifi|wi-fi/i, '无线 ap wifi 覆盖'],
  [/不见了|丢失|没了/i, '丢失 备份 恢复 保存'],
  [/华为|huawei/i, '华为 huawei'],
  [/华三|h3c/i, '华三 h3c'],
  [/思科|cisco/i, '思科 cisco'],
  [/dns|域名解析/i, 'dns 域名 解析 记录']
];
function normalizeQuery(value) {
  let text = String(value || '').toLowerCase().replace(/[“”‘’]/g, ' ');
  for (const [pattern, replacement] of canonicalRules) text = text.replace(pattern, replacement);
  return text.replace(/\s+/g, ' ').trim();
}
function termsFor(value, expandAliases = true) {
  let text = normalizeQuery(value);
  if (expandAliases) for (const [pattern, more] of aliases) if (pattern.test(text)) text += ' ' + more;
  const parts = text.replace(/[^一-鿿a-z0-9.+#-]+/g, ' ').match(/[一-鿿]+|[a-z][a-z0-9.+#-]*|\d+(?:\.\d+)*/g) || [];
  const out = [], seen = new Set();
  for (const part of parts) {
    const list = /^[一-鿿]+$/.test(part) ? (part.length <= 9 ? [part] : []) : [part];
    if (/^[一-鿿]+$/.test(part)) for (let i = 0; i < part.length - 1; i++) list.push(part.slice(i, i + 2));
    for (const term of list) if (term.length > 1 && !stop.test(term) && !seen.has(term)) {
      seen.add(term); out.push(term);
    }
  }
  return out.slice(0, 40);
}
function coreTermsFor(question) {
  const specific = String(question || '').replace(/当前页面|这个页面|这个工具|本页面|本工具|本页|这里|此处|请问|怎么用|如何用|怎么操作|如何操作|怎么|如何|什么|哪些|是否|能否|可以|帮我|一下|告诉我|介绍|说明|功能|有关|关于/g, ' ');
  return termsFor(specific, false).filter(term => !/^(区别|对比|不同|有什|什么|么区|么不|怎么|如何|为什|什么|怎样|能否|是否|可以|请问|一下|哪个|哪些|问题|页面|网站|功能)$/.test(term));
}
function classifyIntent(question) {
  const text = String(question || '');
  if (/报错|错误|失败|异常|故障|无法|不能|不工作|超时|拒绝|断开|崩溃|error|exception|failed|failure|timeout|refused|denied|not found/i.test(text) || text.length > 260) return 'troubleshoot';
  if (/区别|差异|对比|比较|相比|哪个好|选哪个|分别/.test(text)) return 'comparison';
  if (/多少|容量|功率|预算|计算|估算|规格|阈值|尺寸|数量/.test(text)) return 'calculation';
  if (/数据|隐私|保存|备份|恢复|缓存|丢失|上传|本地/.test(text)) return 'data';
  if (/在哪里|入口|打开|跳转|哪个工具|哪篇|有哪些/.test(text)) return 'navigation';
  if (/怎么|如何|步骤|配置|操作|命令|设置|安装|部署|导入|导出|下载/.test(text)) return 'procedure';
  return 'explain';
}
function extractSignals(question) {
  const text = String(question || ''), rows = [], seen = new Set();
  const patterns = [
    /\b(?:ERR_[A-Z0-9_]+|E[A-Z][A-Z0-9_]{2,}|ORA-\d+|SQLSTATE\[[^\]]+\]|0x[0-9a-f]+|[45]\d{2})\b/gi,
    /\b(?:[A-Z][A-Za-z]+(?:Error|Exception)|MODULE_NOT_FOUND|ECONNREFUSED|ETIMEDOUT|ENOSPC|EACCES)\b/g,
    /\b(?:nginx|apache|mysql|mariadb|postgresql|redis|docker|kubernetes|k8s|linux|ubuntu|centos|windows|cisco|huawei|h3c|vmware|node(?:\.js)?|python|java|git)\s*v?\d+(?:\.\d+){0,3}\b/gi
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) && rows.length < 8) {
      const value = match[0].trim(), key = value.toLowerCase();
      if (!seen.has(key)) { seen.add(key); rows.push(value); }
    }
  }
  return rows;
}
function entityIdsFor(value) {
  const text = normalizeQuery(value), output = {};
  for (const [group, definitions] of Object.entries(entityDefinitions)) {
    output[group] = [];
    for (const definition of definitions) if (definition.pattern.test(text)) output[group].push(definition.id);
  }
  return output;
}
function excludedEntityIdsFor(value) {
  const text = normalizeQuery(value), output = {};
  for (const [group, definitions] of Object.entries(entityDefinitions)) {
    output[group] = [];
    for (const definition of definitions) {
      const pattern = new RegExp('(?:不要|不是|不用|排除|不考虑|并非|非)[^，。；;是]{0,4}(?:' + definition.pattern.source + ')', 'i');
      if (pattern.test(text)) output[group].push(definition.id);
    }
  }
  return output;
}
function uniqueMatches(value, pattern, limit = 8) {
  const output = [], seen = new Set();let match;
  pattern.lastIndex = 0;
  while ((match = pattern.exec(value)) && output.length < limit) {
    const item = match[0].toLowerCase();if (!seen.has(item)) { seen.add(item);output.push(item); }
  }
  return output;
}
function queryClauses(question) {
  return normalizeQuery(question).split(/[，,。；;！？!?]|以及|同时|并且|然后/).map(part => coreTermsFor(part)).filter(terms => terms.length);
}
function analyzeQuery(question) {
  const required = entityIdsFor(question), excluded = excludedEntityIdsFor(question);
  for (const group of Object.keys(required)) required[group] = required[group].filter(id => !excluded[group].includes(id));
  const versions = uniqueMatches(normalizeQuery(question), /\bv?\d+(?:\.\d+){1,3}\b/gi);
  const errors = extractSignals(question).map(value => value.toLowerCase());
  const models = uniqueMatches(String(question || ''), /\b[A-Z]{2,8}[-_]?[A-Z0-9]*\d{2,}[A-Z0-9_-]*\b/g).filter(value => !errors.includes(value));
  const requiredCount = Object.values(required).reduce((sum, rows) => sum + rows.length, 0);
  return { required, excluded, versions, errors, models, clauses: queryClauses(question), requiredCount, normalized: normalizeQuery(question).replace(/[？?！!。]+$/g, '').trim() };
}
function constraintScore(doc, queryMeta) {
  if (!queryMeta) return { score: 0, requiredHits: 0, requiredCount: 0, mismatch: false };
  const text = [doc.title, doc.section, doc.category, doc.text].join(' '), found = entityIdsFor(text);
  let score = 0, requiredHits = 0, mismatch = false;
  for (const group of Object.keys(queryMeta.required)) {
    const wanted = queryMeta.required[group] || [], present = found[group] || [];
    for (const id of wanted) {
      if (present.includes(id)) { requiredHits++;score += group === 'vendor' || group === 'platform' ? 12 : 8; }
      else if (present.length) { mismatch = true;score -= group === 'vendor' || group === 'platform' ? 24 : 12; }
      else score -= 5;
    }
    for (const id of queryMeta.excluded[group] || []) if (present.includes(id) && !wanted.some(item => present.includes(item))) score -= 12;
  }
  const lower = normalizeQuery(text);
  const normalizedTitle = normalizeQuery(doc.title);
  if (queryMeta.normalized && normalizedTitle === queryMeta.normalized) score += 20;
  else if (queryMeta.normalized && queryMeta.normalized.length >= 4 && normalizedTitle.includes(queryMeta.normalized)) score += 6;
  for (const version of queryMeta.versions || []) score += lower.includes(version) ? 5 : 0;
  for (const error of queryMeta.errors || []) score += lower.includes(error) ? 10 : 0;
  for (const model of queryMeta.models || []) score += lower.includes(model) ? 10 : 0;
  let clauseHits = 0;
  for (const clause of queryMeta.clauses || []) if (clause.some(term => lower.includes(term))) clauseHits++;
  score += clauseHits * 3;
  if (clauseHits > 1 && clauseHits === queryMeta.clauses.length) score += 5;
  return { score, requiredHits, requiredCount: queryMeta.requiredCount || 0, mismatch, clauseHits };
}
function scoreDoc(doc, terms, pathname, minimumHits = 2, pageContext = false, queryMeta = null) {
  const title = String(doc.title || '').toLowerCase();
  const section = String(doc.section || '').toLowerCase();
  const category = String(doc.category || '').toLowerCase();
  const content = String(doc.text || '').toLowerCase();
  let score = 0, hits = 0, contentHits = 0;
  for (const term of terms) {
    const weight = term.length >= 4 ? 1.7 : 1;
    const inContent = content.includes(term);
    if (inContent) contentHits++;
    if (title.includes(term)) { score += 6 * weight; hits++; }
    else if (section.includes(term)) { score += 4 * weight; hits++; }
    else if (inContent) { score += 2 * weight; hits++; }
    else if (category.includes(term)) { score += weight; hits++; }
  }
  if (hits < Math.min(minimumHits, terms.length)) return null;
  const constraints = constraintScore(doc, queryMeta);
  score += constraints.score;
  try { if (new URL(doc.url, self.location.origin).pathname.toLowerCase() === pathname.toLowerCase()) score += pageContext ? 12 : 2; } catch (_) { return null; }
  return { doc, score, hits, contentHits, requiredEntityHits: constraints.requiredHits, requiredEntityCount: constraints.requiredCount, constraintMismatch: constraints.mismatch, clauseHits: constraints.clauseHits || 0 };
}
function evidenceFor(doc, terms) {
  const pieces = String(doc.text || '').split(/[。！？!?；;]+|\.(?=\s)/).map(x => x.trim()).filter(Boolean);
  const ranked = pieces.map((piece, index) => {
    const lower = piece.toLowerCase();
    const matches = terms.filter(term => lower.includes(term));
    return { piece, index, matches, score: matches.reduce((sum, term) => sum + (term.length >= 4 ? 2 : 1), 0) };
  }).filter(row => row.score > 0).sort((a, b) => b.score - a.score || a.index - b.index);
  const chosen = [], covered = new Set();
  for (const row of ranked) {
    if (chosen.length >= 3) break;
    if (chosen.length && !row.matches.some(term => !covered.has(term))) continue;
    chosen.push(row.piece.slice(0, 240) + (row.piece.length > 240 ? '…' : ''));
    row.matches.forEach(term => covered.add(term));
  }
  return { snippets: chosen, covered: covered.size, coveredTerms: [...covered] };
}
async function readJson(url) {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'force-cache' });
  if (!response.ok) throw Error('站内索引暂不可用');
  return response.json();
}
async function manifestAt(url) {
  if (!manifestPromise) manifestPromise = readJson(url).catch(error => { manifestPromise = null; throw error; });
  const manifest = await manifestPromise;
  if (manifest.version !== 2 || !Array.isArray(manifest.shards)) throw Error('站内索引版本不匹配');
  return manifest;
}
async function shardAt(shard) {
  if (!shardCache.has(shard.url)) shardCache.set(shard.url, readJson(shard.url).catch(error => {
    shardCache.delete(shard.url); throw error;
  }));
  return shardCache.get(shard.url);
}
function shardScore(shard, terms) {
  const haystack = (shard.group + ' ' + shard.hints).toLowerCase();
  let score = 0;
  for (const term of terms) if (haystack.includes(term)) score += term.length >= 4 ? 2 : 1;
  return score;
}
function rankDocs(docs, terms, pathname, evidenceTerms = terms, minimumHits = 2, pageContext = false, queryMeta = null) {
  const rows = [];
  for (const doc of docs) {
    const row = scoreDoc(doc, terms, pathname, minimumHits, pageContext, queryMeta);
    if (row) rows.push(row);
  }
  rows.sort((a, b) => Number(a.constraintMismatch) - Number(b.constraintMismatch) || b.requiredEntityHits - a.requiredEntityHits || b.clauseHits - a.clauseHits || b.score - a.score || b.contentHits - a.contentHits || b.hits - a.hits);
  const results = [], seen = new Set();
  for (const row of rows) {
    const page = row.doc.url.split('#')[0];
    if (seen.has(page)) continue;
    seen.add(page);
    const evidence = evidenceFor(row.doc, evidenceTerms);
    results.push({ ...row, excerpt: evidence.snippets[0] || '', evidence: evidence.snippets, evidenceCoverage: evidence.covered, evidenceTerms: evidence.coveredTerms });
    if (results.length === 3) break;
  }
  return results;
}
function contradictionKey(text) {
  if (/但|而是|不过|除非/.test(text)) return null;
  const match = String(text).match(/(?:不允许|不支持|不能|无法|不可|允许|支持|可以|能够)([\u4e00-\u9fffA-Za-z0-9]{5,24})/);
  if (!match) return null;
  return {
    negative: /不允许|不支持|不能|无法|不可|不等于|并不/.test(text),
    target: match[1].slice(0, 16)
  };
}
function conflictBetween(answer) {
  for (let i = 0; i < answer.length; i++) for (let j = i + 1; j < answer.length; j++) {
    for (const leftText of answer[i].evidence) for (const rightText of answer[j].evidence) {
      const left = contradictionKey(leftText), right = contradictionKey(rightText);
      if (!left || !right || left.negative === right.negative) continue;
      if (left.target.slice(0, 5) === right.target.slice(0, 5)) {
        return { left: answer[i].doc.title, right: answer[j].doc.title };
      }
    }
  }
  return null;
}
function clarificationChoices(results, question, intent = classifyIntent(question), signals = extractSignals(question)) {
  const choices = results.length > 1 ? results.slice(0, 3).map(row => ({
    kind: 'source', label: '查《' + row.doc.title.slice(0, 15) + '》', title: row.doc.title, url: row.doc.url
  })) : [];
  const text = String(question || ''), labels = [];
  if (intent === 'troubleshoot') {
    if (!/windows|linux|ubuntu|centos|debian|macos|android|ios/i.test(text)) labels.push('补充操作系统');
    if (!signals.some(value => /\d+\.\d+/.test(value)) && !/\bversion\b|版本/i.test(text)) labels.push('补充软件与版本');
    if (!/执行|点击|启动|安装|升级|访问|连接|导入|发生在|触发/.test(text)) labels.push('补充触发步骤');
  } else if (intent === 'calculation') labels.push('补充数量与规格', '补充冗余或容量目标');
  else if (intent === 'procedure') labels.push('补充设备或软件版本', '补充目标操作');
  else if (intent === 'data') labels.push('补充工具名称', '补充备份格式或操作');
  else if (intent === 'comparison') labels.push('补充候选产品或方案', '补充关注指标');
  else if (intent === 'navigation') labels.push('补充想找的功能');
  else labels.push('补充产品或功能名称');
  for (const label of labels) if (choices.length < 4) choices.push({ kind: 'fill', label });
  return choices;
}
function suggestionsForPage(manifest, pathname) {
  const pages = Array.isArray(manifest.pages) ? manifest.pages : [];
  const page = pages.find(row => String(row.path || '').toLowerCase() === String(pathname || '').toLowerCase());
  if (!page) return [];
  const sections = Array.isArray(page.sections) ? page.sections : [];
  const haystack = (page.title + ' ' + sections.join(' ')).toLowerCase(), rows = [];
  const add = value => { if (value && !rows.includes(value) && rows.length < 3) rows.push(value); };
  if (/备份/.test(haystack)) add('这里如何导出完整备份？');
  if (/恢复|导入/.test(haystack)) add('这里如何恢复或导入数据？');
  if (/保存|数据|隐私|本地/.test(haystack)) add('当前页面的数据保存在哪里？');
  if (/导出|下载/.test(haystack)) add('这里如何导出或下载结果？');
  if (/计算|预算|容量|功率|估算/.test(haystack)) add('这里的计算需要哪些参数？');
  if (/配置|命令|操作|使用/.test(haystack)) add('这里如何完成主要操作？');
  if (/故障|排查|错误|诊断/.test(haystack)) add('这里常见问题怎么排查？');
  for (const section of sections) if (rows.length < 3 && section.length >= 2) add('“' + section.slice(0, 24) + '”部分讲了什么？');
  if (rows.length < 3 && page.title) add(page.title.slice(0, 30) + '如何使用？');
  return rows;
}
function expandCustomAliases(question, customAliases) {
  const value = String(question || ''), lower = value.toLowerCase(), additions = [];
  if (!Array.isArray(customAliases)) return value;
  for (const row of customAliases.slice(-100)) {
    const from = String(row && row.from || '').trim().toLowerCase().slice(0, 40);
    const to = String(row && row.to || '').trim().slice(0, 80);
    if (from.length >= 2 && to && lower.includes(from) && !additions.includes(to)) additions.push(to);
  }
  return value + (additions.length ? ' ' + additions.join(' ') : '');
}
async function search(question, indexUrl, pathname, context, customAliases) {
  const intent = classifyIntent(question), signals = extractSignals(question), queryMeta = analyzeQuery(question);
  const signalText = signals.join(' ');
  const expandedQuestion = expandCustomAliases(question, customAliases);
  const originalTerms = coreTermsFor(signalText + ' ' + expandedQuestion);
  if (!originalTerms.length) return { results: [], answer: [], confident: false, status: 'needs_detail', intent, signals, matchLevel: 'low', matchNote: '问题信息不足，暂时无法定位可靠原文', clarification: '请说清想完成的操作，例如“这里怎么备份”或“这页如何导出结果”。', choices: clarificationChoices([], question, intent, signals) };
  const explicitPageContext = !!(context && (context.kind === 'selection' || /这里|此处|当前|本页|这个页面|这个工具/.test(question)));
  const contextTitle = context && typeof context.title === 'string' && (!context.ambient || explicitPageContext) ? context.title.slice(0, 90) : '';
  const queryText = signalText + ' ' + expandedQuestion + (contextTitle ? ' ' + contextTitle : '');
  const terms = termsFor(queryText);
  const pageContext = !!(context && (context.kind === 'page' || context.kind === 'selection') && explicitPageContext);
  const lockUrl = context && context.lockUrl ? String(context.lockUrl).split('#')[0] : '';
  const inScope = doc => !lockUrl || doc.url.split('#')[0] === lockUrl;
  const manifest = await manifestAt(indexUrl);
  const ordered = [...manifest.shards].sort((a, b) => shardScore(b, terms) - shardScore(a, terms));
  const first = ordered.slice(0, Math.min(4, ordered.length));
  let docs = [].concat(...(await Promise.all(first.map(shardAt))));
  const wantsMultiple = intent === 'comparison' || /同时|以及/.test(question);
  const minimumHits = wantsMultiple || String(question).trim().length <= 8 ? 1 : 2;
  let results = rankDocs(docs.filter(inScope), terms, pathname, originalTerms, minimumHits, pageContext, queryMeta);
  // A weak or missing match triggers a full search; otherwise only relevant
  // topic shards are transferred. The remaining shards stay uncached until needed.
  if ((!results.length || results[0].score < 13 || results[0].contentHits === 0 || wantsMultiple) && ordered.length > first.length) {
    docs = docs.concat(...(await Promise.all(ordered.slice(first.length).map(shardAt))));
    results = rankDocs(docs.filter(inScope), terms, pathname, originalTerms, minimumHits, pageContext, queryMeta);
  }
  const top = results[0];
  const queryCoverage = top ? top.evidenceCoverage : 0;
  const sameTopic = !!top && !!context && (!context.ambient || explicitPageContext) && typeof context.url === 'string' && top.doc.url.split('#')[0] === context.url.split('#')[0];
  const requiredHits = sameTopic ? 1 : Math.min(2, originalTerms.length);
  const entityConditionsMet = !!top && !top.constraintMismatch && top.requiredEntityHits >= top.requiredEntityCount;
  const directEnough = !!top && top.contentHits >= requiredHits && top.score >= 8 && queryCoverage >= requiredHits && entityConditionsMet;
  const ambiguousBroad = !sameTopic && !queryMeta.requiredCount && originalTerms.length <= 1 && results.length > 1;
  const asksProcedure = intent === 'procedure';
  const asksNumber = intent === 'calculation';
  const evidenceText = top ? top.evidence.join(' ') : '';
  const procedureSupported = !asksProcedure || /先|再|然后|步骤|设置|配置|输入|点击|下载|打开|选择|使用|通过|在.{0,12}中/.test(evidenceText);
  const numberSupported = !asksNumber || /\d|计算|公式|估算|预算|容量|功率/.test(evidenceText);
  const confident = directEnough && procedureSupported && numberSupported && !ambiguousBroad;
  const answer = [], coveredAnswerTerms = new Set();
  if (confident) for (const row of results) {
    const novel = row.evidenceTerms.some(term => !coveredAnswerTerms.has(term));
    if (row.evidenceCoverage < (row === top ? requiredHits : 1) || (row !== top && !novel && row.score < top.score * 0.5)) continue;
    answer.push({ doc: { title: row.doc.title, url: row.doc.url, section: row.doc.section, category: row.doc.category, updated: row.doc.updated || '' }, evidence: row.evidence.slice(0, 2) });
    row.evidenceTerms.forEach(term => coveredAnswerTerms.add(term));
    if (answer.length === 3) break;
  }
  const conflict = conflictBetween(answer);
  const weakCoverage = !queryCoverage || originalTerms.length >= 4 && queryCoverage / originalTerms.length < 0.3;
  const status = !top || weakCoverage ? 'no_content' : conflict ? 'conflict' : confident ? 'answered' : 'clarify';
  const clarification = status === 'no_content' ? (intent === 'troubleshoot' && signals.length ? '已识别报错关键信息，但站内公开内容暂未找到足够依据；请补充软件名称、版本和触发步骤。' : '已检索站内公开内容，暂未找到足以回答这个具体问题的依据；可以换用产品名、功能名或完整报错再试。') :
    ambiguousBroad ? '这个问题可能对应多个页面，请先选择具体产品、工具或文章范围。' :
    top && !entityConditionsMet ? '找到相近内容，但没有同时覆盖问题中的厂商、系统或产品条件；请核对名称或补充具体型号。' :
    asksNumber && !numberSupported ? '请补充设备型号、数量及目标，并打开出处核对计算条件。' :
    asksProcedure && !procedureSupported ? '请补充具体设备或软件版本，以及想完成的操作。' :
    '请补充产品名、实际场景或具体报错，以便缩小范围。';
  const versionSensitive = /linux|ubuntu|centos|debian|windows|nginx|apache|mysql|mariadb|postgresql|redis|docker|kubernetes|k8s|cisco|huawei|华为|h3c|华三|vmware|node(?:\.js)?|python|java|版本|命令|配置|安装|部署/i.test(question);
  const coverageRatio = top && originalTerms.length ? Math.min(1, queryCoverage / originalTerms.length) : 0;
  const matchLevel = status === 'answered' && confident && coverageRatio >= 0.65 ? 'high' :
    (status === 'answered' || status === 'clarify') && top && queryCoverage ? 'medium' : 'low';
  const matchNote = matchLevel === 'high' ? (queryMeta.requiredCount ? '原文同时覆盖主要关键词以及指定厂商、系统或产品条件' : '原文直接覆盖问题中的主要关键词') :
    matchLevel === 'medium' ? '找到相关页面，但部分条件仍需补充或核对' :
    status === 'conflict' ? '来源表述存在冲突，暂不合并结论' : '现有公开内容不足以支持确定答案';
  return { results: status === 'no_content' ? [] : results, answer: status === 'no_content' ? [] : answer, confident: confident && !conflict && status === 'answered', status, intent, signals, versionSensitive, conflict: status === 'no_content' ? null : conflict, clarification, matchLevel, matchNote,
    choices: status === 'clarify' ? clarificationChoices(results, question, intent, signals) : status === 'no_content' ? clarificationChoices([], question, intent, signals) : [] };
}
self.onmessage = async function(event) {
  const { id, mode, question, indexUrl, pathname, context, customAliases } = event.data || {};
  try {
    if (mode === 'suggestions') self.postMessage({ id, suggestions: suggestionsForPage(await manifestAt(indexUrl), pathname) });
    else self.postMessage({ id, ...(await search(question, indexUrl, pathname, context, customAliases)) });
  }
  catch (error) { self.postMessage({ id, error: String(error && error.message || error) }); }
};
