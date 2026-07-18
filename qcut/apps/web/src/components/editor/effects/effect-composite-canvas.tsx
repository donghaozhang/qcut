import type {
	EffectCompositeRenderStage,
	EffectRenderProgram,
} from "@qcut/editor-core";
import { useEffect, useRef } from "react";

type CompositeSource = HTMLCanvasElement | HTMLImageElement | HTMLVideoElement;

interface Tile {
	x: number;
	y: number;
	width: number;
	height: number;
	mirror: boolean;
}

function sourceDimensions({ source }: { source: CompositeSource }) {
	if (source instanceof HTMLVideoElement) {
		return { width: source.videoWidth, height: source.videoHeight };
	}
	if (source instanceof HTMLImageElement) {
		return { width: source.naturalWidth, height: source.naturalHeight };
	}
	return { width: source.width, height: source.height };
}

function sourceReady({ source }: { source: CompositeSource }): boolean {
	if (source instanceof HTMLVideoElement) return source.readyState >= 2;
	if (source instanceof HTMLImageElement) return source.complete;
	return source.width > 0 && source.height > 0;
}

function compositeTiles({
	stage,
	width,
	height,
}: {
	stage: EffectCompositeRenderStage;
	width: number;
	height: number;
}): Tile[] {
	const gap = Math.max(0, Math.round(Math.min(width, height) * stage.gap));
	if (stage.layout === "split-horizontal") {
		const tileHeight = Math.max(1, Math.floor((height - gap) / 2));
		return [
			{ x: 0, y: 0, width, height: tileHeight, mirror: false },
			{ x: 0, y: tileHeight + gap, width, height: tileHeight, mirror: false },
		];
	}
	if (stage.layout === "grid") {
		const tileWidth = Math.max(1, Math.floor((width - gap) / 2));
		const tileHeight = Math.max(1, Math.floor((height - gap) / 2));
		return [
			{ x: 0, y: 0, width: tileWidth, height: tileHeight, mirror: false },
			{
				x: tileWidth + gap,
				y: 0,
				width: tileWidth,
				height: tileHeight,
				mirror: false,
			},
			{
				x: 0,
				y: tileHeight + gap,
				width: tileWidth,
				height: tileHeight,
				mirror: false,
			},
			{
				x: tileWidth + gap,
				y: tileHeight + gap,
				width: tileWidth,
				height: tileHeight,
				mirror: false,
			},
		];
	}
	const tileWidth = Math.max(1, Math.floor((width - gap) / 2));
	return [
		{ x: 0, y: 0, width: tileWidth, height, mirror: false },
		{
			x: tileWidth + gap,
			y: 0,
			width: tileWidth,
			height,
			mirror: stage.layout === "mirror",
		},
	];
}

function drawSourceTile({
	context,
	fitMode,
	source,
	tile,
}: {
	context: CanvasRenderingContext2D;
	fitMode: "contain" | "cover" | "fill";
	source: CompositeSource;
	tile: Tile;
}) {
	const dimensions = sourceDimensions({ source });
	if (dimensions.width <= 0 || dimensions.height <= 0) return;
	let drawWidth = tile.width;
	let drawHeight = tile.height;
	if (fitMode !== "fill") {
		const scale =
			fitMode === "cover"
				? Math.max(
						tile.width / dimensions.width,
						tile.height / dimensions.height
					)
				: Math.min(
						tile.width / dimensions.width,
						tile.height / dimensions.height
					);
		drawWidth = dimensions.width * scale;
		drawHeight = dimensions.height * scale;
	}
	context.save();
	context.beginPath();
	context.rect(tile.x, tile.y, tile.width, tile.height);
	context.clip();
	if (tile.mirror) {
		context.translate(tile.x * 2 + tile.width, 0);
		context.scale(-1, 1);
	}
	context.drawImage(
		source,
		tile.x + (tile.width - drawWidth) / 2,
		tile.y + (tile.height - drawHeight) / 2,
		drawWidth,
		drawHeight
	);
	context.restore();
}

function firstCompositeStage({
	program,
}: {
	program?: EffectRenderProgram;
}): EffectCompositeRenderStage | undefined {
	return program?.stages.find(
		(stage): stage is EffectCompositeRenderStage => stage.kind === "composite"
	);
}

export function EffectCompositeCanvas({
	program,
	sourceSelector,
	fitMode,
}: {
	program?: EffectRenderProgram;
	sourceSelector: string;
	fitMode: "contain" | "cover" | "fill";
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const stage = firstCompositeStage({ program });

	useEffect(() => {
		const canvas = canvasRef.current;
		const parent = canvas?.parentElement;
		if (!canvas || !parent || !stage) return;
		let cancelled = false;
		let animationFrame = 0;
		let lastVideoTime = -1;

		const resolveSource = (): CompositeSource | null => {
			const colorCanvas = parent.querySelector<HTMLCanvasElement>(
				'canvas[data-testid="color-preview-canvas"]'
			);
			return (
				colorCanvas ??
				parent.querySelector<HTMLImageElement | HTMLVideoElement>(
					sourceSelector
				)
			);
		};
		const resize = () => {
			const scale = Math.min(2, window.devicePixelRatio || 1);
			canvas.width = Math.max(1, Math.round(parent.clientWidth * scale));
			canvas.height = Math.max(1, Math.round(parent.clientHeight * scale));
		};
		const draw = () => {
			const source = resolveSource();
			const context = canvas.getContext("2d");
			if (!source || !context || !sourceReady({ source })) return;
			context.clearRect(0, 0, canvas.width, canvas.height);
			context.fillStyle = "black";
			context.fillRect(0, 0, canvas.width, canvas.height);
			context.filter = getComputedStyle(source).filter || "none";
			for (const tile of compositeTiles({
				stage,
				width: canvas.width,
				height: canvas.height,
			})) {
				drawSourceTile({ context, fitMode, source, tile });
			}
			if (source instanceof HTMLVideoElement)
				lastVideoTime = source.currentTime;
		};
		const loop = () => {
			if (cancelled) return;
			const source = resolveSource();
			if (
				source instanceof HTMLCanvasElement ||
				(source instanceof HTMLVideoElement &&
					Math.abs(source.currentTime - lastVideoTime) > 0.001)
			) {
				draw();
			}
			animationFrame = requestAnimationFrame(loop);
		};
		resize();
		draw();
		const observer = new ResizeObserver(() => {
			resize();
			draw();
		});
		observer.observe(parent);
		parent.addEventListener("loadeddata", draw, true);
		parent.addEventListener("load", draw, true);
		parent.addEventListener("seeked", draw, true);
		animationFrame = requestAnimationFrame(loop);
		return () => {
			cancelled = true;
			observer.disconnect();
			parent.removeEventListener("loadeddata", draw, true);
			parent.removeEventListener("load", draw, true);
			parent.removeEventListener("seeked", draw, true);
			cancelAnimationFrame(animationFrame);
		};
	}, [fitMode, sourceSelector, stage]);

	if (!stage) return null;
	return (
		<canvas
			ref={canvasRef}
			className="pointer-events-none absolute inset-0 z-10 size-full"
			data-effect-composite-layout={stage.layout}
		/>
	);
}
