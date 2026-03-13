# Volcengine Ark Video Understanding — Performance Benchmarks

## Test Results (March 2026)

### YouTube Video Benchmarks (Files API upload, FPS=1)

4 YouTube videos, each trimmed to 15s, uploaded via Ark Files API, tested with both models:

| Video | Duration | Model | Analysis Time | Input Tokens | Output Tokens | Total Tokens |
|-------|----------|-------|--------------|-------------|--------------|-------------|
| Cooking | 15s | Seed 2.0 Lite | **5.3s** | 1,782 | 142 | 1,924 |
| Cooking | 15s | Seed 2.0 Pro | **20.4s** | 1,782 | 375 | 2,157 |
| Parkour (The Office) | 15s | Seed 2.0 Lite | **5.2s** | 2,215 | 241 | 2,456 |
| Parkour (The Office) | 15s | Seed 2.0 Pro | **8.2s** | 2,215 | 266 | 2,481 |
| Dog (wedding) | 15s | Seed 2.0 Lite | **5.7s** | 2,358 | 127 | 2,485 |
| Dog (wedding) | 15s | Seed 2.0 Pro | **18.9s** | 2,358 | 371 | 2,729 |
| Dance | 15s | Seed 2.0 Lite | **7.4s** | 2,358 | 109 | 2,467 |
| Dance | 15s | Seed 2.0 Pro | **13.3s** | 2,358 | 458 | 2,816 |

### Sample Video Benchmarks (URL input, FPS=1)

Volcengine's sample videos tested via direct URL:

| Video | Duration | Model | Analysis Time |
|-------|----------|-------|--------------|
| Big Ben timelapse | 5s | Seed 2.0 Lite | **12.0s** |
| Big Ben timelapse | 5s | Seed 1.6 | **13.7s** |
| Big Ben timelapse | 5s | Seed 2.0 Pro | **20.5s** |
| Boxing match | 5s | Seed 2.0 Pro | **23.0s** |
| YouTube cats (base64) | 15s | Seed 2.0 Pro | **~30s** |

### Summary: Average Analysis Time

| Model | Avg Time (15s video, Files API) | Avg Time (5s video, URL) |
|-------|---------------------------------|--------------------------|
| **Seed 2.0 Lite** | **5.9s** | ~12s |
| **Seed 1.6** | — | ~14s |
| **Seed 2.0 Pro** | **15.2s** | ~22s |

> Files API is significantly faster for analysis because the video is pre-processed server-side during upload.
> URL input requires server-side download + processing at request time.

---

## Input Method Performance Comparison

| Method | Upload Time | Analysis Time (15s video, Lite) | Total | Notes |
|--------|-----------|--------------------------------|-------|-------|
| **Files API** | ~5 min (one-time) | **5.3s** | 5.3s per query | Best for repeated analysis |
| **Video URL** | 0 | **~12s** | ~12s | Best for one-off, public URLs |
| **Base64** | 0 | **~445s** | ~445s | Extremely slow — avoid |

**Recommendation**: Use Files API for local files, URL for public videos. Never use base64 for videos.

---

## Token Usage (Observed)

### Actual Token Counts (15s videos, FPS=1)

| Video | Input Tokens | Output Tokens (Lite) | Output Tokens (Pro) |
|-------|-------------|---------------------|---------------------|
| Cooking (108KB) | 1,782 | 142 | 375 |
| Parkour (666KB) | 2,215 | 241 | 266 |
| Dog (1.1MB) | 2,358 | 127 | 371 |
| Dance (422KB) | 2,358 | 109 | 458 |

**Key observations:**
- Input tokens scale with video complexity, not file size (Dog 1.1MB and Dance 422KB both use 2,358 input tokens)
- Pro generates 2–4x more output tokens than Lite
- 15s video at FPS=1 uses ~1,800–2,400 input tokens

### Token Budget

- **Max tokens per video**: 80,000
- Seed 2.0: 64–384 tokens per frame (continuous)
- Seed 1.6: 128–640 tokens per frame (discrete)

### Estimated Token Usage by Video Length

| Video Length | FPS | Est. Input Tokens (Seed 2.0) |
|-------------|-----|------------------------------|
| 5s | 1 | ~600–800 |
| 15s | 1 | ~1,800–2,400 |
| 30s | 1 | ~3,500–4,800 |
| 1 min | 1 | ~7,000–9,600 |
| 5 min | 1 | ~35,000–48,000 |
| 10 min | 1 | ~70,000–80,000 (near limit) |

---

## Frame Count Limits

| Model | Max Frames | Max Video Length (FPS=1) | Max Video Length (FPS=0.5) |
|-------|-----------|-------------------------|---------------------------|
| Seed 1.6 | 640 | ~10 min | ~21 min |
| Seed 1.8 / 2.0 | 1280 | ~21 min | ~42 min |

When frame count exceeds the limit, the system uniformly samples down to max frames.

---

## FPS Impact

| FPS | Use Case | Speed Impact | Token Impact |
|-----|----------|-------------|-------------|
| 0.2 | Static scenes, counting people | Fastest | Lowest |
| 0.5 | Slow-changing content | Fast | Low |
| 1 (default) | General purpose | Balanced | Balanced |
| 2 | Action, sports | Slower | ~2x |
| 5 (max) | Fast action, counting movements | Slowest | ~5x |

---

## Quality vs Speed Trade-offs

| Priority | Recommended Model | FPS | Expected Time (15s) |
|----------|------------------|-----|---------------------|
| **Speed** | Seed 2.0 Lite | 1 | ~5s |
| **Balanced** | Seed 2.0 Lite | 2 | ~8s |
| **Quality** | Seed 2.0 Pro | 1 | ~15s |
| **Max detail** | Seed 2.0 Pro | 2–5 | ~25–40s |

### Output Quality Comparison

**Cooking video — Seed 2.0 Lite** (5.3s):
> "The video opens with a nighttime view showing a crescent moon above a traffic light, then cuts to a silhouetted person cooking food in a pan at a dimly lit setting."

**Cooking video — Seed 2.0 Pro** (20.4s):
> "The video starts with a nighttime outdoor view of a crescent moon in the dark sky above an illuminated yellow traffic light. It then cuts to a close-up of a hand using tongs to flip a sausage that is sizzling in oil in a frying pan."

**Dog video — Seed 2.0 Lite** (5.7s):
> "This clip takes place during an outdoor wedding group photo. One of the groom's leashed black dogs mounts another black dog, surprising everyone, and the small dog scurries past the laughing bride."

**Dog video — Seed 2.0 Pro** (18.9s):
> "At an outdoor wedding, the bride and groom stand with their two leashed black dogs in front of their attending guests. A small loose black-and-white dog approaches the group, and one of the couple's bigger dogs mounts it..."

**Dance video — Seed 2.0 Pro** (13.3s):
> "Three dancers in a dance studio begin performing a synchronized choreographed routine in unison. Partway through the routine, the dancer positioned furthest to the right stops dancing and drops out of sync..."

Pro consistently provides more specific details (specific objects, colors, spatial relationships) and longer descriptions.
