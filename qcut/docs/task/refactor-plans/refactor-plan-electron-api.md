# Refactor Plan: electron-api.ts

**File**: `electron/preload-types/electron-api.ts`
**Current Lines**: 1,164
**Target**: All files under 800 lines

---

## Current Structure

Single `ElectronAPI` interface spanning ~1,080 lines with 26 API domain groups:

| Domain | Lines | Methods |
|--------|-------|---------|
| File operations | 78-101 | 8 methods |
| Storage | 104-110 | 5 methods |
| Theme | 113-118 | 4 methods |
| Sound/Audio/Video | 121-170 | 13 methods |
| Screenshot/Screen recording | 147-170 | 6 methods |
| Transcription | 173-215 | 5 methods |
| FFmpeg export | 218-258 | 11 methods |
| API keys | 261-273 | 4 methods |
| Shell/GitHub | 276-283 | 2 methods |
| FAL AI | 286-306 | 4 methods |
| Gemini chat | 309-319 | 3 methods |
| PTY terminal | 322-351 | 8 methods |
| MCP bridge | 354-359 | 2 methods |
| Skills | 362-382 | 7 methods |
| AI pipeline | 385-449 | 6 methods |
| Media import | 452-464 | 7 methods |
| Project folder | 467-504 | 4 methods |
| **Claude API** | **507-1009** | **~50+ methods (501 lines)** |
| Remotion folder | 1012-1033 | 6 methods |
| Moyin | 1036-1076 | 8 methods |
| Updates | 1079-1122 | 5 methods |
| License | 1125-1150 | 6 methods |

---

## Proposed Split

Split into domain-specific type files composed into the master interface:

```
electron/preload-types/
├── electron-api.ts             (~80 lines)  Master interface + composition
├── api-types/
│   ├── file-storage-api.ts     (~65 lines)  File, storage, theme
│   ├── media-api.ts            (~80 lines)  Sound, audio, video, screenshot, recording
│   ├── transcription-api.ts    (~55 lines)  Transcription, filler analysis
│   ├── ffmpeg-export-api.ts    (~60 lines)  FFmpeg operations
│   ├── ai-services-api.ts      (~90 lines)  API keys, FAL, Gemini
│   ├── terminal-tools-api.ts   (~70 lines)  PTY, shell, GitHub, MCP
│   ├── features-api.ts         (~170 lines) Skills, AI pipeline, media import, project folder
│   ├── claude-timeline-api.ts  (~220 lines) Claude media + timeline operations
│   ├── claude-project-api.ts   (~140 lines) Claude transactions + project
│   ├── claude-ui-api.ts        (~220 lines) Claude analyze, events, navigator, CRUD, UI, state
│   ├── remotion-moyin-api.ts   (~90 lines)  Remotion folder + Moyin
│   └── system-api.ts           (~85 lines)  Updates + license
└── index.ts                    (~10 lines)  Barrel re-export
```

## Estimated Line Counts

| New File | Lines | Content |
|----------|-------|---------|
| `electron-api.ts` | 80 | Master ElectronAPI = intersection of sub-interfaces |
| `file-storage-api.ts` | 65 | FileAPI, StorageAPI, ThemeAPI |
| `media-api.ts` | 80 | SoundAPI, AudioAPI, VideoAPI, ScreenshotAPI, ScreenRecordingAPI |
| `transcription-api.ts` | 55 | TranscribeAPI, analyzeFillers |
| `ffmpeg-export-api.ts` | 60 | FFmpegExportAPI |
| `ai-services-api.ts` | 90 | ApiKeysAPI, FalAPI, GeminiChatAPI |
| `terminal-tools-api.ts` | 70 | PtyAPI, ShellAPI, GitHubAPI, McpAPI |
| `features-api.ts` | 170 | SkillsAPI, AIPipelineAPI, MediaImportAPI, ProjectFolderAPI |
| `claude-timeline-api.ts` | 220 | Claude media + timeline sub-interfaces |
| `claude-project-api.ts` | 140 | Claude transaction + project sub-interfaces |
| `claude-ui-api.ts` | 220 | Claude UI, state, navigator, CRUD, events |
| `remotion-moyin-api.ts` | 90 | RemotionFolderAPI, MoyinAPI |
| `system-api.ts` | 85 | UpdatesAPI, LicenseAPI |
| **Total** | **~1,425** | Includes import/export overhead |

## Migration Steps

1. Create `api-types/` directory
2. Extract each domain interface into its own file
3. Compose master `ElectronAPI` as intersection type: `FileAPI & StorageAPI & ...`
4. Update `electron-api.ts` to import and compose
5. Create barrel `index.ts`
6. Verify no import breakage (type-only changes, no runtime impact)
