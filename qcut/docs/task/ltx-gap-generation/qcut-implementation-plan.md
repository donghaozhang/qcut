# QCut Gap Generation: Implementation Plan from LTX-Desktop

How QCut can implement "generate video between clips" by reusing LTX-Desktop's logic and adapting it to QCut's existing architecture.

---

## Mapping LTX → QCut

| LTX-Desktop | QCut Equivalent | Reuse? |
|---|---|---|
| `TimelineClip` with `startTime`, `duration`, `trackIndex` | `MediaElement` with `startTime`, `duration`, track via `TimelineTrack` | Same concept, different shape |
| `Track` (video/audio/subtitle) | `TimelineTrack` (media/text/audio/sticker/captions/remotion/markdown) | Same concept |
| `Asset` with `prompt`, `takes[]` | `MediaItem` with `metadata`, `localPath` | Extend MediaItem |
| `backendFetch('/api/generate')` → local LTX model | FAL.ai client → cloud models (LTX 2.3, Veo, WAN, etc.) | **Already exists** in `lib/ai-video/` |
| `backendFetch('/api/suggest-gap-prompt')` → Gemini | `electron/gemini-chat-handler.ts` → Gemini | **Already exists**, reuse handler |
| `window.electronAPI.extractVideoFrame()` | `window.electronAPI.ffmpeg.saveFrame()` + FFmpeg seek | Needs new IPC method |
| `SettingsPanel` (model, duration, fps, etc.) | Per-model settings (`ai-ltx23-settings.tsx`, `ai-veo-settings.tsx`, etc.) | **Already exists** |
| `copyToAssetFolder()` | `window.electronAPI.aiVideo.saveGeneratedVideo()` | **Already exists** |
| Zustand-like hook state | Zustand store | Use QCut's store pattern |

---

## What Can Be Directly Reused

### 1. Gap Detection Logic (copy with minor adaptation)

LTX's `timelineGaps` useMemo is directly portable. Adapt to QCut's track/element model:

```typescript
// From LTX (useGapGeneration.ts lines 100-126)
// Adapt: clips → elements, trackIndex → track.id, track.type check → track.type check
const timelineGaps = useMemo(() => {
  const gaps: { trackId: string; startTime: number; endTime: number }[] = []

  for (const track of tracks) {
    if (track.type !== 'media') continue // Only detect gaps on media tracks

    const trackElements = elements
      .filter(e => e.type === 'media' && e.trackId === track.id)
      .sort((a, b) => a.startTime - b.startTime)

    if (trackElements.length === 0) continue

    // Gap at start of track
    if (trackElements[0].startTime > 0.05) {
      gaps.push({ trackId: track.id, startTime: 0, endTime: trackElements[0].startTime })
    }

    // Gaps between clips
    for (let i = 0; i < trackElements.length - 1; i++) {
      const endOfCurrent = trackElements[i].startTime + trackElements[i].duration
      const startOfNext = trackElements[i + 1].startTime
      if (startOfNext - endOfCurrent > 0.05) {
        gaps.push({ trackId: track.id, startTime: endOfCurrent, endTime: startOfNext })
      }
    }
  }

  return gaps
}, [elements, tracks])
```

**Reuse level**: ~90% logic, rename fields only.

### 2. Close Gap / Ripple Delete (copy with adaptation)

LTX's `deleteGap` (lines 129-147) maps directly:

```typescript
// Adapt: use timeline store's existing ripple operations
// QCut already has ripple editing in timeline-store-operations.ts
// Can call existing rippleDelete or adapt LTX's simpler version
const closeGap = (gap: Gap) => {
  const gapDuration = gap.endTime - gap.startTime
  // Shift all elements after the gap on ALL tracks (QCut convention)
  updateElements(elements.map(e => {
    if (e.startTime >= gap.endTime) {
      return { ...e, startTime: Math.max(0, e.startTime - gapDuration) }
    }
    return e
  }))
}
```

**Reuse level**: ~80%, may want to use QCut's existing `rippleDelete` instead.

### 3. AI Prompt Suggestion via Gemini (adapt to existing handler)

LTX uses a dedicated Python backend handler. QCut already has `gemini-chat-handler.ts` with multimodal support. **Don't copy the Python handler** — instead create a new IPC method on the existing Gemini handler:

