# Speech Models — TTS, Voice Cloning & Speech-to-Speech via FAL.ai

**Date**: 2026-03-12
**Estimated Total**: ~70 minutes (5 subtasks) — Chatterbox done, +45 min for new models (Subtask 6)
**Priority**: High — First dedicated speech generation models in QCut; unlocks voiceover, dubbing, and voice cloning workflows
**Provider**: FAL.ai (uses existing `VITE_FAL_API_KEY` / `FAL_KEY`)
**Status**: Subtasks 1-5 implemented. Subtask 6 (ElevenLabs + Qwen3) pending.

---

## Overview

Integrate multiple speech models into QCut via FAL.ai. Three providers, eight model variants:

### Chatterbox (Resemble AI)

| Variant | Endpoint | Input | Output | Price |
|---------|----------|-------|--------|-------|
| Text-to-Speech | `fal-ai/chatterbox/text-to-speech` | Text + optional voice ref audio | WAV audio | $0.025/1k chars |
| TTS Turbo | `fal-ai/chatterbox/text-to-speech/turbo` | Text + optional voice ref audio | WAV audio | TBD |
| Speech-to-Speech | `fal-ai/chatterbox/speech-to-speech` | Source audio + optional target voice | WAV audio | TBD |

### ElevenLabs

| Variant | Endpoint | Input | Output | Price |
|---------|----------|-------|--------|-------|
| Eleven v3 TTS | `fal-ai/elevenlabs/tts/eleven-v3` | Text + voice name + style controls | Audio file | TBD |

### Qwen3 TTS (Alibaba)

| Variant | Endpoint | Input | Output | Price |
|---------|----------|-------|--------|-------|
| Text-to-Speech | `fal-ai/qwen-3-tts/text-to-speech/1.7b` | Text + voice preset or cloned embedding | Audio (with duration/sample_rate) | TBD |
| Clone Voice | `fal-ai/qwen-3-tts/clone-voice/1.7b` | Reference audio + optional text | Speaker embedding (.safetensors) | TBD |

### Key Features

**Chatterbox:**
- **Voice cloning**: Pass a reference `audio_url` to clone any voice style
- **Emotive tags**: `<laugh>`, `<chuckle>`, `<sigh>`, `<cough>`, `<sniffle>`, `<groan>`, `<yawn>`, `<gasp>`
- **Fine control**: `exaggeration` (0-1), `temperature` (0.05-2.0), `cfg` (0.1-1.0), `seed`
- **Voice conversion**: Speech-to-speech transforms voice while preserving content

**ElevenLabs Eleven v3:**
- **Named voices**: Built-in voice presets (default: "Rachel")
- **Stability control**: `stability` (0-1, default 0.5)
- **Multilingual**: `language_code` for non-English text
- **Word timestamps**: Optional word-level timing data
- **Text normalization**: `apply_text_normalization` (auto/on/off)
- **Streaming**: Supports chunked audio streaming

**Qwen3 TTS:**
- **9 built-in voices**: Vivian, Serena, Uncle_Fu, Dylan, Eric, Ryan, Aiden, Ono_Anna, Sohee
- **Voice cloning**: Two-step process — clone voice → get embedding → use in TTS
- **Style prompt**: Optional `prompt` to guide speech style
- **10 languages**: Auto, English, Chinese, Spanish, French, German, Italian, Japanese, Korean, Portuguese, Russian
- **Fine sampling**: `temperature`, `top_k`, `top_p`, `repetition_penalty`, sub-talker controls
- **Rich output**: Returns `duration`, `sample_rate`, `channels` alongside audio URL

### API Reference

**Chatterbox TTS Input:**
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

**Chatterbox S2S Input:**
```json
{
  "source_audio_url": "https://example.com/source.wav",
  "target_voice_audio_url": "https://example.com/target-voice.wav"
}
```

**ElevenLabs Eleven v3 Input:**
```json
{
  "text": "Hello world!",
  "voice": "Rachel",
  "stability": 0.5,
  "timestamps": false,
  "language_code": "en",
  "apply_text_normalization": "auto"
}
```

**Qwen3 TTS Input:**
```json
{
  "text": "Hello world!",
  "voice": "Vivian",
  "language": "English",
  "prompt": "Read this in a cheerful tone",
  "temperature": 0.9,
  "top_k": 50,
  "top_p": 1,
  "repetition_penalty": 1.05,
  "max_new_tokens": 200
}
```

**Qwen3 TTS with Cloned Voice:**
```json
{
  "text": "Hello world!",
  "speaker_voice_embedding_file_url": "https://storage.googleapis.com/.../clone_out.safetensors",
  "reference_text": "Original text from the reference audio"
}
```

