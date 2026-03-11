# QCut Source Code Structure Documentation

## Overview

This document provides a comprehensive overview of the QCut source code structure, including folder organization and line counts for all TypeScript/JavaScript source files.

**Generated:** 2026-03-11
**Total Source Files:** 827+ files in src/ + 232+ in electron/
**Test Files:** 205 unit + 23 E2E test files
**Main Source Directory:** `apps/web/src/`

## Project Architecture

QCut is a desktop video editor built with:
- **Frontend Framework:** Vite + TanStack Router + React 19.1.0
- **Desktop Runtime:** Electron (100% TypeScript)
- **Language:** TypeScript
- **State Management:** Zustand
- **Video Processing:** FFmpeg WebAssembly
- **AI Integration:** FAL.ai (80+ models)
- **Styling:** Tailwind CSS
- **Testing:** Vitest ^4.0.0 with 205 unit + 23 E2E test files

## Source Code Structure

### Root Configuration Files
```text
apps/web/
├── vite.config.ts                    # Vite configuration
├── tsconfig.json                     # TypeScript configuration
├── tailwind.config.ts                # Tailwind CSS configuration
├── vitest.config.ts                  # Vitest test configuration
├── components.json                   # UI components configuration
└── package.json                      # Dependencies and scripts
```

### Main Source Directory: `apps/web/src/`

#### Routes (`src/routes/`) - 16 files
Main application routing using TanStack Router:
- `__root.tsx` - Root layout component
- `index.tsx` - Home page route
- `editor.$project_id.tsx` - Main editor route
- `editor.$project_id.lazy.tsx` - Lazy-loaded editor components
- `projects.tsx` - Projects list route
- `projects.lazy.tsx` - Lazy-loaded projects components
- `blog.tsx` + `blog.$slug.tsx` - Blog functionality
- `login.tsx` + `signup.tsx` - Authentication routes
- `changelog.tsx` - Version changelog
- `contributors.tsx` - Contributors page
- `privacy.tsx` + `terms.tsx` - Legal pages
- `roadmap.tsx` - Product roadmap
- `why-not-capcut.tsx` - Comparison page

#### Components (`src/components/`)

##### UI Components (`src/components/ui/`) - 64 files (+ 9 test files)
Base UI components built on Radix UI primitives:

**Core Components:**
- `button.tsx`, `input.tsx`, `textarea.tsx` - Form inputs
- `dialog.tsx`, `alert-dialog.tsx`, `sheet.tsx` - Modal interfaces
- `dropdown-menu.tsx`, `context-menu.tsx`, `menubar.tsx` - Menu systems
- `table.tsx`, `tabs.tsx`, `card.tsx` - Layout components
- `toast.tsx`, `toaster.tsx`, `sonner.tsx` - Notification system

**Interactive Components:**
- `accordion.tsx`, `collapsible.tsx` - Expandable content
- `carousel.tsx`, `slider.tsx` - Range/navigation controls
- `checkbox.tsx`, `radio-group.tsx`, `switch.tsx` - Selection inputs
- `select.tsx`, `command.tsx` - Dropdown selections
- `calendar.tsx`, `popover.tsx` - Date/overlay components
- `drawer.tsx`, `hover-card.tsx` - Overlay panels

**Media & Display:**
- `audio-player.tsx`, `video-player.tsx` - Media controls
- `avatar.tsx`, `badge.tsx`, `skeleton.tsx` - Display elements
- `progress.tsx`, `scroll-area.tsx` - Progress/scrolling
- `resizable.tsx`, `draggable-item.tsx` - Interactive layouts

**Specialized Components:**
- `font-picker.tsx`, `phone-input.tsx`, `input-otp.tsx` - Specialized inputs
- `image-timeline-treatment.tsx`, `editable-timecode.tsx` - Video editor UI
- `floating-action-panel.tsx`, `split-button.tsx` - Custom components
- `blob-image.tsx` - Blob URL image display
- `chart.tsx`, `prose.tsx` - Content display
- `ErrorMessage.tsx`, `LoadingSpinner.tsx` - Feedback components
- `theme-toggle.tsx` - Theme switching
- `file-upload.tsx`, `input-with-back.tsx` - File/input utilities
- `aspect-ratio.tsx`, `alert.tsx`, `breadcrumb.tsx` - Layout/display
- `form.tsx`, `label.tsx`, `separator.tsx` - Form elements
- `navigation-menu.tsx`, `pagination.tsx`, `sidebar.tsx` - Navigation
- `toggle.tsx`, `toggle-group.tsx`, `tooltip.tsx` - Interactive elements

##### Editor Components (`src/components/editor/`)
Core video editor interface:

**Timeline System (`timeline/`) - 15 files:**
- `index.tsx` - Main timeline container
- `timeline-track.tsx` - Individual timeline tracks
- `timeline-element.tsx` - Media elements on timeline
- `timeline-element-drop-zone.tsx` - Drop zones for elements
- `timeline-playhead.tsx` - Current position indicator
- `timeline-cache-indicator.tsx` - Cache status display
- `timeline-toolbar.tsx` - Timeline toolbar controls
- `timeline-drag-handlers.ts` - Drag interaction handlers
- `effects-timeline.tsx` - Effects timeline view
- `keyframe-timeline.tsx` - Keyframe animation timeline
- `parsed-sequence-overlay.tsx` - Parsed sequence overlay display
- `remotion-element.tsx` - Remotion element rendering
- `remotion-sequences.tsx` - Remotion sequence management
- `track-icon.tsx` - Track type icons
- `use-track-drop.ts` - Track drop handling hook

