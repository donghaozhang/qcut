# Stickers Overlay Implementation Guide

## Overview
This document outlines the implementation of stickers as overlay elements in the QCut video editor, separate from the timeline complexity, with full support for positioning, resizing, persistence, and export functionality.

## Core Requirements

### 1. Separate from Timeline Implementation
- Create a new overlay system independent of the existing timeline
- Avoid modifying the complex timeline files
- Use a dedicated layer system for stickers

### 2. Interactive Overlay Features
- Position adjustment via drag and drop
- Resize handles for scaling
- Rotation support
- Z-index management for multiple stickers

### 3. Preserve Existing Features
- No breaking changes to current functionality
- Maintain backward compatibility
- Keep timeline, media panel, and export systems intact

### 4. Persistent Storage
- Save sticker positions and properties to disk
- Restore sticker state on project reload
- Use IndexedDB/OPFS for storing sticker data

### 5. Transparency Support
- Maintain alpha channel for all sticker formats
- Support transparent SVG, PNG, WebP
- Preserve transparency in preview and export

### 6. Export Integration
- Include stickers in video export
- Render stickers at correct positions and sizes
- Support all export formats

### 7. Custom Sticker Upload
- Support SVG files with transparency
- Support PNG/WebP with alpha channel
- Support animated stickers (GIF/WebM)
- Video stickers with chroma key support

## Implementation Architecture

### File Structure
```
src/
├── components/
│   └── editor/
│       ├── stickers-overlay/
│       │   ├── StickerCanvas.tsx       # Main overlay canvas
│       │   ├── StickerElement.tsx      # Individual sticker component
│       │   ├── StickerControls.tsx     # Resize/rotate handles
│       │   ├── StickerUploader.tsx     # Custom sticker upload
│       │   └── hooks/
│       │       ├── useStickerDrag.ts
│       │       ├── useStickerResize.ts
│       │       └── useStickerRotate.ts
│       └── preview-panel.tsx           # Modified to include overlay
├── stores/
│   └── stickers-overlay-store.ts       # New store for overlay stickers
├── lib/
│   └── stickers/
│       ├── sticker-renderer.ts         # Rendering logic
│       ├── sticker-exporter.ts         # Export integration
│       └── sticker-persistence.ts      # Storage handling
└── types/
    └── sticker-overlay.ts              # Type definitions
```

## Detailed Implementation

### 1. Sticker Overlay Store (`stickers-overlay-store.ts`)

```typescript
interface OverlaySticker {
  id: string;
  type: 'svg' | 'image' | 'video';
  url: string;           // Data URL for Electron compatibility
  file?: File;           // Original file reference
  position: {
    x: number;           // Percentage of canvas width
    y: number;           // Percentage of canvas height
  };
  size: {
    width: number;       // Percentage of canvas width
    height: number;      // Percentage of canvas height
  };
  rotation: number;      // Degrees
  opacity: number;       // 0-1
  zIndex: number;        // Layer order
  timestamp: number;     // When to show/hide (optional)
  duration?: number;     // How long to display (optional)
  effects?: {
    shadow?: boolean;
    glow?: boolean;
    blur?: number;
  };
}

interface StickersOverlayStore {
  stickers: Map<string, OverlaySticker>;
  selectedStickerId: string | null;
  isDragging: boolean;
  isResizing: boolean;
  
  // Actions
  addSticker: (sticker: Partial<OverlaySticker>) => string;
  removeSticker: (id: string) => void;
  updateSticker: (id: string, updates: Partial<OverlaySticker>) => void;
  selectSticker: (id: string | null) => void;
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
  
  // Persistence
  saveToStorage: (projectId: string) => Promise<void>;
  loadFromStorage: (projectId: string) => Promise<void>;
  
  // Export
  getStickersForExport: () => OverlaySticker[];
}
```

### 2. Sticker Canvas Component (`StickerCanvas.tsx`)

```typescript
const StickerCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const { stickers, selectedStickerId } = useStickersOverlayStore();
  
  return (
    <div 
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-10"
      style={{ isolation: 'isolate' }}
    >
      {Array.from(stickers.values())
        .sort((a, b) => a.zIndex - b.zIndex)
        .map(sticker => (
          <StickerElement
            key={sticker.id}
            sticker={sticker}
            isSelected={sticker.id === selectedStickerId}
            canvasRef={canvasRef}
          />
        ))}
    </div>
  );
};
```

### 3. Individual Sticker Element (`StickerElement.tsx`)

