const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('load'),
  save: (d) => ipcRenderer.invoke('save', d),
  backup: (d) => ipcRenderer.invoke('backup', d),
  restore: () => ipcRenderer.invoke('restore'),
  xlsx: (rows, name) => ipcRenderer.invoke('xlsx', rows, name)
});
