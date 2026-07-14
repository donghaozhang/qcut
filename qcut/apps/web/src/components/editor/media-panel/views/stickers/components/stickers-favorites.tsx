"use client";

import { Heart } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { findStickerCatalogItem } from "@/lib/stickers/sticker-catalog";
import { useAssetLibraryStore } from "@/stores/asset-library-store";
import { StickerItem } from "./sticker-item";

interface StickersFavoritesProps {
	onSelect: (iconId: string, name: string) => void;
}

export function StickersFavorites({ onSelect }: StickersFavoritesProps) {
	const favorites = useAssetLibraryStore((state) => state.favorites);
	const stickerIds = Object.keys(favorites)
		.filter((identity) => identity.startsWith("sticker:"))
		.map((identity) => identity.slice("sticker:".length));

	if (stickerIds.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-12 text-center">
				<Heart
					className="mb-3 size-8 text-muted-foreground"
					aria-hidden="true"
				/>
				<p className="text-sm font-medium">No favorite stickers</p>
				<p className="mt-1 text-xs text-muted-foreground">
					Use the heart on a sticker to keep it here.
				</p>
			</div>
		);
	}

	return (
		<TooltipProvider>
			<div className="grid grid-cols-[repeat(auto-fill,minmax(82px,1fr))] gap-2.5 p-3">
				{stickerIds.map((iconId) => {
					const separatorIndex = iconId.indexOf(":");
					if (separatorIndex <= 0) return null;
					const collection = iconId.slice(0, separatorIndex);
					const icon = iconId.slice(separatorIndex + 1);
					const catalogItem = findStickerCatalogItem({ collection, icon });
					return (
						<StickerItem
							key={iconId}
							icon={icon}
							name={catalogItem?.localizedName ?? icon}
							collection={collection}
							layout="catalog"
							onSelect={onSelect}
						/>
					);
				})}
			</div>
		</TooltipProvider>
	);
}
