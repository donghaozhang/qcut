# MiniMax Music Generation — Integration Reference

**Date**: 2026-03-12
**Provider**: MiniMax (direct API, not FAL.ai)
**API Key**: `MINIMAX_API_KEY`
**Models**: `music-2.5+` (recommended), `music-2.5`
**Base URL**: `https://api.minimax.io/v1`

---

## Overview

MiniMax Music provides two APIs for AI music creation:
1. **Lyrics Generation** — generate song lyrics from a text prompt
2. **Music Generation** — compose a full song from lyrics + style prompt

Supports instrumental-only mode (`music-2.5+`), streaming output, and configurable audio format (MP3/WAV/PCM up to 44.1kHz/256kbps).

---

## Authentication

```
Authorization: Bearer {MINIMAX_API_KEY}
Content-Type: application/json
```

API keys are managed at: Account Management > API Keys on `platform.minimax.io`

---

## Lyrics Generation API

**Endpoint**: `POST https://api.minimax.io/v1/lyrics_generation`

### Request

| Parameter | Type | Required | Max Length | Description |
|-----------|------|----------|------------|-------------|
| `mode` | string | Yes | — | `"write_full_song"` or `"edit"` |
| `prompt` | string | No | 2000 | Theme/style description; random if empty |
| `lyrics` | string | No | 3500 | Existing lyrics for editing (`edit` mode only) |
| `title` | string | No | — | Song title; preserved if provided |

### Response

```json
{
  "song_title": "Rainy Night Blues",
  "style_tags": "Blues, Soulful, Male Vocals",
  "lyrics": "[Verse]\nRain falls on the window pane...\n[Chorus]\nOh, this rainy night...",
  "base_resp": {
    "status_code": 0,
    "status_msg": "success"
  }
}
```

### Structure Tags

Lyrics support 14 structure markers:
`[Intro]`, `[Verse]`, `[Pre-Chorus]`, `[Chorus]`, `[Hook]`, `[Drop]`, `[Bridge]`, `[Solo]`, `[Build-up]`, `[Instrumental]`, `[Breakdown]`, `[Break]`, `[Interlude]`, `[Outro]`

---

## Music Generation API

**Endpoint**: `POST https://api.minimax.io/v1/music_generation`

### Request

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `model` | string | Yes | — | `"music-2.5+"` (recommended) or `"music-2.5"` |
| `prompt` | string | Conditional | — | Style/mood/scenario (1–2000 chars). Required for instrumental; optional otherwise |
| `lyrics` | string | Conditional | — | Song lyrics (1–3500 chars). Required for non-instrumental; not needed for instrumental with `music-2.5+` |
| `is_instrumental` | boolean | No | `false` | Vocals-free music (`music-2.5+` only) |
| `lyrics_optimizer` | boolean | No | `false` | Auto-generates lyrics from prompt when `lyrics` is empty |
| `stream` | boolean | No | `false` | Enable streaming output |
| `output_format` | string | No | `"hex"` | `"url"` or `"hex"` (only `"hex"` with streaming) |
| `audio_setting` | object | No | — | Audio configuration (see below) |

### Audio Setting

| Property | Type | Options |
|----------|------|---------|
| `sample_rate` | integer | `16000`, `24000`, `32000`, `44100` |
| `bitrate` | integer | `32000`, `64000`, `128000`, `256000` |
| `format` | string | `"mp3"`, `"wav"`, `"pcm"` |

### Response

```json
{
  "data": {
    "status": 2,
    "audio": "<hex-encoded audio or URL>"
  },
  "trace_id": "abc123",
  "extra_info": {
    "music_duration": 180,
    "music_sample_rate": 44100,
    "music_channel": 2,
    "bitrate": 256000,
    "music_size": 5242880
  },
  "base_resp": {
    "status_code": 0,
    "status_msg": "success"
  }
}
```

### Generation Status

| Status | Meaning |
|--------|---------|
| `1` | In progress (poll again) |
| `2` | Completed |

When `output_format: "url"`, the audio URL expires after **24 hours**.

---

## Error Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1002` | Rate limit exceeded |
| `1004` | Authentication failed |
| `1008` | Insufficient balance |
| `1026` | Sensitive content flagged |
| `2013` | Invalid parameters |
| `2049` | Invalid API key |

---

## Example Requests

### Generate Lyrics

```bash
curl -X POST https://api.minimax.io/v1/lyrics_generation \
  -H "Authorization: Bearer $MINIMAX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "write_full_song",
    "prompt": "a soulful blues song about a rainy night"
  }'
```

### Generate Music (with vocals)

```bash
curl -X POST https://api.minimax.io/v1/music_generation \
  -H "Authorization: Bearer $MINIMAX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "music-2.5+",
    "prompt": "soulful blues, slow tempo, warm male vocals",
    "lyrics": "[Verse]\nRain falls on the window pane\nI watch the drops like tears\n[Chorus]\nOh this rainy night, it holds me tight",
    "output_format": "url",
    "audio_setting": {
      "sample_rate": 44100,
      "bitrate": 256000,
      "format": "mp3"
    }
  }'
```

### Generate Instrumental

```bash
curl -X POST https://api.minimax.io/v1/music_generation \
  -H "Authorization: Bearer $MINIMAX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "music-2.5+",
    "prompt": "cinematic orchestral, epic, rising tension",
    "is_instrumental": true,
    "output_format": "url",
    "audio_setting": {
      "sample_rate": 44100,
      "bitrate": 256000,
      "format": "mp3"
    }
  }'
```

### Auto-Generate Lyrics + Music

```bash
curl -X POST https://api.minimax.io/v1/music_generation \
  -H "Authorization: Bearer $MINIMAX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "music-2.5+",
    "prompt": "upbeat pop song about summer adventures",
    "lyrics_optimizer": true,
    "output_format": "url",
    "audio_setting": {
      "sample_rate": 44100,
      "bitrate": 256000,
      "format": "mp3"
    }
  }'
```

---

## Key Differences from Speech Models

| Aspect | MiniMax Music | Speech (FAL.ai) |
|--------|--------------|------------------|
| Provider | Direct MiniMax API | FAL.ai proxy |
| Auth | `MINIMAX_API_KEY` | `VITE_FAL_API_KEY` / `FAL_KEY` |
| Output | Full songs (minutes) | Short speech clips (seconds) |
| Polling | Status `1` → poll, `2` → done | FAL queue pattern |
| Format options | MP3/WAV/PCM, configurable bitrate/sample rate | WAV only |
| Streaming | Supported (hex format only) | Not supported |

---

## Integration Notes

- **New env var needed**: `MINIMAX_API_KEY` — add to `.env`, `electron/` handlers, and env docs
- **Polling required**: Music generation is async — poll until `data.status === 2`
- **URL expiry**: When using `output_format: "url"`, download the audio promptly (24h expiry)
- **Hex decoding**: Default `output_format: "hex"` returns hex-encoded audio that needs decoding
- **Songs tab candidate**: The empty "Songs" tab in the Sounds panel is a natural home for music generation UI
- **Two-step workflow**: Optional lyrics generation → music generation (or single-step with `lyrics_optimizer`)
