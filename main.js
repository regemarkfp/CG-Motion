// CG Motion - desktop shell (Electron main process). Windows, macOS and Linux.
const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const net = require('net');

let win = null;
let dirty = false;
let pending = null; // a project file to open (double-clicked in Explorer / Finder / the file manager)
const isMac = process.platform === 'darwin';

/* settings (recent projects, panel layout) stay in the same place whether CG Motion runs installed or from the folder */
app.setPath('userData', path.join(app.getPath('appData'), 'cg-motion'));

/* a .cgm / .loo / .html file passed on the command line, e.g. when it is double-clicked (Windows, Linux) */
function fileArg(argv) {
  const args = (argv || []).slice(app.isPackaged ? 1 : 2);
  return args.find((a) => /\.(cgm|loo|html?)$/i.test(a) && fs.existsSync(a)) || null;
}
function sendOpen(p) {
  if (!p) return;
  if (win && !win.webContents.isLoading()) win.webContents.send('openFile', p);
  else pending = p;
}
/* only one CG Motion: opening another project file hands it to the window that is already open */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (e, argv) => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
    sendOpen(fileArg(argv));
  });
}
pending = fileArg(process.argv);
/* macOS hands double-clicked files over with an event instead of the command line */
app.on('open-file', (e, p) => { e.preventDefault(); if (/\.(cgm|loo|html?)$/i.test(p)) sendOpen(p); });

/* borderless splash with the RegemarkFP logo while the editor loads */
let splash = null;
function createSplash() {
  splash = new BrowserWindow({
    width: 640, height: 440, frame: false, transparent: true, resizable: false, movable: true, show: false,
    alwaysOnTop: true, skipTaskbar: false, center: true, hasShadow: true, title: 'CG Motion', icon: path.join(__dirname, 'app', 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  splash.loadFile(path.join(__dirname, 'app', 'splash.html'), { query: { v: app.getVersion() } });
  splash.once('ready-to-show', () => splash.show());
  splash.on('closed', () => { splash = null; });
}

function createWindow() {
  const shownAt = Date.now();
  createSplash();
  win = new BrowserWindow({
    width: 1680, height: 980, minWidth: 1100, minHeight: 700,
    show: false, backgroundColor: '#1b1b1b', title: 'CG Motion', icon: path.join(__dirname, 'app', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  // the menus are in the app itself; macOS still needs its own app and Edit menus (Cmd+C / Cmd+V / Cmd+Q work through them)
  Menu.setApplicationMenu(isMac ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]) : null);
  // floating panel windows: plain child windows that stay above the main window
  win.webContents.setWindowOpenHandler(() => ({
    action: 'allow',
    overrideBrowserWindowOptions: { parent: win, backgroundColor: '#131313', autoHideMenuBar: true, minWidth: 260, minHeight: 200, title: 'CG Motion' }
  }));
  /* the editor appears once it has loaded and the splash has been up for a moment */
  win.once('ready-to-show', () => {
    setTimeout(() => {
      win.show();
      if (splash) { splash.setAlwaysOnTop(false); setTimeout(() => { if (splash) splash.destroy(); }, 150); }
    }, Math.max(0, 1600 - (Date.now() - shownAt)));
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.webContents.on('did-finish-load', () => { if (pending) { const p = pending; pending = null; setTimeout(() => win.webContents.send('openFile', p), 300); } });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
  });
  win.on('close', (e) => {
    if (!dirty) return;
    const r = dialog.showMessageBoxSync(win, {
      type: 'warning', buttons: ['Close without saving', 'Cancel'], defaultId: 1, cancelId: 1,
      title: 'CG Motion', message: 'You have unsaved changes.'
    });
    if (r === 1) e.preventDefault();
  });
  win.on('closed', () => { win = null; });
}

ipcMain.on('dirty', (e, d) => { dirty = !!d; });

ipcMain.handle('save', async (e, o) => {
  let p = o.path;
  if (!p) {
    const isTpl = o.kind === 'template';
    const r = await dialog.showSaveDialog(win, {
      defaultPath: o.name,
      filters: isTpl ? [{ name: 'CasparCG HTML template', extensions: ['html'] }] : (o.kind === 'csv' ? [{ name: 'CSV (comma separated)', extensions: ['csv'] }] : [{ name: 'CG Motion project', extensions: ['cgm'] }])
    });
    if (r.canceled || !r.filePath) return null;
    p = r.filePath;
  }
  await fs.promises.writeFile(p, o.data, 'utf8');
  return p;
});

ipcMain.handle('open', async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'Projects and templates (CG Motion, Loopic)', extensions: ['cgm', 'html', 'htm', 'json', 'loo'] }]
  });
  if (r.canceled || !r.filePaths.length) return null;
  return { path: r.filePaths[0], data: await fs.promises.readFile(r.filePaths[0], 'utf8') };
});

