import type { ReactNode, UIEvent } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import type { TransitionPreset } from "./transition-preset-types";

const ITEM_HEIGHT = 128;
const MIN_ITEM_WIDTH = 88;
const GAP = 6;
const OVERSCAN_ROWS = 2;

export interface VirtualGridWindow {
	columns: number;
	startIndex: number;
	endIndex: number;
	startOffset: number;
	totalHeight: number;
}

export function calculateVirtualGridWindow({
	itemCount,
	containerWidth,
	viewportHeight,
	scrollTop,
}: {
	itemCount: number;
	containerWidth: number;
	viewportHeight: number;
	scrollTop: number;
}): VirtualGridWindow {
	const columns = Math.max(
		1,
		Math.floor((Math.max(0, containerWidth) + GAP) / (MIN_ITEM_WIDTH + GAP))
	);
	const totalRows = Math.ceil(itemCount / columns);
	const rowHeight = ITEM_HEIGHT + GAP;
	const firstVisibleRow = Math.floor(Math.max(0, scrollTop) / rowHeight);
	const lastVisibleRow = Math.ceil(
		(Math.max(0, scrollTop) + Math.max(0, viewportHeight)) / rowHeight
	);
	const startRow = Math.max(0, firstVisibleRow - OVERSCAN_ROWS);
	const endRow = Math.min(totalRows, lastVisibleRow + OVERSCAN_ROWS);
	return {
		columns,
		startIndex: startRow * columns,
		endIndex: Math.min(itemCount, endRow * columns),
		startOffset: startRow * rowHeight,
		totalHeight:
			totalRows === 0 ? 0 : totalRows * ITEM_HEIGHT + (totalRows - 1) * GAP,
	};
}

export function TransitionVirtualizedGrid({
	presets,
	renderPreset,
}: {
	presets: TransitionPreset[];
	renderPreset: ({ preset }: { preset: TransitionPreset }) => ReactNode;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [metrics, setMetrics] = useState({
		containerWidth: 0,
		viewportHeight: 0,
		scrollTop: 0,
	});
	const supportsVirtualization =
		typeof ResizeObserver !== "undefined" && import.meta.env.MODE !== "test";

	useLayoutEffect(() => {
		const element = containerRef.current;
		if (!element || !supportsVirtualization) return;
		const updateSize = () =>
			setMetrics((current) => ({
				...current,
				containerWidth: Math.max(0, element.clientWidth - 16),
				viewportHeight: element.clientHeight,
			}));
		updateSize();
		const observer = new ResizeObserver(updateSize);
		observer.observe(element);
		return () => observer.disconnect();
	}, [supportsVirtualization]);

	const handleScroll = ({ currentTarget }: UIEvent<HTMLDivElement>): void => {
		setMetrics((current) => ({
			...current,
			scrollTop: currentTarget.scrollTop,
		}));
	};

	if (!supportsVirtualization) {
		return (
			<div className="min-h-0 flex-1 overflow-y-auto p-2">
				<div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-1.5">
					{presets.map((preset) => (
						<div key={preset.id}>{renderPreset({ preset })}</div>
					))}
				</div>
			</div>
		);
	}

	const virtualWindow = calculateVirtualGridWindow({
		itemCount: presets.length,
		...metrics,
	});
	const visiblePresets = presets.slice(
		virtualWindow.startIndex,
		virtualWindow.endIndex
	);
	return (
		<div
			ref={containerRef}
			className="min-h-0 flex-1 overflow-y-auto p-2"
			onScroll={handleScroll}
			data-testid="transition-virtualized-grid"
		>
			<div className="relative" style={{ height: virtualWindow.totalHeight }}>
				<div
					className="absolute inset-x-0 grid gap-1.5"
					style={{
						gridTemplateColumns: `repeat(${virtualWindow.columns}, minmax(0, 1fr))`,
						gridAutoRows: ITEM_HEIGHT,
						transform: `translateY(${virtualWindow.startOffset}px)`,
					}}
				>
					{visiblePresets.map((preset) => (
						<div key={preset.id}>{renderPreset({ preset })}</div>
					))}
				</div>
			</div>
		</div>
	);
}
