# OpenCut Migration Tasks: Next.js to Vite + TanStack Router + Electron (Windows Desktop App)

## Overview
This document tracks the migration tasks for converting OpenCut from a Next.js web app to a fully local Vite + TanStack Router + Electron Windows desktop application. Each task is designed to take ~3 minutes or less and includes specific file paths.

## Progress Summary
**Last Updated**: 2025-08-01

### Phase 0: Electron Setup ✅ (90% Complete)
- Successfully installed Electron, Electron Builder, and development tools using Bun
- Created electron main process and preload script
- Configured package.json with Electron Builder settings
- Tested Electron with Next.js dev server - working ✓
- **Blocker**: Cannot create static export due to Next.js API routes
- **Next Steps**: Need to proceed with Vite migration to remove API route dependencies

### Phase 1: Remove Next.js Dependencies ✅ (Complete)
- Audited all Next.js usage: 12 files with Link, 7 with useRouter, 7 with Image
- Documented findings in `docs/nextjs-audit.md`
- Removed Next.js dependencies from package.json using Bun
- Extracted providers and documented API routes for future IPC conversion
- Created migration backup files in `src/migration-backup/`
- **Ready**: Can now proceed to Phase 2 (Vite setup)

### Phase 2: Setup Vite Build System ✅ (Complete)
- Installed Vite 7.0.6 with React plugin and TanStack Router
- Created `vite.config.ts` with Electron compatibility (base: './')
- Created `index.html` with all meta tags and CSP headers  
- Created `tailwind.config.js` and verified Tailwind CSS v4 working
- Updated TypeScript config for Vite (ES2020, react-jsx)
- Created `src/main.tsx` entry point and basic `src/App.tsx`
- Updated Electron to load localhost:5173 (dev) and dist/index.html (prod)
- Successfully tested: ✓ Vite dev server, ✓ Production build, ✓ Electron integration
- **Files Created/Modified**: 
  - **Created**: `vite.config.ts`, `index.html`, `tailwind.config.js`, `tsconfig.node.json`, `src/main.tsx`, `src/App.tsx`, `src/routes/__root.tsx`, `src/routes/index.tsx`
  - **Modified**: `tsconfig.json`, `package.json` (scripts), `electron/main.js`, root `package.json` (Electron Builder)
- **Ready**: Basic Vite + TanStack Router + Electron stack working

### Key Findings:
1. The project uses Bun as package manager (not npm)
2. Next.js API routes prevent static export for Electron
3. Electron successfully loads the dev server at http://localhost:3000
4. Need to migrate to Vite first before creating Windows executable

## Priority: Create Working Electron Windows App First

### Phase 0: Electron Setup (Priority - Do This First!)

#### 0.1 Install Electron Dependencies
- [x] **Install Electron** (~2 min)
  - Directory: Root of project
  - Run: `bun add -D electron` (used Bun instead of npm)
  
- [x] **Install Electron Builder** (~2 min)
  - Directory: Root of project
  - Run: `bun add -D electron-builder`

- [x] **Install Electron development tools** (~2 min)
  - Run: `bun add -D electron-devtools-installer cross-env`

#### 0.2 Create Electron Main Process
- [x] **Create electron directory** (~1 min)
  - Create: `electron/` directory at project root
  
- [x] **Create main.js** (~3 min)
  - File: `electron/main.js`
  ```javascript
  const { app, BrowserWindow } = require('electron')
  const path = require('path')
  
  let mainWindow
  
  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      }
    })
    
    // For now, load the Next.js app
    const isDev = process.env.NODE_ENV === 'development'
    if (isDev) {
      mainWindow.loadURL('http://localhost:3000')
    } else {
      mainWindow.loadFile(path.join(__dirname, '../apps/web/out/index.html'))
    }
  }
  
  app.whenReady().then(createWindow)
  
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
  ```

- [x] **Create preload.js** (~2 min)
  - File: `electron/preload.js`
  ```javascript
  const { contextBridge } = require('electron')
  
  contextBridge.exposeInMainWorld('electronAPI', {
    platform: process.platform
  })
  ```

#### 0.3 Configure Electron Builder
- [x] **Update package.json for Electron** (~3 min)
  - File: `package.json` (root)
  - Add:
  ```json
  "main": "electron/main.js",
  "scripts": {
    "electron": "electron .",
    "electron:dev": "cross-env NODE_ENV=development electron .",
    "dist": "electron-builder",
    "dist:win": "electron-builder --win"
  },
  "build": {
    "appId": "com.opencut.app",
    "productName": "OpenCut",
    "directories": {
      "output": "dist-electron"
    },
    "files": [
      "electron/**/*",
      "apps/web/out/**/*"
    ],
    "win": {
      "target": "nsis",
      "icon": "build/icon.ico"
    }
  }
  ```

- [x] **Create app icon** (~2 min)
  - Create: `build/` directory at root
  - Add: `build/icon.ico` (copied from favicon.ico)

