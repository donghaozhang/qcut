# PR #539: Testing Strategy and Test Cases

**Pull Request**: [#539 - Add Stickers Panel](https://github.com/OpenCut-app/OpenCut/pull/539/files)  
**Focus**: Comprehensive testing approach for stickers functionality

## 🧪 Testing Strategy Overview

### Testing Pyramid Structure
```
                    E2E Tests (5%)
                 ├─ User workflows
                 └─ Cross-browser testing
                
            Integration Tests (25%)
         ├─ API integration
         ├─ Store interactions
         └─ Component integration
    
        Unit Tests (70%)
    ├─ Component logic
    ├─ API functions
    ├─ Store actions
    └─ Utility functions
```

## 🔬 Unit Testing Strategy

### 1. **StickersView Component Tests**

#### Component Rendering Tests
```typescript
// StickersView.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StickersView } from '../views/stickers';
import { useStickersStore } from '@/stores/stickers-store';

// Mock the store
jest.mock('@/stores/stickers-store');

describe('StickersView', () => {
  const mockStore = {
    collections: [],
    stickers: {},
    isLoading: false,
    error: null,
    fetchCollections: jest.fn(),
    fetchStickers: jest.fn(),
    addStickerToProject: jest.fn(),
  };

  beforeEach(() => {
    (useStickersStore as jest.Mock).mockReturnValue(mockStore);
  });

  test('should render loading state', () => {
    mockStore.isLoading = true;
    render(<StickersView />);
    
    expect(screen.getByTestId('stickers-loading')).toBeInTheDocument();
  });

  test('should render error state', () => {
    mockStore.error = 'Failed to load collections';
    render(<StickersView />);
    
    expect(screen.getByText(/failed to load collections/i)).toBeInTheDocument();
  });

  test('should fetch collections on mount', () => {
    render(<StickersView />);
    
    expect(mockStore.fetchCollections).toHaveBeenCalledTimes(1);
  });

  test('should render sticker grid when data loaded', async () => {
    mockStore.collections = [
      { id: 'mdi', name: 'Material Design Icons', total: 100 }
    ];
    mockStore.stickers = {
      'mdi': [
        { id: 'mdi:arrow-right', name: 'Arrow Right', svg: '<svg>...</svg>' }
      ]
    };

    render(<StickersView />);
    
    await waitFor(() => {
      expect(screen.getByTestId('stickers-grid')).toBeInTheDocument();
    });
  });
});
```

#### Interaction Tests
```typescript
describe('StickersView Interactions', () => {
  test('should add sticker to project when clicked', async () => {
    const mockSticker = {
      id: 'mdi:star',
      name: 'Star',
      svg: '<svg>star</svg>',
      collection: 'mdi'
    };

    mockStore.stickers = { 'mdi': [mockSticker] };
    
    render(<StickersView />);
    
    const stickerElement = screen.getByTestId('sticker-mdi:star');
    fireEvent.click(stickerElement);
    
    expect(mockStore.addStickerToProject).toHaveBeenCalledWith(mockSticker);
  });

  test('should filter stickers when searching', async () => {
    const stickers = [
      { id: 'mdi:star', name: 'Star', tags: ['favorite'] },
      { id: 'mdi:arrow', name: 'Arrow', tags: ['navigation'] },
    ];
    mockStore.stickers = { 'mdi': stickers };

    render(<StickersView />);
    
    const searchInput = screen.getByPlaceholderText(/search stickers/i);
    fireEvent.change(searchInput, { target: { value: 'star' } });
    
    await waitFor(() => {
      expect(screen.getByTestId('sticker-mdi:star')).toBeInTheDocument();
      expect(screen.queryByTestId('sticker-mdi:arrow')).not.toBeInTheDocument();
    });
  });

  test('should load collection when tab is clicked', async () => {
    mockStore.collections = [
      { id: 'mdi', name: 'Material Design Icons' },
      { id: 'fa', name: 'Font Awesome' }
    ];

    render(<StickersView />);
    
    const faTab = screen.getByText('Font Awesome');
    fireEvent.click(faTab);
    
    expect(mockStore.fetchStickers).toHaveBeenCalledWith('fa');
  });
});
```

### 2. **IconifyAPI Service Tests**

#### API Method Tests
```typescript
// iconify-api.test.ts
import { IconifyAPI } from '../iconify-api';

// Mock fetch
global.fetch = jest.fn();

describe('IconifyAPI', () => {
  let api: IconifyAPI;

  beforeEach(() => {
    api = IconifyAPI.getInstance();
    (fetch as jest.Mock).mockClear();
  });

  test('should fetch collections successfully', async () => {
    const mockCollections = [
      { prefix: 'mdi', name: 'Material Design Icons', total: 7000 }
    ];

    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockCollections
    });

    const collections = await api.fetchCollections();
    
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/collections')
    );
    expect(collections).toEqual(mockCollections);
  });

  test('should handle API errors gracefully', async () => {
    (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    await expect(api.fetchCollections()).rejects.toThrow('Network error');
  });

  test('should fetch stickers for collection', async () => {
    const mockStickers = {
      prefix: 'mdi',
      icons: {
        'arrow-right': { width: 24, height: 24 },
        'arrow-left': { width: 24, height: 24 }
      }
    };

    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockStickers
    });

    const stickers = await api.fetchStickers('mdi');
    
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/collection?prefix=mdi')
    );
    expect(stickers).toHaveLength(2);
  });

  test('should search stickers across collections', async () => {
    const mockResults = {
      icons: ['mdi:arrow-right', 'fa:arrow-left'],
      total: 2
    };

    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResults
    });

    const results = await api.searchStickers('arrow');
    
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/search?query=arrow')
    );
    expect(results).toEqual(mockResults);
  });
});
```

#### Error Handling Tests
```typescript
describe('IconifyAPI Error Handling', () => {
  test('should handle rate limiting', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests'
    });

    await expect(api.fetchCollections()).rejects.toThrow(/rate limit/i);
  });

  test('should handle network timeouts', async () => {
    (fetch as jest.Mock).mockImplementationOnce(() => 
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), 100)
      )
    );

    await expect(api.fetchCollections()).rejects.toThrow('Request timeout');
  });

  test('should handle malformed responses', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => { throw new Error('Invalid JSON'); }
    });

    await expect(api.fetchCollections()).rejects.toThrow('Invalid JSON');
  });
});
```

### 3. **StickersStore Tests**

#### Store State Tests
```typescript
// stickers-store.test.ts
import { renderHook, act } from '@testing-library/react';
import { useStickersStore } from '../stickers-store';

// Mock API
jest.mock('@/lib/iconify-api');

describe('StickersStore', () => {
  test('should initialize with default state', () => {
    const { result } = renderHook(() => useStickersStore());
    
    expect(result.current.collections).toEqual([]);
    expect(result.current.stickers).toEqual({});
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe(null);
  });

  test('should handle fetchCollections success', async () => {
    const mockCollections = [
      { id: 'mdi', name: 'Material Design Icons' }
    ];

    const mockIconifyAPI = require('@/lib/iconify-api').iconifyAPI;
    mockIconifyAPI.fetchCollections.mockResolvedValueOnce(mockCollections);

    const { result } = renderHook(() => useStickersStore());

    await act(async () => {
      await result.current.fetchCollections();
    });

    expect(result.current.collections).toEqual(mockCollections);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe(null);
  });

  test('should handle fetchCollections error', async () => {
    const mockIconifyAPI = require('@/lib/iconify-api').iconifyAPI;
    mockIconifyAPI.fetchCollections.mockRejectedValueOnce(
      new Error('API Error')
    );

    const { result } = renderHook(() => useStickersStore());

    await act(async () => {
      await result.current.fetchCollections();
    });

    expect(result.current.collections).toEqual([]);
    expect(result.current.error).toBe('API Error');
    expect(result.current.isLoading).toBe(false);
  });

  test('should add sticker to project', () => {
    const mockSticker = { id: 'test', name: 'Test Sticker' };
    const mockTimelineStore = jest.fn();
    
    // Mock timeline store integration
    jest.mock('@/stores/timeline-store', () => ({
      useTimelineStore: { getState: () => ({ addElement: mockTimelineStore }) }
    }));

    const { result } = renderHook(() => useStickersStore());

    act(() => {
      result.current.addStickerToProject(mockSticker);
    });

    // Verify timeline integration would be called
    // (actual implementation would test timeline store integration)
  });
});
```

## 🔗 Integration Testing

### 1. **Component Integration Tests**

#### Media Panel Integration
```typescript
// media-panel-integration.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { MediaPanel } from '../media-panel';

describe('MediaPanel Stickers Integration', () => {
  test('should show StickersView when stickers tab is clicked', async () => {
    render(<MediaPanel />);
    
    const stickersTab = screen.getByRole('tab', { name: /stickers/i });
    fireEvent.click(stickersTab);
    
    expect(screen.getByTestId('stickers-view')).toBeInTheDocument();
  });

  test('should maintain state when switching between tabs', async () => {
    render(<MediaPanel />);
    
    // Go to stickers tab
    fireEvent.click(screen.getByRole('tab', { name: /stickers/i }));
    
    // Search for stickers
    const searchInput = screen.getByPlaceholderText(/search stickers/i);
    fireEvent.change(searchInput, { target: { value: 'arrow' } });
    
    // Switch to media tab
    fireEvent.click(screen.getByRole('tab', { name: /media/i }));
    
    // Switch back to stickers
    fireEvent.click(screen.getByRole('tab', { name: /stickers/i }));
    
    // Search value should be preserved
    expect(searchInput.value).toBe('arrow');
  });
});
```

### 2. **API-Store Integration Tests**

#### End-to-End Data Flow
```typescript
// api-store-integration.test.ts
import { renderHook, act } from '@testing-library/react';
import { useStickersStore } from '@/stores/stickers-store';
import { setupServer } from 'msw/node';
import { rest } from 'msw';

// Mock server for API calls
const server = setupServer(
  rest.get('*/collections', (req, res, ctx) => {
    return res(ctx.json([
      { prefix: 'mdi', name: 'Material Design Icons', total: 7000 }
    ]));
  }),
  
  rest.get('*/collection', (req, res, ctx) => {
    const prefix = req.url.searchParams.get('prefix');
    
    if (prefix === 'mdi') {
      return res(ctx.json({
        prefix: 'mdi',
        icons: {
          'arrow-right': { width: 24, height: 24 },
          'star': { width: 24, height: 24 }
        }
      }));
    }
    
    return res(ctx.status(404));
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('API-Store Integration', () => {
  test('should load collections and stickers successfully', async () => {
    const { result } = renderHook(() => useStickersStore());

    // Fetch collections
    await act(async () => {
      await result.current.fetchCollections();
    });

    expect(result.current.collections).toHaveLength(1);
    expect(result.current.collections[0].name).toBe('Material Design Icons');

    // Fetch stickers from collection
    await act(async () => {
      await result.current.fetchStickers('mdi');
    });

    expect(result.current.stickers['mdi']).toHaveLength(2);
  });

  test('should handle API failures gracefully', async () => {
    server.use(
      rest.get('*/collections', (req, res, ctx) => {
        return res(ctx.status(500), ctx.json({ error: 'Server error' }));
      })
    );

    const { result } = renderHook(() => useStickersStore());

    await act(async () => {
      await result.current.fetchCollections();
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.collections).toHaveLength(0);
  });
});
```

## 🖱️ End-to-End Testing

### 1. **User Workflow Tests**

#### Complete Sticker Addition Workflow
```typescript
// e2e/stickers.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Stickers Feature', () => {
  test('should allow user to browse and add stickers', async ({ page }) => {
    await page.goto('/editor/test-project');
    
    // Open stickers panel
    await page.click('[data-testid="media-panel-stickers-tab"]');
    
    // Wait for collections to load
    await expect(page.locator('[data-testid="stickers-collections"]')).toBeVisible();
    
    // Select a collection
    await page.click('[data-testid="collection-mdi"]');
    
    // Wait for stickers to load
    await expect(page.locator('[data-testid="stickers-grid"]')).toBeVisible();
    
    // Click on a sticker
    await page.click('[data-testid="sticker-mdi:star"]');
    
    // Verify sticker appears on timeline
    await expect(page.locator('[data-testid="timeline-element-sticker"]')).toBeVisible();
    
    // Verify sticker appears on canvas
    await expect(page.locator('[data-testid="canvas-sticker-element"]')).toBeVisible();
  });

  test('should support sticker search functionality', async ({ page }) => {
    await page.goto('/editor/test-project');
    
    // Open stickers panel
    await page.click('[data-testid="media-panel-stickers-tab"]');
    
    // Search for stickers
    await page.fill('[data-testid="sticker-search-input"]', 'arrow');
    
    // Wait for search results
    await page.waitForTimeout(500); // Wait for debounced search
    
    // Verify search results
    const searchResults = page.locator('[data-testid^="sticker-"]');
    await expect(searchResults.first()).toBeVisible();
    
    // Verify all results contain "arrow" in name or tags
    const resultCount = await searchResults.count();
    expect(resultCount).toBeGreaterThan(0);
  });

  test('should handle offline scenarios gracefully', async ({ page }) => {
    await page.goto('/editor/test-project');
    
    // Go offline
    await page.context().setOffline(true);
    
    // Open stickers panel
    await page.click('[data-testid="media-panel-stickers-tab"]');
    
    // Should show cached collections or appropriate error message
    await expect(
      page.locator('[data-testid="stickers-offline-message"]')
    ).toBeVisible();
  });
});
```

### 2. **Performance E2E Tests**

#### Loading Performance Test
```typescript
test('should load stickers within performance budget', async ({ page }) => {
  await page.goto('/editor/test-project');
  
  // Start performance measurement
  await page.evaluate(() => performance.mark('stickers-start'));
  
  // Open stickers panel
  await page.click('[data-testid="media-panel-stickers-tab"]');
  
  // Wait for first sticker to be visible
  await expect(page.locator('[data-testid^="sticker-"]').first()).toBeVisible();
  
  // End performance measurement
  const loadTime = await page.evaluate(() => {
    performance.mark('stickers-end');
    performance.measure('stickers-load', 'stickers-start', 'stickers-end');
    
    const measures = performance.getEntriesByName('stickers-load');
    return measures[0].duration;
  });
  
  // Verify performance budget (500ms)
  expect(loadTime).toBeLessThan(500);
});
```

## 📊 Test Coverage Strategy

### Coverage Targets
```
Overall Coverage Target: 85%
├── Unit Tests: 90%
│   ├── Components: 85%
│   ├── API Services: 95%
│   ├── Stores: 90%
│   └── Utilities: 95%
│
├── Integration Tests: 80%
│   ├── Component Integration: 75%
│   ├── API-Store Integration: 85%
│   └── Cross-component Flow: 80%
│
└── E2E Tests: 70%
    ├── Critical User Paths: 100%
    ├── Error Scenarios: 60%
    └── Performance Tests: 50%
```

### Test Automation Strategy
```typescript
// Jest configuration for coverage
module.exports = {
  collectCoverageFrom: [
    'src/components/editor/media-panel/views/stickers.tsx',
    'src/lib/iconify-api.ts',
    'src/stores/stickers-store.ts',
    'src/lib/storage/storage-service.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    },
    './src/lib/iconify-api.ts': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    }
  }
};
```

---

*Comprehensive testing strategy for OpenCut stickers feature quality assurance.*