"use client";

import type { PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

export const STICKER_GRID_MIN_ITEM_WIDTH = 60;
export const STICKER_GRID_GAP = 6;

export function StickerGrid({
	children,
	className,
	testId = "sticker-grid",
}: PropsWithChildren<{ className?: string; testId?: string }>) {
	return (
		<div
			className={cn("grid", className)}
			style={{
				gap: STICKER_GRID_GAP,
				gridTemplateColumns: `repeat(auto-fill, minmax(${STICKER_GRID_MIN_ITEM_WIDTH}px, 1fr))`,
			}}
			data-testid={testId}
		>
			{children}
		</div>
	);
}
