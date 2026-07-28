"use client";

import type { PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

export const STICKER_GRID_COLUMN_COUNT = 3;
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
				gridTemplateColumns: `repeat(${STICKER_GRID_COLUMN_COUNT}, minmax(0, 1fr))`,
			}}
			data-testid={testId}
		>
			{children}
		</div>
	);
}
