"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { getCollection, POPULAR_COLLECTIONS } from "@/lib/iconify-api";
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
        } else {
          // Try to fetch actual icons from the API
          try {
            const collectionInfo = await getCollection(collectionPrefix);

            // Get icons from the collection
            let icons: string[] = [];

            // Try uncategorized first
            if (
              collectionInfo.uncategorized &&
              collectionInfo.uncategorized.length > 0
            ) {
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

            // If still no icons, try a fallback based on collection prefix
            if (icons.length === 0) {
              icons = FALLBACK_ICONS[collectionPrefix] || [];
            }

            setCollectionIcons(icons.slice(0, 20)); // Limit for performance
          } catch (error) {
            // Use fallback icons on error
            setCollectionIcons(FALLBACK_ICONS[collectionPrefix] || []);
          }
        }
      } catch (error) {
        setCollectionIcons([]);
      } finally {
        setLoadingCollection(false);
      }
    };

    fetchCollectionIcons();
  }, [collectionPrefix, collections]);

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
  );
}
