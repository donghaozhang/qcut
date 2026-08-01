[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/Quriosity-agent/qcut)

<table width="100%">
  <tr>
    <td align="left" width="120">
      <img src="qcut/apps/web/public/assets/logo-v4.png" alt="QCut Logo" width="100" />
    </td>
    <td align="right">
      <h1>QCut</h1>
      <h3 style="margin-top: -10px;">A free, open-source video editor for Windows, macOS, and Linux.</h3>
    </td>
  </tr>
</table>

## Demo

<a href="https://www.youtube.com/watch?v=H6rH5Z9HrH8">
  <img src="https://img.youtube.com/vi/H6rH5Z9HrH8/0.jpg" alt="QCut Demo" width="600" />
  <br />
  <b>Click to watch demo video</b>
</a>

## Product Tour

### Text animations ✨ new

Typewriter entrances, wave loops, rotating exits — every word moves. The clip below is the real QCut editor driven end-to-end by our own AI agent (virtual pointer, live presets, no After Effects).

<!-- showcase:text-animations:start -->
<img src="qcut/docs/assets/readme/qcut-text-animations.gif" alt="QCut text animations: typewriter entrance, wave loop, and animated outro recorded live in the editor" width="100%" />

▶ Full promo: [English · 2K60](https://github.com/Quriosity-agent/qcut/releases/download/v2026.08.01.1/QCut-Text-Motion-ShotCraft-EN-2K60.mp4) · [中文版 · 2K60](https://github.com/Quriosity-agent/qcut/releases/download/v2026.08.01.1/QCut-Text-Motion-ShotCraft-ZH-2K60.mp4)
<!-- showcase:text-animations:end -->

<!-- showcase:stickers:start -->
<!-- Reserved for the sticker-animation showcase. Swap content between these
     markers with the readme-showcase skill; keep everything outside intact. -->
<!-- showcase:stickers:end -->

### Multi-track editing

Build videos on a professional timeline with live preview, text, stickers, audio, and precise clip controls.

<img src="qcut/docs/assets/readme/qcut-editor-timeline.png" alt="QCut multi-track editor with live preview and text library" width="100%" />

<table width="100%">
  <tr>
    <td width="50%" valign="top">
      <h3>Media workspace</h3>
      <p>Organize video, audio, images, and reusable assets in one searchable workspace.</p>
      <img src="qcut/docs/assets/readme/qcut-media-library.png" alt="QCut media library with video and audio assets" width="100%" />
    </td>
    <td width="50%" valign="top">
      <h3>Filter library</h3>
      <p>Preview curated looks across portrait, landscape, cinematic, vintage, and stylized collections.</p>
      <img src="qcut/docs/assets/readme/qcut-filter-library.png" alt="QCut filter library and video preview" width="100%" />
    </td>
  </tr>
</table>

### AI video generation

Generate video from text, images, or avatars, compare leading AI models, and add results directly to the timeline.

<img src="qcut/docs/assets/readme/qcut-ai-video-generation.png" alt="QCut AI video generation workspace with model selection and live preview" width="100%" />

## Why?

- **Privacy**: Your videos stay on your device
- **Free features**: Every basic feature of CapCut is paywalled now
- **Simple**: People want editors that are easy to use - CapCut proved that

## Features

- **Cross-platform Desktop App** - Windows, macOS, and Linux with native file access
- **Timeline-based Editing** - Professional multi-track video editing interface
- **AI-Powered Generation** - Text-to-video, image-to-video, and text-to-image
- **FFmpeg Integration** - Professional-grade video processing via WebAssembly
- **Sound & Sticker Library** - Integrated media libraries with search
- **100% Local Processing** - No watermarks, no subscriptions, no cloud required

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/donghaozhang/qcut.git
cd qcut
bun install

# 2. Run in development mode
bun run electron:dev

# Or build and run production
bun run build && bun run electron
```

**Prerequisites:** [Node.js](https://nodejs.org/) v18+ and [Bun](https://bun.sh/)

## Build for Distribution

```bash
bun run dist:win      # Windows installer
bun run dist:mac      # macOS .dmg (on macOS)
bun run dist:linux    # Linux AppImage/deb (on Linux)
```

## Documentation

| Topic | Link |
|-------|------|
| Build Commands | [docs/technical/guides/build-commands.md](qcut/docs/technical/guides/build-commands.md) |
| Project Structure | [docs/technical/architecture/source-code-structure.md](qcut/docs/technical/architecture/source-code-structure.md) |
| Media Panels | [docs/technical/media-panel-reference.md](qcut/docs/technical/media-panel-reference.md) |
| AI Features | [docs/technical/ai/](qcut/docs/technical/ai/) |
| Testing | [docs/technical/testing/](qcut/docs/technical/testing/) |
| All Technical Docs | [docs/technical/README.md](qcut/docs/technical/README.md) |

## Tech Stack

- **Frontend**: Vite + React + TanStack Router
- **Desktop**: Electron with 100% TypeScript backend
- **Video**: FFmpeg WebAssembly
- **Styling**: Tailwind CSS + Radix UI
- **Monorepo**: Turborepo + Bun

## Contributing

Fork the repo, follow Quick Start, create a feature branch, and submit a PR.

## License

MIT
