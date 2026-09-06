import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import type {
	MediaColorSettings,
	MediaMask,
	MediaPortraitAdjustments,
} from "@/types/timeline";
import {
	drawColorGradedSourceStack,
	type BrowserColorGradeLayer,
} from "@/lib/color/browser-color-rendering";
import { subscribeColorDegradation } from "@/lib/color/color-degradation";
import { colorPreviewCanvasSize } from "@/lib/color/color-preview-resolution";
import { portraitPreviewSourceKey } from "@/lib/portrait/portrait-preview-source-key";
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
	portraitAdjustments,
}: {
	sourceSelector: string;
	settings: MediaColorSettings;
	masks: MediaMask[];
	fitMode: "cover" | "contain" | "fill";
	frameSeed: number;
	filter?: string;
	additionalLayers?: BrowserColorGradeLayer[];
	portraitAdjustments?: MediaPortraitAdjustments;
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
		return subscribeColorDegradation(({ detail, reason }) => {
			if (reason === "qcut-independent-filter-unavailable") {
				toast.error("QCut Metal 渲染失败，预览未更新", {
					description: detail,
					id: reason,
				});
				return;
			}
			const localPortraitFallback =
				reason === "jianying-local-portrait-fallback";
			const localEffectFallback = reason === "jianying-local-effect-fallback";
			const portraitAdjustmentFallback =
				reason === "jianying-portrait-adjustment-fallback";
			toast.warning(
				portraitAdjustmentFallback
					? "本机剪映美颜美体运行时不可用，已显示原始画面"
					: localPortraitFallback
						? "本机剪映人像运行时不可用，已使用近似肤色蒙版"
						: localEffectFallback
							? "本机剪映滤镜运行时不可用，已使用结构近似效果"
							: "调色预览已降级为近似效果（画面源受跨域限制）",
				{
					description: detail,
					id: portraitAdjustmentFallback
						? "jianying-portrait-adjustment-fallback"
						: localPortraitFallback
							? "jianying-local-portrait-fallback"
							: localEffectFallback
								? "jianying-local-effect-fallback"
								: "color-degradation-css-fallback",
				}
			);
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
		const sourceLocation = source.currentSrc || source.src || sourceSelector;
		const elementId = parent.closest<HTMLElement>("[data-preview-element-id]")
			?.dataset.previewElementId;
		const sourceKey = portraitPreviewSourceKey({
			elementId,
			mediaId: source.dataset.colorSourceKey,
			sourceSessionId: parent.closest<HTMLElement>(
				"[data-portrait-source-session]"
			)?.dataset.portraitSourceSession,
			sourceLocation,
			sourceSelector,
		});
		let cancelled = false;
		let animationFrame = 0;
		let lastVideoTime = -1;
		let drawing = false;
		let queuedDraw = false;
		const resize = () => {
			const size = colorPreviewCanvasSize({
				width: parent.clientWidth,
				height: parent.clientHeight,
			});
			const width = Math.max(1, size.width);
			const height = Math.max(1, size.height);
			if (canvas.width !== width) canvas.width = width;
			if (canvas.height !== height) canvas.height = height;
		};
		const draw = async () => {
			if (cancelled || canvas.width <= 0 || canvas.height <= 0) return;
			if (drawing) {
				queuedDraw = true;
				return;
			}
			if (source instanceof HTMLVideoElement && source.readyState < 2) return;
			if (source instanceof HTMLImageElement && !source.complete) return;
			drawing = true;
			try {
				if (source instanceof HTMLVideoElement)
					lastVideoTime = source.currentTime;
				const fitted = document.createElement("canvas");
				fitted.width = canvas.width;
				fitted.height = canvas.height;
				const rendered = document.createElement("canvas");
				rendered.width = canvas.width;
				rendered.height = canvas.height;
				const fittedContext = fitted.getContext("2d");
				const renderedContext = rendered.getContext("2d", {
					willReadFrequently: true,
				});
				const outputContext = canvas.getContext("2d", {
					willReadFrequently: true,
				});
				if (!fittedContext || !renderedContext || !outputContext) return;
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
				await drawColorGradedSourceStack({
					context: renderedContext,
					source: fitted,
					x: 0,
					y: 0,
					width: canvas.width,
					height: canvas.height,
					layers: renderedLayers,
					frameSeed,
					sourceKey,
					timestampSeconds:
						source instanceof HTMLVideoElement ? source.currentTime : 0,
					portraitAdjustments,
				});
				if (cancelled) return;
				if (
					rendered.width !== canvas.width ||
					rendered.height !== canvas.height
				) {
					return;
				}
				outputContext.clearRect(0, 0, canvas.width, canvas.height);
				outputContext.drawImage(rendered, 0, 0);
				canvas.dataset.renderedColorResources = renderedLayers
					.flatMap(({ settings }) => {
						const effect = settings.multiPass;
						return effect?.enabled && effect.nativeEffect
							? [`${effect.nativeEffect.resourceId}:${effect.intensity}`]
							: [];
					})
					.join(",");
			} catch (error) {
				const independent = renderedLayers.some(
					({ settings }) =>
						settings.multiPass?.enabled &&
						(settings.multiPass.nativeEffect?.provider ===
							"qcut-metal-fog-v1" ||
							settings.multiPass.nativeEffect?.provider ===
								"qcut-metal-lut-v1" ||
							settings.multiPass.nativeEffect?.provider ===
								"qcut-metal-graph-v1")
				);
				// The color layer reports the failure; retain the last good preview.
				if (!independent) throw error;
			} finally {
				drawing = false;
				if (queuedDraw && !cancelled) {
					queuedDraw = false;
					void draw();
				}
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
	}, [fitMode, frameSeed, portraitAdjustments, renderedLayers, sourceSelector]);
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
