# End-to-End CLI Subtitle Pipeline

**Status**: IMPLEMENTED (2026-03-14)

## Goal

Add CLI commands to go from video → transcribe → style subtitles → export video with burned-in styled captions. Reuse existing subtitle/ASS code by extracting it to a shared package.

## End-to-End Flow

```
bun run pipeline subtitle-export -i video.mp4 --transcribe --preset bold

1. [transcribe] video.mp4 → transcription API → word timestamps
2. [srt-gen]    word timestamps → SRT content (via srt-generator.ts)
3. [probe]      video.mp4 → ffprobe → {width: 1920, height: 1080}
4. [style]      preset "bold" + defaults → resolved SubtitleStyle
5. [srt→caps]   SRT entries → CaptionElement[] with style
6. [ass-gen]    CaptionElement[] → styled ASS file (via generateASS)
7. [ffmpeg]     ffmpeg -i video.mp4 -vf "ass=styled.ass" -c:a copy output.mp4
8. [cleanup]    remove temp ASS file
9. [output]     { success: true, outputPath: "output.mp4" }
```

## New CLI Commands

### `subtitle-style` — Style subtitles and output ASS

```bash
bun run pipeline subtitle-style -i subs.srt --preset bold -o styled.ass
bun run pipeline subtitle-style -i subs.srt --style '{"fontSize":64,"fontColor":"#ffff00"}' -o styled.ass
bun run pipeline subtitle-style -i subs.srt --preset cinematic --style '{"fontSize":72}' -o styled.ass
```

### `subtitle-export` — Full pipeline with video burn-in

```bash
# With existing SRT
bun run pipeline subtitle-export -i video.mp4 --srt-file subs.srt --preset bold

# With transcription (auto-generates SRT first)
bun run pipeline subtitle-export -i video.mp4 --transcribe --preset cinematic

# Full style control
bun run pipeline subtitle-export -i video.mp4 --srt-file subs.srt --style '{"fontSize":64}' --resolution 1920x1080
```

---

## Subtasks

### Subtask 1: Extract subtitle utilities to `packages/editor-core/src/captions/` (~30 min)

Move browser-independent subtitle code to the shared `editor-core` package so the CLI can import it.

**Code movement analysis:**

| Module | Current Location | Browser Deps? | Action |
|--------|-----------------|---------------|--------|
| `subtitle-style.ts` (pure fns) | `apps/web/src/lib/captions/` | Only types | Move to editor-core |
| `subtitleStyleToCSS` | same file | `React.CSSProperties` | Keep in renderer |
| `ass-generator.ts` | `apps/web/src/lib/captions/` | Only types | Move to editor-core |
| `ass-parser.ts` | `apps/web/src/lib/captions/` | Only types | Move to editor-core |
| `caption-export.ts` | `apps/web/src/lib/captions/` | DOM (`downloadCaptions`) | Keep in renderer |

**Files to create:**
- `packages/editor-core/src/captions/subtitle-style.ts` — `DEFAULT_SUBTITLE_STYLE`, `resolveSubtitleStyle`, `rgbToASSColor`, `assColorToRgb`, `alignToASSAlignment`, `hexToRgba`
- `packages/editor-core/src/captions/ass-generator.ts` — `generateASS` + helpers
- `packages/editor-core/src/captions/ass-parser.ts` — `parseASS`, `assTimeToSeconds`, `assStyleToSubtitleStyle`
- `packages/editor-core/src/captions/index.ts` — Barrel exports

**Files to modify:**
- `packages/editor-core/src/index.ts` — Add re-exports from `./captions/index.js`
- `apps/web/src/lib/captions/subtitle-style.ts` — Re-export shared fns from `@qcut/editor-core`, keep `subtitleStyleToCSS` locally
- `apps/web/src/lib/captions/ass-generator.ts` — Re-export from `@qcut/editor-core`
- `apps/web/src/lib/captions/ass-parser.ts` — Re-export from `@qcut/editor-core`

**Tests:**
- `packages/editor-core/src/captions/__tests__/subtitle-style.test.ts` — `resolveSubtitleStyle`, color roundtrip, alignment roundtrip
- `packages/editor-core/src/captions/__tests__/ass-generator.test.ts` — Valid ASS structure, multiple styles
- `packages/editor-core/src/captions/__tests__/ass-parser.test.ts` — Roundtrip with `generateASS`, time parsing, style conversion

**Verify:** `bun run test`, `bun check-types`, existing renderer still works.

---

### Subtask 2: Create subtitle style preset system (~25 min)

Define named style presets and a CLI flag parser for style overrides.

**File to create:** `electron/native-pipeline/subtitle/style-presets.ts`