**Properties Panel (`properties-panel/`) - 15 files + `prop-editors/` subdir:**
- `index.tsx` - Properties container
- `media-properties.tsx` - Media element properties
- `text-properties.tsx` - Text element properties
- `audio-properties.tsx` - Audio element properties
- `effects-properties.tsx` - Effects configuration
- `transform-properties.tsx` - Transform controls
- `volume-control.tsx` - Volume adjustment
- `effect-management.tsx` - Effect management UI
- `export-panel-content.tsx` - Export settings
- `settings-view.tsx` - Settings panel
- `panel-tabs.tsx` - Tab navigation
- `property-item.tsx` - Reusable property item
- `keyframe-editor.tsx` - Keyframe editing interface
- `markdown-properties.tsx` - Markdown element properties
- `remotion-properties.tsx` - Remotion component properties
- `prop-editors/` - Modular property editors (8 files):
  - `boolean-prop.tsx`, `color-prop.tsx`, `number-prop.tsx`, `select-prop.tsx`, `text-prop.tsx`
  - `prop-editor-factory.tsx`, `index.ts`, `types.ts`

**Media Panel (`media-panel/`) - Main container + views:**
- `index.tsx` - Media library container
- `tabbar.tsx` - Tab bar navigation
- `store.ts` - Local panel state
- `create-folder-dialog.tsx` - Folder creation dialog
- `drag-overlay.tsx` - Drag overlay component
- `export-all-button.tsx` - Export all button
- `folder-item.tsx`, `folder-tree.tsx` - Folder navigation
- `group-bar.tsx` - Group bar component
- `import-skill-dialog.tsx` - Skill import dialog
- `skill-card.tsx` - Skill card display

**Media Panel Views (`media-panel/views/`) - 35+ files:**

*Core Views:*
- `media.tsx` - Media file browser
- `text.tsx` - Text creation tools
- `audio.tsx` - Audio library and tools
- `sounds.tsx` - Sound effects library
- `captions.tsx` - Caption generation and editing
- `stickers.tsx` - Sticker library with search
- `draw.tsx` - Drawing tools
- `effects.tsx` - Effects browser
- `effects-gallery.tsx` - Effects gallery view
- `effects-search.tsx` - Effects search interface
- `nano-edit.tsx` - Nano edit interface
- `skills.tsx` - Skills management
- `project-folder.tsx` - Project folder view
- `word-timeline-view.tsx` - Word timeline editing
- `upscale.tsx` - Upscale view

*AI Generation Views (`ai/` subdirectory):*
- Modular AI generation interface with components, hooks, settings, tabs, constants, types, utils

*Text-to-Image & Video:*
- `text2image.tsx` - Text-to-image generation
- `model-type-selector.tsx` - AI model selection

*Video Editing:*
- `video-edit.tsx` - Video editing tools
- `video-edit-audio-gen.tsx` - Audio generation
- `video-edit-audio-sync.tsx` - Audio synchronization
- `video-edit-audio.tsx` - Audio editing
- `video-edit-upscale.tsx` - Video upscaling
- `video-edit-constants.ts` - Video edit constants
- `video-edit-types.ts` - Type definitions
- `video-edit-exports.ts` - Export utilities
- `use-video-edit-processing.ts` - Processing hook

*Upscale:*
- `upscale-settings.tsx` - Upscale configuration
- `use-upscale-generation.ts` - Upscale generation hook

*Subdirectories:*
- `media/` - Media item cards and previews (5 files)
- `moyin/` - Moyin cinematic workflow (22+ files)
- `camera-selector/` - Camera selector view (3 files)
- `gemini-terminal/` - Gemini terminal components (3 files)
- `pty-terminal/` - PTY terminal view (3 files)
- `remotion/` - Remotion component browser (5 files)
- `stickers/` - Stickers view components, hooks, types (8+ files)
- `word-timeline/` - Word timeline components (3 files)

**Preview Panel (`preview-panel/`) - 9 files:**
- `interactive-element-overlay.tsx` - Interactive element overlays
- `mcp-media-app.ts` - MCP media application
- `preview-element-renderer.tsx` - Element rendering in preview
- `remotion-preview.tsx` - Remotion preview integration
- `types.ts` - Preview type definitions
- `use-effects-rendering.ts` - Effects rendering hook
- `use-preview-drag.ts` - Preview drag interaction hook
- `use-preview-media.ts` - Preview media loading hook
- `use-preview-sizing.ts` - Preview sizing hook

**Also in editor root:**
- `preview-panel.tsx` - Video preview window
- `preview-panel-components.tsx` - Preview sub-components

**Adjustment Panel (`adjustment/`) - 8 files:**
- `index.tsx` - Image adjustment interface
- `edit-history.tsx` - Edit history management
- `parameter-controls.tsx` - Adjustment controls
- `preview-panel.tsx` - Adjustment preview
- `image-uploader.tsx` - Image upload interface
- `conditional-image-uploader.tsx` - Conditional image upload
- `multi-image-upload.tsx` - Multi-image upload
- `model-selector.tsx` - AI model selection

**Canvas (`canvas/`) - 1 file:**
- `markdown-overlay.tsx` - Markdown overlay rendering on canvas

**Panels (`panels/`) - 1 file:**
- `markdown-editor-panel.tsx` - Markdown editor panel

**Effects System:**
- `effect-chain-manager.tsx` - Effect chain management
- `effect-templates-panel.tsx` - Effect templates UI

**Segmentation (`segmentation/`) - 7 files:**
- `index.tsx`, `SegmentationCanvas.tsx`, `SegmentationControls.tsx`
- `ImageUploader.tsx`, `MaskOverlay.tsx`, `ObjectList.tsx`, `PromptToolbar.tsx`

**Drawing Tools (`draw/`):**
- `canvas/` - Drawing canvas (1 file)
- `components/` - UI components (5 files)
- `constants/` - Tool definitions (1 file)
- `hooks/` - Canvas hooks (3 files)
- `utils/` - Canvas utilities (3 files)

**Nano Edit (`nano-edit/`):**
- `components/` - Nano edit components (9 files)
- `constants/` - Transformation constants (1 file)
- `tabs/` - Tab components (1 file)
- `utils/` - File utilities (1 file)

