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
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}