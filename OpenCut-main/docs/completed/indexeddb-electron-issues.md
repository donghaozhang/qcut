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

### Task 2: Update Preload Script ✅ COMPLETED
**File**: `electron/preload.js`

**✅ COMPLETED**: Added storage API to existing electronAPI object (lines 15-22):
- Added `storage` object with 5 methods that invoke the IPC handlers
- Maintained all existing APIs (file operations, platform info)
- The storage API is now exposed to the renderer process

**Storage API Methods**:
- `electronAPI.storage.save(key, data)` - Save project data
- `electronAPI.storage.load(key)` - Load project data
- `electronAPI.storage.remove(key)` - Remove project data
- `electronAPI.storage.list()` - List all project IDs
- `electronAPI.storage.clear()` - Clear all projects

### Task 3: Create Electron Storage Adapter ✅ COMPLETED
**File**: `apps/web/src/lib/storage/electron-adapter.ts` *(new file created)*

**✅ COMPLETED**: Created ElectronStorageAdapter class that implements the StorageAdapter interface:
- Implements all required methods: `get`, `set`, `remove`, `list`, `clear`
- Uses prefix system to namespace storage keys (`${dbName}_${storeName}_`)
- Integrates with `window.electronAPI.storage` exposed by preload script
- Includes error handling with descriptive console errors

**Key Features**:
- **Prefix System**: Ensures different stores don't conflict (e.g., `video-editor-projects_projects_`)
- **Error Handling**: Catches and logs errors, returns null for failed gets
- **List Filtering**: Only returns keys that match the adapter's prefix
- **Batch Clear**: Removes only keys belonging to this adapter's namespace

**Usage Example**:
```typescript
const adapter = new ElectronStorageAdapter<SerializedProject>(
  "video-editor-projects",
  "projects"
);
// Will save to file: video-editor-projects_projects_[projectId].json
```

### Task 4: Add Electron Detection Helper ✅ COMPLETED
**File**: `apps/web/src/lib/storage/storage-service.ts`

**✅ COMPLETED**: Added isElectronEnvironment helper method (lines 33-37):
- Checks if `window` object exists (for SSR safety)
- Verifies `electronAPI` is available on window
- Confirms `storage` object exists within electronAPI

**Method Details**:
```typescript
private isElectronEnvironment(): boolean {
  return typeof window !== 'undefined' && 
         !!(window as any).electronAPI && 
         !!(window as any).electronAPI.storage;
}
```

**Purpose**: Safely detects if the app is running in Electron with storage API available
**Returns**: `true` if all Electron storage APIs are accessible, `false` otherwise

### Task 5: Update Storage Initialization Logic ✅ COMPLETED
**File**: `apps/web/src/lib/storage/storage-service.ts`

**✅ COMPLETED**: Updated storage initialization with 3-tier fallback system:
1. Added import for `ElectronStorageAdapter` (line 5)
2. Modified `initializeStorage` method (lines 40-85) with priority order:
   - **1st Priority**: Electron IPC storage (if in Electron environment)
   - **2nd Priority**: IndexedDB (if Electron fails or not in Electron)
   - **3rd Priority**: localStorage (ultimate fallback)

**Key Changes**:
- **Electron Check First**: Uses `isElectronEnvironment()` to detect Electron
- **Test Each Adapter**: Calls `list()` to verify adapter works before committing
- **Early Return**: If Electron storage works, skips other options
- **Graceful Fallback**: Each failure logs debug info and tries next option

**Storage Priority Order**:
1. **Electron IPC** → Native file system (best performance, no quotas)
2. **IndexedDB** → Browser storage (good for web, fails in Electron)
3. **localStorage** → Simple key-value (works everywhere, has size limits)

### Task 6: Update TypeScript Declarations ✅ COMPLETED
**File**: `apps/web/src/types/electron.d.ts` *(existing file)*

**✅ COMPLETED**: Added storage interface to existing ElectronAPI (lines 35-42):
- Added `storage` object with 5 typed methods
- Maintained all existing type definitions
- TypeScript now recognizes `window.electronAPI.storage` methods

**Storage Interface Added**:
```typescript
// Storage operations
storage: {
  save: (key: string, data: any) => Promise<void>
  load: (key: string) => Promise<any | null>
  remove: (key: string) => Promise<void>
  list: () => Promise<string[]>
  clear: () => Promise<void>
}
```

**Benefits**:
- **Type Safety**: Full IntelliSense support for storage methods
- **Error Prevention**: TypeScript will catch incorrect usage at compile time
- **Documentation**: Method signatures serve as inline documentation

## 🎉 Implementation Complete!

All 6 tasks have been successfully implemented. The Electron IPC storage system is now fully integrated and ready for use.

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