**Stickers Overlay System (`stickers-overlay/`):**
- `index.ts` - Sticker overlay management
- `StickerCanvas.tsx` - Canvas for sticker rendering
- `StickerElement.tsx` - Individual sticker elements
- `StickerControls.tsx` - Sticker manipulation controls
- `ResizeHandles.tsx` - Resize handles for stickers
- `AutoSave.tsx` - Auto-save functionality
- `hooks/useStickerDrag.ts` - Drag handling hook

**Other Editor Components:**
- `audio-waveform.tsx` - Audio visualization
- `snap-indicator.tsx` - Snapping visual feedback
- `selection-box.tsx` - Multi-selection tool
- `speed-control.tsx` - Playback speed controls
- `panel-layouts.tsx` - Panel layout management
- `auto-save-indicator.tsx` - Auto-save status
- `panel-error-fallback.tsx` - Panel error fallback UI
- `screen-recording-control.tsx` - Screen recording controls
- `screenshot-control.tsx` - Screenshot capture controls
- `interactive-element-overlay.tsx` - Interactive overlays
- `scenes-view.tsx` - Scene management interface

##### Captions Components (`src/components/captions/`) - 3 files
**Note:** Located at `components/captions/`, not under `components/editor/`.
- `captions-display.tsx` - Caption display interface
- `language-select.tsx` - Language selection
- `upload-progress.tsx` - Upload progress indicator

##### Export Dialog (`src/components/export-dialog/`) - 5 files
- `export-dialog.tsx` - Main export dialog
- `export-media-cards.tsx` - Media card display
- `export-settings-cards.tsx` - Settings cards
- `export-warnings.tsx` - Export warning display
- `index.ts` - Barrel export

##### Export Components (`src/components/export/`) - 1 file
- `remotion-export-progress.tsx` - Remotion export progress display

##### License Components (`src/components/license/`) - 3 files
- `buy-credits-prompt.tsx` - Credit purchase prompt
- `credit-balance.tsx` - Credit balance display
- `upgrade-prompt.tsx` - Upgrade prompt

##### Providers (`src/components/providers/`)
- `migrators/` - Data migration components:
  - `blob-url-cleanup.tsx` - Blob URL cleanup migrator
  - `scenes-migrator.tsx` - Scenes data migrator

##### Application Components (`src/components/`) - 20+ root files
- `header-base.tsx`, `header.tsx` - Application headers
- `editor-header.tsx` - Editor-specific header
- `editor-provider.tsx` - Editor context provider
- `storage-provider.tsx` - Storage abstraction context
- `background-settings.tsx` - Project settings
- `delete-project-dialog.tsx`, `rename-project-dialog.tsx` - Project management
- `export-dialog.tsx` - Export functionality (legacy root-level)
- `export-canvas.tsx` - Export canvas rendering
- `export-icons.tsx` - Export-related icons
- `error-boundary.tsx` - Error boundary component
- `ffmpeg-health-notification.tsx` - FFmpeg health status notification
- `update-notification.tsx` - Application update notification
- `keyboard-shortcuts-help.tsx` - Help system
- `onboarding.tsx` - User onboarding
- `panel-preset-selector.tsx` - Panel layout presets
- `icons.tsx` - Icon definitions
- `footer.tsx` - Application footer
- `landing/hero.tsx`, `landing/handlebars.tsx` - Landing page components
- `test-sounds-store.tsx` - Testing component for sounds store

#### Stores (`src/stores/`) - 59 files total
Zustand state management, organized into domain subdirectories:

**`stores/timeline/`** — Timeline state (4 stores + 14 modules = 18 files):
- `timeline-store.ts` - Timeline operations and state management
- `timeline-store-operations.ts` - Extended timeline operations
- `timeline-store-crud.ts` - CRUD operations for timeline
- `timeline-store-autosave.ts` - Auto-save functionality
- `timeline-store-normalization.ts` - Data normalization
- `timeline-store-persistence.ts` - Persistence layer
- `timeline-add-ops.ts` - Add operations
- `timeline-element-ops.ts` - Element operations
- `timeline-track-ops.ts` - Track operations
- `word-timeline-store.ts` - Word-level timeline editing
- `scene-store.ts` - Scene management
- `index.ts`, `types.ts`, `utils.ts` - Barrel export and shared types
- `element-operations.ts`, `track-operations.ts`, `split-operations.ts`, `persistence.ts` - Modular operations

**`stores/media/`** — Media management (6 files):
- `media-store.ts` - Media file handling and organization
- `media-store-types.ts` - Media type definitions
- `media-store-loader.ts` - Media loading utilities
- `media-store-folders.ts` - Folder management for media
- `media-store-helpers.ts` - Media store helper functions
- `sounds-store.ts` - Sound effects library state

**`stores/moyin/`** — Moyin workflow (7 files):
- `moyin-store.ts`, `moyin-generation.ts`, `moyin-calibration.ts`
- `moyin-shot-generation.ts`, `moyin-persistence.ts`
- `moyin-gen-config.ts`, `moyin-undo.ts`

**`stores/editor/`** — Editor UI state (7 files):
- `editor-store.ts` - Main editor state and settings
- `panel-store.ts` - UI panel visibility and layout
- `keybindings-store.ts` - Keyboard shortcut management
- `playback-store.ts` - Video playback controls and state
- `camera-selector-store.ts`, `white-draw-store.ts`, `nano-edit-store.ts`

**`stores/ai/`** — AI feature stores (5 files):
- `text2image-store.ts` - AI image generation
- `remotion-store.ts` - Remotion integration
- `segmentation-store.ts` - AI segmentation state
- `adjustment-store.ts` - Image adjustment tools
- `effects-store.ts` - Effects system state

