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

/* ---------- startup safety: a log, safe mode, and recovery when the window stays empty ---------- */
const LOG = path.join(app.getPath('userData'), 'cg-motion.log');
const NO_GPU = path.join(app.getPath('userData'), 'no-gpu');
function log(...a) {
  try {
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    const st = fs.existsSync(LOG) ? fs.statSync(LOG) : null;
    if (st && st.size > 512 * 1024) fs.renameSync(LOG, LOG + '.old');
    fs.appendFileSync(LOG, new Date().toISOString() + '  ' + a.map(String).join(' ') + '\n');
  } catch (e) {}
}
const argv = process.argv.slice(1);
const safeMode = argv.includes('--safe');
const resetLayout = safeMode || argv.includes('--reset-layout');
const noGpu = safeMode || argv.includes('--no-gpu') || fs.existsSync(NO_GPU);
if (noGpu) app.disableHardwareAcceleration();
log('start', 'version ' + app.getVersion(), 'electron ' + process.versions.electron, noGpu ? 'graphics acceleration off' : 'graphics acceleration on', resetLayout ? 'layout reset' : '');
process.on('uncaughtException', (e) => log('main error', e && e.stack || e));
app.on('child-process-gone', (e, d) => {
  log('child process gone', d.type, d.reason, d.exitCode);
  /* the graphics process keeps failing: start again without it */
  if (d.type === 'GPU' && d.reason !== 'clean-exit' && !noGpu) { try { fs.writeFileSync(NO_GPU, 'graphics process failed: ' + d.reason); } catch (er) {} app.relaunch(); app.exit(0); }
});
function relaunchWith(flag) { app.relaunch({ args: process.argv.slice(1).filter((a) => !/^--(safe|no-gpu|reset-layout)$/.test(a)).concat(flag ? [flag] : []) }); app.exit(0); }

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
    width: 640, height: 440, frame: false,
    /* Linux desktops without a compositor draw transparent windows black: use a solid dark splash there */
    transparent: process.platform !== 'linux', backgroundColor: process.platform === 'linux' ? '#131313' : undefined, resizable: false, movable: true, show: false,
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
  /* a page that never finishes starting gets a way out instead of an empty grey window */
  let booted = false;
  ipcMain.removeAllListeners('booted');
  ipcMain.on('booted', () => { booted = true; log('editor ready'); });
  ipcMain.removeAllListeners('rendererError');
  ipcMain.on('rendererError', (e, m) => log('editor error', m));
  win.webContents.on('did-fail-load', (e, code, desc, url) => {
    log('page failed to load', code, desc, url);
    if (code === -6 && /index\.html$/i.test(url)) {
      /* the editor's own files are not in this copy of CG Motion: say so instead of showing an empty window */
      let inside = '';
      try { inside = fs.readdirSync(__dirname).join(', ') + ' | app: ' + (fs.existsSync(path.join(__dirname, 'app')) ? fs.readdirSync(path.join(__dirname, 'app')).join(', ') : '(missing)'); } catch (er) { inside = String(er); }
      log('contents of ' + __dirname + ': ' + inside);
      booted = true;
      if (splash) { try { splash.destroy(); } catch (er) {} }
      dialog.showMessageBoxSync({ type: 'error', title: 'CG Motion', message: 'This copy of CG Motion is incomplete: the editor files are missing.',
        detail: 'The installer it came from was built without them. Uninstall CG Motion, then install it again from a new build (Build CG Motion.bat, or the latest GitHub build). Until then, Start CG Motion.bat in the project folder runs the editor.\n\nDetails are in ' + LOG });
      app.quit();
    }
  });
  win.webContents.on('render-process-gone', (e, d) => {
    log('editor crashed', d.reason, d.exitCode);
    if (!noGpu) { try { fs.writeFileSync(NO_GPU, 'editor crashed: ' + d.reason); } catch (er) {} relaunchWith(''); return; }
    dialog.showMessageBoxSync({ type: 'error', title: 'CG Motion', message: 'CG Motion stopped unexpectedly (' + d.reason + ').', detail: 'Details are in ' + LOG });
  });
  win.webContents.on('unresponsive', () => log('editor not responding'));
  win.webContents.on('console-message', (e, level, message, line, source) => { if (level >= 3) log('console', message, (source || '').split('/').pop() + ':' + line); });
  if (resetLayout) win.webContents.once('dom-ready', () => win.webContents.executeJavaScript("try{Object.keys(localStorage).filter(function(k){return /dock|layout/i.test(k)}).forEach(function(k){localStorage.removeItem(k)})}catch(e){}").then(() => { if (!booted) win.webContents.reload(); }).catch(() => {}));
  setTimeout(() => {
    if (booted || !win || win.isDestroyed()) return;
    log('editor did not finish starting within 12 s');
    if (splash) { try { splash.destroy(); } catch (er) {} }
    if (!win.isVisible()) win.show();
    const r = dialog.showMessageBoxSync(win, {
      type: 'warning', title: 'CG Motion', noLink: true,
      buttons: ['Restart without graphics acceleration', 'Restart and reset the panel layout', 'Show the error details', 'Keep waiting'], defaultId: 0, cancelId: 3,
      message: 'CG Motion did not finish starting.',
      detail: noGpu ? 'It is already running without graphics acceleration. Try resetting the panel layout, or open the error details (F12) and send a screenshot of the Console.' : 'This is usually the graphics driver. Restarting without graphics acceleration fixes it on most PCs (CG Motion remembers the choice). A log is kept at ' + LOG
    });
    if (r === 0) { try { fs.writeFileSync(NO_GPU, 'chosen after a failed start'); } catch (er) {} relaunchWith(''); }
    else if (r === 1) relaunchWith('--reset-layout');
    else if (r === 2) win.webContents.openDevTools({ mode: 'detach' });
  }, 12000);
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

