/* yj-lite-search */
(function(){if(window.__yjLiteSearch)return;window.__yjLiteSearch=1;var docs,loading,aliases={fanghuoqiang:['防火墙','firewall'],firewall:['防火墙'],jiaohuanji:['交换机','switch'],switch:['交换机'],luyouqi:['路由器','router'],router:['路由器'],fuwuqi:['服务器','server'],server:['服务器'],yunwei:['运维','ops'],ops:['运维'],wangluo:['网络','network'],network:['网络'],mima:['密码','password'],password:['密码'],chongzhi:['重置','reset'],reset:['重置'],anzhuang:['安装','install'],install:['安装'],peizhi:['配置','config'],config:['配置'],guzhang:['故障','error'],jifang:['机房'],ruodian:['弱电'],jiankong:['监控','monitoring'],monitoring:['监控'],dayinji:['打印机','printer'],printer:['打印机'],huiyi:['会议','meeting'],meeting:['会议'],xunihuaji:['虚拟化','vmware'],shujuku:['数据库','database'],database:['数据库'],shujuzhongxin:['数据中心'],winserver:['windows server'],windowsserver:['windows server'],ubuntuserver:['ubuntu server']};function e(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}function re(s){return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}function highlight(s,words){var out=e(s);words.forEach(function(w){if(!w)return;out=out.replace(new RegExp('('+re(e(w))+')','ig'),'<mark>$1</mark>')});return out}function expand(words){var seen={},out=[];words.forEach(function(w){[w].concat(aliases[w]||[]).forEach(function(v){v=String(v||'').toLowerCase();if(v&&!seen[v]){seen[v]=1;out.push(v)}})});return out}function load(){if(docs)return Promise.resolve(docs);if(loading)return loading;loading=fetch('/assets/static/search-lite-3f9045be592e.json',{cache:'force-cache'}).then(function(r){if(!r.ok)throw Error();return r.json()}).then(function(x){docs=Array.isArray(x)?x:[];return docs});return loading}function keywordText(d){return Array.isArray(d.keywords)?d.keywords.join(' '):(d.keywords||'')}function score(d,words,q){var t=(d.title||'').toLowerCase(),c=(d.category||'').toLowerCase(),s=(d.summary||'').toLowerCase(),k=keywordText(d).toLowerCase(),n=0;if(t===q)n+=50;else if(t.indexOf(q)===0)n+=30;else if(t.indexOf(q)>=0)n+=20;words.forEach(function(w){if(t.indexOf(w)>=0)n+=14;if(c.indexOf(w)>=0)n+=6;if(k.indexOf(w)>=0)n+=5;if(s.indexOf(w)>=0)n+=2});return n}function related(rows,q){var chars=Array.from(q.replace(/\s+/g,'')),seen={},unique=[];chars.forEach(function(ch){if(!seen[ch]){seen[ch]=1;unique.push(ch)}});return rows.map(function(d){var text=((d.title||'')+' '+(d.category||'')+' '+keywordText(d)).toLowerCase(),n=0;unique.forEach(function(ch){if(text.indexOf(ch)>=0)n++});return{d:d,n:n}}).filter(function(x){return x.n>0}).sort(function(a,b){return b.n-a.n||String(a.d.title).length-String(b.d.title).length}).slice(0,3)}function matchedKeywords(d,words){if(!Array.isArray(d.keywords))return[];return d.keywords.filter(function(k){var value=String(k).toLowerCase();return words.some(function(w){return value.indexOf(w)>=0})}).slice(0,2)}function item(d,words){var matched=matchedKeywords(d,words),extra=matched.length?'<em class="yj-lite-search-keywords">命中章节：'+matched.map(function(k){return highlight(k,words)}).join(' · ')+'</em>':'';return'<a class="yj-lite-search-item" href="'+e(d.url)+'"><div class="yj-lite-search-titleline"><strong>'+highlight(d.title,words)+'</strong><em class="yj-lite-search-category">'+highlight(d.category,words)+'</em></div><span>'+highlight(d.summary,words)+'</span>'+extra+'</a>'}function bind(){var old=document.querySelector('#book-search-input input');if(!old||old.dataset.yjLite)return;var input=old.cloneNode(true),box=document.createElement('div');input.dataset.yjLite='1';old.parentNode.replaceChild(input,old);box.id='yj-lite-search-results';input.parentNode.appendChild(box);function render(){var q=input.value.trim().toLowerCase();if(q.length<2){box.innerHTML='';return}load().then(function(rows){if(input.value.trim().toLowerCase()!==q)return;var baseWords=q.split(/\s+/).filter(Boolean),words=expand(baseWords),ranked=rows.map(function(d){return{d:d,n:score(d,words,q)}}).filter(function(x){return x.n>0}).sort(function(a,b){return b.n-a.n||String(a.d.title).length-String(b.d.title).length}),found=ranked.slice(0,20);if(found.length){box.innerHTML='<div class="yj-lite-search-count">找到 '+ranked.length+' 篇相关文章，显示前 '+found.length+' 篇</div>'+found.map(function(x){return item(x.d,words)}).join('');return}var near=related(rows,q),html='<div class="yj-lite-search-empty"><b>未找到完整匹配</b><p>可尝试缩短关键词、使用文章标题、目录名称或常用拼音。</p></div>';if(near.length){html+='<div class="yj-lite-search-suggest"><b>相近文章</b>'+near.map(function(x){return'<a href="'+e(x.d.url)+'">'+e(x.d.title)+' <span>· '+e(x.d.category)+'</span></a>'}).join('')+'</div>'}box.innerHTML=html}).catch(function(){box.innerHTML='<div class="yj-lite-search-empty"><b>搜索索引加载失败</b><p>请稍后重试。</p></div>'})}input.addEventListener('input',render);input.addEventListener('keydown',function(ev){if(ev.key==='Escape'){input.value='';box.innerHTML=''}});document.addEventListener('click',function(ev){if(!input.parentNode.contains(ev.target))box.innerHTML=''})}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();new MutationObserver(bind).observe(document.documentElement,{childList:true,subtree:true})})();

