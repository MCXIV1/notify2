// Лёгкая встроенная почта (IMAP/SMTP). Без тайпингов, с безопасным dynamic require.
// Если пакеты не установлены — возвращаем понятную ошибку, приложение не падает.
import { BrowserWindow, ipcMain } from 'electron';
import type { EmailConfig } from '../common/types';
import { IPC_CHANNELS } from './ipc';

type ClientState = {
  client: any;
  lock?: any;
  folder: string;
  unread: number;
  smtpTransport?: any | null;
};

const clients = new Map<string, ClientState>(); // key = instanceId

function emitUnread(instanceId: string, unread: number) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC_CHANNELS.EMAIL_UNREAD, { instanceId, unread });
  }
}

function requireDeps() {
  try {
    const { ImapFlow } = require('imapflow');
    const { simpleParser } = require('mailparser');
    let nodemailer: any = null;
    try { nodemailer = require('nodemailer'); } catch {}
    return { ImapFlow, simpleParser, nodemailer };
  } catch (e) {
    const err = new Error('modules-missing: install with "npm i imapflow mailparser nodemailer"');
    // @ts-ignore
    err.code = 'MODULES_MISSING';
    throw err;
  }
}

function unseenOf(status: any) {
  const n = Number(status?.unseen || 0);
  return Number.isFinite(n) ? n : 0;
}

async function ensureConnected(instanceId: string, cfg: EmailConfig) {
  const { ImapFlow, nodemailer } = requireDeps();

  let st = clients.get(instanceId);
  if (st?.client?.connected) return st;

  if (st?.client) {
    try { await st.client.logout(); } catch {}
  }

  const client = new ImapFlow({
    host: cfg.imap.host,
    port: cfg.imap.port,
    secure: cfg.imap.secure,
    auth: { user: cfg.imap.user, pass: cfg.imap.pass },
    logger: false,
  });
  await client.connect();

  const folder = cfg.folder || 'INBOX';
  const lock = await client.getMailboxLock(folder);
  const status = await client.status(folder, { unseen: true });
  const unread = unseenOf(status);

  let smtpTransport: any = null;
  if (cfg.smtp?.host && cfg.smtp?.port && nodemailer) {
    smtpTransport = nodemailer.createTransport({
      host: cfg.smtp.host,
      port: cfg.smtp.port,
      secure: !!cfg.smtp.secure,
      auth: (cfg.smtp.user || cfg.smtp.pass) ? {
        user: cfg.smtp.user || cfg.imap.user,
        pass: cfg.smtp.pass || cfg.imap.pass,
      } : undefined,
    });
  }

  st = { client, lock, folder, unread, smtpTransport };
  clients.set(instanceId, st);

  // IDLE обновления
  (async () => {
    try {
      for await (const msg of client.idle({ timeout: 60_000 })) {
        if (msg?.mailbox === folder) {
          try {
            const st2 = await client.status(folder, { unseen: true });
            const n = unseenOf(st2);
            if (n !== st!.unread) {
              st!.unread = n;
              emitUnread(instanceId, n);
            }
          } catch {}
        }
      }
    } catch {
      // ignore idle breaks
    }
  })();

  emitUnread(instanceId, unread);
  return st;
}

export function registerEmailIpc() {
  ipcMain.handle(IPC_CHANNELS.EMAIL_CONNECT, async (_e, instanceId: string, cfg: EmailConfig) => {
    try {
      const st = await ensureConnected(instanceId, cfg);
      return { ok: true, unread: st.unread };
    } catch (err: any) {
      return { ok: false, error: String(err?.message || err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.EMAIL_DISCONNECT, async (_e, instanceId: string) => {
    const st = clients.get(instanceId);
    if (!st) return { ok: true };
    try { await st.lock?.release(); } catch {}
    try { await st.client.logout(); } catch {}
    clients.delete(instanceId);
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.EMAIL_LIST, async (_e, instanceId: string, limit: number = 30) => {
    const st = clients.get(instanceId);
    if (!st) return [];
    const { client, folder } = st;
    await client.mailboxOpen(folder);
    const { exists } = client.mailbox;
    const seq = `${Math.max(1, exists - limit + 1)}:*`;
    const rows: any[] = [];
    for await (const msg of client.fetch(seq, { envelope: true, flags: true, uid: true, internalDate: true })) {
      rows.push({
        uid: msg.uid,
        subject: msg.envelope?.subject || '(no subject)',
        from: (msg.envelope?.from?.[0]?.name || msg.envelope?.from?.[0]?.address || '') || '',
        date: msg.internalDate?.toISOString?.() || new Date().toISOString(),
        unread: !(msg.flags?.has('\\Seen')),
      });
    }
    return rows.reverse();
  });

  ipcMain.handle(IPC_CHANNELS.EMAIL_FETCH, async (_e, instanceId: string, uid: number) => {
    const st = clients.get(instanceId);
    if (!st) return { text: '(disconnected)' };
    const { client, folder } = st;
    const { simpleParser } = requireDeps();
    await client.mailboxOpen(folder);
    let text = '';
    for await (const msg of client.fetch({ uid }, { source: true, uid: true })) {
      try {
        const parsed = await simpleParser(msg.source);
        text = parsed.text || parsed.html || '(no content)';
      } catch {
        text = '(failed to parse message)';
      }
      break;
    }
    return { text };
  });

  ipcMain.handle(IPC_CHANNELS.EMAIL_COMPOSE, async (_e, instanceId: string, data: { to: string; subject?: string; text?: string }) => {
    const st = clients.get(instanceId);
    if (!st) return { ok: false, error: 'not-connected' };
    if (!st.smtpTransport) return { ok: false, error: 'smtp-not-configured' };
    const from = st.client.auth?.user || 'me';
    await st.smtpTransport.sendMail({ from, to: data.to, subject: data.subject || '', text: data.text || '' });
    return { ok: true };
  });
}