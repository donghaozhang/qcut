"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { debugError } from "@/lib/debug/debug-config";
import { cn } from "@/lib/utils";

const SHAPE_VIEWBOX = 320;

/**
 * Basic vector shapes, mirroring Jianying's 图形库. Each entry renders the
 * same SVG for the grid preview and the inserted timeline sticker, so what
 * the user clicks is exactly what lands on the canvas.
 */
export interface ShapeStickerDefinition {
	id: string;
	label: string;
	/** Inner SVG markup, stroked with the given color. */
	body: ({ color }: { color: string }) => string;
}

function strokeAttrs({ color }: { color: string }): string {
	return `stroke="${color}" stroke-width="10" fill="none" stroke-linejoin="round" stroke-linecap="round"`;
}

export const SHAPE_STICKERS: readonly ShapeStickerDefinition[] = [
	{
		id: "square",
		label: "正方形",
		body: ({ color }) =>
			`<rect x="30" y="30" width="260" height="260" ${strokeAttrs({ color })} />`,
	},
	{
		id: "circle",
		label: "圆形",
		body: ({ color }) =>
			`<circle cx="160" cy="160" r="130" ${strokeAttrs({ color })} />`,
	},
	{
		id: "triangle",
		label: "三角形",
		body: ({ color }) =>
			`<polygon points="160,40 290,280 30,280" ${strokeAttrs({ color })} />`,
	},
	{
		id: "parallelogram",
		label: "平行四边形",
		body: ({ color }) =>
			`<polygon points="90,65 290,65 230,255 30,255" ${strokeAttrs({ color })} />`,
	},
	{
		id: "trapezoid",
		label: "梯形",
		body: ({ color }) =>
			`<polygon points="100,70 220,70 290,250 30,250" ${strokeAttrs({ color })} />`,
	},
	{
		id: "line",
		label: "直线",
		body: ({ color }) =>
			`<line x1="20" y1="160" x2="300" y2="160" ${strokeAttrs({ color })} />`,
	},
	{
		id: "arrow",
		label: "箭头",
		body: ({ color }) =>
			`<line x1="20" y1="160" x2="255" y2="160" ${strokeAttrs({ color })} />` +
			`<polygon points="245,120 305,160 245,200" fill="${color}" stroke="none" />`,
	},
];

export function buildShapeStickerSvg({
	color,
	shape,
}: {
	color: string;
	shape: ShapeStickerDefinition;
}): string {
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SHAPE_VIEWBOX} ${SHAPE_VIEWBOX}">` +
		shape.body({ color }) +
		"</svg>"
	);
}

function shapePreviewUrl({ shape }: { shape: ShapeStickerDefinition }): string {
	// Preview matches the inserted sticker: white strokes on the dark tile.
	return `data:image/svg+xml,${encodeURIComponent(
		buildShapeStickerSvg({ color: "#E7E9EC", shape })
	)}`;
}

export function buildShapeStickerFile({
	shape,
}: {
	shape: ShapeStickerDefinition;
}): File {
	const svg = buildShapeStickerSvg({ color: "#FFFFFF", shape });
	return new File([svg], `shape-${shape.id}.svg`, { type: "image/svg+xml" });
}

export function StickerShapeLibrary({
	onSelect,
}: {
	onSelect: ({ file }: { file: File }) => Promise<void>;
}) {
	const [addingShapeId, setAddingShapeId] = useState<string | null>(null);
	const [selectError, setSelectError] = useState<string | null>(null);

	const handleSelect = async ({ shape }: { shape: ShapeStickerDefinition }) => {
		if (addingShapeId) return;
		setAddingShapeId(shape.id);
		setSelectError(null);
		try {
			await onSelect({ file: buildShapeStickerFile({ shape }) });
		} catch (error) {
			debugError("[ShapeLibrary] Failed to add shape", error);
			setSelectError("无法添加到时间线，请重试");
		} finally {
			setAddingShapeId(null);
		}
	};

	return (
		<div
			className="flex h-full min-h-0 flex-col"
			data-testid="sticker-shape-library"
		>
			<div className="flex h-9 shrink-0 items-center justify-between border-b border-border/40 px-3">
				<span className="text-[11px] font-medium">图形库</span>
				<span className="text-[10px] tabular-nums text-muted-foreground">
					{SHAPE_STICKERS.length} 个图形
				</span>
			</div>
			{selectError && (
				<p className="px-3 pt-2 text-[10px] text-destructive" role="alert">
					{selectError}
				</p>
			)}
			<div className="min-h-0 flex-1 overflow-y-auto p-2">
				<div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2">
					{SHAPE_STICKERS.map((shape) => {
						const isAdding = addingShapeId === shape.id;
						return (
							<button
								key={shape.id}
								type="button"
								className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg bg-foreground/[0.06] transition-colors hover:bg-foreground/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed"
								disabled={addingShapeId !== null}
								title={shape.label}
								aria-label={`添加${shape.label}到时间线`}
								data-testid="sticker-shape-item"
								onClick={() => handleSelect({ shape })}
								onKeyDown={(event) => {
									if (event.key === " ") {
										event.preventDefault();
										handleSelect({ shape });
									}
								}}
							>
								<img
									src={shapePreviewUrl({ shape })}
									alt={shape.label}
									className={cn("size-full p-4", isAdding && "opacity-50")}
									draggable={false}
								/>
								{isAdding && (
									<span className="absolute inset-0 flex items-center justify-center bg-background/35">
										<Loader2 className="size-6 animate-spin">
											<title>正在加入时间线</title>
										</Loader2>
									</span>
								)}
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
}
