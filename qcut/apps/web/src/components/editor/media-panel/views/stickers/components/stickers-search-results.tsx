"use client";

import { Loader2, Search } from "lucide-react";
import { StickerItem } from "./sticker-item";

interface StickersSearchResultsProps {
  searchResults: string[];
  searchQuery: string;
  isSearching: boolean;
  onSelect: (iconId: string, name: string) => void;
}

export function StickersSearchResults({
  searchResults,
  searchQuery,
  isSearching,
  onSelect,
}: StickersSearchResultsProps) {
  if (isSearching) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (searchResults.length === 0 && searchQuery) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Search className="mb-4 h-12 w-12 text-muted-foreground" />
        <p className="text-lg font-medium">No icons found</p>
        <p className="text-muted-foreground">
          Try searching with different keywords
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-6 gap-2 p-4 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12">
      {searchResults.map((result) => {
        const [collection, iconName] = result.split(":");
        return (
          <StickerItem
            key={result}
            icon={iconName}
            name={iconName}
            collection={collection}
            onSelect={onSelect}
          />
        );
      })}
    </div>
  );
}