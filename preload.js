const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('cgNative', {
  setDirty: (d) => ipcRenderer.send('dirty', d),
  save: (o) => ipcRenderer.invoke('save', o),
  open: () => ipcRenderer.invoke('open'),
  openPath: (p) => ipcRenderer.invoke('openPath', p),
  readApp: (rel) => ipcRenderer.invoke('readApp', rel),
  openGuide: () => ipcRenderer.invoke('openGuide'),
  pickFolder: () => ipcRenderer.invoke('pickFolder'),
  writeTo: (folder, name, data) => ipcRenderer.invoke('writeTo', folder, name, data),
  amcp: (o) => ipcRenderer.invoke('amcp', o),
  onOpenFile: (fn) => ipcRenderer.on('openFile', (e, p) => fn(p))
});
