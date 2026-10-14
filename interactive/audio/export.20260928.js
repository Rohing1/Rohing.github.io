'use strict';
(()=>{
 let task=null;
 const $=s=>document.querySelector(s);
 function cancel(){if(task){task.worker.terminate();task.reject(new Error('已取消生成，原素材保留'));task=null}}
 window.LocalAudioExport={cancel,async encode(buffer,format,bitrate,onProgress){
  if(!['mp3','m4a'].includes(format))throw Error('不支持的输出格式');
  return new Promise((resolve,reject)=>{
   const worker=new Worker('encode-worker.20260928.js');task={worker,reject};
   const finish=(value,error)=>{worker.terminate();task=null;error?reject(error):resolve(value)};
   worker.onmessage=({data})=>{if(data.error)finish(null,Error(data.error));else if(data.buffer)finish(new Blob([data.buffer],{type:data.mime}));else onProgress(data.progress)};
   worker.onerror=()=>finish(null,Error('编码组件未能加载，请刷新或改用 WAV'));
   const planes=Array.from({length:buffer.numberOfChannels},(_,ch)=>buffer.getChannelData(ch).slice());
   worker.postMessage({format,bitrate,rate:buffer.sampleRate,planes},planes.map(p=>p.buffer));
  });
 }};
 function hint(){const format=$('#format').value;$('#bitrate').disabled=format==='wav';$('#download').textContent='下载 '+format.toUpperCase();$('#format-hint').textContent=format==='wav'?'WAV：44.1 kHz、16-bit，无损 PCM，文件较大。':format==='mp3'?'MP3：兼容性较好、有损压缩；编码组件仅在生成时加载。':'M4A：AAC 音频／MP4 容器，不含视频；依赖浏览器本地 AAC 编码支持。'}
 $('#format').addEventListener('change',hint);hint();
 (async()=>{const option=$('#format option[value=m4a]');let supported=false;try{supported=!!window.AudioEncoder&&(await AudioEncoder.isConfigSupported({codec:'mp4a.40.2',sampleRate:44100,numberOfChannels:2,bitrate:192000})).supported}catch{}if(!supported){option.disabled=true;option.textContent='M4A（当前浏览器不支持）'}})();
 window.addEventListener('pagehide',cancel);
})();
