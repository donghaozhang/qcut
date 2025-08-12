// Sticker-related type definitions
import type { IconSet } from "@/lib/iconify-api";

export interface StickerItemProps {
  icon: string;
  name: string;
  collection: string;
  onSelect: (iconId: string, name: string) => void;
  isSelected?: boolean;
}

export interface CollectionContentProps {
  collectionPrefix: string;
  collections: IconSet[];
  onSelect: (iconId: string, name: string) => void;
}

export interface StickersViewProps {
  className?: string;
}

export interface RecentSticker {
  iconId: string;
  name: string;
}