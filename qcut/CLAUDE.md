# CLAUDE.md

This file provides guidance to Claude Code when working with QCut.

**Priority**: Long-term maintainability > scalability > performance > short-term gains

## Core Principles
- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

No code file longer than 800 lines, longer consider a new code file

## Commands

| Task | Command |
|------|---------|
| Dev server | `bun dev` |
| Electron dev | `bun run electron:dev` |
| Electron prod | `bun run electron` |
| Build | `bun run build` |
| Lint (clean) | `bun lint:clean` |
| Format | `bun format` |
| Test | `bun run test` |
| Type check | `bun check-types` |
| Release | `bun run release` |
| Pipeline CLI | `bun run pipeline` |
| Dist (macOS) | `bun run dist:mac` |
| Dist (Windows) | `bun run dist:win` |
| E2E tests (visible) | `bun run test:e2e` |
| E2E tests (invisible) | `bun run test:e2e:bg` |

## Project Overview

QCut is a desktop video editor built with **Vite + TanStack Router + Electron**. It uses a monorepo structure with Bun as the package manager.

## Tech Stack

- **Frontend**: Vite, TanStack Router, React, TypeScript
- **Desktop**: Electron with TypeScript IPC handlers
- **State**: Zustand stores
- **Video**: FFmpeg WebAssembly
- **Storage**: Electron IPC → IndexedDB → localStorage fallback
- **Styling**: Tailwind CSS, Radix UI
- **Monorepo**: Turborepo with Bun

See `package.json` for current versions.

## Project Structure

```
qcut/
├── apps/
│   ├── web/src/             # Main Electron renderer app
│   │   ├── routes/          # TanStack Router (primary)
│   │   ├── stores/          # Zustand state management
│   │   ├── components/      # React components
│   │   ├── hooks/           # Custom React hooks
│   │   ├── services/        # Service layer
│   │   ├── lib/             # Utilities and services
│   │   └── types/           # TypeScript type definitions
│   └── transcription/       # Python transcription app
├── packages/
│   ├── auth/                # @qcut/auth
│   ├── db/                  # @qcut/db
│   ├── license-server/      # License management service
│   ├── qagent/              # AI agent orchestration (separate build)
│   └── video-agent-skill/   # Git submodule: AICP source, tests, YAML pipelines
├── electron/                # Electron main process
│   ├── main.ts              # Main process entry
│   ├── preload.ts           # Renderer bridge
│   ├── *-handler.ts         # IPC handlers (22 handler files)
│   ├── claude/              # Claude integration handlers
│   └── native-pipeline/     # TypeScript CLI pipeline (AICP, ViMax)
├── scripts/                 # Build and utility scripts
├── resources/               # Runtime resources (skills, binaries)
├── plugins/                 # Plugins (code-review)
└── docs/                    # Documentation
```

## Key Entry Points

| Area | File |
|------|------|
| Editor | `apps/web/src/routes/editor.$project_id.tsx` |
| Timeline Store | `apps/web/src/stores/timeline-store.ts` |
| AI Video | `apps/web/src/lib/ai-video/index.ts` |
| Electron Main | `electron/main.ts` |
| IPC Handlers | `electron/*-handler.ts` (22 files) |
| Claude HTTP API | `electron/claude/claude-http-server.ts` |
| Native Pipeline CLI | `electron/native-pipeline/cli/cli.ts` |
| Agent Config | `qagent.yaml` |

## Code Standards

- [Accessibility Rules](docs/reference/accessibility-rules.md) - 10 critical a11y rules
- [Code Quality Rules](docs/reference/code-quality-rules.md) - 5 complexity rules
- [Media Panel Reference](docs/technical/media-panel-reference.md) - All 20 editor panels documented

**Core Principles**:
- Write self-documenting code with clear naming
- Add JSDoc for complex functions
- Use `for...of` instead of `forEach`
- Avoid `any` types

## Git Commit Guidelines

**IMPORTANT**:
- DO NOT include "Co-Authored-By: Claude" attribution
- Use conventional commit format: `type: description`
- Keep messages concise

## Architecture Guidelines

### DO
- Use TanStack Router (`src/routes/`) for new features
- Use `VITE_` prefix for client-side env vars
- Use Electron IPC for backend functionality

### DON'T
- Use `process.env` in client code (use `import.meta.env`)
- Add Next.js API routes or features requiring Next.js runtime (use Electron IPC)

### Electron API Best Practices
- Use structured methods: `window.electronAPI.sounds.search()`
- Check availability: `if (window.electronAPI?.sounds)`
- Type definitions: `src/types/electron.d.ts`

## Testing

- **Unit**: Vitest + @testing-library/react — `bun run test`
- **E2E**: Playwright — `bun run test:e2e`
- **Details**: [Testing Guide](docs/reference/testing-guide.md)

## Environment Variables

```bash
# Active — used by Electron handlers and native pipeline
VITE_FAL_API_KEY        # FAL.ai API
GEMINI_API_KEY          # Google Gemini (chat, transcription, Veo/Imagen)
OPENROUTER_API_KEY      # OpenRouter provider routing
ANTHROPIC_API_KEY       # Anthropic Claude API
ELEVENLABS_API_KEY      # ElevenLabs TTS
FREESOUND_API_KEY       # Freesound sound effects
OPENAI_API_KEY          # OpenAI/Sora

# Legacy — defined in apps/web/src/env.ts but not actively used in Electron
DATABASE_URL            # PostgreSQL
BETTER_AUTH_SECRET      # Auth
UPSTASH_REDIS_REST_URL  # Redis
```

## When Working on Features

1. Test both `electron:dev` and `electron` modes
2. Test EXE builds after major changes
3. Ensure FFmpeg paths work in dev and packaged environments
4. Use Electron IPC for all file system operations

## TypeScript Notes

- Compiled JS imports use `.js` extension, not `.ts`
- Runtime directory is `dist/electron/`
- File paths must resolve from compiled location