```typescript
// New IPC method in electron/gemini-chat-handler.ts
'gemini:suggest-gap-prompt': async (event, {
  gapDuration, mode, beforePrompt, afterPrompt, beforeFramePath, afterFramePath
}) => {
  // Reuse LTX's system prompt and context text construction
  // (from suggest_gap_prompt_handler.py lines 94-128)
  // Send via existing Gemini SDK already loaded in this handler
}
```

**What to copy from LTX**:
- System prompt text (lines 94-106) — production-quality prompt engineering
- Context text construction pattern (lines 108-128) — structured before/after framing
- Image inline data format for multimodal (lines 130-140)

**Reuse level**: ~70% of prompt construction logic. Wrap in existing Gemini handler, not new backend.

### 4. Frame Extraction for Context

LTX calls `window.electronAPI.extractVideoFrame(src, seekTime, size, quality)`. QCut needs a similar IPC method. QCut already has FFmpeg handlers — add a new one:

```typescript
// New handler in electron/ffmpeg-basic-handlers.ts
'ffmpeg:extract-frame': async (event, videoPath: string, seekTime: number, maxSize: number) => {
  // Use FFmpeg to seek and extract a single frame as JPEG
  // ffmpeg -ss {seekTime} -i {videoPath} -vframes 1 -vf scale={maxSize}:-1 -q:v 3 output.jpg
  // Return { path: string, url: string }
}
```

**What to copy from LTX**: Frame seek time calculation logic (lines 405-437):
- Before clip: `trimStart + duration * speed - 0.1` (last frame)
- After clip: `trimStart + 0.1` (first frame)
- Image clips: use source directly

**Reuse level**: ~90% of seek time math. New IPC wrapper needed.

### 5. GapGenerationModal UI (adapt to QCut's component patterns)

LTX's modal has excellent UX patterns worth reusing:

| LTX Pattern | QCut Adaptation |
|---|---|
| Fixed overlay modal | Use QCut's existing `Dialog` component (Radix-based) |
| Frame strip (before / gap / after) | Copy the 3-panel layout, use QCut's Tailwind classes |
| Start/End frame toggle | Copy as-is, same concept |
| Prompt textarea with AI suggestion | Copy the suggestion UI pattern (badge, re-analyze button) |
| Settings panel | Use QCut's existing per-model settings components |
| Progress bar | Copy the progress UI, hook into FAL polling |
| Gap action popover | Use Radix `Popover` or `ContextMenu` component |

**What to copy from LTX's modal**:
- Frame strip JSX structure (lines 216-318) — the 3-panel before/gap/after visualization
- Prompt section with AI suggestion UX (lines 324-398) — badge states, re-analyze button
- Start/End frame toggle (lines 195-212) — segmented control pattern
- Smart popover positioning math (lines 492-510)

**Reuse level**: ~60% of JSX/layout. Swap primitives (Radix Dialog instead of raw div overlay).

### 6. Generation Trigger & Clip Insertion (adapt to QCut's generation pipeline)

LTX calls a local backend. QCut uses FAL.ai. The flow changes but the orchestration is the same:

```typescript
// LTX flow (useGapGeneration.ts lines 150-207):
// 1. Close modal immediately ✓ (copy this UX pattern)
// 2. Track generatingGap state ✓ (copy state shape)
// 3. Call generation API ← CHANGE: use QCut's existing FAL client
// 4. On complete, insert clip ← ADAPT: use QCut's timeline store

// QCut adaptation:
const handleGapGenerate = async () => {
  // 1. Save gap state, close modal (copy from LTX lines 164-178)
  setGeneratingGap({ trackId, startTime, endTime, mode, prompt, settings })
  setSelectedGap(null)

  // 2. Generate via FAL (use existing lib/ai-video/)
  const result = await generateVideo({
    prompt: finalPrompt,
    model: selectedModel, // 'ltx-2.3', 'veo-3.1', etc.
    settings: { duration: gapDuration, ... },
    imagePath: conditioningFrame, // for image-to-video
  })

  // 3. Save to disk (use existing handler)
  const saved = await window.electronAPI.aiVideo.saveGeneratedVideo(result.url, projectPath)

  // 4. Add to media store
  const mediaItem = addMediaItem({ type: 'video', localPath: saved.path, ... })

  // 5. Insert into timeline at gap position (use timeline store)
  addElement({
    type: 'media',
    mediaId: mediaItem.id,
    startTime: gap.startTime,
    duration: gapDuration,
    trackId: gap.trackId,
  })
}
```