```typescript
const StickerElement: React.FC<Props> = ({ sticker, isSelected, canvasRef }) => {
  const { updateSticker } = useStickersOverlayStore();
  const elementRef = useRef<HTMLDivElement>(null);
  
  // Drag functionality
  const { isDragging, handleMouseDown } = useStickerDrag(
    sticker.id,
    elementRef,
    canvasRef
  );
  
  // Resize functionality
  const { isResizing, ResizeHandles } = useStickerResize(
    sticker.id,
    elementRef
  );
  
  // Rotation functionality
  const { RotationHandle } = useStickerRotate(
    sticker.id,
    elementRef
  );
  
  return (
    <div
      ref={elementRef}
      className={cn(
        "absolute pointer-events-auto",
        isSelected && "ring-2 ring-primary",
        isDragging && "cursor-move",
        isResizing && "cursor-resize"
      )}
      style={{
        left: `${sticker.position.x}%`,
        top: `${sticker.position.y}%`,
        width: `${sticker.size.width}%`,
        height: `${sticker.size.height}%`,
        transform: `rotate(${sticker.rotation}deg)`,
        opacity: sticker.opacity,
        zIndex: sticker.zIndex,
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Render sticker content based on type */}
      {sticker.type === 'svg' && (
        <img 
          src={sticker.url} 
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          draggable={false}
        />
      )}
      
      {sticker.type === 'image' && (
        <img 
          src={sticker.url}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          draggable={false}
        />
      )}
      
      {sticker.type === 'video' && (
        <video
          src={sticker.url}
          autoPlay
          loop
          muted
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      )}
      
      {/* Controls when selected */}
      {isSelected && (
        <>
          <ResizeHandles />
          <RotationHandle />
        </>
      )}
    </div>
  );
};
```

### 4. Custom Sticker Uploader (`StickerUploader.tsx`)

```typescript
const StickerUploader: React.FC = () => {
  const { addSticker } = useStickersOverlayStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    for (const file of Array.from(files)) {
      // Validate file type
      const isValid = validateStickerFile(file);
      if (!isValid) {
        toast.error(`Invalid file type: ${file.name}`);
        continue;
      }
      
      // Create appropriate URL based on environment
      let url: string;
      if (window.location.protocol === 'file:') {
        // Electron: Use data URL
        url = await fileToDataURL(file);
      } else {
        // Web: Use blob URL
        url = URL.createObjectURL(file);
      }
      
      // Detect file type
      const type = detectStickerType(file);
      
      // Get dimensions for proper aspect ratio
      const dimensions = await getStickerDimensions(file, type);
      
      // Add to overlay
      addSticker({
        type,
        url,
        file,
        position: { x: 50, y: 50 }, // Center
        size: {
          width: 20, // 20% of canvas
          height: 20 * (dimensions.height / dimensions.width)
        },
        rotation: 0,
        opacity: 1,
        zIndex: Date.now(), // Auto-increment
      });
    }
    
    // Reset input
    e.target.value = '';
  };
  
  return (
    <div className="p-4">
      <Button onClick={() => fileInputRef.current?.click()}>
        <Upload className="w-4 h-4 mr-2" />
        Upload Custom Sticker
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        hidden
        multiple
        accept=".svg,.png,.webp,.gif,.webm,.mp4"
        onChange={handleFileUpload}
      />
    </div>
  );
};
```

### 5. Storage and Persistence (`sticker-persistence.ts`)

```typescript
class StickerPersistence {
  private storageKey = (projectId: string) => `stickers-overlay-${projectId}`;
  
  async saveStickers(projectId: string, stickers: Map<string, OverlaySticker>) {
    const stickersArray = Array.from(stickers.values());
    
    // Save to IndexedDB for web
    if (window.location.protocol !== 'file:') {
      await this.saveToIndexedDB(projectId, stickersArray);
    } else {
      // Save via Electron IPC for desktop
      await window.electronAPI.storage.save(
        this.storageKey(projectId),
        stickersArray
      );
    }
  }
  
  async loadStickers(projectId: string): Promise<OverlaySticker[]> {
    if (window.location.protocol !== 'file:') {
      return await this.loadFromIndexedDB(projectId);
    } else {
      const data = await window.electronAPI.storage.load(
        this.storageKey(projectId)
      );
      return data || [];
    }
  }
  
  private async saveToIndexedDB(projectId: string, stickers: OverlaySticker[]) {
    const db = await this.openDB();
    const tx = db.transaction(['stickers'], 'readwrite');
    await tx.objectStore('stickers').put({
      projectId,
      stickers,
      timestamp: Date.now()
    });
  }
  
  private async loadFromIndexedDB(projectId: string): Promise<OverlaySticker[]> {
    const db = await this.openDB();
    const tx = db.transaction(['stickers'], 'readonly');
    const data = await tx.objectStore('stickers').get(projectId);
    return data?.stickers || [];
  }
}
```

