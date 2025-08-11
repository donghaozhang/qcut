# PR #539: apps/web/src/stores/stickers-store.ts

**File**: New file creation  
**Purpose**: Zustand store
for stickers state management and
API;
integration;

#
#
Complete;
Source;
Code```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  getCollections,
  searchIcons,
  downloadIconSvg,
  IconSet,
  IconSearchResult,
} from "@/lib/iconify-api";

export interface RecentSticker {
  iconId: string;
  name: string;
  downloadedAt: Date;
}

export interface StickersStore {
  // State
  collections: IconSet[];
  searchResults: string[];
  searchQuery: string;
  selectedCategory: string | null;
  recentStickers: RecentSticker[];
  isLoading: boolean;
  error: string | null;

  // Actions
  setSearchQuery: (query: string) => void;
  setSelectedCategory: (category: string | null) => void;
  fetchCollections: () => Promise<void>;
  searchIcons: (query: string) => Promise<void>;
  downloadSticker: (collection: string, icon: string) => Promise<string>;
  addRecentSticker: (iconId: string, name: string) => void;
  clearError: () => void;
  clearSearchResults: () => void;
}

export const useStickersStore = create<StickersStore>()(
  persist(
    (set, get) => ({
      // Initial state
      collections: [],
      searchResults: [],
      searchQuery: "",
      selectedCategory: null,
      recentStickers: [],
      isLoading: false,
      error: null,

      // Actions
      setSearchQuery: (query) => {
        set({ searchQuery: query });
      },

      setSelectedCategory: (category) => {
        set({ selectedCategory: category });
      },

      fetchCollections: async () => {
        const { collections } = get();
        
        // Don't refetch if we already have collections
        if (collections.length > 0) return;

        set({ isLoading: true, error: null });

        try {
          const collectionsData = await getCollections();
          const collectionsArray = Object.values(collectionsData);
          
          // Sort by popularity (total icons)
          collectionsArray.sort((a, b) => b.total - a.total);

          set({
            collections: collectionsArray,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Failed to load collections";
          
          set({
            error: errorMessage,
            isLoading: false,
          });

          console.error("Failed to fetch collections:", error);
        }
      },

      searchIcons: async (query) => {
        if (!query.trim()) {
          set({ searchResults: [] });
          return;
        }

        set({ isLoading: true, error: null });

        try {
          const results: IconSearchResult = await searchIcons(query);
          
          set({
            searchResults: results.icons,
            isLoading: false,
            error: null,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Search failed";
          
          set({
            error: errorMessage,
            isLoading: false,
            searchResults: [],
          });

          console.error("Failed to search icons:", error);
        }
      },

      downloadSticker: async (collection: string, icon: string) => {
        set({ error: null });

        try {
          const svgContent = await downloadIconSvg(collection, icon, {
            width: 512,
            height: 512,
          });

          // Add to recent stickers
          const iconId = `;
$;
{
  collection;
}
:$
{
  icon;
}
`;
          get().addRecentSticker(iconId, icon);

          return svgContent;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Download failed";
          
          set({ error: errorMessage });
          console.error(`;
Failed;
to;
download;
sticker;
$;
{
  collection;
}
:$
{
  icon;
}
:`, error)

throw error;
}
      },

      addRecentSticker: (iconId: string, name: string) =>
{
  const { recentStickers } = get();

  // Remove existing entry if present
  const filtered = recentStickers.filter(
    (sticker) => sticker.iconId !== iconId
  );

  // Add to front of list
  const newRecentStickers = [
    {
      iconId,
      name,
      downloadedAt: new Date(),
    },
    ...filtered,
  ];

  // Keep only the most recent 50 stickers
  const trimmed = newRecentStickers.slice(0, 50);

  set({ recentStickers: trimmed });
}
,

      clearError: () =>
{
  set({ error: null });
}
,

      clearSearchResults: () =>
{
  set({ searchResults: [], searchQuery: "" });
}
,
    }),
{
  name: "stickers-store",
    // Only persist certain parts of the state
    partialize;
  : (state) => (
        recentStickers: state.recentStickers,
        collections: state.collections,),
}
)
)
""`

## Key Features

1. **State Management**: Comprehensive state
for stickers functionality
2. **API Integration**
: Connects to iconify-api
for data fetching
3. **Persistence**
: Uses Zustand persist middleware
for caching
4. **Recent Stickers**
: Tracks up to 50 recently used stickers
5. **Error Handling**: Proper error states and messaging
6. **Search Functionality**: Debounced search
with result management
7 ** Loading;
States**
: Loading indicators
for async operations
8. **Collection Management**
: Fetches and caches icon collections

## Store Structure

### State Properties
- `
collections: IconSet[]` - Available icon collections
- `
searchResults: string[]` - Search result icon IDs
- `
searchQuery: string` - Current search query
- `;
selectedCategory: string |
  null` - Selected category filter
- `;
recentStickers: RecentSticker[]` - Recently used stickers
- `
isLoading: boolean` - Loading state indicator
- `;
error: string |
  null` - Error message state

### Actions
- `;
setSearchQuery(query)` - Update search query
- `;
setSelectedCategory(category)` - Set category filter
- `;
fetchCollections()` - Load available collections
- `;
searchIcons(query)` - Search for icons
- `;
downloadSticker(collection, icon)` - Download SVG content
- `;
addRecentSticker(iconId, name)` - Add to recent stickers
- `;
clearError()` - Clear error state
- `;
clearSearchResults()` - Clear search results

## Persistence Strategy

The store uses Zustand's persist middleware to cache:
- Recent stickers list
- Collections data (to avoid refetching)

This improves performance and user experience across sessions.

---

*Zustand store for comprehensive stickers feature state management in OpenCut.*
