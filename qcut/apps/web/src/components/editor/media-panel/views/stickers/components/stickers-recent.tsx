"use client";

import { Clock } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StickerGrid } from "./sticker-grid";
import { StickerItem } from "./sticker-item";
import type { RecentSticker } from "../types/stickers.types";

interface StickersRecentProps {
	recentStickers: RecentSticker[];
	onDownload: (iconId: string, name: string) => void | Promise<void>;
	onSelect: (iconId: string, name: string) => void;
}

export function StickersRecent({
	recentStickers,
	onDownload,
	onSelect,
}: StickersRecentProps) {
	if (recentStickers.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-8 text-center">
				<Clock
					className="mb-2 h-8 w-8 text-muted-foreground"
					aria-hidden="true"
				/>
				<p className="text-sm text-muted-foreground">No recent stickers yet</p>
			</div>
		);
	}

	return (
		<TooltipProvider>
			<StickerGrid className="p-2">
				{recentStickers.map((sticker) => {
					const [collection, iconName] = sticker.iconId.split(":");
					return (
						<StickerItem
							key={sticker.iconId}
							icon={iconName}
							name={sticker.name}
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
