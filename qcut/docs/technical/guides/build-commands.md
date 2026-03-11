# QCut Build Commands Guide

**Last Updated:** 2026-03-11
**Current Version:** 2026.03.11.1 (date-based versioning)

## Prerequisites
```bash
git clone https://github.com/Quriosity-agent/qcut.git
cd qcut
bun install
bun run build  # Required before Electron builds
```

## Quick Reference

### Development
```bash
bun dev                 # Start dev servers (Turborepo)
bun run electron:dev    # Electron with hot reload
bun run electron        # Electron production mode
```

### Build Windows EXE
```bash
bun run dist:dir          # Fast - unpacked app (2-3min)
bun run dist:win:fast     # Fast - installer (5-7min)
bun run dist:win:release  # Production - installer (10-15min)
bun run build:exe         # Alternative packaging (5-8min)
```

### Build macOS (on macOS only)
```bash
bun run dist:mac          # Build .dmg and .zip for macOS
```

### Build Linux (on Linux only)
```bash
bun run dist:linux        # Build AppImage and .deb for Linux
```

### Build All Platforms (CI/CD)
```bash
bun run dist:all          # Build for Windows, macOS, and Linux
```

### Code Quality
```bash
bun lint:clean    # Clean linting (recommended)
bun format        # Auto-fix formatting
bun check-types   # TypeScript type checking
```

### Testing
```bash
# Unit Tests (apps/web)
cd apps/web
bun run test              # Run Vitest tests
bun run test:ui           # Vitest with UI
bun run test:coverage     # Coverage report
bun run test:watch        # Watch mode

# E2E Tests (root)
bun run test:e2e          # Playwright tests
bun run test:e2e:ui       # Playwright with UI
bun run test:e2e:headed   # Headed browser mode
bun run test:e2e:workflow # Project workflow tests
bun run test:e2e:record   # Run all E2E tests and collect videos
bun run test:e2e:combine  # Combine E2E videos
```

### Electron TypeScript
```bash
bun run build:electron        # Compile electron/*.ts to dist/electron/*.js
bun run build:electron:watch  # Watch mode for development
```

### Database (apps/web)
```bash
cd apps/web
bun run db:generate     # Generate Drizzle migrations
bun run db:migrate      # Run migrations
bun run db:push:local   # Push to local DB (development)
bun run db:push:prod    # Push to production DB
```

### Release Management
```bash
bun run release           # Date-based version (2026.02.15.1, .2, .3...)
bun run release:alpha     # Alpha prerelease (2026.02.15.1-alpha.1)
bun run release:beta      # Beta prerelease (2026.02.15.1-beta.1)
bun run release:rc        # Release candidate (2026.02.15.1-rc.1)
bun run release:promote   # Promote prerelease to stable
```

## Build Commands Details

| Command | Time | Output | Size | Use Case |
|---------|------|--------|------|----------|
| `dist:dir` | 2-3min | Unpacked app | ~300MB | Quick testing |
| `dist:win:fast` | 5-7min | Installer | ~200MB | Fast installer |
| `dist:win:release` | 10-15min | Installer + metadata | ~150MB | Production |
| `build:exe` | 5-8min | Alternative exe | ~300MB | Electron-packager |

## Output Locations
- **Electron-builder**: `dist-electron/`
  - **Windows**: `win-unpacked/QCut AI Video Editor.exe`, `QCut-AI-Video-Editor-Setup-*.exe`
  - **macOS**: `mac/QCut AI Video Editor.app`, `QCut-AI-Video-Editor-*.dmg`
  - **Linux**: `linux-unpacked/`, `QCut-AI-Video-Editor-*.AppImage`, `*.deb`
- **Alternative (electron-packager)**: `dist-packager-new/QCut-win32-x64/QCut.exe`

## All Available Scripts

