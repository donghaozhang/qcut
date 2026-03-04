# project.json Schema — Agent-Readable Project State

**Status**: P0 DONE — Phases 1 & 2 implemented
**Branch**: `json`
**Date**: 2026-03-04

## Goal

Define a `project.json` schema that agents can read/write to understand QCut project state. Two modes: **Minimal** (~200 tokens) for quick orientation and **Full** (~2000 tokens) for complete state awareness.

---

## 1. TypeScript Interfaces

### ProjectJSON — Full Schema

```typescript
interface ProjectJSON {
  /** Schema version for forward compatibility */
  version: "1.0";

  /** UUID from project-store */
  projectId: string;

  /** User-defined project name */
  name: string;

  /** ISO 8601 timestamps */
  createdAt: string;
  updatedAt: string;

  /** Canvas and render settings */
  settings: ProjectSettings;

  /** Imported media assets */
  media: MediaEntry[];

  /** Subtitle/caption files */
  subtitles: SubtitleEntry[];

  /** AI-generated assets */
  generated: GeneratedEntry[];

  /** Export history */
  exports: ExportEntry[];

  /** Active/recent pipeline jobs */
  jobs: JobEntry[];

  /** API key availability (never exposes actual keys) */
  apiKeys: ApiKeyStatus;
}

interface ProjectSettings {
  /** Canvas dimensions in pixels */
  width: number;
  height: number;

  /** Frames per second (default: 30) */
  fps: number;

  /** Display aspect ratio, e.g. "16:9" */
  aspectRatio: string;

  /** Canvas background color (hex) */
  backgroundColor: string;

  /** Background mode */
  backgroundType: "color" | "blur";

  /** Default output format */
  outputFormat: "mp4" | "webm" | "mov";

  /** Output quality preset */
  outputQuality: "1080p" | "720p" | "480p";

  /** Track and element counts (read-only summary) */
  trackCount: number;
  elementCount: number;
  totalDuration: number;
}

interface MediaEntry {
  id: string;
  type: "video" | "audio" | "image";
  name: string;
  path: string;
  duration: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  importedAt: string;
}

interface SubtitleEntry {
  id: string;
  mediaId: string;
  path: string;
  language: string;
  wordCount: number;
  generatedAt: string;
}

interface GeneratedEntry {
  id: string;
  type: "image" | "video" | "audio" | "music" | "voiceover";
  model: string;
  prompt: string;
  path: string;
  cost: number | null;
  generatedAt: string;
}

interface ExportEntry {
  id: string;
  path: string;
  preset: string;
  format: string;
  width: number;
  height: number;
  size: number;
  duration: number;
  exportedAt: string;
}

interface JobEntry {
  jobId: string;
  command: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}

interface ApiKeyStatus {
  fal: boolean;
  elevenlabs: boolean;
  openrouter: boolean;
  gemini: boolean;
  anthropic: boolean;
  openai: boolean;
  freesound: boolean;
}
```

### ProjectJSONMinimal — Compact Schema (~200 tokens)

```typescript
interface ProjectJSONMinimal {
  version: "1.0";
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;

  settings: {
    width: number;
    height: number;
    fps: number;
    aspectRatio: string;
    outputFormat: string;
  };

  /** Counts only — no item details */
  counts: {
    media: { video: number; audio: number; image: number };
    subtitles: number;
    generated: number;
    tracks: number;
    elements: number;
  };

  totalDuration: number;
  lastExport: {
    path: string;
    exportedAt: string;
  } | null;

  apiKeys: ApiKeyStatus;
}
```

---

