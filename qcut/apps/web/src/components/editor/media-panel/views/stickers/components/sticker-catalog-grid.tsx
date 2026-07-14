"use client";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { StickerCatalogItem } from "@/lib/stickers/sticker-catalog";
import { StickerItem } from "./sticker-item";

export function StickerCatalogGrid({
	items,
	onSelect,
}: {
	items: StickerCatalogItem[];
	onSelect: (iconId: string, name: string) => void;
}) {
	return (
		<TooltipProvider>
			<div
				className="grid grid-cols-[repeat(auto-fill,minmax(82px,1fr))] gap-2.5"
				data-testid="sticker-category-grid"
			>
				{items.map((sticker) => (
					<StickerItem
						key={sticker.id}
						icon={sticker.icon}
						name={sticker.localizedName}
						collection={sticker.collection}
						layout="catalog"
						onSelect={onSelect}
					/>
				))}
			</div>
		</TooltipProvider>
	);
}
