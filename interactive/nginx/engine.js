import {FEATURES, RECIPES} from 'catalog.js';

export const UNSUPPORTED = [
  {re:/\b(lua|openresty|njs)\b|脚本模块/i, label:'Lua / OpenResty / njs 自定义脚本'},
  {re:/\b(grpc|grpc_pass)\b/i, label:'gRPC 代理（版本与 HTTP/2 细节需单独核对）'},
  {re:/\b(tcp|udp|stream)\b|四层负载/i, label:'TCP / UDP stream 配置'},
  {re:/\b(http3|quic)\b/i, label:'HTTP/3 / QUIC'},
  {re:/\b(cors)\b|跨域/i, label:'完整 CORS 与预检请求策略'},
  {re:/\b(jwt|oidc|oauth|sso)\b|单点登录/i, label:'身份认证集成'},
  {re:/\b(mtls)\b|双向证书/i, label:'双向 TLS'},
  {re:/主动健康检查|active health/i, label:'主动健康检查（需核对版本与产品）'},
  {re:/灰度|金丝雀|canary|ab测试|a\/b/i, label:'灰度 / 分流发布'},
  {re:/\b(waf|modsecurity)\b|防火墙规则引擎/i, label:'WAF / 第三方模块'}
];

const asciiWord = word => /^[a-z0-9_./-]+$/i.test(word);
const includesTerm = (text, word) => asciiWord(word)
  ? new RegExp(`(^|[^a-z0-9_])${word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?=$|[^a-z0-9_])`, 'i').test(text)
  : text.includes(word);

export function expandFeatures(input) {
  const features = new Set(input);
  if (features.has('spa') || features.has('staticCache')) features.add('static');
  if (features.has('forceHttps')) features.add('tls');
  if (features.has('websocket') || features.has('balance') || features.has('proxyCache') || features.has('backup')) features.add('proxy');
  if (features.has('backup')) features.add('balance');
  return features;
}

export function understand(text) {
  const input = String(text || '').trim().slice(0, 1200).toLowerCase();
  const found = new Set();
  const evidence = [];
  for (const [key, item] of Object.entries(FEATURES)) {
    const words = item.words.toLowerCase().split(/\s+/).sort((a,b)=>b.length-a.length);
    const hits = words.filter(word => includesTerm(input, word));
    if (!hits.length) continue;
    const first = hits[0];
    const index = input.indexOf(first);
    const prefix = input.slice(Math.max(0,index-8), index).trimEnd();
    if (/(?:不|勿|免|禁|关|无|非)(?:要|需要|需|用|开|启|做|设|加|建|开启|启用)?$/.test(prefix)) continue;
    found.add(key);
    evidence.push({key, hit:first});
  }
  const unsupported = UNSUPPORTED.filter(item => item.re.test(input)).map(item => item.label);
  const matched = searchRecipes(input, found, 5);
  return {features:expandFeatures(found), evidence, unsupported, matched};
}

export function searchRecipes(query, wanted = new Set(), limit = 100) {
  const text = String(query || '').trim().toLowerCase();
  const terms = text.split(/[\s,，。；;、]+/).filter(part => part.length >= 2);
  return RECIPES.map(recipe => {
    const haystack = `${recipe.title} ${recipe.group} ${recipe.terms}`.toLowerCase();
    let score = text && haystack.includes(text) ? 20 : 0;
    for (const term of terms) if (haystack.includes(term)) score += Math.min(term.length, 6) + 2;
    for (const key of wanted) if (recipe.features.includes(key)) score += 4;
    if (wanted.size) score -= Math.max(0, recipe.features.filter(key => !wanted.has(key)).length - 2);
    return {recipe,score};
  }).filter(item => !text || item.score > 0).sort((a,b)=>b.score-a.score || a.recipe.id.localeCompare(b.recipe.id)).slice(0,limit).map(item=>item.recipe);
}