**`stores/` (root)** — Shared stores and re-export shims (16 files):
- `project-store.ts` - Project persistence and management
- `export-store.ts`, `folder-store.ts`, `captions-store.ts`
- `stickers-store.ts`, `stickers-overlay-store.ts`
- `pty-terminal-store.ts`, `gemini-terminal-store.ts`
- `skills-store.ts`, `mcp-app-store.ts`
- `license-store.ts` - License and credits management
- `effects-store.ts` - Effects re-export shim
- `editor-store.ts` - Editor re-export shim
- `media-store.ts`, `media-store-types.ts` - Media re-export shims
- `timeline-store.ts` - Timeline re-export shim

#### Library (`src/lib/`) - 18 root files + 15 subdirectories
Core functionality and utilities:

**`lib/export/`** — Export engine and related (20 files):
- `export-engine.ts` - Main export engine
- `export-engine-optimized.ts` - Performance-optimized export
- `export-engine-factory.ts` - Export strategy factory
- `export-engine-cli.ts` - Command-line export interface
- `export-engine-cli-audio.ts`, `export-engine-cli-utils.ts` - CLI helpers
- `export-engine-cli-debug.ts`, `export-engine-cli-ffmpeg.ts` - CLI debug and FFmpeg integration
- `export-engine-cli-mode.ts`, `export-engine-cli-validation.ts` - CLI mode and validation
- `export-engine-debug.ts`, `export-engine-recorder.ts`, `export-engine-renderer.ts`, `export-engine-utils.ts`
- `export-analysis.ts`, `export-errors.ts` - Analysis and errors
- `webcodecs-export-engine.ts`, `webcodecs-detector.ts` - WebCodecs support
- `audio-export-config.ts` - Audio export configuration
- `index.ts` - Barrel export

**`lib/ffmpeg/`** — FFmpeg utilities (8 files):
- `ffmpeg-utils.ts` - FFmpeg WebAssembly integration
- `ffmpeg-utils-encode.ts`, `ffmpeg-utils-loader.ts`, `ffmpeg-loader.ts`
- `ffmpeg-filter-chain.ts`, `ffmpeg-video-recorder.ts`
- `audio-mixer.ts`, `memory-utils.ts`

**`lib/ai-clients/`** — AI service clients (16 files):
- `fal-ai-client.ts` - FAL AI service integration
- `fal-ai-client-generation.ts`, `fal-ai-client-reve.ts`, `fal-ai-client-veo31.ts`
- `fal-ai-client-internal-types.ts`
- `image-edit-client.ts`, `image-edit-models-info.ts`, `image-edit-polling.ts`
- `image-edit-capabilities.ts`, `image-edit-types.ts`, `image-edit-utils.ts`
- `video-edit-client.ts`, `sam3-client.ts`, `sam3-models.ts`
- `ai-video-client.ts`, `ai-video-output.ts`

**`lib/ai-models/`** — Model definitions (6 files):
- `model-utils.ts`, `upscale-models.ts`, `text2image-models.ts`
- `camera-prompt-builder.ts`, `image-validation.ts`
- `index.ts` - Barrel export

**`lib/effects/`** — Visual effects system (6 files):
- `effects-utils.ts`, `effects-chaining.ts`, `effects-keyframes.ts`
- `effects-canvas-advanced.ts`, `canvas-utils.ts`
- `index.ts` - Barrel export

**`lib/stickers/`** — Sticker system (8 files):
- `sticker-downloader.ts`, `sticker-persistence-debug.ts`
- `sticker-test-helper.ts`, `sticker-timeline-query.ts`
- `timeline-sticker-integration.ts`, `debug-sticker-overlay.ts`
- `iconify-api.ts`, `sticker-export-helper.ts`

**`lib/claude-bridge/`** — Claude <> renderer bridge (16 files):
- `claude-timeline-bridge.ts` - Main timeline bridge
- `claude-timeline-bridge-helpers.ts` - Timeline bridge helpers
- `claude-timeline-bridge-batch.ts` - Batch timeline operations
- `claude-timeline-bridge-elements.ts` - Element operations bridge
- `claude-timeline-bridge-request.ts` - Request handling bridge
- `claude-bridge-lifecycle.ts` - Bridge lifecycle management
- `claude-events-bridge.ts` - Events bridge
- `claude-moyin-bridge.ts` - Moyin workflow bridge
- `claude-navigator-bridge.ts` - Navigation bridge
- `claude-project-crud-bridge.ts` - Project CRUD bridge
- `claude-screen-recording-bridge.ts` - Screen recording bridge
- `claude-state-bridge.ts` - State synchronization bridge
- `claude-transaction-bridge.ts` - Transaction bridge
- `claude-ui-bridge.ts` - UI interaction bridge
- `project-skills-sync.ts` - Project skills synchronization
- `index.ts` - Barrel export

**`lib/media/`** — Media processing and metadata (7 files):
- `media-processing.ts`, `media-source.ts`, `video-metadata.ts`
- `image-utils.ts`, `blob-manager.ts`, `blob-url-debug.ts`, `bulk-import.ts`

**`lib/project/`** — Project management (5 files):
- `project-folder-sync.ts`, `zip-manager.ts`
- `screen-recording-controller.ts`, `release-notes.ts`
- `index.ts` - Barrel export

**`lib/debug/`** — Debug and error utilities (7 files):
- `debug-config.ts`, `debug-logger.ts`, `dev-memory-profiler.ts`
- `error-handler.ts`, `error-context.ts`, `pty-session-cleanup.ts`
- `index.ts` - Barrel export

**`lib/filmstrip/`** — Video filmstrip thumbnails (2 files):
- `filmstrip-cache.ts` - Filmstrip thumbnail caching
- `filmstrip-extractor.ts` - Filmstrip frame extraction

**`lib/utils/`** — Shared utility functions (2 files):
- `effects.ts` - Effects utility helpers
- `nano-edit-utils.ts` - Nano edit utility helpers

