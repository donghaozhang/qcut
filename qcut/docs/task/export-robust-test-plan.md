# Export Robust Test Plan

Comprehensive test plan for verifying QCut's import, timeline, and export pipeline across different media formats.

**Last tested:** 2026-03-11, QCut desktop v2026.03.11.1, branch `export-robust`

## Goal

Ensure QCut reliably handles:
1. **Import** — Various video, audio, and image formats
2. **Timeline** — Mixed media types on the same timeline
3. **Export** — Successful output in different presets/formats

## Test Results Summary

| Scenario | Status | Notes |
|----------|--------|-------|
| A. Video formats (6 types) | ✅ PASS | H.264, H.265, VP9, ProRes, MJPEG, MKV all work |
| B. Mixed media (video+audio+image) | ✅ PASS | MP4 + MP3 + JPG/PNG/BMP on one timeline |
| C. Edge cases | ✅ PASS | Short clip, portrait, 60fps, no-audio all export |
| D. Export presets | ⚠️ PARTIAL | youtube-1080p ✅, youtube-720p ✅, default ✅, twitter-720p ❌ (preset is `twitter` not `twitter-720p`) |

### Key Finding: `editor:navigator:open` Required

**Bug discovered during testing:** If you create a project and add elements without calling `editor:navigator:open` first, the export may pull from the **previously opened project** instead of the new one. The timeline commands succeed but operate on the wrong project context in the editor.

**Fix:** Always call `editor:navigator:open --project-id <PID>` after `editor:project:create` and before any timeline/export operations.

---

## Test Matrix

### 1. Video Formats

| Format | Extension | Codec | Resolution | Import | Timeline | Export | Status |
|--------|-----------|-------|------------|--------|----------|--------|--------|
| MP4 (H.264) | `.mp4` | libx264 | 1080p | ✅ | ✅ | ✅ | ✅ PASS |
| MP4 (H.265/HEVC) | `.mp4` | libx265 | 1080p | ✅ | ✅ | ✅ | ✅ PASS |
| WebM (VP9) | `.webm` | libvpx-vp9 | 720p | ✅ | ✅ | ✅ | ✅ PASS |
| MOV (ProRes) | `.mov` | prores_ks | 1080p | ✅ | ✅ | ✅ | ✅ PASS |
| AVI (MJPEG) | `.avi` | mjpeg | 720p | ✅ | ✅ | ✅ | ✅ PASS |
| MKV (H.264) | `.mkv` | libx264 | 1080p | ✅ | ✅ | ✅ | ✅ PASS |

**Export result:** 60s combined, 25MB, youtube-1080p preset

### 2. Audio Formats

| Format | Extension | Codec | Import | Timeline | Status |
|--------|-----------|-------|--------|----------|--------|
| MP3 | `.mp3` | libmp3lame | ✅ | ✅ | ✅ PASS |
| WAV | `.wav` | pcm_s16le | ✅ | ✅ | ✅ PASS |
| AAC | `.aac` | aac | ✅ | ✅ | ✅ PASS |
| FLAC | `.flac` | flac | ✅ | ✅ | ✅ PASS |
| OGG (Vorbis) | `.ogg` | libvorbis | ⬜ SKIP | — | ⬜ Test asset generation limitation: ffmpeg encoder not available on test machine |

### 3. Image Formats

| Format | Extension | Resolution | Import | Timeline | Export | Status |
|--------|-----------|------------|--------|----------|--------|--------|
| JPEG | `.jpg` | 1920×1080 | ✅ | ✅ | ✅ | ✅ PASS |
| PNG | `.png` | 1920×1080 | ✅ | ✅ | ✅ | ✅ PASS |
| BMP | `.bmp` | 1920×1080 | ✅ | ✅ | ✅ | ✅ PASS |
| WebP | `.webp` | — | ⬜ SKIP | — | — | ⬜ ffmpeg encoder not available on test machine |
| GIF (animated) | `.gif` | — | ⬜ NOT TESTED | — | — | — |

### 4. Export Presets

| Preset | Resolution | Tested | Status |
|--------|------------|--------|--------|
| `youtube-1080p` | 1920×1080 | ✅ | ✅ PASS (2.6MB for 10s) |
| `youtube-720p` | 1280×720 | ✅ | ✅ PASS (2.3MB for 10s) |
| `youtube-4k` | 3840×2160 | ⬜ | NOT TESTED |
| `twitter` | — | ⬜ | NOT TESTED (preset name is `twitter`, not `twitter-720p`) |
| `tiktok` | — | ⬜ | NOT TESTED |
| `instagram-reel` | — | ⬜ | NOT TESTED |
| `default` (no preset) | youtube-1080p | ✅ | ✅ PASS (defaults to youtube-1080p) |

**Available presets:** `youtube-4k`, `youtube-1080p`, `youtube-720p`, `tiktok`, `instagram-reel`, `instagram-post`, `instagram-landscape`, `twitter`, `linkedin`, `discord`

---

## Test Scenarios

### Scenario A: All Video Formats ✅ PASS
- Created project `video-formats-v2`
- Imported 6 video formats: H.264, H.265, VP9, ProRes, MJPEG, MKV
- Added all to timeline sequentially (10s each = 60s total)
- Exported with `youtube-1080p`: **60s, 25MB** ✅

### Scenario B: Mixed Media ✅ PASS
- Created project `mixed-media-v2`
- Imported: 1 MP4 + 1 MP3 + 3 images (JPG, PNG, BMP)
- Timeline: video 10s → jpg 5s → png 5s → bmp 5s + mp3 audio overlay
- Exported with `youtube-1080p`: **25s, 2.8MB** ✅