/* yj-dashboard-pjax */
(function(){if(window.__yjEsaDashboard)return;window.__yjEsaDashboard=1;var timer;function e(s){return String(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}function norm(v){try{var u=new URL(String(v||'/'),location.href),p=decodeURIComponent(u.pathname||'/').replace(/\\/g,'/').replace(/\/+/g,'/');if(p==='index-2.html')p='/';return p}catch(x){return String(v||'/')}}function titles(){var map={'/':'\u9996\u9875'};document.querySelectorAll('.book-summary a[href],.summary a[href]').forEach(function(a){var p=norm(a.getAttribute('href')),t=(a.textContent||'').replace(/\s+/g,' ').trim();if(t&&p&&p!=='/'&&!/^javascript:/i.test(p))map[p]=t});return map}function labelPath(path,map){var p=norm(path);if(map[p])return map[p];if(p==='/')return '\u9996\u9875';var last=p.split('/').pop()||p;try{last=decodeURIComponent(last)}catch(x){}return last.replace(/\.html?$/i,'')||'\u672a\u77e5\u9875\u9762'}function labelRegion(v){var k=String(v==null?'':v).trim(),m={'beijing':'北京','tianjin':'天津','shanghai':'上海','chongqing':'重庆','hebei':'河北','shanxi':'山西','inner mongolia':'内蒙古','neimenggu':'内蒙古','liaoning':'辽宁','jilin':'吉林','heilongjiang':'黑龙江','jiangsu':'江苏','zhejiang':'浙江','anhui':'安徽','fujian':'福建','jiangxi':'江西','shandong':'山东','henan':'河南','hubei':'湖北','hunan':'湖南','guangdong':'广东','guangxi':'广西','hainan':'海南','sichuan':'四川','guizhou':'贵州','yunnan':'云南','tibet':'西藏','xizang':'西藏','shaanxi':'陕西','gansu':'甘肃','qinghai':'青海','ningxia':'宁夏','xinjiang':'新疆','hong kong':'香港','macau':'澳门','taiwan':'台湾'};if(!k||/^(?:-|unknown|null|undefined|none|other|0)$/i.test(k))return '\\u672a\\u77e5';return m[k.toLowerCase()]||k}function chart(rows){if(!rows||!rows.length)return '';var w=760,h=250,l=45,r=18,t=24,b=38,max=Math.max.apply(null,rows.map(function(x){return +x.pageViews||0}))||1,iw=w-l-r,ih=h-t-b,pts=rows.map(function(x,i){return(l+iw*(rows.length===1?.5:i/(rows.length-1))).toFixed(1)+','+(t+ih-(+x.pageViews||0)/max*ih).toFixed(1)}).join(' '),grid=[0,.5,1].map(function(n){var y=t+ih*(1-n);return'<line x1="'+l+'" y1="'+y+'" x2="'+(w-r)+'" y2="'+y+'"/><text x="'+(l-8)+'" y="'+(y+4)+'" text-anchor="end">'+Math.round(max*n)+'</text>'}).join(''),labels=rows.map(function(x,i){return'<text x="'+(l+iw*(rows.length===1?.5:i/(rows.length-1))).toFixed(1)+'" y="'+(h-12)+'" text-anchor="middle">'+e((x.date||'').slice(5))+'</text>'}).join('');return'<section class="yjtrend"><h2>\u8fd1 7 \u5929\u9875\u9762\u6d4f\u89c8\u8d8b\u52bf</h2><div class="yjlegend"><i class="pv"></i>ESA \u9875\u9762\u6d4f\u89c8\u91cf</div><svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="ESA page view trend"><g class="grid">'+grid+'</g><g class="axislabels">'+labels+'</g><polyline class="pvline" points="'+pts+'"/></svg></section>'}function pathList(rows,map){return'<ol class="yj-top-list">'+(rows||[]).map(function(x){var raw=String(x.path||'/'),name=labelPath(raw,map),v=+x.pageViews||0;return'<li><a data-yj-hotpath="1" href="'+e(raw)+'">'+e(name)+'</a> <b>'+v+'</b></li>'}).join('')+'</ol>'}function regionList(rows){return'<ol class="yj-top-list">'+(rows||[]).map(function(x){return'<li>'+e(labelRegion(x.region))+' <b>'+(+x.requests||0)+'</b></li>'}).join('')+'</ol>'}function run(){var root=document.getElementById('yj-website-data');if(!root||root.dataset.yjLoading||root.dataset.yjReady)return;root.dataset.yjLoading='1';fetch('stats/dashboard5615.json?ts='+Date.now(),{cache:'no-store'}).then(function(r){if(!r.ok)throw Error();return r.json()}).then(function(d){if(d.source!=='ESA')throw Error();var map=titles();root.innerHTML='<div class="yjcards yj-esa-cards"><div><b>'+ (+d.todayPageViews||0)+'</b><span>\u4eca\u65e5\u9875\u9762\u6d4f\u89c8\u91cf\uff08ESA\uff09</span></div><div><b>'+ (+d.todayRequests||0)+'</b><span>\u4eca\u65e5\u603b\u8bf7\u6c42\u6570\uff08ESA\uff09</span></div><div><b>'+ (+d.sevenDayPageViews||0)+'</b><span>\u8fd1 7 \u5929\u9875\u9762\u6d4f\u89c8\u91cf\uff08ESA\uff09</span></div></div>'+chart(d.trend||[])+'<div class="yj-data-grid"><section><h2>\u4eca\u65e5\u70ed\u95e8\u9875\u9762</h2>'+pathList(d.todayTopPaths,map)+'</section><section><h2>\u8fd1 7 \u5929\u70ed\u95e8\u9875\u9762</h2>'+pathList(d.topPaths,map)+'</section><section class="yj-region-panel"><h2>\u8bbf\u5ba2\u5730\u57df Top 5</h2>'+regionList(d.topRegions)+'</section></div>';root.onclick=function(ev){var a=ev.target&&ev.target.closest?ev.target.closest('a[data-yj-hotpath]'):null;if(!a)return;ev.preventDefault();ev.stopImmediatePropagation();window.location.href=a.getAttribute('href')};root.dataset.yjReady='1';delete root.dataset.yjLoading}).catch(function(){root.textContent='ESA \u7edf\u8ba1\u6570\u636e\u6682\u65f6\u65e0\u6cd5\u52a0\u8f7d\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002';delete root.dataset.yjLoading})}function schedule(){clearTimeout(timer);timer=setTimeout(run,80)}function bind(){schedule();if(window.gitbook&&gitbook.events)gitbook.events.bind('page.change',schedule);new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true})}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind()})();

/* yj-dashboard-requests-card */
(function(){if(window.__yjDashboardRequestsCard)return;window.__yjDashboardRequestsCard=1;var timer;function addCard(cards,value){if(cards.querySelector('.yj-seven-day-requests'))return;var card=document.createElement('div');card.className='yj-seven-day-requests';card.innerHTML='<b>'+value+'</b><span>近 7 天总请求数（ESA）</span>';cards.appendChild(card)}function render(){var root=document.getElementById('yj-website-data');if(!root)return;var cards=root.querySelector('.yj-esa-cards');if(!cards||cards.querySelector('.yj-seven-day-requests'))return;fetch('stats/dashboard5615.json?ts='+Date.now(),{cache:'no-store'}).then(function(r){if(!r.ok)throw Error();return r.json()}).then(function(d){if(d.source!=='ESA'||!root.contains(cards))return;var requests=Number(d.sevenDayRequests);if(!isFinite(requests))requests=(d.trend||[]).reduce(function(sum,row){return sum+(Number(row.requests)||0)},0);addCard(cards,requests)}).catch(function(){})}function schedule(){clearTimeout(timer);timer=setTimeout(render,160)}function bind(){schedule();if(window.gitbook&&gitbook.events)gitbook.events.bind('page.change',schedule);new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true})}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind()})();

/* yj-region-split */
(function(){if(window.__yjRegionSplit)return;window.__yjRegionSplit=1;var timer;function e(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}function label(v){var k=String(v==null?'':v).trim(),m={'beijing':'北京','tianjin':'天津','shanghai':'上海','chongqing':'重庆','hebei':'河北','shanxi':'山西','inner mongolia':'内蒙古','neimenggu':'内蒙古','liaoning':'辽宁','jilin':'吉林','heilongjiang':'黑龙江','jiangsu':'江苏','zhejiang':'浙江','anhui':'安徽','fujian':'福建','jiangxi':'江西','shandong':'山东','henan':'河南','hubei':'湖北','hunan':'湖南','guangdong':'广东','guangxi':'广西','hainan':'海南','sichuan':'四川','guizhou':'贵州','yunnan':'云南','tibet':'西藏','xizang':'西藏','shaanxi':'陕西','gansu':'甘肃','qinghai':'青海','ningxia':'宁夏','xinjiang':'新疆','hong kong':'香港','macau':'澳门','taiwan':'台湾'};if(!k||/^(?:-|unknown|null|undefined|none|other|0)$/i.test(k))return'未知';return m[k.toLowerCase()]||k}function countryLabel(v){var code=String(v==null?'':v).trim().toUpperCase(),m={US:'美国',NL:'荷兰',SG:'新加坡',DE:'德国',HK:'中国香港',TW:'中国台湾',JP:'日本',RU:'俄罗斯',MX:'墨西哥',KR:'韩国',GB:'英国',CA:'加拿大',AU:'澳大利亚',FR:'法国',IN:'印度'};if(!code||code==='-')return'未识别';if(m[code])return m[code];try{if(window.Intl&&Intl.DisplayNames){var name=new Intl.DisplayNames(['zh-CN'],{type:'region'}).of(code);if(name)return name}}catch(x){}return code}function list(rows){return'<ol class="yj-top-list">'+(rows||[]).map(function(x){return'<li>'+e(label(x.region))+' <b>'+(+x.requests||0)+'</b></li>'}).join('')+'</ol>'}function countryList(rows){return'<ol class="yj-top-list">'+(rows||[]).map(function(x){return'<li>'+e(countryLabel(x.country))+' <b>'+(+x.requests||0)+'</b></li>'}).join('')+'</ol>'}function render(){var root=document.getElementById('yj-website-data');if(!root||!root.dataset.yjReady||root.dataset.yjRegionReady)return;fetch('/stats/dashboard.json?ts='+Date.now(),{cache:'no-store'}).then(function(r){if(!r.ok)throw Error();return r.json()}).then(function(d){var grid=root.querySelector('.yj-data-grid'),old=grid&&grid.querySelector('.yj-region-panel');if(!old)return;old.outerHTML='<section><h2>今日访客地域 Top 10</h2>'+list(d.todayTopRegions)+'</section><section><h2>近 7 天访客地域 Top 10</h2>'+list(d.topRegions)+'</section><section class="yj-country-card"><h2>今日海外 Top 10</h2>'+countryList(d.todayTopOverseasCountries)+'</section><section class="yj-country-card yj-period-seven"><h2>近 7 天海外 Top 10</h2>'+countryList(d.topOverseasCountries)+'</section>';root.dataset.yjRegionReady='1'}).catch(function(){})}function schedule(){clearTimeout(timer);timer=setTimeout(render,120)}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule);else schedule();new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true})})();

