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
import { STICKERS_CONSTANTS } from "@/components/editor/media-panel/views/stickers/constants";
import type { RecentSticker } from "@/components/editor/media-panel/views/stickers/types/stickers.types";

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
  searchIcons: (query: string, signal?: AbortSignal) => Promise<void>;
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

        console.log('[STICKER DEBUG] fetchCollections called, current collections:', collections.length);

        // Don't refetch if we already have collections
        if (collections.length > 0) {
          console.log('[STICKER DEBUG] fetchCollections early return - already have collections');
          return;
        }

        console.log('[STICKER DEBUG] fetchCollections starting fetch...');
        set({ isLoading: true, error: null });

        try {
          const collectionsData = await getCollections();
          const collectionsArray = Object.values(collectionsData);

          console.log('[STICKER DEBUG] fetchCollections received collections:', collectionsArray.length);

          // Sort by popularity (total icons)
          collectionsArray.sort((a, b) => b.total - a.total);

          set({
            collections: collectionsArray,
            isLoading: false,
            error: null,
          });

          console.log('[STICKER DEBUG] fetchCollections completed successfully, stored:', collectionsArray.length);
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to load collections";

          console.log('[STICKER DEBUG] fetchCollections failed:', error);

          set({
            error: errorMessage,
            isLoading: false,
          });
        }
      },

      searchIcons: async (query, signal) => {
        console.log('[STICKER DEBUG] searchIcons called with query:', query);

        if (!query.trim()) {
          console.log('[STICKER DEBUG] searchIcons early return - empty query');
          set({ searchResults: [] });
          return;
        }

        console.log('[STICKER DEBUG] searchIcons starting search...');
        set({ isLoading: true, error: null });

        try {
          const results: IconSearchResult = await searchIcons(
            query,
            100,
            0,
            signal
          );

          console.log('[STICKER DEBUG] searchIcons received results:', results.icons.length);

          set({
            searchResults: results.icons,
            isLoading: false,
            error: null,
          });

          console.log('[STICKER DEBUG] searchIcons completed successfully');
        } catch (error) {
          // Don't set error state for aborted requests
          if (error instanceof Error && error.name === "AbortError") {
            console.log('[STICKER DEBUG] searchIcons aborted');
            set({ isLoading: false });
            return;
          }

          const errorMessage =
            error instanceof Error ? error.message : "Search failed";

          console.log('[STICKER DEBUG] searchIcons failed:', error);

          set({
            error: errorMessage,
            isLoading: false,
            searchResults: [],
          });
        }
      },

      downloadSticker: async (collection: string, icon: string) => {
        console.log('[STICKER DEBUG] downloadSticker called:', collection, icon);
        set({ error: null });

        try {
          const svgContent = await downloadIconSvg(collection, icon, {
            // No color specified to maintain transparency
            width: STICKERS_CONSTANTS.ICON_DOWNLOAD_SIZE,
            height: STICKERS_CONSTANTS.ICON_DOWNLOAD_SIZE,
          });

          // Create a blob from the SVG content
          const svgBlob = createSvgBlob(svgContent);

          // Add to recent stickers
          const iconId = `${collection}:${icon}`;
          console.log('[STICKER DEBUG] downloadSticker adding to recent:', iconId);
          get().addRecentSticker(iconId, icon);

          console.log('[STICKER DEBUG] downloadSticker completed successfully');
          return svgBlob;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Download failed";

          console.log('[STICKER DEBUG] downloadSticker failed:', error);

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
            downloadedAt: Date.now(),
          },
          ...filtered,
        ];

        // Keep only the most recent stickers
        const trimmed = newRecentStickers.slice(
          0,
          STICKERS_CONSTANTS.MAX_RECENT_STICKERS
        );

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
