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
        if (collections.length > 0) {
          console.log("[StickersStore] Collections already loaded:", collections.length);
          return;
        }

        console.log("[StickersStore] Starting to fetch collections...");
        set({ isLoading: true, error: null });

        try {
          const collectionsData = await getCollections();
          console.log("[StickersStore] Raw collections data:", collectionsData);
          const collectionsArray = Object.values(collectionsData);
          console.log("[StickersStore] Collections array:", collectionsArray.length, "items");

          // Sort by popularity (total icons)
          collectionsArray.sort((a, b) => b.total - a.total);

          set({
            collections: collectionsArray,
            isLoading: false,
            error: null,
          });
          console.log("[StickersStore] Collections stored successfully");
          console.log("[StickersStore] First 10 collection prefixes:", collectionsArray.slice(0, 10).map(c => c.prefix));
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to load collections";

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
          const errorMessage =
            error instanceof Error ? error.message : "Search failed";

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
          const iconId = `${collection}:${icon}`;
          get().addRecentSticker(iconId, icon);

          return svgContent;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Download failed";

          set({ error: errorMessage });
          console.error(
            `Failed to download sticker ${collection}:${icon}:`,
            error
          );

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