**`lib/` (root)** — Core utilities (18 files):
- `utils.ts`, `time.ts`, `timeline.ts`, `markdown.ts`
- `font-config.ts`, `feature-flags.ts`, `feature-gates.ts`, `rate-limit.ts`, `asset-path.ts`
- `api-adapter.ts`, `blog-query.ts`, `fetch-github-stars.ts`, `waitlist.ts`
- `credit-costs.ts` - Credit cost calculations
- `blob-manager.ts` - Root-level blob manager
- `debug-config.ts` - Root-level debug configuration
- `error-handler.ts` - Root-level error handler
- `index.ts` - Barrel export

**Other subdirectories:**
- `ai-video/` - Modular AI video system (core, generators, models, validation)
- `fal-ai/` - Extended FAL.ai model handlers
- `export-cli/` - CLI export filters and sources
- `effects-templates/` - Effect template data (4 files)
- `storage/` - Storage abstraction (IndexedDB, localStorage, OPFS, Electron, R2) (7 files)
- `text2image-models/` - Text-to-image model definitions (6 files)
- `remotion/` - Remotion integration (15+ files, with built-in templates, text, transitions)
- `moyin/` - Moyin workflow (character, presets, script, storyboard, utils)
- `captions/` - Caption export (1 file)
- `gemini/` - Gemini AI utilities (1 file)
- `transcription/` - Transcription segment calculator (1 file)

#### Hooks (`src/hooks/`) - 38 files
Custom React hooks, organized into domain subdirectories:

**`hooks/timeline/`** — Timeline interaction hooks (8 files):
- `use-timeline-zoom.ts` - Timeline zoom controls
- `use-timeline-snapping.ts` - Element snapping logic
- `use-timeline-element-resize.ts` - Element resizing
- `use-timeline-playhead.ts` - Playhead positioning
- `use-selection-box.ts` - Multi-selection functionality
- `use-filmstrip-thumbnails.ts` - Filmstrip thumbnail rendering
- `use-frame-cache.ts` - Frame caching for playback
- `use-playback-controls.ts` - Video playback controls

**`hooks/export/`** — Export workflow hooks (5 files):
- `use-export-presets.ts` - Export preset management
- `use-export-progress.ts` - Export progress tracking
- `use-export-settings.ts` - Export settings management
- `use-export-validation.ts` - Export validation logic
- `use-zip-export.ts` - Project export to ZIP

**`hooks/keyboard/`** — Keyboard shortcut hooks (4 files):
- `use-keybindings.ts` - Keyboard shortcut handling
- `use-keybinding-conflicts.ts` - Shortcut conflict detection
- `use-keyboard-shortcuts-help.ts` - Help system integration
- `use-effect-keyboard-shortcuts.ts` - Effect keyboard shortcuts

**`hooks/media/`** — Media and playback hooks (6 files):
- `use-aspect-ratio.ts` - Aspect ratio calculations
- `use-async-ffmpeg.ts` - Asynchronous FFmpeg operations
- `use-async-media-store.ts` - Media loading and caching
- `use-blob-image.ts` - Blob URL image handling
- `use-elevenlabs-transcription.ts` - ElevenLabs transcription integration
- `use-sound-search.ts` - Sound search functionality

**`hooks/` (root)** — General-purpose hooks (15 files):
- `use-ai-pipeline.ts` - AI pipeline integration
- `use-claude-project-updates.ts` - Claude project update handling
- `use-project-folder.ts` - Project folder management
- `use-skill-runner.ts` - Skill execution hook
- `use-infinite-scroll.ts` - Infinite scrolling support
- `use-async-module-loading.tsx` - Dynamic module loading
- `use-mobile.tsx` - Mobile device detection
- `use-toast.ts` - Toast notification system
- `use-debounce.ts` - Debounce functionality
- `use-drag-drop.ts` - Drag and drop interactions
- `use-editor-actions.ts` - Core editor operations
- `use-error-reporter.ts` - Error reporting
- `use-memory-monitor.ts` - Memory monitoring
- `use-save-on-visibility-change.ts` - Auto-save on visibility change
- `useElectron.ts` - Electron integration

**`hooks/auth/`** — Authentication hooks:
- `useLogin.ts` - User login functionality
- `useSignUp.ts` - User registration

#### Types (`src/types/`) - 23 root files + `electron/` subdir (24 files)
TypeScript type definitions:

**Root type files (23):**
- `timeline.ts` - Timeline data structures and interfaces
- `editor.ts` - Editor state and component interfaces
- `project.ts` - Project data models and schemas
- `playback.ts` - Video playback state types
- `keybinding.ts` - Keyboard shortcut definitions
- `export.ts` - Export configuration types
- `post.ts` - Blog post data structures
- `captions.ts` - Caption data structures
- `sounds.ts` - Sound effect type definitions
- `sticker-overlay.ts` - Sticker overlay types
- `panel.ts` - Panel layout type definitions
- `electron.d.ts` - Electron API type extensions
- `ai-generation.ts` - AI generation types
- `effects.ts` - Effects type definitions
- `nano-edit.ts` - Nano edit types
- `sam3.ts` - SAM3 segmentation types
- `sora2.ts` - Sora 2 AI types
- `white-draw.ts` - Drawing tool types
- `cli-provider.ts` - CLI provider types
- `moyin-script.ts` - Moyin script types
- `skill.ts` - Skill system types
- `word-timeline.ts` - Word timeline types

