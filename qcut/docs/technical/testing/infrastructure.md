# QCut Testing Infrastructure Guide

**Document Version**: 5.0
**Last Updated**: 2056-03-11
**Status**: 205 unit/integration test files | 23 E2E test files
**Test Suite Health**: Tests passing consistently

## Current Implementation Status

### What's Working

The testing infrastructure is fully operational with:
- **Test Runner**: Vitest ^4.0.0 with UI visualization
- **React Testing**: @testing-library/react ^16.3.2 with user-event
- **Environment**: JSDOM ^28.1.0 with comprehensive browser API mocks
- **Coverage Reporting**: @vitest/coverage-v8 ^4.0.0
- **Mock Infrastructure**: Complete mocks for Electron, FFmpeg, storage, router
- **Test Utilities**: Store helpers, render wrappers, cleanup utilities
- **Memory Management**: Blob manager cleanup and performance monitoring
- **Browser API Support**: MutationObserver, ResizeObserver, IntersectionObserver mocks

### Test File Inventory (205 test files)

#### UI Component Tests (9 files)
Located in `src/components/ui/`:
- button.test.tsx
- checkbox.test.tsx
- dialog.test.tsx
- dropdown-menu.test.tsx
- input.test.tsx
- progress.test.tsx
- slider.test.tsx
- tabs.test.tsx
- toast.test.tsx

#### Editor Component Tests (36 files)
Located in `src/components/editor/**/`:
- panel-resize-drag.test.tsx
- markdown-overlay.test.tsx
- persistent-terminal.test.tsx, store.test.ts (media-panel)
- ai-constants.test.ts, angles-config.test.ts, extend-video.test.ts (AI views)
- ai-model-settings.test.tsx, phase3-components.test.ts (AI components)
- kling-v3-models.test.ts, model-provider-logos.test.ts (AI constants)
- use-ai-generation-contract.test.ts, use-ai-generation-helpers.test.ts, use-ai-mock-generation.test.ts, use-ai-panel-effects.test.ts, use-ai-polling.test.ts, use-cost-calculation.test.ts, use-reve-edit-state.test.ts, use-veo31-state.test.ts (AI hooks)
- model-handlers-routing.test.ts, handler-exports.test.ts (AI generation handlers)
- camera-selector.test.tsx
- moyin-round11.test.tsx, moyin-round21.test.tsx, moyin-round22.test.tsx, moyin-round25.test.tsx, moyin-view.test.tsx
- component-browser.test.tsx (Remotion)
- markdown-editor-panel.test.tsx
- ResizeHandles.test.ts, StickerElement.test.ts (stickers overlay)
- remotion-element-analysis.test.tsx, remotion-sequences.test.tsx, timeline-drag-handlers.test.ts, timeline-toolbar.test.tsx, track-icon.test.tsx (timeline)

#### Export Component Tests (1 file)
Located in `src/components/export/`:
- remotion-export-progress.test.tsx

#### Hook Tests (9 files)
Located in `src/hooks/__tests__/`:
- use-ai-pipeline.test.ts
- use-aspect-ratio.test.ts, use-aspect-ratio-advanced.test.ts
- use-debounce.test.ts, use-debounce-callback.test.ts
- use-mobile.test.tsx
- use-project-folder.test.ts
- use-toast.test.ts, use-toast-advanced.test.ts

#### Store Tests (17 files)
Located in `src/stores/__tests__/`:
- auto-organize.test.ts
- camera-selector-store.test.ts
- export-store.test.ts
- folder-persistence.test.ts, folder-store.test.ts
- gemini-terminal-store.test.ts
- media-store.test.ts, media-store-helpers.test.ts
- moyin-calibration.test.ts, moyin-store-reorder.test.ts, moyin-store-round9.test.ts
- pty-terminal-store.test.ts
- remotion-store-analysis.test.ts
- skills-store.test.ts
- timeline-store.test.ts, timeline-store-operations.test.ts
- word-timeline-store.test.ts