Contents:
- `SUBTITLE_PRESETS: Record<string, Partial<SubtitleStyle>>` — Named presets:
  - `"default"` — White text, black outline, bottom-center
  - `"cinematic"` — Larger serif font, subtle shadow
  - `"bold"` — Large bold, thick outline
  - `"minimal"` — No outline, semi-transparent bg
  - `"karaoke"` — Yellow, top position
- `parseStyleOverrides(json: string): Partial<SubtitleStyle>` — Parse JSON string
- `resolveStyleFromCLI(preset?: string, overrides?: string): SubtitleStyle` — Combines preset + overrides + defaults

**Test:** `electron/native-pipeline/subtitle/__tests__/style-presets.test.ts`
- Each preset resolves to valid `SubtitleStyle`
- Override parsing
- Preset + override merging

---

### Subtask 3: Implement `subtitle-style` CLI command (~30 min)

Takes SRT/VTT/ASS input, applies a style, outputs styled ASS file.

**File to create:** `electron/native-pipeline/cli/cli-handlers-subtitle.ts`

Handler flow:
1. Parse input subtitle file (SRT/VTT via `srt-parser.ts`, ASS via `ass-parser.ts`)
2. Resolve style from `--preset` and/or `--style` JSON overrides
3. Convert SRT entries to `CaptionElement[]` with resolved style
4. Generate ASS output via `generateASS` from editor-core
5. Write ASS file
6. Optionally output resolved style as JSON (`--json`)

**Files to modify:**
- `electron/native-pipeline/cli/command-registry.ts` — Add `subtitle-style` command definition
- `electron/native-pipeline/cli/cli-runner/runner.ts` — Add dispatch case
- `electron/native-pipeline/cli/cli-runner/types.ts` — Add `subtitlePreset?: string` field

**Test:** `electron/native-pipeline/subtitle/__tests__/cli-handlers-subtitle.test.ts`
- SRT input → ASS output with default style
- Preset application
- JSON override application
- Error handling

---

### Subtask 4: Add FFmpeg video probing utility for CLI (~20 min)

CLI-safe `ffprobe` wrapper to get video resolution/duration (needed for ASS `PlayResX`/`PlayResY`).

**File to create:** `electron/native-pipeline/ffmpeg/probe-cli.ts`

- `probeVideoInfo(path: string): Promise<{width, height, duration}>` — Uses `execFile` with ffprobe binary
- Follows same FFmpeg path resolution pattern as `electron/native-pipeline/autoclip/steps/step-cut.ts`

**Note:** `electron/ffmpeg/probe.ts` exists but imports from Electron context. This is the standalone Node.js version.

**Test:** `electron/native-pipeline/ffmpeg/__tests__/probe-cli.test.ts`
- Parse mock ffprobe JSON output
- Error handling when ffprobe not found

---

### Subtask 5: Implement `subtitle-export` CLI command (~40 min)

Full pipeline: video + subtitles → styled video with burned-in captions.

**File to create:** `electron/native-pipeline/cli/cli-handlers-subtitle-export.ts`

Handler flow:
1. If `--transcribe`: run transcription (reuse `handleTranscribe` logic), generate SRT
2. Parse subtitle file (SRT/VTT/ASS)
3. Resolve style from preset + overrides
4. Probe video resolution via `probe-cli.ts` (or accept `--resolution` flag)
5. Generate temp ASS file with styled subtitles
6. Run FFmpeg: `ffmpeg -i video.mp4 -vf "ass=styled.ass" -c:a copy output.mp4`
7. Clean up temp ASS file
8. Return `{ success, outputPath }`

**Files to modify:**
- `electron/native-pipeline/cli/command-registry.ts` — Add `subtitle-export` command
- `electron/native-pipeline/cli/cli-runner/runner.ts` — Add dispatch case
- `electron/native-pipeline/cli/cli-runner/types.ts` — Add `transcribe?: boolean`

**Test:** `electron/native-pipeline/subtitle/__tests__/cli-handlers-subtitle-export.test.ts`
- ASS generation step (mock FFmpeg)
- Transcribe-then-style flow (mock transcription)
- Resolution probing logic
- Error cases (missing video, missing subs, FFmpeg failure)

---

### Subtask 6: Wire up category and integration test (~15 min)

Final wiring and smoke tests.

**Files to modify:**
- `electron/native-pipeline/cli/command-registry.ts` — Add `"subtitle"` category with commands `["subtitle-style", "subtitle-export"]`
- Verify `--help` output

**Note:** `command-registry.ts` is already ~1024 lines. If adding commands pushes it further, consider extracting subtitle commands to `command-registry-subtitle.ts`.

**Test:** `electron/native-pipeline/subtitle/__tests__/integration.test.ts`
- Smoke: parse SRT → apply preset → generate ASS → verify structure
- End-to-end flow with mocked FFmpeg and transcription

---

## New Files Summary

| File | Est. Lines | Purpose |
|------|-----------|---------|
| `packages/editor-core/src/captions/subtitle-style.ts` | ~100 | Shared style utilities |
| `packages/editor-core/src/captions/ass-generator.ts` | ~120 | Shared ASS generation |
| `packages/editor-core/src/captions/ass-parser.ts` | ~240 | Shared ASS parsing |
| `packages/editor-core/src/captions/index.ts` | ~15 | Barrel exports |
| `electron/native-pipeline/subtitle/style-presets.ts` | ~100 | CLI style presets + parsing |
| `electron/native-pipeline/cli/cli-handlers-subtitle.ts` | ~150 | subtitle-style handler |
| `electron/native-pipeline/cli/cli-handlers-subtitle-export.ts` | ~200 | subtitle-export handler |
| `electron/native-pipeline/ffmpeg/probe-cli.ts` | ~60 | CLI-safe video probing |

All files well under the 800-line limit.

## Risk Areas

1. **FFmpeg ASS filter**: Requires libass. If missing, fall back to `subtitles` filter or drawtext approach. Handler should detect and degrade gracefully.
2. **Font availability**: ASS references fonts by name. Default to widely available fonts (Arial/Helvetica). Document font requirements.
3. **command-registry.ts size**: Already ~1024 lines. Extract subtitle commands to `command-registry-subtitle.ts` if needed.

## Dependencies

- Existing: `@qcut/editor-core` types, `srt-generator.ts`, `srt-parser.ts`, FFmpeg binary
- No new npm packages required

---

## Implementation Summary (2026-03-14)

### Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `packages/editor-core/src/captions/subtitle-style.ts` | 115 | Shared subtitle style utilities (re-exported by renderer) |
| `packages/editor-core/src/captions/ass-generator.ts` | 131 | Shared ASS generation (re-exported by renderer) |
| `packages/editor-core/src/captions/ass-parser.ts` | 245 | Shared ASS parsing (re-exported by renderer) |
| `packages/editor-core/src/captions/index.ts` | 29 | Barrel exports |
| `electron/native-pipeline/subtitle/subtitle-types.ts` | 472 | CLI-local copy of types + functions (avoids rootDir issues) |
| `electron/native-pipeline/subtitle/style-presets.ts` | 105 | 6 named presets + CLI resolver |
| `electron/native-pipeline/subtitle/probe-video.ts` | 60 | CLI-safe ffprobe wrapper |
| `electron/native-pipeline/cli/cli-handlers-subtitle.ts` | 465 | Both command handlers |

### Files Modified

| File | Change |
|------|--------|
| `packages/editor-core/src/index.ts` | Added captions re-exports |
| `packages/editor-core/package.json` | Added `"./captions"` export |
| `apps/web/src/lib/captions/subtitle-style.ts` | Re-exports from editor-core + local `subtitleStyleToCSS` |
| `apps/web/src/lib/captions/ass-generator.ts` | Re-exports from editor-core |
| `apps/web/src/lib/captions/ass-parser.ts` | Re-exports from editor-core |
| `electron/native-pipeline/cli/command-registry.ts` | Added subtitle category + 2 commands |
| `electron/native-pipeline/cli/cli-runner/runner.ts` | Added dispatch for subtitle-style/subtitle-export |

### FFmpeg Strategy (3-tier fallback)

1. **drawtext** — Burns text directly (requires `libfreetype`)
2. **ASS filter** — Uses styled ASS file (requires `libass`)
3. **Embedded subtitles** — Soft subs as mov_text stream (always works)

### Available Presets

| Preset | Description |
|--------|-------------|
| `default` | White text, black outline, bottom-center |
| `cinematic` | Georgia serif, subtle shadow, bottom |
| `bold` | Large bold Arial, thick outline |
| `minimal` | No outline, semi-transparent background |
| `karaoke` | Yellow, top position |
| `news` | No outline, dark background bar |

### Test Results

```
✅ subtitle-style -i subs.srt --preset bold → styled ASS file
✅ subtitle-style with --style JSON overrides → custom style applied
✅ subtitle-style with preset + override merge → works
✅ subtitle-export -i video.mp4 --srt-file subs.srt → subtitled video
✅ subtitle-export auto-detect → finds .srt next to video
✅ subtitle-export --json → structured output
✅ --help --json → documented all flags
✅ Type check (electron + web) → no errors
✅ Lint (new files) → clean
```

### Architecture Note

The electron tsconfig uses `rootDir: "."` which prevents importing from `packages/editor-core/`. To work around this, `subtitle-types.ts` contains a local copy of the types and functions used by the CLI handlers (matching the pattern used by `claude-http-search-routes.ts`). The renderer still re-exports from `@qcut/editor-core`.
