(function(){
  'use strict';
  if(window.__yjSiteAssistant)return;
  window.__yjSiteAssistant=true;
  var script=document.currentScript;
  var indexUrl=script&&script.getAttribute('data-yj-index');
  var workerUrl=script&&script.getAttribute('data-yj-worker');
  var panel,body,input,submit,launch,suggestions,composerCount,clearInput,worker,requestId=0,pending={},topic=null,activeAsk=0,activeSearchId=0,currentPath='',toggleAssistant=null,selectionAsk=null;
  var sessionTurns=[];
  var feedbackKey='yj-site-assistant-feedback-v1';
  var aliasKey='yj-site-assistant-aliases-v1';
  var highlightKey='yj-site-assistant-highlight-v1';
  var dockPositionKey='yj-site-assistant-position-v1';
  function getWorker(){
    if(worker)return worker;
    if(!window.Worker||!workerUrl)throw Error('当前浏览器无法启动站内检索');
    worker=new Worker(workerUrl);
    worker.onmessage=function(event){
      var data=event.data||{},item=pending[data.id];
      if(!item)return;
      delete pending[data.id];clearTimeout(item.timer);if(activeSearchId===data.id)activeSearchId=0;
      if(data.error)item.reject(Error(data.error));else item.resolve(data);
    };
    worker.onerror=function(){
      activeSearchId=0;Object.keys(pending).forEach(function(id){clearTimeout(pending[id].timer);pending[id].reject(Error('检索暂不可用'));delete pending[id]});
      worker.terminate();worker=null;
    };
    return worker;
  }
  function workerRequest(payload){
    return new Promise(function(resolve,reject){
      try{
        var id=++requestId,instance=getWorker();
        pending[id]={resolve:resolve,reject:reject,timer:setTimeout(function(){
          if(pending[id]){delete pending[id];if(activeSearchId===id)activeSearchId=0;reject(Error('检索超时，请重试'))}
        },20000)};
        if(payload.mode==='search')activeSearchId=id;
        payload.id=id;payload.indexUrl=indexUrl;payload.pathname=location.pathname;instance.postMessage(payload);
      }catch(error){reject(error)}
    });
  }
  function search(question,context){return workerRequest({mode:'search',question:question,context:context,customAliases:aliasRecords()})}
  function pageSuggestions(){return workerRequest({mode:'suggestions'})}
  function cancelActiveSearch(){
    if(!activeSearchId||!pending[activeSearchId])return;
    var error=Error('检索已由新问题替换');error.cancelled=true;
    Object.keys(pending).forEach(function(id){clearTimeout(pending[id].timer);pending[id].reject(error);delete pending[id]});
    activeSearchId=0;if(worker){worker.terminate();worker=null}
  }
  function followup(question){return !!topic&&question.length<=35&&/^(那(?:么)?(?:要|该|怎么|如何|如果|会|能|又|还|具体)?|它|这个|上面|刚才|继续|如果|具体怎么)/.test(question)}
  function currentPageTitle(){
    var heading=document.querySelector('.page-inner h1,.markdown-section h1,main h1,article h1');
    return String(heading&&heading.textContent||document.title||'当前页面').replace(/\s+/g,' ').replace(/\s*[|｜·-].*$/,'').trim().slice(0,90);
  }
  function currentPageContext(question){
    if(location.pathname==='/'||location.pathname==='interactive/index.html')return null;
    return {kind:'page',title:currentPageTitle(),url:location.pathname,ambient:!/这里|此处|当前|本页|这个页面|这个工具/.test(question)};
  }
  function normalized(value){return String(value||'').replace(/\s+/g,' ').replace(/[“”‘’]/g,'').trim().toLowerCase()}
  function isPublicIpv4(value){
    var parts=value.split('.').map(Number);if(parts.length!==4||parts.some(function(n){return n<0||n>255}))return false;
    var a=parts[0],b=parts[1];
    return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===198&&(b===18||b===19)));
  }
  function sanitizeQuestion(value){
    var text=String(value||''),types=[];
    function add(type){if(!types.includes(type))types.push(type)}
    text=text.replace(/(https?:\/\/[^\s\/:@]+:)[^\s@/]+@/gi,function(_,prefix){add('网址凭据');return prefix+'[已隐藏]@'});
    text=text.replace(/((?:密码|口令|password|passwd|pwd)\s*[:=：]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,，;；]+)/gi,function(_,prefix){add('密码或口令');return prefix+'[已隐藏]'});
    text=text.replace(/((?:authorization|cookie|set-cookie)\s*[:：]\s*)[^\r\n]+/gi,function(_,prefix){add('令牌或 Cookie');return prefix+'[已隐藏]'});
    text=text.replace(/((?:api[_-]?key|access[_-]?key|secret|token|session(?:id)?)\s*[:=：]\s*)(?:bearer\s+)?[^\s,，;；]+/gi,function(_,prefix){add('令牌或 Cookie');return prefix+'[已隐藏]'});
    text=text.replace(/\bbearer\s+[a-z0-9._~+\/-]{6,}/gi,function(){add('令牌或 Cookie');return 'Bearer [已隐藏]'});
    text=text.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,function(){add('邮箱');return '[邮箱已隐藏]'});
    text=text.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g,function(ip){if(!isPublicIpv4(ip))return ip;add('公网 IP');return '[公网IP已隐藏]'});
    text=text.replace(/\b(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{1,4}\b/gi,function(ip){if(/^(?:fe[89ab]|f[cd]|::1)/i.test(ip))return ip;add('公网 IP');return '[公网IP已隐藏]'});
    return {text:text,types:types};
  }
  function resizeComposer(){
    if(!input)return;input.style.height='auto';input.style.height=Math.min(Math.max(input.scrollHeight,43),132)+'px';
    if(composerCount)composerCount.textContent=input.value.length+' / 2000';
    if(clearInput)clearInput.hidden=!input.value;
  }
  function setInputValue(value){input.value=String(value||'').slice(0,2000);resizeComposer()}
  function answerText(question,data){
    var lines=['问题：'+question],answer=data.answer||[],pieces=evidencePieces(answer,6),intent=data.intent||'explain';
    lines.push('', '【直接结论】');
    if(data.status==='answered'&&data.confident&&pieces.length)lines.push(pieces[0]);
    else lines.push('暂不输出推断性结论。'+statusMessage(data,data.results||[]));
    if(answer.length){lines.push('',intent==='procedure'||intent==='troubleshoot'?'【操作步骤】':'【核对要点】');pieces.forEach(function(piece,index){lines.push((index+1)+'. '+piece)})}
    lines.push('', '【注意事项】');
    if(data.status==='conflict')lines.push('• 来源存在疑似相反表述，请核对版本、设备条件和原文。');
    if(data.versionSensitive&&answer.length)lines.push('• 配置和命令可能随版本变化，请结合来源更新时间与实际版本核对。');
    if(answer.length>1)lines.push('• 多个页面的依据分别展示，不自动合并推断。');
    if(!answer.length)lines.push('• 当前依据不足，请补充产品、版本、环境或目标操作。');
    lines.push('', '【原文依据】');
    if(answer.length)answer.forEach(function(row){lines.push('《'+(row.doc.title||'来源页面')+'》 '+(row.doc.url||''));(row.evidence||[]).forEach(function(piece){lines.push('• '+piece)})});
    else lines.push('无可引用的公开原文。');
    return lines.join('\n');
  }
  function copyText(value,button){
    var done=function(){var before=button.textContent;button.textContent='已复制';setTimeout(function(){if(button.isConnected)button.textContent=before},1600)};
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(value).then(done).catch(function(){fallbackCopy(value,done)});else fallbackCopy(value,done);
  }
  function privacySafeText(value,container){
    var checked=sanitizeQuestion(value);
    if(checked.types.length&&container){
      var old=container.querySelector&&container.querySelector('.yj-assistant-privacy-note');if(old)old.remove();
      var note=el('p','yj-assistant-privacy-note','隐私复检发现 '+checked.types.join('、')+'，已自动遮盖后继续。');container.appendChild(note);
    }
    return checked.text;
  }
  function safeCopyText(value,button,container){copyText(privacySafeText(value,container),button)}
  function downloadText(filename,value,type,container){
    var safe=privacySafeText(value,container),blob=new Blob([safe],{type:type||'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),link=el('a');
    link.href=url;link.download=filename;link.click();setTimeout(function(){URL.revokeObjectURL(url)},1000);
  }
  function fallbackCopy(value,done){
    var area=el('textarea');area.value=value;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();
    try{document.execCommand('copy');done()}catch(_){ }area.remove();
  }
  function rememberTurn(question,data,usedContext){
    sessionTurns=sessionTurns.filter(function(item){return item.question!==question});
    sessionTurns.push({question:question,data:data,usedContext:usedContext,time:Date.now()});
    sessionTurns=sessionTurns.slice(-5);
  }
  function downloadUnresolved(){
    var rows=sessionTurns.filter(function(item){return item.data.status!=='answered'}).map(function(item){return {time:new Date(item.time).toISOString(),question:item.question,status:item.data.status||'unknown',clarification:item.data.clarification||''}});
    if(!rows.length)return;
    downloadText('site-assistant-unresolved-session.json',JSON.stringify({scope:'current-session-only',redacted:true,items:rows},null,2),'application/json;charset=utf-8',body);
  }
  function renderHistory(container){
    if(!sessionTurns.length)return;
    var details=el('details','yj-assistant-history'),summary=el('summary','','本次问答记录 · '+sessionTurns.length+'/5');details.appendChild(summary);
    sessionTurns.slice().reverse().forEach(function(item){
      var row=el('div','yj-assistant-history-row'),view=el('button','yj-assistant-history-question',item.question);view.type='button';view.title=item.question;
      view.addEventListener('click',function(){show(item.question,item.data,item.usedContext,{replay:true})});
      var again=el('button','yj-assistant-history-again','再次提问');again.type='button';again.addEventListener('click',function(){ask(item.question)});row.append(view,again);details.appendChild(row);
    });
    if(sessionTurns.some(function(item){return item.data.status!=='answered'})){
      var exportMissing=el('button','yj-assistant-history-export','下载本次未解决清单');exportMissing.type='button';exportMissing.addEventListener('click',downloadUnresolved);details.appendChild(exportMissing);
    }
    details.appendChild(el('p','yj-assistant-hint','仅保存在当前页面内存中，刷新或关闭页面即清除；问题已先做敏感信息遮盖。'));container.appendChild(details);
  }
  function hideAssistant(){panel.hidden=true;launch.setAttribute('aria-expanded','false');launch.classList.remove('is-open','is-idle');input.blur()}
  function locateNotice(message){var note=el('div','yj-assistant-locate-notice',message);document.body.appendChild(note);setTimeout(function(){note.remove()},3600)}
  function revealTarget(node){
    var details=node.closest&&node.closest('details');if(details)details.open=true;
    var panelNode=node.closest&&node.closest('[role="tabpanel"]');
    if(panelNode&&panelNode.id&&(panelNode.hidden||panelNode.getAttribute('aria-hidden')==='true')){
      Array.prototype.slice.call(document.querySelectorAll('[aria-controls]')).some(function(control){if(control.getAttribute('aria-controls')===panelNode.id){control.click();return true}return false});
    }
    var dialog=node.closest&&node.closest('dialog');if(dialog&&!dialog.open){try{dialog.showModal()}catch(_){dialog.setAttribute('open','')}}
  }
  function highlightTarget(payload,finalAttempt){
    if(!payload||payload.path!==location.pathname)return false;
    document.querySelectorAll('.yj-assistant-target-highlight').forEach(function(node){node.classList.remove('yj-assistant-target-highlight')});
    var needle=normalized(payload.text).slice(0,90),selectors='.markdown-section p,.markdown-section li,.markdown-section pre,.markdown-section blockquote,main p,main li,main summary,article p,article li,article summary,.description,.local-warning';
    var candidates=Array.prototype.slice.call(document.querySelectorAll(selectors)),target=null,matches=[],sectionFallback=false;
    if(needle.length>=8)matches=candidates.filter(function(node){return normalized(node.textContent).includes(needle)});
    target=matches.find(function(node){return node.getClientRects().length>0})||matches[0]||null;
    if(target)revealTarget(target);
    if(!target&&payload.hash){try{target=document.getElementById(decodeURIComponent(payload.hash.slice(1)))}catch(_){try{target=document.querySelector(payload.hash)}catch(__){target=null}}sectionFallback=!!target}
    if(!target){if(finalAttempt){window.scrollTo({top:0,behavior:'smooth'});locateNotice('未匹配到原句，已打开来源页面顶部。')}return false}
    target.classList.add('yj-assistant-target-highlight');
    requestAnimationFrame(function(){target.scrollIntoView({behavior:'smooth',block:'center'})});
    if(sectionFallback)locateNotice('未匹配到原句，已定位到相关章节。');
    setTimeout(function(){target.classList.remove('yj-assistant-target-highlight')},12000);
    return true;
  }
  function applyPendingHighlight(attempt){
    var payload;
    try{payload=JSON.parse(sessionStorage.getItem(highlightKey)||'null')}catch(_){payload=null}
    if(!payload||Date.now()-Number(payload.time||0)>5*60*1000){try{sessionStorage.removeItem(highlightKey)}catch(_){ }return}
    if(highlightTarget(payload,false)){try{sessionStorage.removeItem(highlightKey)}catch(_){ }return}
    if((attempt||0)<3)setTimeout(function(){applyPendingHighlight((attempt||0)+1)},300*Math.pow(2,attempt||0));
    else{highlightTarget(payload,true);try{sessionStorage.removeItem(highlightKey)}catch(_){ }}
  }
  function feedbackRecords(){
    try{
      var records=JSON.parse(localStorage.getItem(feedbackKey)||'[]');
      if(!Array.isArray(records))records=[];
      var cutoff=Date.now()-30*24*60*60*1000;
      records=records.filter(function(item){return item&&Date.parse(item.time)>=cutoff}).slice(-100).map(function(item){
        return {time:item.time,source:String(item.source||'').slice(0,300),helpful:!!item.helpful,reason:String(item.reason||'').slice(0,40),status:String(item.status||'').slice(0,24),matchLevel:String(item.matchLevel||'').slice(0,12)};
      });
      localStorage.setItem(feedbackKey,JSON.stringify(records));
      return records;
    }catch(_){return []}
  }
  function localFeedback(row,helpful,reason,data){
    try{
      var records=feedbackRecords();
      records.push({time:new Date().toISOString(),source:row&&row.doc&&row.doc.url||'',helpful:helpful,reason:reason||'',status:data&&data.status||'',matchLevel:data&&data.matchLevel||''});
      localStorage.setItem(feedbackKey,JSON.stringify(records.slice(-100)));
      return true;
    }catch(_){return false}
  }
  function aliasRecords(){
    try{
      var rows=JSON.parse(localStorage.getItem(aliasKey)||'[]');if(!Array.isArray(rows))rows=[];
      rows=rows.filter(function(row){return row&&typeof row.from==='string'&&typeof row.to==='string'&&row.from.trim()&&row.to.trim()}).slice(-100).map(function(row){return {from:row.from.trim().slice(0,40),to:row.to.trim().slice(0,80)}});
      localStorage.setItem(aliasKey,JSON.stringify(rows));return rows;
    }catch(_){return []}
  }
  function saveAlias(from,to){
    from=String(from||'').trim();to=String(to||'').trim();if(!from||!to)return {ok:false,message:'请填写用户常用说法和站内标准词。'};
    var privateFrom=sanitizeQuestion(from),privateTo=sanitizeQuestion(to);if(privateFrom.types.length||privateTo.types.length)return {ok:false,message:'检测到可能的敏感信息，未保存到词典。'};
    var rows=aliasRecords().filter(function(row){return normalized(row.from)!==normalized(from)});rows.push({from:from.slice(0,40),to:to.slice(0,80)});
    try{localStorage.setItem(aliasKey,JSON.stringify(rows.slice(-100)));return {ok:true,message:'已加入本机词典，下次检索自动生效。'}}catch(_){return {ok:false,message:'当前浏览器无法保存本机词典。'}}
  }
  function el(tag,className,text){var node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node}
  function dockPosition(){try{var value=localStorage.getItem(dockPositionKey);return /^(?:lower-right|middle-right|lower-left)$/.test(value)?value:'lower-right'}catch(_){return 'lower-right'}}
  function applyDockPosition(value,persist){
    value=/^(?:lower-right|middle-right|lower-left)$/.test(value)?value:'lower-right';
    [launch,panel].forEach(function(node){if(!node)return;node.classList.toggle('is-left',value==='lower-left');node.classList.toggle('is-middle',value==='middle-right');node.setAttribute('data-dock-position',value)});
    if(persist)try{localStorage.setItem(dockPositionKey,value)}catch(_){ }
  }
  function sourceLink(doc,excerpt){
    var link=el('a','yj-assistant-source'),url=new URL(doc.url,location.origin);
    if(url.origin!==location.origin)return null;
    var topUrl=url.origin+url.pathname+url.search;
    link.href=topUrl;link.setAttribute('aria-label','从顶部打开'+(doc.title||'来源页面'));
    if(url.pathname===location.pathname&&url.search===location.search){
      link.addEventListener('click',function(event){
        event.preventDefault();
        if(location.hash)history.replaceState(null,'',topUrl);
        hideAssistant();
        document.querySelectorAll('.body-inner,.book-body').forEach(function(node){node.scrollTop=0});
        window.scrollTo(0,0);
      });
    }
    link.appendChild(el('strong','',doc.title||'未命名页面'));
    var meta=doc.section||doc.category||'公开页面';if(doc.updated)meta+=' · 更新 '+doc.updated;
    link.appendChild(el('small','',meta));
    if(excerpt)link.appendChild(el('span','',excerpt));
    return link;
  }
  function locateLink(doc,piece){
    var url;
    try{url=new URL(doc.url,location.origin)}catch(_){return null}
    if(url.origin!==location.origin)return null;
    var link=el('a','yj-assistant-jump','定位并高亮原文 ↗');link.href=url.href;
    link.addEventListener('click',function(event){
      var payload={path:url.pathname,hash:url.hash,text:String(piece||'').slice(0,260),time:Date.now()};
      try{sessionStorage.setItem(highlightKey,JSON.stringify(payload))}catch(_){ }
      if(url.pathname===location.pathname&&url.search===location.search){event.preventDefault();hideAssistant();if(url.hash)history.replaceState(null,'',url.href);highlightTarget(payload,true)}
    });
    return link;
  }
  function intentCopy(intent,multiple){
    var rows={procedure:['操作指引','公开说明中找到以下操作依据：'],troubleshoot:['排查线索','根据报错信息找到以下公开排查依据：'],comparison:['对比依据','不同公开页面分别提供以下对比依据：'],calculation:['计算依据','请结合以下公开说明核对参数和计算条件：'],data:['数据与安全','公开说明中找到以下数据保存或安全依据：'],navigation:['相关入口','找到以下相关页面和工具入口：'],explain:['内容说明','公开页面中找到以下依据：']};
    var row=rows[intent]||rows.explain;
    if(multiple&&intent!=='comparison')row=[row[0],row[1].replace('以下','来自不同页面的以下')];
    return row;
  }
  function renderSuggestionButtons(container,questions){
    container.replaceChildren();
    questions.forEach(function(q){var button=el('button','',q);button.type='button';button.addEventListener('click',function(){ask(q)});container.appendChild(button)});
  }
  function pageContextCard(){
    if(location.pathname==='/'||location.pathname==='/interactive/')return null;
    var title=currentPageTitle(),card=el('section','yj-assistant-page-context'),label=el('div');
    label.appendChild(el('span','','正在阅读'));label.appendChild(el('strong','',title));card.appendChild(label);
    var actions=el('div','yj-assistant-page-actions'),context={kind:'page',title:title,url:location.pathname,lockUrl:location.pathname};
    [['总结本页','请总结《'+title+'》的主要内容'],['操作步骤','本页有哪些操作步骤和注意事项？'],['常见问题','本页涉及哪些常见问题和排查要点？']].forEach(function(item){
      var button=el('button','',item[0]);button.type='button';button.addEventListener('click',function(){ask(item[1],context)});actions.appendChild(button);
    });card.appendChild(actions);return card;
  }
  function renderAliasEditor(container,prefill){
    var form=el('form','yj-assistant-alias-form'),from=el('input'),to=el('input'),add=el('button','','加入词典'),message=el('span','yj-assistant-alias-message');
    from.type=to.type='text';from.maxLength=40;to.maxLength=80;from.placeholder='用户常用说法';to.placeholder='站内标准词';from.value=String(prefill||'').slice(0,40);add.type='submit';
    form.append(from,to,add,message);form.addEventListener('submit',function(event){event.preventDefault();var result=saveAlias(from.value,to.value);message.textContent=result.message;if(result.ok){from.value='';to.value='';var list=container.querySelector('.yj-assistant-alias-list');if(list)renderAliasList(list)}});container.appendChild(form);
  }
  function renderAliasList(container){
    container.replaceChildren();var rows=aliasRecords();
    if(!rows.length){container.appendChild(el('p','yj-assistant-hint','尚未添加本机同义词。'));return}
    rows.forEach(function(row,index){var item=el('div','yj-assistant-alias-item'),text=el('span','',row.from+' → '+row.to),remove=el('button','','删除');remove.type='button';remove.addEventListener('click',function(){var next=aliasRecords();next.splice(index,1);try{localStorage.setItem(aliasKey,JSON.stringify(next))}catch(_){ }renderAliasList(container)});item.append(text,remove);container.appendChild(item)});
  }
  function feedbackReport(records,container){
    var valid=records.filter(function(row){return row&&typeof row==='object'}),negative=valid.filter(function(row){return row.helpful===false}),reasonCounts={},sourceCounts={};
    negative.forEach(function(row){var reason=String(row.reason||'未注明原因').slice(0,40),source=String(row.source||'未注明页面').slice(0,300);reasonCounts[reason]=(reasonCounts[reason]||0)+1;sourceCounts[source]=(sourceCounts[source]||0)+1});
    container.replaceChildren();container.appendChild(el('strong','','本机反馈分析：'+valid.length+' 条，其中未解决 '+negative.length+' 条'));
    var reasons=Object.keys(reasonCounts).sort(function(a,b){return reasonCounts[b]-reasonCounts[a]}),sources=Object.keys(sourceCounts).sort(function(a,b){return sourceCounts[b]-sourceCounts[a]}).slice(0,5);
    if(reasons.length){var reasonList=el('ul');reasons.forEach(function(key){reasonList.appendChild(el('li','',key+'：'+reasonCounts[key]+' 条'))});container.appendChild(reasonList)}
    if(sources.length){container.appendChild(el('span','','优先复核页面'));var sourceList=el('ol');sources.forEach(function(key){sourceList.appendChild(el('li','',(key||'未注明页面')+' · '+sourceCounts[key]+' 条'))});container.appendChild(sourceList)}
    if(!negative.length)container.appendChild(el('p','yj-assistant-hint','没有发现“没解决”记录。'));
  }
  function renderLocalTools(container){
    var details=el('details','yj-assistant-local-tools'),summary=el('summary','','本机反馈分析与检索词典'),content=el('div','yj-assistant-local-tools-content');details.append(summary,content);
    var privacy=el('p','yj-assistant-hint','文件只在当前浏览器读取，不上传；词典最多保存 100 条，可随时导出或清空。');content.appendChild(privacy);
    var row=el('div','yj-assistant-local-tool-actions'),analyze=el('button','','分析反馈文件'),file=el('input'),exportAliases=el('button','','导出词典'),clearAliases=el('button','','清空词典');
    analyze.type=exportAliases.type=clearAliases.type='button';file.type='file';file.accept='application/json,.json';file.hidden=true;
    analyze.addEventListener('click',function(){file.click()});file.addEventListener('change',function(){
      var selected=file.files&&file.files[0],report=content.querySelector('.yj-assistant-feedback-report');if(!selected)return;if(selected.size>2*1024*1024){report.textContent='文件超过 2 MB，未读取。';return}
      var reader=new FileReader();reader.onload=function(){try{var parsed=JSON.parse(String(reader.result||'')),rows=Array.isArray(parsed)?parsed:Array.isArray(parsed.items)?parsed.items:null;if(!rows)throw Error();feedbackReport(rows,report)}catch(_){report.textContent='无法识别该反馈文件，请选择机器人导出的 JSON。'}};reader.readAsText(selected);file.value='';
    });
    exportAliases.addEventListener('click',function(){downloadText('site-assistant-aliases.json',JSON.stringify(aliasRecords(),null,2),'application/json;charset=utf-8',content)});
    clearAliases.addEventListener('click',function(){try{localStorage.removeItem(aliasKey)}catch(_){ }renderAliasList(content.querySelector('.yj-assistant-alias-list'))});
    row.append(analyze,file,exportAliases,clearAliases);content.appendChild(row);content.appendChild(el('div','yj-assistant-feedback-report'));
    content.appendChild(el('h4','','添加本机同义词'));renderAliasEditor(content,'');var list=el('div','yj-assistant-alias-list');content.appendChild(list);renderAliasList(list);container.appendChild(details);
  }
  function renderWelcome(switched){
    body.replaceChildren();
    body.appendChild(el('p','yj-assistant-message',switched?'已切换到当前页面，可以继续提问。':'想找哪个功能，或想了解哪篇文章里的做法？直接提问。'));
    var pageCard=pageContextCard();if(pageCard)body.appendChild(pageCard);
    suggestions=el('div','yj-assistant-suggestions');
    var suggestionBox=suggestions,pathAtRequest=location.pathname;
    renderSuggestionButtons(suggestionBox,['机柜管理数据保存在哪里？','如何规划 PoE 供电？','有哪些备份恢复工具？']);body.appendChild(suggestionBox);
    if(pathAtRequest!=='/'&&pathAtRequest!=='/interactive/')pageSuggestions().then(function(data){if(data.suggestions&&data.suggestions.length&&suggestionBox.isConnected&&location.pathname===pathAtRequest)renderSuggestionButtons(suggestionBox,data.suggestions)}).catch(function(){ });
    body.appendChild(el('p','yj-assistant-hint','只检索网站公开内容，不读取你在在线工具中保存的本地记录；当前为原文检索式回答，不调用外部 AI。'));
    renderLocalTools(body);
    renderHistory(body);
  }
  function syncPageContext(force){
    var next=location.pathname;if(!force&&next===currentPath)return;
    var switched=!!currentPath&&next!==currentPath;currentPath=next;topic=null;activeAsk++;cancelActiveSearch();
    if(submit)submit.disabled=false;if(body)renderWelcome(switched);applyPendingHighlight(0);
  }
  function watchPageChanges(){
    window.addEventListener('popstate',function(){setTimeout(function(){syncPageContext(false)},0)});
    if(window.gitbook&&window.gitbook.events&&window.gitbook.events.bind)window.gitbook.events.bind('page.change',function(){setTimeout(function(){syncPageContext(false)},0)});
    var root=document.querySelector('.book-body')||document.body,timer;
    if(window.MutationObserver&&root)new MutationObserver(function(){clearTimeout(timer);timer=setTimeout(function(){syncPageContext(false)},80)}).observe(root,{childList:true,subtree:true});
  }
  function sectionBlock(title,kind){var section=el('section','yj-assistant-answer-section is-'+kind);section.appendChild(el('h3','',title));return section}
  function evidencePieces(answer,limit){
    var seen={},pieces=[];answer.forEach(function(row){(row.evidence||[]).forEach(function(piece){var key=normalized(piece);if(piece&&key&&!seen[key]&&pieces.length<limit){seen[key]=true;pieces.push(piece)}})});return pieces;
  }
  function statusMessage(data,results){
    if(data.status==='conflict')return '公开来源存在疑似相反表述，当前不合并为一个结论。';
    if(data.status==='needs_detail')return '问题还不够具体。'+(data.clarification||'请补充想完成的操作。');
    if(data.status==='no_content')return data.clarification||'站内公开内容暂未找到足以回答这个问题的依据。';
    if(results.length)return '找到了可能相关的页面，但现有片段不足以直接确认答案。'+(data.clarification||'请补充具体场景。');
    return '暂时没有在已公开内容中找到可靠依据。'+(data.clarification||'请补充产品或功能名称。');
  }
  function matchBadge(data){
    var level=/^(?:high|medium|low)$/.test(data.matchLevel)?data.matchLevel:(data.confident?'high':data.results&&data.results.length?'medium':'low');
    var labels={high:'高匹配',medium:'可能相关',low:'资料不足'},badge=el('span','yj-assistant-match is-'+level,labels[level]);
    badge.title=data.matchNote||'';badge.setAttribute('aria-label',labels[level]+(data.matchNote?'：'+data.matchNote:''));return badge;
  }
  function looksLikeCommand(text){return /(^|\s)(sudo|systemctl|service|journalctl|docker|kubectl|helm|git|npm|pnpm|yarn|python|pip|node|nginx|ssh|scp|rsync|curl|wget|ping|traceroute|tracert|ipconfig|ifconfig|netstat|ss|route|iptables|firewall-cmd|show|display|undo|interface|vlan|conf(?:igure)?\s+t|SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER)\b|^[\w./-]+\s+--?[\w-]+/im.test(String(text||''))}
  function commandRisk(text){return /\brm\s+-rf\b|\bmkfs\b|\bformat\b|\bshutdown\b|\breboot\b|\bdelete\b|\bdrop\s+(?:table|database)\b|\btruncate\b|\bclear\b|\berase\b|\bundo\b|\bno\s+\w+/i.test(String(text||''))}
  function appendAnswerPoint(list,piece,question,data){
    var item=el('li'),text=el('span','yj-assistant-point-text',piece);item.appendChild(text);
    if(looksLikeCommand(piece)){
      item.classList.add('has-command');var tools=el('div','yj-assistant-inline-tools'),copy=el('button','','复制命令'),explain=el('button','','逐行解释');copy.type=explain.type='button';
      copy.addEventListener('click',function(){safeCopyText(piece,copy,item)});explain.addEventListener('click',function(){ask('请逐行解释下面命令的作用、参数和注意事项：\n'+piece)});tools.append(copy,explain);
      if(commandRisk(piece))tools.prepend(el('span','yj-assistant-risk','执行前确认'));
      item.appendChild(tools);
    }
    list.appendChild(item);
  }
  function checklistMarkdown(question,data,pieces,checks){
    var rows=['# 执行清单','','问题：'+question,'','匹配等级：'+({high:'高匹配',medium:'可能相关',low:'资料不足'}[data.matchLevel]||'未标注'),''];
    pieces.forEach(function(piece,index){rows.push('- ['+(checks&&checks[index]?'x':' ')+'] '+piece)});rows.push('','## 来源');
    (data.answer||[]).forEach(function(row){rows.push('- ['+(row.doc.title||'来源页面')+']('+new URL(row.doc.url,location.origin).href+')')});rows.push('','> 请在执行前核对设备、版本、环境和原文。');return rows.join('\n');
  }
  function escapeHtml(value){return String(value||'').replace(/[&<>"']/g,function(char){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]})}
  function printChecklist(question,pieces,container){
    var iframe=el('iframe','yj-assistant-print-frame');iframe.title='打印执行清单';document.body.appendChild(iframe);
    var html='<!doctype html><html><head><meta charset="utf-8"><title>执行清单</title><style>body{font:16px/1.65 system-ui,"Microsoft YaHei",sans-serif;color:#17324d;padding:32px}h1{font-size:24px}li{margin:12px 0}small{color:#667}</style></head><body><h1>执行清单</h1><p>'+escapeHtml(question)+'</p><ol>'+pieces.map(function(piece){return '<li>□ '+escapeHtml(piece)+'</li>'}).join('')+'</ol><small>请在执行前核对设备、版本、环境和原文。</small></body></html>';
    iframe.onload=function(){try{iframe.contentWindow.focus();iframe.contentWindow.print()}finally{setTimeout(function(){iframe.remove()},1200)}};iframe.srcdoc=privacySafeText(html,container);
  }
  function renderChecklist(question,data,pieces){
    var existing=body.querySelector('.yj-assistant-checklist');if(existing){existing.open=true;existing.scrollIntoView({block:'nearest'});return}
    var details=el('details','yj-assistant-checklist');details.open=true;details.appendChild(el('summary','','执行清单 · '+pieces.length+' 项'));
    var progress=el('p','yj-assistant-checklist-progress','已完成 0 / '+pieces.length),list=el('ol','yj-assistant-checklist-list'),checks=[];
    pieces.forEach(function(piece,index){var item=el('li'),label=el('label'),box=el('input');box.type='checkbox';checks[index]=false;box.addEventListener('change',function(){checks[index]=box.checked;progress.textContent='已完成 '+checks.filter(Boolean).length+' / '+pieces.length});label.append(box,el('span','',piece));item.appendChild(label);list.appendChild(item)});
    var actions=el('div','yj-assistant-checklist-actions'),copy=el('button','','复制 Markdown'),download=el('button','','下载 .md'),print=el('button','','打印清单');copy.type=download.type=print.type='button';
    copy.addEventListener('click',function(){safeCopyText(checklistMarkdown(question,data,pieces,checks),copy,details)});download.addEventListener('click',function(){downloadText('assistant-checklist.md',checklistMarkdown(question,data,pieces,checks),'text/markdown;charset=utf-8',details)});print.addEventListener('click',function(){printChecklist(question,pieces,details)});actions.append(copy,download,print);details.append(progress,list,actions);body.appendChild(details);details.scrollIntoView({block:'nearest'});
  }
  function show(question,data,usedContext,options){
    var results=data.results||[],answer=data.answer||[],intent=data.intent||'explain',copy=intentCopy(intent,answer.length>1);
    if(!(options&&options.replay))rememberTurn(question,data,usedContext);
    body.replaceChildren();
    body.appendChild(el('p','yj-assistant-question',question));
    if(data.redactions&&data.redactions.length)body.appendChild(el('p','yj-assistant-redaction-note','提交前已在本机遮盖：'+data.redactions.join('、')+'。原始内容未进入检索与会话记录。'));
    var moreDetails=el('details','yj-assistant-more'),moreSummary=el('summary','','查看更多详情'),moreContent=el('div','yj-assistant-more-content');moreDetails.append(moreSummary,moreContent);
    if(usedContext)moreContent.appendChild(el('p','yj-assistant-context',usedContext.kind==='selection'?'仅在当前页面内解释所选文字。':usedContext.kind==='page'?'已结合当前页面的公开说明；仍会核对问题本身的依据。':'结合上一问「'+usedContext.title+'」检索 · 可点“新话题”重置'));
    var badges=el('div','yj-assistant-badges');badges.appendChild(el('span','yj-assistant-intent is-'+intent,copy[0]));badges.appendChild(matchBadge(data));moreContent.appendChild(badges);
    if(data.matchNote)moreContent.appendChild(el('p','yj-assistant-match-note',data.matchNote));
    if(data.signals&&data.signals.length){
      var signalBox=el('div','yj-assistant-signals');signalBox.appendChild(el('strong','','已拆解报错：'));
      data.signals.forEach(function(signal){signalBox.appendChild(el('code','',signal))});moreContent.appendChild(signalBox);
    }
    if(data.confident&&results.length)topic={title:results[0].doc.title,url:results[0].doc.url};
    var conclusion=sectionBlock('直接结论','conclusion'),pieces=evidencePieces(answer,6);
    if(data.status==='answered'&&data.confident&&pieces.length){
      conclusion.appendChild(el('blockquote','yj-assistant-conclusion-quote',pieces[0]));
    }else conclusion.appendChild(el('p',data.status==='conflict'?'yj-assistant-conflict':'yj-assistant-message','暂不输出推断性结论。'+statusMessage(data,results)));
    body.appendChild(conclusion);

    if(answer.length){
      var isSteps=intent==='procedure'||intent==='troubleshoot',points=sectionBlock(isSteps?'操作步骤':'核对要点',isSteps?'steps':'points');
      var list=el(isSteps?'ol':'ul','yj-assistant-structured-list');pieces.slice(1,6).forEach(function(piece){appendAnswerPoint(list,piece,question,data)});
      if(list.childNodes.length){points.appendChild(list);body.appendChild(points)}
    }
    if(answer.length){
      var primarySource=sourceLink(answer[0].doc);if(primarySource){var primary=el('div','yj-assistant-primary-source');primary.appendChild(el('span','','来源'));primarySource.classList.add('is-compact');primary.appendChild(primarySource);body.appendChild(primary)}
    }

    var cautions=[];
    if(data.status==='conflict')cautions.push('来源存在疑似相反表述，请先核对版本、设备条件和原文，再进行实际操作。');
    if(data.versionSensitive&&answer.length)cautions.push('配置和命令可能随软件、系统或设备版本变化，请结合来源更新时间与实际版本核对。');
    if(answer.length>1)cautions.push('本回答引用多个页面，各页面依据分别展示，不自动合并推断。');
    if(intent==='data'&&answer.length)cautions.push('涉及本地数据时，请先确认保存位置并完成备份，再清理浏览器数据或更换设备。');
    if(!answer.length)cautions.push('当前依据不足，请补充产品、版本、环境或目标操作后再检索。');
    if(cautions.length){var caution=sectionBlock('注意事项','caution'),cautionList=el('ul','yj-assistant-structured-list');cautions.forEach(function(text){cautionList.appendChild(el('li','',text))});caution.appendChild(cautionList);moreContent.appendChild(caution)}

    var evidenceSection=el('div','yj-assistant-evidence-content');
    if(answer.length)evidenceSection.appendChild(el('p','yj-assistant-section-note',copy[1]+(answer.length>1?'各页面原文分别列出。':'')));
    if(data.status==='answered'){
      var toolActions=el('div','yj-assistant-tool-actions'),seenTools={};
      answer.forEach(function(row){
        var doc=row.doc||{},url;
        try{url=new URL(doc.url,location.origin)}catch(_){return}
        if(url.origin!==location.origin||seenTools[url.pathname])return;
        seenTools[url.pathname]=true;
        var isTool=/^\/interactive\/[^/]+\//.test(url.pathname);
        var action=el('a','yj-assistant-tool-action'+(isTool?'':' is-article'),(isTool?'打开「':'查看「')+doc.title+(isTool?'」工具 →':'」说明 →'));
        action.href=isTool?url.origin+url.pathname+url.search:url.href;
        toolActions.appendChild(action);
      });
    }
    answer.forEach(function(row){
      var block=el('div','yj-assistant-evidence-block'),link=sourceLink(row.doc);
      if(!link)return;
      block.appendChild(link);
      var evidence=el(intent==='procedure'||intent==='troubleshoot'?'ol':'ul','yj-assistant-evidence is-'+intent);
      row.evidence.forEach(function(piece){if(piece)evidence.appendChild(el('li','',piece))});
      block.appendChild(evidence);
      var jump=locateLink(row.doc,row.evidence[0]);if(jump)block.appendChild(jump);
      evidenceSection.appendChild(block);
    });
    results.forEach(function(row){
      if(answer.some(function(item){return item.doc.url.split('#')[0]===row.doc.url.split('#')[0]}))return;
      var doc=row.doc,link=sourceLink(doc,row.excerpt||'');if(!link)return;
      var result=el('div','yj-assistant-result');result.appendChild(link);
      var jump=locateLink(doc,row.excerpt||'');if(jump)result.appendChild(jump);
      evidenceSection.appendChild(result);
    });
    if(answer.length||results.length){
      var cited={},evidenceCount=0;answer.forEach(function(row){cited[row.doc.url.split('#')[0]]=true;evidenceCount+=(row.evidence||[]).length});results.forEach(function(row){cited[row.doc.url.split('#')[0]]=true});
      var evidenceDetails=el('details','yj-assistant-evidence-details'),evidenceSummary=el('summary','','原文依据 · '+Object.keys(cited).length+' 个页面 / '+evidenceCount+' 条原文');
      evidenceDetails.append(evidenceSummary,evidenceSection);moreContent.appendChild(evidenceDetails);
    }
    if(toolActions&&toolActions.childNodes.length){var related=sectionBlock('相关工具与页面','related');related.appendChild(toolActions);moreContent.appendChild(related)}
    if(data.choices&&data.choices.length){
      body.appendChild(el('p','yj-assistant-choice-heading','可以先缩小查询范围：'));
      var choices=el('div','yj-assistant-choices');
      data.choices.forEach(function(choice){
        var button=el('button','',choice.label);button.type='button';
        button.addEventListener('click',function(){
          if(choice.kind==='source')ask(question,{title:choice.title,url:choice.url,lockUrl:choice.url});
          else{setInputValue(question+'；'+choice.label+'：');input.focus();input.setSelectionRange(input.value.length,input.value.length)}
        });choices.appendChild(button);
      });body.appendChild(choices);
    }
    var actions=el('div','yj-assistant-actions');
    var reset=el('button','','新话题');reset.type='button';reset.addEventListener('click',function(){topic=null;body.replaceChildren(el('p','yj-assistant-message','已清除当前话题上下文，可以开始新话题。本次问答记录仍可展开查看。'));renderHistory(body);setInputValue('');input.focus()});actions.appendChild(reset);
    var copyAnswer=el('button','','复制回答');copyAnswer.type='button';copyAnswer.addEventListener('click',function(){safeCopyText(answerText(question,data),copyAnswer,body)});actions.appendChild(copyAnswer);
    body.appendChild(actions);
    var detailActions=el('div','yj-assistant-actions is-secondary');
    if(pieces.length){var checklist=el('button','','生成执行清单');checklist.type='button';checklist.addEventListener('click',function(){renderChecklist(question,data,pieces)});detailActions.appendChild(checklist)}
    var helpful=el('button','','有帮助'),unhelpful=el('button','','没解决');helpful.type=unhelpful.type='button';detailActions.append(helpful,unhelpful);
    helpful.addEventListener('click',function(){var saved=localFeedback(results[0],true,'',data);helpful.disabled=unhelpful.disabled=true;moreContent.appendChild(el('p','yj-assistant-hint',saved?'已记录到当前浏览器，30 天后自动清理；不保存问题原文。':'浏览器未允许保存反馈，未上传任何内容。'))});
    unhelpful.addEventListener('click',function(){
      helpful.disabled=unhelpful.disabled=true;var reasons=el('div','yj-assistant-feedback-reasons');reasons.appendChild(el('strong','','没解决的原因：'));
      ['答非所问','内容过时','步骤不完整','链接失效'].forEach(function(reason){var button=el('button','',reason);button.type='button';button.addEventListener('click',function(){var saved=localFeedback(results[0],false,reason,data);reasons.querySelectorAll('button').forEach(function(node){node.disabled=true});reasons.appendChild(el('span','',saved?'已在本机记录，不保存问题原文。':'当前浏览器无法保存，未上传。'));if(reason==='答非所问'){var aliasBox=el('div','yj-assistant-feedback-alias');aliasBox.appendChild(el('strong','','可选：告诉机器人你的常用说法对应哪个站内标准词'));renderAliasEditor(aliasBox,question.length<=40?question:'');reasons.appendChild(aliasBox)}});reasons.appendChild(button)});moreContent.appendChild(reasons);
    });
    moreContent.appendChild(detailActions);
    if(data.versionSensitive||intent==='procedure'||intent==='troubleshoot'){
      var environments=el('div','yj-assistant-environments');environments.appendChild(el('span','','切换环境：'));
      ['Linux','Windows','华为','华三','思科'].forEach(function(name){var button=el('button','',name);button.type='button';button.addEventListener('click',function(){ask(question+'；运行环境：'+name)});environments.appendChild(button)});moreContent.appendChild(environments);
    }
    var exportButton=el('button','yj-assistant-export','下载本机反馈');exportButton.type='button';
    exportButton.addEventListener('click',function(){
      try{
        downloadText('site-assistant-feedback.json',JSON.stringify(feedbackRecords(),null,2),'application/json;charset=utf-8',body);
      }catch(_){body.appendChild(el('p','yj-assistant-hint','当前浏览器无法下载本机反馈。'))}
    });moreContent.appendChild(exportButton);
    var clearButton=el('button','yj-assistant-export','清空本机反馈');clearButton.type='button';
    clearButton.addEventListener('click',function(){try{localStorage.removeItem(feedbackKey);moreContent.appendChild(el('p','yj-assistant-hint','本机反馈已清空。'))}catch(_){moreContent.appendChild(el('p','yj-assistant-hint','当前浏览器无法清空反馈。'))}});moreContent.appendChild(clearButton);
    moreContent.appendChild(el('p','yj-assistant-hint','回答依据仅为公开页面的原文节选；涉及实际操作时请以原文和设备现状为准。'));
    renderLocalTools(moreContent);
    renderHistory(moreContent);
    body.appendChild(moreDetails);
  }
  function ask(value,selectedContext){
    var raw=String(value||'').trim().slice(0,2000),sanitized=sanitizeQuestion(raw),question=sanitized.text.trim();
    if(!question)return;
    var pageContext=selectedContext?null:currentPageContext(question);
    var followupContext=followup(question)?{title:topic.title,url:topic.url}:null;
    var context=selectedContext||(pageContext&&!pageContext.ambient?pageContext:null)||followupContext||pageContext;
    var usedContext=context?{kind:context.kind||'followup',title:context.title}:null;
    if(!usedContext)topic=null;
    var call=++activeAsk;
    cancelActiveSearch();
    setInputValue('');submit.disabled=true;
    body.replaceChildren(el('p','yj-assistant-message','正在查找公开文章与工具介绍…'));
    search(question,context).then(function(data){if(call===activeAsk){data.redactions=sanitized.types;show(question,data,usedContext)}}).catch(function(error){if(call===activeAsk&&!(error&&error.cancelled))body.replaceChildren(el('p','yj-assistant-message','暂时无法加载站内内容索引，请刷新页面后重试。'))}).finally(function(){if(call===activeAsk)submit.disabled=false});
  }
  function mount(){
    if(document.querySelector('.yj-assistant-launch'))return;
    feedbackRecords();
    currentPath=location.pathname;applyPendingHighlight(0);
    launch=el('button','yj-assistant-launch');launch.type='button';
    launch.setAttribute('aria-label','打开站内内容问答助手');
    launch.setAttribute('title','站内问答助手');
    launch.setAttribute('aria-controls','yj-assistant-panel');launch.setAttribute('aria-expanded','false');
    launch.innerHTML='<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path class="yj-robot-antenna" d="M32 16V9"/><circle class="yj-robot-antenna-tip" cx="32" cy="7" r="3"/><path class="yj-robot-ear" d="M10 30H7v10h3m44-10h3v10h-3"/><rect class="yj-robot-shell" x="10" y="17" width="44" height="35" rx="13"/><rect class="yj-robot-screen" x="15" y="23" width="34" height="23" rx="9"/><path class="yj-robot-eye" d="M24 31v6m16-6v6"/><path class="yj-robot-smile" d="M28 40c2.5 2 5.5 2 8 0"/><path class="yj-robot-chin" d="M25 52v4h14v-4"/></svg>';
    panel=el('section','yj-assistant-panel');panel.id='yj-assistant-panel';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','站内内容问答助手');
    applyDockPosition(dockPosition(),false);
    var sheetHandle=el('div','yj-assistant-sheet-handle');sheetHandle.tabIndex=0;sheetHandle.setAttribute('role','separator');sheetHandle.setAttribute('aria-label','拖动调整问答窗口高度，下滑关闭');sheetHandle.setAttribute('aria-orientation','horizontal');
    var head=el('div','yj-assistant-head'),heading=el('div'),headActions=el('div','yj-assistant-head-actions'),close=el('button','yj-assistant-close','×');close.type='button';close.setAttribute('aria-label','关闭问答');
    var positionPicker=el('details','yj-assistant-position-picker'),positionSummary=el('summary','','位置'),positionMenu=el('div','yj-assistant-position-menu');positionPicker.append(positionSummary,positionMenu);
    [['lower-right','右下'],['middle-right','右侧中部'],['lower-left','左下']].forEach(function(item){var button=el('button','',item[1]);button.type='button';button.addEventListener('click',function(){applyDockPosition(item[0],true);positionPicker.open=false;scheduleDockLayout()});positionMenu.appendChild(button)});
    heading.appendChild(el('strong','','站内内容问答'));heading.appendChild(el('small','','公开文章与工具介绍 · 原文可追溯'));headActions.append(positionPicker,close);head.append(heading,headActions);
    body=el('div','yj-assistant-body');body.setAttribute('aria-live','polite');
    var form=el('form','yj-assistant-form'),compose=el('div','yj-assistant-compose');input=el('textarea');input.rows=1;input.maxLength=2000;input.placeholder='提问，或粘贴多行报错信息';input.setAttribute('aria-label','输入站内问题或多行报错信息');
    var composerMeta=el('div','yj-assistant-composer-meta');composerCount=el('span','','0 / 2000');clearInput=el('button','yj-assistant-clear','清空');clearInput.type='button';clearInput.hidden=true;clearInput.addEventListener('click',function(){setInputValue('');input.focus()});composerMeta.append(composerCount,clearInput);compose.append(input,composerMeta);
    submit=el('button','yj-assistant-submit','提问');submit.type='submit';form.append(compose,submit);
    input.addEventListener('input',resizeComposer);input.addEventListener('keydown',function(event){if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();form.requestSubmit()}});
    form.addEventListener('submit',function(event){event.preventDefault();ask(input.value)});
    var dockTimer,dockLayoutFrame;
    function wakeLaunch(){clearTimeout(dockTimer);launch.classList.remove('is-idle')}
    function scheduleDock(){clearTimeout(dockTimer);launch.classList.remove('is-idle')}
    function adjustDockCollision(){
      dockLayoutFrame=0;if(innerWidth>620){launch.style.removeProperty('--yj-assistant-mobile-bottom');launch.classList.remove('is-idle');return}
      if(launch.classList.contains('is-left')||launch.classList.contains('is-middle')){launch.style.setProperty('--yj-assistant-mobile-bottom','10px');return}
      var selectors='#back-to-top,.back-to-top,.back-to-top-button,#back-to-top-button,#anchorNavigationExGoTop,[data-back-to-top],[aria-label="返回顶部"],[title="返回顶部"]';
      var required=10;
      Array.prototype.slice.call(document.querySelectorAll(selectors)).forEach(function(node){
        if(node===launch||node.closest&&node.closest('.yj-assistant-panel'))return;
        var style=getComputedStyle(node),rect=node.getBoundingClientRect();
        if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0||!rect.width||!rect.height)return;
        if(rect.right<innerWidth-120||rect.bottom<innerHeight-190)return;
        required=Math.max(required,Math.ceil(innerHeight-rect.top+10));
      });
      launch.style.setProperty('--yj-assistant-mobile-bottom',Math.min(required,190)+'px');
    }
    function scheduleDockLayout(){if(dockLayoutFrame)return;dockLayoutFrame=requestAnimationFrame(adjustDockCollision)}
    function toggle(open){wakeLaunch();panel.hidden=!open;launch.setAttribute('aria-expanded',String(open));launch.classList.toggle('is-open',open);if(open){if(innerWidth<=620)sheetHandle.focus({preventScroll:true});else input.focus()}else{input.blur();launch.focus({preventScroll:true});scheduleDock(2600)}}
    toggleAssistant=toggle;
    var dragPointer=0,dragStartY=0,dragLastY=0,dragStartHeight=0;
    sheetHandle.addEventListener('pointerdown',function(event){if(innerWidth>620||event.button>0)return;dragPointer=event.pointerId;dragStartY=dragLastY=event.clientY;dragStartHeight=panel.getBoundingClientRect().height;panel.classList.add('is-dragging');sheetHandle.setPointerCapture(event.pointerId);event.preventDefault()});
    sheetHandle.addEventListener('pointermove',function(event){if(event.pointerId!==dragPointer)return;dragLastY=event.clientY;var height=Math.max(300,Math.min(innerHeight-8,dragStartHeight+dragStartY-event.clientY));panel.style.setProperty('--yj-assistant-sheet-height',height+'px')});
    function finishSheetDrag(event){if(event.pointerId!==dragPointer)return;var down=dragLastY-dragStartY;dragPointer=0;panel.classList.remove('is-dragging');if(down>110)toggle(false)}
    sheetHandle.addEventListener('pointerup',finishSheetDrag);sheetHandle.addEventListener('pointercancel',finishSheetDrag);
    sheetHandle.addEventListener('keydown',function(event){if(innerWidth>620||!/^Arrow(?:Up|Down)$/.test(event.key))return;event.preventDefault();var height=panel.getBoundingClientRect().height+(event.key==='ArrowUp'?40:-40);panel.style.setProperty('--yj-assistant-sheet-height',Math.max(300,Math.min(innerHeight-8,height))+'px')});
    launch.addEventListener('click',function(){toggle(panel.hidden)});close.addEventListener('click',function(){toggle(false)});
    launch.addEventListener('pointerenter',wakeLaunch);launch.addEventListener('pointerdown',wakeLaunch);launch.addEventListener('focus',wakeLaunch);
    launch.addEventListener('pointerleave',function(){scheduleDock(1800)});launch.addEventListener('blur',function(){scheduleDock(1800)});
    window.addEventListener('scroll',function(){if(panel.hidden)scheduleDock(500);scheduleDockLayout()},{passive:true});
    window.addEventListener('resize',function(){wakeLaunch();scheduleDockLayout()},{passive:true});
    document.addEventListener('keydown',function(event){if(event.key==='Escape'&&!panel.hidden)toggle(false)});
    selectionAsk=el('button','yj-assistant-selection-ask','问机器人');selectionAsk.type='button';selectionAsk.hidden=true;document.body.appendChild(selectionAsk);
    var selectedText='',selectionTimer;
    function updateSelectionAsk(){
      clearTimeout(selectionTimer);selectionTimer=setTimeout(function(){
        var selection=window.getSelection(),text=String(selection&&selection.toString()||'').replace(/\s+/g,' ').trim();
        var anchor=selection&&selection.anchorNode&&selection.anchorNode.parentElement;
        if(text.length<4||text.length>500||!anchor||anchor.closest('.yj-assistant-panel,input,textarea,[contenteditable="true"]')){selectionAsk.hidden=true;selectedText='';return}
        var range=selection.getRangeAt(0),rect=range.getBoundingClientRect();if(!rect.width&&!rect.height){selectionAsk.hidden=true;return}
        selectedText=text;selectionAsk.hidden=false;selectionAsk.style.left=Math.max(8,Math.min(innerWidth-selectionAsk.offsetWidth-8,rect.left+rect.width/2-selectionAsk.offsetWidth/2))+'px';selectionAsk.style.top=Math.max(8,rect.top-selectionAsk.offsetHeight-8)+'px';
      },80);
    }
    document.addEventListener('selectionchange',updateSelectionAsk);document.addEventListener('mouseup',updateSelectionAsk);document.addEventListener('touchend',updateSelectionAsk,{passive:true});
    selectionAsk.addEventListener('pointerdown',function(event){event.preventDefault()});selectionAsk.addEventListener('click',function(){if(!selectedText)return;var text=selectedText,title=currentPageTitle();selectionAsk.hidden=true;toggle(true);ask('请解释这段内容：\n'+text,{kind:'selection',title:title,url:location.pathname,lockUrl:location.pathname})});
    panel.append(sheetHandle,head,body,form);document.body.append(launch,panel);resizeComposer();renderWelcome(false);watchPageChanges();scheduleDockLayout();setTimeout(scheduleDockLayout,500);scheduleDock(5200);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