const oneLine = value => String(value ?? '').trim();
const safePath = value => /^\/[A-Za-z0-9_./-]+$/.test(value) && !value.includes('//') && value.split('/').every(part=>part!=='.'&&part!=='..');
const safeHost = value => {
  if (!/^[A-Za-z0-9*._-]+$/.test(value) || value.includes('..') || value.startsWith('-')) return false;
  return /^\*\.[A-Za-z0-9.-]+$/.test(value) || /^[A-Za-z0-9_][A-Za-z0-9._-]*$/.test(value);
};
const toInt = (value,min,max) => {
  const number = Number(value);
  return Number.isInteger(number) && number>=min && number<=max ? number : null;
};

function parseBackends(source) {
  const lines = String(source || '').split(/[\n,，]+/).map(line=>line.trim()).filter(Boolean);
  const entries=[];
  const errors=[];
  if (lines.length > 12) errors.push('后端最多 12 台；请拆分服务组。');
  for (const raw of lines.slice(0,12)) {
    const match = raw.match(/^([A-Za-z0-9_.-]+|\[[0-9a-fA-F:]+\]):([0-9]{1,5})(?:\s+weight=([0-9]{1,2}))?$/);
    if (!match || !safeHost(match[1].replace(/^\[|\]$/g,'')) && !/^\[[0-9a-fA-F:]+\]$/.test(match?.[1] || '')) { errors.push(`后端格式不正确：${raw.slice(0,80)}`); continue; }
    if (match[1].startsWith('[')) { try { new URL(`http://${match[1]}:${match[2]}/`); } catch { errors.push(`IPv6 地址无效：${raw.slice(0,80)}`); continue; } }
    if (/^\d+\.\d+\.\d+\.\d+$/.test(match[1]) && match[1].split('.').some(part=>Number(part)>255)) { errors.push(`IPv4 地址无效：${match[1]}`); continue; }
    const port=toInt(match[2],1,65535), weight=match[3] ? toInt(match[3],1,99) : 1;
    if (!port || !weight) { errors.push(`端口或权重超出范围：${raw.slice(0,80)}`); continue; }
    entries.push({host:match[1],port,weight});
  }
  return {entries,errors};
}

