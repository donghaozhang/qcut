# LTX-Desktop: Video Generation Between Timeline Clips

How LTX-Desktop detects gaps between clips and generates AI video to fill them.

## Architecture Overview

```
User clicks gap → GapGenerationModal → /api/generate → LTX pipeline → Insert clip into timeline
                       ↓
               /api/suggest-gap-prompt (Gemini 2.0 Flash) → AI-suggested prompt
```

**Key files:**
- Gap logic: `frontend/views/editor/useGapGeneration.ts`
- Modal UI: `frontend/views/editor/GapGenerationModal.tsx`
- Generation hook: `frontend/hooks/use-generation.ts`
- Timeline rendering: `frontend/views/VideoEditor.tsx` (lines 3340-3429)
- Backend generation: `backend/handlers/video_generation_handler.py`
- Prompt suggestion: `backend/handlers/suggest_gap_prompt_handler.py`

---

## 1. Gap Detection

Gaps are detected automatically via `useMemo` in `useGapGeneration.ts`:

- Iterates all non-subtitle tracks
- Sorts clips by `startTime` on each track
- A gap exists when `startOfNextClip - endOfCurrentClip > 0.05s` (50ms threshold)
- Returns `{ trackIndex, startTime, endTime }[]`

---

## 2. UI Interaction

Gaps render as **dashed blue boxes** between clips on the timeline. Visible when gap width > 4px, showing duration on hover.

**Click actions:**
- **Left/Right click** on gap → popover with 3 options:
  - "Fill with Video" → text-to-video or image-to-video generation
  - "Fill with Image" → text-to-image generation
  - "Close gap" → ripple delete (shifts later clips forward)

Selecting a generation mode opens `GapGenerationModal`.

---

## 3. Frame Extraction for Conditioning

When a gap is selected, frames are extracted from neighboring clips:

- **Before clip** → last frame at `trimStart + duration * speed - 0.1s`
- **After clip** → first frame at `trimStart + 0.1s`
- Extraction call: `window.electronAPI.extractVideoFrame(clipSrc, seekTime, 512, 3)`
- Image clips use the image directly

These frames serve two purposes:
1. **Visual context** in the modal UI (frame strip showing before/after)
2. **Conditioning input** for image-to-video generation

**Important constraint:** The model only supports **start-frame conditioning**. If the user selects "End frame", the video is generated from that frame and then **reversed**.

---

## 4. AI Prompt Suggestion (Gemini)

Triggered automatically when the modal opens. Calls `/api/suggest-gap-prompt`:

**Request:**
```json
{
  "gapDuration": 2.5,
  "mode": "text-to-video",
  "beforePrompt": "man running",
  "afterPrompt": "office scene",
  "beforeFrame": "/path/to/frame.jpg",
  "afterFrame": "/path/to/frame.jpg"
}
```

**Backend** (`suggest_gap_prompt_handler.py`):
- Model: **Gemini 2.0 Flash** (multimodal)
- Sends both frames as base64 JPEG + surrounding clip prompts
- System prompt instructs Gemini to create a smooth narrative transition
- Temperature: 0.7, maxOutputTokens: 512

**Response:**
```json
{
  "status": "success",
  "suggested_prompt": "A smooth camera pan reveals..."
}
```

UI shows "AI-suggested" badge. User can edit, re-analyze, or type their own prompt.

---

## 5. Video Generation

User clicks "Generate" → modal closes immediately (non-blocking).

### Frontend → Backend (`/api/generate` POST)

```json
{
  "prompt": "user prompt or AI suggestion",
  "model": "fast" | "pro",
  "duration": "2.5",
  "resolution": "540p" | "720p" | "1080p",
  "fps": "24" | "25" | "48" | "50",
  "audio": "true" | "false",
  "cameraMotion": "none" | "dolly_in" | "dolly_out" | "jib_up" | etc,
  "aspectRatio": "16:9" | "9:16",
  "imagePath": "/path/to/frame.jpg",
  "audioPath": null
}
```

Duration is **auto-clamped** to the actual gap size (max 20s fast, 10s pro).

### Backend Pipeline

