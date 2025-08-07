# Build Commands Guide for QCut Video Editor

## Overview
This guide covers all available build commands for QCut, from development to production releases.

## Prerequisites

### System Requirements
- **Node.js**: 18+ (recommended: 20+)
- **Bun**: Latest version (package manager)
- **Windows**: For Windows builds (cross-platform builds not configured)
- **Git**: For version control and releases

### Initial Setup
```bash
# Clone the repository
git clone https://github.com/your-org/qcut.git
cd qcut

# Install dependencies
bun install

# Build web application first (required before Electron builds)
bun run build
```

## Available Build Commands

### Development Commands

#### `bun dev`
**Purpose**: Start development servers
**Time**: ~10 seconds
**Output**: Development servers running
```bash
bun dev
# Starts all apps in development mode
# - Web app: http://localhost:5173
# - Electron: Separate process
```

#### `bun run electron:dev`
**Purpose**: Run Electron in development mode
**Time**: ~5 seconds
**Output**: Electron app with hot reload
```bash
bun run electron:dev
# - Loads from localhost:5173
# - DevTools enabled
# - Hot reload for web content
# - No auto-updater
```

#### `bun run electron`
**Purpose**: Run Electron in production mode (from built files)
**Time**: ~3 seconds
**Output**: Production-like Electron app
```bash
bun run electron
# - Loads from dist files
# - Production optimizations
# - Auto-updater disabled (not packaged)
```

### Build Commands (Web Only)

#### `bun run build`
**Purpose**: Build web application only
**Time**: ~30-60 seconds
**Output**: `apps/web/dist/` directory
```bash
bun run build
# Required before any Electron builds
# Creates optimized web bundle
```

### Electron Build Commands

#### `bun run dist:dir`
**Purpose**: Create unpacked Electron app (testing)
**Time**: ~2-3 minutes
**Output**: `d:/AI_play/AI_Code/build_opencut/win-unpacked/`
```bash
bun run dist:dir
# - No installer created
# - Fastest Electron build
# - Good for testing packaging
# - Output: QCut Video Editor.exe in win-unpacked/
```

#### `bun run dist:win:fast`
**Purpose**: Fast Windows installer (minimal compression)
**Time**: ~5-7 minutes
**Output**: Installer + unpacked app
```bash
bun run dist:win:fast
# - Creates Windows installer
# - Minimal compression (larger file)
# - Faster build time
# - Good for testing installer
```

#### `bun run dist:win:unsigned`
**Purpose**: Standard development Windows build
**Time**: ~8-12 minutes
**Output**: Full installer with optimizations
```bash
bun run dist:win:unsigned
# - Full compression and optimizations
# - Complete NSIS installer
# - File associations included
# - No code signing
# - Good for final testing
```

#### `bun run dist:win:release`
**Purpose**: Production release build
**Time**: ~10-15 minutes
**Output**: Production installer with auto-updater metadata
```bash
bun run dist:win:release
# - Maximum optimizations
# - Auto-updater metadata (latest.yml)
# - All production features
# - Ready for GitHub releases
```

### Legacy Command (Fallback)

#### `bun run package:win`
**Purpose**: electron-packager fallback
**Time**: ~3-5 minutes
**Output**: Different output directory
```bash
bun run package:win
# - Uses electron-packager instead of electron-builder
# - Different output location
# - Simpler packaging
# - No installer, just executable
```

## Build Outputs

### File Locations
All electron-builder outputs go to: `d:/AI_play/AI_Code/build_opencut/`

```
d:/AI_play/AI_Code/build_opencut/
├── win-unpacked/                          # Unpacked application
│   ├── QCut Video Editor.exe              # Main executable
│   ├── resources/                         # App resources
│   │   ├── app.asar                       # Packed app files
│   │   └── ffmpeg/                        # FFmpeg binaries
│   └── [electron files]                   # Electron runtime
├── QCut Video Editor Setup 0.1.0.exe      # Windows installer
├── QCut Video Editor Setup 0.1.0.exe.blockmap  # Update metadata
├── latest.yml                             # Auto-updater metadata
└── builder-debug.yml                      # Build debug info
```

### File Sizes (Approximate)
- **Unpacked app**: ~300-400MB
- **Installer**: ~150-180MB (compressed)
- **Fast build installer**: ~200-250MB (less compression)