#### 0.4 Test Electron with Current Next.js
- [x] **Test Electron in dev mode** (~2 min)
  - Run: `bun dev` (in apps/web)
  - In another terminal: `bun run electron:dev`
  - Verify: Electron window opens with Next.js app ✓

- [x] **Build Next.js static export** (~3 min)
  - Directory: `apps/web/`
  - ⚠️ Cannot build static export due to API routes
  - Need to migrate to Vite first to remove API dependencies

- [ ] **Test Electron with static build** (~2 min)
  - ⏸️ Skipped - requires static export
  - Will complete after Vite migration

- [ ] **Build Windows executable** (~3 min)
  - ⏸️ Postponed - requires static build
  - Will complete after Vite migration

### Phase 1: Remove Next.js Dependencies and Code

#### 1.1 Audit Next.js Usage
- [x] **Search for next/link imports** (~2 min)
  - Files to check: `apps/web/src/components/**/*.tsx`
  - Command: `grep -r "from 'next/link'" apps/web/src/`
  - Document all files using next/link
  - ✓ Found in 12 files - documented in `docs/nextjs-audit.md`

- [x] **Search for next/router imports** (~2 min)
  - Files to check: `apps/web/src/**/*.tsx`
  - Command: `grep -r "from 'next/router'" apps/web/src/`
  - Document all files using useRouter
  - ✓ Found useRouter in 7 files

- [x] **List all pages in app directory** (~1 min)
  - Directory: `apps/web/src/app/`
  - Create inventory of all page routes
  - ✓ Documented all routes in audit

- [x] **Check for Next.js metadata** (~1 min)
  - File: `apps/web/src/app/metadata.ts`
  - Note metadata configuration
  - ✓ Found metadata export configuration

- [x] **Search for next/image usage** (~2 min)
  - Command: `grep -r "from 'next/image'" apps/web/src/`
  - List all files using Next.js Image component
  - ✓ Found in 7 files

- [x] **Check for API routes** (~1 min)
  - Directory: `apps/web/src/app/api/`
  - List all API endpoints for IPC conversion
  - ✓ Found 4 API routes - documented in `migration-backup/api-routes-to-ipc.md`

#### 1.2 Remove Next.js from package.json
- [x] **Backup current package.json** (~1 min)
  - File: `apps/web/package.json`
  - Copy to: `apps/web/package.json.backup`
  - ✓ Backup created

- [x] **Remove next dependency** (~2 min)
  - File: `apps/web/package.json`
  - Remove: `"next": "^version"`
  - Run: `cd apps/web && bun remove next next-themes @t3-oss/env-nextjs`
  - ✓ Removed successfully

- [x] **Update build scripts** (~3 min)
  - File: `apps/web/package.json`
  - Remove scripts: `"next build"`, `"next export"`, `"next dev"`
  - Keep note of what each script did
  - ✓ Scripts updated with placeholder messages

#### 1.3 Clean Next.js Code Patterns
- [x] **Extract app router providers** (~3 min)
  - Files: `apps/web/src/app/layout.tsx`
  - Extract providers to: `apps/web/src/migration-backup/providers.tsx`
  - ✓ Providers extracted (ThemeProvider, TooltipProvider, StorageProvider, etc.)

- [x] **Document API routes for IPC conversion** (~3 min)
  - Files: `apps/web/src/app/api/**/*.ts`
  - Create list of endpoints and their functions
  - ✓ Created `migration-backup/api-routes-to-ipc.md`

- [x] **Create Next.js audit documentation** (~2 min)
  - File: `docs/nextjs-audit.md`
  - ✓ Complete audit of all Next.js usage documented

### Phase 2: Setup Vite Build System

#### 2.1 Install Dependencies
- [x] **Install Vite core** (~2 min)
  - Directory: `apps/web/`
  - Run: `bun add -D vite`
  - ✓ Installed vite@7.0.6

- [x] **Install React plugin** (~1 min)
  - Directory: `apps/web/`
  - Run: `bun add -D @vitejs/plugin-react`
  - ✓ Installed @vitejs/plugin-react@4.7.0

- [x] **Install TanStack Router** (~2 min)
  - Directory: `apps/web/`
  - Run: `bun add @tanstack/react-router`
  - Run: `bun add -D @tanstack/router-plugin`
  - ✓ Installed @tanstack/react-router@1.130.9 and plugin

#### 2.2 Configure Vite for Electron
- [x] **Create vite.config.ts** (~3 min)
  - File: `apps/web/vite.config.ts`
  - ✓ Created with TanStack Router plugin and Electron compatibility
  ```typescript
  import { defineConfig } from 'vite'
  import react from '@vitejs/plugin-react'
  import { tanstackRouter } from '@tanstack/router-plugin/vite'
  
  export default defineConfig({
    base: './', // Critical for Electron file:// protocol
    plugins: [
      tanstackRouter({
        target: 'react',
        routesDirectory: 'src/routes'
      }),
      react()
    ],
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      // Ensure all assets use relative paths
      rollupOptions: {
        output: {
          assetFileNames: 'assets/[name]-[hash][extname]',
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js'
        }
      }
    }
  })
  ```