## 2. JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://qcut.app/schemas/project.json",
  "title": "QCut Project JSON",
  "description": "Agent-readable project state for QCut editor",
  "type": "object",
  "required": ["version", "projectId", "name", "createdAt", "updatedAt", "settings"],
  "properties": {
    "version": { "const": "1.0" },
    "projectId": { "type": "string", "format": "uuid" },
    "name": { "type": "string", "minLength": 1 },
    "createdAt": { "type": "string", "format": "date-time" },
    "updatedAt": { "type": "string", "format": "date-time" },
    "settings": {
      "type": "object",
      "required": ["width", "height", "fps", "aspectRatio"],
      "properties": {
        "width": { "type": "integer", "minimum": 1 },
        "height": { "type": "integer", "minimum": 1 },
        "fps": { "type": "integer", "minimum": 1, "maximum": 120 },
        "aspectRatio": { "type": "string", "pattern": "^\\d+:\\d+$" },
        "backgroundColor": { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$" },
        "backgroundType": { "enum": ["color", "blur"] },
        "outputFormat": { "enum": ["mp4", "webm", "mov"] },
        "outputQuality": { "enum": ["1080p", "720p", "480p"] },
        "trackCount": { "type": "integer", "minimum": 0 },
        "elementCount": { "type": "integer", "minimum": 0 },
        "totalDuration": { "type": "number", "minimum": 0 }
      }
    },
    "media": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "type", "name", "path", "importedAt"],
        "properties": {
          "id": { "type": "string" },
          "type": { "enum": ["video", "audio", "image"] },
          "name": { "type": "string" },
          "path": { "type": "string" },
          "duration": { "type": ["number", "null"] },
          "width": { "type": ["integer", "null"] },
          "height": { "type": ["integer", "null"] },
          "fps": { "type": ["number", "null"] },
          "importedAt": { "type": "string", "format": "date-time" }
        }
      }
    },
    "subtitles": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "mediaId", "path", "language", "wordCount", "generatedAt"],
        "properties": {
          "id": { "type": "string" },
          "mediaId": { "type": "string" },
          "path": { "type": "string" },
          "language": { "type": "string" },
          "wordCount": { "type": "integer", "minimum": 0 },
          "generatedAt": { "type": "string", "format": "date-time" }
        }
      }
    },
    "generated": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "type", "model", "prompt", "path", "generatedAt"],
        "properties": {
          "id": { "type": "string" },
          "type": { "enum": ["image", "video", "audio", "music", "voiceover"] },
          "model": { "type": "string" },
          "prompt": { "type": "string" },
          "path": { "type": "string" },
          "cost": { "type": ["number", "null"] },
          "generatedAt": { "type": "string", "format": "date-time" }
        }
      }
    },
    "exports": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "path", "preset", "format", "exportedAt"],
        "properties": {
          "id": { "type": "string" },
          "path": { "type": "string" },
          "preset": { "type": "string" },
          "format": { "type": "string" },
          "width": { "type": "integer" },
          "height": { "type": "integer" },
          "size": { "type": "integer" },
          "duration": { "type": "number" },
          "exportedAt": { "type": "string", "format": "date-time" }
        }
      }
    },
    "jobs": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["jobId", "command", "status", "startedAt"],
        "properties": {
          "jobId": { "type": "string" },
          "command": { "type": "string" },
          "status": { "enum": ["pending", "running", "completed", "failed"] },
          "startedAt": { "type": "string", "format": "date-time" },
          "completedAt": { "type": ["string", "null"], "format": "date-time" },
          "error": { "type": ["string", "null"] }
        }
      }
    },
    "apiKeys": {
      "type": "object",
      "properties": {
        "fal": { "type": "boolean" },
        "elevenlabs": { "type": "boolean" },
        "openrouter": { "type": "boolean" },
        "gemini": { "type": "boolean" },
        "anthropic": { "type": "boolean" },
        "openai": { "type": "boolean" },
        "freesound": { "type": "boolean" }
      }
    }
  }
}
```

---

## 3. Minimal vs Full Modes

### Minimal (~200 tokens)

Returns a compact summary — enough for an agent to orient itself.

```json
{
  "version": "1.0",
  "projectId": "abc-123",
  "name": "My Video",
  "createdAt": "2026-03-01T10:00:00Z",
  "updatedAt": "2026-03-04T15:30:00Z",
  "settings": {
    "width": 1920,
    "height": 1080,
    "fps": 30,
    "aspectRatio": "16:9",
    "outputFormat": "mp4"
  },
  "counts": {
    "media": { "video": 3, "audio": 1, "image": 5 },
    "subtitles": 2,
    "generated": 4,
    "tracks": 5,
    "elements": 12
  },
  "totalDuration": 127.5,
  "lastExport": {
    "path": "C:/Users/user/Videos/output.mp4",
    "exportedAt": "2026-03-04T14:00:00Z"
  },
  "apiKeys": {
    "fal": true,
    "elevenlabs": true,
    "openrouter": true,
    "gemini": true,
    "anthropic": true,
    "openai": false,
    "freesound": false
  }
}
```

### Full (~2000 tokens)

Returns all arrays populated with complete entries. Same example with media/subtitles/generated/exports/jobs arrays filled out (as shown in the TypeScript interfaces above).

### When to use which

| Scenario | Mode | Why |
|----------|------|-----|
| Agent starts new session | Minimal | Quick orientation, low token cost |
| Agent needs to find a specific media file | Full | Needs media[] paths and IDs |
| Agent checking if export is needed | Minimal | lastExport + totalDuration suffices |
| Agent resuming multi-step workflow | Full | Needs jobs[] to check pending work |
| Agent deciding what to generate | Full | Needs generated[] to avoid duplicates |
| Context window is tight | Minimal | ~10x fewer tokens |

---

## 4. CLI Integration

### New Commands

```
editor:project:info --json                → returns ProjectJSONMinimal
editor:project:info --json --full         → returns ProjectJSON (full)
editor:project:export-state               → dumps full ProjectJSON to file on disk
editor:project:import-state --data <file> → loads ProjectJSON into editor
```

### Implementation Details

#### `editor:project:info --json`

Aggregates data from multiple sources in a single call:

```typescript
// In cli-handlers-editor.ts or editor-handlers-media.ts
async function handleProjectInfo(client: EditorApiClient, opts: CLIRunOptions): Promise<CLIResult> {
  const projectId = opts.projectId;
  const isFull = opts.flags?.full === true;

  // Parallel fetch from existing endpoints
  const [settings, stats, media, timeline] = await Promise.all([
    client.get(`/api/claude/project/${projectId}/settings`),
    client.get(`/api/claude/project/${projectId}/stats`),
    isFull ? client.get(`/api/claude/media/${projectId}/list`) : null,
    isFull ? client.post("/api/claude/timeline/export", {}) : null,
  ]);

  if (!isFull) {
    // Return ProjectJSONMinimal
    return {
      success: true,
      data: {
        version: "1.0",
        projectId,
        name: settings.name,
        createdAt: settings.createdAt ?? new Date().toISOString(),
        updatedAt: settings.updatedAt ?? new Date().toISOString(),
        settings: {
          width: settings.width,
          height: settings.height,
          fps: settings.fps,
          aspectRatio: settings.aspectRatio,
          outputFormat: settings.exportFormat,
        },
        counts: {
          media: stats.mediaCount,
          subtitles: 0, // TODO: wire up caption count
          generated: 0, // TODO: wire up generated count
          tracks: stats.trackCount,
          elements: stats.elementCount,
        },
        totalDuration: stats.totalDuration,
        lastExport: null, // TODO: wire up export history
        apiKeys: getApiKeyStatus(),
      },
    };
  }

  // Return full ProjectJSON
  return {
    success: true,
    data: buildFullProjectJSON(projectId, settings, stats, media, timeline),
  };
}
```

#### `editor:project:export-state`

Writes the full `ProjectJSON` to `<projectDir>/project.json`:

```typescript
async function handleProjectExportState(client, opts): Promise<CLIResult> {
  const fullState = await buildFullProjectJSON(/* ... */);
  const outputPath = path.join(getProjectPath(opts.projectId), "project.json");
  await fs.writeFile(outputPath, JSON.stringify(fullState, null, 2));
  return { success: true, data: { path: outputPath, size: JSON.stringify(fullState).length } };
}
```

#### `editor:project:import-state`

Reads `project.json` and applies settings/media back to the editor:

```typescript
async function handleProjectImportState(client, opts): Promise<CLIResult> {
  const data = await resolveJsonInput(opts.data);
  // Validate against schema
  // Apply settings via PATCH /api/claude/project/:id/settings
  // Import missing media via /api/claude/media/:id/import
  // Restore timeline if included
  return { success: true, data: { imported: true, projectId: data.projectId } };
}
```

### Command Registry Additions

```typescript
// In command-registry-editor.ts
"editor:project:info": ed("editor:project:info", "Get project info as JSON", [
  PID,
  f("--full", "boolean", "Include all arrays (media, subtitles, generated, exports, jobs)", { default: false }),
]),

