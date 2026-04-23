# QCut Media Panel Reference

This document provides a comprehensive overview of all 18 tabs registered in the QCut video editor's media panel sidebar, plus the tab grouping architecture.

> **Note:** All file paths in this document are relative to the `qcut/` project root directory.

## Tab Grouping Architecture

The media panel uses a two-level navigation system: **groups** (top bar) and **tabs** (second bar). Groups are defined in `store.ts` via `tabGroups` and rendered by `GroupBar`. The Edit group additionally has **sub-groups** that split its tabs into two categories.

### Groups

| Group Key | Label | Icon | Tabs |
|-----------|-------|------|------|
| `ai-create` | Create | `SparklesIcon` | ai, text2image, sounds, moyin |
| `edit` | Edit | `ScissorsIcon` | word-timeline, upscale, video-edit, segmentation, text, stickers, effects, filters, transitions |
| `media` | Library | `FolderOpenIcon` | media, project-folder |
| `agents` | Agents | `WrenchIcon` | nano-edit, pty, remotion |

### Edit Sub-groups

The Edit group has two sub-groups, toggled via a segmented control above the tab bar:

| Sub-group Key | Label | Tabs |
|---------------|-------|------|
| `ai-edit` | AI Assist | word-timeline, upscale, video-edit, segmentation |
| `manual-edit` | Manual Edit | text, stickers, effects, filters, transitions |

### Navigation Flow

1. **GroupBar** (`group-bar.tsx`) renders four group buttons at the top
2. Selecting a group switches to the last-used tab within that group
3. **TabBar** (`tabbar.tsx`) renders the tabs for the active group
4. For the Edit group, a sub-group toggle appears above the tab icons
5. State is managed by `useMediaPanelStore` in `store.ts`

---

## Table of Contents

