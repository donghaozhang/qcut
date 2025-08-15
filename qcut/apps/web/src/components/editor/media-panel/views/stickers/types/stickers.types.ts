// Sticker-related type definitions
import type { IconSet } from "@/lib/iconify-api";

export type StickerItemProps = {
  icon: string;
  name: string;
  collection: string;
  onSelect: (iconId: string, name: string) => void;
  isSelected?: boolean;
};

export type CollectionContentProps = {
  collectionPrefix: string;
  onSelect: (iconId: string, name: string) => void;
};

export type StickersViewProps = {
  className?: string;
};

export type RecentSticker = {
  iconId: string;
  name: string;
  downloadedAt: number; // ms since epoch
};
