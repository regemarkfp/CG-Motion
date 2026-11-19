const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('cgNative', {
  setDirty: (d) => ipcRenderer.send('dirty', d),
  save: (o) => ipcRenderer.invoke('save', o),
  open: () => ipcRenderer.invoke('open'),
  openGt: () => ipcRenderer.invoke('openGt'),
  openPath: (p) => ipcRenderer.invoke('openPath', p),
  readApp: (rel) => ipcRenderer.invoke('readApp', rel),
  openGuide: () => ipcRenderer.invoke('openGuide'),
  pickFolder: () => ipcRenderer.invoke('pickFolder'),
  writeTo: (folder, name, data) => ipcRenderer.invoke('writeTo', folder, name, data),
  amcp: (o) => ipcRenderer.invoke('amcp', o),
  onOpenFile: (fn) => ipcRenderer.on('openFile', (e, p) => fn(p)),
  booted: () => ipcRenderer.send('booted'),
  snapshot: (o) => ipcRenderer.invoke('snapshot', o),
  fontFaces: (list) => ipcRenderer.invoke('fontFaces', list),
  savePdf: (o) => ipcRenderer.invoke('savePdf', o),
  latestRelease: () => ipcRenderer.invoke('latestRelease'),
  openExternal: (url) => ipcRenderer.invoke('openExternal', url),
  platform: process.platform,
  arch: process.arch,
  reportError: (m) => ipcRenderer.send('rendererError', String(m).slice(0, 2000))
});