**Qwen3 Clone Voice Input:**
```json
{
  "audio_url": "https://example.com/reference-voice.mp3",
  "reference_text": "What was said in the reference audio"
}
```

**Shared Audio Output (Chatterbox / ElevenLabs):**
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

**Qwen3 TTS Output (richer):**
```json
{
  "audio": {
    "url": "https://v3.fal.media/files/.../output.wav",
    "duration": 4.2,
    "sample_rate": 24000,
    "channels": 1,
    "content_type": "audio/wav",
    "file_name": "output.wav"
  }
}
```

**Qwen3 Clone Voice Output:**
```json
{
  "speaker_embedding": {
    "url": "https://storage.googleapis.com/.../clone_out.safetensors",
    "file_name": "tmpe71u7t4j.safetensors",
    "content_type": "application/octet-stream",
    "file_size": 16288
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

### Model config template (Chatterbox — already implemented)

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
  chatterbox_tts_turbo: { /* ... */ },
  chatterbox_s2s: { /* ... */ },
  // ── New models to add (Subtask 6) ──
  elevenlabs_v3: {
    id: "elevenlabs_v3",
    name: "ElevenLabs v3",
    badge: "⭐ Premium",
    description: "Premium multilingual TTS with named voices and stability control",
    price: "TBD",
    category: "speech",
    endpoints: { text_to_speech: "fal-ai/elevenlabs/tts/eleven-v3" },
    default_params: { stability: 0.5 },
  },
  qwen3_tts: {
    id: "qwen3_tts",
    name: "Qwen3 TTS",
    description: "Multilingual TTS with 9 voices, style prompts, and 10 languages",
    price: "TBD",
    category: "speech",
    endpoints: { text_to_speech: "fal-ai/qwen-3-tts/text-to-speech/1.7b" },
    default_params: { temperature: 0.9, top_k: 50, top_p: 1, repetition_penalty: 1.05 },
  },
  qwen3_clone_voice: {
    id: "qwen3_clone_voice",
    name: "Qwen3 Voice Clone",
    description: "Clone any voice from a reference audio for use with Qwen3 TTS",
    price: "TBD",
    category: "speech",
    endpoints: { clone_voice: "fal-ai/qwen-3-tts/clone-voice/1.7b" },
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

## Subtask 6: ElevenLabs v3 + Qwen3 TTS Models (~45 min)

Add three new speech models to the existing infrastructure built in Subtasks 1-5.

### 6a: Model Config (~10 min)

Add to `speech-models-config.ts`:
- `elevenlabs_v3` — ElevenLabs Eleven v3 TTS
- `qwen3_tts` — Qwen3 Text-to-Speech
- `qwen3_clone_voice` — Qwen3 Voice Cloning (produces speaker embedding)

Add to `ai-constants.ts`:
- `ELEVENLABS_CONFIG` constant:
  ```typescript
  export const ELEVENLABS_CONFIG = {
    TTS: {
      ENDPOINT: "fal-ai/elevenlabs/tts/eleven-v3",
      DEFAULT_VOICE: "Rachel",
      DEFAULT_STABILITY: 0.5,
      VOICES: ["Rachel", "Clyde", "Domi", "Dave", "Fin", "Bella", "Antoni", "Thomas", "Charlie", "Emily"],
      TEXT_NORMALIZATION_OPTIONS: ["auto", "on", "off"],
    },
  } as const;
  ```
- `QWEN3_TTS_CONFIG` constant:
  ```typescript
  export const QWEN3_TTS_CONFIG = {
    TTS: {
      ENDPOINT: "fal-ai/qwen-3-tts/text-to-speech/1.7b",
      CLONE_ENDPOINT: "fal-ai/qwen-3-tts/clone-voice/1.7b",
      DEFAULT_TEMPERATURE: 0.9,
      DEFAULT_TOP_K: 50,
      DEFAULT_TOP_P: 1,
      DEFAULT_REPETITION_PENALTY: 1.05,
      MAX_NEW_TOKENS: 8192,
      VOICES: ["Vivian", "Serena", "Uncle_Fu", "Dylan", "Eric", "Ryan", "Aiden", "Ono_Anna", "Sohee"],
      LANGUAGES: ["Auto", "English", "Chinese", "Spanish", "French", "German", "Italian", "Japanese", "Korean", "Portuguese", "Russian"],
    },
  } as const;
  ```

Add `clone_voice` to `AIModelEndpoints` in `model-config.ts`.

### 6b: FAL.ai Integration (~10 min)

Add to `lib/ai-video/generators/speech.ts`:
- `generateElevenLabsSpeech()` — handles `voice`, `stability`, `language_code`, `timestamps`, `apply_text_normalization`
- `generateQwen3Speech()` — handles `voice` OR `speaker_voice_embedding_file_url`, `language`, `prompt`, `temperature`, `top_k`, `top_p`, `repetition_penalty`, `max_new_tokens`
- `cloneQwen3Voice()` — takes `audio_url` + optional `reference_text`, returns `{ embeddingUrl, fileName, fileSize }`

Update `lib/ai-video/index.ts` barrel exports.

### 6c: AI Voice Tab Update (~15 min)

Update `sounds-ai-voice.tsx`:
- Expand model picker from `[Standard, Turbo]` to show all TTS providers grouped:
  - Chatterbox: Standard, Turbo
  - ElevenLabs: v3
  - Qwen3: TTS (+ Clone Voice helper)
- Show provider-specific controls based on selected model:
  - **Chatterbox**: emotive tags, exaggeration/temperature/cfg sliders (existing)
  - **ElevenLabs**: voice preset dropdown, stability slider, language code input, timestamps toggle
  - **Qwen3**: voice preset dropdown OR "Clone Voice" upload flow, language dropdown, style prompt textarea, temperature/top_k/top_p sliders
- Qwen3 clone flow: user uploads reference audio → calls `cloneQwen3Voice()` → gets embedding URL → auto-fills for TTS generation

### 6d: CLI Commands (~5 min)

Update `cli-handlers-speech.ts`:
- Extend `handleGenerateSpeech()` model map to include `elevenlabs_v3` and `qwen3_tts`
- Add `handleCloneVoice()` for `clone-voice` command (Qwen3 only)

Update `command-registry.ts`:
- Add `clone-voice` command with `--input` (audio path/URL), `--text` (reference text)
- Extend `generate-speech` `--model` enum: `chatterbox_tts`, `chatterbox_tts_turbo`, `elevenlabs_v3`, `qwen3_tts`
- Add ElevenLabs-specific flags: `--voice`, `--stability`, `--language-code`

### 6e: Tests (~5 min)

Update `speech-models-config.test.ts`:
- Add test cases for new model IDs
- Verify endpoints for ElevenLabs and Qwen3

Add to `cli-speech.test.ts`:
- Test `generate-speech --model elevenlabs_v3 --voice Rachel`
- Test `generate-speech --model qwen3_tts --voice Vivian --language English`
- Test `clone-voice -i reference.mp3 --text "reference transcript"`

### Key differences between providers

| Feature | Chatterbox | ElevenLabs v3 | Qwen3 TTS |
|---------|-----------|---------------|-----------|
| Voice selection | Reference audio URL | Named presets | Presets + cloned embeddings |
| Voice cloning | Via `audio_url` param | Not available via FAL | Two-step: clone → embedding → TTS |
| Expressiveness | Emotive tags + sliders | `stability` param | `prompt` for style guidance |
| Multilingual | English only | Yes (`language_code`) | 10 languages |
| Output metadata | Basic (url, size) | Basic + optional timestamps | Rich (duration, sample_rate, channels) |
| Streaming | No | Yes (separate endpoint) | No |
| Unique strength | Emotive tags (`<laugh>`) | Premium quality, word timing | Open-source, style prompts |

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
- Additional TTS providers (OpenAI TTS, etc.) → add to `SPEECH_MODELS`, same UI flow
- ElevenLabs v3 and Qwen3 TTS are next (Subtask 6) — proves the multi-provider pattern
- Music generation (Suno, Udio) → repurpose the "Songs" tab with same `AudioItem` + `addSoundToTimeline()` pattern
- Audio effects (noise removal, enhancement) → new tab in Sounds panel
- The `speech-models-config.ts` pattern scales identically to how T2V/I2V/Avatar grew

### Voice reference management (future)

A future enhancement could add a voice library in the "Saved" tab for reusing reference audio clips across generations. For now, voice refs are uploaded per-generation.

---

## Implementation Order

| # | Subtask | Depends On | Est. | Status |
|---|---------|-----------|------|--------|
| 1 | Model Config & Constants (Chatterbox) | — | 15 min | Done |
| 2 | FAL.ai API Integration (Chatterbox) | 1 | 15 min | Done |
| 3 | Sounds Panel — AI Voice Tab | 1, 2 | 20 min | Done |
| 4 | CLI Commands (generate-speech, convert-speech) | 1, 2 | 15 min | Done |
| 5 | Tests (Chatterbox) | 1, 4 | 10 min | Done |
| 6 | ElevenLabs v3 + Qwen3 TTS Models | 1-5 | 45 min | Pending |

Subtask 6 builds on the proven Chatterbox infrastructure — same config pattern, same UI flow, same CLI structure.

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
