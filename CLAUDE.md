# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenCut is a web-based video editor currently built with Next.js 15, in the process of migrating to Vite + TanStack Router + Electron for desktop application. The project uses a monorepo structure with Bun as the package manager.

## Key Architecture

### Tech Stack
- **Frontend**: Next.js 15.4.5 (App Router), React 19, TypeScript
- **State Management**: Zustand stores (editor-store, timeline-store, project-store)
- **Video Processing**: FFmpeg WebAssembly (@ffmpeg/ffmpeg)
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: Better Auth 1.2.7
- **Styling**: Tailwind CSS 4.1.11
- **UI Components**: Radix UI primitives
- **Monorepo**: Turborepo with Bun

### Project Structure
```
OpenCut-main/
├── apps/web/                    # Main Next.js app
├── packages/
│   ├── auth/                    # @opencut/auth
│   └── db/                      # @opencut/db
├── electron/                    # Future Electron files
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
bun dev                  # Next.js dev server (port 3000)
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

## Migration Status: Next.js → Vite + Electron

**Current Status**: Planning phase - codebase is still 100% Next.js

### Migration Plan
1. **Phase 0**: Add Electron to existing Next.js (Priority)
2. **Phase 1**: Audit and remove Next.js dependencies
3. **Phase 2**: Setup Vite with TanStack Router
4. **Phase 3**: Convert routing to hash-based for Electron
5. **Phase 4**: Implement IPC for file access
6. **Phase 5**: Package Windows executable

### Key Migration Files
- `docs/task/vite.md` - Comprehensive technical guide (Chinese)
- `docs/task/task_todo.md` - Detailed task breakdown with file paths

### Migration Considerations
- Use hash routing for Electron file:// protocol
- Convert API routes to IPC handlers
- Ensure relative paths in Vite config (base: './')
- Adapt FFmpeg for Electron environment

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
- `apps/web/src/app/editor/[project_id]/page.tsx` - Main editor entry
- `apps/web/src/stores/timeline-store.ts` - Timeline state logic
- `apps/web/src/lib/ffmpeg-utils.ts` - Video processing
- `apps/web/src/components/editor/timeline/` - Timeline UI components

## Current Limitations
1. No test suite
2. Migration to Electron not started
3. Limited error handling
4. No performance monitoring

## When Working on Migration
1. Always test with `bun dev` before removing Next.js features
2. Check `task_todo.md` for specific file paths
3. Maintain backward compatibility until Phase 1 complete
4. Test Electron packaging after each major change