export function buildConfig(rawFeatures, values) {
  const features=expandFeatures(rawFeatures);
  const errors=[];
  const warnings=[];
  const domain=oneLine(values.domain).toLowerCase();
  const route=oneLine(values.route || (features.has('static') && features.has('proxy') ? '/api/' : '/'));
  const root=oneLine(values.root);
  const cert=oneLine(values.cert);
  const key=oneLine(values.key);
  const authFile=oneLine(values.authFile);
  const allowIp=oneLine(values.allowIp);
  const target=oneLine(values.redirectTarget);
  const backends=parseBackends(values.backends);
  const rate=toInt(values.rate || 10,1,10000);
  const upload=toInt(values.upload || 20,1,10240);
  const timeout=toInt(values.timeout || 60,1,3600);
  const cacheDir=oneLine(values.cacheDir || '/var/cache/nginx/site');
  const algorithm=['round_robin','least_conn','ip_hash'].includes(values.algorithm) ? values.algorithm : 'round_robin';
  const edition=values.edition === 'plus' ? 'plus' : 'oss';
  if (edition==='plus') warnings.push('本页仅生成开源版通用指令；没有使用或验证 NGINX Plus 专属能力。');
  if (!features.size) errors.push('尚未选定功能，请描述需求或选择一个离线案例。');
  if (![...features].some(key=>['proxy','static','redirect','maintenance'].includes(key))) errors.push('请先选择反向代理、静态站、重定向或维护模式之一；辅助功能不能独立作为站点。');
  if (!domain || !safeHost(domain)) errors.push('请输入合法的域名或主机名；不要包含协议、路径或配置指令。');
  if (features.has('redirect') && [...features].some(key=>!['redirect','logs'].includes(key))) errors.push('整站重定向不能与静态站、反代等主服务混用；请拆成独立站点。');
  if (features.has('maintenance') && [...features].some(key=>!['maintenance','logs'].includes(key))) errors.push('整站维护模式不能与正常服务混用；请另建独立配置。');
  if (features.has('proxy')) {
    errors.push(...backends.errors);
    if (!backends.entries.length) errors.push('反向代理需要至少一台后端，格式如 192.0.2.10:8080。');
    if (features.has('balance') && backends.entries.length<2) errors.push('负载均衡至少需要两台后端。');
    if (!/^\/(?:[A-Za-z0-9_.-]+\/)*$/.test(route)) errors.push('代理路径应为 / 或 /api/ 这样的完整前缀路径。');
    if (features.has('static') && route === '/') errors.push('静态站与反代共存时，请将代理放在 /api/ 等独立路径。');
  }
  if (features.has('static') && !safePath(root)) errors.push('静态目录必须是安全的绝对路径，如 /var/www/site。');
  if (features.has('tls') && (!safePath(cert) || !safePath(key))) errors.push('HTTPS 需要填写证书及私钥在目标主机上的绝对路径；不要上传私钥。');
  if (features.has('allow') && (!/^(?:\d{1,3}\.){3}\d{1,3}\/(?:[0-9]|[12][0-9]|3[0-2])$/.test(allowIp) || allowIp.split('/')[0].split('.').some(part=>Number(part)>255))) errors.push('IP 白名单请填写合法 IPv4 CIDR，如 192.0.2.0/24。');
  if (features.has('basic') && !safePath(authFile)) errors.push('基础认证需要目标主机上的 htpasswd 文件绝对路径。');
  if (features.has('redirect') && (!/^https?:\/\/[A-Za-z0-9_.-]+(?::[0-9]{1,5})?$/.test(target) || !safeHost(target.replace(/^https?:\/\//,'').split(':')[0]) || (()=>{try{return !new URL(target).hostname;}catch{return true;}})())) errors.push('重定向目标只能填写合法站点根地址，如 https://new.example.com。');
  if (features.has('proxyCache') && !values.publicCache) errors.push('代理缓存仅用于确认不含用户私有数据的公共内容；请勾选确认，或关闭该功能。');
  if (features.has('proxyCache') && !safePath(cacheDir)) errors.push('代理缓存目录必须是安全的绝对路径。');
  if (features.has('rate') && !rate) errors.push('限流速率须为每秒 1–10000 次。');
  if (features.has('upload') && !upload) errors.push('上传大小须为 1–10240 MiB。');
  if (features.has('timeout') && !timeout) errors.push('超时须为 1–3600 秒。');
  if (features.has('backup') && algorithm==='ip_hash') errors.push('NGINX 的 ip_hash 不能与 backup 后端同时使用；请改用轮询或最少连接。');
  if (features.has('proxyCache')) warnings.push('示例缓存只适合公开 GET/HEAD 内容。含用户身份或个性化结果时，请另行审查所有 Cookie 与授权头。');
  if (features.has('basic')) warnings.push('页面只引用目标主机上的 htpasswd 文件，不生成或保存密码。');
  if (features.has('security') && features.has('tls')) warnings.push('未自动加入 HSTS；只有确认整个域名长期提供 HTTPS 后，再自行评估启用。');
  if (features.has('redirect') && !features.has('tls')) warnings.push('此示例只监听旧域名的 HTTP 80 端口；旧域名的 HTTPS 跳转还需要原域名证书。');
  const isDemo=/(^|\.)(example\.(?:com|org|net)|example)$/.test(domain) || backends.entries.some(item=>/^(?:192\.0\.2\.|198\.51\.100\.|203\.0\.113\.|\[2001:db8:)/i.test(item.host));
  if (isDemo) warnings.push('包含示例域名或文档专用 IP：这是学习草案，不要直接上线。');
  if (errors.length) return {code:'',errors,warnings,isDemo,canExport:false};

  const lines=[];
  const add=(indent,line='')=>lines.push(`${'  '.repeat(indent)}${line}`);
  add(0,'# NGINX 配置工作台生成的独立示例；部署前核对路径、版本、模块与现有配置。');
  add(0,`# 目标产品选择：${edition==='plus'?'NGINX Plus（此处仍使用通用指令）':'NGINX Open Source'}。`);
  add(0,'worker_processes auto;');
  add(0,'events { worker_connections 1024; }');
  add(0,'http {');
  add(1,'include mime.types;');
  add(1,'default_type application/octet-stream;');
  if (features.has('websocket')) {
    add(1,'map $http_upgrade $connection_upgrade {');
    add(2,'default upgrade;'); add(2,"'' close;"); add(1,'}');
  }
  if (features.has('rate')) add(1,`limit_req_zone $binary_remote_addr zone=perip:10m rate=${rate}r/s;`);
  if (features.has('proxyCache')) add(1,`proxy_cache_path ${cacheDir} levels=1:2 keys_zone=public_cache:10m max_size=1g inactive=30m;`);
  if (features.has('gzip')) { add(1,'gzip on;'); add(1,'gzip_types text/plain text/css application/javascript application/json image/svg+xml;'); }
  if (features.has('proxy')) {
    add(1,'upstream app_backend {');
    if (features.has('balance') && algorithm!=='round_robin') add(2,`${algorithm};`);
    backends.entries.forEach((backend,index)=>add(2,`server ${backend.host}:${backend.port}${backend.weight>1 ? ` weight=${backend.weight}` : ''}${features.has('backup') && index===backends.entries.length-1 ? ' backup' : ''};`));
    add(1,'}');
  }
  if (features.has('tls') && features.has('forceHttps')) {
    add(1,'server {'); add(2,'listen 80;'); add(2,`server_name ${domain};`); add(2,'return 301 https://$host$request_uri;'); add(1,'}');
  }
  add(1,'server {');
  add(2,features.has('tls') ? 'listen 443 ssl;' : 'listen 80;');
  add(2,`server_name ${domain};`);
  if (features.has('tls')) { add(2,`ssl_certificate ${cert};`); add(2,`ssl_certificate_key ${key};`); add(2,'ssl_protocols TLSv1.2 TLSv1.3;'); }
  if (features.has('logs')) { add(2,'access_log /var/log/nginx/access.log combined;'); add(2,'error_log /var/log/nginx/error.log warn;'); }
  if (features.has('security')) { add(2,'add_header X-Content-Type-Options nosniff always;'); add(2,'add_header Referrer-Policy strict-origin-when-cross-origin always;'); }
  if (features.has('upload')) add(2,`client_max_body_size ${upload}m;`);
  if (features.has('redirect')) add(2,`return 301 ${target}$request_uri;`);
  else if (features.has('maintenance')) { add(2,'add_header Retry-After 3600 always;'); add(2,'return 503 "维护中，请稍后再试";'); }
  else {
    if (features.has('proxy')) {
      add(2,`location ${features.has('static') ? '^~ ' : ''}${route} {`);
      if (features.has('allow')) { add(3,`allow ${allowIp};`); add(3,'deny all;'); }
      if (features.has('basic')) { add(3,'auth_basic "Restricted";'); add(3,`auth_basic_user_file ${authFile};`); }
      if (features.has('rate')) add(3,'limit_req zone=perip burst=20 nodelay;');
      add(3,`proxy_pass http://app_backend${values.stripPrefix && route!=='/' ? '/' : ''};`);
      add(3,'proxy_set_header Host $host;'); add(3,'proxy_set_header X-Real-IP $remote_addr;'); add(3,'proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;'); add(3,'proxy_set_header X-Forwarded-Proto $scheme;');
      if (features.has('websocket')) { add(3,'proxy_http_version 1.1;'); add(3,'proxy_set_header Upgrade $http_upgrade;'); add(3,'proxy_set_header Connection $connection_upgrade;'); }
      if (features.has('timeout')) add(3,`proxy_read_timeout ${timeout}s;`);
      if (features.has('proxyCache')) { add(3,'proxy_cache public_cache;'); add(3,'proxy_cache_methods GET HEAD;'); add(3,'proxy_cache_valid 200 10m;'); add(3,'proxy_cache_bypass $http_authorization $http_cookie;'); add(3,'proxy_no_cache $http_authorization $http_cookie;'); }
      add(2,'}');
    }
    if (features.has('static')) {
      add(2,'location / {');
      if (features.has('allow')) { add(3,`allow ${allowIp};`); add(3,'deny all;'); }
      if (features.has('basic')) { add(3,'auth_basic "Restricted";'); add(3,`auth_basic_user_file ${authFile};`); }
      if (features.has('rate')) add(3,'limit_req zone=perip burst=20 nodelay;');
      add(3,`root ${root};`);
      add(3,features.has('spa') ? 'try_files $uri $uri/ /index.html;' : 'try_files $uri $uri/ =404;');
      add(2,'}');
      if (features.has('staticCache')) { add(2,'location ~* \\.(?:css|js|png|jpe?g|gif|svg|webp|woff2?)$ {'); add(3,`root ${root};`); add(3,'expires 7d;'); add(2,'}'); }
    }
  }
  add(1,'}'); add(0,'}');
  const checks=[`nginx -t`, features.has('tls') ? `curl -I https://${domain}/` : `curl -I http://${domain}/`];
  if (features.has('proxy') && route!=='/') checks.push(`curl -I ${features.has('tls')?'https':'http'}://${domain}${route}`);
  if (features.has('forceHttps')) checks.push(`curl -I http://${domain}/  # 预期 301`);
  if (features.has('maintenance')) checks.push(`curl -I http://${domain}/  # 预期 503`);
  checks.push('nginx -s reload  # 仅在 nginx -t 成功且已备份后执行');
  return {code:lines.join('\n')+'\n',checks,errors,warnings,isDemo,canExport:!isDemo,edition};
}

export function inspectConfig(source) {
  const text=String(source || '').slice(0,800000);
  const lines=text.split(/\r?\n/);
  const findings=[];
  let depth=0;
  for (let i=0;i<lines.length;i++) {
    const line=lines[i].replace(/#.*$/,'');
    for (const char of line) { if (char==='{') depth++; else if (char==='}') depth--; if (depth<0) { findings.push({line:i+1,level:'error',message:'关闭大括号没有对应的开启大括号。'}); depth=0; } }
    if (/\bssl_protocols\b[^;]*\b(?:SSLv3|TLSv1(?:\.0|\.1)?)\b/i.test(line)) findings.push({line:i+1,level:'warn',message:'存在较旧的 TLS/SSL 协议设置，请核对安全要求。'});
    if (/\bproxy_pass\s+http:\/\//i.test(line) && /\/$/.test(line.trim().replace(/;$/,''))) findings.push({line:i+1,level:'note',message:'proxy_pass URL 以 / 结尾时，前缀路径可能被替换；请用“请求去向”检查。'});
    if (/\bserver_tokens\s+on\s*;/i.test(line)) findings.push({line:i+1,level:'note',message:'server_tokens on 会展示版本信息；按需审查。'});
  }
  if (depth) findings.push({line:lines.length,level:'error',message:`配置还有 ${depth} 个未闭合的大括号。`});
  const count = pattern => (text.match(pattern) || []).length;
  return {bytes:new TextEncoder().encode(text).length,servers:count(/\bserver\s*\{/g),upstreams:count(/\bupstream\s+[^\s{]+\s*\{/g),locations:count(/\blocation\s+[^\n{]+\{/g),includes:count(/\binclude\s+[^;]+;/g),findings,limited:true};
}
