"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getCollection, POPULAR_COLLECTIONS } from "@/lib/iconify-api";
import { debugLog } from "@/lib/debug-config";
import { StickerItem } from "./sticker-item";
import type { CollectionContentProps } from "../types/stickers.types";

// Fallback icons for when API calls fail or return no data
const FALLBACK_ICONS: Record<string, string[]> = {
  "heroicons": ["home", "user", "cog", "heart", "star", "check"],
  "tabler": ["home", "user", "settings", "heart", "star", "check"],
  "material-symbols": [
    "home",
    "person",
    "settings",
    "favorite",
    "star",
    "check",
  ],
  "simple-icons": [
    "github",
    "google",
    "facebook",
    "twitter",
    "instagram",
    "youtube",
  ],
};

export function StickersCollection({
  collectionPrefix,
  collections,
  onSelect,
}: CollectionContentProps) {
  const [collectionIcons, setCollectionIcons] = useState<string[]>([]);
  const [loadingCollection, setLoadingCollection] = useState(true);

  useEffect(() => {
    const fetchCollectionIcons = async () => {
      setLoadingCollection(true);

      try {
        // Try to get sample icons from POPULAR_COLLECTIONS first
        const popularCollection = POPULAR_COLLECTIONS.find(
          (c) => c.prefix === collectionPrefix
        );

        if (popularCollection?.samples) {
          setCollectionIcons(popularCollection.samples);
          return;
        }

        // Try to fetch actual icons from the API
        let icons: string[] = [];

        try {
          const collectionInfo = await getCollection(collectionPrefix);

          // Try uncategorized first
          if (collectionInfo.uncategorized && collectionInfo.uncategorized.length > 0) {
            icons = collectionInfo.uncategorized;
          }
          // Then try categories
          else if (collectionInfo.categories) {
            const categoryArrays = Object.values(collectionInfo.categories);
            if (categoryArrays.length > 0) {
              // Flatten all categories and take first 30
              icons = categoryArrays.flat().slice(0, 30);
            }
          }
        } catch (apiError) {
          debugLog(
            `[StickersCollection] Failed to fetch collection ${collectionPrefix}:`,
            apiError
          );
        }

        // Use fallback if no icons found
        if (icons.length === 0) {
          icons = FALLBACK_ICONS[collectionPrefix] || [];
        }

        setCollectionIcons(icons.slice(0, 20)); // Limit for performance
      } catch (error) {
        debugLog("[StickersCollection] Unexpected error:", error);
        setCollectionIcons([]);
      } finally {
        setLoadingCollection(false);
      }
    };

    fetchCollectionIcons();
  }, [collectionPrefix]);

  if (loadingCollection) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (collectionIcons.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <AlertCircle className="mb-2 h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No icons available for this collection
        </p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="grid grid-cols-6 gap-2 p-4 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12">
        {collectionIcons.map((iconName) => (
          <StickerItem
            key={`${collectionPrefix}:${iconName}`}
            icon={iconName}
            name={iconName}
            collection={collectionPrefix}
            onSelect={onSelect}
          />
        ))}
      </div>
    </TooltipProvider>
  );
}