/* yj-region-map */
(function(){
  if(window.__yjRegionMapDirect)return;
  window.__yjRegionMapDirect=1;
  var busy=false,geo;
  var names={beijing:'北京',tianjin:'天津',shanghai:'上海',hebei:'河北',shanxi:'山西','inner mongolia':'内蒙古',neimenggu:'内蒙古',liaoning:'辽宁',jilin:'吉林',heilongjiang:'黑龙江',jiangsu:'江苏',zhejiang:'浙江',anhui:'安徽',fujian:'福建',jiangxi:'江西',shandong:'山东',henan:'河南',hubei:'湖北',hunan:'湖南',guangdong:'广东',guangxi:'广西',hainan:'海南',sichuan:'四川',guizhou:'贵州',yunnan:'云南',shaanxi:'陕西',gansu:'甘肃',qinghai:'青海',ningxia:'宁夏',xinjiang:'新疆',tibet:'西藏'};
  var pos={'北京':[116.4,39.9],'天津':[117.2,39.1],'上海':[121.5,31.2],'河北':[114.5,38],'山西':[112.5,37.9],'内蒙古':[111.7,40.8],'辽宁':[123.4,41.8],'吉林':[125.3,43.8],'黑龙江':[126.6,45.8],'江苏':[118.8,32.1],'浙江':[120.2,30.3],'安徽':[117.2,31.8],'福建':[119.3,26.1],'江西':[115.8,28.7],'山东':[117,36.6],'河南':[113.6,34.8],'湖北':[114.3,30.6],'湖南':[112.9,28.2],'广东':[113.3,23.1],'广西':[108.3,22.8],'海南':[110.3,20],'四川':[104.1,30.7],'贵州':[106.7,26.6],'云南':[102.7,25],'陕西':[108.9,34.3],'甘肃':[103.8,36.1],'青海':[101.8,36.6],'宁夏':[106.2,38.5],'新疆':[87.6,43.8],'西藏':[91.1,29.6]};
  /* 京津鲁沪标签使用独立固定坐标，避免相邻省市文字互相覆盖。 */
  var fixed={
    '天津':[690,238,'start'],
    '山东':[642,286,'end'],
    '上海':[736,344,'start'],
    '河北':[610,252,'end'],
    '浙江':[710,390,'start'],
    '内蒙古':[574,208,'end'],
    '河南':[602,304,'end']
  };
  var shift={'北京':[-16,-16],'江苏':[-20,-12],'浙江':[10,16],'河北':[-10,-5],'河南':[-10,-6],'湖北':[-9,6],'广东':[5,9]};
  function xy(p){return[80+(p[0]-73)/62*820,52+(54-p[1])/36*455]}
  function ring(a){return a.map(function(p,i){var q=xy(p);return(i?'L':'M')+q[0].toFixed(1)+' '+q[1].toFixed(1)}).join('')+'Z'}
  function shape(g){return g.type==='Polygon'?g.coordinates.map(ring).join(''):g.coordinates.map(function(a){return a.map(ring).join('')}).join('')}
  function curve(a,b){var x=(a[0]+b[0])/2+(b[1]-a[1])*.11,y=(a[1]+b[1])/2-(b[0]-a[0])*.07;return'M '+a[0]+' '+a[1]+' Q '+x.toFixed(1)+' '+y.toFixed(1)+' '+b[0]+' '+b[1]}
  function draw(){
    var root=document.getElementById('yj-website-data');
    if(!root||!root.dataset.yjReady||root.querySelector('#yj-region-map')||busy)return;
    busy=true;
    Promise.all([
      fetch('/stats/dashboard.json?ts='+Date.now(),{cache:'no-store'}).then(function(r){return r.json()}),
      geo?Promise.resolve(geo):fetch('/assets/china-geo-v1.json').then(function(r){return r.json()})
    ]).then(function(a){
      geo=a[1];
      var rows=(a[0].todayTopRegions||[]).map(function(x){var raw=String(x.region||'').trim(),name=names[raw.toLowerCase()]||(pos[raw]?raw:'');return{name:name,value:+x.requests||0}}).filter(function(x){return x.name&&pos[x.name]}).slice(0,10),hot={};
      rows.forEach(function(x){hot[x.name]=1});
      var land=geo.features.map(function(f){var n=String(f.properties.name||'').replace(/[省市壮族回族维吾尔自治区特别行政区]/g,'');return'<path class="yj-map-province'+(hot[n]?' hot':'')+'" d="'+shape(f.geometry)+'"/>'}).join('');
      var hub=xy([116.4,39.9]),max=Math.max.apply(null,rows.map(function(x){return x.value}).concat([1])),color=['#55e8ff','#819cff','#b479ff','#ffd95e','#4ee3a8'];
      var flow=rows.map(function(x,i){
        var d=xy(pos[x.name]),f=fixed[x.name],o=shift[x.name]||[0,0],lx=f?f[0]:d[0]+9+o[0],ly=f?f[1]:d[1]-7+o[1],an=f?f[2]:'start',c=color[i%5],w=(1.6+4*x.value/max).toFixed(1);
        return'<g style="--s:'+(1.7+i%4*.25)+'s;color:'+c+'"><path class="yj-map-flow" d="'+curve(hub,d)+'" stroke="'+c+'" stroke-width="'+w+'"/><path class="yj-map-flow-glow" d="'+curve(hub,d)+'" stroke-width="1.2"/><circle class="yj-map-dot" cx="'+d[0]+'" cy="'+d[1]+'" r="5"/><text class="yj-map-label" x="'+lx+'" y="'+ly+'" text-anchor="'+an+'">'+x.name+'</text><text class="yj-map-value" x="'+lx+'" y="'+(ly+14)+'" text-anchor="'+an+'">'+x.value.toLocaleString()+'</text></g>'
      }).join('');
      root.insertAdjacentHTML('beforeend','<section id="yj-region-map" class="yj-region-map"><div class="yj-region-map-head"><h2 class="yj-region-map-title">今日访客地域流向</h2><p class="yj-region-map-note">今日 Top '+rows.length+' 地域 · ESA 数据每 15 分钟同步</p></div><svg viewBox="0 0 1000 570">'+land+flow+'<circle class="yj-map-hub" cx="'+hub[0]+'" cy="'+hub[1]+'" r="8"/></svg></section>')
    }).catch(function(){}).then(function(){busy=false})
  }
  function start(){setTimeout(draw,250)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
  if(window.gitbook&&gitbook.events)gitbook.events.bind('page.change',start);
  setInterval(draw,5000)
})();

/* yj-dashboard-polish */
(function(){
  if(window.__yjDashboardPolish)return;
  window.__yjDashboardPolish=1;
  var timer;
  function setStatus(root){
    var status=root.querySelector('.yj-dashboard-status');
    if(!status){status=document.createElement('div');status.className='yj-dashboard-status';root.insertBefore(status,root.firstChild);}
    status.textContent='统计数据同步中…';
    fetch('/stats/dashboard.json?ts='+Date.now(),{cache:'no-store'}).then(function(response){if(!response.ok)throw Error();return response.json()}).then(function(data){status.textContent='统计数据更新时间：'+(data.updatedAt||'未知')+'（ESA 每 15 分钟同步一次）';}).catch(function(){status.textContent='统计数据每 15 分钟自动同步；当前更新时间暂时无法读取。';});
  }
  function render(){
    var root=document.getElementById('yj-website-data');
    if(!root||!root.dataset.yjReady||root.dataset.yjPolished)return;
    var cards=root.querySelectorAll('.yj-data-grid>section');
    if(cards.length<4)return;
    cards.forEach(function(card,index){
      card.classList.add('yj-ranking-card');
      if(index===1||index===3)card.classList.add('yj-period-seven');
      if(card.classList.contains('yj-country-card'))card.classList.add('yj-country-card');
      else if(index>1)card.classList.add('yj-region-card');
      var heading=card.querySelector('h2');
      if(heading&&!heading.querySelector('.yj-card-mark')){var title=heading.textContent;heading.innerHTML='<span class="yj-card-mark"></span>'+title;}
      card.querySelectorAll('.yj-top-list li').forEach(function(item,rank){if(!item.querySelector('.yj-rank')){var badge=document.createElement('span');badge.className='yj-rank';badge.textContent=rank+1;item.insertBefore(badge,item.firstChild);}});
    });
    setStatus(root);
    root.dataset.yjPolished='1';
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(render,140)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule);else schedule();
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
})();

/* yj-article-catalog */
(function(){
  if(window.__yjArticleCatalog)return;window.__yjArticleCatalog=1;var timer;
  function idFor(title,index){return'yj-catalog-'+index+'-'+title.toLowerCase().replace(/[^\w\u4e00-\u9fff]+/g,'-').replace(/^-|-$/g)}
  function scrollToCard(card){card.scrollIntoView({behavior:'smooth',block:'start'});if(history.replaceState)history.replaceState(null,'','#'+card.id)}
  function run(){
    var sec=document.querySelector('.markdown-section');if(!sec||sec.dataset.yjCatalogDone)return;
    var h1=sec.querySelector('h1');if(!h1||h1.textContent.indexOf('文章目录')<0)return;
    var heads=Array.prototype.slice.call(sec.children).filter(function(x){return x.tagName==='H2'});if(!heads.length)return;
    var old=sec.querySelector('.yj-article-toc');if(old)old.remove();
    var nav=document.createElement('nav'),navTitle=document.createElement('div'),navList=document.createElement('ul');nav.className='yj-catalog-nav';nav.setAttribute('aria-label','文章分类导航');navTitle.className='yj-catalog-nav-title';navTitle.textContent='分类导航';navList.className='yj-catalog-nav-list';nav.appendChild(navTitle);nav.appendChild(navList);
    var grid=document.createElement('div');grid.className='yj-catalog-grid';sec.insertBefore(nav,heads[0]);sec.insertBefore(grid,heads[0]);
    var tool=document.createElement('div');tool.className='yj-catalog-tools';tool.innerHTML='<input class="yj-catalog-search" type="search" placeholder="输入关键词筛选文章"><button class="yj-catalog-toggle" type="button">展开所有分类</button>';sec.insertBefore(tool,grid);
    heads.forEach(function(h,index){
      var card=document.createElement('section'),button=document.createElement('button'),body=document.createElement('div'),title=h.textContent.trim(),n=h.nextElementSibling,count=0,navButton=document.createElement('button');
      card.className='yj-catalog-card';card.id=idFor(title,index);button.type='button';button.className='yj-catalog-heading';body.className='yj-catalog-body';
      while(n&&n.tagName!=='H2'){var next=n.nextElementSibling;body.appendChild(n);n=next}count=body.querySelectorAll('a').length;
      button.innerHTML='<span>'+title+'</span><small class="yj-catalog-count">'+count+' 篇</small>';button.addEventListener('click',function(){card.classList.toggle('is-open');body.hidden=!card.classList.contains('is-open')});
      navButton.type='button';navButton.textContent=title;navButton.addEventListener('click',function(){card.classList.add('is-open');body.hidden=false;scrollToCard(card)});
      card.classList.add('is-open');body.hidden=false;card.appendChild(button);card.appendChild(body);grid.appendChild(card);navList.appendChild(document.createElement('li')).appendChild(navButton);h.remove();
    });
    var input=tool.querySelector('input'),toggle=tool.querySelector('button');
    toggle.dataset.open='1';toggle.textContent='收起所有分类';toggle.addEventListener('click',function(){var open=toggle.dataset.open!=='1';grid.querySelectorAll('.yj-catalog-card').forEach(function(card){card.classList.toggle('is-open',open);card.querySelector('.yj-catalog-body').hidden=!open});toggle.dataset.open=open?'1':'0';toggle.textContent=open?'收起所有分类':'展开所有分类'});
    input.addEventListener('input',function(){var q=input.value.trim().toLowerCase();grid.querySelectorAll('.yj-catalog-card').forEach(function(card){var body=card.querySelector('.yj-catalog-body'),matched=0;body.querySelectorAll('li').forEach(function(li){var ok=!q||li.textContent.toLowerCase().indexOf(q)>=0;li.style.display=ok?'':'none';if(ok)matched++});card.style.display=matched?'':'none';if(q){card.classList.add('is-open');body.hidden=false}})});
    sec.dataset.yjCatalogDone='1';
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(run,80)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule);else schedule();new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
})();

/* yj-recent-updates */
(function(){var timer;function page(){var all=document.querySelectorAll('.markdown-section'),i,s,h;for(i=0;i<all.length;i++){s=all[i];h=s.querySelector('h1');if(h&&h.textContent.indexOf('\u6700\u8fd1\u66f4\u65b0')>=0&&s.offsetParent!==null)return s}return null}function run(){var sec=page(),list,children,rows=[],groups={},box;if(!sec||sec.dataset.yjRecentDone)return;children=sec.children;for(var i=0;i<children.length;i++){if(children[i].tagName==='UL'){list=children[i];break}}if(!list)return;for(var j=0;j<list.children.length;j++){var li=list.children[j],a=li.querySelector('a'),text=li.textContent||'',m=text.match(/(\d{4}-\d{2})/);if(a)rows.push({title:(a.textContent||'').trim(),href:a.getAttribute('href'),month:m?m[1]:'\u5176\u4ed6'})}if(!rows.length)return;rows.forEach(function(row){(groups[row.month]||(groups[row.month]=[])).push(row)});box=document.createElement('div');box.className='yj-recent-container';Object.keys(groups).sort().reverse().forEach(function(month){var wrap=document.createElement('section'),heading=document.createElement('h2'),cards=document.createElement('div');wrap.className='yj-recent-month';heading.className='yj-recent-month-title';heading.textContent=month;cards.className='yj-recent-list';groups[month].forEach(function(row){var a=document.createElement('a'),title=document.createElement('span'),date=document.createElement('span');a.className='yj-recent-card';a.href=row.href;title.className='yj-recent-card-title';title.textContent=row.title;date.className='yj-recent-card-date';date.textContent=month;a.appendChild(title);a.appendChild(date);cards.appendChild(a)});wrap.appendChild(heading);wrap.appendChild(cards);box.appendChild(wrap)});list.parentNode.replaceChild(box,list);sec.dataset.yjRecentDone='1'}function schedule(){clearTimeout(timer);timer=setTimeout(run,120)}function bind(){schedule();if(window.gitbook&&gitbook.events)gitbook.events.bind('page.change',schedule);if(document.body)new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});setTimeout(schedule,1000);setTimeout(schedule,2500)}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();window.addEventListener('load',schedule)})();

