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
  
  // Utility functions
  isElectron: true
})