# Stickers Overlay Implementation Guide

## Current State Analysis
We already have:
- ✅ Stickers panel in media panel (`src/components/editor/media-panel/views/stickers/`)
- ✅ Stickers store (`src/stores/stickers-store.ts`)
- ✅ Sticker selection and adding to media (`use-sticker-select.ts`)
- ✅ Iconify API integration for sticker library
- ✅ Recent stickers tracking
- ✅ Search functionality

What's missing:
- ❌ Overlay rendering on preview
- ❌ Drag and drop positioning
- ❌ Resize and rotate controls
- ❌ Persistence of overlay positions
- ❌ Export integration
- ❌ Custom sticker upload

## Implementation Phases - Broken Down into 10-Minute Tasks

### Phase 1: Basic Overlay Display (Total: ~40 minutes)

#### Task 1.1: Create Overlay Store Types (10 min)
**File:** `src/types/sticker-overlay.ts`
```typescript
export interface OverlaySticker {
  id: string;
  mediaItemId: string;  // Reference to media store item
  position: { x: number; y: number };  // Percentage
  size: { width: number; height: number };  // Percentage
  rotation: number;  // Degrees
  opacity: number;  // 0-1
  zIndex: number;
}

export interface StickerOverlayState {
  overlayStickers: Map<string, OverlaySticker>;
  selectedStickerId: string | null;
}
```

#### Task 1.2: Create Overlay Store (10 min)
**File:** `src/stores/stickers-overlay-store.ts`
```typescript
import { create } from 'zustand';
import type { OverlaySticker, StickerOverlayState } from '@/types/sticker-overlay';

export const useStickersOverlayStore = create<StickerOverlayState & {
  addOverlaySticker: (mediaItemId: string) => void;
  removeOverlaySticker: (id: string) => void;
  updateOverlaySticker: (id: string, updates: Partial<OverlaySticker>) => void;
  selectSticker: (id: string | null) => void;
}>((set) => ({
  overlayStickers: new Map(),
  selectedStickerId: null,
  
  addOverlaySticker: (mediaItemId) => {
    const id = Date.now().toString();
    const newSticker: OverlaySticker = {
      id,
      mediaItemId,
      position: { x: 50, y: 50 },
      size: { width: 20, height: 20 },
      rotation: 0,
      opacity: 1,
      zIndex: Date.now(),
    };
    set((state) => ({
      overlayStickers: new Map(state.overlayStickers).set(id, newSticker),
    }));
  },
  
  removeOverlaySticker: (id) => {
    set((state) => {
      const newMap = new Map(state.overlayStickers);
      newMap.delete(id);
      return { overlayStickers: newMap };
    });
  },
  
  updateOverlaySticker: (id, updates) => {
    set((state) => {
      const sticker = state.overlayStickers.get(id);
      if (!sticker) return state;
      const newMap = new Map(state.overlayStickers);
      newMap.set(id, { ...sticker, ...updates });
      return { overlayStickers: newMap };
    });
  },
  
  selectSticker: (id) => {
    set({ selectedStickerId: id });
  },
}));
```

#### Task 1.3: Create Simple Overlay Canvas (10 min)
**File:** `src/components/editor/stickers-overlay/StickerCanvas.tsx`
```typescript
import { useStickersOverlayStore } from '@/stores/stickers-overlay-store';
import { useMediaStore } from '@/stores/media-store';

export const StickerCanvas = () => {
  const { overlayStickers } = useStickersOverlayStore();
  const { mediaItems } = useMediaStore();
  
  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {Array.from(overlayStickers.values()).map((sticker) => {
        const mediaItem = mediaItems.find(item => item.id === sticker.mediaItemId);
        if (!mediaItem) return null;
        
        return (
          <div
            key={sticker.id}
            className="absolute"
            style={{
              left: `${sticker.position.x}%`,
              top: `${sticker.position.y}%`,
              width: `${sticker.size.width}%`,
              height: `${sticker.size.height}%`,
              transform: `translate(-50%, -50%) rotate(${sticker.rotation}deg)`,
              opacity: sticker.opacity,
              zIndex: sticker.zIndex,
            }}
          >
            <img 
              src={mediaItem.url}
              alt=""
              className="w-full h-full object-contain"
              draggable={false}
            />
          </div>
        );
      })}
    </div>
  );
};
```

#### Task 1.4: Add Overlay to Preview Panel (10 min)
**File:** Modify `src/components/editor/preview-panel.tsx`
```typescript
// Add import
import { StickerCanvas } from './stickers-overlay/StickerCanvas';

// In the render, add after the video/canvas element:
<div className="relative">
  {/* Existing preview content */}
  <canvas ref={canvasRef} />
  
  {/* Add sticker overlay */}
  <StickerCanvas />
  
  {/* Existing controls */}
</div>
```