**`types/electron/`** — Electron API type definitions (24 files):
- `electron-api.ts` - Main Electron API interface
- `index.ts` - Barrel export
- `ai-pipeline.ts` - AI pipeline API types
- `api-audio-video.ts` - Audio/video API types
- `api-claude.ts` - Claude API types
- `api-external.ts` - External API types
- `api-ffmpeg.ts` - FFmpeg API types
- `api-file-ops.ts` - File operations API types
- `api-gemini-pty-mcp.ts` - Gemini/PTY/MCP API types
- `api-license.ts` - License API types
- `api-moyin.ts` - Moyin API types
- `api-remotion.ts` - Remotion API types
- `api-skills.ts` - Skills API types
- `api-sounds.ts` - Sounds API types
- `api-storage.ts` - Storage API types
- `api-transcription.ts` - Transcription API types
- `api-updates.ts` - Updates API types
- `license.d.ts` - License type declarations
- `media-import.ts` - Media import types
- `project-folder.ts` - Project folder types
- `release-notes.ts` - Release notes types
- `remotion.ts` - Remotion types
- `screen-recording.ts` - Screen recording types
- `transcription.ts` - Transcription types

#### Constants (`src/constants/`) - 5 files
Application constants:
- `timeline-constants.ts` - Timeline configuration and defaults
- `font-constants.ts` - Available font definitions
- `actions.ts` - Editor action types and definitions
- `site.ts` - Site metadata and configuration
- `effect-parameter-ranges.ts` - Effect parameter ranges

#### Config (`src/config/`) - 1 file
Configuration:
- `features.ts` - Feature flags configuration

#### Services (`src/services/`)
Service layer:
- `ai/fal-ai-service.ts` - FAL.ai service integration

#### Data (`src/data/`) - 1 file
Static data:
- `colors.ts` - Application color palette definitions

#### Test (`src/test/`)
Test utilities and setup files for Vitest

#### Main Source Files - 6 files
Core application bootstrap files:
- `routeTree.gen.ts` - Generated TanStack Router tree
- `App.tsx` - Main application component
- `globals.css` - Global CSS styles
- `env.ts` - Environment configuration
- `env.client.ts` - Client-side environment
- `main.tsx` - Application entry point

### Electron Integration

#### Main Process (`electron/`) - 41 root TypeScript files
All Electron code is 100% TypeScript:

**Core:**
- `main.ts` - Electron main process and window management
- `main-ipc.ts` - IPC channel registration
- `preload.ts` - Preload script for secure IPC communication
- `preload-integrations.ts` - Preload integration helpers
- `preload-types.ts` - Preload type definitions

**FFmpeg & Media Processing:**
- `ffmpeg-handler.ts` - FFmpeg CLI integration and processing
- `ffmpeg-args-builder.ts` - FFmpeg argument construction
- `ffmpeg-basic-handlers.ts` - Basic FFmpeg operations
- `ffmpeg-export-handler.ts` - FFmpeg export handling
- `ffmpeg-export-mode15.ts` - Export mode 15 implementation
- `ffmpeg-export-word-filter.ts` - Word-level export filtering
- `ffmpeg-filter-cut.ts` - FFmpeg filter cut operations
- `ffmpeg-utility-handlers.ts` - FFmpeg utility operations
- `sound-handler.ts` - Sound effects handling
- `audio-temp-handler.ts` - Audio temporary files
- `video-temp-handler.ts` - Video temporary files
- `ai-video-save-handler.ts` - AI video save functionality
- `temp-manager.ts` - Temporary file management
- `media-import-handler.ts` - Media import handling

**AI & Transcription:**
- `gemini-transcribe-handler.ts` - Gemini transcription
- `gemini-chat-handler.ts` - Gemini chat integration
- `elevenlabs-transcribe-handler.ts` - ElevenLabs transcription
- `ai-pipeline-handler.ts` - AI content pipeline
- `ai-pipeline-ipc.ts` - AI pipeline IPC channels
- `ai-pipeline-output.ts` - AI pipeline output handling
- `ai-filler-handler.ts` - AI filler content handler
- `binary-manager.ts` - Binary management for AI tools

**Configuration & Security:**
- `api-key-handler.ts` - Secure API key management
- `theme-handler.ts` - Theme management
- `license-handler.ts` - License management
- `release-notes-utils.ts` - Release notes utilities

**Terminal & Skills:**
- `pty-handler.ts` - PTY terminal session management
- `pty-spawn-diagnostics.ts` - PTY spawn diagnostics
- `skills-handler.ts` - AI skills file operations
- `skills-sync-handler.ts` - Skills synchronization

**Project & Remotion:**
- `project-folder-handler.ts` - Project folder management
- `screen-recording-handler.ts` - Screen recording (root-level entry)
- `remotion-bundler.ts` - Remotion bundling
- `remotion-composition-parser.ts` - Remotion composition parsing
- `remotion-folder-handler.ts` - Remotion folder management
- `moyin-handler.ts` - Moyin workflow handler

#### Electron Subdirectories

**`electron/main-ipc/`** — Modular IPC handler registration (11 files):
- `index.ts` - IPC handler barrel export
- `types.ts` - IPC type definitions
- `audio-video-handlers.ts` - Audio/video IPC handlers
- `fal-upload-handlers.ts` - FAL upload handlers
- `ffmpeg-handlers.ts` - FFmpeg IPC handlers
- `file-dialog-handlers.ts` - File dialog handlers
- `file-io-handlers.ts` - File I/O handlers
- `release-notes-handlers.ts` - Release notes handlers
- `shell-github-handlers.ts` - Shell and GitHub handlers
- `storage-handlers.ts` - Storage handlers
- `update-handlers.ts` - Update handlers

**`electron/ffmpeg/`** — FFmpeg utilities (8 files):
- `constants.ts`, `health.ts`, `index.ts`, `paths.ts`
- `probe.ts`, `progress.ts`, `types.ts`, `utils.ts`

**`electron/types/`** — Claude API type definitions (4 files):
- `claude-api.ts`, `claude-api-capabilities.ts`
- `claude-events-api.ts`, `claude-state-api.ts`

**`electron/preload-types/`** — Preload type definitions (3 files):
- `electron-api.ts`, `index.ts`, `supporting-types.ts`

**`electron/utility/`** — Utility process management (5 files):
- `utility-bridge.ts` - Utility process bridge
- `utility-http-server.ts` - Utility HTTP server
- `utility-ipc-types.ts` - Utility IPC type definitions
- `utility-process.ts` - Utility process management
- `utility-pty-manager.ts` - Utility PTY manager

