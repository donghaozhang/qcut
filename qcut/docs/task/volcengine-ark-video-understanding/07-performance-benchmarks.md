# Volcengine Ark Video Understanding — Performance Benchmarks

## Test Results (March 2026)

### Analysis Time by Model

| Model | Model ID | Video | Video Length | FPS | Analysis Time |
|-------|----------|-------|-------------|-----|--------------|
| Seed 2.0 Lite | `doubao-seed-2-0-lite-260215` | Big Ben timelapse | 5s | 1 | **12.0s** |
| Seed 1.6 | `doubao-seed-1-6-251015` | Big Ben timelapse | 5s | 1 | **13.7s** |
| Seed 2.0 Pro | `doubao-seed-2-0-pro-260215` | Big Ben timelapse | 5s | 1 | **20.5s** |
| Seed 2.0 Pro | `doubao-seed-2-0-pro-260215` | Boxing match | 5s | 1 | **23.0s** |
| Seed 2.0 Pro | `doubao-seed-2-0-pro-260215` | YouTube cats (base64) | 15s | 2 | **~30s** |

### Speed Ranking

1. **Seed 2.0 Lite** — ~12s (fastest, good for bulk processing)
2. **Seed 1.6** — ~14s (legacy, Chat API only)
3. **Seed 2.0 Pro** — ~20–30s (slowest, most detailed, has deep thinking)

---

## Input Length vs Analysis Time

### Estimated Processing Time by Video Length

| Video Length | Frames (FPS=1) | Frames (FPS=2) | Est. Time (Lite) | Est. Time (Pro) |
|-------------|----------------|----------------|-------------------|-----------------|
| 5s | 6 | 11 | ~12s | ~20s |
| 15s | 16 | 31 | ~15s | ~30s |
| 30s | 31 | 61 | ~20s | ~40s |
| 1 min | 61 | 121 | ~25s | ~50s |
| 5 min | 301 | 601 | ~45s | ~90s |
| 10 min | 601 | 1201 | ~60s | ~120s |

> Times are estimates based on observed scaling. Actual time depends on video complexity and server load.

### Frame Count Limits

| Model | Max Frames | Max Video Length (FPS=1) | Max Video Length (FPS=0.5) |
|-------|-----------|-------------------------|---------------------------|
| Seed 1.6 | 640 | ~10 min | ~21 min |
| Seed 1.8 / 2.0 | 1280 | ~21 min | ~42 min |

When frame count exceeds the limit, the system uniformly samples down to max frames.

---

## Token Usage

### Token Budget

- **Max tokens per video**: 80,000
- Tokens per frame varies by model (64–640 tokens/frame)

### Estimated Token Usage

| Video Length | FPS | Frames | Tokens (Seed 1.6, 128/frame) | Tokens (Seed 2.0, 64/frame) |
|-------------|-----|--------|------------------------------|------------------------------|
| 5s | 1 | 6 | ~768 | ~384 |
| 15s | 1 | 16 | ~2,048 | ~1,024 |
| 30s | 2 | 61 | ~7,808 | ~3,904 |
| 1 min | 1 | 61 | ~7,808 | ~3,904 |
| 5 min | 1 | 301 | ~38,528 | ~19,264 |
| 10 min | 1 | 601 | ~76,928 (near limit) | ~38,464 |

### FPS Impact on Tokens

| FPS | 1 min video frames | Tokens (Seed 2.0) | Notes |
|-----|-------------------|-------------------|-------|
| 0.2 | 12 | ~768 | Minimal, static scenes |
| 0.5 | 30 | ~1,920 | Low detail |
| 1 | 60 | ~3,840 | Default, balanced |
| 2 | 120 | ~7,680 | Good detail |
| 5 | 300 | ~19,200 | Max detail, fast action |

---

## Input Method Performance

| Method | Max File Size | Overhead | Best For |
|--------|-------------|----------|----------|
| Video URL | 50 MB | None (server fetches) | Public URLs, fastest |
| Base64 | 50 MB (body ≤ 64MB) | Upload time for large payloads | Small local files |
| Files API | 512 MB | Upload + processing wait | Large files, reuse across requests |

### Base64 Payload Size

| Video File Size | Base64 Size | Within 64MB body limit? |
|----------------|-------------|------------------------|
| 1 MB | ~1.33 MB | Yes |
| 10 MB | ~13.3 MB | Yes |
| 30 MB | ~40 MB | Yes |
| 50 MB | ~66.7 MB | No — use Files API |

---

## Quality vs Speed Trade-offs

| Priority | Recommended Model | FPS | Expected Time |
|----------|------------------|-----|---------------|
| **Speed** | Seed 2.0 Lite | 0.5–1 | 10–15s |
| **Balanced** | Seed 2.0 Lite | 1–2 | 15–25s |
| **Quality** | Seed 2.0 Pro | 2–5 | 25–60s |
| **Max detail** | Seed 2.0 Pro | 5 | 30–120s |

### Output Quality Comparison (Big Ben video)

**Seed 2.0 Lite** (12s):
> "This is a time-lapse video featuring Big Ben. Vehicles including a classic red double-decker bus continuously flow forward on the adjacent bridge. Clouds drift slowly across the twilight sky."

**Seed 2.0 Pro** (20.5s):
> "This is a time-lapse footage of the Elizabeth Tower (commonly known as Big Ben). 1) The clock hands spin rapidly, showing time passing at accelerated speed. 2) Traffic including the iconic London red double-decker bus flows fast along the bridge, with vehicle lights clearly visible as light dims. 3) Clouds drift quickly across the twilight sky, and warm low light of the setting sun illuminates the whole city scene."

Pro provides structured breakdown, more specific details (clock hands spinning, vehicle lights, sunset direction).