"editor:project:export-state": ed("editor:project:export-state", "Dump full project.json to disk", [PID]),

"editor:project:import-state": ed("editor:project:import-state", "Load project.json into editor", [
  PID,
  DATA_REQ,
]),
```

---

## 5. Mapping to Existing QCut Data

### Field Source Map

| project.json field | Source | Exists? | Notes |
|--------------------|--------|---------|-------|
| `version` | Hardcoded | New | Always `"1.0"` |
| `projectId` | `project-store.ts` → `TProject.id` | Yes | UUID from store |
| `name` | `project-store.ts` → `TProject.name` | Yes | Also in settings JSON on disk |
| `createdAt` | `project-store.ts` → `TProject.createdAt` | Yes | Stored as Date, serialize to ISO |
| `updatedAt` | `project-store.ts` → `TProject.updatedAt` | Yes | Updated on save |
| `settings.width` | `TProject.canvasSize.width` | Yes | Via `getProjectSettings()` |
| `settings.height` | `TProject.canvasSize.height` | Yes | Via `getProjectSettings()` |
| `settings.fps` | `TProject.fps` | Yes | Default 30 |
| `settings.aspectRatio` | Computed from width:height | Yes | `getProjectSettings()` already computes |
| `settings.backgroundColor` | `TProject.backgroundColor` | Yes | Default `#000000` |
| `settings.backgroundType` | `TProject.backgroundType` | Yes | `"color"` or `"blur"` |
| `settings.outputFormat` | `project.exportFormat` on disk | Yes | `getProjectSettings()` |
| `settings.outputQuality` | `project.exportQuality` on disk | Yes | `getProjectSettings()` |
| `settings.trackCount` | `ProjectStats.trackCount` | Yes | Via renderer IPC stats |
| `settings.elementCount` | `ProjectStats.elementCount` | Yes | Via renderer IPC stats |
| `settings.totalDuration` | `ProjectStats.totalDuration` | Yes | Via renderer IPC stats |
| `media[].id` | `MediaItem.id` | Yes | UUID from media-store |
| `media[].type` | `MediaItem.type` | Yes | `"video"`, `"audio"`, `"image"` |
| `media[].name` | `MediaItem.name` | Yes | Display name |
| `media[].path` | `MediaItem.localPath` | Yes | Absolute disk path |
| `media[].duration` | `MediaItem.duration` | Yes | Seconds, null for images |
| `media[].width` | `MediaItem.width` | Yes | Pixels |
| `media[].height` | `MediaItem.height` | Yes | Pixels |
| `media[].fps` | `MediaItem.fps` | Yes | null for images/audio |
| `media[].importedAt` | `MediaItem.importMetadata` | Partial | Needs timestamp added |
| `subtitles[]` | Caption elements in timeline | Partial | Need to extract from CaptionElement entries |
| `subtitles[].mediaId` | CaptionElement association | New | Need to link captions → source media |
| `subtitles[].path` | SRT/VTT file path | New | Need to track subtitle file location |
| `subtitles[].wordCount` | Count from caption text | New | Compute from CaptionElement.text |
| `generated[].id` | `MediaItem.id` where `metadata.source` is AI | Partial | Filter by metadata.source |
| `generated[].type` | Inferred from MediaItem.type + source | Partial | Need model/prompt tracking |
| `generated[].model` | Not currently stored | New | Add to MediaItem.metadata |
| `generated[].prompt` | Not currently stored | New | Add to MediaItem.metadata |
| `generated[].cost` | Not currently stored | New | Add to MediaItem.metadata |
| `exports[]` | `ExportStore.exportHistory` | Yes | `ExportHistoryEntry` has all fields |
| `exports[].size` | `ExportHistoryEntry.fileSize` | Yes | Bytes |
| `jobs[]` | Pipeline CLI job tracking | Partial | Need centralized job registry |
| `jobs[].status` | CLI progress callbacks | Partial | Currently ephemeral, needs persistence |
| `apiKeys.*` | `process.env.*_API_KEY` | Yes | Check `!!process.env.VITE_FAL_API_KEY` etc. |

