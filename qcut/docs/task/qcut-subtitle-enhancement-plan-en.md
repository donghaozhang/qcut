# QCut Subtitle Styling & ASS Format Guide

## Overview

QCut supports full subtitle styling in both the editor UI and the CLI pipeline. You can customize font, color, outline, shadow, background, and position — then export as styled ASS subtitles or burn them directly into video.

---

## Editor: Subtitle Style Panel

When you select a caption clip on the timeline, the **Properties Panel** shows subtitle styling controls.

### Text Section
| Control | Description |
|---------|-------------|
| Font | Font family picker (system + bundled fonts) |
| Style | Bold / Italic / Underline toggles |
| Font Size | Slider + number input (8–200 px) |
| Color | Color picker for text color |
| Opacity | Slider + number input (0–100%) |

### Outline / Shadow Section
| Control | Description |
|---------|-------------|
| Outline Color | Stroke color around text |
| Outline Width | Slider 0–10 px (0.5 step) |
| Shadow Color | Drop shadow color |

### Background Section
| Control | Description |
|---------|-------------|
| Color | Background box color behind text |
| Opacity | Background transparency (0–100%) |

### Position Section
| Control | Description |
|---------|-------------|
| Alignment | Top / Center / Bottom placement |

All changes apply immediately with live preview in the editor canvas.

---

## Export Formats

QCut supports four caption export formats:

| Format | Extension | Styling | Use Case |
|--------|-----------|---------|----------|
| SRT | `.srt` | Plain text only | Universal compatibility |
| VTT | `.vtt` | Limited styling | Web players |
| ASS | `.ass` | Full styling | Desktop players, FFmpeg burn-in |
| TTML | `.ttml` | Full styling | Broadcast/streaming |

When exporting video with subtitles, QCut generates an ASS file from your styled captions and uses FFmpeg's `libass` filter to burn them in — no extra dependencies needed.

---

## CLI: Subtitle Commands

### `subtitle-style` — Apply Style to Subtitles

Convert any subtitle file to a styled ASS file using presets or custom overrides.

```bash
# Apply a preset
bun run pipeline subtitle-style -i subs.srt --preset bold

# Custom style overrides
bun run pipeline subtitle-style -i subs.srt --style '{"fontSize":64,"fontColor":"#ffff00"}' -o styled.ass

# Preset + overrides (overrides win)
bun run pipeline subtitle-style -i subs.srt --preset cinematic --style '{"fontSize":72}'
```

**Flags:**

| Flag | Short | Description |
|------|-------|-------------|
| `--input` | `-i` | Input subtitle file (SRT/VTT/ASS) — required |
| `--preset` | | Style preset name |
| `--style` | | JSON style overrides |
| `--output` | `-o` | Output ASS file path |

### `subtitle-export` — Burn Subtitles into Video

Combine video + subtitles into a single MP4 with burned-in styled captions.

```bash
# With preset
bun run pipeline subtitle-export -i video.mp4 --srt-file subs.srt --preset bold

# Auto-detect subtitle file next to video
bun run pipeline subtitle-export -i video.mp4 --preset cinematic

# Custom style
bun run pipeline subtitle-export -i video.mp4 -s subs.srt --style '{"fontColor":"#ffff00"}'
```

**Flags:**

| Flag | Short | Description |
|------|-------|-------------|
| `--input` | `-i` | Input video file — required |
| `--srt-file` | `-s` | Subtitle file (auto-detects `.srt`/`.vtt`/`.ass` next to video if omitted) |
| `--preset` | | Style preset name |
| `--style` | | JSON style overrides |
| `--resolution` | | Override video resolution (e.g. `1920x1080`) |
| `--output` | | Output video file path |

---

## Style Presets

Six built-in presets are available in both the CLI and editor:

| Preset | Font | Size | Look |
|--------|------|------|------|
| `default` | Arial | 48px | White text, black outline |
| `cinematic` | Georgia | 56px | Elegant serif, subtle outline + shadow |
| `bold` | Arial | 64px | Heavy white text, thick black outline |
| `minimal` | Helvetica Neue | 40px | No outline, semi-transparent black background |
| `karaoke` | Arial | 52px | Yellow bold text, positioned at top |
| `news` | Arial | 44px | White text on dark background bar |

---

## Style Properties Reference

All properties available for `--style` JSON overrides:

```typescript
{
  fontFamily: string       // Font name (e.g. "Arial", "Georgia")
  fontSize: number         // Size in px (8–200)
  fontColor: string        // Hex color (e.g. "#ffffff")
  fontOpacity: number      // 0–1
  bold: boolean
  italic: boolean
  underline: boolean
  outlineColor: string     // Stroke color
  outlineWidth: number     // 0–10 px
  shadowColor: string      // Shadow color
  shadowOffset: { x: number, y: number }
  backgroundColor: string  // Background box color
  bgOpacity: number        // 0–1
  position: {
    align: "top" | "center" | "bottom"
    x: number              // Horizontal position (percentage)
    y: number              // Vertical position (percentage)
  }
  lineSpacing: number
}
```

---

## ASS Format Notes

QCut uses the ASS (Advanced SubStation Alpha) format as the styling backbone:

- **Import**: ASS/SSA files can be parsed and imported, preserving all style information
- **Export**: Styled captions are converted to ASS format for FFmpeg burn-in
- **Color format**: ASS uses `&HAABBGGRR` (BGR, not RGB) — QCut handles this conversion automatically
- **Alignment**: ASS numpad alignment (1–9) maps to QCut's top/center/bottom positioning
- **Resolution**: ASS uses `PlayResX`/`PlayResY` for coordinate scaling — QCut auto-detects video resolution via FFprobe
