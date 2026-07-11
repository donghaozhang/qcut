import { useEffect, useRef } from "react";
import type { MediaColorSettings, MediaMask } from "@/types/timeline";
import { drawColorGradedSourceWithMasks } from "@/lib/color/browser-color-rendering";

function sourceDimensions(source: HTMLVideoElement | HTMLImageElement) {
	if (source instanceof HTMLVideoElement) {
		return { width: source.videoWidth, height: source.videoHeight };
	}
	return { width: source.naturalWidth, height: source.naturalHeight };
}

function drawObjectFit({
	context,
	source,
	width,
	height,
	fitMode,
}: {
	context: CanvasRenderingContext2D;
	source: HTMLVideoElement | HTMLImageElement;
	width: number;
	height: number;
	fitMode: "cover" | "contain" | "fill";
}) {
	const dimensions = sourceDimensions(source);
	if (dimensions.width <= 0 || dimensions.height <= 0) return false;
	if (fitMode === "fill") {
		context.drawImage(source, 0, 0, width, height);
		return true;
	}
	const scale =
		fitMode === "cover"
			? Math.max(width / dimensions.width, height / dimensions.height)
			: Math.min(width / dimensions.width, height / dimensions.height);
	const drawWidth = dimensions.width * scale;
	const drawHeight = dimensions.height * scale;
	context.drawImage(
		source,
		(width - drawWidth) / 2,
		(height - drawHeight) / 2,
		drawWidth,
		drawHeight
	);
	return true;
}

export function ColorPreviewCanvas({
	sourceSelector,
	settings,
	masks,
	fitMode,
	frameSeed,
	filter,
}: {
	sourceSelector: string;
	settings: MediaColorSettings;
	masks: MediaMask[];
	fitMode: "cover" | "contain" | "fill";
	frameSeed: number;
	filter?: string;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const canvas = canvasRef.current;
		const parent = canvas?.parentElement;
		if (!canvas || !parent) return;
		const source = parent.querySelector<HTMLVideoElement | HTMLImageElement>(
			sourceSelector
		);
		if (!source) return;
		let cancelled = false;
		let animationFrame = 0;
		let lastVideoTime = -1;
		let drawing = false;
		const resize = () => {
			const width = Math.max(1, parent.clientWidth);
			const height = Math.max(1, parent.clientHeight);
			const scale = Math.min(1, 480 / width);
			canvas.width = Math.max(1, Math.round(width * scale));
			canvas.height = Math.max(1, Math.round(height * scale));
		};
		const draw = async () => {
			if (drawing || cancelled || canvas.width <= 0 || canvas.height <= 0)
				return;
			if (source instanceof HTMLVideoElement && source.readyState < 2) return;
			if (source instanceof HTMLImageElement && !source.complete) return;
			drawing = true;
			try {
				if (source instanceof HTMLVideoElement)
					lastVideoTime = source.currentTime;
				const fitted = document.createElement("canvas");
				fitted.width = canvas.width;
				fitted.height = canvas.height;
				const fittedContext = fitted.getContext("2d");
				const outputContext = canvas.getContext("2d", {
					willReadFrequently: true,
				});
				if (!fittedContext || !outputContext) return;
				if (
					!drawObjectFit({
						context: fittedContext,
						source,
						width: fitted.width,
						height: fitted.height,
						fitMode,
					})
				)
					return;
				outputContext.clearRect(0, 0, canvas.width, canvas.height);
				await drawColorGradedSourceWithMasks({
					context: outputContext,
					source: fitted,
					x: 0,
					y: 0,
					width: canvas.width,
					height: canvas.height,
					masks,
					settings,
					frameSeed,
				});
			} finally {
				drawing = false;
			}
		};
		const loop = () => {
			if (cancelled) return;
			if (
				source instanceof HTMLVideoElement &&
				!source.paused &&
				Math.abs(source.currentTime - lastVideoTime) > 0.001
			) {
				void draw();
			}
			animationFrame = requestAnimationFrame(loop);
		};
		resize();
		void draw();
		const observer = new ResizeObserver(() => {
			resize();
			void draw();
		});
		observer.observe(parent);
		const redraw = () => void draw();
		source.addEventListener("loadeddata", redraw);
		source.addEventListener("seeked", redraw);
		animationFrame = requestAnimationFrame(loop);
		return () => {
			cancelled = true;
			observer.disconnect();
			source.removeEventListener("loadeddata", redraw);
			source.removeEventListener("seeked", redraw);
			cancelAnimationFrame(animationFrame);
		};
	}, [fitMode, frameSeed, masks, settings, sourceSelector]);
	return (
		<canvas
			ref={canvasRef}
			className="pointer-events-none absolute inset-0 size-full"
			style={{ filter }}
			data-testid="color-preview-canvas"
		/>
	);
}