### Phase 2: Add to Overlay Button (Total: ~20 minutes)

#### Task 2.1: Add Overlay Button to Media Items (10 min)
**File:** Modify `src/components/editor/media-panel/views/media.tsx`
```typescript
// Add to existing media item actions
import { useStickersOverlayStore } from '@/stores/stickers-overlay-store';

// In component
const { addOverlaySticker } = useStickersOverlayStore();

// Add button in media item actions
<Button
  size="icon"
  variant="ghost"
  onClick={(e) => {
    e.stopPropagation();
    addOverlaySticker(item.id);
    toast.success('Added to overlay');
  }}
  title="Add as overlay"
>
  <Layers className="h-4 w-4" />
</Button>
```

#### Task 2.2: Add Overlay Button to Sticker Items (10 min)
**File:** Modify `src/components/editor/media-panel/views/stickers/components/sticker-item.tsx`
```typescript
// Similar to above, add overlay button after the sticker is added to media
// This allows direct overlay placement from sticker library
```

### Phase 3: Basic Drag Functionality (Total: ~30 minutes)

#### Task 3.1: Create Simple Drag Hook (10 min)
**File:** `src/components/editor/stickers-overlay/hooks/useStickerDrag.ts`
```typescript
import { useRef, useCallback } from 'react';
import { useStickersOverlayStore } from '@/stores/stickers-overlay-store';

export const useStickerDrag = (stickerId: string) => {
  const { updateOverlaySticker } = useStickersOverlayStore();
  const isDragging = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startPos.current = { x: e.clientX, y: e.clientY };
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      
      const deltaX = ((e.clientX - startPos.current.x) / window.innerWidth) * 100;
      const deltaY = ((e.clientY - startPos.current.y) / window.innerHeight) * 100;
      
      updateOverlaySticker(stickerId, {
        position: {
          x: Math.max(0, Math.min(100, deltaX + 50)),
          y: Math.max(0, Math.min(100, deltaY + 50)),
        },
      });
      
      startPos.current = { x: e.clientX, y: e.clientY };
    };
    
    const handleMouseUp = () => {
      isDragging.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [stickerId, updateOverlaySticker]);
  
  return { handleMouseDown };
};
```

#### Task 3.2: Create Draggable Sticker Element (10 min)
**File:** `src/components/editor/stickers-overlay/StickerElement.tsx`
```typescript
import { useStickerDrag } from './hooks/useStickerDrag';
import { useStickersOverlayStore } from '@/stores/stickers-overlay-store';

export const StickerElement = ({ sticker, mediaItem }) => {
  const { selectedStickerId, selectSticker } = useStickersOverlayStore();
  const { handleMouseDown } = useStickerDrag(sticker.id);
  const isSelected = selectedStickerId === sticker.id;
  
  return (
    <div
      className={`absolute pointer-events-auto cursor-move ${
        isSelected ? 'ring-2 ring-primary' : ''
      }`}
      style={{
        left: `${sticker.position.x}%`,
        top: `${sticker.position.y}%`,
        width: `${sticker.size.width}%`,
        height: `${sticker.size.height}%`,
        transform: `translate(-50%, -50%) rotate(${sticker.rotation}deg)`,
        opacity: sticker.opacity,
        zIndex: sticker.zIndex,
      }}
      onMouseDown={(e) => {
        selectSticker(sticker.id);
        handleMouseDown(e);
      }}
    >
      <img 
        src={mediaItem.url}
        alt=""
        className="w-full h-full object-contain"
        draggable={false}
      />
    </div>
  );
};
```

#### Task 3.3: Update Canvas to Use StickerElement (10 min)
**File:** Update `src/components/editor/stickers-overlay/StickerCanvas.tsx`
```typescript
// Replace the inline div with StickerElement component
import { StickerElement } from './StickerElement';

// In render:
{Array.from(overlayStickers.values()).map((sticker) => {
  const mediaItem = mediaItems.find(item => item.id === sticker.mediaItemId);
  if (!mediaItem) return null;
  
  return (
    <StickerElement
      key={sticker.id}
      sticker={sticker}
      mediaItem={mediaItem}
    />
  );
})}
```

### Phase 4: Simple Resize Handles (Total: ~30 minutes)

#### Task 4.1: Add Resize State to Store (5 min)
**File:** Update `src/stores/stickers-overlay-store.ts`
```typescript
// Add to store state:
isResizing: boolean;

// Add action:
setIsResizing: (isResizing: boolean) => {
  set({ isResizing });
};
```

