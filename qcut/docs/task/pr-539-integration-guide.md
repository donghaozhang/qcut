# PR #539: Integration and Usage Guide

**Pull Request**: [#539 - Add Stickers Panel](https://github.com/OpenCut-app/OpenCut/pull/539/files)  
**Focus**: Integration patterns and usage workflows

## 🚀 Integration Workflows

### 1. **User Workflow: Adding Stickers to Projects**

#### Step-by-Step Process
```
1. User opens Media Panel
2. Clicks "Stickers" tab
3. Browses collections or searches
4. Clicks desired sticker
5. Sticker appears on timeline/canvas
6. User can position/resize sticker
```

#### Technical Flow
```
UI Event → StickersView → StickersStore → Timeline Integration
    ↓           ↓            ↓               ↓
Click Handler → addSticker() → Project Update → Render Update
```

### 2. **Developer Integration Patterns**

#### Component Integration
```typescript
// In MediaPanel component
import { StickersView } from './views/stickers';

const renderView = () => {
  switch (activeTab) {
    case 'media':
      return <MediaView />;
    case 'audio':
      return <AudioView />;
    case 'ai':
      return <AiView />;
    case 'stickers':
      return <StickersView />; // New integration
    default:
      return null;
  }
};
```

#### Store Integration
```typescript
// Using stickers store in components
import { useStickersStore } from '@/stores/stickers-store';

export function SomeComponent() {
  const { 
    collections, 
    fetchCollections, 
    addStickerToProject 
  } = useStickersStore();

  // Component logic
}
```

## 🔧 API Integration Patterns

### 1. **Iconify API Usage**

#### Basic Collection Fetching
```typescript
import { iconifyAPI } from '@/lib/iconify-api';

// Fetch all available collections
const collections = await iconifyAPI.fetchCollections();

// Fetch stickers from specific collection
const stickers = await iconifyAPI.fetchStickers('mdi');

// Search across collections
const searchResults = await iconifyAPI.searchStickers('arrow');
```

#### Error Handling Pattern
```typescript
try {
  const collections = await iconifyAPI.fetchCollections();
  // Handle success
} catch (error) {
  if (error.code === 'NETWORK_ERROR') {
    // Use cached data
    const cachedCollections = await storageService.getCachedCollections();
  } else if (error.code === 'RATE_LIMITED') {
    // Show rate limit message
  } else {
    // Handle other errors
  }
}
```

### 2. **Storage Integration Patterns**

#### Caching Strategy
```typescript
// Cache-first approach
async function getStickers(collectionId: string) {
  // Try cache first
  let stickers = await storageService.getCachedStickers(collectionId);
  
  if (!stickers || isCacheExpired(stickers)) {
    // Fetch from API
    stickers = await iconifyAPI.fetchStickers(collectionId);
    
    // Update cache
    await storageService.cacheStickerData(collectionId, stickers);
  }
  
  return stickers;
}
```

#### Preference Management
```typescript
// Save user preferences
const preferences = {
  favoriteCollections: ['mdi', 'fa'],
  recentStickers: ['mdi:arrow-right', 'fa:star'],
  gridSize: 'medium',
  darkMode: true
};

await storageService.saveStickerPreferences(preferences);
```

## 🎨 UI Integration Patterns

### 1. **Component Composition**

#### StickersView Structure
```typescript
export function StickersView() {
  return (
    <div className="stickers-view">
      <StickerSearchBar />
      <StickerCollectionTabs />
      <StickerGrid />
      <LoadingStates />
      <ErrorBoundary />
    </div>
  );
}
```

#### Responsive Design
```typescript
// Grid responsive behavior
const getGridColumns = (screenWidth: number) => {
  if (screenWidth < 640) return 4; // Mobile
  if (screenWidth < 1024) return 6; // Tablet
  return 8; // Desktop
};
```

### 2. **Dark Mode Integration**

#### Theme-Aware Sticker Display
```typescript
const getStickerBackgroundColor = (theme: 'light' | 'dark') => {
  return theme === 'dark' ? '#2d3748' : '#ffffff';
};

// CSS custom properties approach
const stickerStyles = {
  '--sticker-bg': 'var(--background-primary)',
  '--sticker-border': 'var(--border-color)',
};
```

## 📱 Timeline Integration Patterns

### 1. **Adding Stickers to Timeline**

#### Timeline Element Creation
```typescript
const addStickerToTimeline = (sticker: StickerData) => {
  const timelineElement = {
    id: generateId(),
    type: 'sticker',
    startTime: currentTime,
    duration: 5000, // 5 seconds default
    stickerData: {
      id: sticker.id,
      svg: sticker.svg,
      name: sticker.name,
    },
    transform: {
      x: 100,
      y: 100,
      scale: 1,
      rotation: 0,
    },
    zIndex: getNextZIndex(),
  };

  timelineStore.addElement(timelineElement);
};
```

### 2. **Sticker Rendering on Canvas**

#### SVG Rendering Pattern
```typescript
const renderSticker = (element: StickerElement, context: CanvasRenderingContext2D) => {
  const { stickerData, transform } = element;
  
  // Create image from SVG
  const img = new Image();
  const svgBlob = new Blob([stickerData.svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(svgBlob);
  
  img.onload = () => {
    context.save();
    
    // Apply transformations
    context.translate(transform.x, transform.y);
    context.scale(transform.scale, transform.scale);
    context.rotate(transform.rotation * Math.PI / 180);
    
    // Draw sticker
    context.drawImage(img, 0, 0);
    
    context.restore();
    URL.revokeObjectURL(url);
  };
  
  img.src = url;
};
```

## 🔄 State Management Patterns

### 1. **Store Integration with Timeline**

#### Cross-Store Communication
```typescript
// In stickers store
const addStickerToProject = (sticker: StickerData) => {
  // Add to timeline
  const timelineStore = useTimelineStore.getState();
  timelineStore.addStickerElement(sticker);
  
  // Update recent stickers
  set((state) => ({
    recentStickers: [sticker, ...state.recentStickers.slice(0, 9)]
  }));
  
  // Save to preferences
  storageService.updateRecentStickers(sticker);
};
```

### 2. **Performance Optimization Patterns**

#### Selective Rendering
```typescript
// Only re-render when specific data changes
const StickerGrid = React.memo(() => {
  const stickers = useStickersStore(
    (state) => state.stickers[state.selectedCollection],
    shallow
  );
  
  return (
    <VirtualGrid
      items={stickers}
      renderItem={StickerItem}
      itemSize={64}
    />
  );
});
```

#### Debounced Search
```typescript
const useSearchStickers = () => {
  const searchStickers = useStickersStore((s) => s.searchStickers);
  
  return useMemo(
    () => debounce(searchStickers, 300),
    [searchStickers]
  );
};
```

## 🧪 Testing Integration Patterns

### 1. **Component Testing**

#### Sticker Selection Test
```typescript
test('should add sticker to timeline when clicked', async () => {
  const mockSticker = { id: 'test', name: 'Test Sticker' };
  
  render(<StickersView />);
  
  // Mock API response
  mockIconifyAPI.fetchStickers.mockResolvedValue([mockSticker]);
  
  // Click sticker
  const stickerElement = screen.getByTestId('sticker-test');
  fireEvent.click(stickerElement);
  
  // Verify timeline update
  expect(mockTimelineStore.addElement).toHaveBeenCalled();
});
```

### 2. **API Integration Testing**

#### Error Scenario Testing
```typescript
test('should handle API errors gracefully', async () => {
  mockIconifyAPI.fetchCollections.mockRejectedValue(
    new Error('Network error')
  );
  
  render(<StickersView />);
  
  await waitFor(() => {
    expect(screen.getByText(/error loading collections/i)).toBeInTheDocument();
  });
});
```

---

*Integration guide for OpenCut development team implementation and testing.*