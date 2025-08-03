export interface ElectronAPI {
  // System info
  platform: string
  isElectron: boolean
  
  // File operations
  openFileDialog: () => Promise<{
    canceled: boolean
    filePaths: string[]
  }>
  
  openMultipleFilesDialog: () => Promise<{
    canceled: boolean
    filePaths: string[]
  }>
  
  saveFileDialog: (
    defaultFilename?: string, 
    filters?: Array<{ name: string; extensions: string[] }>
  ) => Promise<{
    canceled: boolean
    filePath?: string
  }>
  
  readFile: (filePath: string) => Promise<Buffer>
  writeFile: (filePath: string, data: Buffer | Uint8Array) => Promise<{ success: boolean }>
  getFileInfo: (filePath: string) => Promise<{
    size: number
    created: Date
    modified: Date
    isFile: boolean
    isDirectory: boolean
  }>
  
  // Storage operations
  storage: {
    save: (key: string, data: any) => Promise<void>
    load: (key: string) => Promise<any | null>
    remove: (key: string) => Promise<void>
    list: () => Promise<string[]>
    clear: () => Promise<void>
  }
  
  // Generic IPC invoke method
  invoke: (channel: string, ...args: any[]) => Promise<any>
  
  // FFmpeg export operations
  ffmpeg: {
    createExportSession: () => Promise<{
      sessionId: string
      frameDir: string
      outputDir: string
    }>
    saveFrame: (data: {
      sessionId: string
      frameName: string
      data: string
    }) => Promise<string>
    exportVideoCLI: (options: {
      sessionId: string
      width: number
      height: number
      fps: number
      quality: string
    }) => Promise<{ success: boolean; outputFile: string }>
    readOutputFile: (path: string) => Promise<Buffer>
    cleanupExportSession: (sessionId: string) => Promise<void>
  }
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}