// Sticker-related type definitions
import type { IconSet } from "@/lib/stickers/iconify-api";

export type StickerItemProps = {
	icon: string;
	name: string;
	collection: string;
	onSelect: (iconId: string, name: string) => void;
	onDownload?: (iconId: string, name: string) => void | Promise<void>;
	isSelected?: boolean;
	layout?: "compact" | "catalog";
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
