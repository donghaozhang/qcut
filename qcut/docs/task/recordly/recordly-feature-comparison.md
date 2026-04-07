# QCut vs Recordly — Feature Comparison

Comparison of QCut's screen recording features against [Recordly](https://github.com/webadderall/Recordly) (open-source, AGPL 3.0, Electron + React + PixiJS).

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Fully supported |
| ⚠️ | Partial / incomplete |
| ❌ | Missing |

---

## Recording

| Feature | QCut | Recordly | Notes |
|---------|------|----------|-------|
| Record entire display | ✅ | ✅ | |
| Record single app window | ✅ | ✅ | |
| Jump from recording into editor | ✅ | ✅ | |
| Microphone audio capture | ❌ | ✅ | No mic IPC handlers found in QCut |
| System audio capture | ❌ | ✅ | Recordly uses WASAPI (Win), PipeWire (Linux), ScreenCaptureKit (macOS) |
| Native capture backends | ⚠️ | ✅ | Recordly has ScreenCaptureKit (macOS), WGC (Windows), PipeWire (Linux). QCut uses Electron capture |
| Resume from saved project files | ✅ | ✅ | |
| Open existing recordings/projects | ✅ | ✅ | |

**Gap priority**: Microphone + system audio capture are table-stakes for a screen recorder.

---

## Timeline and Editing

| Feature | QCut | Recordly | Notes |
|---------|------|----------|-------|
| Drag-and-drop timeline editing | ✅ | ✅ | |
| Trim unwanted sections | ✅ | ✅ | Split, keep left/right, ripple delete |
| Manual zoom regions | ✅ | ✅ | |
| Auto-zoom from cursor activity | ✅ | ✅ | Click clustering + dwell detection |
| Speed-up / slow-down regions | ❌ | ✅ | QCut has global playback speed (0.1–2x) but no per-region speed ramps on the timeline |
| Text annotations | ✅ | ✅ | Font, color, position, rotation, opacity |
| Image annotations | ✅ | ✅ | Via sticker overlay system |
| Figure / drawing annotations | ❌ | ✅ | No freehand or shape drawing tools |
| Extra audio regions on timeline | ✅ | ✅ | Multi-track audio support |
| Crop the recorded frame | ⚠️ | ✅ | Aspect ratio presets exist but manual crop tool unclear |
| Save and reopen projects | ✅ | ✅ | Auto-save with debounce, per-project per-scene |

**Gap priority**: Speed regions are high value for tutorials (speed through boring parts). Figure annotations are nice-to-have.

---

## Cursor Controls

| Feature | QCut | Recordly | Notes |
|---------|------|----------|-------|
| Show / hide cursor overlay | ✅ | ✅ | Dot, macOS arrow, macOS pointer, hidden |
| Cursor size adjustment | ✅ | ✅ | Dot radius in pixels |
| Cursor smoothing | ✅ | ✅ | Spring physics (stiffness, damping, mass) |
| Cursor motion blur | ✅ | ✅ | Configurable |
| Cursor click bounce | ✅ | ✅ | Configurable intensity + ring animation |
| Cursor sway | ❌ | ✅ | No wobble/randomization in QCut motion smoothing |
| Cursor loop mode | ❌ | ✅ | For cleaner looping exports |
| macOS-style cursor assets | ✅ | ✅ | Arrow + pointer sprites |

**Gap priority**: Sway and loop mode are polish features, lower priority.

---

## Webcam Overlay

| Feature | QCut | Recordly | Notes |
|---------|------|----------|-------|
| Enable / disable webcam overlay | ❌ | ✅ | QCut has camera selector but for AI generation, not recording overlay |
| Upload / replace / remove footage | ❌ | ✅ | |
| Mirror webcam | ❌ | ✅ | |
| Size control | ❌ | ✅ | |
| Preset + custom X/Y placement | ❌ | ✅ | |
| Margin control | ❌ | ✅ | |
| Roundness control | ❌ | ✅ | |
| Shadow control | ❌ | ✅ | |
| Zoom-reactive webcam scaling | ❌ | ✅ | |

**Gap priority**: Webcam overlay is a major competitive feature for tutorial/demo recordings. This is the biggest feature gap.

---

## Frame Styling and Backgrounds

