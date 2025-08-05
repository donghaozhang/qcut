# QCut Source Code Structure Documentation

## Overview

This document provides a comprehensive overview of the QCut source code structure, including folder organization and line counts for all TypeScript/JavaScript source files.

**Generated:** 2025-01-27  
**Total Source Files:** 229 files  
**Main Source Directory:** `apps/web/src/`

## Project Architecture

QCut is a desktop video editor built with:
- **Frontend Framework:** Vite 7.0.6 + TanStack Router + React 19
- **Desktop Runtime:** Electron 37.2.5
- **Language:** TypeScript
- **State Management:** Zustand
- **Video Processing:** FFmpeg WebAssembly
- **Styling:** Tailwind CSS

## Source Code Structure

### Root Configuration Files
```
apps/web/
├── vite.config.ts                    # Vite configuration
├── tsconfig.json                     # TypeScript configuration  
├── tailwind.config.ts                # Tailwind CSS configuration
├── components.json                   # UI components configuration
└── package.json                      # Dependencies and scripts
```

### Main Source Directory: `apps/web/src/`

#### 📁 **Routes** (`src/routes/`)
Main application routing using TanStack Router:
- `src/routes/index.tsx` - Home page route
- `src/routes/editor.$project_id.tsx` - Main editor route
- `src/routes/projects/index.tsx` - Projects list route
- `src/routes/__root.tsx` - Root layout component

#### 📁 **Components** (`src/components/`)

##### UI Components (`src/components/ui/`)
Base UI components built on Radix UI primitives:
- `accordion.tsx` - Collapsible content areas
- `alert-dialog.tsx` - Modal confirmation dialogs
- `alert.tsx` - Notification messages
- `audio-player.tsx` - Audio playback controls
- `avatar.tsx` - User profile pictures
- `badge.tsx` - Status indicators
- `button.tsx` - Interactive buttons
- `calendar.tsx` - Date selection
- `card.tsx` - Content containers
- `carousel.tsx` - Image/content sliders
- `checkbox.tsx` - Toggle controls
- `command.tsx` - Command palette
- `context-menu.tsx` - Right-click menus
- `dialog.tsx` - Modal windows
- `dropdown-menu.tsx` - Action menus
- `form.tsx` - Form handling
- `input.tsx` - Text input fields
- `label.tsx` - Form labels
- `popover.tsx` - Floating content
- `progress.tsx` - Progress indicators
- `resizable.tsx` - Resizable panels
- `scroll-area.tsx` - Custom scrollbars
- `select.tsx` - Dropdown selection
- `separator.tsx` - Visual dividers
- `sheet.tsx` - Side panels
- `slider.tsx` - Range controls
- `switch.tsx` - Toggle switches
- `table.tsx` - Data tables
- `tabs.tsx` - Tab navigation
- `textarea.tsx` - Multi-line text
- `toast.tsx` - Notification system
- `tooltip.tsx` - Hover information
- `video-player.tsx` - Video playback

##### Editor Components (`src/components/editor/`)
Core video editor interface:

**Timeline System:**
- `timeline/timeline.tsx` - Main timeline container  
- `timeline/timeline-track.tsx` - Individual timeline tracks
- `timeline/timeline-element.tsx` - Media elements on timeline
- `timeline/timeline-playhead.tsx` - Current position indicator
- `timeline/timeline-toolbar.tsx` - Timeline controls

**Properties Panel:**
- `properties-panel/index.tsx` - Properties container
- `properties-panel/media-properties.tsx` - Media element properties
- `properties-panel/text-properties.tsx` - Text element properties
- `properties-panel/audio-properties.tsx` - Audio element properties

**Media Panel:**
- `media-panel/index.tsx` - Media library container
- `media-panel/views/media.tsx` - Media file browser
- `media-panel/views/text.tsx` - Text creation tools
- `media-panel/views/ai.tsx` - AI generation tools

**Other Editor Components:**
- `preview-panel.tsx` - Video preview window
- `selection-box.tsx` - Multi-selection tool
- `speed-control.tsx` - Playback speed controls

##### Application Components (`src/components/`)
- `header-base.tsx` - Application header
- `editor-provider.tsx` - Editor context provider
- `background-settings.tsx` - Project settings
- `delete-project-dialog.tsx` - Project deletion
- `rename-project-dialog.tsx` - Project renaming
- `keyboard-shortcuts-help.tsx` - Help system
- `icons.tsx` - Icon definitions

#### 📁 **Stores** (`src/stores/`)
Zustand state management:
- `timeline-store.ts` - Timeline operations (1,553 lines)
- `project-store.ts` - Project persistence (484 lines) 
- `media-store.ts` - Media file management (467 lines)
- `text2image-store.ts` - AI image generation (380 lines)
- `adjustment-store.ts` - Image adjustments (301 lines)
- `keybindings-store.ts` - Keyboard shortcuts (260 lines)
- `export-store.ts` - Video export functionality (185 lines)
- `playback-store.ts` - Video playback state (156 lines)
- `panel-store.ts` - UI panel management (102 lines)
- `editor-store.ts` - Main editor state (102 lines)
- `media-store-types.ts` - Media type definitions (69 lines)
- `media-store-loader.ts` - Media loading utilities (34 lines)