### What Already Exists vs What Needs New Code

**Already exists — just needs aggregation:**
- Project metadata (id, name, dates, settings) — `getProjectSettings()` + `project-store`
- Media list — `media-store` via `/api/claude/media/:id/list`
- Export history — `export-store.exportHistory`
- Project stats (tracks, elements, duration) — `getProjectStats()` via IPC
- API key presence — environment variable checks
- Timeline data — `/api/claude/timeline/export`

**Needs new code:**
- `subtitles[]` — Scan CaptionElement entries from timeline, extract metadata
- `generated[].model/prompt/cost` — Extend `MediaItem.metadata` to store AI generation details
- `jobs[]` persistence — Currently jobs are ephemeral in CLI; need a lightweight job log
- `media[].importedAt` — Add import timestamp to `MediaImportMetadata`
- Aggregation endpoint — New handler that combines all sources into one response

---

## 6. Agent Workflow Examples

### Example 1: Agent Discovers Project State

```bash
# Agent starts, uses L1 help to discover commands
qcut-pipeline help --json
# → Returns command categories including "editor" with "project" module

# Agent gets project overview (minimal — ~200 tokens)
qcut-pipeline editor:project:info --project-id abc-123 --json
# → Returns ProjectJSONMinimal with settings, counts, apiKeys

# Agent now knows:
# - Project is 1920x1080 @ 30fps
# - Has 3 videos, 1 audio, 5 images
# - FAL and ElevenLabs keys are available
# - Last export was 2 hours ago
```