### 6. Export Integration (`sticker-exporter.ts`)

```typescript
class StickerExporter {
  /**
   * Render stickers onto canvas during export
   */
  async renderStickersToCanvas(
    canvas: HTMLCanvasElement,
    stickers: OverlaySticker[],
    currentTime: number
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Sort by z-index
    const sortedStickers = stickers.sort((a, b) => a.zIndex - b.zIndex);
    
    for (const sticker of sortedStickers) {
      // Check if sticker should be visible at current time
      if (!this.isStickerVisible(sticker, currentTime)) continue;
      
      // Save context state
      ctx.save();
      
      // Apply transformations
      const x = (sticker.position.x / 100) * canvas.width;
      const y = (sticker.position.y / 100) * canvas.height;
      const width = (sticker.size.width / 100) * canvas.width;
      const height = (sticker.size.height / 100) * canvas.height;
      
      ctx.translate(x + width / 2, y + height / 2);
      ctx.rotate((sticker.rotation * Math.PI) / 180);
      ctx.globalAlpha = sticker.opacity;
      
      // Draw sticker
      await this.drawSticker(ctx, sticker, -width / 2, -height / 2, width, height);
      
      // Restore context
      ctx.restore();
    }
  }
  
  private async drawSticker(
    ctx: CanvasRenderingContext2D,
    sticker: OverlaySticker,
    x: number,
    y: number,
    width: number,
    height: number
  ) {
    if (sticker.type === 'svg' || sticker.type === 'image') {
      const img = new Image();
      img.src = sticker.url;
      await new Promise(resolve => {
        img.onload = resolve;
      });
      ctx.drawImage(img, x, y, width, height);
    } else if (sticker.type === 'video') {
      // For video stickers, we need to capture the current frame
      const video = document.createElement('video');
      video.src = sticker.url;
      video.currentTime = 0; // Or calculate based on timeline
      await new Promise(resolve => {
        video.onseeked = resolve;
      });
      ctx.drawImage(video, x, y, width, height);
    }
  }
}
```

### 7. Integration with Preview Panel

Modify the existing `preview-panel.tsx` to include the sticker overlay:

```typescript
const PreviewPanel: React.FC = () => {
  // Existing preview logic...
  
  return (
    <div className="relative">
      {/* Existing video/canvas preview */}
      <canvas ref={canvasRef} />
      
      {/* Sticker overlay layer */}
      <StickerCanvas />
      
      {/* Existing controls */}
      <PlaybackControls />
    </div>
  );
};
```

## Key Implementation Considerations

### 1. Performance Optimization
- Use React.memo for sticker components
- Implement virtual rendering for many stickers
- Debounce position updates during drag
- Use requestAnimationFrame for smooth animations

### 2. Memory Management
- Clean up blob URLs when stickers are removed
- Use WeakMap for caching rendered stickers
- Implement lazy loading for video stickers

### 3. Electron Compatibility
- Always use data URLs in Electron environment
- Handle file:// protocol restrictions
- Use IPC for file operations

### 4. Export Quality
- Render stickers at export resolution, not preview resolution
- Maintain aspect ratios during scaling
- Support high DPI exports

### 5. User Experience
- Show loading states for large stickers
- Provide undo/redo functionality
- Add keyboard shortcuts for common operations
- Show tooltips for controls

## Testing Strategy

### Unit Tests
- Test sticker store actions
- Test drag/resize calculations
- Test persistence operations

### Integration Tests
- Test sticker rendering in different environments
- Test export with multiple stickers
- Test storage and retrieval

### E2E Tests
- Test complete workflow from upload to export
- Test in both web and Electron environments
- Test with various file formats

## Migration Path

1. **Phase 1**: Implement basic overlay system
   - Create store and basic components
   - Add to preview without breaking existing features

2. **Phase 2**: Add interactivity
   - Implement drag and drop
   - Add resize and rotate

3. **Phase 3**: Storage and persistence
   - Implement storage layer
   - Add auto-save functionality

4. **Phase 4**: Export integration
   - Modify export pipeline
   - Test with all export formats

5. **Phase 5**: Advanced features
   - Add effects and filters
   - Implement animation support
   - Add timeline integration (optional)

## Conclusion

This implementation provides a complete sticker overlay system that:
- Works independently of the timeline
- Supports full interactivity
- Persists across sessions
- Integrates with export
- Maintains transparency
- Supports custom uploads

The modular architecture ensures that existing features remain unaffected while providing a rich sticker experience for users.