#### Library Tests - Core (32 files)
Located in `src/lib/__tests__/`:
- ai-video-client.test.ts, ai-video-client-additional.test.ts
- audio-mixer.remotion.test.ts
- bulk-import.test.ts
- camera-prompt-builder.test.ts
- claude-bridge-lifecycle.test.ts, claude-timeline-bridge.test.ts
- export-analysis.test.ts, export-engine-cli-audio.test.ts, export-engine-debug.test.ts, export-engine-recorder.test.ts, export-engine-utils.test.ts
- fal-ai-client-split.test.ts
- image-edit-models-info.test.ts, image-edit-multi-image.test.ts, image-edit-polling.test.ts, image-edit-utils.test.ts
- image-validation.test.ts
- media-import.test.ts
- nano-banana-2-params.test.ts
- project-folder-sync.test.ts, project-skills-sync.test.ts
- pty-session-cleanup.test.ts
- release-notes.test.ts
- seeddream45.test.ts
- sticker-export-e2e.test.ts, sticker-export-helper.test.ts, sticker-ffmpeg-filter.test.ts, sticker-sources.test.ts, sticker-timing-consistency.test.ts
- vidu-q3.test.ts
- wan26-ref2video.test.ts

#### Library Tests - Nested Modules (32 files)
Located in `src/lib/**/`:
- export-cli/sources: audio-detection.test.ts, audio-sources.test.ts
- export: remotion-export-wiring.test.ts
- filmstrip: filmstrip-cache.test.ts, filmstrip-extractor.test.ts
- moyin: character-bible.test.ts, presets.test.ts, script-parser.test.ts, storyboard.test.ts, utils.test.ts
- remotion: component-loader-analysis.test.ts, component-loader.test.ts, component-validator.test.ts, compositor.test.ts, duration-calculator.test.ts, dynamic-loader.test.ts, export-engine-remotion.test.ts, keyframe-converter.test.ts, player-wrapper-trim.test.ts, pre-renderer.test.ts, schema-parser.test.ts, sequence-analysis-service.test.ts, sequence-parser.test.ts, sync-manager.test.ts, types.test.ts
- remotion/built-in: templates.test.tsx, fade-in-text.test.tsx, text-components.test.tsx, typewriter.test.tsx, transitions.test.tsx
- text2image-models: text2image-models.test.ts
- transcription: segment-calculator.test.ts

#### Constants Tests (2 files)
Located in `src/constants/__tests__/`:
- timeline-constants.test.ts
- timeline-scroll-limit.test.ts

#### Type Tests (2 files)
Located in `src/types/__tests__/`:
- cli-provider.test.ts
- timeline.test.ts

#### Utility Tests (11 files)
Located in `src/test/lib-tests/`:
- asset-path.test.ts - Electron vs web path resolution
- error-handler.test.ts - error capture and reporting
- ffmpeg-health-check.test.ts - FFmpeg health check logic
- ffmpeg-health-notification.test.ts - FFmpeg health notifications
- ffmpeg-path-resolution.test.ts - FFmpeg path resolution
- image-utils.test.ts - dimension calculations
- memory-utils.test.ts - file size formatting
- time.test.ts - formatTimeCode, parseTimeCode
- timeline.test.ts - overlap detection
- utils-platform.test.ts - OS detection and key mapping
- utils.test.ts - UUID generation, generateFileBasedId

#### Integration Tests (12 files)
Located in `src/test/integration/`:
- debug-effects-store.test.ts - effects store debugging
- export-settings.test.ts - configuration validation
- keybinding.test.ts - shortcut handling
- media-add.test.ts - file upload process
- new-video-models.test.ts - video model integration
- playback-state.test.ts - play/pause/seek
- project-create.test.ts - new project workflow
- run-all.test.ts - integration suite runner
- sticker-add.test.ts - sticker management
- storage-mock.test.ts - persistence layer
- stores-init.test.ts - all stores setup
- timeline-element.test.ts - element manipulation

#### Migration Tests (4 files)
Located in `src/test/migration/`:
- router-verification.test.ts - TanStack Router migration
- navigation.test.tsx - routing functionality
- post-cleanup.test.tsx - migration cleanup
- sounds-api.test.ts - audio integration

#### Root-level Test Files (3 files)
Located in `src/test/`:
- smoke.test.ts - basic smoke tests
- ffmpeg-filter-chain.test.ts - FFmpeg filter chain logic
- upscale-models.test.ts - upscale model definitions

### How to Run Tests

**CRITICAL**: Do NOT use `bun test` directly - it bypasses Vitest configuration!

```bash
# CORRECT ways to run tests:
cd apps/web

# Run all tests with Vitest
npx vitest run

# Run tests with UI (recommended for development)
npx vitest --ui

# Run tests with coverage report
npx vitest run --coverage

# Run tests in watch mode
npx vitest --watch

# Run specific test file
npx vitest run button.test.tsx

# Using configured npm scripts (also works):
bun run test       # Calls vitest internally
bun run test:ui    # Calls vitest --ui
bun run test:coverage
```