### Example 2: Agent Builds a Video from Scratch

```bash
# 1. Create project
qcut-pipeline editor:project:create --new-name "Product Demo" --json

# 2. Import media
qcut-pipeline editor:media:import --project-id <id> --source /path/to/clip.mp4 --json

# 3. Generate AI voiceover (knows elevenlabs key is available from project.json)
qcut-pipeline editor:generate:voiceover --project-id <id> --data '{"text":"Welcome..."}' --json

# 4. Check full state to verify everything landed
qcut-pipeline editor:project:info --project-id <id> --json --full
# → media[] shows clip.mp4 + voiceover.mp3
# → generated[] shows the voiceover with model/prompt/cost

# 5. Export
qcut-pipeline editor:export:start --project-id <id> --json --poll
```

### Example 3: Agent Resumes Work Next Session

```bash
# Agent reads project.json to recall state
qcut-pipeline editor:project:info --project-id abc-123 --json --full

# Sees in jobs[]:
#   { jobId: "j-99", command: "editor:generate:image", status: "failed", error: "FAL timeout" }

# Agent retries the failed job
qcut-pipeline editor:generate:image --project-id abc-123 --data '{"prompt":"..."}' --json

# Checks generated[] to confirm new image appeared
qcut-pipeline editor:project:info --project-id abc-123 --json --full
```

### Example 4: Agent Exports State for Backup/Transfer

