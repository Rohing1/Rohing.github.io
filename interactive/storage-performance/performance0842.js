(function(){
  'use strict';
  const M=window.StoragePerformanceModel,KEY='yj-storage-performance-v1',keys=['preset','level','count','readIops','writeIops','readMBs','writeMBs','mode','readPct','ioKiB','networkGbps','demandIops','latencyMs'];
  const $=s=>document.querySelector(s);const el=(tag,text)=>{const x=document.createElement(tag);x.textContent=text;return x;};
  function initial(){return {schema:1,preset:'hdd',level:'5',count:8,readIops:180,writeIops:180,readMBs:220,writeMBs:200,mode:'random',readPct:70,ioKiB:4,networkGbps:10,demandIops:1000,latencyMs:10};}
  function load(){try{const value=JSON.parse(localStorage.getItem(KEY));if(value&&value.schema===1&&keys.every(k=>Object.hasOwn(value,k)))return value;}catch(_){}return initial();}
  let plan=load();
  function format(n,digits=0){return Number.isFinite(n)?new Intl.NumberFormat('zh-CN',{maximumFractionDigits:digits}).format(n):'—';}
  function save(){try{localStorage.setItem(KEY,JSON.stringify(plan));$('#save-status').textContent='方案已在当前浏览器自动保存 · 请定期导出备份。';}catch(_){$('#save-status').textContent='本地保存不可用，请下载方案备份。';}}
  function setFields(){for(const k of keys)$('#'+k).value=plan[k];$('#read-label').textContent=plan.readPct+'%';render();}
  function compare(){const target=$('#compare');target.replaceChildren();for(const level of ['0','1','5','6','10']){const row=document.createElement('tr');if(level===String(plan.level))row.className='current';row.append(el('td','RAID '+level));if(!M.validLevel(level,Number(plan.count))){const cell=el('td','盘数不适用');cell.colSpan=3;row.append(cell);}else{const r=M.calculate({...plan,level});row.append(el('td',String(r.dataDrives)),el('td',level==='5'?'4×':level==='6'?'6×':level==='0'?'1×':'2×'),el('td',r.valid?`${format(r.ceilingIops)} IOPS / ${format(r.ceilingMBs,1)} MB/s`:'—'));}target.append(row);}}
  function render(){const r=M.calculate(plan);$('#read-label').textContent=plan.readPct+'%';compare();if(!r.valid){$('#result-title').textContent='请调整输入';$('#result-note').textContent=r.errors.join('；');for(const id of ['iops','throughput','bottleneck','utilization','disk-value','network-value','depth'])$('#'+id).textContent='—';$('#disk-bar').style.width='0%';$('#network-bar').style.width='0%';$('#notes').replaceChildren();return;}
    $('#result-title').textContent=r.bottleneck+'先到上界';$('#result-note').textContent=`${r.count} 块成员盘 · RAID ${r.level} · ${r.mode==='random'?'随机 I/O':'顺序 I/O'} · 读 ${plan.readPct}% / 写 ${100-Number(plan.readPct)}%`;
    $('#iops').textContent=format(r.ceilingIops);$('#throughput').textContent=format(r.ceilingMBs,1)+' MB/s';$('#bottleneck').textContent=r.bottleneck;$('#utilization').textContent=format(r.utilization*100,1)+'%';$('#disk-value').textContent=format(r.diskMBs,1)+' MB/s';$('#network-value').textContent=format(r.networkMBs,1)+' MB/s';$('#depth').textContent=format(r.requiredDepth,1);
    const max=Math.max(r.diskMBs,r.networkMBs);$('#disk-bar').style.width=(r.diskMBs/max*100)+'%';$('#network-bar').style.width=(r.networkMBs/max*100)+'%';$('#notes').replaceChildren(...r.notes.map(t=>el('li',t)));
  }
  for(const key of keys){const node=$('#'+key);node.addEventListener(key==='preset'||key==='level'||key==='mode'?'change':'input',()=>{plan[key]=node.value;if(key==='preset'&&M.PRESETS[plan.preset])for(const field of ['readIops','writeIops','readMBs','writeMBs']){plan[field]=M.PRESETS[plan.preset][field];$('#'+field).value=plan[field];}else if(['readIops','writeIops','readMBs','writeMBs'].includes(key)){$('#preset').value='custom';plan.preset='custom';}render();save();});}
  $('#export').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(plan,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a','');a.href=url;a.download='%e5%ad%98%e5%82%a8%e6%80%a7%e8%83%bd%e6%96%b9%e6%a1%88%e5%a4%87%e4%bb%bd.json.html';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  $('#import').addEventListener('change',async event=>{const file=event.target.files&&event.target.files[0];event.target.value='';if(!file)return;try{if(file.size>100000)throw Error('文件超过 100 KB。');const data=JSON.parse(await file.text());if(data.schema!==1||!keys.every(k=>Object.hasOwn(data,k)))throw Error('不是受支持的方案备份。');if(!['hdd','sata','nvme','custom'].includes(data.preset)||!['0','1','5','6','10'].includes(String(data.level))||!['random','sequential'].includes(data.mode))throw Error('备份包含无效选项。');plan=data;setFields();save();$('#save-status').textContent='备份已恢复到当前浏览器。';}catch(err){$('#save-status').textContent='恢复失败：'+err.message;}});
  $('#reset').addEventListener('click',()=>{if(!confirm('恢复演示方案？请先导出需要保留的配置。'))return;plan=initial();setFields();save();});
  setFields();
  window.ScenarioCompare.mount({
    id: 'storage-performance', after: '.toolbar',
    get: () => plan,
    validate: value => {
      if (!value || value.schema !== 1 || !keys.every(k => Object.hasOwn(value, k)) || !['hdd','sata','nvme','custom'].includes(value.preset) || !['0','1','5','6','10'].includes(String(value.level)) || !['random','sequential'].includes(value.mode)) throw Error('方案格式不受支持');
      if (!M.calculate(value).valid) throw Error('方案参数不满足模型约束');
      return value;
    },
    apply: value => { plan = value; setFields(); save(); },
    metrics: value => {
      const r = M.calculate(value);
      return [
        {label:'成员盘', value:Number(value.count), unit:'块', display:`${value.count} 块`},
        {label:'规划上界 IOPS', value:r.ceilingIops, unit:'IOPS', display:`${format(r.ceilingIops)} IOPS`},
        {label:'规划上界吞吐', value:r.ceilingMBs, unit:'MB/s', display:`${format(r.ceilingMBs,1)} MB/s`},
        {label:'目标负载 / 上界', value:r.utilization*100, unit:'%', display:`${format(r.utilization*100,1)}%`},
        {label:'首先触及', display:r.bottleneck},
      ];
    },
    assumptions: value => `RAID ${value.level}，${value.mode==='random'?'随机 I/O':'顺序 I/O'}，读 ${value.readPct}%，块大小 ${value.ioKiB} KiB，网络 ${value.networkGbps} Gbps；单盘速度为${value.preset==='custom'?'自填值':'可修改的演示值'}。`,
    formatDelta: (delta, suffix) => `${format(delta, suffix==='%'?1:0)} ${suffix}`,
    caution: '这里只比较理想化性能上界，不预测真实时延或采购价格。容量、冗余另请结合 RAID 容量沙盘核对。'
  });
})();