### Scenario C: Edge Cases ✅ PASS
- Created project `edge-test-v2`
- Imported: short.mp4 (0.5s) + portrait.mp4 (1080×1920) + 60fps.mp4 + noaudio.mp4
- Timeline: 0.5s + 10s + 10s + 10s = 30.5s
- Exported with `youtube-1080p`: **30.5s, 10MB** ✅
- Portrait video scaled correctly to 1080p landscape
- 60fps source exported at 30fps (preset setting)
- No-audio video handled gracefully

### Scenario D: Export Presets ⚠️ PARTIAL
- `youtube-1080p`: ✅ PASS (2.6MB)
- `youtube-720p`: ✅ PASS (2.3MB)
- `default` (no preset): ✅ PASS (2.6MB, defaults to youtube-1080p)
- `twitter-720p`: ❌ FAIL — preset doesn't exist, correct name is `twitter`
- Other presets (tiktok, instagram-reel, etc.): not tested

---

## Issues Found

### 1. ⚠️ Project Context Not Switching Without `editor:navigator:open`
- **Symptom:** Export returns wrong duration/content from previously opened project
- **Cause:** `editor:project:create` + `editor:timeline:add-element` don't switch the editor UI context
- **Fix:** Always call `editor:navigator:open --project-id <PID>` after creating a project
- **Severity:** High — CLI users will get wrong exports silently

### 2. ℹ️ Test Plan Had Wrong Preset Name
- **Symptom:** `twitter-720p` preset returns "Invalid preset ID"
- **Cause:** Preset is named `twitter` not `twitter-720p`
- **Fix:** Updated test plan with correct preset names

### 3. ℹ️ Missing ffmpeg Encoders
- OGG (libvorbis) and WebP (libwebp) encoders not available on test machine
- Not a QCut bug — depends on ffmpeg build

---

## Test Media Generation

Generate test files with ffmpeg:

```bash
mkdir -p /tmp/export-test && cd /tmp/export-test

# Video formats
ffmpeg -f lavfi -i testsrc=duration=10:size=1920x1080:rate=30 -f lavfi -i sine=frequency=440:duration=10 -c:v libx264 -c:a aac -y h264.mp4
ffmpeg -f lavfi -i testsrc=duration=10:size=1920x1080:rate=30 -f lavfi -i sine=frequency=440:duration=10 -c:v libx265 -c:a aac -y h265.mp4
ffmpeg -f lavfi -i testsrc=duration=10:size=1280x720:rate=30 -f lavfi -i sine=frequency=440:duration=10 -c:v libvpx-vp9 -c:a libopus -y vp9.webm
ffmpeg -f lavfi -i testsrc=duration=10:size=1920x1080:rate=30 -c:v prores_ks -profile:v 0 -y prores.mov
ffmpeg -f lavfi -i testsrc=duration=10:size=1280x720:rate=30 -c:v mjpeg -q:v 3 -y mjpeg.avi
ffmpeg -f lavfi -i testsrc=duration=10:size=1920x1080:rate=30 -f lavfi -i sine=frequency=440:duration=10 -c:v libx264 -c:a aac -y h264.mkv

# Audio
ffmpeg -f lavfi -i sine=frequency=440:duration=10 -c:a libmp3lame -y test.mp3
ffmpeg -f lavfi -i sine=frequency=440:duration=10 -c:a pcm_s16le -y test.wav
ffmpeg -f lavfi -i sine=frequency=440:duration=10 -c:a aac -y test.aac
ffmpeg -f lavfi -i sine=frequency=440:duration=10 -c:a flac -y test.flac

# Images
ffmpeg -f lavfi -i testsrc=size=1920x1080 -frames:v 1 -y test.jpg
ffmpeg -f lavfi -i testsrc=size=1920x1080 -frames:v 1 -y test.png
ffmpeg -f lavfi -i testsrc=size=1920x1080 -frames:v 1 -y test.bmp

# Edge cases
ffmpeg -f lavfi -i testsrc=duration=0.5:size=1920x1080:rate=30 -c:v libx264 -y short.mp4
ffmpeg -f lavfi -i testsrc=duration=10:size=1080x1920:rate=30 -c:v libx264 -y portrait.mp4
ffmpeg -f lavfi -i testsrc=duration=10:size=1920x1080:rate=60 -c:v libx264 -y 60fps.mp4
ffmpeg -f lavfi -i testsrc=duration=10:size=1280x720:rate=30 -c:v libx264 -an -y noaudio.mp4
```

## CLI Commands Reference

```bash
# IMPORTANT: Always open project in editor before timeline/export operations
bun run pipeline editor:project:create --name "test" --json
bun run pipeline editor:navigator:open --project-id <PID> --json
sleep 2 # A small delay is needed for the project context to switch. Polling for readiness is recommended in production scripts.
bun run pipeline editor:ui:switch-panel --panel video-edit --json

# Import
bun run pipeline editor:media:batch-import --project-id <PID> --items '[{"path":"/tmp/file.mp4"}]' --json

# Timeline
bun run pipeline editor:timeline:add-element --project-id <PID> --data '{"type":"video","sourceName":"file.mp4","startTime":0,"duration":10}' --json

# Export
bun run pipeline editor:export:start --project-id <PID> --preset youtube-1080p --filename "output.mp4" --poll --json

# Verify
ffprobe -v quiet -show_entries format=duration,size -of json output.mp4
```

## Success Criteria

- ✅ All 6 video formats import and export correctly
- ✅ Audio formats (MP3, WAV, AAC, FLAC) import successfully
- ✅ Image formats (JPG, PNG, BMP) import and export as slideshow
- ✅ Mixed-format timelines export cleanly
- ✅ Edge cases (short clip, portrait, 60fps, no-audio) handled gracefully
- ✅ youtube-1080p, youtube-720p, default presets work
- ⚠️ Must use `editor:navigator:open` before timeline/export operations
