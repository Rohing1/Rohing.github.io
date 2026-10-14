'use strict';
// Files and PCM never leave this worker. Dependencies are same-origin static assets.
self.onmessage=async({data})=>{
 let encoder;
 try{
  const {format,planes,rate,bitrate}=data,channels=planes.length,frames=planes[0].length;
  if(!['mp3','m4a'].includes(format)||![1,2].includes(channels)||rate!==44100||frames>rate*600+8||![128,192,256].includes(bitrate))throw Error('无效的编码参数');
  const progress=n=>self.postMessage({progress:Math.min(99,Math.round(n/frames*100))});
  let blob;
  if(format==='mp3'){
   importScripts('vendor/lame-1.2.1.min.js');
   const mp3=new lamejs.Mp3Encoder(channels,rate,bitrate),parts=[];
   for(let at=0;at<frames;at+=1152){
    const count=Math.min(1152,frames-at),pcm=planes.map(p=>{const v=new Int16Array(count);for(let i=0;i<count;i++){const x=Math.max(-1,Math.min(1,p[at+i]));v[i]=Math.round(x*(x<0?32768:32767))}return v});
    const chunk=mp3.encodeBuffer(pcm[0],pcm[1]);if(chunk.length)parts.push(new Uint8Array(chunk));
    if(at%115200===0)progress(at);
   }
   const tail=mp3.flush();if(tail.length)parts.push(new Uint8Array(tail));
   blob=new Blob(parts,{type:'audio/mpeg'});
  }else{
   if(!self.AudioEncoder||!self.AudioData)throw Error('当前浏览器不支持 M4A 编码，请选 MP3 或 WAV');
   const config={codec:'mp4a.40.2',sampleRate:rate,numberOfChannels:channels,bitrate:bitrate*1000};
   if(!(await AudioEncoder.isConfigSupported(config)).supported)throw Error('当前浏览器没有 AAC 编码器，请选 MP3 或 WAV');
   importScripts('vendor/mp4-muxer-5.2.2.js');
   const mux=new Mp4Muxer.Muxer({target:new Mp4Muxer.ArrayBufferTarget(),audio:{codec:'aac',sampleRate:rate,numberOfChannels:channels},fastStart:'in-memory',firstTimestampBehavior:'offset'});
   let failure=null;
   encoder=new AudioEncoder({output:(chunk,meta)=>{try{mux.addAudioChunk(chunk,meta)}catch(e){failure=e}},error:e=>{failure=e}});
   encoder.configure(config);
   for(let at=0;at<frames;at+=1024){
    const count=Math.min(1024,frames-at),pcm=new Float32Array(count*channels);
    planes.forEach((p,ch)=>pcm.set(p.subarray(at,at+count),ch*count));
    const packet=new AudioData({format:'f32-planar',sampleRate:rate,numberOfFrames:count,numberOfChannels:channels,timestamp:Math.round(at/rate*1e6),data:pcm});
    try{encoder.encode(packet)}finally{packet.close()}
    if(encoder.encodeQueueSize>32)await new Promise(resolve=>{const wait=()=>{if(failure||encoder.encodeQueueSize<16)resolve();else setTimeout(wait,5)};wait()});
    if(failure)throw failure;
    if((at/1024)%64===0)progress(at);
   }
   await encoder.flush();if(failure)throw failure;
   encoder.close();encoder=null;mux.finalize();blob=new Blob([mux.target.buffer],{type:'audio/mp4'});
  }
  const buffer=await blob.arrayBuffer();self.postMessage({buffer,mime:blob.type},[buffer]);
 }catch(e){if(encoder&&encoder.state!=='closed')encoder.close();self.postMessage({error:e.message||'本地编码失败，请改用 WAV'})}
};
