import { useCallback } from 'react'
import type { ElectronAPI } from '@/types/electron'

export const useElectron = () => {
  const electronAPI = (typeof window !== 'undefined' ? window.electronAPI : undefined) as ElectronAPI | undefined
  
  const isElectron = useCallback(() => {
    return electronAPI?.isElectron || false
  }, [electronAPI])

  const openFileDialog = useCallback(async () => {
    if (!electronAPI) {
      throw new Error('Electron API not available')
    }
    return electronAPI.openFileDialog()
  }, [electronAPI])

  const openMultipleFilesDialog = useCallback(async () => {
    if (!electronAPI) {
      throw new Error('Electron API not available')
    }
    return electronAPI.openMultipleFilesDialog()
  }, [electronAPI])

  const saveFileDialog = useCallback(async (
    defaultFilename?: string,
    filters?: Array<{ name: string; extensions: string[] }>
  ) => {
    if (!electronAPI) {
      throw new Error('Electron API not available')
    }
    return electronAPI.saveFileDialog(defaultFilename, filters)
  }, [electronAPI])

  const readFile = useCallback(async (filePath: string) => {
    if (!electronAPI) {
      throw new Error('Electron API not available')
    }
    return electronAPI.readFile(filePath)
  }, [electronAPI])

  const writeFile = useCallback(async (filePath: string, data: Buffer | Uint8Array) => {
    if (!electronAPI) {
      throw new Error('Electron API not available')
    }
    return electronAPI.writeFile(filePath, data)
  }, [electronAPI])

  const getFileInfo = useCallback(async (filePath: string) => {
    if (!electronAPI) {
      throw new Error('Electron API not available')
    }
    return electronAPI.getFileInfo(filePath)
  }, [electronAPI])

  // Helper function to import files for the video editor
  const importMediaFiles = useCallback(async () => {
    if (!isElectron()) {
      // In browser mode, use regular file input
      return new Promise<File[]>((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.multiple = true
        input.accept = 'video/*,audio/*,image/*'
        input.onchange = (e) => {
          const files = Array.from((e.target as HTMLInputElement).files || [])
          resolve(files)
        }
        input.click()
      })
    } else {
      // In Electron mode, use native file dialog
      const result = await openMultipleFilesDialog()
      if (result.canceled || !result.filePaths.length) {
        return []
      }
      
      // Convert file paths to File objects for consistency
      const files: File[] = []
      for (const filePath of result.filePaths) {
        try {
          const buffer = await readFile(filePath)
          const fileName = filePath.split(/[\\/]/).pop() || 'unknown'
          const file = new File([buffer], fileName)
          files.push(file)
        } catch (error) {
          console.error(`Failed to read file ${filePath}:`, error)
        }
      }
      return files
    }
  }, [isElectron, openMultipleFilesDialog, readFile])

  // Helper function to export/save files
  const exportFile = useCallback(async (
    data: Blob | Buffer | Uint8Array,
    defaultFilename: string,
    filters?: Array<{ name: string; extensions: string[] }>
  ) => {
    if (!isElectron()) {
      // In browser mode, use download link
      const blob = data instanceof Blob ? data : new Blob([data])
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = defaultFilename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      return { success: true }
    } else {
      // In Electron mode, use native save dialog
      const result = await saveFileDialog(defaultFilename, filters)
      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true }
      }
      
      const buffer = data instanceof Blob 
        ? new Uint8Array(await data.arrayBuffer())
        : data instanceof Buffer 
          ? data 
          : data
      
      await writeFile(result.filePath, buffer)
      return { success: true, filePath: result.filePath }
    }
  }, [isElectron, saveFileDialog, writeFile])

  return {
    isElectron,
    electronAPI,
    // Raw API methods
    openFileDialog,
    openMultipleFilesDialog,
    saveFileDialog,
    readFile,
    writeFile,
    getFileInfo,
    // Helper methods
    importMediaFiles,
    exportFile,
  }
}