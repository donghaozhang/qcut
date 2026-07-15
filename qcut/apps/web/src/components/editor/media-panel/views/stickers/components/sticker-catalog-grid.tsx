"use client";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { StickerCatalogItem } from "@/lib/stickers/sticker-catalog";
import { StickerItem } from "./sticker-item";
import { StickerGrid } from "./sticker-grid";

export function StickerCatalogGrid({
	items,
	onDownload,
	onSelect,
}: {
	items: StickerCatalogItem[];
	onDownload: (iconId: string, name: string) => void | Promise<void>;
	onSelect: (iconId: string, name: string) => void;
}) {
	return (
		<TooltipProvider>
			<StickerGrid testId="sticker-category-grid">
				{items.map((sticker) => (
					<StickerItem
						key={sticker.id}
						icon={sticker.icon}
						name={sticker.localizedName}
						collection={sticker.collection}
						layout="catalog"
						onDownload={onDownload}
						onSelect={onSelect}
					/>
				))}
			</StickerGrid>
		</TooltipProvider>
	);
}
