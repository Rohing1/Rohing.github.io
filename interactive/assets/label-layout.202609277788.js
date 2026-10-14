'use strict';
(()=>{const dialog=document.querySelector('#asset-label-dialog'),actions=document.createElement('div');actions.className='asset-label-actions';for(const b of [...dialog.children].filter(e=>e.tagName==='BUTTON'))actions.append(b);dialog.append(actions)})();
