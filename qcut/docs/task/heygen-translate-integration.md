# HeyGen Video Translate (Speed Mode) Integration

**API**: `fal-ai/heygen/v2/translate/speed`
**Cost**: $0.05/sec of output video
**Purpose**: Translate video audio + lip-sync to 40+ languages via HeyGen Speed mode

---

## API Reference

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `video_url` | string | Yes | URL of the video to translate |
| `output_language` | OutputLanguageEnum | Yes | Target language (40+ supported) |
| `translate_audio_only` | boolean | No | Translate voice track only, skip face lip-sync |
| `speaker_num` | integer | No | Number of speakers in the video |
| `enable_dynamic_duration` | boolean | No | Adapt duration for cross-language speaking rates (default: true) |

**Output**: `{ video: { url: string } }`

**Supported Languages**: English, Spanish, French, Hindi, Italian, German, Polish, Portuguese, Chinese, Japanese, Dutch, Turkish, Korean, Danish, Arabic, Romanian, Mandarin, Filipino, Swedish, Indonesian, Ukrainian, Greek, Czech, Bulgarian, Malay, Slovak, Croatian, Tamil, Finnish, Russian, + 40 regional variants.

---

## Subtasks

### 1. Register HeyGen Translate model in CLI registry
**Time**: ~10 min
**Files**:
- `electron/native-pipeline/registry-data/platform-models.ts` — add `heygen_translate_speed` to `registerHeyGenModels()`

**Details**:
Add a new `ModelRegistry.register()` call alongside the existing `heygen_avatar` entry:

```typescript
ModelRegistry.register({
  key: "heygen_translate_speed",
  name: "HeyGen Translate (Speed)",
  provider: "HeyGen",
  endpoint: "fal-ai/heygen/v2/translate/speed",
  categories: ["video_to_video"],
  description: "Translate video audio with lip-sync to 40+ languages (Speed mode)",
  pricing: { type: "per_second", cost: 0.05 },
  defaults: { enable_dynamic_duration: true },
  features: ["translation", "lip_sync", "multi_language", "audio_only_mode"],
  maxDuration: 300,
  costEstimate: 0.5,
  processingTime: 120,
});
```

---

### 2. Create translate generator function
**Time**: ~20 min
**Files**:
- `apps/web/src/lib/ai-video/generators/translate.ts` — new generator file

**Details**:
Follow the WAN v2.6 generator pattern (`generators/text-to-video/wan26-generator.ts`):
- Export `generateHeyGenTranslate(request, onProgress?)`
- Use `withErrorHandling` wrapper from `base-generator.ts`
- Use `getFalApiKeyAsync()` for API key
- Use `makeFalRequest()` with `queueMode: true` for queue submission
- Use `pollQueueStatus()` for async polling
- Input type: `HeyGenTranslateRequest` (video_url, output_language, translate_audio_only?, speaker_num?, enable_dynamic_duration?)
- Return `VideoGenerationResponse` with translated video URL

**Request type** (add to `apps/web/src/types/ai-types.ts` or co-locate):
```typescript
export interface HeyGenTranslateRequest {
  video_url: string;
  output_language: string;
  translate_audio_only?: boolean;
  speaker_num?: number;
  enable_dynamic_duration?: boolean;
}
```

---

### 3. Create translate validator
**Time**: ~10 min
**Files**:
- `apps/web/src/lib/ai-video/validation/validators/translate-validators.ts` — new validator

**Details**:
Follow pattern from existing validators (e.g., `lipsync-validators.ts`):
- `validateTranslateVideoUrl(url)` — ensure non-empty, valid URL format
- `validateTranslateLanguage(lang)` — check against supported language list
- `validateTranslateSpeakerNum(num)` — if provided, must be positive integer
- Export a `SUPPORTED_TRANSLATE_LANGUAGES` constant array

---

### 4. Add CLI pipeline command for translate
**Time**: ~20 min
**Files**:
- `electron/native-pipeline/cli/commands/` — add translate command (check existing command pattern)
- `electron/native-pipeline/infra/api-caller.ts` — no changes needed, existing FAL queue flow handles it

