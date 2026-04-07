# Caption Element Wiring Bug

## Issue
Caption element added via CLI `editor:timeline:add-element` with `type: "caption"` returns success but element does NOT appear in the timeline store or UI. The properties panel shows blank when a caption is selected.

## Root Cause Analysis

Three issues identified in the caption element add flow:

### 1. Stale state in track lookup (`addClaudeCaptionElement`)
**File**: `apps/web/src/lib/claude-bridge/claude-timeline-bridge-helpers.ts:577`

The function uses `timelineStore.tracks` (a snapshot captured at call time) to find the captions track, while other element type helpers use `timelineStore.findOrCreateTrack()` which internally uses `get()._tracks` (live state). When no captions track exists, the manual find-or-create could race with state updates.

```typescript
// BUG: uses snapshot .tracks instead of live get()._tracks
const existingTrack = timelineStore.tracks.find((t) => t.type === "captions");
const trackId = existingTrack?.id ?? timelineStore.addTrack("captions");
```

**Fix**: Use `timelineStore.findOrCreateTrack("captions")` like the media/text/sticker helpers.

### 2. Missing `element.text` fallback
**File**: `apps/web/src/lib/claude-bridge/claude-timeline-bridge-helpers.ts:587`

The function only checks `element.content` for caption text, but CLI callers may send `text` instead. The batch handler at `claude-timeline-bridge-batch.ts:258` correctly checks both `element.content` and `element.text`.

```typescript
// BUG: only checks .content, not .text
const text = typeof element.content === "string" ? element.content : "Caption";
```

**Fix**: Check both `element.content` and `element.text`.

### 3. No debug logging
The caption add path had only a final success log but no entry/error logging, making it impossible to trace failures in the fire-and-forget single-element add path.

## Affected Flow
```
CLI add-element → HTTP POST /elements → fire-and-forget IPC → renderer onAddElement
→ addClaudeCaptionElement → addElementToTrack (silent failure possible)
```

The HTTP handler always returns `{ elementId }` regardless of whether the renderer actually created the element.

## Fix Summary
- Use `findOrCreateTrack("captions")` for robust track creation
- Check both `element.content` and `element.text` for caption text
- Add console.log debug messages at each stage of the flow