## Build Process Explained

### Step-by-Step Process
1. **Dependency Installation** (~30s)
   - Installs native dependencies
   - Rebuilds for Electron
   
2. **Web Bundle** (if not built)
   - Vite builds React app
   - Optimizes assets
   
3. **Electron Packaging** (~2-5min)
   - Copies web dist
   - Includes Electron runtime
   - Applies file exclusions
   - Creates ASAR archive
   
4. **Installer Creation** (~3-8min)
   - NSIS installer generation
   - Compression (varies by command)
   - File associations setup
   - Shortcut creation
   
5. **Metadata Generation**
   - Auto-updater files
   - Checksums
   - Debug information

## Performance Tips

### Speed Up Builds
```bash
# 1. Use fast build for testing
bun run dist:win:fast

# 2. Use dir-only for quick packaging tests
bun run dist:dir

# 3. Keep web build updated
bun run build  # Run before Electron builds
```

### Reduce Build Time
- **Clean old builds**: Delete old dist folders
- **Close other apps**: Free up system resources  
- **Use SSD**: Faster disk I/O
- **More RAM**: Helps with compression

### Troubleshooting Slow Builds

**If builds take >15 minutes:**
```bash
# Check disk space
dir "d:/AI_play/AI_Code/build_opencut"

# Clean old builds
rmdir /s "d:/AI_play/AI_Code/build_opencut/win-unpacked"

# Use faster build
bun run dist:win:fast
```

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Build Release
on:
  push:
    tags: ['v*']

jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      
      - name: Install dependencies
        run: bun install
        
      - name: Build web app
        run: bun run build
        
      - name: Build Electron app
        run: bun run dist:win:release
        
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: QCut-Windows
          path: d:/AI_play/AI_Code/build_opencut/*.exe
```

## Environment Variables

### Optional Configuration
```env
# Build output directory (default: d:/AI_play/AI_Code/build_opencut)
ELECTRON_BUILDER_OUTPUT_DIR=custom/output/path

# Enable/disable auto-updater (default: enabled in packaged builds)
DISABLE_AUTO_UPDATER=true

# Build compression level (store|normal|maximum)
COMPRESSION_LEVEL=maximum

# Debug electron-builder
DEBUG=electron-builder
```

## Common Issues & Solutions

### Build Fails

**"FFmpeg not found"**
```bash
# Ensure web build is current
bun run build

# Check FFmpeg resources exist
ls apps/web/dist/ffmpeg/
```

**"Out of memory"**
```bash
# Use fast build (less compression)
bun run dist:win:fast

# Close other applications
# Add more RAM if possible
```

**"Permission denied"**
```bash
# Run as Administrator
# Check antivirus isn't blocking
# Ensure output directory is writable
```

### Build Succeeds but App Won't Run

**"Application failed to start"**
- Check antivirus quarantine
- Run from unpacked folder first: `win-unpacked/QCut Video Editor.exe`
- Check Windows event logs

**"FFmpeg errors in built app"**
- This is a known issue (documented)
- FFmpeg paths need adjustment for installed version
- App still functions for most features

## Quick Reference

### Most Common Commands
```bash
# Daily development
bun run electron:dev

# Test packaging
bun run dist:dir

# Test installer  
bun run dist:win:fast

# Production release
bun run dist:win:release
```

### File Sizes
| Command | Time | Installer Size | Use Case |
|---------|------|----------------|----------|
| `dist:dir` | 2-3min | No installer | Testing |
| `dist:win:fast` | 5-7min | ~200MB | Quick testing |
| `dist:win:unsigned` | 8-12min | ~150MB | Full testing |
| `dist:win:release` | 10-15min | ~150MB | Production |

### Output Locations
- **Development**: `apps/web/dist/` (web build)
- **Electron builds**: `d:/AI_play/AI_Code/build_opencut/`
- **Executables**: `win-unpacked/QCut Video Editor.exe`
- **Installers**: `QCut Video Editor Setup 0.1.0.exe`

---

**💡 Pro Tips:**
- Always run `bun run build` before Electron builds
- Use `dist:win:fast` for iterative testing
- Use `dist:dir` for quick packaging verification  
- Reserve `dist:win:release` for actual releases
- Keep output directory clean for faster builds