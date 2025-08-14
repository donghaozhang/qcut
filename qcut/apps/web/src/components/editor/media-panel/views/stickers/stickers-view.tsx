"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Clock, Grid3X3, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useDebounce } from "@/hooks/use-debounce";
import { useStickersStore } from "@/stores/stickers-store";
import { POPULAR_COLLECTIONS } from "@/lib/iconify-api";
import { StickersSearch } from "./components/stickers-search";
import { StickersSearchResults } from "./components/stickers-search-results";
import { StickersRecent } from "./components/stickers-recent";
import { StickersCollection } from "./components/stickers-collection";
import { useStickerSelect } from "./hooks/use-sticker-select";
import { toast } from "sonner";

export function StickersView() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCollection, setSelectedCollection] = useState<string>("all");
  const [isSearching, setIsSearching] = useState(false);

  const {
    collections,
    searchResults,
    recentStickers,
    isLoading,
    error,
    fetchCollections,
    searchIcons,
  } = useStickersStore();

  const { handleStickerSelect, cleanupObjectUrls } = useStickerSelect();

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      cleanupObjectUrls();
    };
  }, [cleanupObjectUrls]);

  // Load collections on mount
  useEffect(() => {
    if (collections.length === 0) {
      fetchCollections();
    }
  }, [collections.length, fetchCollections]);

  // Debounced search query
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Search functionality with debounced query
  useEffect(() => {
    if (!debouncedSearchQuery.trim()) {
      return;
    }

    const abortController = new AbortController();
    const performSearch = async () => {
      setIsSearching(true);
      try {
        await searchIcons(debouncedSearchQuery, abortController.signal);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        toast.error("Failed to search icons");
      } finally {
        setIsSearching(false);
      }
    };

    performSearch();
    return () => abortController.abort();
  }, [debouncedSearchQuery, searchIcons]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="mb-4 h-12 w-12 text-destructive" />
        <p className="text-lg font-medium">Failed to load stickers</p>
        <p className="text-muted-foreground">{error}</p>
        <Button
          onClick={() => fetchCollections()}
          className="mt-4"
          variant="outline"
        >
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Search Bar */}
      <StickersSearch
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {searchQuery ? (
          <ScrollArea className="h-full">
            <StickersSearchResults
              searchResults={searchResults}
              searchQuery={searchQuery}
              isSearching={isSearching}
              onSelect={handleStickerSelect}
            />
          </ScrollArea>
        ) : (
          <Tabs
            value={selectedCollection}
            onValueChange={setSelectedCollection}
            className="h-full"
          >
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="recent" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Recent
              </TabsTrigger>
              <TabsTrigger value="all" className="flex items-center gap-2">
                <Grid3X3 className="h-4 w-4" />
                All
              </TabsTrigger>
              <TabsTrigger
                value="simple-icons"
                className="flex items-center gap-2"
              >
                <Hash className="h-4 w-4" />
                Brands
              </TabsTrigger>
              <TabsTrigger value="tabler" className="flex items-center gap-2">
                <Hash className="h-4 w-4" />
                Tabler
              </TabsTrigger>
            </TabsList>

            <TabsContent value="recent" className="mt-0 h-full">
              <ScrollArea className="h-full">
                <StickersRecent
                  recentStickers={recentStickers}
                  onSelect={handleStickerSelect}
                />
              </ScrollArea>
            </TabsContent>

            <TabsContent value="all" className="mt-0 h-full">
              <ScrollArea className="h-full">
                <div className="p-4 space-y-6">
                  {POPULAR_COLLECTIONS.map((collection) => (
                    <div key={collection.prefix}>
                      <div className="mb-3 flex items-center gap-2">
                        <h3 className="text-lg font-semibold">
                          {collection.name}
                        </h3>
                        <Badge variant="secondary">{collection.prefix}</Badge>
                      </div>
                      <StickersCollection
                        collectionPrefix={collection.prefix}
                        collections={collections}
                        onSelect={handleStickerSelect}
                      />
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="simple-icons" className="mt-0 h-full">
              <ScrollArea className="h-full">
                <StickersCollection
                  collectionPrefix="simple-icons"
                  collections={collections}
                  onSelect={handleStickerSelect}
                />
              </ScrollArea>
            </TabsContent>

            <TabsContent value="tabler" className="mt-0 h-full">
              <ScrollArea className="h-full">
                <StickersCollection
                  collectionPrefix="tabler"
                  collections={collections}
                  onSelect={handleStickerSelect}
                />
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Footer */}
      <div className="border-t p-2 text-center text-xs text-muted-foreground">
        Icons provided by{" "}
        <a
          href="https://iconify.design"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          Iconify
        </a>
      </div>
    </div>
  );
}
