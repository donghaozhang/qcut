"use client";

import { Heart } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
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
			<div className="grid grid-cols-6 gap-2.5 p-3 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12">
				{stickerIds.map((iconId) => {
					const separatorIndex = iconId.indexOf(":");
					if (separatorIndex <= 0) return null;
					const collection = iconId.slice(0, separatorIndex);
					const icon = iconId.slice(separatorIndex + 1);
					return (
						<StickerItem
							key={iconId}
							icon={icon}
							name={icon}
							collection={collection}
							onSelect={onSelect}
						/>
					);
				})}
			</div>
		</TooltipProvider>
	);
}
