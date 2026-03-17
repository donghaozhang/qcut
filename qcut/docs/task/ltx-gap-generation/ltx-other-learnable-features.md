# Other LTX-Desktop Features QCut Can Learn From

Beyond gap generation, these LTX patterns are worth adopting in QCut.

---

## 1. Takes / Regeneration System (High Priority)

LTX stores multiple AI generation attempts per asset. Users browse versions without losing previous ones.

**How it works:**
- Each asset has `takes: Array<{ url, path, createdAt }>` and `activeTakeIndex`
- Timeline clips reference a specific take via `takeIndex`
- Context menu shows "Take: 2/5" with left/right navigation arrows
- Linked clips (video + audio) switch takes together
- Individual takes can be deleted

**Key files:**
- `frontend/hooks/use-retake.ts` — take switching logic
- `frontend/views/editor/useRegeneration.ts` — regenerate and append new take
- `frontend/components/RetakePanel.tsx` — filmstrip preview of takes

**QCut adaptation:** Add `takes` array to `MediaItem.metadata`. When regenerating a gap fill or any AI clip, append to takes instead of replacing. Add take navigation to clip context menu.

---

## 2. Clip Context Menu with AI Tools Section (High Priority)

LTX has an 800-line context menu with structured sections and AI-specific actions.

**Sections:**
- Clipboard (Cut/Copy/Paste)
- Edit (Duplicate, Split at Playhead)
- Properties (Speed presets: 0.25x–4x, Reverse, Mute)
- Transform (Flip H/V with visual badges)
- Structure (Link/Unlink audio, color labels)
- **AI Tools** (Regenerate, Take navigation, Upscale, I2V, Retake, IC-LoRA, A2V, Capture Frame)
- Navigation (Reveal in Assets, Reveal in Finder)
- Delete (always last, red)

**Multi-clip menu:** Batch speed, mute, reverse, flip, color labels on N selected clips.

**Key file:** `frontend/views/editor/ClipContextMenu.tsx`

**QCut adaptation:** Add "AI Tools" section to existing element context menu. Start with Regenerate + Take navigation for AI-generated clips.

---

## 3. Camera Motion Presets (Medium Priority)

8 camera motion options applied as generation parameters:

| Preset | Effect |
|--------|--------|
| `none` | No camera movement |
| `static` | Locked camera |
| `focus_shift` | Rack focus effect |
| `dolly_in` / `dolly_out` | Push in / pull out |
| `dolly_left` / `dolly_right` | Lateral tracking |
| `jib_up` / `jib_down` | Crane up / crane down |

These are sent as a parameter to the generation API and some models append motion tokens to the prompt.

**Key file:** `frontend/components/SettingsPanel.tsx`

**QCut adaptation:** Add motion preset selector to gap generation modal and AI video panel. Most FAL models accept camera motion parameters.

---

## 4. Asset Organization: Bins + Color Labels (Medium Priority)

LTX organizes assets with folder-like bins and visual color labels.

**Bins:** Named asset folders (e.g. "Voiceovers", "Generated Shots"). Assets have a `bin` string field.

**Color labels:** 8 colors (violet, blue, green, yellow, red, rose, orange) on assets AND clips. Shown as colored dots in asset list and clip context menu. Useful for quick visual sorting.

**Favorites:** Boolean flag per asset, filterable in asset panel.

**Sorting:** By name, type, duration, resolution, date, color label.

**Key file:** `frontend/views/editor/LeftPanel.tsx`

**QCut adaptation:** QCut already has virtual folders. Add color labels to `MediaItem` and timeline elements. Add color label to clip context menu. Sort media panel by label.

---

## 5. Auto Prompt from Frame (Medium Priority)

When regenerating an imported clip (no original prompt), LTX auto-generates a prompt:

1. Extract first frame from video (or use image directly)
2. Send to Gemini multimodal: "Describe this frame as a video generation prompt"
3. Store result on the asset's `generationParams.prompt`
4. Future regenerations reuse this prompt instantly

**Key file:** `frontend/views/editor/useRegeneration.ts` (lines 193–254)

**QCut adaptation:** When user wants to regenerate any clip, if no prompt exists, auto-describe via Gemini. Store on `MediaItem.metadata.prompt`. Same Gemini handler already exists.

---

## 6. Audio-to-Video (A2V) (Low Priority)

Right-click an audio clip → "Create Video (A2V)". Generates video driven by audio content/rhythm.

**Flow:** Extract audio file path → open generation modal in A2V mode → send audio as conditioning → insert video on video track linked to audio.

**QCut adaptation:** Could be interesting future feature. Requires model support for audio conditioning (WAN 2.6 supports this via FAL).

---

## 7. Generation Parameter Persistence (Medium Priority)

LTX saves full generation settings on every generated asset:

```typescript
asset.generationParams = {
  mode: 'text-to-video',
  prompt: 'A man walks...',
  model: 'fast',
  duration: 5,
  resolution: '720p',
  fps: 24,
  audio: true,
  cameraMotion: 'dolly_in',
  imageAspectRatio: '16:9',
  imageSteps: 30
}
```

This enables:
- **Regenerate with same settings** — one-click re-roll
- **Copy settings** — apply one clip's generation params to another
- **Generation audit trail** — know exactly how any clip was made

**QCut adaptation:** Store generation params in `MediaItem.metadata.generationParams`. Pre-fill modal when regenerating.

---

## 8. IC-LoRA / Style Transfer (Low Priority)

LTX supports training and applying LoRA adapters for consistent character/style:

- Upload reference images → train IC-LoRA adapter
- Apply adapter to new generations for style consistency
- Requires local model download (gated behind model status check)

**Key files:** `frontend/components/ICLoraPanel.tsx`, `frontend/hooks/use-ic-lora.ts`

**QCut adaptation:** Not directly applicable since QCut uses cloud APIs (FAL). But FAL does offer some LoRA/IP-adapter endpoints. Could be a future feature.

---

## 9. Model Download Management (Low Priority for QCut)

LTX manages local AI model downloads with:
- Status dashboard showing `downloaded_size_gb / total_size_gb`
- Per-model progress polling (`/api/models/download/progress?sessionId=...`)
- Feature locking until dependencies downloaded
- Session-based downloads with progress callbacks

**Key file:** `frontend/components/ModelStatusDropdown.tsx`

**QCut adaptation:** Not directly needed (QCut uses cloud APIs). But the pattern of feature-gating behind dependency checks is useful for FFmpeg or other binary dependencies.

---

## Priority Ranking for QCut

| Feature | Effort | Impact | Priority |
|---------|--------|--------|----------|
| Takes system | Medium | High | 1 |
| AI Tools in context menu | Low | High | 2 |
| Generation param persistence | Low | Medium | 3 |
| Auto prompt from frame | Low | Medium | 4 |
| Camera motion presets | Low | Medium | 5 |
| Color labels on clips | Medium | Medium | 6 |
| Audio-to-Video | Medium | Low | 7 |
| IC-LoRA / Style Transfer | High | Low | 8 |