**`electron/mcp/`** — MCP server (1 TS file + HTML apps):
- `qcut-mcp-server.ts` - QCut MCP server
- `apps/` - MCP app HTML interfaces (configure-media, export-settings, project-stats, wan-video)

**`electron/ai-pipeline-handler/`** — AI pipeline handler module (6 files):
- `index.ts`, `auto-import.ts`, `command-builder.ts`
- `environment.ts`, `pipeline-manager.ts`, `types.ts`

**`electron/screen-recording-handler/`** — Screen recording module (8 files):
- `index.ts`, `ipc.ts`, `session.ts`, `transcoder.ts`
- `file-ops.ts`, `logger.ts`, `path-utils.ts`, `types.ts`

**`electron/output/`** — Output data:
- `sample_video.json` - Sample video output data

**`electron/config/`** — Electron configuration:
- `default-keys.ts` - Default API key configuration

**Claude Integration (`electron/claude/`)** — organized into subdirectories:

*Root (2 files):*
- `index.ts` - Claude integration barrel export
- `claude-operation-log.ts` - Operation logging

*`claude/handlers/`* — IPC handler modules (31 files):
- `claude-media-handler.ts` - Media operations
- `claude-timeline-handler.ts` - Timeline operations
- `claude-timeline-operations.ts` - Timeline operation helpers
- `claude-timeline-markdown.ts` - Timeline markdown export
- `claude-project-handler.ts` - Project operations
- `claude-project-crud-handler.ts` - Project CRUD operations
- `claude-export-handler.ts` - Export operations (root file)
- `claude-export-handler/` - Export handler module (8 files):
  - `index.ts`, `export-engine.ts`, `ipc.ts`, `job-manager.ts`
  - `presets.ts`, `public-api.ts`, `types.ts`, `utils.ts`
- `claude-diagnostics-handler.ts` - Diagnostics
- `claude-events-handler.ts` - Event handling
- `claude-state-handler.ts` - State management
- `claude-analyze-handler.ts` - Content analysis
- `claude-auto-edit-handler.ts` - Auto-editing
- `claude-capability-handler.ts` - Capability reporting
- `claude-command-registry.ts` - Command registry
- `claude-correlation.ts` - Correlation tracking
- `claude-cuts-handler.ts` - Cut operations
- `claude-filler-handler.ts` - Filler content
- `claude-generate-handler.ts` - Content generation
- `claude-moyin-handler.ts` - Moyin workflow
- `claude-navigator-handler.ts` - Navigation
- `claude-personaplex-handler.ts` - PersonaPlex integration
- `claude-range-handler.ts` - Range operations
- `claude-scene-handler.ts` - Scene management
- `claude-screen-recording-handler.ts` - Screen recording
- `claude-screenshot-handler.ts` - Screenshot capture
- `claude-suggest-handler.ts` - Suggestions
- `claude-summary-handler.ts` - Summary generation
- `claude-transcribe-handler.ts` - Transcription
- `claude-transaction-handler.ts` - Transaction management
- `claude-ui-handler.ts` - UI interaction
- `claude-vision-handler.ts` - Vision analysis

*`claude/http/`* — HTTP server for Claude API (8 files):
- `claude-http-server.ts` - Claude HTTP API server
- `claude-http-shared-routes.ts` - Shared route definitions
- `claude-http-meta-routes.ts` - Meta/info routes
- `claude-http-state-routes.ts` - State management routes
- `claude-http-events-routes.ts` - Event routes
- `claude-http-generate-routes.ts` - Generation routes
- `claude-http-analysis-routes.ts` - Analysis routes
- `claude-http-transaction-routes.ts` - Transaction routes

*`claude/utils/`* — Shared Claude utilities (3 files):
- `helpers.ts` - Helper functions
- `http-router.ts` - HTTP routing utilities
- `logger.ts` - Logging utilities

**Native Pipeline (`electron/native-pipeline/`)** — AI content pipeline, organized into 7 subdirectories:

*Root (3 files):*
- `index.ts` - Pipeline barrel export
- `init.ts` - Pipeline initialization
- `manager.ts` - Pipeline manager

*`native-pipeline/cli/`* — CLI interface (12 root files + 2 subdirectories):
- Root: `cli.ts`, `interactive.ts`, `example-pipelines.ts`, `cli-runner.ts`
- `cli-handlers-admin.ts`, `cli-handlers-editor.ts`, `cli-handlers-media.ts`
- `cli-handlers-moyin.ts`, `cli-handlers-remotion.ts`
- `cli-output.ts`, `cli-output-formatters.ts`
- `vimax-cli-handlers.ts`
- `cli-runner/` - CLI runner (9 files): handlers for generate, grid, pipeline, transfer, upscale, etc.
- `vimax-cli-handlers/` - Vimax CLI handlers (6 files): character, model, pipeline, registry, script handlers

*`native-pipeline/editor/`* — Editor API integration (8 files):
- Bridge between pipeline and editor state
- `editor-api-client.ts`, `editor-api-types.ts`
- `editor-handlers-analysis.ts`, `editor-handlers-generate.ts`
- `editor-handlers-media.ts`, `editor-handlers-remotion.ts`
- `editor-handlers-timeline.ts`, `project-commands.ts`

*`native-pipeline/execution/`* — Pipeline execution engine (6 files):
- `chain-parser.ts`, `config-loader.ts`, `executor.ts`
- `parallel-executor.ts`, `step-executors.ts`, `validators.ts`

*`native-pipeline/infra/`* — Infrastructure utilities (8 files):
- `api-caller.ts`, `cost-calculator.ts`, `file-manager.ts`
- `key-manager.ts`, `platform-logger.ts`, `registry.ts`
- `stream-emitter.ts`, `xdg-paths.ts`