| Feature | QCut | Recordly | Notes |
|---------|------|----------|-------|
| Built-in wallpapers | ✅ | ✅ | |
| Runtime wallpaper discovery | ⚠️ | ✅ | Wallpaper system exists but custom image loading incomplete |
| Custom uploaded backgrounds | ❌ | ✅ | No upload-your-own background |
| Solid color backgrounds | ✅ | ✅ | |
| Gradient backgrounds | ✅ | ✅ | 12 presets + custom angle/colors |
| Frame padding | ✅ | ✅ | Pixel-based control |
| Rounded corners | ✅ | ✅ | Pixel-based control |
| Background blur | ⚠️ | ✅ | Per-project canvas blur exists but unclear if applied to frame styling |
| Drop shadows | ✅ | ✅ | Toggle-based |
| Aspect ratio presets | ✅ | ✅ | Export presets cover 16:9, 9:16, 1:1 etc. |

**Gap priority**: Custom background upload is easy to add. Mostly at parity here.

---

## Export

| Feature | QCut | Recordly | Notes |
|---------|------|----------|-------|
| MP4 export | ✅ | ✅ | Also WebM and MOV |
| GIF export | ❌ | ✅ | GIF only referenced in AI upscaling context, not main export |
| Export quality selection | ✅ | ✅ | HIGH/MEDIUM/LOW + platform presets |
| GIF frame-rate selection | ❌ | ✅ | No GIF export |
| GIF loop toggle | ❌ | ✅ | No GIF export |
| GIF size presets | ❌ | ✅ | No GIF export |
| Aspect ratio / dimension controls | ✅ | ✅ | 6 platform presets |
| Reveal in file manager | ✅ | ✅ | showItemInFolder |

**Gap priority**: GIF export is important for sharing quick clips (Slack, GitHub, docs). Blocking for some use cases.

---

## Workflow and Usability

| Feature | QCut | Recordly | Notes |
|---------|------|----------|-------|
| Customizable keyboard shortcuts | ✅ | ✅ | Click-to-rebind, conflict detection |
| In-app shortcut reference | ✅ | ✅ | Dialog with categories |
| Feedback / issue links | ✅ | ✅ | |
| Project persistence | ✅ | ✅ | Auto-save, per-project settings |
| Faster preview recovery after export | ⚠️ | ✅ | QCut has preview purpose but unclear if optimized for post-export recovery |

---

## Summary Scorecard

| Category | QCut | Recordly | QCut Coverage |
|----------|------|----------|---------------|
| Recording | 5/8 | 8/8 | 63% |
| Timeline & Editing | 8/11 | 11/11 | 73% |
| Cursor Controls | 6/8 | 8/8 | 75% |
| Webcam Overlay | 0/9 | 9/9 | 0% |
| Frame Styling | 7/10 | 10/10 | 70% |
| Export | 4/8 | 8/8 | 50% |
| Workflow | 4/5 | 5/5 | 80% |
| **Total** | **34/59** | **59/59** | **58%** |

---

## Priority Gaps to Close

### P0 — Blocking / major competitive gaps
1. **Webcam overlay** — Entire feature missing. Critical for talking-head tutorials and product demos
2. **Microphone + system audio capture** — Screen recorder without audio capture is incomplete
3. **GIF export** — Common sharing format for short clips

### P1 — High-value missing features
4. **Speed regions on timeline** — Per-region speed ramps (not just global playback speed)
5. **Native capture backends** — ScreenCaptureKit (macOS), WGC (Windows) for better quality and performance
6. **Custom background upload** — Users expect to use their own images

### P2 — Polish and differentiation
7. **Cursor sway** — Subtle wobble for natural feel
8. **Cursor loop mode** — Cleaner looping exports
9. **Figure / drawing annotations** — Arrows, circles, rectangles for callouts
10. **Background blur** — Verify full frame styling integration

---

## QCut Advantages Over Recordly

Features QCut has that Recordly does not:

- **AI video generation** — FAL.ai, Gemini, Sora, Replicate integrations
- **AI captions / transcription** — Gemini-powered transcription
- **Markdown elements** — Render markdown on timeline with themes
- **Multi-scene projects** — Multiple scenes per project
- **Platform export presets** — YouTube, Instagram, TikTok, Twitter, LinkedIn
- **Sticker overlay system** — Drag-and-drop stickers with z-index layering
- **AI voice generation** — ElevenLabs TTS integration
- **Remotion rendering** — React-based composition engine
- **Native pipeline CLI** — Background processing via TypeScript CLI
