# Chatterbox Audio Models — TTS & Speech-to-Speech via FAL.ai

**Date**: 2026-03-12
**Estimated Total**: ~70 minutes (5 subtasks)
**Priority**: High — First dedicated speech generation models in QCut; unlocks voiceover, dubbing, and voice cloning workflows
**Provider**: FAL.ai (uses existing `VITE_FAL_API_KEY` / `FAL_KEY`)

---

## Overview

Integrate Resemble AI's Chatterbox speech models into QCut via FAL.ai. Chatterbox offers three variants:

| Variant | Endpoint | Input | Output | Price |
|---------|----------|-------|--------|-------|
| Text-to-Speech | `fal-ai/chatterbox/text-to-speech` | Text + optional voice ref audio | WAV audio | $0.025/1000 chars |
| TTS Turbo | `fal-ai/chatterbox/text-to-speech/turbo` | Text + optional voice ref audio | WAV audio | TBD |
| Speech-to-Speech | `fal-ai/chatterbox/speech-to-speech` | Source audio + optional target voice | WAV audio | TBD |

### Key Features

- **Voice cloning**: Pass a reference `audio_url` to clone any voice style
- **Emotive tags**: `<laugh>`, `<chuckle>`, `<sigh>`, `<cough>`, `<sniffle>`, `<groan>`, `<yawn>`, `<gasp>`
- **Fine control**: `exaggeration` (0-1), `temperature` (0.05-2.0), `cfg` (0.1-1.0), `seed`
- **Voice conversion**: Speech-to-speech transforms voice while preserving content

### API Reference

**Text-to-Speech Input:**
```json
{
  "text": "Hello world! <laugh>",
  "audio_url": "https://example.com/reference-voice.mp3",
  "exaggeration": 0.25,
  "temperature": 0.7,
  "cfg": 0.5,
  "seed": 42
}
```

**Speech-to-Speech Input:**
```json
{
  "source_audio_url": "https://example.com/source.wav",
  "target_voice_audio_url": "https://example.com/target-voice.wav"
}
```

**Shared Output:**
```json
{
  "audio": {
    "url": "https://v3.fal.media/files/.../output.wav",
    "content_type": "audio/wav",
    "file_name": "output.wav",
    "file_size": 123456
  }
}
```

---

## Existing Infrastructure to Reuse

The **Sounds panel** (`sounds.tsx`) already provides audio browsing, preview playback, and timeline placement. We reuse this infrastructure instead of building a new AI Speech tab from scratch.

| What exists | Where | Reuse for |
|-------------|-------|-----------|
| Sounds panel with 3 tabs (Sound Effects, **Songs** (empty), Saved) | `apps/web/src/components/editor/media-panel/views/sounds.tsx` | Add TTS/S2S as a 4th tab or repurpose the empty "Songs" tab |
| `addSoundToTimeline()` — fetches audio blob, creates media item, adds to audio track | `apps/web/src/stores/media/sounds-store.ts` | Reuse for placing generated speech on timeline |
| `AudioItem` component — play, save, add-to-timeline buttons | `apps/web/src/components/editor/media-panel/views/sounds.tsx` | Reuse for generated speech result display |
| `SoundEffect` / `SavedSound` types | `apps/web/src/types/sounds.ts` | Extend or map generated speech to these types |
| Audio preview playback via platform abstraction | `sounds.tsx` + `sound-handler.ts` | Reuse for previewing generated speech |
| `addMediaAtTime()` — finds/creates audio track, checks overlaps | `apps/web/src/stores/timeline/timeline-add-ops.ts` | Already handles audio placement correctly |
| Sounds store with saved sounds (localStorage) | `apps/web/src/stores/media/sounds-store.ts` | Save generated voices to "Saved" tab for reuse |
| Audio generation tab pattern (Kling video-to-audio) | `apps/web/src/components/editor/media-panel/views/video-edit-audio-gen.tsx` | Reference for generation UI pattern (input → generate → preview → add) |

---

## Subtask 1: Model Config & Constants (~15 min)

Create `speech-models-config.ts` following the established pattern.

### Files to create

- `apps/web/src/components/editor/media-panel/views/ai/constants/speech-models-config.ts`
  - Define `SPEECH_MODELS` object with `chatterbox_tts`, `chatterbox_tts_turbo`, `chatterbox_s2s`
  - Export `SPEECH_MODEL_ORDER`, `getSpeechModelsInOrder()`, `type SpeechModelId`
  - Follow the `AIModel` interface pattern with `category: "speech"` and `endpoints`

### Files to modify