1. Load FastPipeline or ProPipeline based on model choice
2. Validate/prepare conditioning image (if image-to-video)
3. Encode text prompt (local or API)
4. Call `pipeline.generate()` with prompt, images, seed, dimensions, num_frames, frame_rate
5. Save output MP4 to temp directory
6. Return `{ status: "complete", video_path: "/path/to/output.mp4" }`

### Progress Polling

Frontend polls `/api/generation/progress` every 500ms:

```json
{
  "status": "running",
  "phase": "inference" | "loading_model" | "encoding_text" | "complete",
  "progress": 0-100,
  "currentStep": 12,
  "totalSteps": 50
}
```

---

## 6. Clip Insertion into Timeline

When generation completes (`useGapGeneration.ts` lines 209-344):

### Asset Creation

```typescript
{
  type: 'video',
  path: '/path/to/generated.mp4',
  prompt: gap.prompt,
  resolution: '540p',
  duration: gapDuration,
  generationParams: { mode, prompt, model, duration, resolution, fps, audio, cameraMotion },
  takes: [{ url, path, createdAt: Date.now() }],
  activeTakeIndex: 0
}
```

### Timeline Clip Creation

```typescript
{
  id: 'clip-{timestamp}-{random}',
  assetId: newAsset.id,
  type: 'video',
  startTime: gap.startTime,      // Exact gap start
  duration: gapDuration,          // Exact gap duration
  trimStart: 0,
  trimEnd: 0,
  speed: 1,
  trackIndex: gap.trackIndex,
  transitionIn: { type: 'none', duration: 0 },
  transitionOut: { type: 'none', duration: 0 },
  linkedClipIds: [audioClipId]    // If audio enabled
}
```

### Audio Handling

If `audio: true`, a linked audio clip is created on a separate audio track:
- Finds or creates an unlocked audio track
- Audio clip has same `startTime` and `duration`
- Both clips linked via `linkedClipIds` for group operations

Clips added via `setClips(prev => [...prev, ...newClips])`.

---

## 7. Generation Settings

Available in the modal UI:

| Setting | Options | Default |
|---------|---------|---------|
| Model | `fast`, `pro` | `fast` |
| Duration | 1-20s (clamped to gap) | gap duration |
| Resolution | `540p`, `720p`, `1080p` | `540p` |
| FPS | 24, 25, 48, 50 | 24 |
| Audio | on/off | off |
| Camera Motion | none, dolly_in/out, dolly_left/right, jib_up/down, focus_shift | none |
| Aspect Ratio | 16:9, 9:16 | 16:9 |

---

## 8. State Management

Gap state lives in `useGapGeneration` hook:

| State | Purpose |
|-------|---------|
| `selectedGap` | Currently selected gap `{ trackIndex, startTime, endTime }` |
| `gapGenerateMode` | `'text-to-video'` / `'image-to-video'` / `'text-to-image'` |
| `gapPrompt` | User's typed or AI-suggested prompt |
| `gapSettings` | Generation parameters (model, resolution, fps, etc.) |
| `gapImageFile` | User-uploaded reference image for I2V |
| `generatingGap` | Tracks in-progress generation (modal can close) |
| `gapSuggestion` | AI-suggested prompt text |
| `gapBeforeFrame` / `gapAfterFrame` | Extracted conditioning frames (file:// URLs) |

Generation progress managed separately via `useGeneration` hook (`isGenerating`, `progress`, `statusMessage`, `videoUrl`).

---

## 9. Edge Cases & Constraints

- **Gap < 50ms**: Not detected, not interactive
- **Audio track gaps**: Modal won't open (video generation only)
- **Single frame conditioning**: Only start-frame supported; end-frame selection reverses the output
- **No transition blending**: Generated clips insert with `transitionIn/Out = none`
- **Cancellation**: User can cancel via X button on the generating indicator (`regenCancel()`)
- **Takes system**: Each generation stored as a "take" on the asset; user can regenerate for alternatives
- **Non-blocking**: User can continue editing while generation runs in background

---

## 10. Close Gap (Ripple Delete)

Alternative to generation — user selects "Close gap":

1. Calculate gap duration
2. Shift all clips **on the same track** after the gap earlier by gap duration
3. Update subtitle clips similarly
4. Gap disappears as clips move together
