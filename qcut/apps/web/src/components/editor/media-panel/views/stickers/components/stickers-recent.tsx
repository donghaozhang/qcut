"use client";

import { Clock } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StickerItem } from "./sticker-item";
import type { RecentSticker } from "../types/stickers.types";

interface StickersRecentProps {
	recentStickers: RecentSticker[];
	onSelect: (iconId: string, name: string) => void;
}

export function StickersRecent({
	recentStickers,
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
			<div className="grid grid-cols-[repeat(auto-fill,minmax(82px,1fr))] gap-2.5 p-3">
				{recentStickers.map((sticker) => {
					const [collection, iconName] = sticker.iconId.split(":");
					return (
						<StickerItem
							key={sticker.iconId}
							icon={iconName}
							name={sticker.name}
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