/* yj-article-toc-navigation */
(function(){
  if(window.__yjArticleTocNavigation)return;
  window.__yjArticleTocNavigation=1;
  var timer;
  function root(){return document.querySelector('.book-body .page-inner .markdown-section')||document.querySelector('.markdown-section')}
  function slug(value,index){var text=(value||'section').trim().toLowerCase().replace(/[^\w\u4e00-\u9fff]+/g,'-').replace(/^-|-$/g,'');return'yj-toc-target-'+index+'-'+(text||'section')}
  function build(){
    var el=root(); if(!el)return;
    var toc=el.querySelector('.yj-article-toc'); if(!toc)return;
    var headings=[].slice.call(el.querySelectorAll('h2,h3')).filter(function(h){return !h.closest('.yj-related')&&!h.closest('.yj-article-toc')});
    var links=[].slice.call(toc.querySelectorAll('a'));
    if(!headings.length||!links.length)return;
    var used={};
    headings.forEach(function(h,index){
      var base=slug(h.textContent,index),id=base,n=2;
      while(used[id]||(document.getElementById(id)&&document.getElementById(id)!==h)){id=base+'-'+n++;}
      used[id]=true; h.id=id; h.dataset.yjTocTarget=id;
      if(links[index]){links[index].href='#'+encodeURIComponent(id);links[index].dataset.yjTocTarget=id;}
    });
    for(var extra=headings.length;extra<links.length;extra++){links[extra].removeAttribute('href');delete links[extra].dataset.yjTocTarget;}
  }
  function jump(link){
    var id=link.dataset.yjTocTarget||decodeURIComponent((link.getAttribute('href')||'').replace(/^#/,'')).trim();
    var target=id&&document.getElementById(id);
    if(!target)return false;
    target.scrollIntoView({behavior:'smooth',block:'start'});
    if(window.history&&history.replaceState)history.replaceState(null,'','#'+encodeURIComponent(id));
    return true;
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(build,80)}
  document.addEventListener('click',function(ev){
    var link=ev.target&&ev.target.closest?ev.target.closest('.yj-article-toc a'):null;
    if(!link||!link.closest('.markdown-section')||!jump(link))return;
    ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation();
  },true);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule);else schedule();
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('hashchange',schedule);
})();

/* yj-contact-page-clean */
(function(){
  if(window.__yjContactPageClean)return;
  window.__yjContactPageClean=1;
  var timer;
  function isContactPage(){
    try{return decodeURIComponent(location.pathname).replace(/\/$/,'')==='/联系我们.html'}catch(e){return false}
  }
  function run(){
    if(!isContactPage())return;
    document.querySelectorAll('.yj-article-toc,.yj-related').forEach(function(node){node.remove()});
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(run,80)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule);else schedule();
  if(window.gitbook&&window.gitbook.events)window.gitbook.events.bind('page.change',schedule);
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
})();

/* yj-reading-experience */
(function(){
if(window.__yjReadingExperience)return;window.__yjReadingExperience=1;
var dataPromise,timer;
function close(){var box=document.querySelector('.yj-image-lightbox');if(box)box.parentNode.removeChild(box)}
function root(){return document.querySelector('.book-body .page-inner .markdown-section')||document.querySelector('.markdown-section')}
function pathOf(value){try{var p=new URL(value,location.href).pathname;return decodeURIComponent(p).replace(/\/$/,'/index.html')}catch(e){return String(value||'')}}
function pageKey(){return pathOf(location.href)}
function special(el){var key=pageKey();return /\/(?:index|最近更新|网站数据|文章目录|联系我们|运维工具平台|常用运维计算工具)\.html$/i.test(key)||!!el.querySelector('.opstool-landing,.yj-ops-calc,#yj-website-data,.yj-catalog,.yj-recent-updates')}
function language(pre){var code=pre.querySelector('code'),m=(code&&code.className||pre.className||'').match(/(?:lang-|language-)([\w+-]+)/i);return m?m[1].toUpperCase():''}
function copy(button){var wrapper=button.closest('.code-wrapper'),pre=wrapper&&wrapper.querySelector('pre'),text=pre?pre.textContent:'';function done(){button.textContent='已复制';button.classList.add('is-copied');setTimeout(function(){button.textContent='复制';button.classList.remove('is-copied')},1400)}function fallback(){var area=document.createElement('textarea');area.value=text;area.setAttribute('readonly','');area.style.cssText='position:fixed;top:-9999px';document.body.appendChild(area);area.select();try{document.execCommand('copy');done()}catch(e){button.textContent='请手动复制'}document.body.removeChild(area)}if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(text).then(done).catch(fallback)}else{fallback()}}
function enhanceCode(el){if(!el)return;el.querySelectorAll('.code-wrapper').forEach(function(box){if(box.querySelector('.yj-code-toolbar'))return;var pre=box.querySelector('pre');if(!pre)return;var tools=document.createElement('div'),tag=language(pre),copyButton=document.createElement('button'),wrapButton=document.createElement('button');tools.className='yj-code-toolbar';if(tag){var label=document.createElement('span');label.className='yj-code-lang';label.textContent=tag;tools.appendChild(label)}wrapButton.type='button';wrapButton.className='yj-code-wrap-toggle';wrapButton.textContent='换行';wrapButton.setAttribute('aria-label','切换代码自动换行');copyButton.type='button';copyButton.className='yj-code-copy';copyButton.textContent='复制';copyButton.setAttribute('aria-label','复制代码');tools.appendChild(wrapButton);tools.appendChild(copyButton);box.appendChild(tools);box.classList.add('yj-code-ready')})}
function tableState(box){var table=box.querySelector('table');if(!table)return;var wide=box.scrollWidth>box.clientWidth+3;box.classList.toggle('yj-table-wide',wide);box.classList.toggle('yj-table-long',table.rows&&table.rows.length>18);box.tabIndex=wide?0:-1;if(wide)box.setAttribute('aria-label','可横向滚动查看完整表格');else box.removeAttribute('aria-label')}
function wrapTables(el){if(!el)return;el.querySelectorAll('table').forEach(function(table){if(table.closest('.opstool-landing,.yj-ops-calc'))return;var rows=table.rows||[],columns=1,i;for(i=0;i<rows.length;i++)columns=Math.max(columns,rows[i].cells.length);table.classList.remove('yj-table-cols-1','yj-table-cols-2','yj-table-cols-3','yj-table-cols-4','yj-table-cols-5','yj-table-cols-many');table.classList.add(columns>5?'yj-table-cols-many':'yj-table-cols-'+columns);var box=table.closest('.yj-table-scroll'),pluginBox=table.closest('.table-area');if(pluginBox&&pluginBox.parentNode){var movable=box&&pluginBox.contains(box)?box:table;pluginBox.parentNode.insertBefore(movable,pluginBox);pluginBox.parentNode.removeChild(pluginBox);box=table.closest('.yj-table-scroll')}if(!box){box=document.createElement('div');box.className='yj-table-scroll';table.parentNode.insertBefore(box,table);box.appendChild(table)}if(!box.querySelector('.yj-table-scroll-hint')){var hint=document.createElement('span');hint.className='yj-table-scroll-hint';hint.textContent='左右滑动查看完整表格';box.insertBefore(hint,box.firstChild)}requestAnimationFrame(function(){tableState(box)})})}
function firstTextNode(el){var walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,null);while(walker.nextNode()){if(walker.currentNode.nodeValue.trim())return walker.currentNode}return null}
function enhanceCallouts(el){if(!el)return;var kinds={提示:['info','提示'],说明:['info','说明'],信息:['info','信息'],注意:['warning','注意'],警告:['warning','警告'],重要:['warning','重要'],危险:['danger','危险'],失败:['danger','失败'],错误:['danger','错误'],成功:['success','成功'],验证:['success','验证']};el.querySelectorAll('blockquote:not([data-yj-callout])').forEach(function(box){box.dataset.yjCallout='1';var text=(box.textContent||'').trim(),match=text.match(/^(提示|说明|信息|注意|警告|重要|危险|失败|错误|成功|验证)\s*[：:]?/);if(!match)return;var config=kinds[match[1]],node=firstTextNode(box);box.classList.add('yj-callout','yj-callout-'+config[0]);box.setAttribute('data-yj-label',config[1]);if(node)node.nodeValue=node.nodeValue.replace(new RegExp('^\\s*'+match[1]+'\\s*[：:]?\\s*'), '')})}
function meaningfulAlt(value){var alt=String(value||'').trim();if(!alt)return'';if(/^(?:image|img|photo|picture|截图|图片|图|屏幕截图|\d+|[\w-]+\.(?:png|jpe?g|gif|webp))$/i.test(alt))return'';return alt}
function insertAfter(node,target){if(target&&target.parentNode)target.parentNode.insertBefore(node,target.nextSibling)}
function removeImageCaptions(el){if(!el)return;[].slice.call(el.querySelectorAll('.yj-image-caption')).forEach(function(caption){caption.remove()})}
function enhanceImages(el){if(!el)return;removeImageCaptions(el);[].slice.call(el.querySelectorAll('img')).filter(function(img){return !img.closest('.yj-image-lightbox,.book-summary')}).forEach(function(image){image.dataset.yjVisualReady='1'})}
function headingId(h,index){if(h.id)return h.id;var anchor=h.querySelector('a[name]');if(anchor&&anchor.name)return anchor.name;var id='yj-section-'+index+'-'+(h.textContent||'section').trim().toLowerCase().replace(/[^\w\u4e00-\u9fff]+/g,'-').replace(/^-|-$/g,'');h.id=id;return id}
function buildToc(el){var old=el.querySelector('.yj-article-toc');if(old)old.remove();var hs=[].slice.call(el.querySelectorAll('h2,h3,h4')).filter(function(h){return !h.closest('.yj-related')});if(hs.length<2)return;var base=Math.min.apply(null,hs.map(function(h){return parseInt(h.tagName.slice(1),10)})),box=document.createElement('nav'),title=document.createElement('div'),list=document.createElement('ol');box.className='yj-article-toc';box.setAttribute('aria-label','文章目录');title.className='yj-article-toc-title';title.textContent='本页目录';hs.forEach(function(h,i){var li=document.createElement('li'),a=document.createElement('a'),id=headingId(h,i),depth=Math.min(2,Math.max(0,parseInt(h.tagName.slice(1),10)-base));if(depth)li.className='yj-toc-depth-'+depth;a.href='#'+encodeURIComponent(id);a.textContent=(h.textContent||'').replace(/^\s*\d+(?:\.\d+)*\.?\s*/,'').trim();li.appendChild(a);list.appendChild(li)});box.appendChild(title);box.appendChild(list);el.insertBefore(box,hs[0])}
function loadDocs(){if(dataPromise)return dataPromise;dataPromise=fetch('/assets/search-lite.json?v='+Date.now(),{cache:'force-cache'}).then(function(r){if(!r.ok)throw Error();return r.json()}).then(function(x){return Array.isArray(x)?x:[]});return dataPromise}
function buildRelated(el){var old=el.querySelector('.yj-related');if(old)old.remove();loadDocs().then(function(docs){if(!docs.length||!document.body.contains(el))return;var now=pageKey(),current=docs.filter(function(d){return pathOf(d.url)===now})[0];if(!current||!current.category||current.category==='其他')return;var list=docs.filter(function(d){return d!==current&&d.category===current.category&&pathOf(d.url)!==now}).slice(0,4);if(!list.length)return;var section=document.createElement('section'),heading=document.createElement('h2'),grid=document.createElement('div');section.className='yj-related';heading.textContent='相关文章';grid.className='yj-related-grid';list.forEach(function(d){var a=document.createElement('a'),name=document.createElement('strong'),summary=document.createElement('span');a.className='yj-related-card';a.href=d.url;name.textContent=d.title||'未命名文章';summary.textContent=d.summary||d.category;a.appendChild(name);a.appendChild(summary);grid.appendChild(a)});section.appendChild(heading);section.appendChild(grid);el.appendChild(section)}).catch(function(){})}
function queueRelated(el){var key=pageKey(),marker=document.createElement('span');marker.className='yj-related-load-marker';marker.setAttribute('aria-hidden','true');marker.style.cssText='display:block;height:1px;pointer-events:none';el.appendChild(marker);function load(){if(!marker.isConnected||pageKey()!==key)return;marker.remove();buildRelated(el)}if(!('IntersectionObserver' in window)){load();return}var observer=new IntersectionObserver(function(entries){if(entries.some(function(entry){return entry.isIntersecting})){observer.disconnect();load()}},{rootMargin:'800px 0px'});observer.observe(marker)}
function loadCalculator(el){var calc=el.querySelector('.yj-ops-calc');if(!calc)return;var cssHref='/assets/yj-ops-calculators.css?v=20261012-domestic-dns-1',css=document.getElementById('yj-ops-calc-css');if(!css){css=document.createElement('link');css.id='yj-ops-calc-css';css.rel='stylesheet';document.head.appendChild(css)}if(css.getAttribute('href')!==cssHref)css.href=cssHref;function reveal(){calc.setAttribute('data-yj-style-ready','1')}if(css.sheet)reveal();else if(!calc.dataset.yjStyleWaiting){calc.dataset.yjStyleWaiting='1';css.addEventListener('load',reveal,{once:true});css.addEventListener('error',reveal,{once:true});if(css.sheet)reveal()}function start(){if(window.YJOpsCalc)window.YJOpsCalc.init(calc)}if(window.YJOpsCalc){start();return}var script=document.getElementById('yj-ops-calc-script');if(!script){script=document.createElement('script');script.id='yj-ops-calc-script';script.src='/assets/yj-ops-calculators.js?v=20261012-domestic-dns-1';script.onload=start;document.head.appendChild(script)}else script.addEventListener('load',start,{once:true})}
document.addEventListener('click',function(ev){if(ev.defaultPrevented||ev.button!==0||ev.metaKey||ev.ctrlKey||ev.shiftKey||ev.altKey)return;var link=ev.target&&ev.target.closest?ev.target.closest('a[href]'):null;if(!link||link.target==='_blank'||link.hasAttribute('download'))return;var url;try{url=new URL(link.href,location.href)}catch(_){return}if(url.origin===location.origin&&/(?:^|\/)运维工具平台\.html$/i.test(decodeURIComponent(url.pathname))){ev.preventDefault();ev.stopImmediatePropagation();location.href=url.href}},true);
function apply(){var el=root();if(!el)return;loadCalculator(el);enhanceCode(el);wrapTables(el);enhanceCallouts(el);if(!special(el))enhanceImages(el);var key=pageKey();if(el.dataset.yjReadingPage===key)return;el.dataset.yjReadingPage=key;if(!special(el)){buildToc(el);queueRelated(el)}}
function schedule(){clearTimeout(timer);timer=setTimeout(apply,70)}
document.addEventListener('click',function(ev){var image=ev.target&&ev.target.closest?ev.target.closest('.markdown-section img'):null;if(image&&!image.closest('.book-summary')){ev.preventDefault();var box=document.createElement('div'),view=document.createElement('img');box.className='yj-image-lightbox';box.setAttribute('role','dialog');box.setAttribute('aria-label','图片预览');view.src=image.src;view.alt=image.alt||'';if(image.closest('.yj-image-frame')){var frame=document.createElement('div'),stamp=document.createElement('span');frame.className='yj-image-preview-frame';stamp.className='yj-image-watermark';stamp.textContent='wiki.982013.xyz';frame.appendChild(view);frame.appendChild(stamp);box.appendChild(frame)}else{box.appendChild(view);}box.addEventListener('click',function(e){if(e.target===box)close()});document.body.appendChild(box);return}var wrapButton=ev.target&&ev.target.closest?ev.target.closest('.yj-code-wrap-toggle'):null;if(wrapButton){ev.preventDefault();var wrapper=wrapButton.closest('.code-wrapper'),wrapped=wrapper.classList.toggle('yj-code-wrap');wrapButton.textContent=wrapped?'不换行':'换行';wrapButton.setAttribute('aria-pressed',wrapped?'true':'false');return}var copyButton=ev.target&&ev.target.closest?ev.target.closest('.yj-code-copy'):null;if(copyButton){ev.preventDefault();copy(copyButton)}});
document.addEventListener('keydown',function(ev){if(ev.key==='Escape')close()});
window.addEventListener('resize',schedule);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule);else schedule();
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('hashchange',schedule)
/* yj-long-image-viewer:start */
;(function(){
if(window.__yjLongImageViewer)return;window.__yjLongImageViewer=1;
var viewer=null,previousOverflow='',previousFocus=null;
function clamp(value,min,max){return Math.max(min,Math.min(max,value))}
function closeLong(){if(!viewer)return;viewer.element.remove();viewer=null;document.body.style.overflow=previousOverflow;document.body.classList.remove('yj-long-viewer-open');if(previousFocus&&previousFocus.focus)previousFocus.focus();previousFocus=null}
function makeButton(label,title,action){var button=document.createElement('button');button.type='button';button.textContent=label;button.setAttribute('aria-label',title);button.addEventListener('click',action);return button}
function openLong(source){
  closeLong();previousFocus=document.activeElement;previousOverflow=document.body.style.overflow;
  var element=document.createElement('div'),toolbar=document.createElement('div'),label=document.createElement('div'),actions=document.createElement('div'),stage=document.createElement('div'),image=document.createElement('img'),original=document.createElement('button');
  element.className='yj-long-viewer';element.setAttribute('role','dialog');element.setAttribute('aria-modal','true');element.setAttribute('aria-label','长图查看');
  toolbar.className='yj-long-viewer-toolbar';label.className='yj-long-viewer-label';label.textContent='长图预览 · 单指拖动，双指缩放';actions.className='yj-long-viewer-actions';stage.className='yj-long-viewer-stage';
  image.alt=source.alt||'长图';image.draggable=false;image.src=source.currentSrc||source.src;
  original.type='button';original.className='yj-long-viewer-original';original.textContent='原图';original.setAttribute('aria-label','在当前预览中加载原图');
  stage.appendChild(image);toolbar.appendChild(label);toolbar.appendChild(actions);element.appendChild(toolbar);element.appendChild(stage);document.body.appendChild(element);
  document.body.style.overflow='hidden';document.body.classList.add('yj-long-viewer-open');
  var state={element:element,stage:stage,image:image,naturalWidth:source.naturalWidth,width:0,pointers:new Map(),gesture:null};viewer=state;
  function fitWidth(){return stage.clientWidth||window.innerWidth}
  function setWidth(next,focalX,focalY){var old=state.width||fitWidth(),width=clamp(next,fitWidth(),state.naturalWidth),x=focalX==null?stage.clientWidth/2:focalX,y=focalY==null?stage.clientHeight/2:focalY,ratio=width/old;image.style.width=width+'px';state.width=width;stage.scrollLeft=(stage.scrollLeft+x)*ratio-x;stage.scrollTop=(stage.scrollTop+y)*ratio-y}
  actions.appendChild(makeButton('−','缩小长图',function(){setWidth(state.width/1.4)}));
  actions.appendChild(makeButton('+','放大长图',function(){setWidth(state.width*1.4)}));
  actions.appendChild(makeButton('适应宽度','按屏幕宽度显示完整长图',function(){image.style.width=fitWidth()+'px';state.width=fitWidth();stage.scrollLeft=0;stage.scrollTop=0}));
  original.addEventListener('click',function(){
    if(original.disabled)return;
    var previousSrc=image.src;original.disabled=true;original.textContent='加载中';
    function loaded(){image.removeEventListener('error',failed);if(viewer!==state)return;state.naturalWidth=image.naturalWidth||state.naturalWidth;state.width=Math.min(state.naturalWidth,Math.max(fitWidth()*2,640));image.style.width=state.width+'px';stage.scrollLeft=0;stage.scrollTop=0;label.textContent='原图查看 · 单指拖动，双指缩放';original.textContent='原图已载入'}
    function failed(){image.removeEventListener('load',loaded);if(viewer!==state)return;image.src=previousSrc;original.disabled=false;original.textContent='原图';label.textContent='原图加载失败，请重试'}
    image.addEventListener('load',loaded,{once:true});image.addEventListener('error',failed,{once:true});image.src=source.src;
  });
  actions.appendChild(original);
  var closeButton=makeButton('×','关闭长图',closeLong);closeButton.className='yj-long-viewer-close';actions.appendChild(closeButton);
  function points(){return Array.from(state.pointers.values())}
  function gestureStart(){var p=points();if(p.length===1){state.gesture={kind:'drag',x:p[0].x,y:p[0].y,left:stage.scrollLeft,top:stage.scrollTop}}else if(p.length>=2){var rect=stage.getBoundingClientRect(),cx=(p[0].x+p[1].x)/2-rect.left,cy=(p[0].y+p[1].y)/2-rect.top;state.gesture={kind:'pinch',distance:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)||1,width:state.width,left:stage.scrollLeft,top:stage.scrollTop,cx:cx,cy:cy}}else state.gesture=null}
  stage.addEventListener('pointerdown',function(ev){if(ev.pointerType==='mouse'&&ev.button!==0)return;state.pointers.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});stage.setPointerCapture(ev.pointerId);gestureStart();ev.preventDefault()});
  stage.addEventListener('pointermove',function(ev){if(!state.pointers.has(ev.pointerId))return;state.pointers.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});var p=points(),g=state.gesture;if(!g)return;if(p.length===1&&g.kind==='drag'){stage.scrollLeft=g.left+g.x-p[0].x;stage.scrollTop=g.top+g.y-p[0].y}else if(p.length>=2&&g.kind==='pinch'){var rect=stage.getBoundingClientRect(),cx=(p[0].x+p[1].x)/2-rect.left,cy=(p[0].y+p[1].y)/2-rect.top,distance=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)||1,width=clamp(g.width*distance/g.distance,fitWidth(),state.naturalWidth),ratio=width/g.width;image.style.width=width+'px';state.width=width;stage.scrollLeft=(g.left+g.cx)*ratio-cx;stage.scrollTop=(g.top+g.cy)*ratio-cy}ev.preventDefault()});
  function pointerEnd(ev){if(!state.pointers.has(ev.pointerId))return;state.pointers.delete(ev.pointerId);gestureStart()}
  stage.addEventListener('pointerup',pointerEnd);stage.addEventListener('pointercancel',pointerEnd);
  requestAnimationFrame(function(){if(viewer!==state)return;state.width=Math.min(state.naturalWidth,Math.max(fitWidth()*2,640));image.style.width=state.width+'px';stage.scrollLeft=0;stage.scrollTop=0;closeButton.focus()});
}
document.addEventListener('click',function(ev){if(ev.defaultPrevented||ev.button!==0||ev.metaKey||ev.ctrlKey||ev.shiftKey||ev.altKey||!window.matchMedia('(max-width:700px)').matches)return;var image=ev.target&&ev.target.closest?ev.target.closest('.markdown-section img'):null;if(!image||image.closest('.opstool-landing,.yj-ops-calc')||image.naturalWidth<700||image.naturalHeight<1200||image.naturalHeight/image.naturalWidth<2.5)return;ev.preventDefault();ev.stopImmediatePropagation();openLong(image)},true);
document.addEventListener('keydown',function(ev){if(viewer&&ev.key==='Escape'){ev.preventDefault();closeLong()}});
window.addEventListener('popstate',closeLong);window.addEventListener('resize',function(){if(viewer&&!window.matchMedia('(max-width:700px)').matches)closeLong()});
if(window.gitbook&&gitbook.events)gitbook.events.bind('page.change',closeLong);
})();
/* yj-long-image-viewer:end */
/* yj-readable-article-layout:start */
;(function(){
if(window.__yjReadableArticleLayout)return;window.__yjReadableArticleLayout=1;
var layoutTimer;
function currentRoot(){return document.querySelector('.book-body .page-inner .markdown-section')}
function enhanceHeader(){
  var header=document.querySelector('.book-header');if(!header)return;
  header.querySelectorAll('.pull-right').forEach(function(item){
    if(item.querySelector('.fa-facebook,.fa-twitter,.fa-share-alt'))item.classList.add('yj-toolbar-social');
  });
  if(header.querySelector('.yj-mobile-search'))return;
  var button=document.createElement('button');button.type='button';button.className='btn pull-right yj-mobile-search';
  button.setAttribute('aria-label','打开站内搜索');
  button.innerHTML='<i class="fa fa-search" aria-hidden="true"></i><span>搜索</span>';
  var firstRight=header.querySelector('.pull-right');header.insertBefore(button,firstRight||header.firstChild);
}
function enhanceOutline(el){
  var nav=el.querySelector('.yj-article-toc');if(!nav)return;
  var details=nav.querySelector('details.yj-article-toc-details');
  if(!details){
    var list=nav.querySelector('ol');if(!list)return;
    details=document.createElement('details');
    var summary=document.createElement('summary');
    details.className='yj-article-toc-details';summary.className='yj-article-toc-title';summary.textContent='本页目录';
    details.appendChild(summary);details.appendChild(list);nav.replaceChildren(details);
  }
  var mobile=window.innerWidth<=700?'1':'0';
  if(details.dataset.yjTocMobile!==mobile){details.open=mobile==='0';details.dataset.yjTocMobile=mobile}
}
function enhanceTitle(el){
  if(el.querySelector(':scope > h1'))return;
  var headerTitle=document.querySelector('.book-header h1 a'),name=headerTitle&&headerTitle.textContent.trim();
  if(!name)return;
  var heading=document.createElement('h1');heading.className='yj-article-title';heading.textContent=name;
  el.insertBefore(heading,el.firstChild);
}
function enhanceCaptions(el){
  removeImageCaptions(el);
  [].slice.call(el.querySelectorAll('img')).forEach(function(image){image.dataset.yjLayoutImage='1'});
}
function syncShareFullscreen(){
  if(!document.body)return;document.body.classList.toggle('yj-share-fullscreen-active',!!(document.fullscreenElement||document.webkitFullscreenElement));
}
function enhanceShare(el,toolMode){
  var existing=el.querySelector('.yj-share-footer');
  if(existing){if(toolMode)existing.classList.add('yj-tool-share-footer');return}
  var footer=document.createElement('div'),button=document.createElement('button'),status=document.createElement('span');
  footer.className='yj-share-footer'+(toolMode?' yj-tool-share-footer':'');button.type='button';button.className='yj-share-button';button.textContent='分享本文';
  status.className='yj-share-footer-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  footer.appendChild(button);footer.appendChild(status);el.appendChild(footer);
}
function applyLayout(){
  var el=currentRoot();if(!el)return;enhanceHeader();
  var toolMode=/\/常用运维计算工具\.html$/i.test(pageKey())||!!el.querySelector('.yj-ops-calc');
  if(special(el)){if(toolMode)enhanceShare(el,true);syncShareFullscreen();return}
  var key=pageKey();
  if(el.dataset.yjLayoutKey!==key){
    el.dataset.yjLayoutKey=key;enhanceTitle(el);enhanceCaptions(el);enhanceShare(el,false);
  }
  syncShareFullscreen();enhanceOutline(el);
}
function scheduleLayout(){clearTimeout(layoutTimer);layoutTimer=setTimeout(applyLayout,125)}
function showMobileImage(source){
  var box=document.createElement('div'),stage=document.createElement('div'),actions=document.createElement('div');
  var zoom=document.createElement('button'),dismiss=document.createElement('button'),view=document.createElement('img');
  box.className='yj-image-lightbox';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');
  box.setAttribute('aria-label','图片预览');stage.className='yj-image-lightbox-stage';actions.className='yj-image-lightbox-actions';
  view.src=source.src;view.alt=source.alt||'';
  if(source.closest('.yj-image-frame')){
    var frame=document.createElement('div'),stamp=document.createElement('span');
    frame.className='yj-image-preview-frame';stamp.className='yj-image-watermark';stamp.textContent='wiki.982013.xyz';
    frame.appendChild(view);frame.appendChild(stamp);stage.appendChild(frame);
  }else stage.appendChild(view);
  zoom.type='button';zoom.textContent='查看原图';zoom.setAttribute('aria-pressed','false');
  zoom.addEventListener('click',function(){
    var original=box.classList.toggle('is-original');zoom.textContent=original?'适应屏幕':'查看原图';
    zoom.setAttribute('aria-pressed',original?'true':'false');stage.scrollLeft=0;stage.scrollTop=0;
  });
  dismiss.type='button';dismiss.textContent='关闭';dismiss.addEventListener('click',function(){box.remove()});
  actions.appendChild(zoom);actions.appendChild(dismiss);box.appendChild(stage);box.appendChild(actions);
  box.addEventListener('click',function(ev){if(ev.target===box)box.remove()});
  document.body.appendChild(box);dismiss.focus();
}
document.addEventListener('click',function(ev){
  if(window.innerWidth>700||ev.defaultPrevented||ev.button!==0)return;
  var image=ev.target&&ev.target.closest?ev.target.closest('.markdown-section img'):null;
  if(!image||image.closest('.opstool-landing,.yj-ops-calc'))return;
  if(image.naturalWidth>=700&&image.naturalHeight>=1200&&image.naturalHeight/image.naturalWidth>=2.5)return;
  ev.preventDefault();ev.stopImmediatePropagation();showMobileImage(image);
},true);
document.addEventListener('click',function(ev){
  var search=ev.target&&ev.target.closest?ev.target.closest('.yj-mobile-search'):null;
  if(search){
    ev.preventDefault();var book=document.querySelector('.book'),toggle=document.querySelector('.book-header a.btn.pull-left');
    if(book&&!book.classList.contains('with-summary')&&toggle)toggle.click();
    setTimeout(function(){var input=document.querySelector('#book-search-input input');if(input)input.focus()},180);return;
  }
  var share=ev.target&&ev.target.closest?ev.target.closest('.yj-share-button'):null;
  if(share){
    ev.preventDefault();var status=share.parentNode.querySelector('.yj-share-footer-status');
    var url=location.href,title=(document.querySelector('.book-header h1 a')||{}).textContent||document.title;
    function message(s){if(status)status.textContent=s}
    if(navigator.share)navigator.share({title:title,url:url}).catch(function(){});
    else if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(url).then(function(){message('链接已复制')}).catch(function(){message('请复制浏览器地址栏链接')});
    else message('请复制浏览器地址栏链接');return;
  }
  var tocLink=ev.target&&ev.target.closest?ev.target.closest('.yj-article-toc a'):null;
  if(tocLink&&window.innerWidth<=700){var details=tocLink.closest('details');if(details)details.open=false}
});
document.addEventListener('keydown',function(ev){if(ev.key==='Escape'){var box=document.querySelector('.yj-image-lightbox');if(box)box.remove()}});
document.addEventListener('fullscreenchange',syncShareFullscreen);
document.addEventListener('webkitfullscreenchange',syncShareFullscreen);
window.addEventListener('resize',scheduleLayout);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scheduleLayout);else scheduleLayout();
new MutationObserver(scheduleLayout).observe(document.documentElement,{childList:true,subtree:true});
if(window.gitbook&&gitbook.events)gitbook.events.bind('page.change',scheduleLayout);
/* yj-readable-article-layout:end */
})();
})();

