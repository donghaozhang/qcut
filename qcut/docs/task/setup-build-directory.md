# Build Directory Setup

## Create Output Directory

Before running electron-builder, ensure the output directory exists:

### Option 1: PowerShell
```powershell
# Create directory if it doesn't exist
New-Item -ItemType Directory -Path "d:\AI_play\AI_Code\build_opencut" -Force
```

### Option 2: Command Prompt
```cmd
# Create directory if it doesn't exist
mkdir "d:\AI_play\AI_Code\build_opencut" 2>nul || echo Directory already exists
```

### Option 3: Git Bash
```bash
# Create directory if it doesn't exist
mkdir -p /d/AI_play/AI_Code/build_opencut
```

## Build Output Structure

After running `bun run dist:win`, you'll find:

```
d:/AI_play/AI_Code/build_opencut/
├── QCut Setup 1.0.0.exe              # Main installer (ready to distribute)
├── QCut Setup 1.0.0.exe.blockmap     # Update metadata
├── win-unpacked/                      # Unpacked application
│   ├── QCut.exe                       # Main executable
│   ├── resources/
│   │   └── app.asar                   # Packed app
│   ├── locales/                       # Electron locales
│   └── [various dll files]           # Dependencies
├── builder-debug.yml                  # Build debug info
├── builder-effective-config.yaml     # Effective config used
└── latest.yml                         # Update server metadata
```

## File Sizes Expected

| File | Expected Size |
|------|---------------|
| QCut Setup 1.0.0.exe | ~80-150MB |
| win-unpacked/ folder | ~200-300MB |
| Total build output | ~300-450MB |

## Distribution Files

**For end users:**
- `QCut Setup 1.0.0.exe` - This is what you give to users

**For developers:**
- `win-unpacked/QCut.exe` - For testing without installation
- `latest.yml` - For auto-updater configuration

## Quick Test Commands

```bash
# After build completes, test the installer
cd /d/AI_play/AI_Code/build_opencut
./QCut\ Setup\ 1.0.0.exe

# Or test unpacked version directly
cd win-unpacked
./QCut.exe
```