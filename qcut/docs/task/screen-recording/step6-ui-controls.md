# Step 6: UI Controls Panel

> Settings panel for cursor style, background, and zoom region configuration.

## Goal

Add a panel in the editor for configuring screen recording enhancements when a screen recording clip is selected. Controls for cursor appearance, background style, and zoom regions.

## New Files

### 1. `apps/web/src/components/editor/screen-recording-panel.tsx`

Main panel component, shown in the right sidebar when a screen recording clip is selected.

```typescript
export function ScreenRecordingPanel(): JSX.Element
```

**Sections:**

#### Cursor Settings
- **Style**: Toggle group — Dot / macOS Arrow / macOS Pointer / Hidden
- **Size**: Slider (12–60px, default 28)
- **Color**: Color picker (default white)
- **Opacity**: Slider (0–1, default 0.95)
- **Smoothing**: Slider (0–2, default 0.18) with labels "Instant / Natural / Smooth"
- **Click animation**: Toggle on/off + bounce multiplier slider

#### Background Settings
- **Type**: Toggle group — None / Wallpaper / Gradient / Solid
- **Wallpaper picker**: Grid of built-in wallpaper thumbnails (when type=wallpaper)
- **Gradient**: Two color pickers + angle slider (when type=gradient)
- **Solid color**: Single color picker (when type=solid)
- **Padding**: Slider (0–100px, default 40)
- **Corner radius**: Slider (0–32px, default 12)
- **Shadow**: Toggle on/off

#### Zoom Settings
- **Auto-generate**: Button — runs `analyzeForZoomSuggestions()` on cursor telemetry
- **Zoom regions list**: Scrollable list of current zoom regions with:
  - Time range (editable)
  - Zoom depth dropdown (1.5x / 2x / 3x)
  - Delete button
- **Add manual**: Button — adds a zoom region at current playback time
- **Clear all**: Button — removes all zoom regions

**Pattern:** Follow existing panel components in `apps/web/src/components/editor/` — similar to how media panel properties work (see `docs/technical/media-panel-reference.md`).

### 2. `apps/web/src/components/editor/screen-recording-panel/cursor-settings.tsx`

Extracted cursor settings section for the panel. Keeps main panel file under 800 lines.

### 3. `apps/web/src/components/editor/screen-recording-panel/background-settings.tsx`

Extracted background settings section.

## Modified Files

### 1. `apps/web/src/components/editor/preview-panel.tsx` (or relevant sidebar component)

Add the screen recording panel to the editor sidebar/properties area:

```tsx
// When selected element is a screen recording:
{selectedElement?.metadata?.isScreenRecording && (
  <ScreenRecordingPanel />
)}
```

### 2. `apps/web/src/stores/screen-recording-store.ts`

No new state needed — the panel reads/writes the store fields defined in Steps 1–4. But add a convenience selector:

```typescript
// Selector to check if any enhancements are active
export const hasActiveEnhancements = (state: ScreenRecordingEnhancementState): boolean =>
  state.background.type !== 'none' ||
  state.showCursorOverlay ||
  state.zoomRegions.length > 0;
```

## UI Components Used

All from existing Radix UI / QCut component library:
- `Slider` — for size, opacity, smoothing, padding, radius
- `ToggleGroup` / `ToggleGroupItem` — for cursor style, background type
- `Button` — for actions (auto-generate, add, clear)
- `Switch` — for toggles (shadow, click animation)
- Color pickers — use existing color input pattern from the editor

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + Shift + C` | Toggle cursor overlay visibility |
| `Ctrl/Cmd + Shift + Z` | Auto-generate zoom regions |

Register in the existing keyboard shortcut system.
