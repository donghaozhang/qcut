const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false, // Allow data URLs and disable CSP restrictions for media handling
      allowRunningInsecureContent: true // Allow mixed content for development
    }
  })
  
  // Load the Vite app
  const isDev = process.env.NODE_ENV === 'development'
  if (isDev) {
    mainWindow.loadURL('http://localhost:5174')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../apps/web/dist/index.html'))
  }

  // Open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools()
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// IPC handlers for file operations
ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { 
        name: 'Video Files', 
        extensions: ['mp4', 'webm', 'mov', 'avi', 'mkv', 'wmv', 'flv', '3gp', 'm4v'] 
      },
      { 
        name: 'Audio Files', 
        extensions: ['mp3', 'wav', 'aac', 'ogg', 'flac', 'm4a', 'wma'] 
      },
      { 
        name: 'Image Files', 
        extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'] 
      },
      { 
        name: 'All Files', 
        extensions: ['*'] 
      }
    ]
  })
  return result
})

ipcMain.handle('open-multiple-files-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { 
        name: 'Media Files', 
        extensions: ['mp4', 'webm', 'mov', 'avi', 'mkv', 'mp3', 'wav', 'jpg', 'jpeg', 'png', 'gif'] 
      },
      { 
        name: 'All Files', 
        extensions: ['*'] 
      }
    ]
  })
  return result
})

ipcMain.handle('save-file-dialog', async (event, defaultFilename, filters) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultFilename,
    filters: filters || [
      { name: 'Video Files', extensions: ['mp4', 'webm', 'mov'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  return result
})

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const data = await fs.promises.readFile(filePath)
    return data
  } catch (error) {
    console.error('Error reading file:', error)
    throw error
  }
})

ipcMain.handle('write-file', async (event, filePath, data) => {
  try {
    await fs.promises.writeFile(filePath, data)
    return { success: true }
  } catch (error) {
    console.error('Error writing file:', error)
    throw error
  }
})

ipcMain.handle('get-file-info', async (event, filePath) => {
  try {
    const stats = await fs.promises.stat(filePath)
    return {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory()
    }
  } catch (error) {
    console.error('Error getting file info:', error)
    throw error
  }
})

// Storage IPC handlers
ipcMain.handle('storage:save', async (event, key, data) => {
  const userDataPath = app.getPath('userData')
  const filePath = path.join(userDataPath, 'projects', `${key}.json`)
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
  await fs.promises.writeFile(filePath, JSON.stringify(data))
})

ipcMain.handle('storage:load', async (event, key) => {
  try {
    const userDataPath = app.getPath('userData')
    const filePath = path.join(userDataPath, 'projects', `${key}.json`)
    const data = await fs.promises.readFile(filePath, 'utf8')
    return JSON.parse(data)
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
})

ipcMain.handle('storage:remove', async (event, key) => {
  try {
    const userDataPath = app.getPath('userData')
    const filePath = path.join(userDataPath, 'projects', `${key}.json`)
    await fs.promises.unlink(filePath)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
})

ipcMain.handle('storage:list', async (event) => {
  try {
    const userDataPath = app.getPath('userData')
    const projectsDir = path.join(userDataPath, 'projects')
    const files = await fs.promises.readdir(projectsDir)
    return files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''))
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
})

ipcMain.handle('storage:clear', async (event) => {
  try {
    const userDataPath = app.getPath('userData')
    const projectsDir = path.join(userDataPath, 'projects')
    const files = await fs.promises.readdir(projectsDir)
    await Promise.all(
      files.filter(f => f.endsWith('.json')).map(f => 
        fs.promises.unlink(path.join(projectsDir, f))
      )
    )
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
})