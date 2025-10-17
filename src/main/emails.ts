// Лёгкая и безопасная обёртка для IMAP/SMTP без жёстких типов.
// Работает даже если TS не видит тайпинги у модулей (dynamic require).
import { BrowserWindow, ipcMain } from 'electron';
import type { EmailConfig } from '../common/types';
import { IPC_CHANNELS } from './ipc';

type ClientState = {
  client: any;
  lock?: any;
  unread: number;
  folder: string;
  smtpTransport?: any | null;
};

const emailClients = new Map<string, ClientState>();

function emitUnread(instanceId: string, unread: number) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC_CHANNELS.EMAIL_UNREAD, { instanceId, unread });
  }
}

function calcUnreadFromStatus(status: any): number {
  const n = Number(status?.unseen || 0);
  return Number.isFinite(n) ? n : 0;
}

async function ensureConnected(instanceId: string, cfg: EmailConfig): Promise<ClientState> {
  let state = emailClients.get(instanceId);
  if (state?.client?.connected) return state;

  // Подгружаем модули «лениво», чтобы не падать на этапе компиляции
  let ImapFlow: any;
  let nodemailer: any;
  try {
    ImapFlow = require('imapflow').ImapFlow;
    nodemailer = require('nodemailer');
  } catch (e) {
    throw new Error('modules-missing: please run "npm i imapflow nodemailer"');
  }

  // Закрываем предыдущее подключение
  if (state?.client) {
    try { await state.client.logout(); } catch {}
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
  let unread = calcUnreadFromStatus(status);

  let smtpTransport: any = null;
  if (cfg.smtp?.host && cfg.smtp?.port) {
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

  state = { client, lock, unread, folder, smtpTransport };
  emailClients.set(instanceId, state);

  // IDLE цикл для обновлений
  (async () => {
    try {
      for await (const msg of client.idle({ timeout: 60_000 })) {
        if (msg?.mailbox === folder) {
          try {
            const st = await client.status(folder, { unseen: true });
            const n = calcUnreadFromStatus(st);
            if (n !== state!.unread) {
              state!.unread = n;
              emitUnread(instanceId, n);
            }
          } catch {}
        }
      }
    } catch {
      // Игнорируем разрывы (переподключение по запросу)
    }
  })();

  emitUnread(instanceId, unread);
  return state;
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
    const st = emailClients.get(instanceId);
    if (!st) return { ok: true };
    try { await st.lock?.release(); } catch {}
    try { await st.client.logout(); } catch {}
    emailClients.delete(instanceId);
    return { ok: true };
  });

  ipcMain.handle(IPC_CHANNELS.EMAIL_LIST, async (_e, instanceId: string, limit: number = 30) => {
    const st = emailClients.get(instanceId);
    if (!st) return [];
    const { client, folder } = st;
    await client.mailboxOpen(folder);
    const mailbox = client.mailbox; // { exists }
    const seq = `${Math.max(1, mailbox.exists - limit + 1)}:*`;
    const out: any[] = [];
    for await (const msg of client.fetch(seq, { envelope: true, flags: true, uid: true, internalDate: true })) {
      out.push({
        uid: msg.uid,
        subject: msg.envelope?.subject || '(no subject)',
        from: (msg.envelope?.from?.[0]?.name || msg.envelope?.from?.[0]?.address || '') || '',
        date: msg.internalDate?.toISOString?.() || new Date().toISOString(),
        unread: !(msg.flags?.has('\\Seen')),
      });
    }
    return out.reverse();
  });

  ipcMain.handle(IPC_CHANNELS.EMAIL_FETCH, async (_e, instanceId: string, uid: number) => {
    const st = emailClients.get(instanceId);
    if (!st) return { text: '(disconnected)' };
    const { client, folder } = st;
    await client.mailboxOpen(folder);
    // Берём text/plain «как есть» без тяжёлого парсера
    let text = '';
    for await (const msg of client.fetch({ uid }, { source: true, uid: true })) {
      const raw = msg.source?.toString?.() || '';
      const m = raw.match(/Content-Type:\s*text\/plain[\s\S]*?\r?\n\r?\n([\s\S]*?)\r?\n--/i);
      text = (m?.[1] || '').trim() || '(no text/plain part)';
      break;
    }
    return { text };
  });

  ipcMain.handle(IPC_CHANNELS.EMAIL_COMPOSE, async (_e, instanceId: string, data: { to: string; subject?: string; text?: string }) => {
    const st = emailClients.get(instanceId);
    if (!st) return { ok: false, error: 'not-connected' };
    if (!st.smtpTransport) return { ok: false, error: 'smtp-not-configured' };
    const from = st.client.auth?.user || 'me';
    await st.smtpTransport.sendMail({
      from,
      to: data.to,
      subject: data.subject || '',
      text: data.text || '',
    });
    return { ok: true };
  });
}