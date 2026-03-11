# Export Robust Test Plan

Comprehensive test plan for verifying QCut's import, timeline, and export pipeline across different media formats.

## Goal

Ensure QCut reliably handles:
1. **Import** — Various video, audio, and image formats
2. **Timeline** — Mixed media types on the same timeline
3. **Export** — Successful output in different presets/formats

## Test Matrix

### 1. Video Formats

| Format | Extension | Codec | Resolution | Status |
|--------|-----------|-------|------------|--------|
| MP4 (H.264) | `.mp4` | libx264 | 1080p | ⬜ |
| MP4 (H.265/HEVC) | `.mp4` | libx265 | 1080p | ⬜ |
| WebM (VP9) | `.webm` | libvpx-vp9 | 720p | ⬜ |
| MOV (ProRes) | `.mov` | prores_ks | 1080p | ⬜ |
| AVI (MJPEG) | `.avi` | mjpeg | 720p | ⬜ |
| MKV (H.264) | `.mkv` | libx264 | 1080p | ⬜ |

### 2. Audio Formats

| Format | Extension | Codec | Sample Rate | Status |
|--------|-----------|-------|-------------|--------|
| MP3 | `.mp3` | libmp3lame | 44100 | ⬜ |
| WAV | `.wav` | pcm_s16le | 44100 | ⬜ |
| AAC | `.aac` | aac | 48000 | ⬜ |
| OGG (Vorbis) | `.ogg` | libvorbis | 44100 | ⬜ |
| FLAC | `.flac` | flac | 44100 | ⬜ |

### 3. Image Formats

| Format | Extension | Resolution | Status |
|--------|-----------|------------|--------|
| JPEG | `.jpg` | 1920×1080 | ⬜ |
| PNG | `.png` | 1920×1080 | ⬜ |
| WebP | `.webp` | 1920×1080 | ⬜ |
| BMP | `.bmp` | 1920×1080 | ⬜ |
| GIF (animated) | `.gif` | 480×360 | ⬜ |

### 4. Export Presets

| Preset | Resolution | Codec | Bitrate | Status |
|--------|------------|-------|---------|--------|
| `youtube-1080p` | 1920×1080 | libx264 | 8Mbps | ⬜ |
| `youtube-720p` | 1280×720 | libx264 | 5Mbps | ⬜ |
| `twitter-720p` | 1280×720 | libx264 | 5Mbps | ⬜ |
| `default` | (source) | libx264 | auto | ⬜ |

## Test Scenarios

### Scenario A: Single Format Import + Export
For each format in the matrix above:
1. Create a new project
2. Import the media file
3. Add to timeline
4. Export with `youtube-1080p` preset
5. Verify output file is playable and correct duration

### Scenario B: Mixed Media Timeline
1. Create a new project
2. Import: 1 MP4 video + 1 MP3 audio + 1 JPEG image
3. Add all to timeline (image with 5s duration)
4. Export with `youtube-1080p`
5. Verify output contains all 3 segments

### Scenario C: Format Stress Test
1. Create a new project
2. Import one of each: MP4, WebM, MOV, MKV, AVI
3. Add all to timeline sequentially
4. Export with `youtube-1080p`
5. Verify seamless concatenation

### Scenario D: Audio-Only Export
1. Create a new project
2. Import MP3 + WAV + AAC
3. Add all to timeline
4. Export (audio-only or video with black frames)
5. Verify audio output

### Scenario E: Image Slideshow
1. Create a new project
2. Import 4-5 images (JPG, PNG, WebP, BMP)
3. Add to timeline with 3s duration each
4. Export with `youtube-1080p`
5. Verify 12-15s video output

### Scenario F: Edge Cases
1. **Very short clip** (<1s video) — import, timeline, export
2. **Large file** (>1GB) — import, timeline, export
3. **Mismatched resolution** — mix 4K + 720p + 480p on same timeline
4. **No audio track** — video-only file, export with preset
5. **High FPS** (60fps source) — export at 30fps
6. **Portrait video** (9:16) — export with landscape preset

## Test Media Generation

Generate test files with ffmpeg:

