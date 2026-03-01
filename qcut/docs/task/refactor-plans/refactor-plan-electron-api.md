# Refactor Plan: electron-api.ts

**File**: `electron/preload-types/electron-api.ts`
**Current size**: 116 lines (listed as 1170 — already refactored)
**Goal**: N/A — already under 800 lines

## Current Structure Analysis

This file has **already been refactored**. It is only 116 lines and serves as the master composition interface for `ElectronAPI`. All domain-specific types have been extracted into the `api-types/` subdirectory:

| Import Source | Types |
|--------------|-------|
| `api-types/file-storage-api` | `FileOpsAPI`, `StorageAPI`, `ThemeAPI` |
| `api-types/media-api` | `SoundAPI`, `AudioAPI`, `VideoAPI`, `ScreenshotAPI`, `ScreenRecordingAPI` |
| `api-types/transcription-api` | `TranscriptionAPI` |
| `api-types/ffmpeg-export-api` | `FFmpegExportAPI` |
| `api-types/ai-services-api` | `ApiKeysAPI`, `ShellAPI`, `GitHubAPI`, `FalAPI`, `GeminiChatAPI` |
| `api-types/terminal-tools-api` | `PtyAPI`, `McpAPI` |
| `api-types/features-api` | `SkillsAPI`, `AIPipelineAPI`, `MediaImportAPI`, `ProjectFolderAPI` |
| `api-types/claude-timeline-api` | `ClaudeMediaAPI`, `ClaudeTimelineAPI` |
| `api-types/claude-project-api` | `ClaudeTransactionAPI`, `ClaudeProjectAPI` |
| `api-types/claude-ui-api` | `ClaudeAnalyzeAPI`, `ClaudeEventsAPI`, + 5 more |
| `api-types/remotion-moyin-api` | `RemotionFolderAPI`, `MoyinAPI` |
| `api-types/system-api` | `UpdatesAPI`, `LicenseAPI` |

The file composes these into the master `ElectronAPI` interface using `extends` and intersection types, plus a `Window` global augmentation.

## Status: ALREADY COMPLETE

No further refactoring needed. The file is well-structured at 116 lines with clean domain separation via the `api-types/` subdirectory.

## Barrel Re-export Strategy

Already in place — `electron-api.ts` IS the barrel, re-exporting the composed `ElectronAPI` type from domain-specific sub-interfaces.