- `apps/web/src/components/editor/media-panel/views/ai/constants/ai-constants.ts`
  - Import and re-export `SPEECH_MODELS`, `SPEECH_MODEL_ORDER`, `getSpeechModelsInOrder`, `SpeechModelId`
  - Add speech models to `AI_MODELS` array
  - Add `CHATTERBOX_CONFIG` constant (similar to `LTX23_CONFIG`):
    ```typescript
    export const CHATTERBOX_CONFIG = {
      TTS: {
        ENDPOINT: "fal-ai/chatterbox/text-to-speech",
        TURBO_ENDPOINT: "fal-ai/chatterbox/text-to-speech/turbo",
        MAX_TEXT_LENGTH: 5000,
        DEFAULT_EXAGGERATION: 0.25,
        DEFAULT_TEMPERATURE: 0.7,
        DEFAULT_CFG: 0.5,
        PRICING_PER_1K_CHARS: 0.025,
        EMOTIVE_TAGS: ["laugh", "chuckle", "sigh", "cough", "sniffle", "groan", "yawn", "gasp"],
      },
      S2S: {
        ENDPOINT: "fal-ai/chatterbox/speech-to-speech",
        MAX_AUDIO_DURATION_SEC: 30,
      },
    } as const;
    ```
  - Add voice ref upload constraints to `UPLOAD_CONSTANTS`:
    ```typescript
    ALLOWED_VOICE_REF_TYPES: ["audio/mpeg", "audio/wav", "audio/aac"],
    MAX_VOICE_REF_SIZE_BYTES: 10 * 1024 * 1024,
    VOICE_REF_FORMATS_LABEL: "MP3, WAV, AAC",
    ```

- `apps/web/src/components/editor/media-panel/views/ai/constants/model-config-validation.ts`
  - Add `SPEECH` to validation categories

### Model config template

```typescript
export const SPEECH_MODELS = {
  chatterbox_tts: {
    id: "chatterbox_tts",
    name: "Chatterbox TTS",
    description: "High-quality text-to-speech with voice cloning and emotive expressions",
    price: "0.025/1k chars",
    category: "speech",
    endpoints: { text_to_speech: "fal-ai/chatterbox/text-to-speech" },
    default_params: { exaggeration: 0.25, temperature: 0.7, cfg: 0.5 },
  },
  chatterbox_tts_turbo: {
    id: "chatterbox_tts_turbo",
    name: "Chatterbox TTS Turbo",
    badge: "Fast",
    description: "Faster TTS generation with slightly reduced quality",
    price: "TBD",
    category: "speech",
    endpoints: { text_to_speech: "fal-ai/chatterbox/text-to-speech/turbo" },
    default_params: { exaggeration: 0.25, temperature: 0.7, cfg: 0.5 },
  },
  chatterbox_s2s: {
    id: "chatterbox_s2s",
    name: "Chatterbox Voice Convert",
    description: "Convert speech to a different voice while preserving content",
    price: "TBD",
    category: "speech",
    endpoints: { speech_to_speech: "fal-ai/chatterbox/speech-to-speech" },
  },
} as const;
```

---

## Subtask 2: FAL.ai API Integration Layer (~15 min)

Add Chatterbox-specific request/response handling to the existing FAL integration.

### Files to modify

- `apps/web/src/lib/ai-video/index.ts`
  - Add `generateSpeech()` function for TTS (text + optional voice ref → audio URL)
  - Add `convertSpeech()` function for S2S (source audio + optional target voice → audio URL)
  - Both use existing FAL queue pattern: `fal.queue.submit()` → `fal.queue.result()`
  - Handle the `{ audio: { url, content_type, file_name, file_size } }` response shape

### Files to check/reference

- `apps/web/src/lib/ai-video/generators/` — existing FAL queue workflow patterns
- `apps/web/src/components/editor/media-panel/views/ai/types/ai-types.ts` — add `SpeechGenerationRequest` type

### Implementation notes

- TTS payload: `{ text, audio_url?, exaggeration?, temperature?, cfg?, seed? }`
- S2S payload: `{ source_audio_url, target_voice_audio_url? }`
- Output: download `audio.url` WAV and return blob URL or saved file path
- Add timeout of 60s (speech generation is fast)

---

## Subtask 3: Sounds Panel — Speech Generation Tab (~20 min)

Add speech generation to the **existing Sounds panel** instead of creating a new AI panel tab. The Sounds panel already has the audio playback, save, and add-to-timeline infrastructure.

### Approach

