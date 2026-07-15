"use client";

import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

export const WIDE_STICKER_GRID_MIN_WIDTH = 420;

export function stickerGridColumnCount({ width }: { width: number }): 3 | 5 {
	return width >= WIDE_STICKER_GRID_MIN_WIDTH ? 5 : 3;
}

export function StickerGrid({
	children,
	className,
	testId = "sticker-grid",
}: PropsWithChildren<{ className?: string; testId?: string }>) {
	const gridRef = useRef<HTMLDivElement>(null);
	const [columnCount, setColumnCount] = useState<3 | 5>(3);

	useEffect(() => {
		const grid = gridRef.current;
		if (!grid || typeof ResizeObserver === "undefined") return;
		const updateColumns = ({ width }: { width: number }) => {
			setColumnCount(stickerGridColumnCount({ width }));
		};
		updateColumns({ width: grid.getBoundingClientRect().width });
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry) updateColumns({ width: entry.contentRect.width });
		});
		observer.observe(grid);
		return () => observer.disconnect();
	}, []);

	return (
		<div
			ref={gridRef}
			className={cn("grid gap-2", className)}
			style={{
				gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
			}}
			data-column-count={columnCount}
			data-testid={testId}
		>
			{children}
		</div>
	);
}
