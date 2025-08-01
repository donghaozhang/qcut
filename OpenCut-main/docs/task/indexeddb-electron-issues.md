# IndexedDB Electron Issues - Implementation Plan

## Current Problem
IndexedDB fails in Electron environment with "UnknownError: Internal error" when trying to open databases. This is a common issue with Electron's security model and sandboxing.

## Current Status
✅ **Working Solution**: localStorage fallback is successfully implemented and functional
⚠️ **Optimization Needed**: Multiple initialization attempts still occur

## Solution: Electron IPC + Node.js File System (Recommended)
**Best for production apps - provides native file system access with better performance**

## Implementation Plan

### Task 1: Setup IPC Main Process Handlers ✅ COMPLETED
**File**: `electron/main.js`

**✅ COMPLETED**: Added 5 IPC handlers to `electron/main.js` (lines 137-191):
- `storage:save` - Saves project data to JSON files in user data directory
- `storage:load` - Loads project data from JSON files (returns null if not found)
- `storage:remove` - Deletes project files (ignores if file doesn't exist)
- `storage:list` - Lists all project IDs from JSON files in projects directory
- `storage:clear` - Removes all project JSON files from projects directory

**Storage Location**: `%APPDATA%/opencut/projects/` (Windows) or equivalent user data path

### Task 2: Update Preload Script (3 min)
**File**: `electron/preload.js`

Add storage API to existing electronAPI object:
```javascript
// Replace the existing contextBridge.exposeInMainWorld call (lines 3-17)
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
```

### Task 3: Create Electron Storage Adapter (8 min)
**File**: `apps/web/src/lib/storage/electron-adapter.ts` *(new file)*

```typescript
import { StorageAdapter } from "./types";

export class ElectronStorageAdapter<T> implements StorageAdapter<T> {
  private prefix: string;

  constructor(dbName: string, storeName: string) {
    this.prefix = `${dbName}_${storeName}_`;
  }

  async get(key: string): Promise<T | null> {
    try {
      const fullKey = this.prefix + key;
      return await (window as any).electronAPI.storage.load(fullKey);
    } catch (error) {
      console.error('ElectronStorageAdapter: Error getting key:', key, error);
      return null;
    }
  }

  async set(key: string, value: T): Promise<void> {
    try {
      const fullKey = this.prefix + key;
      await (window as any).electronAPI.storage.save(fullKey, value);
    } catch (error) {
      console.error('ElectronStorageAdapter: Error setting key:', key, error);
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      const fullKey = this.prefix + key;
      await (window as any).electronAPI.storage.remove(fullKey);
    } catch (error) {
      console.error('ElectronStorageAdapter: Error removing key:', key, error);
      throw error;
    }
  }

  async list(): Promise<string[]> {
    try {
      const allKeys = await (window as any).electronAPI.storage.list();
      return allKeys
        .filter((key: string) => key.startsWith(this.prefix))
        .map((key: string) => key.substring(this.prefix.length));
    } catch (error) {
      console.error('ElectronStorageAdapter: Error listing keys:', error);
      throw error;
    }
  }

  async clear(): Promise<void> {
    try {
      const allKeys = await (window as any).electronAPI.storage.list();
      const keysToRemove = allKeys.filter((key: string) => key.startsWith(this.prefix));
      await Promise.all(
        keysToRemove.map((key: string) => 
          (window as any).electronAPI.storage.remove(key)
        )
      );
    } catch (error) {
      console.error('ElectronStorageAdapter: Error clearing:', error);
      throw error;
    }
  }
}
```

### Task 4: Add Electron Detection Helper (2 min)
**File**: `apps/web/src/lib/storage/storage-service.ts`

Add helper method to detect Electron environment:
```typescript
// Add this method to StorageService class
private isElectronEnvironment(): boolean {
  return typeof window !== 'undefined' && 
         !!(window as any).electronAPI && 
         !!(window as any).electronAPI.storage;
}
```

### Task 5: Update Storage Initialization Logic (5 min)
**File**: `apps/web/src/lib/storage/storage-service.ts`

Update the initializeStorage method:
```typescript
// Add import
import { ElectronStorageAdapter } from "./electron-adapter";

// Replace the initializeStorage method
private async initializeStorage() {
  if (this.isInitialized) {
    return; // Already initialized
  }

  // Try Electron IPC first if available
  if (this.isElectronEnvironment()) {
    try {
      console.log('[DEBUG] StorageService: Using Electron IPC storage');
      this.projectsAdapter = new ElectronStorageAdapter<SerializedProject>(
        this.config.projectsDb,
        "projects"
      );
      // Test if Electron IPC works
      await this.projectsAdapter.list();
      console.log('[DEBUG] StorageService: Electron IPC test successful');
      this.isInitialized = true;
      return;
    } catch (error) {
      console.log('[DEBUG] StorageService: Electron IPC failed, trying IndexedDB:', error);
    }
  }

  // Try IndexedDB second
  try {
    console.log('[DEBUG] StorageService: Trying IndexedDB');
    this.projectsAdapter = new IndexedDBAdapter<SerializedProject>(
      this.config.projectsDb,
      "projects",
      this.config.version
    );
    
    // Test if IndexedDB works by doing a simple operation
    await this.projectsAdapter.list();
    console.log('[DEBUG] StorageService: IndexedDB test successful');
    this.isInitialized = true;
  } catch (error) {
    console.log('[DEBUG] StorageService: IndexedDB failed, falling back to localStorage:', error);
    this.useLocalStorage = true;
    this.projectsAdapter = new LocalStorageAdapter<SerializedProject>(
      this.config.projectsDb,
      "projects"
    );
    this.isInitialized = true;
  }
}
```

### Task 6: Update TypeScript Declarations (2 min)
**File**: `apps/web/src/types/electron.d.ts` *(existing file)*

Add storage interface to existing ElectronAPI:
```typescript
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
  
  // Storage operations (ADD THIS SECTION)
  storage: {
    save: (key: string, data: any) => Promise<void>;
    load: (key: string) => Promise<any | null>;
    remove: (key: string) => Promise<void>;
    list: () => Promise<string[]>;
    clear: () => Promise<void>;
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
```

## Testing Strategy

### Test 1: Verify IPC Communication (2 min)
Add to any component temporarily:
```typescript
// Test in browser console or component
if (window.electronAPI) {
  console.log('Electron API available:', !!window.electronAPI.storage);
}
```

### Test 2: Test File System Storage (3 min)
1. Create a new project
2. Check user data directory: `%APPDATA%/opencut/projects/`
3. Verify JSON files are created
4. Restart app and verify project loads

### Test 3: Test Fallback Behavior (2 min)
1. Temporarily disable Electron API in preload
2. Verify app falls back to IndexedDB/localStorage
3. Re-enable and verify priority order

## Benefits After Implementation

**Performance:**
- Faster file I/O compared to browser storage
- No storage quota limitations
- Better handling of large project files

**Reliability:**
- Native file system access
- Works across all Electron versions
- Proper error handling for file operations

**Security:**
- Maintains Electron's security model
- Files stored in user data directory
- No need to disable webSecurity

## Rollback Plan
If issues occur, the existing localStorage fallback will continue to work. The initialization logic tries storage methods in order of preference.