#### Task 4.2: Create Resize Handles Component (10 min)
**File:** `src/components/editor/stickers-overlay/ResizeHandles.tsx`
```typescript
export const ResizeHandles = ({ stickerId, isVisible }) => {
  const { updateOverlaySticker } = useStickersOverlayStore();
  
  if (!isVisible) return null;
  
  const handleResize = (corner: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    // Simple resize logic - just increase/decrease by 5%
    updateOverlaySticker(stickerId, {
      size: {
        width: 25,  // Simplified for now
        height: 25,
      },
    });
  };
  
  return (
    <>
      <div 
        className="absolute -top-1 -left-1 w-3 h-3 bg-white border border-gray-500 cursor-nw-resize"
        onMouseDown={handleResize('tl')}
      />
      <div 
        className="absolute -top-1 -right-1 w-3 h-3 bg-white border border-gray-500 cursor-ne-resize"
        onMouseDown={handleResize('tr')}
      />
      <div 
        className="absolute -bottom-1 -left-1 w-3 h-3 bg-white border border-gray-500 cursor-sw-resize"
        onMouseDown={handleResize('bl')}
      />
      <div 
        className="absolute -bottom-1 -right-1 w-3 h-3 bg-white border border-gray-500 cursor-se-resize"
        onMouseDown={handleResize('br')}
      />
    </>
  );
};
```

#### Task 4.3: Add Resize Handles to StickerElement (5 min)
**File:** Update `src/components/editor/stickers-overlay/StickerElement.tsx`
```typescript
import { ResizeHandles } from './ResizeHandles';

// In component render:
<div className="relative">
  <img ... />
  <ResizeHandles stickerId={sticker.id} isVisible={isSelected} />
</div>
```

#### Task 4.4: Add Delete Button (10 min)
**File:** Create `src/components/editor/stickers-overlay/StickerControls.tsx`
```typescript
export const StickerControls = ({ stickerId, isVisible }) => {
  const { removeOverlaySticker } = useStickersOverlayStore();
  
  if (!isVisible) return null;
  
  return (
    <div className="absolute -top-8 left-1/2 transform -translate-x-1/2">
      <Button
        size="icon"
        variant="destructive"
        className="h-6 w-6"
        onClick={(e) => {
          e.stopPropagation();
          removeOverlaySticker(stickerId);
        }}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
};
```

### Phase 5: Storage Integration (Total: ~20 minutes)

#### Task 5.1: Add Storage Actions to Store (10 min)
**File:** Update `src/stores/stickers-overlay-store.ts`
```typescript
// Add to store:
saveToProject: async (projectId: string) => {
  const state = get();
  const data = Array.from(state.overlayStickers.values());
  
  // Use existing storage service
  const key = `overlay-stickers-${projectId}`;
  if (window.electronAPI) {
    await window.electronAPI.storage.save(key, data);
  } else {
    localStorage.setItem(key, JSON.stringify(data));
  }
},

loadFromProject: async (projectId: string) => {
  const key = `overlay-stickers-${projectId}`;
  let data: OverlaySticker[] = [];
  
  if (window.electronAPI) {
    data = await window.electronAPI.storage.load(key) || [];
  } else {
    const stored = localStorage.getItem(key);
    if (stored) data = JSON.parse(stored);
  }
  
  const map = new Map(data.map(s => [s.id, s]));
  set({ overlayStickers: map });
},
```

#### Task 5.2: Auto-save on Changes (10 min)
**File:** Create `src/components/editor/stickers-overlay/AutoSave.tsx`
```typescript
import { useEffect } from 'react';
import { useStickersOverlayStore } from '@/stores/stickers-overlay-store';
import { useProjectStore } from '@/stores/project-store';
import { debounce } from '@/lib/utils';

export const StickerOverlayAutoSave = () => {
  const { overlayStickers, saveToProject } = useStickersOverlayStore();
  const { activeProject } = useProjectStore();
  
  useEffect(() => {
    if (!activeProject) return;
    
    const save = debounce(() => {
      saveToProject(activeProject.id);
    }, 1000);
    
    save();
  }, [overlayStickers, activeProject?.id]);
  
  return null;
};
```

### Phase 6: Export Integration (Total: ~30 minutes)

#### Task 6.1: Create Export Helper (10 min)
**File:** `src/lib/stickers/sticker-export-helper.ts`
```typescript
export const renderStickersToCanvas = async (
  ctx: CanvasRenderingContext2D,
  stickers: OverlaySticker[],
  mediaItems: MediaItem[],
  canvasWidth: number,
  canvasHeight: number
) => {
  for (const sticker of stickers) {
    const mediaItem = mediaItems.find(m => m.id === sticker.mediaItemId);
    if (!mediaItem) continue;
    
    const img = new Image();
    img.src = mediaItem.url;
    await new Promise(resolve => img.onload = resolve);
    
    ctx.save();
    
    const x = (sticker.position.x / 100) * canvasWidth;
    const y = (sticker.position.y / 100) * canvasHeight;
    const width = (sticker.size.width / 100) * canvasWidth;
    const height = (sticker.size.height / 100) * canvasHeight;
    
    ctx.translate(x, y);
    ctx.rotate((sticker.rotation * Math.PI) / 180);
    ctx.globalAlpha = sticker.opacity;
    
    ctx.drawImage(img, -width/2, -height/2, width, height);
    
    ctx.restore();
  }
};
```

