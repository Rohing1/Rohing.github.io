'use strict';
window.UI={
 $(s,root=document){return root.querySelector(s)},
 el(tag,attrs={},text){const e=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k==='class')e.className=v;else e.setAttribute(k,v)}if(text!=null)e.textContent=text;return e},
 download(name,content,type='application/json'){const blob=content instanceof Blob?content:new Blob([content],{type});const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),2000)},
 toast(text){document.querySelector('.toast')?.remove();const t=this.el('div',{class:'toast',role:'status'},text);document.body.append(t);setTimeout(()=>t.remove(),3500)},
 random(max){if(!Number.isInteger(max)||max<1)throw Error('随机范围不正确');const limit=4294967296-4294967296%max;const a=new Uint32Array(1);do{crypto.getRandomValues(a)}while(a[0]>=limit);return a[0]%max},
 shuffle(items){const a=items.slice();for(let i=a.length-1;i>0;i--){const j=this.random(i+1);[a[i],a[j]]=[a[j],a[i]]}return a},
 async fullscreen(element=document.documentElement){try{if(document.fullscreenElement)await document.exitFullscreen();else await element.requestFullscreen()}catch{this.toast('浏览器暂不支持全屏，可使用浏览器全屏模式')}},
 size(file,limit=3*1024*1024){if(!file)throw Error('请选择文件');if(file.size>limit)throw Error('文件过大，请选择 '+Math.round(limit/1024/1024)+' MB 以内的文件')}
};