### Root Level (`qcut/package.json`)
| Script | Description |
|--------|-------------|
| `dev` | Start all apps in development (Turborepo) |
| `build` | Build all packages and apps |
| `check-types` | TypeScript type checking across workspace |
| `lint` | Run Ultracite linting |
| `lint:clean` | Run Biome linting (skips parse errors) |
| `format` | Auto-fix formatting with Ultracite |
| `electron` | Run Electron in production mode |
| `electron:dev` | Run Electron in development mode |
| `build:electron` | Compile Electron TypeScript |
| `build:electron:watch` | Watch mode for Electron TypeScript |
| `compile-afterpack` | Build afterPack script for electron-builder |
| `dist` | Build with electron-builder |
| `dist:dir` | Build unpacked directory |
| `dist:win` | Build Windows installer |
| `dist:win:fast` | Fast Windows build (store compression) |
| `dist:win:release` | Production Windows build |
| `dist:win:unsigned` | Unsigned Windows build |
| `dist:mac` | Build macOS .dmg and .zip |
| `dist:linux` | Build Linux AppImage and .deb |
| `dist:all` | Build for all platforms |
| `build:exe` | Build + package with electron-packager |
| `setup-ffmpeg` | Copy FFmpeg WASM files to public |
| `copy-ffmpeg` | Copy FFmpeg for packaged builds |
| `stage-ffmpeg-binaries` | Stage native FFmpeg binaries for packaging |
| `stage-aicp-binaries` | Stage AICP binaries for packaging |
| `stage:all-binaries` | Stage both FFmpeg and AICP binaries |
| `verify:packaged-ffmpeg` | Verify FFmpeg binaries in packaged build |
| `verify:packaged-aicp` | Verify AICP binaries in packaged build |
| `sync-skills` | Synchronize skills to resources |
| `check:circular` | Check for circular dependencies with madge |
| `release` | Date-based version bump + release |
| `release:alpha` | Alpha prerelease version |
| `release:beta` | Beta prerelease version |
| `release:rc` | Release candidate version |
| `release:promote` | Promote prerelease to stable |
| `test` | Run Vitest unit tests (apps/web) |
| `test:e2e` | Run Playwright E2E tests |
| `test:e2e:ui` | Playwright with interactive UI |
| `test:e2e:headed` | Playwright in headed mode |
| `test:e2e:workflow` | Run project workflow tests |
| `test:e2e:record` | Run all E2E tests and collect videos |
| `test:e2e:combine` | Combine E2E test videos |
| `pipeline` | Run native pipeline CLI |
| `aicp:install` | Install AICP Python package (editable) |
| `aicp:test` | Run AICP Python tests |
| `aicp:list-models` | List available AICP models |
| `submodule:init` | Initialize git submodules |
| `submodule:update` | Update git submodules to latest remote |
| `qagent:build` | Build QAgent packages |
| `qagent:init` | Install and build QAgent |
| `qagent:setup` | Setup QAgent (alias for qagent:init) |
| `dev:web` | Start web app dev server only |
| `build:web` | Build web app only |
| `electron:prod` | Run Electron in production mode (alias) |
| `postinstall` | Post-install hook |
| `predev` | Pre-dev hook |
| `prebuild` | Pre-build hook |
| `package:win` | Package Windows build |
| `test:submodule:nexusai` | Test NexusAI submodule |
| `test:website:payments` | Test website payments |
| `test:payments` | Test payments |
| `test:e2e:bg` | Run E2E tests in background (headless) |
| `test:e2e:visual` | Run visual regression E2E tests |
| `test:e2e:visual:update` | Update visual regression snapshots |
| `check-boundaries` | Check Electron boundary violations |
| `./scripts/ipad-cli.sh` | iPad Simulator CLI (play, pause, export, state, eval) |

### Web App (`apps/web/package.json`)
| Script | Description |
|--------|-------------|
| `dev` | Start Vite dev server |
| `build` | Build for production |
| `build:electron` | Build for Electron |
| `preview` | Preview production build |
| `lint` | Biome check |
| `lint:fix` | Biome check with auto-fix |
| `format` | Biome format |
| `test` | Run Vitest |
| `test:ui` | Vitest with UI |
| `test:coverage` | Coverage report |
| `test:watch` | Watch mode tests |
| `test:ui:dev` | UI + watch mode |
| `db:generate` | Generate Drizzle migrations |
| `db:migrate` | Run migrations |
| `db:push:local` | Push to local database |
| `db:push:prod` | Push to production database |

## Common Issues

**Build fails**: Ensure `bun run build` completed successfully first

**Out of memory**: Use `bun run dist:win:fast` (less compression)

**App won't start**: Check antivirus, try unpacked version first

**FFmpeg errors**: Known issue in packaged builds, most features still work

**TypeScript errors in Electron**: Run `bun run build:electron` to compile

## Recommended Workflow

### Development
1. `bun install` - Install dependencies
2. `bun run build:electron` - Compile Electron TypeScript
3. `bun run electron:dev` - Start development

### Testing
1. `cd apps/web && bun run test` - Run unit tests
2. `bun run test:e2e` - Run E2E tests
3. `bun run dist:dir` - Test packaging

### Production Release
1. `bun run test:e2e` - Verify E2E tests pass
2. `bun run release` - Bump version
3. `bun run dist:win:release` - Build production installer

## Environment Variables (Optional)
```env
ELECTRON_BUILDER_OUTPUT_DIR=custom/path    # Custom output directory
DISABLE_AUTO_UPDATER=true                  # Disable auto-updater
DEBUG=electron-builder                     # Debug builds
NODE_ENV=development                       # Development mode
```

## Tech Stack Versions
- **Bun**: 1.3.10
- **Electron**: ^40.6.0
- **Turbo**: ^2.8.10
- **Vite**: ^7.3.1
- **TypeScript**: ^5.9.3
- **Vitest**: ^4.0.0
- **Playwright**: ^1.58.2