/* vMix titles (.gtzip) are zips: they travel to the editor as base64 */
const BIN = /\.(gtzip|psd|psb|af|afphoto|afdesign|afpub|aftemplate|aep|drp|drfx)$/i;
const readAny = async (p) => BIN.test(p) ? { path: p, b64: (await fs.promises.readFile(p)).toString('base64') } : { path: p, data: await fs.promises.readFile(p, 'utf8') };
ipcMain.handle('open', async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Projects and designs (CG Motion, Loopic, vMix, Photoshop, Affinity)', extensions: ['cgm', 'html', 'htm', 'json', 'loo', 'gtzip', 'psd', 'psb', 'af', 'afphoto', 'afdesign', 'afpub', 'aftemplate', 'aep', 'comp', 'setting'] }]
  });
  if (r.canceled || !r.filePaths.length) return null;
  const gt = r.filePaths.filter((f) => /\.gtzip$/i.test(f));
  if (gt.length) return { gtzips: await Promise.all(gt.map(readAny)) };
  return readAny(r.filePaths[0]);
});
ipcMain.handle('openGt', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'vMix titles', extensions: ['gtzip'] }] });
  if (r.canceled || !r.filePaths.length) return null;
  return { gtzips: await Promise.all(r.filePaths.map(readAny)) };
});

