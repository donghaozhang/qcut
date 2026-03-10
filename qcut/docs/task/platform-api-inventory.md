# Platform API Migration Inventory

> Generated: 2026-03-10
> Command: `bun scripts/check-boundaries.ts --platform-audit --no-file-size`

## Summary

| Metric | Value |
|--------|-------|
| Total `window.electronAPI` references | **282** |
| Files with references | **87** |
| Total renderer files scanned | **1161** |

## By File (descending)

| Refs | File | Migration Priority |
|------|------|--------------------|
| 21 | `components/editor/draw/utils/drawing-storage.ts` | High |
| 13 | `stores/pty-terminal-store.ts` | Low (desktop-only) |
| 13 | `lib/claude-bridge/claude-timeline-bridge.ts` | High |
| 12 | `lib/project/zip-manager.ts` | High |
| 12 | `lib/export/export-engine-cli.ts` | High |
| 10 | `components/editor/properties-panel/api-keys-view.tsx` | Medium |
| 10 | `hooks/media/use-elevenlabs-transcription.ts` | Medium |
| 9 | `hooks/use-ai-pipeline.ts` | Medium |
| 8 | `components/editor/media-panel/views/word-timeline/drop-zone.tsx` | Medium |
| 8 | `components/editor/media-panel/views/captions.tsx` | Medium |
| 7 | `stores/gemini-terminal-store.ts` | Medium |
| 6 | `stores/stickers-overlay-store.ts` | Medium |
| 6 | `stores/skills-store.ts` | Low (desktop-only) |
| 6 | `hooks/use-project-folder.ts` | Medium |
| 6 | `hooks/auth/useSignUp.ts` | High |
| 6 | `hooks/auth/useLogin.ts` | High |
| 5 | `stores/moyin/moyin-store.ts` | Medium |
| 5 | `components/update-notification.tsx` | Low (desktop-only) |
| 4 | `components/editor/media-panel/import-skill-dialog.tsx` | Low |
| 4 | `lib/project/release-notes.ts` | Low (desktop-only) |
| 4 | `lib/project/project-folder-sync.ts` | Medium |
| 4 | `lib/ai-video/core/fal-upload.ts` | High |
| 3 | `components/editor/media-panel/views/pty-terminal/terminal-emulator.tsx` | Low (desktop-only) |
| 3 | `lib/claude-bridge/claude-timeline-bridge-helpers.ts` | High |
| 3 | `lib/claude-bridge/claude-transaction-bridge.ts` | High |
| 3 | `lib/ai-clients/fal-ai-client.ts` | High |
| 3 | `lib/export/export-engine-cli-utils.ts` | High |
| 3 | `lib/export/export-engine-cli-audio.ts` | High |
| 3 | `lib/remotion/pre-renderer.ts` | Low |

*Files with 1-2 refs (58 files) omitted for brevity — see full output via audit command.*

## By Namespace

| Refs | Namespace | Web Adapter Strategy |
|------|-----------|---------------------|
| 14 | `storage` | IndexedDB + localStorage |
| 9 | `apiKeys` | Secure cookie/session |
| 9 | `ffmpeg` | WASM (already exists) |
| 7 | `readFile` | File System Access API |
| 7 | `claude` | Direct HTTP or stub |
| 6 | `skills` | Stub (desktop-only) |
| 5 | `projectFolder` | IndexedDB virtual FS |
| 4 | `geminiChat` | Direct API calls |
| 4 | `updates` | Stub (desktop-only) |
| 4 | `shell` | `window.open()` |
| 3 | `pty` | Stub (desktop-only) |
| 3 | `audio` | Blob URLs |
| 3 | `transcribe` | Direct API calls |
| 3 | `fal` | Direct API (CORS permitting) |
| 2 | `sounds` | Direct API calls |
| 2 | `video` | Blob URLs + IndexedDB |

## Migration Waves

### Wave 1 — High-traffic, web-compatible (target: 100+ refs)
Files with high ref counts and capabilities that have clear browser equivalents:
- `drawing-storage.ts` (21) — storage namespace → IndexedDB
- `claude-timeline-bridge.ts` (13) — claude namespace → HTTP adapter
- `zip-manager.ts` (12) — file operations → File System Access API
- `export-engine-cli.ts` (12) — ffmpeg → WASM path
- Auth hooks (12 combined) — license → direct HTTP

### Wave 2 — Medium-traffic, partial support
- API keys, transcription, AI pipeline, media panel views

### Wave 3 — Low-traffic, desktop-only stubs
- PTY, skills, updates, remotion, release notes