### Common Mistake
```bash
# WRONG - This will fail with "document is not defined"
bun test

# WHY IT FAILS:
# - Bun's native test runner doesn't use vitest.config.ts
# - No JSDOM environment setup
# - Missing browser API mocks
# - Different module resolution
```

### Test File Organization

```
qcut/apps/web/src/
├── components/
│   ├── editor/
│   │   ├── __tests__/              # Editor-level tests (1 file)
│   │   ├── canvas/__tests__/       # Canvas tests (1 file)
│   │   ├── media-panel/            # Media panel tests (21 files across subdirs)
│   │   ├── panels/__tests__/       # Panel tests (1 file)
│   │   ├── stickers-overlay/__tests__/ # Sticker tests (2 files)
│   │   └── timeline/__tests__/     # Timeline tests (5 files)
│   ├── export/__tests__/           # Export component tests (1 file)
│   └── ui/                         # UI component tests (9 files)
├── constants/__tests__/            # Constants tests (2 files)
├── hooks/__tests__/                # Hook tests (9 files)
├── lib/
│   ├── __tests__/                  # Core lib tests (32 files)
│   ├── export-cli/sources/__tests__/  # CLI export tests (2 files)
│   ├── export/__tests__/           # Export tests (1 file)
│   ├── filmstrip/__tests__/        # Filmstrip tests (2 files)
│   ├── moyin/**/__tests__/         # Moyin tests (5 files)
│   ├── remotion/__tests__/         # Remotion tests (15 files)
│   ├── remotion/built-in/**/__tests__/ # Remotion built-in tests (5 files)
│   ├── text2image-models/__tests__/   # Text2Image tests (1 file)
│   └── transcription/__tests__/    # Transcription tests (1 file)
├── stores/__tests__/               # Store tests (17 files)
├── types/__tests__/                # Type tests (2 files)
└── test/
    ├── e2e/                        # E2E test suites (22 files)
    │   ├── fixtures/               # E2E test data
    │   ├── helpers/                # E2E helper utilities
    │   ├── screenshots/            # E2E screenshot captures
    │   └── utils/                  # E2E utilities
    ├── fixtures/                   # Test data and mock objects
    ├── helpers/                    # Test helper utilities
    ├── integration/                # Integration test suites (12 files)
    ├── lib-tests/                  # Utility/library tests (11 files)
    ├── migration/                  # Migration tests (4 files)
    ├── mocks/                      # External service mocks
    ├── utils/                      # Test utilities and helpers
    ├── setup.ts                    # Global test configuration
    ├── smoke.test.ts               # Smoke tests
    ├── ffmpeg-filter-chain.test.ts # FFmpeg filter chain tests
    └── upscale-models.test.ts      # Upscale model tests
```

## Technology Stack

### Core Testing Stack (Installed)
- **Vitest ^4.0.0**: Vite-native test runner
- **@vitest/ui ^4.0.0**: Test UI visualization
- **@vitest/coverage-v8 ^4.0.0**: Code coverage reporting
- **@testing-library/react ^16.3.2**: Component testing
- **@testing-library/jest-dom ^6.9.1**: DOM assertion matchers
- **@testing-library/user-event ^14.6.1**: User interaction simulation
- **JSDOM ^28.1.0**: DOM environment with full browser API support
- **@playwright/test ^1.58.2**: E2E testing (Chromium for Electron)

### QCut Architecture Context
- **Hybrid Stack**: Vite + TanStack Router + Electron
- **State Management**: Zustand stores (media, timeline, project, playback, export, and more)
- **Video Processing**: FFmpeg WebAssembly
- **Storage**: Multi-tier (Electron IPC -> IndexedDB -> localStorage)
- **UI Components**: Radix UI + Tailwind CSS

## E2E Tests (23 files)