1. [Media](#1-media)
2. [AI Images (Text2Image)](#2-ai-images-text2image)
3. [AI Video](#3-ai-video)
4. [Video Upscale](#4-video-upscale)
5. [Skills](#5-skills)
6. [Text](#6-text)
7. [Stickers](#7-stickers)
8. [Audio Studio](#8-audio-studio)
9. [Remotion](#9-remotion)
10. [Terminal](#10-terminal)
11. [Smart Speech](#11-smart-speech)
12. [Project](#12-project)
13. [Filters (WIP)](#13-filters-wip)
14. [Segment (WIP)](#14-segment-wip)
15. [Sounds (WIP)](#15-sounds-wip)
16. [Effects (WIP)](#16-effects-wip)
17. [Transitions (WIP)](#17-transitions-wip)
18. [Director (Moyin)](#18-director-moyin)

---

## 1. Media

**Tab key:** `media`
**Label:** "Media"
**Icon:** `VideoIcon`
**Group:** media (Library)
**View:** `apps/web/src/components/editor/media-panel/views/media/media.tsx`

### Summary
The central hub for managing all media assets in your project.

### Features
- **Import media:** Upload videos, images, and audio files via drag-and-drop or file picker
- **Media library:** Browse all imported media with thumbnails and metadata
- **Search & filter:** Find media by name or type (video/image/audio)
- **Drag to timeline:** Add media to the timeline by dragging items
- **Context menu:** Right-click for options like duplicate, open folder, export
- **Sorting:** Sort by name, date, type, or duration

---

## 2. AI Images (Text2Image)

**Tab key:** `text2image`
**Label:** "AI Images"
**Icon:** `WandIcon`
**Group:** ai-create (Create)
**View:** `apps/web/src/components/editor/media-panel/views/text2image.tsx`

### Summary
Multi-view hub for AI image workflows. Uses a `ModelTypeSelector` pill bar to switch between six sub-views: Generation, Adjustment, Camera, Upscale, Angles, and Draw.

### Sub-views (via ModelTypeSelector)

| Sub-view | Component | Description |
|----------|-----------|-------------|
| `generation` | Inline in `text2image.tsx` | Text-to-image generation with 15 models |
| `adjustment` | `AdjustmentPanel` (`components/editor/adjustment/`) | AI-powered image editing with text prompts |
| `camera` | `CameraSelectorView` (`views/camera-selector/`) | Virtual cinema camera configurator |
| `upscale` | Inline in `text2image.tsx` | Image upscaling with multiple AI models |
| `angles` | `AiView` (mode="angles") | Multi-angle cinematic shot generation |
| `draw` | `DrawView` (`views/draw.tsx`) | Freehand drawing and annotation canvas |

### Generation Sub-view Features
- **Text-to-image generation:** Create images from text descriptions
- **Multiple AI models:** 15 text-to-image models from Google, OpenAI, ByteDance, Black Forest Labs, Alibaba, fal.ai, and Tongyi-MAI
- **Generation modes:** Single model or multi-model comparison
- **Style presets:** Image size options (square, landscape, portrait)
- **Generation history:** View and reuse previous generations
- **Add to media:** Generated images automatically added to media library

### Supported Models (Generation)
GPT-Image-2 (via FAL, top), GPT-Image-2 (via GMI Cloud), Gemini 3 Pro, GPT Image 1.5, Nano Banana, SeedDream v3/v4/v4.5, FLUX Pro v1.1 Ultra, FLUX 2 Flex, Imagen4 Ultra, WAN v2.2, Qwen Image, Z-Image Turbo, Reve

### Upscale Sub-view Features
- **Image upscaling:** Enhance resolution using AI models
- **Model selection:** Multiple upscale model options with cost estimates
- **Settings panel:** Scale factor, denoise, creativity, output format controls
- **File upload:** Upload source image for upscaling
- **Progress tracking:** View upscale progress with percentage

### Adjustment Sub-view Features
- **Image editing:** Transform images using AI with text prompts
- **Multiple model support:** Choose from various image editing models
- **Parameter controls:** Fine-tune generation settings (strength, guidance, etc.)
- **Edit history:** Track and revert changes
- **Multi-image support:** Some models support multiple input images
- **Preview panel:** Compare before/after results

### Camera Sub-view Features
- **Camera body selection:** 6 cameras (Red V-Raptor, Sony Venice, IMAX Film Camera, Arri Alexa 35, Arriflex 16SR, Panavision DXL2)
- **Lens selection:** 11 lenses across spherical, anamorphic, and special types
- **Focal length:** 4 options (8mm, 14mm, 35mm, 50mm)
- **Aperture:** 3 options (f/1.4, f/4, f/11)
- **Current setup display:** Shows selected camera thumbnail and focal length
- **Horizontal scroll tracks:** Snap-scrolling with mouse wheel support

### Draw Sub-view Features
- **Drawing tools:** Pencil, brush, shapes, and more
- **Color picker:** Choose colors for drawing
- **Canvas toolbar:** Undo, redo, clear, save operations
- **Saved drawings:** Load and manage saved drawings
- **Image upload:** Import images to draw over
- **Selection tools:** Select, group, and manipulate objects

---

## 3. AI Video

**Tab key:** `ai`
**Label:** "AI Video"
**Icon:** `BotIcon`
**Group:** ai-create (Create)
**View:** `apps/web/src/components/editor/media-panel/views/ai/index.tsx`

### Summary
Generate videos using AI from text, images, or existing videos. Features a tabbed interface with five internal tabs.

### Tabs
- **Text:** Text-to-video generation with multiple providers
- **Image:** Image-to-video animation (first frame, last frame, source video inputs)
- **Avatar:** AI talking head / lipsync video creation
- **Upscale:** Video resolution enhancement (also available as standalone tab)
- **Angles:** Multi-angle cinematic shot generation from a source image

The active tab is controlled by `aiActiveTab` in the media panel store, which accepts: `"text" | "image" | "avatar" | "upscale" | "angles"`.

### Features
- **Multi-model selection:** Select and compare results across models
- **Cost estimation:** Real-time cost calculation for selected models
- **Per-model settings:** Dedicated settings panels for Sora 2, Veo 3.1, Reve, Kling, WAN, LTX, Seedance, Vidu Q2
- **Generation history:** Track all AI video generations with history panel
- **Validation messages:** Contextual guidance for required inputs per tab/model
- **Progress tracking:** Real-time progress, elapsed time, and status messages

### Supported Providers
Sora 2, Veo 3.1, Kling v2.5/v2.6, WAN 2.5, LTX Video Pro, LTX Fast, Seedance, Vidu Q2, Hailuo, Reve, and more

---

## 4. Video Upscale

**Tab key:** `upscale`
**Label:** "Video Upscale"
**Icon:** `ArrowUpFromLineIcon`
**Group:** edit > ai-edit (AI Assist)
**View:** `apps/web/src/components/editor/media-panel/views/upscale.tsx`

### Summary
Standalone video upscaling panel. Renders the `AiView` component in `mode="upscale"`, showing only the Upscale tab with ByteDance, FlashVSR, and Topaz upscaler settings.

### Features
- **Video upload:** Upload source video file for upscaling
- **Video URL input:** Provide a URL to a video to upscale
- **ByteDance upscaler:** Target resolution and FPS controls
- **FlashVSR upscaler:** Scale factor (2x-4x), acceleration, quality, color fix, preserve audio, output format settings
- **Topaz upscaler:** Scale factor, target FPS, H.264 output toggle
- **Cost estimation:** Per-model cost calculation based on video metadata

### File Path
`apps/web/src/components/editor/media-panel/views/upscale.tsx`

---

## 5. Skills

**Tab key:** `nano-edit`
**Label:** "Skills"
**Icon:** `PaletteIcon`
**Group:** agents (Agents)
**View:** `apps/web/src/components/editor/media-panel/views/skills.tsx`

### Summary
Manage and import AI skills for the active project. Skills are loaded from `.claude/skills` folders and displayed as cards.

### Features
- **Skills list:** Browse all imported skills with card UI
- **Import dialog:** Import new skills from `.claude/skills` folder
- **Delete skills:** Remove skills from the project
- **Project-scoped:** Skills are loaded per-project

### Store
- `useSkillsStore` -- `stores/skills-store.ts`

### File Path
`apps/web/src/components/editor/media-panel/views/skills.tsx`

> **Note:** The old `nano-edit.tsx` view (prompt library + image assets) still exists in the codebase but is no longer wired into the tab system. The `nano-edit` tab key now maps to `SkillsView`.

---

## 6. Text

**Tab key:** `text`
**Label:** "Text"
**Icon:** `TypeIcon`
**Group:** edit > manual-edit (Manual Edit)
**View:** `apps/web/src/components/editor/media-panel/views/text.tsx`

### Summary
Add text and markdown overlays to your video timeline.

### Features
- **Default text template:** Quick-add text with default styling
- **Markdown template:** Add markdown-rendered content blocks
- **Drag to timeline:** Position text at specific timestamps
- **Click to add:** Add text at current playhead position
- **Customization:** Style text after adding to timeline (font, size, color, etc.)

### File Path
`apps/web/src/components/editor/media-panel/views/text.tsx`

---

## 7. Stickers

**Tab key:** `stickers`
**Label:** "Stickers"
**Icon:** `StickerIcon`
**Group:** edit > manual-edit (Manual Edit)
**View:** `apps/web/src/components/editor/media-panel/views/stickers/stickers-view.tsx`

### Summary
Browse and add stickers/icons to your video as overlays.

### Features
- **Icon search:** Search thousands of icons via Iconify API
- **Collections:** Browse curated icon collections
- **Recent stickers:** Quick access to recently used stickers
- **Drag to canvas:** Add stickers directly to the video preview
- **Categories:** Browse by icon collection/category
- **SVG support:** High-quality scalable vector graphics

### File Path
`apps/web/src/components/editor/media-panel/views/stickers/`

---

## 8. Audio Studio

**Tab key:** `video-edit`
**Label:** "Audio Studio"
**Icon:** `Wand2Icon`
**Group:** edit > ai-edit (AI Assist)
**View:** `apps/web/src/components/editor/media-panel/views/video-edit.tsx`

### Summary
AI-powered audio generation and sync for video. Contains two audio models selectable via a pill bar.

### Audio Models

| Model | Label | Description |
|-------|-------|-------------|
| `kling` | Kling Audio | Auto-generate audio from video -- $0.035/video |
| `mmaudio` | MMAudio V2 | Prompt-controlled audio sync -- $0.001/sec |

### Features
- **Audio generation (Kling):** Generate audio/sound effects for video automatically
- **Audio sync (MMAudio V2):** Sync generated audio to video content with prompt control
- **Model selector:** Toggle between Kling Audio and MMAudio V2

### File Path
`apps/web/src/components/editor/media-panel/views/video-edit.tsx`

---

## 9. Remotion

**Tab key:** `remotion`
**Label:** "Remotion"
**Icon:** `Layers`
**Group:** agents (Agents)
**View:** `apps/web/src/components/editor/media-panel/views/remotion/index.tsx`

### Summary
Browse and add Remotion components to the timeline.

### Features
- **Component library:** Browse pre-built Remotion components
- **Category filtering:** Filter by animation, scene, effect, template, etc.
- **Search:** Find components by name
- **Preview modal:** Preview components before adding
- **Import dialog:** Import custom Remotion components
- **Folder import:** Import entire component folders
- **Add to timeline:** Drag components to timeline

### Categories
- Templates
- Text animations
- Transitions
- Scenes
- Effects
- Intros/Outros
- Social media formats
- Custom imports

### File Path
`apps/web/src/components/editor/media-panel/views/remotion/`

---

## 10. Terminal

**Tab key:** `pty`
**Label:** "Terminal"
**Icon:** `SquareTerminalIcon`
**Group:** agents (Agents)
**View:** `apps/web/src/components/editor/media-panel/views/pty-terminal/pty-terminal-view.tsx`

### Summary
Integrated terminal with AI CLI assistant support. The PTY terminal view is always mounted (not unmounted on tab switch) for session persistence.

### Features
- **PTY terminal:** Full pseudo-terminal emulator
- **AI CLI providers:** Integration with Claude Code, Aider, OpenRouter
- **Model selection:** Choose AI model for assistance
- **Session management:** Connect, disconnect, reset sessions
- **Skill context:** Context-aware AI assistance

### Supported CLI Providers
- Claude Code (with model selection)
- Aider
- OpenRouter (various models)

### File Path
`apps/web/src/components/editor/media-panel/views/pty-terminal/pty-terminal-view.tsx`

---

## 11. Smart Speech

**Tab key:** `word-timeline`
**Label:** "Smart Speech"
**Icon:** `TextSelect`
**Group:** edit > ai-edit (AI Assist)
**View:** `apps/web/src/components/editor/media-panel/views/word-timeline-view.tsx`

### Summary
Word-level transcription and timeline editing with AI-powered filler word detection.

### Features
- **Drag & drop import:** Import JSON transcription files
- **Media transcription:** Transcribe video/audio using ElevenLabs Scribe v2 or Gemini 2.5 Pro
- **Word-level timestamps:** Click any word to seek to that position
- **Word deletion:** Mark words for removal (strikethrough)
- **AI filler word analysis:** Detect and suggest removal of filler words
- **Batch operations:** Accept all AI suggestions, reset all filters, undo last change
- **Timing tooltips:** Hover to see word timing info
- **Supported formats:** MP4, MOV, AVI, MKV, WebM, WAV, MP3, M4A, AAC

### Use Cases
- Create subtitles/captions
- Remove filler words ("um", "uh")
- Navigate video by spoken content
- Edit transcript for export

### File Path
`apps/web/src/components/editor/media-panel/views/word-timeline-view.tsx`

---

## 12. Project

**Tab key:** `project-folder`
**Label:** "Project"
**Icon:** `FolderSync`
**Group:** media (Library)
**View:** `apps/web/src/components/editor/media-panel/views/project-folder.tsx`

### Summary
Browse and import files from the project folder structure.

### Features
- **Folder navigation:** Browse project directory tree
- **File type icons:** Visual indicators for video, audio, image files
- **Bulk import:** Select multiple files to import
- **File info:** View file size and type
- **Breadcrumb navigation:** Easy folder traversal
- **Refresh:** Rescan folder for new files
- **Checkbox selection:** Select/deselect files for import

### File Path
`apps/web/src/components/editor/media-panel/views/project-folder.tsx`

---

## 13. Filters (WIP)

**Tab key:** `filters`
**Label:** "Filters (WIP)"
**Icon:** `BlendIcon`
**Group:** edit > manual-edit (Manual Edit)

### Summary
Apply visual filters to video clips.

### Status
**Work in progress** -- Placeholder view currently displayed ("Filters view coming soon...").

---

## 14. Segment (WIP)

**Tab key:** `segmentation`
**Label:** "Segment (WIP)"
**Icon:** `ScissorsIcon`
**Group:** edit > ai-edit (AI Assist)
**View:** `apps/web/src/components/editor/segmentation/index.tsx`

### Summary
AI-powered image and video segmentation using SAM-3.

### Features
- **Text prompts:** Describe what to segment in natural language
- **Point prompts:** Click on objects to segment
- **Box prompts:** Draw bounding boxes around objects
- **Object list:** Manage multiple segmented objects
- **Mask overlay:** Visualize segmentation masks
- **Image/Video modes:** Segment still images or video frames

### Use Cases
- Background removal
- Object isolation
- Subject extraction
- Green screen replacement

### Status
Work in progress -- core functionality implemented.

### File Path
`apps/web/src/components/editor/segmentation/index.tsx`

---

## 15. Sounds (WIP)

**Tab key:** `sounds`
**Label:** "Sounds (WIP)"
**Icon:** `VolumeXIcon`
**Group:** ai-create (Create)
**View:** `apps/web/src/components/editor/media-panel/views/sounds.tsx`

### Summary
Browse and add sound effects and music to your project.

### Features
- **Sound effects library:** Search and browse sound effects
- **Songs library:** Browse music tracks
- **Saved sounds:** Quick access to favorited sounds
- **Preview playback:** Listen before adding
- **Favorites:** Save frequently used sounds
- **Filter options:** Filter by category/type
- **Infinite scroll:** Load more results as you browse

### Status
Work in progress -- basic functionality available.

### File Path
`apps/web/src/components/editor/media-panel/views/sounds.tsx`

---

## 16. Effects (WIP)

**Tab key:** `effects`
**Label:** "Effects (WIP)"
**Icon:** `SparklesIcon`
**Group:** edit > manual-edit (Manual Edit)
**View:** `apps/web/src/components/editor/media-panel/views/effects.tsx`

### Summary
Apply visual effects to timeline elements. Lazy-loaded and gated behind `EFFECTS_ENABLED` feature flag.

### Features
- **Effect presets:** Browse pre-configured effects with gradient previews
- **Categories:** Basic, color, artistic, vintage, cinematic, distortion
- **Search:** Find effects by name or description
- **Apply to selection:** Apply effects to selected timeline elements
- **Drag & drop:** Drag effects onto timeline elements
- **Effects track:** Auto-show effects track when applied

### Status
Work in progress -- requires `EFFECTS_ENABLED` feature flag.

### File Path
`apps/web/src/components/editor/media-panel/views/effects.tsx`

---

## 17. Transitions (WIP)

**Tab key:** `transitions`
**Label:** "Transitions (WIP)"
**Icon:** `ArrowLeftRightIcon`
**Group:** edit > manual-edit (Manual Edit)

### Summary
Add transitions between clips on the timeline.

### Status
**Coming soon** -- Placeholder view currently displayed ("Transitions view coming soon...").

---

## 18. Director (Moyin)

**Tab key:** `moyin`
**Label:** "Director"
**Icon:** `ClapperboardIcon`
**Group:** ai-create (Create)
**View:** `apps/web/src/components/editor/media-panel/views/moyin/index.tsx`

### Summary
Script-to-storyboard workflow powered by Moyin. Parse scripts into structured episodes, characters, scenes, and shots with AI-assisted prompt generation.

### Features
- **Script input:** Paste or type scripts with example templates
- **Script parsing:** AI-powered parsing into episodes, characters, scenes, and shots
- **Split-panel layout:** Script input (left), structure hierarchy (center), property detail (right)
- **Episode/character/scene management:** Browse and edit the parsed hierarchy
- **Shot detail editing:** Three-tier prompt editing per shot (image, video, end frame) with EN/ZH toggle
- **Character variations:** Manage character visual variants
- **Cinema selectors:** Camera/shot type configuration per shot
- **Media preview:** Preview generated media in a modal
- **Project persistence:** Load/save per project

### Store
- `useMoyinStore` -- `stores/moyin/moyin-store.ts`

### File Path
`apps/web/src/components/editor/media-panel/views/moyin/`

---

## Architecture Overview

### Store Files
Each panel typically has an associated Zustand store for state management:

| Panel | Store File |
|-------|------------|
| Media | `stores/media/media-store.ts` |
| AI Video | (local state in `views/ai/index.tsx` + extracted hooks) |
| Adjustment | `stores/ai/adjustment-store.ts` |
| Text2Image | `stores/ai/text2image-store.ts` |
| Stickers | `stores/stickers-store.ts` |
| Draw | `stores/editor/white-draw-store.ts` |
| Camera Selector | `stores/editor/camera-selector-store.ts` |
| Segmentation | `stores/ai/segmentation-store.ts` |
| Sounds | `stores/media/sounds-store.ts` |
| Effects | `stores/ai/effects-store.ts` |
| Terminal | `stores/pty-terminal-store.ts` |
| Remotion | `stores/ai/remotion-store.ts` |
| Smart Speech | `stores/timeline/word-timeline-store.ts` |
| Skills | `stores/skills-store.ts` |
| Director (Moyin) | `stores/moyin/moyin-store.ts` |

### Tab Configuration
Panel tabs are configured in:
- **Tab & group definitions:** `apps/web/src/components/editor/media-panel/store.ts`
- **Group bar rendering:** `apps/web/src/components/editor/media-panel/group-bar.tsx`
- **Tab bar rendering:** `apps/web/src/components/editor/media-panel/tabbar.tsx`
- **View mapping:** `apps/web/src/components/editor/media-panel/index.tsx`

### Tab Type Definition
```typescript
export type Tab =
  | "media"
  | "text"
  | "stickers"
  | "video-edit"
  | "effects"
  | "transitions"
  | "filters"
  | "text2image"
  | "nano-edit"
  | "ai"
  | "sounds"
  | "segmentation"
  | "remotion"
  | "pty"
  | "word-timeline"
  | "project-folder"
  | "upscale"
  | "moyin";
```

### Panels Not Wired into Tab System
The following views exist in the codebase but are **not** registered as tabs in `store.ts`:
- **Audio** (`views/audio.tsx`) -- standalone search UI, not a tab
- **Captions** (`stores/captions-store.ts`) -- store exists but no tab registration
- **Nano Edit** (`views/nano-edit.tsx`) -- old prompt library view, replaced by `SkillsView` under the `nano-edit` tab key

---

*Last updated: February 2026*
