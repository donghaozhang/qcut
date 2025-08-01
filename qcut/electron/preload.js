const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // System info
  platform: process.platform,
  
  // File operations
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  openMultipleFilesDialog: () => ipcRenderer.invoke('open-multiple-files-dialog'),
  saveFileDialog: (defaultFilename, filters) => ipcRenderer.invoke('save-file-dialog', defaultFilename, filters),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, data) => ipcRenderer.invoke('write-file', filePath, data),
  getFileInfo: (filePath) => ipcRenderer.invoke('get-file-info', filePath),
  
  // Storage operations
  storage: {
    save: (key, data) => ipcRenderer.invoke('storage:save', key, data),
    load: (key) => ipcRenderer.invoke('storage:load', key),
    remove: (key) => ipcRenderer.invoke('storage:remove', key),
    list: () => ipcRenderer.invoke('storage:list'),
    clear: () => ipcRenderer.invoke('storage:clear')
  },
  
  // Utility functions
  isElectron: true
})