/* yj-dashboard-trend-motion */
(function(){if(window.__yjDashboardTrendMotion)return;window.__yjDashboardTrendMotion=1;var NS='http://www.w3.org/2000/svg',timer;
function node(name,attrs){var el=document.createElementNS(NS,name);Object.keys(attrs||{}).forEach(function(key){el.setAttribute(key,attrs[key])});return el}
function points(value){return String(value||'').trim().split(/\s+/).map(function(pair){var xy=pair.split(',').map(Number);return{x:xy[0],y:xy[1]}}).filter(function(p){return isFinite(p.x)&&isFinite(p.y)})}
function curve(list){if(!list.length)return'';if(list.length===1)return'M '+list[0].x+' '+list[0].y;var d='M '+list[0].x+' '+list[0].y;for(var i=0;i<list.length-1;i++){var p0=list[i-1]||list[i],p1=list[i],p2=list[i+1],p3=list[i+2]||p2,c1x=p1.x+(p2.x-p0.x)/6,c1y=p1.y+(p2.y-p0.y)/6,c2x=p2.x-(p3.x-p1.x)/6,c2y=p2.y-(p3.y-p1.y)/6;d+=' C '+c1x.toFixed(1)+' '+c1y.toFixed(1)+', '+c2x.toFixed(1)+' '+c2y.toFixed(1)+', '+p2.x+' '+p2.y}return d}
function enhance(svg){if(!svg||svg.dataset.yjMotionReady)return;var line=svg.querySelector('polyline.pvline'),list=line&&points(line.getAttribute('points'));if(!line||!list||!list.length)return;svg.dataset.yjMotionReady='1';var view=(svg.getAttribute('viewBox')||'0 0 760 250').split(/\s+/).map(Number),bottom=(view[1]||0)+(view[3]||250)-38,d=curve(list),defs=node('defs'),gradient=node('linearGradient',{id:'yj-trend-area-gradient',x1:'0',y1:'0',x2:'0',y2:'1'}),top=node('stop',{offset:'0%','stop-color':'#60a5fa','stop-opacity':'.42'}),end=node('stop',{offset:'100%','stop-color':'#dbeafe','stop-opacity':'.04'});gradient.appendChild(top);gradient.appendChild(end);defs.appendChild(gradient);svg.insertBefore(defs,svg.firstChild);var area=node('path',{class:'yj-trend-area',d:d+' L '+list[list.length-1].x+' '+bottom+' L '+list[0].x+' '+bottom+' Z'}),path=node('path',{class:'yj-pv-curve',d:d});line.parentNode.insertBefore(area,line);line.parentNode.insertBefore(path,line);line.remove();try{var length=Math.ceil(path.getTotalLength());path.style.setProperty('--yj-path-length',length)}catch(x){path.style.setProperty('--yj-path-length','1400')}
var labels=[].slice.call(svg.querySelectorAll('.axislabels text')).map(function(el){return el.textContent.trim()}),values=list.map(function(p){var maxLabel=Math.max.apply(null,[].slice.call(svg.querySelectorAll('.grid text')).map(function(el){return Number(el.textContent)||0}));var topY=24,height=188;return Math.max(0,Math.round((topY+height-p.y)/height*maxLabel))});var group=node('g',{class:'yj-trend-points'});list.forEach(function(p,i){var item=node('g',{class:'yj-trend-point',tabindex:'0','aria-label':(labels[i]||('第 '+(i+1)+' 天'))+'，'+values[i]+' 次页面浏览'}),halo=node('circle',{class:'yj-dot-halo',cx:p.x,cy:p.y,r:'5'}),dot=node('circle',{class:'yj-dot',cx:p.x,cy:p.y,r:'4'}),title=node('title');title.textContent=(labels[i]||('第 '+(i+1)+' 天'))+' · '+values[i]+' 次页面浏览';item.style.animationDelay=(.46+i*.09)+'s';item.appendChild(halo);item.appendChild(dot);item.appendChild(title);if(i===list.length-1)item.insertBefore(node('circle',{class:'yj-trend-pulse',cx:p.x,cy:p.y,r:'7'}),halo);group.appendChild(item);var valueX=p.x+(i===0?10:(i===list.length-1?-8:0)),value=node('text',{class:'yj-trend-value',x:valueX,y:Math.max(17,p.y-13)});value.textContent=values[i];value.style.animationDelay=(.58+i*.09)+'s';group.appendChild(value)});svg.appendChild(group);svg.setAttribute('aria-label','近 7 天页面浏览量趋势，曲线按日期展示每日浏览量')}
function run(){document.querySelectorAll('.yjtrend svg').forEach(enhance)}function schedule(){clearTimeout(timer);timer=setTimeout(run,60)}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule);else schedule();new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});if(window.gitbook&&gitbook.events)gitbook.events.bind('page.change',schedule)})();
