"use client";

import { Loader2, Search } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { findStickerCatalogItem } from "@/lib/stickers/sticker-catalog";
import { StickerGrid } from "./sticker-grid";
import { StickerItem } from "./sticker-item";

interface StickersSearchResultsProps {
	searchResults: string[];
	searchQuery: string;
	isSearching: boolean;
	onDownload: (iconId: string, name: string) => void | Promise<void>;
	onSelect: (iconId: string, name: string) => void;
}

export function StickersSearchResults({
	searchResults,
	searchQuery,
	isSearching,
	onDownload,
	onSelect,
}: StickersSearchResultsProps) {
	if (isSearching && searchResults.length === 0) {
		return (
			<div className="flex items-center justify-center py-12">
				<Loader2 className="h-8 w-8 animate-spin text-muted-foreground">
					<title>Searching stickers</title>
				</Loader2>
			</div>
		);
	}

	if (searchResults.length === 0 && searchQuery) {
		return (
			<div className="flex flex-col items-center justify-center py-12 text-center">
				<Search className="mb-4 h-12 w-12 text-muted-foreground">
					<title>No sticker results</title>
				</Search>
				<p className="text-lg font-medium">No icons found</p>
				<p className="text-muted-foreground">
					Try searching with different keywords
				</p>
			</div>
		);
	}

	return (
		<TooltipProvider>
			<StickerGrid className="p-2">
				{searchResults.map((result) => {
					const [collection, iconName] = result.split(":");
					if (!collection || !iconName) {
						return null; // skip malformed entries
					}
					const catalogItem = findStickerCatalogItem({
						collection,
						icon: iconName,
					});
					return (
						<StickerItem
							key={result}
							icon={iconName}
							name={catalogItem?.localizedName ?? iconName}
							collection={collection}
							layout="catalog"
							onDownload={onDownload}
							onSelect={onSelect}
						/>
					);
				})}
			</StickerGrid>
		</TooltipProvider>
	);
}
