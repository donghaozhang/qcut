# Step 3: Background Beautification

> Add wallpaper backgrounds, gradients, rounded corners, padding, and drop shadows for screen recording clips.

## Goal

Screen recordings can be presented with a styled background — similar to Screen Studio's "device frame" feature. The recording video is inset with padding, rounded corners, and a drop shadow, on top of a wallpaper/gradient/solid background.

## New Files

### 1. `apps/web/src/lib/screen-recording/wallpapers.ts`

Port of Recordly's wallpaper preset data. Pure data file.

```typescript
export interface BuiltInWallpaper {
  id: string;
  label: string;
  relativePath: string;  // relative to public/wallpapers/
  thumbnail?: string;     // smaller preview version
}

export const BUILT_IN_WALLPAPERS: BuiltInWallpaper[] = [
  { id: 'gradient-purple', label: 'Purple Gradient', relativePath: 'wallpapers/gradient-purple.jpg' },
  { id: 'gradient-blue', label: 'Blue Gradient', relativePath: 'wallpapers/gradient-blue.jpg' },
  // ... 20+ presets
];

export const GRADIENT_PRESETS: { id: string; label: string; colors: [string, string] }[] = [
  { id: 'sunset', label: 'Sunset', colors: ['#ff6b6b', '#ffa726'] },
  { id: 'ocean', label: 'Ocean', colors: ['#2196f3', '#00bcd4'] },
  // ...
];
```

### 2. `public/wallpapers/` (directory)

Copy wallpaper images from Recordly's `public/wallpapers/`. ~20 JPG files, ~2MB total.

### 3. `apps/web/src/components/editor/preview-panel/recording-background.tsx`

Renders the background behind the recording in the preview panel.

```typescript
interface RecordingBackgroundProps {
  background: BackgroundConfig;
  width: number;
  height: number;
  children: React.ReactNode; // The video element
}

export function RecordingBackground(props: RecordingBackgroundProps): JSX.Element
```

Renders:
- **Container**: full preview area with background fill
- **Background layer**: wallpaper image / CSS gradient / solid color
- **Video layer**: inset with `padding`, `borderRadius`, `boxShadow`

Implementation is pure CSS/React — no canvas needed for the background.

### 4. Types added to `apps/web/src/stores/screen-recording-store.ts`

```typescript
interface BackgroundConfig {
  type: 'none' | 'wallpaper' | 'gradient' | 'solid';
  wallpaperId?: string;
  gradientColors?: [string, string];
  gradientAngle?: number;  // degrees, default 135
  solidColor?: string;
  padding: number;          // px, default 40
  borderRadius: number;     // px, default 12
  shadow: boolean;          // drop shadow, default true
}

export const DEFAULT_BACKGROUND: BackgroundConfig = {
  type: 'none',
  padding: 40,
  borderRadius: 12,
  shadow: true,
};
```

## Modified Files

### 1. `apps/web/src/stores/screen-recording-store.ts`

Add background config to the enhancement store:

```typescript
interface ScreenRecordingEnhancementState {
  // ... previous fields ...

  // Step 3 additions
  background: BackgroundConfig;
  setBackground: (config: Partial<BackgroundConfig>) => void;
}
```

### 2. `apps/web/src/components/editor/preview-panel.tsx`

Wrap the video element with `<RecordingBackground>` when the active element is a screen recording clip with background enabled:

```tsx
{isScreenRecording && background.type !== 'none' ? (
  <RecordingBackground background={background} width={displaySize.width} height={displaySize.height}>
    <PreviewElementRenderer ... />
  </RecordingBackground>
) : (
  <PreviewElementRenderer ... />
)}
```

## Detection: Is This a Screen Recording Clip?

Need a way to identify timeline elements that are screen recordings (vs regular video imports). Options:

1. **Metadata flag**: When importing a screen recording into the timeline, set `element.metadata.isScreenRecording = true`
2. **File path check**: Check if the source path is under `~/Videos/QCut Recordings/`
3. **Sidecar check**: Check if a `.cursor.json` sidecar exists alongside the file

Recommended: Option 1 (metadata flag) — cleanest, set at import time.

## Export Considerations

Background compositing during export requires canvas-based rendering:
- Draw background fill/image on canvas
- Draw video frame inset with padding + rounded corner clip
- Apply drop shadow via canvas `shadowBlur`/`shadowColor`

This is handled in Step 5 (zoom/export compositing) to avoid duplicating canvas setup.
