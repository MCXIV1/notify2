import React, { useEffect, useRef } from 'react';
import type { SavedServiceInstance, ServiceRecipe } from '../../common/types';
import { EmailTab } from './EmailTab';

type Props = {
  instance: SavedServiceInstance;
  recipe?: ServiceRecipe;
  onClose: () => void;
  onUnreadChange: (n: number) => void;
};

// Универсальный поллинг: каждые 2.5 сек выполнить unreadEval в webview и вернуть число
const DEFAULT_EVAL = `(() => { const m = document.title.match(/\\((\\d+)\\)/); return m ? parseInt(m[1],10) : 0; })()`;

export const ServiceTab: React.FC<Props> = ({ instance, recipe, onClose, onUnreadChange }) => {
  if (!recipe) {
    return (
      <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 6, borderBottom: '1px solid #eee', display: 'flex', gap: 8, alignItems: 'center' }}>
          <strong style={{ flex: 1 }}>{instance.name}</strong>
          <button onClick={onClose}>Remove</button>
        </div>
        <div style={{ padding: 24 }}>
          <h3>Recipe not found</h3>
          <p>The recipe <code>{instance.recipeId}</code> is not available. Remove this service and add a supported one.</p>
          <button onClick={onClose}>Remove service</button>
        </div>
      </div>
    );
  }

  // Встроенная почта
  if (recipe.builtin === 'imap') {
    return <EmailTab instance={instance} onUnreadChange={onUnreadChange} />;
  }

  // Webview‑сервисы
  const ref = useRef<Electron.WebviewTag>(null);
  const initialized = useRef(false);
  const pollTimer = useRef<number | null>(null);
  const last = useRef<number>(-1);

  useEffect(() => {
    const webview = ref.current!;
    if (initialized.current) return;

    webview.setAttribute('partition', instance.partition);
    if (recipe.userAgent) webview.setAttribute('useragent', recipe.userAgent);

    async function pollOnce() {
      const code = recipe.unreadEval || DEFAULT_EVAL;
      try {
        const n: any = await webview.executeJavaScript(`(function(){ try { return (${code}); } catch(e){ return 0; } })()`);
        const val = Number(n);
        if (Number.isFinite(val) && val !== last.current) {
          last.current = val;
          onUnreadChange(val);
        }
      } catch {}
    }

    function onDomReady() {
      pollOnce();
      if (pollTimer.current == null) {
        // @ts-ignore
        pollTimer.current = window.setInterval(pollOnce, 2500);
      }
    }

    function onTitle(e: any) {
      const t = String(e?.title ?? '');
      const m = t.match(/\((\d+)\)/);
      if (m) {
        const v = parseInt(m[1], 10);
        if (!Number.isNaN(v) && v !== last.current) {
          last.current = v;
          onUnreadChange(v);
        }
      }
    }

    webview.addEventListener('dom-ready', onDomReady);
    webview.addEventListener('page-title-updated', onTitle as any);

    if (instance.url) webview.setAttribute('src', instance.url);

    initialized.current = true;
    return () => {
      webview.removeEventListener('dom-ready', onDomReady);
      webview.removeEventListener('page-title-updated', onTitle as any);
      if (pollTimer.current != null) { window.clearInterval(pollTimer.current); pollTimer.current = null; }
    };
  }, [instance.partition, instance.url, recipe, onUnreadChange]);

  return (
    <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 6, borderBottom: '1px solid #eee', display: 'flex', gap: 8, alignItems: 'center' }}>
        <strong style={{ flex: 1 }}>{instance.name}</strong>
        <button onClick={() => ref.current?.openDevTools()}>DevTools</button>
        <button onClick={onClose}>Close</button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <webview
          ref={ref as any}
          partition={instance.partition}
          allowpopups={String(!!recipe.allowPopups)}
          style={{ width: '100%', height: '100%' }}
          disableblinkfeatures="Auxclick"
          webpreferences="contextIsolation=yes, nodeIntegration=no"
        />
      </div>
    </div>
  );
};