**Details**:
Create a CLI command that:
- Accepts `--video <url-or-path>` and `--language <target>`
- Uploads local video file via `uploadToFalCDN()` if path is local
- Calls `callModelApi()` with endpoint `fal-ai/heygen/v2/translate/speed`
- Downloads result video to output path
- Shows progress via `onProgress` callback

---

### 5. Create Translate UI panel component
**Time**: ~30 min
**Files**:
- `apps/web/src/components/editor/media-panel/views/video-edit-translate.tsx` — new panel view

**Details**:
Follow the `video-edit-audio-sync.tsx` pattern (operates on existing timeline clip):
- **Video source**: Use selected timeline clip's video URL, or allow URL input
- **Language selector**: Dropdown with `SUPPORTED_TRANSLATE_LANGUAGES`
- **Options**:
  - Toggle: "Audio only" (translate_audio_only)
  - Number input: Speaker count (speaker_num)
  - Toggle: Dynamic duration (enable_dynamic_duration, default on)
- **Generate button**: Calls `generateHeyGenTranslate()`
- **Progress bar**: Uses `onProgress` callback for queue status
- **Result**: Preview translated video, option to add to timeline or save

---

### 6. Wire translate panel into media panel navigation
**Time**: ~15 min
**Files**:
- `apps/web/src/components/editor/media-panel/media-panel.tsx` — add "Translate" entry to panel views
- `apps/web/src/components/editor/media-panel/views/index.ts` — export new view
- Panel constants/config where views are registered

**Details**:
Add a "Translate" option alongside existing panels (Audio, Upscale, etc.). Should appear in the video-edit context menu or as a tab when a video clip is selected.

---

### 7. Add upload support for local video files
**Time**: ~15 min
**Files**:
- `apps/web/src/lib/ai-video/core/fal-upload.ts` — reuse existing upload flow
- `apps/web/src/components/editor/media-panel/views/video-edit-translate.tsx` — file picker integration

**Details**:
When translating a local video (not a URL):
- Use existing `uploadViaElectronIPC()` or browser `uploadToFal()`
- Get back `file_url` from FAL CDN
- Pass `file_url` as `video_url` to the translate API
- Show upload progress before generation begins

---

### 8. Unit tests
**Time**: ~20 min
**Files**:
- `apps/web/src/lib/ai-video/generators/__tests__/translate.test.ts` — generator tests
- `apps/web/src/lib/ai-video/validation/__tests__/translate-validators.test.ts` — validator tests

**Tests**:
- Generator: mock `makeFalRequest` + `pollQueueStatus`, verify payload shape, error handling, progress callbacks
- Validators: test language validation, URL validation, speaker_num bounds, empty inputs
- Verify `translate_audio_only` flag is correctly passed through

---

## Implementation Order

1. **Subtask 3** — Validators (no dependencies)
2. **Subtask 2** — Generator (uses validators)
3. **Subtask 1** — CLI registry (standalone)
4. **Subtask 4** — CLI command (uses registry + generator pattern)
5. **Subtask 5** — UI panel component
6. **Subtask 7** — Upload integration in UI
7. **Subtask 6** — Wire into media panel nav
8. **Subtask 8** — Tests (after implementation stable)

## Supported Languages Reference

```typescript
export const HEYGEN_TRANSLATE_LANGUAGES = [
  "English", "Spanish", "French", "Hindi", "Italian", "German",
  "Polish", "Portuguese", "Chinese", "Japanese", "Dutch", "Turkish",
  "Korean", "Danish", "Arabic", "Romanian", "Mandarin", "Filipino",
  "Swedish", "Indonesian", "Ukrainian", "Greek", "Czech", "Bulgarian",
  "Malay", "Slovak", "Croatian", "Tamil", "Finnish", "Russian",
] as const;
```

Note: HeyGen also supports 40+ regional variants (e.g., American English, Brazilian Portuguese). Full list available from the API schema.