Located in `src/test/e2e/`:
- ai-enhancement-export-integration.e2e.ts
- audio-video-simultaneous-export.e2e.ts
- auto-save-export-file-management.e2e.ts
- debug-projectid.e2e.ts
- editor-navigation.e2e.ts
- file-operations-storage-management.e2e.ts
- multi-media-management-part1.e2e.ts
- multi-media-management-part2.e2e.ts
- project-folder-sync.e2e.ts
- project-workflow-part1.e2e.ts
- project-workflow-part2.e2e.ts
- project-workflow-part3.e2e.ts
- remotion-export-pipeline.e2e.ts
- remotion-folder-import.e2e.ts
- remotion-panel-stability.e2e.ts
- screen-recording-repro.e2e.ts
- simple-navigation.e2e.ts
- sticker-overlay-export.e2e.ts
- sticker-overlay-testing.e2e.ts
- terminal-paste.e2e.ts
- text-overlay-testing.e2e.ts
- timeline-duration-limit.e2e.ts
- visual-regression.e2e.ts

See `docs/technical/testing/e2e.md` for complete E2E implementation details, test patterns, and execution instructions.

## Priority Testing Areas

### 1. Critical Business Logic
- Media processing workflows
- Timeline operations
- Export functionality
- Project persistence

### 2. User-Facing Components
- Timeline editor
- Media browser
- Preview canvas
- Export dialog

### 3. State Management
- Store actions and reducers
- Store synchronization
- Error state handling

### 4. Memory Management
- Blob URL lifecycle
- FFmpeg memory usage
- Large file handling
- Resource cleanup

## Coverage Goals

### Target Metrics
- **Statements**: 80%+
- **Branches**: 75%+
- **Functions**: 85%+
- **Lines**: 80%+

### Current Coverage
Run `bun test:coverage` to see current metrics.

## Store Testing Strategy

### Tested Stores (17 files)
1. **Media Store**: File management, helpers
2. **Timeline Store**: Track management, operations
3. **Export Store**: Settings validation
4. **Folder Store**: Folder management, persistence
5. **Camera Selector Store**: Camera selection
6. **Gemini Terminal Store**: Terminal integration
7. **Moyin Stores**: Calibration, reorder, round9
8. **PTY Terminal Store**: Terminal state
9. **Remotion Store**: Analysis
10. **Skills Store**: Skills management
11. **Word Timeline Store**: Word-level timeline
12. **Auto-organize**: Automatic organization

### Testing Approach
- Isolate each test with store resets
- Use realistic fixtures
- Test complete workflows
- Verify error handling
- Monitor performance

## Memory Management Testing

### Critical Areas
- **Blob URL Management**: Automatic cleanup between tests
- **FFmpeg WebAssembly**: Memory pressure simulation
- **Large Files**: Handling and cleanup
- **Performance Monitoring**: Memory leak detection

## Known Issues & Solutions

### Test Runner Compatibility

**Issue**: Using `bun test` directly fails with "document is not defined"

**Root Cause**:
- Bun's native test runner doesn't read `vitest.config.ts`
- No JSDOM environment setup
- Missing browser API polyfills

**Solution**: Always use `npx vitest run` or configured npm scripts

**Fixed Issues**:
- MutationObserver not defined (Radix UI components)
- ResizeObserver missing (responsive components)
- getComputedStyle polyfills
- All browser API mocks working

## Quick Reference

### Writing a New Test

```typescript
// Example component test
import { render, screen } from '@testing-library/react';
import { StoreWrapper } from '@/test/utils/store-wrapper';

describe('MyComponent', () => {
  it('should render correctly', () => {
    render(
      <StoreWrapper>
        <MyComponent />
      </StoreWrapper>
    );

    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });
});
```

### Using Store Mocks

```typescript
import { resetAllStores } from '@/test/utils/store-helpers';

beforeEach(() => {
  resetAllStores(); // Clean slate for each test
});
```

### Common Test Patterns

```typescript
// Async operations
import { waitFor } from '@testing-library/react';

await waitFor(() => {
  expect(screen.getByText('Loaded')).toBeInTheDocument();
});

// User interactions
import userEvent from '@testing-library/user-event';

const user = userEvent.setup();
await user.click(screen.getByRole('button'));
```

## CI/CD Integration (Planned)

### Automated Pipeline Goals
1. Pre-commit hooks for linting
2. PR validation with full test suite (unit + integration)
3. Coverage reporting and tracking
4. Performance regression detection
5. E2E testing integration (see `docs/technical/e2e-testing-guide.md` for CI/CD patterns)

## Risk Mitigation

### Zero-Risk Implementation
- All tests are new files only
- No production code changes required
- Tests can be deleted to rollback
- Optional execution during development

### Quality Assurance
- Code review for all tests
- Clear documentation
- Regular maintenance
- Performance monitoring

## Maintenance & Enhancement

