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
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}