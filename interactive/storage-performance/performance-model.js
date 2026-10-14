(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StoragePerformanceModel=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const PRESETS={hdd:{label:'机械硬盘 · 演示值',readIops:180,writeIops:180,readMBs:220,writeMBs:200},sata:{label:'SATA SSD · 演示值',readIops:60000,writeIops:40000,readMBs:520,writeMBs:480},nvme:{label:'NVMe SSD · 演示值',readIops:500000,writeIops:250000,readMBs:3000,writeMBs:2500}};
  const LEVELS={'0':{min:2,step:1,penalty:1},'1':{min:2,step:0,penalty:2},'5':{min:3,step:1,penalty:4},'6':{min:4,step:1,penalty:6},'10':{min:4,step:2,penalty:2}};
  function validLevel(level,count){const spec=LEVELS[level];return !!spec&&Number.isInteger(count)&&count>=spec.min&&count<=48&&(level!=='1'||count===2)&&(spec.step!==2||count%2===0);}
  function dataDrives(level,count){return level==='0'?count:level==='1'?1:level==='5'?count-1:level==='6'?count-2:count/2;}
  function num(value){return Number(value);}
  function calculate(p){const level=String(p.level),count=num(p.count),spec=LEVELS[level],errors=[];if(!validLevel(level,count))errors.push('RAID 级别与盘数不匹配：RAID 1 为两盘，RAID 10 为至少四盘且盘数为偶数。');
    const keys=['readIops','writeIops','readMBs','writeMBs','networkGbps','ioKiB','demandIops','latencyMs'];for(const key of keys)if(!Number.isFinite(num(p[key]))||num(p[key])<0)errors.push(`${key} 必须为有效非负数。`);
    if(num(p.readIops)===0||num(p.writeIops)===0||num(p.readMBs)===0||num(p.writeMBs)===0||num(p.ioKiB)===0||num(p.networkGbps)===0)errors.push('盘性能、I/O 块大小和网络速率必须大于零。');
    const readPct=num(p.readPct);if(!Number.isFinite(readPct)||readPct<0||readPct>100)errors.push('读取比例必须在 0–100% 之间。');
    if(errors.length)return {valid:false,errors};
    const readFraction=readPct/100,writeFraction=1-readFraction,networkMBs=num(p.networkGbps)*1000/8*0.9,ioMB=num(p.ioKiB)/1024;
    const randomRead=count*num(p.readIops),randomWrite=count*num(p.writeIops)/spec.penalty;
    const seqRead=count*num(p.readMBs),seqWrite=dataDrives(level,count)*num(p.writeMBs);
    const harmonic=(readCap,writeCap)=>1/(readFraction/readCap+writeFraction/writeCap);
    const mode=p.mode==='sequential'?'sequential':'random';
    const diskMBs=mode==='random'?harmonic(randomRead,randomWrite)*ioMB:harmonic(seqRead,seqWrite);
    const diskIops=diskMBs/ioMB;
    const ceilingMBs=Math.min(diskMBs,networkMBs),ceilingIops=ceilingMBs/ioMB;
    const bottleneck=diskMBs<=networkMBs?'磁盘侧':'网络侧';
    const demand=num(p.demandIops),utilization=demand/ceilingIops;
    const requiredDepth=demand*num(p.latencyMs)/1000;
    const notes=[];
    if(level==='5'||level==='6')notes.push('小块随机写入按传统 read-modify-write 惩罚近似：RAID 5 为 4、RAID 6 为 6；控制器缓存、全条带写入与 SSD 行为可能明显改变结果。');
    if(mode==='sequential')notes.push('顺序吞吐按数据盘数量作理想上界估算，未扣除控制器、文件系统、纠删码和同步写入开销。');
    if(utilization>1)notes.push('输入的业务需求超过当前估算上界。');else if(utilization>0.7)notes.push('业务需求超过估算上界的 70%，建议保留更多突发与故障余量。');
    notes.push('并发需求只是按 IOPS × 目标时延换算的在途 I/O 数，不是预测出来的实际延迟。');
    return {valid:true,level,count,dataDrives:dataDrives(level,count),penalty:spec.penalty,mode,randomRead,randomWrite,seqRead,seqWrite,diskMBs,diskIops,networkMBs,ceilingMBs,ceilingIops,bottleneck,demand,utilization,requiredDepth,notes,readFraction,writeFraction};
  }
  return {PRESETS,LEVELS,validLevel,dataDrives,calculate};
});