#### 📁 **Library** (`src/lib/`)
Core functionality and utilities:

**Export Engines:**
- `export-engine.ts` - Main export engine (996 lines)
- `ai-video-client.ts` - AI video processing (908 lines)
- `export-engine-optimized.ts` - Optimized export (575 lines)
- `fal-ai-client.ts` - FAL AI integration (482 lines)
- `export-engine-factory.ts` - Export factory (477 lines)
- `export-engine-cli.ts` - CLI export engine (476 lines)
- `export-engine-ffmpeg.ts` - FFmpeg export (172 lines)

**Video Processing:**
- `ffmpeg-utils.ts` - FFmpeg WebAssembly integration (496 lines)
- `ffmpeg-loader.ts` - Dynamic FFmpeg loading (85 lines)

**Storage System:**
- `storage/storage-service.ts` - Storage abstraction (339 lines)
- `storage/indexeddb-adapter.ts` - IndexedDB implementation (103 lines)
- `storage/localstorage-adapter.ts` - LocalStorage fallback (103 lines)
- `storage/opfs-adapter.ts` - File system adapter (73 lines)
- `storage/electron-adapter.ts` - Electron storage (68 lines)
- `storage/types.ts` - Storage type definitions (50 lines)

**Utilities:**
- `time.ts` - Time formatting (118 lines)
- `ai-video-output.ts` - AI output handling (113 lines)
- `utils.ts` - General utilities (76 lines)
- `blog-query.ts` - Blog functionality (64 lines)
- `debug-logger.ts` - Debug utilities (44 lines)

#### 📁 **Hooks** (`src/hooks/`)
Custom React hooks:
- `use-timeline-zoom.ts` - Timeline zoom controls (~150 lines)
- `use-timeline-snapping.ts` - Element snapping (~200 lines)
- `use-selection-box.ts` - Multi-selection logic (~250 lines)
- `use-playback-controls.ts` - Video controls (~180 lines)
- `use-keyboard-shortcuts-help.ts` - Help system (~100 lines)
- `use-keybindings.ts` - Keyboard handling (~200 lines)
- `use-editor-actions.ts` - Editor actions (~300 lines)
- `use-drag-drop.ts` - Drag and drop (~150 lines)
- `use-mobile.tsx` - Mobile detection (~50 lines)

#### 📁 **Types** (`src/types/`)
TypeScript type definitions:
- `timeline.ts` - Timeline data structures (~200 lines)
- `editor.ts` - Editor interfaces (~150 lines)
- `project.ts` - Project data types (~100 lines)
- `playback.ts` - Playback state types (~50 lines)
- `keybinding.ts` - Keyboard shortcut types (~80 lines)

#### 📁 **Constants** (`src/constants/`)
Application constants:
- `timeline-constants.ts` - Timeline configuration (~50 lines)
- `font-constants.ts` - Font definitions (~100 lines)
- `actions.ts` - Action definitions (~80 lines)
- `site.ts` - Site metadata (~30 lines)

#### 📁 **Data** (`src/data/`)
Static data:
- `colors.ts` - Color palette definitions (~50 lines)

### Electron Integration

#### Main Process (`electron/`)
- `main.js` - Electron main process (~400 lines)
- `preload.js` - Preload script for IPC (~50 lines)
- `ffmpeg-handler.js` - FFmpeg CLI integration (~200 lines)

## File Size Analysis

### Large Files (>300 lines)
1. `src/stores/timeline-store.ts` - 1,553 lines - Timeline state management
2. `src/lib/export-engine.ts` - 996 lines - Main export engine
3. `src/lib/ai-video-client.ts` - 908 lines - AI video processing
4. `src/lib/export-engine-optimized.ts` - 575 lines - Optimized export
5. `src/lib/ffmpeg-utils.ts` - 496 lines - Video processing
6. `src/stores/project-store.ts` - 484 lines - Project persistence
7. `src/lib/fal-ai-client.ts` - 482 lines - FAL AI integration
8. `src/lib/export-engine-factory.ts` - 477 lines - Export factory
9. `src/lib/export-engine-cli.ts` - 476 lines - CLI export engine
10. `src/stores/media-store.ts` - 467 lines - Media file handling
11. `electron/main.js` - 405 lines - Electron main process
12. `src/stores/text2image-store.ts` - 380 lines - AI image generation
13. `src/lib/storage/storage-service.ts` - 339 lines - Storage abstraction
14. `src/stores/adjustment-store.ts` - 301 lines - Image adjustments

### Medium Files (100-299 lines)
- Timeline components and hooks
- UI components with complex logic
- Type definitions
- Storage adapters

### Small Files (<100 lines)
- Simple UI components
- Utility functions
- Constants and configuration
- Type-only files

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
- Dedicated types directory
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
- Blob URL management
- Event listener cleanup
- WebAssembly memory handling

## Testing Strategy

⚠️ **Note**: No testing framework currently configured - this is a known gap that should be addressed.

## Future Improvements

1. **Add comprehensive test suite**
2. **Implement performance monitoring**
3. **Enhanced error boundaries**
4. **Better code documentation**
5. **API documentation generation**

---

*This documentation is automatically maintained and should be updated when significant structural changes are made to the codebase.*