import { contextBridge, ipcRenderer } from 'electron';

// Лог о старте прелоада
window.addEventListener('DOMContentLoaded', () => {
  try { ipcRenderer.sendToHost('mm-ready'); } catch {}
});

let currentUnread = 0;
function sendUnread() {
  try { ipcRenderer.sendToHost('mm-unread', currentUnread); } catch {}
}

contextBridge.exposeInMainWorld('rambox', {
  setUnreadCount: (count: number) => {
    currentUnread = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    sendUnread();
  },
  clearUnreadCount: () => {
    currentUnread = 0;
    sendUnread();
  }
});

// Безопасный fallback по заголовку: наблюдаем только если есть <title>, иначе периодический опрос
(function setupTitleWatcher() {
  const titleEl = document.querySelector('title');
  const parse = () => {
    const m = document.title.match(/\((\d+)\)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n)) (window as any).rambox?.setUnreadCount(n);
    }
  };

  if (titleEl) {
    const mo = new MutationObserver(parse);
    mo.observe(titleEl, { childList: true, subtree: true, characterData: true });
  } else {
    // если <title> ещё не доступен — простой polling
    setInterval(parse, 2000);
  }
})();