**What to copy from LTX**:
- Non-blocking UX pattern: close modal, generate in background (lines 164-178)
- `generatingGap` state shape for tracking background generation (lines 82-87)
- Clip insertion with linked audio logic (lines 286-334) — if QCut wants audio track splitting
- Asset creation with `generationParams` and `takes[]` for retakes (lines 235-260)

**Reuse level**: ~50% of orchestration logic. Generation backend completely different.

---

## What NOT to Copy

| LTX Code | Why Skip |
|---|---|
| `suggest_gap_prompt_handler.py` (Python backend) | QCut is Electron/TS — use existing `gemini-chat-handler.ts` |
| `backendFetch()` pattern | QCut uses Electron IPC, not HTTP to local backend |
| `copyToAssetFolder()` | QCut has `aiVideo.saveGeneratedVideo()` already |
| `SettingsPanel` component | QCut has per-model settings components already |
| `window.electronAPI.getModelsPath()` | LTX-specific (local model paths) |
| `pipeline.generate()` local inference | QCut uses cloud APIs (FAL.ai) |
| File-to-path conversion (`fileUrlToPath`) | QCut stores `localPath` directly on MediaItem |

---

## Implementation Order

### Phase 1: Gap Detection + UI (no generation)
1. Add `timelineGaps` computation to timeline store (copy LTX detection logic)
2. Render gap indicators on timeline (dashed border boxes between clips)
3. Add gap click handler → popover with "Close gap" option
4. Implement `closeGap` ripple delete

**Files to create/modify**:
- `stores/timeline/timeline-store-gaps.ts` (new) — gap detection + close gap
- `components/editor/timeline/gap-indicator.tsx` (new) — gap UI on timeline
- Timeline renderer — add gap rendering between clips

### Phase 2: Gap Generation Modal
1. Create `GapGenerationModal` (adapt LTX's modal with Radix Dialog)
2. Add frame extraction IPC (`ffmpeg:extract-frame`)
3. Wire frame strip visualization (copy LTX's 3-panel layout)
4. Add model selector (reuse existing AI settings components)
5. Add prompt textarea

**Files to create/modify**:
- `components/editor/gap-generation-modal.tsx` (new) — adapted from LTX
- `electron/ffmpeg-basic-handlers.ts` — add frame extraction
- `types/electron/api-ffmpeg.ts` — add extractFrame type

### Phase 3: AI Prompt Suggestion
1. Add `gemini:suggest-gap-prompt` IPC method (adapt LTX's prompt engineering)
2. Wire suggestion into modal (copy LTX's suggestion UX: badge, re-analyze, auto-fill)

**Files to create/modify**:
- `electron/gemini-chat-handler.ts` — add gap prompt suggestion method
- `types/electron/api-gemini-pty-mcp.ts` — add type

### Phase 4: Generation + Insertion
1. Wire "Generate" button to FAL.ai client (use existing `lib/ai-video/`)
2. Track generation progress (adapt LTX's `generatingGap` state pattern)
3. On completion: save video, add to media store, insert element into timeline gap
4. Show progress indicator on timeline gap during generation

**Files to create/modify**:
- `stores/timeline/timeline-store-gaps.ts` — add generation tracking + insertion
- `components/editor/timeline/gap-indicator.tsx` — add progress state

---

## Code Reuse Summary

| Component | Lines from LTX | Adaptation Needed |
|---|---|---|
| Gap detection (`useMemo`) | 27 lines | Rename fields (clip→element, trackIndex→trackId) |
| Close gap (ripple) | 18 lines | Use timeline store's update method |
| Frame seek time math | 35 lines | Minimal — same FFmpeg concepts |
| Gemini system prompt | 12 lines | Copy verbatim |
| Gemini context construction | 20 lines | Copy, adapt to TS |
| Modal frame strip JSX | 100 lines | Swap to Radix Dialog, QCut Tailwind |
| Prompt suggestion UX | 75 lines | Copy badge/button pattern |
| Non-blocking generation UX | 15 lines | Copy pattern, change API calls |
| `generatingGap` state shape | 6 lines | Copy type definition |
| Clip insertion logic | 50 lines | Adapt to QCut's `addElement()` |
| **Total reusable** | **~360 lines** | ~40% direct copy, ~60% adapted |
