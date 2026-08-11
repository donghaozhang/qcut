import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import type { MediaColorSettings, MediaMask } from "@/types/timeline";
import {
	drawColorGradedSourceStack,
	type BrowserColorGradeLayer,
} from "@/lib/color/browser-color-rendering";
import { subscribeColorDegradation } from "@/lib/color/color-degradation";
import { cn } from "@/lib/utils";
import { useColorPickerStore } from "@/stores/editor/color-picker-store";
import { useColorPreviewStore } from "@/stores/editor/color-preview-store";

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
	additionalLayers = [],
}: {
	sourceSelector: string;
	settings: MediaColorSettings;
	masks: MediaMask[];
	fitMode: "cover" | "contain" | "fill";
	frameSeed: number;
	filter?: string;
	additionalLayers?: BrowserColorGradeLayer[];
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const colorPickerActive = useColorPickerStore((state) => state.active);
	const completeColorPick = useColorPickerStore((state) => state.complete);
	const previewBypassed = useColorPreviewStore((state) => state.bypassed);
	const renderedLayers = useMemo<BrowserColorGradeLayer[]>(
		() =>
			previewBypassed
				? [{ settings: { ...settings, enabled: false }, masks }]
				: [{ settings, masks }, ...additionalLayers],
		[additionalLayers, masks, previewBypassed, settings]
	);
	const samplePreviewColor = useCallback(
		({ clientX, clientY }: { clientX: number; clientY: number }) => {
			const canvas = canvasRef.current;
			if (!canvas) return false;
			const bounds = canvas.getBoundingClientRect();
			if (
				clientX < bounds.left ||
				clientX > bounds.right ||
				clientY < bounds.top ||
				clientY > bounds.bottom
			) {
				return false;
			}
			const x = Math.min(
				canvas.width - 1,
				Math.max(
					0,
					Math.floor(
						((clientX - bounds.left) / Math.max(1, bounds.width)) * canvas.width
					)
				)
			);
			const y = Math.min(
				canvas.height - 1,
				Math.max(
					0,
					Math.floor(
						((clientY - bounds.top) / Math.max(1, bounds.height)) *
							canvas.height
					)
				)
			);
			const context = canvas.getContext("2d", { willReadFrequently: true });
			const pixel = context?.getImageData(x, y, 1, 1).data;
			if (!pixel || pixel[3] === 0) return false;
			completeColorPick({
				r: pixel[0] / 255,
				g: pixel[1] / 255,
				b: pixel[2] / 255,
			});
			return true;
		},
		[completeColorPick]
	);
	useEffect(() => {
		if (!colorPickerActive) return;
		const previousCursor = document.body.style.cursor;
		document.body.style.cursor = "crosshair";
		const capturePick = (event: PointerEvent) => {
			if (event.defaultPrevented) return;
			if (
				!samplePreviewColor({ clientX: event.clientX, clientY: event.clientY })
			) {
				return;
			}
			event.preventDefault();
			event.stopPropagation();
		};
		document.addEventListener("pointerdown", capturePick, true);
		return () => {
			document.body.style.cursor = previousCursor;
			document.removeEventListener("pointerdown", capturePick, true);
		};
	}, [colorPickerActive, samplePreviewColor]);
	useEffect(() => {
		return subscribeColorDegradation(() => {
			toast.warning("调色预览已降级为近似效果（画面源受跨域限制）", {
				id: "color-degradation-css-fallback",
			});
		});
	}, []);
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
				await drawColorGradedSourceStack({
					context: outputContext,
					source: fitted,
					x: 0,
					y: 0,
					width: canvas.width,
					height: canvas.height,
					layers: renderedLayers,
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
	}, [fitMode, frameSeed, renderedLayers, sourceSelector]);
	return (
		<canvas
			ref={canvasRef}
			className={cn(
				"absolute inset-0 size-full",
				colorPickerActive
					? "pointer-events-auto z-20 cursor-crosshair"
					: "pointer-events-none"
			)}
			style={{ filter }}
			data-testid="color-preview-canvas"
			onPointerDown={(event) => {
				if (!colorPickerActive) return;
				if (
					!samplePreviewColor({
						clientX: event.clientX,
						clientY: event.clientY,
					})
				) {
					return;
				}
				event.preventDefault();
				event.stopPropagation();
			}}
		/>
	);
}