### Current Maintenance Priorities
1. **E2E Test Maintenance** (High Priority)
   - 23 E2E test files
   - See `docs/technical/testing/e2e.md` for implementation details

2. **Coverage Expansion** (Medium Priority)
   - Editor component testing (timeline, preview controls)
   - Complex workflow integration tests
   - Performance benchmarking tests

### Future Enhancements
1. **Advanced Testing Features**
   - Visual regression testing integration
   - Performance monitoring and alerting
   - Cross-platform compatibility validation

2. **CI/CD Optimization**
   - Parallel test execution strategies
   - Intelligent test selection based on code changes
   - Performance regression detection

### For Contributors
1. Check existing tests before writing new ones
2. Follow established patterns in test/utils
3. Use fixtures for consistent test data
4. Clean up resources in afterEach blocks
5. Focus on editor components for maximum impact

## Architecture Reference

### Test Infrastructure Components

#### Core Test Utilities (`src/test/utils/`)
- **Store Wrapper** (`store-wrapper.tsx`): React component wrapper with providers
- **Store Helpers** (`store-helpers.ts`): Individual and combined store reset functionality
- **Render with Providers** (`render-with-providers.tsx`): Render helper with context
- **Async Helpers** (`async-helpers.ts`): Async test utilities
- **Cleanup Helpers** (`cleanup-helpers.ts`): Resource cleanup
- **Context Menu** (`context-menu.ts`): Context menu test helpers
- **Drag & Drop** (`drag-drop.ts`): Drag/drop simulation
- **Export Helpers** (`export-helpers.ts`): Export test utilities
- **Fire Events** (`fire-events.ts`): Custom event firing
- **Keyboard Events/Shortcuts** (`keyboard-events.ts`, `keyboard-shortcuts.ts`): Keyboard simulation
- **Media Upload** (`media-upload.ts`): Media upload simulation
- **Memory Check** (`memory-check.ts`): Memory leak detection
- **Store Compare/Snapshot** (`store-compare.ts`, `store-snapshot.ts`): Store state comparison
- **Timeline Helpers** (`timeline-helpers.ts`): Timeline test utilities
- **Wait for Element** (`wait-for-element.ts`): Element visibility waiting

#### Test Helpers (`src/test/helpers/`)
- reset-captions-store.ts
- reset-export-store.ts
- reset-media-store.ts
- reset-playback-store.ts
- reset-timeline-store.ts

#### Mock Services (`src/test/mocks/`)
- browser-mocks.ts - Browser API mocks
- electron.ts - Electron IPC mocks
- ffmpeg.ts - FFmpeg WebAssembly mocks
- indexeddb.ts - IndexedDB mocks
- performance.ts - Performance API mocks
- radix-focus-scope.ts, radix-presence.ts, radix-ui.ts - Radix UI mocks
- router.ts - TanStack Router mocks
- storage.ts - Storage API mocks
- toast.ts - Toast notification mocks
- wasm.ts - WebAssembly mocks

#### Test Fixtures (`src/test/fixtures/`)
- constants.ts, export-settings.ts, factory.ts, file-factory.ts
- media-items.ts, project-data.ts, sticker-data.ts, timeline-data.ts

#### Browser API Polyfills (`src/test/setup.ts`)
- **MutationObserver**: DOM change detection for Radix UI components
- **ResizeObserver**: Element resize detection for responsive components
- **IntersectionObserver**: Visibility detection for performance optimization
- **getComputedStyle**: CSS property access for style-dependent tests

### Testing Best Practices

#### Component Testing Patterns
```typescript
// Standard component test structure
import { render, screen } from '@testing-library/react';
import { StoreWrapper } from '@/test/utils/store-wrapper';

describe('ComponentName', () => {
  beforeEach(() => {
    resetAllStores(); // Clean state for each test
  });

  it('should render correctly', () => {
    render(
      <StoreWrapper>
        <ComponentName />
      </StoreWrapper>
    );

    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});
```

#### Store Testing Patterns
```typescript
// Store testing with isolation
import { useMediaStore } from '@/stores/media-store';
import { resetAllStores } from '@/test/utils/store-helpers';

describe('MediaStore', () => {
  beforeEach(() => {
    resetAllStores();
  });

  it('should add media files', () => {
    const store = useMediaStore.getState();
    store.addMediaFile(mockMediaFile);

    expect(store.mediaFiles).toHaveLength(1);
  });
});
```

---

**For questions or issues**: Create an issue in the repository or consult the team lead.