#### Task 6.2: Integrate with Export Canvas (10 min)
**File:** Modify `src/components/export-canvas.tsx`
```typescript
// Add import
import { useStickersOverlayStore } from '@/stores/stickers-overlay-store';
import { renderStickersToCanvas } from '@/lib/stickers/sticker-export-helper';

// In component
const { overlayStickers } = useStickersOverlayStore();
const { mediaItems } = useMediaStore();

// In render frame function, after drawing main content:
await renderStickersToCanvas(
  ctx,
  Array.from(overlayStickers.values()),
  mediaItems,
  canvas.width,
  canvas.height
);
```

#### Task 6.3: Test Export with Stickers (10 min)
- Manual testing task
- Add a sticker to overlay
- Export video
- Verify sticker appears in exported video

### Phase 7: Custom Upload Support (Total: ~20 minutes)

#### Task 7.1: Add Upload Button to Stickers Panel (10 min)
**File:** Modify `src/components/editor/media-panel/views/stickers/index.tsx`
```typescript
// Add upload button at the top
const fileInputRef = useRef<HTMLInputElement>(null);

const handleCustomUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = e.target.files;
  if (!files) return;
  
  // Process files using existing media processing
  await processFiles(files);
  toast.success('Custom stickers uploaded');
};

// In render:
<Button onClick={() => fileInputRef.current?.click()}>
  <Upload className="w-4 h-4 mr-2" />
  Upload Custom
</Button>
<input
  ref={fileInputRef}
  type="file"
  hidden
  multiple
  accept="image/svg+xml,image/png,image/webp"
  onChange={handleCustomUpload}
/>
```

#### Task 7.2: Validate Transparency (10 min)
**File:** `src/lib/stickers/sticker-validator.ts`
```typescript
export const validateStickerFile = (file: File): boolean => {
  const validTypes = [
    'image/svg+xml',
    'image/png',
    'image/webp',
    'image/gif',
  ];
  
  if (!validTypes.includes(file.type)) {
    return false;
  }
  
  // Check file size (max 10MB for stickers)
  if (file.size > 10 * 1024 * 1024) {
    return false;
  }
  
  return true;
};

export const hasTransparency = async (file: File): Promise<boolean> => {
  // For SVG, always has transparency support
  if (file.type === 'image/svg+xml') return true;
  
  // For other formats, we assume they might have transparency
  // More complex checks would require reading pixel data
  return true;
};
```

## Quick Start Guide

### For Developers

1. **Start with Phase 1** - Get basic overlay working (40 min)
2. **Add Phase 2** - Enable adding stickers to overlay (20 min)
3. **Implement Phase 3** - Basic drag functionality (30 min)
4. **Add Phase 4** - Simple resize controls (30 min)
5. **Complete Phase 5** - Storage persistence (20 min)
6. **Integrate Phase 6** - Export support (30 min)
7. **Finish with Phase 7** - Custom uploads (20 min)

**Total estimated time: ~3 hours**

### Testing Checklist

After each phase:
- [ ] No existing features broken
- [ ] Works in both web and Electron
- [ ] Transparent backgrounds preserved
- [ ] UI remains responsive

### Common Issues & Solutions

1. **Blob URLs not working in Electron**
   - Solution: Already handled - we use data URLs in Electron

2. **Stickers not appearing in export**
   - Check z-index ordering
   - Ensure canvas context save/restore

3. **Performance with many stickers**
   - Implement virtualization for > 20 stickers
   - Use React.memo on components

4. **Storage not persisting**
   - Check project ID is correct
   - Verify storage service is initialized

## Notes for Implementation

- Each task is designed to be completed in ~10 minutes
- Tasks can be done independently by different developers
- Always test after each task to ensure nothing breaks
- Use existing patterns from the codebase
- Avoid modifying timeline code - keep overlay separate
- Reuse existing media store for sticker data
- Leverage existing storage service patterns

## Dependencies on Existing Code

- Media store for sticker file management
- Project store for active project ID
- Storage service for persistence
- Export canvas for rendering
- Preview panel for overlay display

This approach minimizes risk and maximizes reuse of existing, tested code.