- [x] **Create index.html** (~3 min)
  - File: `apps/web/index.html`
  - ✓ Created with all meta tags, icons, and CSP headers
  ```html
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';">
      <title>OpenCut</title>
    </head>
    <body>
      <div id="root"></div>
      <script type="module" src="/src/main.tsx"></script>
    </body>
  </html>
  ```

#### 2.3 Update Electron to Load Vite
- [ ] **Update electron main.js for Vite** (~3 min)
  - File: `electron/main.js`
  - Change loadURL to port 5173 for Vite:
  ```javascript
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../apps/web/dist/index.html'))
  }
  ```

- [ ] **Update Electron Builder config** (~2 min)
  - File: `package.json` (root)
  - Update files array:
  ```json
  "files": [
    "electron/**/*",
    "apps/web/dist/**/*"
  ]
  ```

### Phase 3: Implement TanStack Router

#### 3.1 Setup Routes Structure
- [ ] **Create routes directory** (~1 min)
  - Create: `apps/web/src/routes/`

- [ ] **Create index route** (~3 min)
  - File: `apps/web/src/routes/index.tsx`
  - Move content from `apps/web/src/app/page.tsx`

- [ ] **Create editor route** (~3 min)
  - File: `apps/web/src/routes/editor.$project_id.tsx`
  - Move from: `apps/web/src/app/editor/[project_id]/page.tsx`

#### 3.2 Configure Router for Electron
- [ ] **Create router with Hash History** (~3 min)
  - File: `apps/web/src/App.tsx`
  ```typescript
  import { createReactRouter, RouterProvider } from '@tanstack/react-router'
  import { createHashHistory } from '@tanstack/router'
  import { routeTree } from './routeTree.gen'
  
  // Hash history is required for Electron file:// protocol
  const router = createReactRouter({
    routeTree,
    history: createHashHistory()
  })
  
  export default function App() {
    return <RouterProvider router={router} />
  }
  ```

### Phase 4: FFmpeg and Local File Access

#### 4.1 Configure FFmpeg for Electron
- [ ] **Copy FFmpeg files** (~2 min)
  - From: `apps/web/public/ffmpeg/`
  - To: Keep in public, ensure copied in build

- [ ] **Update FFmpeg loading for Electron** (~3 min)
  - File: `apps/web/src/lib/ffmpeg-utils.ts`
  - Add Electron detection and path handling

#### 4.2 Setup IPC for File Access
- [ ] **Create file access IPC handlers** (~3 min)
  - File: `electron/main.js`
  ```javascript
  const { ipcMain, dialog } = require('electron')
  
  ipcMain.handle('open-file-dialog', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Videos', extensions: ['mp4', 'webm', 'mov'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    return result
  })
  ```

- [ ] **Update preload for file access** (~2 min)
  - File: `electron/preload.js`
  ```javascript
  const { contextBridge, ipcRenderer } = require('electron')
  
  contextBridge.exposeInMainWorld('electronAPI', {
    openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
    readFile: (path) => ipcRenderer.invoke('read-file', path)
  })
  ```

### Phase 5: Package and Test

#### 5.1 Build and Package
- [ ] **Build Vite app** (~2 min)
  - Directory: `apps/web/`
  - Run: `npm run build`
  - Verify: `dist/` folder created

- [ ] **Test Electron with Vite build** (~2 min)
  - Run: `npm run electron`
  - Verify: App loads correctly

- [ ] **Build Windows installer** (~3 min)
  - Run: `npm run dist:win`
  - Check: `dist-electron/` for installer
  - Test: Install and run the app

#### 5.2 Configure Auto-Update (Optional)
- [ ] **Add electron-updater** (~2 min)
  - Run: `npm install electron-updater`
  
- [ ] **Configure update server** (~3 min)
  - File: `electron/main.js`
  - Add auto-updater configuration

### Phase 6: Final Testing and Cleanup

- [ ] **Test all features in packaged app** (~3 min)
  - Video import
  - Timeline editing
  - Export functionality
  - File save/load

- [ ] **Remove Next.js artifacts** (~2 min)
  - Delete: `apps/web/next.config.ts`
  - Delete: `apps/web/src/app/` (after verification)

- [ ] **Update documentation** (~3 min)
  - File: `README.md`
  - Add Electron build instructions
  - Add Windows installation guide

## Notes
- Focus on getting a working Electron app first before removing Next.js
- Test the packaged .exe after each major change
- Ensure FFmpeg works in the packaged environment
- Use Hash routing for Electron compatibility
- All assets must use relative paths for file:// protocol