```bash
# 10s test video (H.264, 1080p)
ffmpeg -f lavfi -i testsrc=duration=10:size=1920x1080:rate=30 -f lavfi -i sine=frequency=440:duration=10 -c:v libx264 -c:a aac -y /tmp/test-h264.mp4

# 10s test video (H.265)
ffmpeg -f lavfi -i testsrc=duration=10:size=1920x1080:rate=30 -f lavfi -i sine=frequency=440:duration=10 -c:v libx265 -c:a aac -y /tmp/test-h265.mp4

# 10s WebM (VP9)
ffmpeg -f lavfi -i testsrc=duration=10:size=1280x720:rate=30 -f lavfi -i sine=frequency=440:duration=10 -c:v libvpx-vp9 -c:a libopus -y /tmp/test-vp9.webm

# 10s MOV (ProRes)
ffmpeg -f lavfi -i testsrc=duration=10:size=1920x1080:rate=30 -c:v prores_ks -profile:v 0 -y /tmp/test-prores.mov

# 10s AVI (MJPEG)
ffmpeg -f lavfi -i testsrc=duration=10:size=1280x720:rate=30 -c:v mjpeg -q:v 3 -y /tmp/test-mjpeg.avi

# 10s MKV (H.264)
ffmpeg -f lavfi -i testsrc=duration=10:size=1920x1080:rate=30 -f lavfi -i sine=frequency=440:duration=10 -c:v libx264 -c:a aac -y /tmp/test-h264.mkv

# Audio files
ffmpeg -f lavfi -i sine=frequency=440:duration=10 -c:a libmp3lame -y /tmp/test.mp3
ffmpeg -f lavfi -i sine=frequency=440:duration=10 -c:a pcm_s16le -y /tmp/test.wav
ffmpeg -f lavfi -i sine=frequency=440:duration=10 -c:a aac -y /tmp/test.aac
ffmpeg -f lavfi -i sine=frequency=440:duration=10 -c:a libvorbis -y /tmp/test.ogg
ffmpeg -f lavfi -i sine=frequency=440:duration=10 -c:a flac -y /tmp/test.flac

# Image files
ffmpeg -f lavfi -i testsrc=size=1920x1080 -frames:v 1 -y /tmp/test.jpg
ffmpeg -f lavfi -i testsrc=size=1920x1080 -frames:v 1 -y /tmp/test.png
ffmpeg -f lavfi -i testsrc=size=1920x1080 -frames:v 1 -c:v libwebp -y /tmp/test.webp
ffmpeg -f lavfi -i testsrc=size=1920x1080 -frames:v 1 -y /tmp/test.bmp

# Edge cases
ffmpeg -f lavfi -i testsrc=duration=0.5:size=1920x1080:rate=30 -c:v libx264 -y /tmp/test-short.mp4
ffmpeg -f lavfi -i testsrc=duration=10:size=3840x2160:rate=30 -c:v libx264 -y /tmp/test-4k.mp4
ffmpeg -f lavfi -i testsrc=duration=10:size=1280x720:rate=30 -c:v libx264 -y /tmp/test-720p.mp4
ffmpeg -f lavfi -i testsrc=duration=10:size=854x480:rate=30 -c:v libx264 -y /tmp/test-480p.mp4
ffmpeg -f lavfi -i testsrc=duration=10:size=1080x1920:rate=30 -c:v libx264 -y /tmp/test-portrait.mp4
ffmpeg -f lavfi -i testsrc=duration=10:size=1920x1080:rate=60 -c:v libx264 -y /tmp/test-60fps.mp4
```

## CLI Commands Reference

```bash
# Create project
bun run pipeline editor:project:create --name "test-project" --json

# Import media
bun run pipeline editor:media:import --project-id <PID> --source /tmp/test.mp4 --json

# Batch import
bun run pipeline editor:media:batch-import --project-id <PID> --items '[{"path":"/tmp/test.mp4"}]' --json

# Add to timeline
bun run pipeline editor:timeline:add-element --project-id <PID> --data '{"type":"video","sourceName":"test.mp4","startTime":0,"duration":10}' --json

# Export
bun run pipeline editor:export:start --project-id <PID> --preset youtube-1080p --filename "output.mp4" --poll --json

# Verify output
ffprobe -v quiet -show_entries format=duration,size,bit_rate -show_entries stream=codec_name,width,height,r_frame_rate -of json /tmp/output.mp4
```

## Success Criteria

- ✅ All formats in the matrix import without errors
- ✅ All formats appear correctly on timeline
- ✅ All export presets produce valid output files
- ✅ Mixed-format timelines export cleanly
- ✅ Edge cases handled gracefully (error messages, not crashes)
- ✅ Export duration matches expected timeline duration (±0.5s tolerance)