```bash
# Dump full state to file
qcut-pipeline editor:project:export-state --project-id abc-123 --json
# → { path: "C:/Users/.../projects/abc-123/project.json", size: 4200 }

# Later, on another machine or after reset:
qcut-pipeline editor:project:import-state --project-id abc-123 --data @project.json --json
# → Restores settings, re-imports media, rebuilds timeline
```

---

## 7. Implementation Plan

### Phase 1: Minimal project.json (effort: ~3 hours)

Build the `editor:project:info --json` command returning `ProjectJSONMinimal`.

| Step | File | Work |
|------|------|------|
| 1a | `command-registry-editor.ts` | Add `--full` flag to `editor:project:info` |
| 1b | `editor-handlers-media.ts` | Add `handleProjectInfo()` — aggregates settings + stats |
| 1c | `claude-project-handler.ts` | Add `getApiKeyStatus()` helper |
| 1d | `cli-handlers-editor.ts` | Wire `project:info` action to new handler |

**Deliverable**: `qcut-pipeline editor:project:info --project-id <id> --json` returns minimal JSON.

### Phase 2: Full project.json (effort: ~5 hours)

Extend to return full `ProjectJSON` with all arrays populated.

| Step | File | Work |
|------|------|------|
| 2a | `editor-handlers-media.ts` | Build `buildFullProjectJSON()` aggregation function |
| 2b | `media-store-types.ts` | Extend `MediaImportMetadata` with `importedAt` timestamp |
| 2c | `media-store.ts` | Populate `importedAt` on media add |
| 2d | `editor-handlers-media.ts` | Extract subtitles from CaptionElement timeline data |
| 2e | `editor-handlers-media.ts` | Filter generated[] from media items with AI metadata |
| 2f | `export-store.ts` | Expose export history via IPC/HTTP endpoint |

**Deliverable**: `qcut-pipeline editor:project:info --project-id <id> --json --full` returns complete JSON.

### Phase 3: AI generation metadata (effort: ~3 hours)

Track model, prompt, and cost on generated assets.

| Step | File | Work |
|------|------|------|
| 3a | `media-store-types.ts` | Add `generationMeta` to `MediaItem.metadata` |
| 3b | AI generation handlers | Populate `generationMeta` when creating AI media |
| 3c | `editor-handlers-media.ts` | Map `generationMeta` → `GeneratedEntry` fields |

**Deliverable**: `generated[]` array has accurate model, prompt, cost data.

### Phase 4: Export/import state (effort: ~4 hours)

File-based state dump and restore.

| Step | File | Work |
|------|------|------|
| 4a | `command-registry-editor.ts` | Register `export-state` and `import-state` commands |
| 4b | `editor-handlers-media.ts` | `handleProjectExportState()` — write JSON to disk |
| 4c | `editor-handlers-media.ts` | `handleProjectImportState()` — read + validate + apply |
| 4d | `command-registry-types.ts` | Add JSON Schema validation utility |

**Deliverable**: Round-trip export → import preserves project state.

### Phase 5: Job tracking (effort: ~3 hours)

Persistent job log for agent workflow continuity.

| Step | File | Work |
|------|------|------|
| 5a | New: `electron/claude/utils/job-log.ts` | Simple append-only JSON log per project |
| 5b | `cli-handlers-editor.ts` | Log job start/complete/fail on each CLI command |
| 5c | `editor-handlers-media.ts` | Include `jobs[]` in full project.json |

**Deliverable**: `jobs[]` tracks CLI command history across sessions.

### Total Effort: ~18 hours across 5 phases

| Phase | Effort | Priority | Status |
|-------|--------|----------|--------|
| 1. Minimal project.json | ~3h | P0 — agents need this immediately | **DONE** |
| 2. Full project.json | ~5h | P0 — required for stateful workflows | **DONE** |
| 3. AI generation metadata | ~3h | P1 — enriches generated[] | Pending |
| 4. Export/import state | ~4h | P1 — enables persistence | **export-state DONE**, import-state stubbed |
| 5. Job tracking | ~3h | P2 — enables multi-session agents | Pending |
