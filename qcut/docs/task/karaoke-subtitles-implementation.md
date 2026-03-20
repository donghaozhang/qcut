# Karaoke-Style Word-by-Word Subtitle Highlighting

**Date**: 2026-03-20
**Source**: [QCut Karaoke Implementation Guide](https://github.com/Quriosity-agent/articles/blob/main/2026-03-19/qcut-karaoke-implementation-guide-en.md)
**Status**: Implemented (subtasks 1-6) / Planned (subtasks 7-8 optional Phase 2)
**Priority**: High — rhythm-synced word highlighting for music/short-form content

---

## Overview

Add karaoke-style word-by-word subtitle highlighting to QCut, adapted from OpenReel Video (MIT license). Six animation modes: static, word-highlight, word-by-word, progressive-fill karaoke, bounce, and typewriter. Leverages QCut's existing word-level timestamps from transcription and the SubtitleStyle system.

**Key insight**: QCut already has word-level timing (`WordItem` with `start`/`end`) and caption rendering (`CaptionsDisplay`). The missing piece is logic that highlights the current word during playback and exports karaoke tags to ASS.

---

## Subtasks

### 1. Karaoke Types & Utility Functions (Core Algorithm)

**Files to create:**
- `apps/web/src/lib/captions/karaoke-types.ts` — KaraokeMode, KaraokeSegment types
- `apps/web/src/lib/captions/karaoke-utils.ts` — Pure rendering functions (~180 lines)

**Details:**
- Six modes: `"none" | "word-highlight" | "word-by-word" | "karaoke" | "bounce" | "typewriter"`
- `KaraokeSegment`: per-word render state (`wordId`, `text`, `state`, `opacity`, `scale`, `offsetY`, `color`)
- Main entry: `getKaraokeSegments(words: WordItem[], currentTime: number, mode: KaraokeMode, style): KaraokeSegment[]`
- Pure functions — no React, no browser dependencies, directly testable
- Helpers: `clamp()`, `easeOutBounce()` ported from OpenReel (MIT)
- Mode implementations:
  - `wordHighlight()` — current word changes color + scales up 15%, floats up 2px
  - `karaokeFill()` — progressive left-to-right CSS gradient color sweep per word
  - `wordByWord()` — show only the active word
  - `bounce()` — words bounce in with easeOutBounce easing (0.3s animation)
  - `typewriter()` — words appear sequentially, last word fades in

**Existing files to reference:**
- `apps/web/src/types/word-timeline.ts` — `WordItem` interface
- `packages/editor-core/src/types/timeline.ts` — `SubtitleStyle` interface

**Tests:**
- `apps/web/src/lib/captions/__tests__/karaoke-utils.test.ts`
- Test cases: each mode with before/during/after timestamps, empty words array, single word, overlapping times, progress gradient output for karaoke-fill mode

---

### 2. Extend SubtitleStyle with Karaoke Fields

**Files to modify:**
- `packages/editor-core/src/types/timeline.ts` — Add 4 optional fields to `SubtitleStyle`

**Details:**
Add to `SubtitleStyle` interface:
```typescript
highlightColor?: string;     // Karaoke highlight color (default: "#ffff00")
highlightScale?: number;     // Scale factor for active word (default: 1.15)
upcomingColor?: string;      // Color for not-yet-reached words (default: "rgba(255,255,255,0.5)")
karaokeMode?: KaraokeMode;   // Animation mode (default: "none")
```

**Files to modify:**
- `apps/web/src/lib/captions/subtitle-style.ts` — Add defaults for new fields in `subtitleStyleToCSS()`
- `packages/editor-core/src/captions/index.ts` — Re-export `KaraokeMode` type if needed

**Tests:**
- Existing `subtitle-style` tests should still pass (backward compatible, all optional fields)

---

### 3. Karaoke Renderer Component

**Files to create:**
- `apps/web/src/components/editor/preview-panel/karaoke-renderer.tsx` — React component (~80 lines)

**Details:**
- Props: `currentTime`, `style: SubtitleStyle`, `captionStartTime`, `captionEndTime`
- Reads `karaokeMode` from style (default "none")
- Fetches word-level data from `useWordTimelineStore.getNonDeletedWords()`
- Filters words within caption segment time range
- Calls `getKaraokeSegments()` to compute render state
- Renders each word as a `<span>` with CSS transforms:
  - `transform: scale(seg.scale) translateY(seg.offsetY px)`
  - `opacity: seg.opacity`
  - `transition: transform 0.1s ease-out, opacity 0.1s ease-out`
  - Gradient color: `background: linear-gradient(...)` + `-webkit-background-clip: text`
  - Solid color: `color: seg.color`
- Uses `useMemo` to avoid recomputing on every render (deps: `[words, currentTime, mode, style]`)

**Existing files to reference:**
- `apps/web/src/components/captions/captions-display.tsx` — Current caption rendering (to be augmented, not replaced)
- `apps/web/src/lib/captions/subtitle-style.ts` — `subtitleStyleToCSS()` for base styles
- `apps/web/src/stores/timeline/word-timeline-store.ts` — `getNonDeletedWords()`

**Tests:**
- `apps/web/src/components/editor/preview-panel/__tests__/karaoke-renderer.test.tsx`
- Test cases: renders nothing for empty words, renders correct word count, applies active class/color to current word

---

### 4. Integrate Karaoke into Preview Panel

**Files to modify:**
- `apps/web/src/components/captions/captions-display.tsx` — Conditionally render `KaraokeRenderer` when `karaokeMode !== "none"`

**Details:**
- When `karaokeMode` is `"none"` or absent → existing static caption rendering (unchanged)
- When `karaokeMode` is set → render `<KaraokeRenderer>` instead of the static text span
- Pass `currentTime` from playback store, `style` from the active caption element
- The `CaptionsDisplay` already resolves `currentTime` and finds the active segment — add karaoke branch after segment is found

**Existing files to reference:**
- `apps/web/src/stores/editor/playback-store.ts` — `currentTime` subscription
- `apps/web/src/components/editor/preview-panel/use-preview-media.ts` — `captionSegments` extraction

---

### 5. Karaoke Mode Selector in Caption Properties

**Files to modify:**
- `apps/web/src/components/editor/properties-panel/caption-properties.tsx` — Add karaoke mode dropdown + color pickers

**Details:**
- Add `PropertyGroup title="Karaoke"` section:
  - Mode selector: dropdown with 6 options (none, word-highlight, word-by-word, karaoke, bounce, typewriter)
  - Highlight color picker (shown when mode !== "none")
  - Upcoming color picker (shown when mode === "karaoke")
- Updates via `updateCaptionElement(trackId, elementId, { style: { ...style, karaokeMode, highlightColor } })`
- Only visible when the selected caption element has word-level timestamps available (check `useWordTimelineStore`)

**Existing files to reference:**
- `apps/web/src/components/editor/properties-panel/caption-properties.tsx` — Existing caption property UI pattern
- `apps/web/src/components/editor/properties-panel/property-item.tsx` — PropertyGroup, PropertyItem components

---

### 6. ASS Karaoke Export (`\k` tags)

**Files to modify:**
- `apps/web/src/lib/captions/caption-export.ts` — Add `exportAssKaraoke()` function

**Details:**
- New function: `exportAssKaraoke(words: WordItem[], segments: TranscriptionSegment[], options?): string`
- Generates ASS file with `\k` (instant highlight) or `\kf` (progressive fill) tags
- Word duration in centiseconds: `Math.round((word.end - word.start) * 100)`
- Per-segment: collect words within segment time range, generate `{\k<cs>}word` sequences
- Fallback: segments without word-level data render as plain Dialogue lines
- Wire into existing download UI (add "ASS (Karaoke)" option to format dropdown)

**Existing files to reference:**
- `apps/web/src/lib/captions/caption-export.ts` — `exportSrt()`, `exportVtt()`, `exportAss()` patterns
- `packages/editor-core/src/captions/ass-generator.ts` — `generateASS()`, `secondsToASSTime()`
- `apps/web/src/stores/timeline/word-timeline-store.ts` — `getWordsForExport()`

**Tests:**
- `apps/web/src/lib/captions/__tests__/karaoke-export.test.ts`
- Test cases: correct `\k` tag centisecond durations, segments without words fall back to plain text, ASS format validity, empty input

---

### 7. Text Animation Presets (Optional — Phase 2)

**Files to create:**
- `apps/web/src/lib/captions/text-animation-types.ts` — UnitAnimationState, TextAnimationContext types
- `apps/web/src/lib/captions/text-animation-presets.ts` — 14 pure animation functions (~400 lines)
- `apps/web/src/lib/captions/animation-state-to-css.ts` — Convert UnitAnimationState → React.CSSProperties

**Details:**
- Port from OpenReel Video `text-animation-presets.ts` (MIT license)
- 14 animations: typewriter, fade, slide (4 directions), scale, bounce, rotate, wave, shake, pop, glitch, split, blur
- Each animation is a pure function: `(ctx: TextAnimationContext) => UnitAnimationState`
- `animationStateToCSS()` maps state → CSS transform, opacity, filter, color
- These are independent of karaoke and apply to any text element

**Tests:**
- `apps/web/src/lib/captions/__tests__/text-animation-presets.test.ts`
- Test cases: each preset returns valid UnitAnimationState, progress 0 vs 1, animationStateToCSS output

---

### 8. Animation Picker UI (Optional — Phase 2)

**Files to create:**
- `apps/web/src/components/editor/properties-panel/text-animation-section.tsx` — Animation preset picker (~100 lines)

**Details:**
- Grid of animation thumbnails/labels
- Preview animation on hover (optional)
- Applies selected preset to text/caption element
- Wire into `text-properties.tsx` and `caption-properties.tsx`

---

## Implementation Order

| Phase | Subtasks | Estimated Time |
|-------|----------|----------------|
| 1 — Core | 1 (karaoke-utils) + 2 (type extensions) | 3-4 hours |
| 2 — Render | 3 (renderer) + 4 (preview integration) | 3 hours |
| 3 — UI | 5 (caption properties karaoke section) | 2 hours |
| 4 — Export | 6 (ASS `\k` tag export) | 2 hours |
| 5 — Optional | 7 (text animation presets) + 8 (animation picker) | 5-7 hours |

**Total: ~2-3 days** (subtasks 1-6 mandatory, 7-8 optional Phase 2)

---

## Key Files Reference

| Purpose | Path |
|---------|------|
| WordItem types | `apps/web/src/types/word-timeline.ts` |
| Word timeline store | `apps/web/src/stores/timeline/word-timeline-store.ts` |
| SubtitleStyle type | `packages/editor-core/src/types/timeline.ts` |
| Style → CSS converter | `apps/web/src/lib/captions/subtitle-style.ts` |
| Caption display (preview) | `apps/web/src/components/captions/captions-display.tsx` |
| Caption properties panel | `apps/web/src/components/editor/properties-panel/caption-properties.tsx` |
| Caption export pipeline | `apps/web/src/lib/captions/caption-export.ts` |
| ASS generator (editor-core) | `packages/editor-core/src/captions/ass-generator.ts` |
| Playback store | `apps/web/src/stores/editor/playback-store.ts` |
| Preview media hook | `apps/web/src/components/editor/preview-panel/use-preview-media.ts` |
| Word timeline view (existing word highlighting) | `apps/web/src/components/editor/media-panel/views/word-timeline-view.tsx` |
| FFmpeg caption overlay | `apps/web/src/lib/export-cli/filters/caption-overlay.ts` |
| Captions store | `apps/web/src/stores/captions-store.ts` |

---

## Architecture Notes

- **No new stores needed** — karaoke mode is stored as part of `SubtitleStyle` (already persisted on `CaptionElement`)
- **Word data already exists** — `WordItem[]` with millisecond-precision `start`/`end` from transcription
- **Pure function core** — `getKaraokeSegments()` is framework-agnostic, testable without React
- **Rendering: CSS, not Canvas** — karaoke renders via DOM `<span>` elements with CSS transforms + gradient fills
- **Backward compatible** — all new `SubtitleStyle` fields are optional; existing captions render unchanged
- **ASS export is native** — ASS format has built-in `\k` karaoke tags, no custom rendering needed for video players
- **MIT license** — OpenReel Video attribution required in adapted file headers

---

## Implementation Summary (2026-03-20)

### Files Created

| File | Purpose |
|------|---------|
| `apps/web/src/lib/captions/karaoke-types.ts` | KaraokeMode, KaraokeSegment types, KARAOKE_MODES constants |
| `apps/web/src/lib/captions/karaoke-utils.ts` | 6 pure animation functions + `getKaraokeSegments()` entry point |
| `apps/web/src/components/editor/preview-panel/karaoke-renderer.tsx` | React component: word `<span>` rendering with CSS transforms + gradients |
| `apps/web/src/lib/captions/__tests__/karaoke-utils.test.ts` | 19 unit tests for all 6 karaoke modes |
| `apps/web/src/lib/captions/__tests__/karaoke-export.test.ts` | 7 unit tests for ASS `\k` tag export |

### Files Modified

| File | Change |
|------|--------|
| `packages/editor-core/src/types/timeline.ts` | Added 4 optional karaoke fields to `SubtitleStyle` |
| `apps/web/src/components/captions/captions-display.tsx` | Conditionally renders `KaraokeRenderer` when `karaokeMode !== "none"` + accepts `words` prop |
| `apps/web/src/components/editor/properties-panel/caption-properties.tsx` | Added `KaraokeSection` with mode selector + highlight/upcoming color pickers |
| `apps/web/src/lib/captions/caption-export.ts` | Added `exportAssKaraoke()` with `\k`/`\kf` tags + `"ass-karaoke"` format |

### Test Results

```
bun run test -- apps/web/src/lib/captions/__tests__/karaoke-utils.test.ts apps/web/src/lib/captions/__tests__/karaoke-export.test.ts

Karaoke Utils (19 tests):
  ✓ clamp > clamps value within range
  ✓ easeOutBounce > returns 0 at t=0 and ~1 at t=1
  ✓ getKaraokeSegments > returns empty array for empty words
  ✓ mode: none > returns all words as completed with full opacity
  ✓ mode: word-highlight > marks current/past/future words correctly
  ✓ mode: karaoke > uses gradient for active, upcoming color for future, highlight for completed
  ✓ mode: word-by-word > returns only active word / last word / empty
  ✓ mode: bounce > hides future words, animates started words
  ✓ mode: typewriter > shows started words, fades in last
  ✓ preserves wordId from source

Karaoke Export (7 tests):
  ✓ generates valid ASS header
  ✓ generates \k tags with correct centisecond durations
  ✓ supports \kf tag type for progressive fill
  ✓ falls back to plain text for segments without words
  ✓ handles empty segments array
  ✓ contains Dialogue lines for each segment
  ✓ respects custom font options

Test Files: 2 passed (2) | Tests: 26 passed (26)
```
