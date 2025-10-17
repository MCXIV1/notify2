import { app, BrowserWindow, ipcMain, nativeImage, Tray, Menu, shell, screen } from 'electron';
app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication,AutofillAddressImport,AutofillProfileCleanupUpstream');

import path from 'node:path';
import fs from 'node:fs';
import { autoUpdater } from 'electron-updater';
import { IPC_CHANNELS } from './ipc';
import type { AppConfig } from '../common/types';
import { registerEmailIpc } from './email-lite';

const isMac = process.platform === 'darwin';
const isDev = !!process.env.VITE_DEV_SERVER_URL;
if (process.platform === 'win32') app.setAppUserModelId('com.mcxiv1.multimessenger');

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let unreadTotal = 0;
let lastUnreadTotal = 0;

const userDataDir = app.getPath('userData');
const configPath = path.join(userDataDir, 'config.json');

function asset(...p: string[]) {
  const dev = path.join(process.cwd(), 'resources', ...p);
  const prod = path.join(process.resourcesPath, ...p);
  return fs.existsSync(prod) ? prod : dev;
}

function loadConfig(): AppConfig {
  try { return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as AppConfig; }
  catch { return { services: [], masterPasswordSet: false }; }
}
function saveConfig(cfg: AppConfig) { fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf-8'); }

function makeRedBadgeOverlay(count: number) {
  const label = count > 99 ? '99+' : String(count);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.35"/></filter></defs>
  <circle cx="32" cy="32" r="30" fill="#ff3b30" filter="url(#s)"/>
  <text x="32" y="44" text-anchor="middle" font-family="Segoe UI, Roboto, Arial" font-size="36" font-weight="800" fill="#fff">${label}</text>
</svg>`;
  return nativeImage.createFromDataURL('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
}
function setAppBadge(count: number) {
  if (isMac) app.dock.setBadge(count > 0 ? String(count) : '');
  else if (process.platform === 'win32' && mainWindow) {
    if (count > 0) mainWindow.setOverlayIcon(makeRedBadgeOverlay(count), `${count} unread`);
    else mainWindow.setOverlayIcon(null, '');
  }
}

let bannerWin: BrowserWindow | null = null;
let hideBannerTimer: NodeJS.Timeout | null = null;
function cmToCssPixels(cm: number) { return Math.round((cm / 2.54) * 96); }
function soundFile() {
  const candidates = [asset('sounds', 'new_message.mp3'), asset('sounds', 'new_message.wav')];
  for (const p of candidates) try { if (fs.existsSync(p)) return p; } catch {}
  return null;
}
function showNewMessageBanner() {
  try {
    const { workArea } = screen.getPrimaryDisplay();
    const s = soundFile();
    const audio = s ? `<audio autoplay src="file://${s.replace(/\\/g,'/')}"></audio>` : `<script>
      try{const c=new (window.AudioContext||window.webkitAudioContext)();const o=c.createOscillator();const g=c.createGain();
      o.type='sine';o.frequency.value=880;g.gain.value=0.06;o.connect(g);g.connect(c.destination);o.start();setTimeout(()=>{o.stop();c.close();},250);}catch(e){}</script>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"/><style>
      body{margin:0;background:#111;color:#fff;font:800 28px/1.2 system-ui,Segoe UI,Roboto,Arial;display:flex;align-items:center;justify-content:center;height:100vh}
    </style></head><body>YOU RECEIVED NEW MESSAGE. CHECK FAST OR FINE.${audio}</body></html>`;

    if (!bannerWin) {
      bannerWin = new BrowserWindow({
        width: workArea.width, height: cmToCssPixels(15),
        x: workArea.x, y: workArea.y,
        frame: false, transparent: false, resizable: false, movable: false,
        alwaysOnTop: true, skipTaskbar: true, focusable: false, show: false,
      });
      bannerWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      bannerWin.setAlwaysOnTop(true, 'screen-saver');
      bannerWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    }
    if (hideBannerTimer) clearTimeout(hideBannerTimer);
    bannerWin.showInactive();
    hideBannerTimer = setTimeout(() => bannerWin?.hide(), 5000);
  } catch { shell.beep(); }
}

async function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
  mainWindow = new BrowserWindow({
    width: 1200, height: 800, title: 'MultiMessenger', show: false,
    icon: asset('icons', 'app.png'),
    webPreferences: {
      preload: preloadPath,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      spellcheck: true,
    }
  });
  mainWindow.on('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => (mainWindow = null));

  if (isDev && process.env.VITE_DEV_SERVER_URL) await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  else await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });

  setupTray();
  autoUpdater.checkForUpdatesAndNotify();
}

function setupTray() {
  const img = nativeImage.createFromPath(asset('icons', process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png'));
  tray = new Tray(img);
  tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Show', click: () => mainWindow?.show() }, { label: 'Quit', role: 'quit' }]));
  tray.setToolTip('MultiMessenger');
  tray.on('click', () => mainWindow?.show());
}

function registerIpc() {
  ipcMain.on(IPC_CHANNELS.UNREAD_UPDATE, (_e, total: number) => {
    unreadTotal = total;
    if (unreadTotal > lastUnreadTotal && unreadTotal > 0) showNewMessageBanner();
    lastUnreadTotal = unreadTotal;
    setAppBadge(unreadTotal);
    if (tray) tray.setToolTip(`MultiMessenger${unreadTotal ? ` (${unreadTotal})` : ''}`);
  });

  ipcMain.handle(IPC_CHANNELS.GET_CONFIG, () => loadConfig());
  ipcMain.handle(IPC_CHANNELS.SAVE_CONFIG, (_e, cfg: AppConfig) => { saveConfig(cfg); return true; });

  // Встроенная почта
  registerEmailIpc();
}

app.whenReady().then(async () => {
  registerIpc();
  await createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });