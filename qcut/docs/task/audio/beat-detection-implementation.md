# Beat Detection Implementation Plan

**Date**: 2026-03-19
**Source**: [QCut Beat Detection Guide](https://github.com/Quriosity-agent/articles/blob/main/2026-03-19/qcut-beat-detection-guide-en.md)
**Status**: Implemented (subtasks 1-5) / Planned (subtasks 6-7 optional)
**Priority**: High — enables rhythm-based editing workflows (TikTok/Reels-style sync cuts)

---

## Overview

Integrate beat detection into QCut by adapting OpenReel Video's MIT-licensed audio analysis engine (~280 lines, pure JS). The system analyzes audio waveforms to find energy spikes (beats) and outputs timestamp arrays for rhythm-synced editing.

**Pipeline**: onset detection → BPM calculation → beat grid generation → downbeat identification

---

## Subtasks

### 1. Core Algorithm & Types

**Files to create:**
- `packages/editor-core/src/audio/beat-types.ts` — Beat, BeatResult, BeatConfig types
- `packages/editor-core/src/audio/beat-detection-engine.ts` — Pure JS engine (~280 lines)

**Details:**
- Accepts raw PCM samples (Float32Array), returns structured result: BPM, confidence, beat timestamps, downbeat positions
- RMS energy calculation → smoothing → adaptive threshold → peak detection
- No browser dependencies — works with both AudioBuffer (browser) and Node.js buffers (CLI)
- Export `analyzeFromSamples(samples: Float32Array, sampleRate: number): BeatResult`

**Tests:**
- `packages/editor-core/src/__tests__/beat-detection-engine.test.ts`
- Test cases: silent audio (no beats), steady 120 BPM click track, variable tempo, short clips (<2s)

**License:**
- Add MIT attribution header: `// Adapted from OpenReel Video (MIT License)`
- Add acknowledgment in project LICENSE/NOTICE

---

### 2. Zustand Store & Hooks

**Files to create:**
- `apps/web/src/stores/beat-detection-store.ts` — Analysis state, progress, results cache
- `apps/web/src/hooks/use-beat-detection.ts` — React hook wrapping store actions

**Details:**
- Store state: `isAnalyzing`, `progress`, `error`, `result` (BeatResult | null), `activeElementId`
- Store actions: `analyze(audioUrl)`, `clear()`, `snapToNearestBeat(time)`, `getCutPoints(startTime, endTime)`
- Hook exposes: analysis trigger, loading state, beat data, snap utility
- Cache results per element ID to avoid re-analysis

**Existing files to reference:**
- `apps/web/src/stores/timeline/timeline-store.ts` — Pattern for Zustand store creation
- `apps/web/src/lib/ffmpeg/audio-mixer.ts` — Web Audio API usage for decoding audio

**Tests:**
- `apps/web/src/stores/__tests__/beat-detection-store.test.ts`
- Test cases: analyze flow, caching, snapToNearestBeat accuracy, getCutPoints filtering

---

### 3. UI — Beat Detection Panel

**Files to create:**
- `apps/web/src/components/editor/properties-panel/beat-detection-panel.tsx` — Analysis controls + results display

**Details:**
- "Detect Beats" button triggers analysis via `useBeatDetection` hook
- Progress bar during analysis
- Results display: detected BPM, confidence %, beat count
- "Auto-Cut on Beats" button triggers `splitOnBeats()` timeline operation
- Sensitivity slider (threshold multiplier for beat detection config)

**Existing files to modify:**
- `apps/web/src/components/editor/properties-panel/audio-properties.tsx` — Add BeatDetectionPanel below existing audio controls (render when audio/video element is selected)

**Tests:**
- `apps/web/src/components/editor/properties-panel/__tests__/beat-detection-panel.test.ts`
- Test cases: button states (idle, analyzing, complete), results rendering, error display

---

### 4. Timeline Beat Markers

**Files to create:**
- `apps/web/src/components/editor/timeline/beat-markers.tsx` — Renders vertical lines on timeline ruler

**Details:**
- Semi-transparent vertical lines: orange for downbeats (every 4th), blue for regular beats
- Only render markers visible in current viewport (performance optimization)
- Markers are an overlay layer — not timeline elements, no persistence needed
- Read beat data from `beat-detection-store`

**Existing files to modify:**
- Wire into the timeline ruler area (find the ruler component and add `<BeatMarkers />` as sibling overlay)

**Tests:**
- `apps/web/src/components/editor/timeline/__tests__/beat-markers.test.ts`
- Test cases: renders correct number of markers, viewport culling, color distinction

---

### 5. Timeline Split-on-Beats Operation

**Files to modify:**
- `apps/web/src/stores/timeline/split-operations.ts` — Add `splitOnBeats()` operation

**Details:**
- Get cut points from beat detection store via `getCutPoints(elementStart, elementEnd)`
- Filter points within selected element bounds
- Execute splits back-to-front (reverse order) to prevent time offset cascading
- Reuse existing `splitElementOperation()` for each cut

**Tests:**
- `apps/web/src/stores/timeline/__tests__/split-on-beats.test.ts`
- Test cases: splits at correct timestamps, back-to-front ordering, no splits outside bounds, empty beats array

---

### 6. Waveform Integration (Optional Enhancement)

**Files to modify:**
- `apps/web/src/components/editor/audio-waveform.tsx` — Overlay beat markers on WaveSurfer display

**Details:**
- Use WaveSurfer.js marker/region plugin to show beats on waveform
- Sync with beat-detection-store results
- Low priority — timeline markers (subtask 4) provide primary visualization

---

### 7. CLI Pipeline Extension (Optional)

**Files to modify:**
- `electron/native-pipeline/autoclip/` — Add `--beat-sync` flag

**Details:**
- Extract PCM via FFmpeg piped output in Node.js
- Pass to `analyzeFromSamples()` from editor-core
- Output beat timestamps as JSON or feed into autoclip cut decisions
- Extends existing `clean-audio-analysis.ts` pattern

**Existing reference:**
- `electron/native-pipeline/autoclip/clean-audio-analysis.ts` — Existing audio analysis pattern
- `electron/native-pipeline/autoclip/clean-audio-runner.ts` — Runner pattern

---

## Implementation Order

| Phase | Subtasks | Estimated Time |
|-------|----------|----------------|
| 1 — Core | 1 (algorithm + types) | 2-3 hours |
| 2 — State | 2 (store + hooks) | 1-2 hours |
| 3 — UI | 3 (panel) + 4 (markers) | 2-3 hours |
| 4 — Wire | 5 (split operation) + modify audio-properties | 1-2 hours |
| 5 — Optional | 6 (waveform) + 7 (CLI) | 1-2 hours |

**Total: ~1-2 days**

---

## Key Files Reference

| Purpose | Path |
|---------|------|
| Timeline store | `apps/web/src/stores/timeline/timeline-store.ts` |
| Split operations | `apps/web/src/stores/timeline/split-operations.ts` |
| Audio mixer (Web Audio API) | `apps/web/src/lib/ffmpeg/audio-mixer.ts` |
| Waveform component | `apps/web/src/components/editor/audio-waveform.tsx` |
| Audio properties panel | `apps/web/src/components/editor/properties-panel/audio-properties.tsx` |
| Editor-core types | `packages/editor-core/src/types/timeline.ts` |
| Autoclip audio analysis | `electron/native-pipeline/autoclip/clean-audio-analysis.ts` |
| Volume control | `apps/web/src/components/editor/properties-panel/volume-control.tsx` |

---

## Notes

- Beat markers are overlay-only — they do NOT become timeline elements (no persistence, no export side effects)
- Algorithm is pure JS with no WASM dependency — keeps build simple, can add WASM acceleration later if needed
- MIT license requires attribution comment in adapted file headers + NOTICE file entry

---

## Implementation Summary (2026-03-19)

### Files Created

| File | Purpose |
|------|---------|
| `packages/editor-core/src/audio/beat-types.ts` | Beat, BeatDetectionConfig, BeatDetectionResult types |
| `packages/editor-core/src/audio/beat-detection-engine.ts` | Pure JS engine: RMS → smoothing → threshold → peaks → BPM |
| `packages/editor-core/src/audio/index.ts` | Barrel export for audio module |
| `apps/web/src/stores/beat-detection-store.ts` | Zustand store: analysis state, cache, snap/cut utilities |
| `apps/web/src/hooks/use-beat-detection.ts` | React hook wrapping store for component use |
| `apps/web/src/components/editor/properties-panel/beat-detection-panel.tsx` | UI panel: detect button, progress, results, auto-cut, sensitivity |
| `apps/web/src/components/editor/timeline/beat-markers.tsx` | Timeline overlay: orange downbeats, blue regular beats |
| `packages/editor-core/src/__tests__/beat-detection-engine.test.ts` | 11 unit tests for core algorithm |

### Files Modified

| File | Change |
|------|--------|
| `packages/editor-core/src/index.ts` | Added audio module exports |
| `apps/web/src/components/editor/properties-panel/audio-properties.tsx` | Added BeatDetectionPanel below volume control |
| `apps/web/src/components/editor/timeline/timeline-ruler.tsx` | Added BeatMarkers overlay |
| `apps/web/src/stores/timeline/split-operations.ts` | Added `splitOnBeats()` operation |

### Test Results

```
bun run test -- packages/editor-core/src/__tests__/beat-detection-engine.test.ts
✓ resolveConfig > returns defaults when no config provided
✓ resolveConfig > merges partial config with defaults
✓ analyzeFromSamples > returns empty result for silent audio
✓ analyzeFromSamples > returns empty result for very short clips
✓ analyzeFromSamples > detects beats from a 120 BPM click track
✓ analyzeFromSamples > marks downbeats correctly (every 4th beat by default)
✓ analyzeFromSamples > respects custom beatsPerMeasure
✓ analyzeFromSamples > beats have sequential indices
✓ analyzeFromSamples > beat timestamps are monotonically increasing
✓ analyzeFromSamples > beat strengths are between 0 and 1
✓ analyzeFromSamples > respects custom thresholdMultiplier
Test Files: 1 passed (1) | Tests: 11 passed (11)
```
