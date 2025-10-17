"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication,AutofillAddressImport,AutofillProfileCleanupUpstream');
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const electron_updater_1 = require("electron-updater");
const ipc_1 = require("./ipc");
const email_lite_1 = require("./email-lite");
const isMac = process.platform === 'darwin';
const isDev = !!process.env.VITE_DEV_SERVER_URL;
if (process.platform === 'win32')
    electron_1.app.setAppUserModelId('com.mcxiv1.multimessenger');
let mainWindow = null;
let tray = null;
let unreadTotal = 0;
let lastUnreadTotal = 0;
const userDataDir = electron_1.app.getPath('userData');
const configPath = node_path_1.default.join(userDataDir, 'config.json');
function asset(...p) {
    const dev = node_path_1.default.join(process.cwd(), 'resources', ...p);
    const prod = node_path_1.default.join(process.resourcesPath, ...p);
    return node_fs_1.default.existsSync(prod) ? prod : dev;
}
function loadConfig() {
    try {
        return JSON.parse(node_fs_1.default.readFileSync(configPath, 'utf-8'));
    }
    catch {
        return { services: [], masterPasswordSet: false };
    }
}
function saveConfig(cfg) { node_fs_1.default.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf-8'); }
function makeRedBadgeOverlay(count) {
    const label = count > 99 ? '99+' : String(count);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.35"/></filter></defs>
  <circle cx="32" cy="32" r="30" fill="#ff3b30" filter="url(#s)"/>
  <text x="32" y="44" text-anchor="middle" font-family="Segoe UI, Roboto, Arial" font-size="36" font-weight="800" fill="#fff">${label}</text>
</svg>`;
    return electron_1.nativeImage.createFromDataURL('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
}
function setAppBadge(count) {
    if (isMac)
        electron_1.app.dock.setBadge(count > 0 ? String(count) : '');
    else if (process.platform === 'win32' && mainWindow) {
        if (count > 0)
            mainWindow.setOverlayIcon(makeRedBadgeOverlay(count), `${count} unread`);
        else
            mainWindow.setOverlayIcon(null, '');
    }
}
let bannerWin = null;
let hideBannerTimer = null;
function cmToCssPixels(cm) { return Math.round((cm / 2.54) * 96); }
function soundFile() {
    const candidates = [asset('sounds', 'new_message.mp3'), asset('sounds', 'new_message.wav')];
    for (const p of candidates)
        try {
            if (node_fs_1.default.existsSync(p))
                return p;
        }
        catch { }
    return null;
}
function showNewMessageBanner() {
    try {
        const { workArea } = electron_1.screen.getPrimaryDisplay();
        const s = soundFile();
        const audio = s ? `<audio autoplay src="file://${s.replace(/\\/g, '/')}"></audio>` : `<script>
      try{const c=new (window.AudioContext||window.webkitAudioContext)();const o=c.createOscillator();const g=c.createGain();
      o.type='sine';o.frequency.value=880;g.gain.value=0.06;o.connect(g);g.connect(c.destination);o.start();setTimeout(()=>{o.stop();c.close();},250);}catch(e){}</script>`;
        const html = `<!doctype html><html><head><meta charset="utf-8"/><style>
      body{margin:0;background:#111;color:#fff;font:800 28px/1.2 system-ui,Segoe UI,Roboto,Arial;display:flex;align-items:center;justify-content:center;height:100vh}
    </style></head><body>YOU RECEIVED NEW MESSAGE. CHECK FAST OR FINE.${audio}</body></html>`;
        if (!bannerWin) {
            bannerWin = new electron_1.BrowserWindow({
                width: workArea.width, height: cmToCssPixels(15),
                x: workArea.x, y: workArea.y,
                frame: false, transparent: false, resizable: false, movable: false,
                alwaysOnTop: true, skipTaskbar: true, focusable: false, show: false,
            });
            bannerWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
            bannerWin.setAlwaysOnTop(true, 'screen-saver');
            bannerWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
        }
        if (hideBannerTimer)
            clearTimeout(hideBannerTimer);
        bannerWin.showInactive();
        hideBannerTimer = setTimeout(() => bannerWin?.hide(), 5000);
    }
    catch {
        electron_1.shell.beep();
    }
}
async function createWindow() {
    const preloadPath = node_path_1.default.join(__dirname, 'preload.js');
    mainWindow = new electron_1.BrowserWindow({
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
    if (isDev && process.env.VITE_DEV_SERVER_URL)
        await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    else
        await mainWindow.loadFile(node_path_1.default.join(__dirname, '../renderer/index.html'));
    mainWindow.webContents.setWindowOpenHandler(({ url }) => { electron_1.shell.openExternal(url); return { action: 'deny' }; });
    setupTray();
    electron_updater_1.autoUpdater.checkForUpdatesAndNotify();
}
function setupTray() {
    const img = electron_1.nativeImage.createFromPath(asset('icons', process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png'));
    tray = new electron_1.Tray(img);
    tray.setContextMenu(electron_1.Menu.buildFromTemplate([{ label: 'Show', click: () => mainWindow?.show() }, { label: 'Quit', role: 'quit' }]));
    tray.setToolTip('MultiMessenger');
    tray.on('click', () => mainWindow?.show());
}
function registerIpc() {
    electron_1.ipcMain.on(ipc_1.IPC_CHANNELS.UNREAD_UPDATE, (_e, total) => {
        unreadTotal = total;
        if (unreadTotal > lastUnreadTotal && unreadTotal > 0)
            showNewMessageBanner();
        lastUnreadTotal = unreadTotal;
        setAppBadge(unreadTotal);
        if (tray)
            tray.setToolTip(`MultiMessenger${unreadTotal ? ` (${unreadTotal})` : ''}`);
    });
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.GET_CONFIG, () => loadConfig());
    electron_1.ipcMain.handle(ipc_1.IPC_CHANNELS.SAVE_CONFIG, (_e, cfg) => { saveConfig(cfg); return true; });
    // Встроенная почта
    (0, email_lite_1.registerEmailIpc)();
}
electron_1.app.whenReady().then(async () => {
    registerIpc();
    await createWindow();
    electron_1.app.on('activate', () => { if (electron_1.BrowserWindow.getAllWindows().length === 0)
        void createWindow(); });
});
electron_1.app.on('window-all-closed', () => { if (process.platform !== 'darwin')
    electron_1.app.quit(); });
