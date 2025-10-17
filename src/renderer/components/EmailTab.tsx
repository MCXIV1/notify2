import React, { useEffect, useState } from 'react';
import type { EmailConfig, SavedServiceInstance } from '../../common/types';

declare global {
  interface Window {
    multi: {
      getConfig(): Promise<any>;
      saveConfig(cfg: any): Promise<boolean>;
      emailConnect(id: string, cfg: EmailConfig): Promise<{ ok: boolean; unread?: number; error?: string }>;
      emailDisconnect(id: string): Promise<{ ok: boolean }>;
      emailOnUnread(cb: (p: { instanceId: string; unread: number }) => void): void;
      emailList(id: string, limit?: number): Promise<Array<{ uid: number; subject: string; from: string; date: string; unread: boolean }>>;
      emailFetch(id: string, uid: number): Promise<{ text: string }>;
      emailCompose(id: string, data: { to: string; subject?: string; text?: string }): Promise<{ ok: boolean; error?: string }>;
    };
  }
}

type Props = {
  instance: SavedServiceInstance;
  onUnreadChange: (n: number) => void;
};

export const EmailTab: React.FC<Props> = ({ instance, onUnreadChange }) => {
  const [cfg, setCfg] = useState<EmailConfig>(instance.email || {
    imap: { host: '', port: 993, secure: true, user: '', pass: '' },
    smtp: { host: '', port: 465, secure: true },
    folder: 'INBOX'
  });
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [unread, setUnread] = useState(0);
  const [rows, setRows] = useState<Array<{ uid: number; subject: string; from: string; date: string; unread: boolean }>>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [body, setBody] = useState<string>('');
  const [depsMissing, setDepsMissing] = useState<string | null>(null);

  useEffect(() => {
    const off = window.multi.emailOnUnread(({ instanceId, unread }) => {
      if (instanceId !== instance.instanceId) return;
      setUnread(unread);
      onUnreadChange(unread);
      refresh();
    });
    // @ts-ignore
    return () => { window.multi.emailDisconnect(instance.instanceId); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance.instanceId]);

  async function saveCfg() {
    const appCfg = await window.multi.getConfig();
    const idx = appCfg.services.findIndex((s: any) => s.instanceId === instance.instanceId);
    if (idx >= 0) {
      appCfg.services[idx].email = cfg;
      await window.multi.saveConfig(appCfg);
    }
  }

  async function connect() {
    setConnecting(true);
    setDepsMissing(null);
    await saveCfg();
    const res = await window.multi.emailConnect(instance.instanceId, cfg);
    setConnecting(false);
    if (!res.ok) {
      if (String(res.error || '').includes('modules-missing')) {
        setDepsMissing('Не установлены зависимости. Выполните: npm i imapflow mailparser nodemailer');
      } else {
        alert('Connect error: ' + (res.error || 'unknown'));
      }
      return;
    }
    setConnected(true);
    setUnread(res.unread || 0);
    onUnreadChange(res.unread || 0);
    await refresh();
  }

  async function refresh() {
    const list = await window.multi.emailList(instance.instanceId, 40);
    setRows(list);
    if (selected != null && !list.find(m => m.uid === selected)) {
      setSelected(null); setBody('');
    }
  }

  async function open(uid: number) {
    setSelected(uid);
    const res = await window.multi.emailFetch(instance.instanceId, uid);
    setBody(res.text || '');
  }

  async function compose() {
    const to = prompt('To:'); if (!to) return;
    const subject = prompt('Subject:') || '';
    const text = prompt('Message (plain text):') || '';
    const res = await window.multi.emailCompose(instance.instanceId, { to, subject, text });
    if (!res.ok) alert('Send failed: ' + (res.error || 'unknown (возможно, не настроен SMTP или не установлен nodemailer)'));
  }

  return (
    <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 6, borderBottom: '1px solid #eee', display: 'flex', gap: 8, alignItems: 'center' }}>
        <strong style={{ flex: 1 }}>{instance.name}</strong>
        <span style={{ background: '#ff3b30', color: '#fff', padding: '2px 8px', borderRadius: 9999, fontWeight: 700 }}>{unread}</span>
        <button onClick={refresh} disabled={!connected || connecting}>Refresh</button>
        <button onClick={compose} disabled={!connected}>Compose</button>
      </div>

      {!connected && (
        <div style={{ padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <h4>IMAP</h4>
            <input placeholder="host" value={cfg.imap.host} onChange={e => setCfg({ ...cfg, imap: { ...cfg.imap, host: e.target.value } })} />
            <input placeholder="port" type="number" value={cfg.imap.port} onChange={e => setCfg({ ...cfg, imap: { ...cfg.imap, port: parseInt(e.target.value, 10) || 0 } })} />
            <label><input type="checkbox" checked={cfg.imap.secure} onChange={e => setCfg({ ...cfg, imap: { ...cfg.imap, secure: e.target.checked } })} /> SSL</label>
            <input placeholder="user" value={cfg.imap.user} onChange={e => setCfg({ ...cfg, imap: { ...cfg.imap, user: e.target.value } })} />
            <input placeholder="pass" type="password" value={cfg.imap.pass} onChange={e => setCfg({ ...cfg, imap: { ...cfg.imap, pass: e.target.value } })} />
            <input placeholder="folder (INBOX)" value={cfg.folder || 'INBOX'} onChange={e => setCfg({ ...cfg, folder: e.target.value })} />
          </div>
          <div>
            <h4>SMTP (опционально)</h4>
            <input placeholder="host" value={cfg.smtp?.host || ''} onChange={e => setCfg({ ...cfg, smtp: { ...(cfg.smtp || { host: '', port: 465, secure: true }), host: e.target.value } })} />
            <input placeholder="port" type="number" value={cfg.smtp?.port || 465} onChange={e => setCfg({ ...cfg, smtp: { ...(cfg.smtp || { host: '', port: 465, secure: true }), port: parseInt(e.target.value, 10) || 0 } })} />
            <label><input type="checkbox" checked={cfg.smtp?.secure ?? true} onChange={e => setCfg({ ...cfg, smtp: { ...(cfg.smtp || { host: '', port: 465, secure: true }), secure: e.target.checked } })} /> SSL</label>
            <input placeholder="user (optional)" value={cfg.smtp?.user || ''} onChange={e => setCfg({ ...cfg, smtp: { ...(cfg.smtp || { host: '', port: 465, secure: true }), user: e.target.value } })} />
            <input placeholder="pass (optional)" type="password" value={cfg.smtp?.pass || ''} onChange={e => setCfg({ ...cfg, smtp: { ...(cfg.smtp || { host: '', port: 465, secure: true }), pass: e.target.value } })} />
          </div>
          <div style={{ gridColumn: '1 / span 2', display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={connect} disabled={connecting}>Connect</button>
            {depsMissing ? <span style={{ color: '#b00' }}>{depsMissing}</span> : null}
          </div>
        </div>
      )}

      {connected && (
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <div style={{ width: 420, borderRight: '1px solid #eee', overflow: 'auto' }}>
            {rows.map(m => (
              <div key={m.uid} onClick={() => open(m.uid)} style={{
                padding: 10, cursor: 'pointer',
                background: m.uid === selected ? '#eef5ff' : 'transparent',
                borderBottom: '1px solid #f0f0f0'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <strong style={{ color: m.unread ? '#000' : '#666' }}>{m.subject}</strong>
                  <span style={{ fontSize: 12, color: '#888' }}>{new Date(m.date).toLocaleString()}</span>
                </div>
                <div style={{ color: '#555' }}>{m.from}</div>
                {m.unread ? <span style={{ background: '#ff3b30', color: '#fff', borderRadius: 9999, padding: '0 6px', fontSize: 11 }}>unread</span> : null}
              </div>
            ))}
          </div>
          <div style={{ flex: 1, padding: 12, overflow: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
            {selected ? body : <em>Select a message</em>}
          </div>
        </div>
      )}
    </div>
  );
};