The Sounds panel currently has 3 tabs: **Sound Effects**, **Songs** (placeholder), **Saved**. Add a new **"AI Voice"** tab (or repurpose "Songs" if not planned for other use).

### Files to modify

- `apps/web/src/components/editor/media-panel/views/sounds.tsx`
  - Add `AIVoiceView` component as a new tab:
    - Two sub-modes via toggle: "Text to Speech" / "Voice Convert"
    - **TTS mode**: text textarea, optional voice ref upload, model picker (Standard/Turbo), sliders for exaggeration/temperature/cfg, emotive tag chips for quick insertion
    - **S2S mode**: source audio upload (drag-drop or file picker), optional target voice upload
    - Generate button → shows loading spinner → renders result as `AudioItem` with play/save/add-to-timeline
  - Update tab bar: `["Sound Effects", "Songs", "Saved"]` → `["Sound Effects", "AI Voice", "Songs", "Saved"]`

- `apps/web/src/stores/media/sounds-store.ts`
  - Add `generateSpeech()` action: calls FAL TTS, stores result as a generated sound
  - Add `convertSpeech()` action: calls FAL S2S, stores result as a generated sound
  - Add `generatedSounds: SoundEffect[]` state for tracking generated audio in the current session
  - Reuse existing `addSoundToTimeline()` for placing generated speech — it already handles blob URLs, creates media items, and adds to audio tracks
  - Reuse existing `toggleSavedSound()` to let users save generated voices to the "Saved" tab

- `apps/web/src/types/sounds.ts`
  - Extend `SoundEffect` or add `GeneratedSpeech` type with:
    ```typescript
    interface GeneratedSpeech {
      id: string;               // unique generation ID
      name: string;             // auto-generated from text snippet
      url: string;              // blob URL or fal.media URL
      previewUrl: string;       // same as url for generated audio
      downloadUrl: string;      // fal.media URL for download
      duration: number;         // WAV duration in seconds
      text?: string;            // original TTS text (for TTS)
      model: string;            // model ID used
      voiceRef?: string;        // reference audio URL if used
      generatedAt: string;      // ISO date
    }
    ```

### UI layout (inside Sounds panel)

```
┌─────────────────────────────────────────────┐
│ [Sound Effects] [AI Voice] [Songs] [Saved]  │
├─────────────────────────────────────────────┤
│ [Text to Speech] [Voice Convert]            │
├─────────────────────────────────────────────┤
│ Enter text:                                 │
│ ┌─────────────────────────────────────────┐ │
│ │ Hello world! <laugh>                    │ │
│ └─────────────────────────────────────────┘ │
│ Tags: [laugh] [sigh] [gasp] [chuckle] ...  │
│                                             │
│ Voice ref: [Upload] (optional)              │
│ Model: [Standard ▾]  [Turbo ▾]             │
│                                             │
│ Exaggeration ──●────── 0.25                 │
│ Temperature  ────●──── 0.70                 │
│                                             │
│ [Generate]                                  │
├─────────────────────────────────────────────┤
│ ▶ output.wav  0:04  [Save] [+ Timeline]    │  ← reuses AudioItem
└─────────────────────────────────────────────┘
```

### Why Sounds panel, not AI panel

- **Reuse**: Sounds panel already has `AudioItem`, playback, save, and `addSoundToTimeline()` — zero new timeline integration code
- **User mental model**: Speech is audio. Users look in the audio/sounds area for audio tools, not in the video AI area
- **Consistency**: Generated speech results appear alongside sound effects and saved sounds — one place for all audio
- **Reference pattern**: `video-edit-audio-gen.tsx` (Kling audio) is in the video-edit area because it generates audio *from video*. Chatterbox generates audio from *text/speech*, which belongs with other audio tools

---

## Subtask 4: CLI Commands — `generate-speech` & `convert-speech` (~15 min)

Add two new top-level CLI commands for speech generation.

### Files to modify

- `electron/native-pipeline/cli/cli-handlers-media.ts`
  - Add `handleGenerateSpeech()` handler:
    - Required: `--text`
    - Optional: `--audio-url` (voice ref), `--model` (tts/turbo), `--exaggeration`, `--temperature`, `--cfg`, `--seed`
    - Output: downloaded WAV path
  - Add `handleConvertSpeech()` handler:
    - Required: `--input` (source audio path or URL)
    - Optional: `--audio-url` (target voice ref)
    - Output: downloaded WAV path

- `electron/native-pipeline/cli/cli-help.ts`
  - Add `generate-speech` and `convert-speech` to the help text commands list

- `electron/native-pipeline/cli/command-registry.ts`
  - Register `generate-speech` and `convert-speech` with flags, examples, and `category: "speech"`

