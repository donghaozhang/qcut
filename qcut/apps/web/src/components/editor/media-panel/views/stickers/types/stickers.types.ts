// Sticker-related type definitions
export interface StickerItemProps {
  icon: string;
  name: string;
  collection: string;
  onSelect: (iconId: string, name: string) => void;
  isSelected?: boolean;
}

export interface CollectionContentProps {
  collectionPrefix: string;
  collections: any[]; // IconSet[] from iconify-api
  onSelect: (iconId: string, name: string) => void;
}

export interface StickersViewProps {
  className?: string;
}

export interface RecentSticker {
  iconId: string;
  name: string;
}