*`native-pipeline/output/`* — Output generation (4 files):
- `errors.ts`, `grid-generator.ts`, `output-utils.ts`, `srt-generator.ts`

*`native-pipeline/registry-data/`* — Model registry data (12 files):
- `index.ts`, `platform-models.ts`
- `avatar.ts`, `image-to-image.ts`, `image-to-video.ts`
- `image-understanding.ts`, `prompt-generation.ts`
- `speech-to-text.ts`, `text-to-image.ts`, `text-to-video.ts`
- `tts.ts`, `video-to-video.ts`

*`native-pipeline/vimax/`* — Vimax AI pipeline (1 root + 4 subdirectories):
- `index.ts` - Barrel export
- `adapters/` (5 files): `base-adapter.ts`, `image-adapter.ts`, `llm-adapter.ts`, `video-adapter.ts`, `index.ts`
- `agents/` (9 files): `base-agent.ts`, `camera-generator.ts`, `character-extractor.ts`, `character-portraits.ts`, `reference-selector.ts`, `schemas.ts`, `screenwriter.ts`, `storyboard-artist.ts`, `index.ts`
- `pipelines/` (4 files): `idea2video.ts`, `novel2movie.ts`, `script2video.ts`, `index.ts`
- `types/` (5 files): `camera.ts`, `character.ts`, `output.ts`, `shot.ts`, `index.ts`

#### Resources (`electron/resources/`)
- `ffmpeg/` - FFmpeg binaries per platform (darwin-arm64, darwin-x64, linux-x64, win32-x64)
- `bin/aicp/` - AICP binary per platform with manifest

## Architecture Updates (2026-03-11)

### Folder Reorganization (February 2026)

Five oversized flat directories were reorganized into logical subdirectories (target: 5-15 files each):

1. **`src/lib/`** (root files + 15 subdirectories): export/, ffmpeg/, ai-clients/, ai-models/, effects/, stickers/, claude-bridge/, media/, project/, debug/, filmstrip/, utils/, plus ai-video/, fal-ai/, export-cli/, effects-templates/, storage/, text2image-models/, remotion/, moyin/, captions/, gemini/, transcription/
2. **`electron/native-pipeline/`** (files -> 7 subdirectories): cli/, editor/, execution/, infra/, output/, registry-data/, vimax/
3. **`src/stores/`** (files -> 5 subdirectories): timeline/, media/, moyin/, editor/, ai/
4. **`electron/claude/`** (files -> 3 subdirectories): handlers/, http/, utils/
5. **`src/hooks/`** (files -> 5 subdirectories): timeline/, export/, keyboard/, media/, auth/

Re-export shims preserve backward compatibility for high-importer files (e.g., `stores/timeline-store.ts` -> `stores/timeline/timeline-store.ts`).

### Key Implementation Files:
The codebase contains several substantial files that form the core of the application:

- **Timeline Store** (59KB) - Comprehensive timeline state management
- **Export Engine** (46KB) - Main export implementation
- **FAL AI Client** (39KB) - AI service integration
- **FFmpeg Handler** (37KB) - Video processing backend
- **Text2Image Models** (32KB) - AI model definitions
- **Image Edit Client** (31KB) - AI image editing
- **FFmpeg Utils** (27KB) - FFmpeg WebAssembly utilities

**Architecture Highlights:**
- Modular AI video system with generators, core utilities, and validation
- Comprehensive effects system with keyframes and chaining
- Robust storage abstraction supporting multiple backends
- Extensive timeline management with modular operations
- Enhanced media panel with video editing capabilities
- 100% TypeScript Electron integration with 50+ IPC handlers
- Claude integration with 31 handler modules and 8 HTTP route files
- Native pipeline with Vimax AI content generation

## Code Organization Principles

### 1. **Separation of Concerns**
- **Components**: Pure UI presentation
- **Stores**: Business logic and state
- **Hooks**: Reusable stateful logic
- **Lib**: Core functionality

### 2. **Feature-Based Structure**
- Editor components grouped by functionality
- Related stores and hooks co-located conceptually
- Clear boundaries between timeline, media, and playback

### 3. **Type Safety**
- Comprehensive TypeScript coverage
- Dedicated types directory (23 root files + 24 electron API types)
- Interface-driven development

### 4. **Scalable Architecture**
- Modular component system
- Plugin-ready hook system
- Extensible storage backends

## Development Guidelines

### File Naming Conventions
- **Components**: `kebab-case.tsx`
- **Hooks**: `use-feature-name.ts`
- **Stores**: `feature-store.ts`
- **Types**: `feature.ts`
- **Utilities**: `feature-name.ts`

### Import Organization
1. React and external libraries
2. Internal components
3. Hooks and stores
4. Types
5. Utilities

### Code Style
- **Linting**: Biome with Ultracite configuration
- **Formatting**: Automatic via Biome
- **Type Checking**: Strict TypeScript mode

## Performance Considerations

### Bundle Optimization
- Code splitting by feature areas
- Dynamic imports for FFmpeg
- Tree shaking enabled
- Asset optimization

### Memory Management
- Proper cleanup of media resources
- Blob URL management via BlobManager
- Event listener cleanup
- WebAssembly memory handling
- Frame caching for playback

## Testing Strategy

**Framework**: Vitest ^4.0.0 with JSDOM environment
**Status**: 205 unit + 23 E2E test files

### Running Tests
```bash
# Run all tests
cd qcut/apps/web && bun run test

# Run tests with UI
bun run test:ui

# Run tests with coverage
bun run test:coverage

# Watch mode during development
bun run test:watch
```

### Test Categories
- **UI Components**: Button, Checkbox, Dialog, Toast, Tabs, Slider, etc.
- **Hooks**: Custom React hooks with comprehensive test coverage
- **Integration**: Store initialization, project creation workflows
- **Utilities**: Helper functions and utility modules

---

*This documentation should be updated when significant structural changes are made to the codebase.*