ipcMain.handle('openPath', async (e, p) => readAny(p));

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
/* ---------- updates: the newest release on GitHub, and opening its pages in the browser ---------- */
const UPDATE_REPO = 'regemarkfp/CG-Motion';
ipcMain.handle('latestRelease', async () => {
  try {
    const { net } = require('electron');
    const r = await net.fetch('https://api.github.com/repos/' + UPDATE_REPO + '/releases/latest', { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'CG-Motion/' + app.getVersion() } });
    if (!r.ok) return { error: r.status === 404 ? 'no release published yet' : 'GitHub answered ' + r.status };
    const j = await r.json();
    log('update check', 'running ' + app.getVersion(), 'latest ' + j.tag_name);
    return { tag: j.tag_name, name: j.name, url: j.html_url, notes: String(j.body || '').slice(0, 4000),
      assets: (j.assets || []).map((a) => ({ name: a.name, url: a.browser_download_url, size: a.size })) };
  } catch (e) { log('update check failed', e && e.message); return { error: (e && e.message) || 'no connection' }; }
});
/* only CG Motion's own GitHub pages and downloads are opened from here */
ipcMain.handle('openExternal', async (e, url) => {
  const u = String(url || '');
  if (!/^https:\/\/github\.com\/regemarkfp\/CG-Motion(\/|$)/.test(u)) return false;
  await shell.openExternal(u);
  return true;
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

/* ---------- fonts installed on this computer, embedded into exported templates ---------- */
const fontIndex = require('./fontindex.js');
ipcMain.handle('fontFaces', async (e, wanted) => {
  const faces = fontIndex.index(path.join(app.getPath('userData'), 'font-index.json')), out = [], read = {};
  for (const w of wanted || []) {
    const f = fontIndex.find(faces, w.family, w.weight, w.italic);
    if (!f) { out.push({ family: w.family, weight: w.weight, italic: w.italic, missing: true }); continue; }
    if (f.restricted) { out.push({ family: w.family, weight: w.weight, italic: w.italic, restricted: true, file: path.basename(f.file) }); continue; }
    if (!read[f.file]) {
      try { read[f.file] = (await fs.promises.readFile(f.file)).toString('base64'); } catch (er) { out.push({ family: w.family, missing: true }); continue; }
    }
    const ext = path.extname(f.file).slice(1).toLowerCase();
    out.push({ family: w.family, weight: w.weight, italic: w.italic, file: path.basename(f.file), faceWeight: f.weight, faceItalic: f.italic,
      exact: f.family.toLowerCase() === String(w.family).toLowerCase(), src: 'data:' + ({ ttf: 'font/ttf', otf: 'font/otf', ttc: 'font/collection' }[ext] || 'font/ttf') + ';base64,' + read[f.file] });
  }
  return out;
});

/* ---------- variables sheet: still frames of templates, and the PDF ---------- */
const os = require('os');
function tempHtml(html) { const f = path.join(os.tmpdir(), 'cgmotion-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.html'); fs.writeFileSync(f, html, 'utf8'); return f; }
ipcMain.handle('snapshot', async (e, o) => {
  const w = Math.max(16, Math.round(o.w || 1920)), h = Math.max(16, Math.round(o.h || 1080)), f = tempHtml(o.html);
  const bw = new BrowserWindow({ show: false, width: w, height: h, useContentSize: true, frame: false, transparent: true, webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false } });
  try {
    await bw.loadFile(f);
    await bw.webContents.executeJavaScript('new Promise(function(r){(document.fonts&&document.fonts.ready||Promise.resolve()).then(function(){setTimeout(r,250)})})');
    await bw.webContents.executeJavaScript('try{gotoFrame(' + (Math.round(o.frame) || 0) + ')}catch(e){}');
    await new Promise((r) => setTimeout(r, 400));
    let img = await bw.webContents.capturePage({ x: 0, y: 0, width: w, height: h });
    if (img.getSize().width > 1400) img = img.resize({ width: 1400, quality: 'best' });
    return 'data:image/png;base64,' + img.toPNG().toString('base64');
  } catch (err) { log('snapshot failed', err && err.message); return null; }
  finally { bw.destroy(); fs.promises.unlink(f).catch(() => {}); }
});
ipcMain.handle('savePdf', async (e, o) => {
  let p = null;
  if (o.folder) { await fs.promises.mkdir(o.folder, { recursive: true }); p = path.join(o.folder, path.basename(o.name)); }
  else {
    const r = await dialog.showSaveDialog(win, { defaultPath: o.name, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (r.canceled || !r.filePath) return null;
    p = r.filePath;
  }
  const f = tempHtml(o.html), bw = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  try {
    await bw.loadFile(f);
    await bw.webContents.executeJavaScript('new Promise(function(r){var im=[].slice.call(document.images).filter(function(i){return !i.complete});if(!im.length)return r();var n=im.length;im.forEach(function(i){i.onload=i.onerror=function(){if(--n<=0)r()}})})');
    const pdf = await bw.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true });
    await fs.promises.writeFile(p, pdf);
    shell.openPath(p);
    return p;
  } finally { bw.destroy(); fs.promises.unlink(f).catch(() => {}); }
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
