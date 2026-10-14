'use strict';

(function () {
  const FULLSCREEN_CLASS = 'yj-share-fullscreen-active';

  function isFullscreen() {
    return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function syncFullscreenState() {
    if (!document.body) return;
    document.body.classList.toggle(FULLSCREEN_CLASS, isFullscreen());
  }

  function shareUrl() {
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
      try {
        const url = new URL(canonical.href, location.href);
        if (url.origin === location.origin) return url.origin + url.pathname;
      } catch (_) {}
    }
    return location.origin + location.pathname;
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const input = document.createElement('textarea');
    input.value = text;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand('copy');
    input.remove();
    if (!copied) throw new Error('copy failed');
  }

  function setStatus(element, text) {
    element.textContent = text;
    window.clearTimeout(element._yjShareTimer);
    element._yjShareTimer = window.setTimeout(function () {
      element.textContent = '';
    }, 3200);
  }

  async function handleShare(status) {
    const url = shareUrl();
    const title = document.title.replace(/\s*[-|·].*$/, '').trim() || '在线工具';
    if (navigator.share) {
      try {
        await navigator.share({ title: title, text: title, url: url });
        setStatus(status, '已打开分享');
        return;
      } catch (error) {
        if (error && error.name === 'AbortError') return;
      }
    }
    try {
      await copyText(url);
      setStatus(status, '链接已复制');
    } catch (_) {
      setStatus(status, '请复制地址栏链接');
    }
  }

  function mountShare() {
    if (!document.body || document.querySelector('.yj-tool-share')) return;
    const section = document.createElement('section');
    const prompt = document.createElement('span');
    const button = document.createElement('button');
    const status = document.createElement('span');

    section.className = 'yj-tool-share';
    section.setAttribute('aria-label', '分享本工具');
    prompt.textContent = '觉得有用？';
    button.type = 'button';
    button.className = 'yj-tool-share__button';
    button.textContent = '分享本文';
    status.className = 'yj-tool-share__status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    button.addEventListener('click', function () { handleShare(status); });
    section.append(prompt, button, status);

    const footer = document.querySelector('main .footer, .shell > .footer, body > .footer');
    if (footer && footer.parentNode) footer.parentNode.insertBefore(section, footer);
    else (document.querySelector('main') || document.body).appendChild(section);
    syncFullscreenState();
  }

  document.addEventListener('fullscreenchange', syncFullscreenState);
  document.addEventListener('webkitfullscreenchange', syncFullscreenState);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountShare, { once: true });
  else mountShare();
})();
