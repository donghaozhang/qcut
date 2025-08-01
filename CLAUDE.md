# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

QCut is a desktop video editor built with Vite + TanStack Router + Electron. The project has been successfully migrated from Next.js and now runs as a native desktop application. It uses a monorepo structure with Bun as the package manager.

## Key Architecture

### Tech Stack
- **Frontend**: Vite 7.0.6, TanStack Router (Hash History), React 19, TypeScript
- **Desktop**: Electron 37.2.5 with IPC handlers for file operations
- **State Management**: Zustand stores (editor-store, timeline-store, project-store)
- **Video Processing**: FFmpeg WebAssembly (@ffmpeg/ffmpeg)
- **Storage**: Multi-tier system (Electron IPC → IndexedDB → localStorage fallback)
- **Styling**: Tailwind CSS 4.1.11
- **UI Components**: Radix UI primitives
- **Monorepo**: Turborepo with Bun

### Project Structure
```
qcut/
├── apps/web/                    # Main Vite app
├── packages/
│   ├── auth/                    # @opencut/auth
│   └── db/                      # @opencut/db
├── electron/                    # Electron main and preload scripts
└── docs/task/                   # Migration documentation
```

### Core Editor Architecture
- **Timeline System**: Custom implementation in `src/components/editor/timeline/`
- **State Management**: Multiple Zustand stores for separation of concerns
- **Storage**: Abstraction layer supporting IndexedDB and OPFS
- **Media Processing**: Client-side FFmpeg with WebAssembly

## Development Commands

### Root Level
```bash
bun dev          # Start all apps in development
bun build        # Build all packages and apps
bun check-types  # Type checking across workspace
bun lint         # Lint with Ultracite/Biome
bun format       # Format with Ultracite/Biome
```

### Web App (apps/web/)
```bash
bun dev                  # Vite dev server (port 5173)
bun build                # Production build
bun db:generate          # Generate Drizzle migrations
bun db:migrate           # Run database migrations
bun db:push:local        # Push schema to local database
bun lint:fix             # Auto-fix linting issues
```

### Database Setup
```bash
# Docker services required:
docker-compose up -d     # PostgreSQL (5432), Redis (6379)
```

## Electron Build & Distribution

### Development
```bash
bun run electron         # Run Electron app (production mode)
bun run electron:dev     # Run Electron app (development mode)
```

### Building EXE
```bash
# Option 1: Using electron-packager (recommended)
npx electron-packager . QCut --platform=win32 --arch=x64 --out=dist-packager --overwrite

# Option 2: Using electron-builder (if configured)
bun run dist:win
```

### Current Build Status
- ✅ **Fully migrated** from Next.js to Vite + Electron
- ✅ **FFmpeg WebAssembly** working in packaged app
- ✅ **Native file system** access via Electron IPC
- ✅ **Hash routing** implemented for file:// protocol
- ✅ **Windows EXE** builds successfully

## Important Patterns

### State Management
```typescript
// Zustand stores in src/stores/
useEditorStore()    // Main editor state
useTimelineStore()  // Timeline operations
useProjectStore()   // Project management
usePlaybackStore()  // Video playback
```

### Storage Abstraction
```typescript
// src/lib/storage/
StorageService with IndexedDBAdapter or OPFSAdapter
```

### Timeline Components
- `TimelineTrack` - Individual tracks
- `TimelineElement` - Media elements on timeline
- `TimelinePlayhead` - Current position indicator

## Environment Variables
```bash
DATABASE_URL            # PostgreSQL connection
BETTER_AUTH_SECRET      # Authentication
UPSTASH_REDIS_REST_URL  # Redis for rate limiting
MARBLE_WORKSPACE_KEY    # Blog CMS
```

## Code Style
- **Linting**: Biome with Ultracite configuration
- **Many lint rules disabled** - be aware when adding new code
- **Path aliases**: Use `@/` for `src/` imports

## Testing
**⚠️ No testing framework currently configured** - This is a known gap

## Key Files to Understand
- `apps/web/src/routes/editor.$project_id.tsx` - Main editor entry
- `apps/web/src/stores/timeline-store.ts` - Timeline state logic
- `apps/web/src/lib/ffmpeg-utils.ts` - Video processing
- `apps/web/src/components/editor/timeline/` - Timeline UI components

## Current Limitations
1. No test suite
2. Limited error handling
3. No performance monitoring
4. Basic export functionality (needs enhancement)

## When Working on Features
1. Always test both `bun run electron:dev` (development) and `bun run electron` (production)
2. Test EXE builds with `npx electron-packager` after major changes
3. Ensure FFmpeg paths work in both dev and packaged environments
4. Use Electron IPC for all file system operations