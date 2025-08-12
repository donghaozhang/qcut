import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  getCollections,
  searchIcons,
  downloadIconSvg,
  createSvgBlob,
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
  downloadSticker: (collection: string, icon: string) => Promise<Blob>;
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
        if (collections.length > 0) {
          return;
        }

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
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to load collections";

          set({
            error: errorMessage,
            isLoading: false,
          });
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
          const errorMessage =
            error instanceof Error ? error.message : "Search failed";

          set({
            error: errorMessage,
            isLoading: false,
            searchResults: [],
          });
        }
      },

      downloadSticker: async (collection: string, icon: string) => {
        set({ error: null });

        try {
          const svgContent = await downloadIconSvg(collection, icon, {
            // No color specified to maintain transparency
            width: 512,
            height: 512,
          });

          // Create a blob from the SVG content
          const svgBlob = createSvgBlob(svgContent);

          // Add to recent stickers
          const iconId = `${collection}:${icon}`;
          get().addRecentSticker(iconId, icon);

          return svgBlob;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Download failed";

          set({ error: errorMessage });

          throw error;
        }
      },

      addRecentSticker: (iconId: string, name: string) => {
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
      },

      clearError: () => {
        set({ error: null });
      },

      clearSearchResults: () => {
        set({ searchResults: [], searchQuery: "" });
      },
    }),
    {
      name: "stickers-store",
      // Only persist certain parts of the state
      partialize: (state) => ({
        recentStickers: state.recentStickers,
        collections: state.collections,
      }),
    }
  )
);