- `electron/native-pipeline/cli/cli-runner/runner.ts`
  - Add routing for `generate-speech` and `convert-speech` commands

- `electron/native-pipeline/cli/cli-runner/types.ts`
  - Add speech-specific options: `exaggeration?: number`, `temperature?: number`, `cfg?: number`

### Example CLI usage

```bash
# Basic TTS
bun run pipeline generate-speech --text "Hello world!" --json

# TTS with voice cloning
bun run pipeline generate-speech \
  --text "Check this out! <laugh>" \
  --audio-url ./reference-voice.mp3 \
  --model chatterbox_tts_turbo \
  --exaggeration 0.5 \
  --json

# Voice conversion
bun run pipeline convert-speech \
  --input ./source-audio.wav \
  --audio-url ./target-voice.mp3 \
  --json
```

---

## Subtask 5: Tests (~10 min)

### Files to create

- `apps/web/src/components/editor/media-panel/views/ai/constants/__tests__/speech-models-config.test.ts`
  - Validate model IDs are unique
  - Validate all models have required fields (endpoints, category = "speech")
  - Validate `SPEECH_MODEL_ORDER` matches `SPEECH_MODELS` keys

- `electron/__tests__/cli-speech.test.ts`
  - Test `generate-speech` arg parsing (--text required, optional flags)
  - Test `convert-speech` arg parsing (--input required)
  - Test missing required flags produce clear errors
  - Test model selection defaults to `chatterbox_tts`

---

## Architecture Notes

### Why Sounds panel, not a new AI panel tab

The Sounds panel (`sounds.tsx`) already has:
- `AudioItem` component with play, save, and add-to-timeline buttons
- `addSoundToTimeline()` in the sounds store — handles blob fetching, media creation, and audio track placement via `addMediaAtTime()`
- Saved sounds with localStorage persistence
- Audio preview playback with platform abstraction (file:// URLs via `sounds:download-preview`)

Building inside the Sounds panel means **zero new timeline integration code** — generated speech flows through the same path as Freesound sound effects.

### Long-term extensibility

This architecture supports future audio models without modification:
- Additional TTS providers (ElevenLabs, OpenAI TTS) → add to `SPEECH_MODELS`, same UI flow
- Music generation (Suno, Udio) → repurpose the "Songs" tab with same `AudioItem` + `addSoundToTimeline()` pattern
- Audio effects (noise removal, enhancement) → new tab in Sounds panel
- The `speech-models-config.ts` pattern scales identically to how T2V/I2V/Avatar grew

### Voice reference management (future)

A future enhancement could add a voice library in the "Saved" tab for reusing reference audio clips across generations. For now, voice refs are uploaded per-generation.

---

## Implementation Order

| # | Subtask | Depends On | Est. |
|---|---------|-----------|------|
| 1 | Model Config & Constants | — | 15 min |
| 2 | FAL.ai API Integration | 1 | 15 min |
| 3 | Sounds Panel — AI Voice Tab | 1, 2 | 20 min |
| 4 | CLI Commands | 1, 2 | 15 min |
| 5 | Tests | 1, 4 | 10 min |

Subtasks 3 and 4 can be parallelized after subtask 2 completes.

---

## Key Source Files

| Component | File |
|-----------|------|
| Sounds panel UI | `apps/web/src/components/editor/media-panel/views/sounds.tsx` |
| Sounds store | `apps/web/src/stores/media/sounds-store.ts` |
| Sound types | `apps/web/src/types/sounds.ts` |
| Sound search hook | `apps/web/src/hooks/media/use-sound-search.ts` |
| Electron sound handler | `electron/sound-handler.ts` |
| Timeline audio placement | `apps/web/src/stores/timeline/timeline-add-ops.ts` |
| Audio gen reference (Kling) | `apps/web/src/components/editor/media-panel/views/video-edit-audio-gen.tsx` |
| AI model constants | `apps/web/src/components/editor/media-panel/views/ai/constants/ai-constants.ts` |
| AI model validation | `apps/web/src/components/editor/media-panel/views/ai/constants/model-config-validation.ts` |
| FAL integration | `apps/web/src/lib/ai-video/index.ts` |
| CLI media handlers | `electron/native-pipeline/cli/cli-handlers-media.ts` |
| CLI command registry | `electron/native-pipeline/cli/command-registry.ts` |
| CLI runner | `electron/native-pipeline/cli/cli-runner/runner.ts` |
| CLI types | `electron/native-pipeline/cli/cli-runner/types.ts` |
