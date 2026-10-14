'use strict';
(()=>{
 const $=s=>document.querySelector(s),v=$('#preview'),stage=$('#preview-stage'),dialog=$('#preview-dialog'),anchor=document.createComment('preview-home');stage.before(anchor);
 const time=n=>{n=Math.max(0,Number.isFinite(n)?n:0);return String(Math.floor(n/60)).padStart(2,'0')+':'+String(Math.floor(n)%60).padStart(2,'0')};
 const duration=()=>Number.isFinite(v.duration)?v.duration:Number(v.dataset.recordedDuration)||0;
 function update(){const ready=!!v.getAttribute('src')&&!v.srcObject&&!v.hidden&&!v.error;$('#playback').hidden=!ready;$('#preview-enlarge').disabled=$('#preview-fullscreen').disabled=!ready;$('#preview-play').textContent=v.paused?'播放':'暂停';$('#preview-mute').textContent=v.muted?'取消静音':'静音';const total=duration();$('#preview-seek').max=String(total||1);$('#preview-seek').value=String(Math.min(total,v.currentTime||0));$('#preview-time').textContent=time(v.currentTime)+' / '+time(total);v.controls=false}
 for(const event of ['loadedmetadata','durationchange','timeupdate','play','pause','ended','volumechange','recordingready','emptied','error'])v.addEventListener(event,update);
 new MutationObserver(update).observe(v,{attributes:true,attributeFilter:['src','hidden']});
 $('#preview-play').onclick=()=>{if(v.paused)v.play().catch(()=>$('#status').textContent='播放失败，请下载后用本地播放器查看');else v.pause()};
 $('#preview-seek').oninput=()=>{try{v.currentTime=Number($('#preview-seek').value)}catch{}};
 $('#preview-mute').onclick=()=>{v.muted=!v.muted};
 function restore(){if(!dialog.contains(stage))return;anchor.after(stage);$('#preview-close').hidden=true;$('#preview-enlarge').focus();update()}
 function enlarge(){if($('#preview-enlarge').disabled)return;if(!dialog.open){dialog.append(stage);$('#preview-close').hidden=false;dialog.showModal();$('#preview-close').focus()}}
 $('#preview-enlarge').onclick=enlarge;
 $('#preview-close').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});if(dialog.open)dialog.close();else restore()};
 dialog.addEventListener('close',restore);dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});
 $('#preview-fullscreen').onclick=async()=>{if(!stage.requestFullscreen){enlarge();return}try{await stage.requestFullscreen();$('#preview-close').hidden=false}catch{enlarge()}};
 document.addEventListener('fullscreenchange',()=>{$('#preview-close').hidden=!document.fullscreenElement&&!dialog.open});
 document.addEventListener('keydown',e=>{if(e.key===' '&&(dialog.open||document.fullscreenElement===stage)&&!['INPUT','BUTTON','SELECT'].includes(e.target.tagName)){e.preventDefault();$('#preview-play').click()}});
 update();
})();
