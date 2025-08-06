# Electron-Builder Implementation Plan

## Overview
Transition from electron-packager to electron-builder for professional Windows EXE distribution with installer, auto-updates, and optimized file sizes.

**Total Estimated Time**: ~45-60 minutes  
**Branch**: `electron-builder`

---

## Phase 1: Basic Setup (15 minutes)

### Task 1.1: Install electron-builder (2 minutes)
```bash
cd qcut/apps/web
bun add --dev electron-builder
```
- [ ] Install electron-builder as dev dependency
- [ ] Verify installation in package.json

### Task 1.2: Create basic build configuration (3 minutes)
- [ ] Add build config to `apps/web/package.json`
- [ ] Set appId, productName, and basic Windows target
- [ ] Configure output directory to `d:/AI_play/AI_Code/build_opencut`
- [ ] Create output directory if it doesn't exist

### Task 1.3: Add build scripts (2 minutes)
- [ ] Add `"dist": "electron-builder"` to scripts
- [ ] Add `"dist:win": "electron-builder --win"` 
- [ ] Add `"dist:dir": "electron-builder --dir"` for testing

### Task 1.4: Create app icon (3 minutes)
- [ ] Create/find suitable app icon (512x512 PNG)
- [ ] Convert to ICO format for Windows
- [ ] Place in `build/` directory
- [ ] Update config to reference icon

### Task 1.5: Test basic build (5 minutes)
- [ ] Run `bun run build` (web build)
- [ ] Run `bun run dist:dir` (directory build)
- [ ] Verify QCut.exe runs correctly
- [ ] Check file structure

---

## Phase 2: Windows Installer Configuration (15 minutes)

### Task 2.1: Configure NSIS installer (4 minutes)
- [ ] Set target to "nsis" in build config
- [ ] Configure installer branding
- [ ] Set installation directory defaults
- [ ] Add uninstaller configuration

### Task 2.2: Add file associations (3 minutes)
- [ ] Configure .mp4, .mov, .avi file associations
- [ ] Set QCut as default video editor option
- [ ] Add context menu "Edit with QCut"

### Task 2.3: Configure shortcuts and registry (3 minutes)
- [ ] Desktop shortcut option
- [ ] Start menu entry
- [ ] Add to Windows Apps list
- [ ] Set proper app metadata

### Task 2.4: Optimize bundle size (3 minutes)
- [ ] Add file ignore patterns
- [ ] Exclude dev dependencies
- [ ] Configure compression settings
- [ ] Set resource optimization

### Task 2.5: Build and test installer (2 minutes)
- [ ] Run `bun run dist:win`
- [ ] Test installer installation
- [ ] Verify shortcuts work
- [ ] Test uninstaller

---

## Phase 3: Advanced Features (15 minutes)

### Task 3.1: Code signing setup (4 minutes)
- [ ] Add code signing configuration (placeholder)
- [ ] Document certificate requirements
- [ ] Add signing environment variables
- [ ] Configure for CI/CD readiness

### Task 3.2: Auto-updater configuration (4 minutes)
- [ ] Install electron-updater
- [ ] Add update configuration to build
- [ ] Set update server URL (placeholder)
- [ ] Add update check logic

### Task 3.3: Multiple build targets (3 minutes)
- [ ] Configure portable version
- [ ] Add ZIP distribution option
- [ ] Set up different build profiles
- [ ] Test all targets

### Task 3.4: Build optimization (2 minutes)
- [ ] Fine-tune compression settings
- [ ] Add build caching
- [ ] Optimize rebuild times
- [ ] Configure parallel builds

### Task 3.5: Documentation and scripts (2 minutes)
- [ ] Update build documentation
- [ ] Create release script
- [ ] Add version bumping
- [ ] Document distribution process

---

## Phase 4: Testing and Validation (10 minutes)

### Task 4.1: Clean build test (3 minutes)
- [ ] Delete all previous builds
- [ ] Run complete build process
- [ ] Measure build time and file sizes
- [ ] Compare with electron-packager

### Task 4.2: Installation testing (3 minutes)
- [ ] Test on clean Windows machine/VM
- [ ] Verify all features work
- [ ] Test file associations
- [ ] Check start menu integration

### Task 4.3: Performance validation (2 minutes)
- [ ] Compare startup time vs packager
- [ ] Test memory usage
- [ ] Verify FFmpeg functionality
- [ ] Check AI features work

### Task 4.4: Distribution preparation (2 minutes)
- [ ] Create release checklist
- [ ] Document user installation process
- [ ] Prepare distribution folders
- [ ] Create backup of working build

---

## Configuration Templates

### Basic package.json build config:
```json
{
  "build": {
    "appId": "com.qcut.videoeditor",
    "productName": "QCut Video Editor",
    "directories": {
      "output": "d:/AI_play/AI_Code/build_opencut"
    },
    "win": {
      "target": "nsis",
      "icon": "build/icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true
    }
  }
}
```

### File structure after setup:
```
d:/AI_play/AI_Code/build_opencut/
├── QCut Setup 1.0.0.exe          # Windows installer
├── win-unpacked/                 # Unpacked app folder
│   └── QCut.exe
└── builder-debug.yml             # Build metadata

qcut/apps/web/
├── build/
│   └── icon.ico
├── package.json (updated)
└── electron-builder.yml (optional)
```

---

## Success Criteria

### Phase 1 Complete ✓
- [x] Basic electron-builder build works
- [x] Generates working EXE
- [x] File size reasonable (~300MB or less)

### Phase 2 Complete ✓
- [x] Professional Windows installer
- [x] Proper app integration
- [x] File associations working

### Phase 3 Complete ✓
- [x] Code signing ready
- [x] Auto-updater configured
- [x] Multiple build targets

### Phase 4 Complete ✓
- [x] All tests pass
- [x] Ready for distribution
- [x] Documentation complete

---

## Size Comparison Goals

| Method | Current | Target |
|--------|---------|---------|
| electron-packager | ~500MB | - |
| electron-builder (folder) | - | ~300MB |
| electron-builder (installer) | - | ~150MB |

---

## Troubleshooting Quick Fixes

### Common Issues (each <2 minutes):
- [ ] Build fails → Check node_modules size
- [ ] Icon missing → Verify build/icon.ico exists  
- [ ] Large file size → Add more ignore patterns
- [ ] Installer fails → Check NSIS configuration
- [ ] App won't start → Verify electron main file path

---

## Notes
- Each task designed for <5 minutes execution
- Can pause between phases
- Rollback available via git
- Incremental testing recommended
- Keep electron-packager as fallback until confirmed working