ipcMain.handle('openPath', async (e, p) => ({ path: p, data: await fs.promises.readFile(p, 'utf8') }));

/* the guide PDF ships next to the program (installed), next to the portable exe, inside the app on macOS,
   or in docs/ while developing */
ipcMain.handle('openGuide', async () => {
  const name = 'CG Motion Guide.pdf';
  const places = [path.dirname(process.execPath), process.env.PORTABLE_EXECUTABLE_DIR || '', process.resourcesPath || '',
    isMac ? path.join(path.dirname(process.execPath), '..') : '', process.env.APPDIR || '', path.join(__dirname, 'docs'), __dirname].filter(Boolean);
  for (const d of places) {
    const f = path.join(d, name);
    if (fs.existsSync(f)) { const err = await shell.openPath(f); return err ? { error: err } : { path: f }; }
  }
  return { error: 'The guide (' + name + ') was not found next to CG Motion.' };
});
ipcMain.handle('readApp', async (e, rel) => {
  /* files that ship with the app: the template runtime, the Lottie player, package.json, the tutorial project */
  const appDir = path.join(__dirname, 'app');
  let file;
  if (rel === 'lottie') file = path.join(__dirname, 'node_modules', 'lottie-web', 'build', 'player', 'lottie.min.js');
  else if (rel === 'package.json' || rel === '../package.json') file = path.join(__dirname, 'package.json');
  else {
    file = path.resolve(appDir, String(rel));
    if (file !== appDir && !file.startsWith(appDir + path.sep)) throw new Error('Not an app file: ' + rel);
  }
  return fs.promises.readFile(file, 'utf8');
});

ipcMain.handle('pickFolder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
});

ipcMain.handle('writeTo', async (e, folder, name, data) => {
  await fs.promises.mkdir(folder, { recursive: true });
  const p = path.join(folder, path.basename(name));
  await fs.promises.writeFile(p, data, 'utf8');
  return p;
});

// Sends AMCP commands to a CasparCG server and returns whatever it answers.
ipcMain.handle('amcp', (e, o) => new Promise((resolve, reject) => {
  const sock = new net.Socket();
  let out = '', done = false, timer = null;
  const finish = (err) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    sock.destroy();
    if (err) reject(err); else resolve(out);
  };
  sock.setTimeout(4000);
  sock.on('timeout', () => finish(new Error('No answer from CasparCG at ' + o.host + ':' + o.port)));
  sock.on('error', (err) => finish(new Error('Cannot reach CasparCG at ' + o.host + ':' + o.port + ' (' + err.code + ')')));
  sock.on('data', (d) => {
    out += d.toString('utf8');
    clearTimeout(timer);
    timer = setTimeout(() => finish(), 350);
  });
  sock.connect(o.port, o.host, () => {
    (o.commands || []).forEach((c) => sock.write(c + '\r\n'));
    timer = setTimeout(() => finish(), 1500);
  });
}));

app.whenReady().then(createWindow);
// macOS: clicking the Dock icon with no window open opens one again
app.on('activate', () => { if (!win && app.isReady()) createWindow(); });
app.on('window-all-closed', () => app.quit());
