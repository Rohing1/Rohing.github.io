'use strict';
(()=>{const pan=document.querySelector('#panorama'),actions=pan.querySelector('.pan-actions'),key='yj-rack-density-v1';let density='compact';try{density=localStorage.getItem(key)==='standard'?'standard':'compact'}catch{}
const group=document.createElement('div');group.className='pan-density';group.setAttribute('role','group');group.setAttribute('aria-label','机房全景卡片密度');
for(const [value,label] of [['compact','紧凑'],['standard','标准']]){const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.density=value;b.onclick=()=>{density=value;apply();try{localStorage.setItem(key,value)}catch{}};group.append(b)}actions.prepend(group);
function apply(){pan.classList.toggle('pan-compact',density==='compact');for(const b of group.children)b.setAttribute('aria-pressed',String(b.dataset.density===density))}
const help=document.createElement('details'),summary=document.createElement('summary');help.className='pan-help';summary.textContent='容量与灯效说明';help.append(summary,pan.querySelector('.pan-header p'),document.querySelector('#pan-effects'));const filter=pan.querySelector('.pan-filter');filter.append(document.querySelector('#pan-caption'));filter.after(help);apply();
})();
