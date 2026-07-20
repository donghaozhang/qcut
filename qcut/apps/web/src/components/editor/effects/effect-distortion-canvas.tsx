import {
	sampleDistortionSource,
	type EffectDistortionRenderStage,
	type EffectRenderProgram,
} from "@qcut/editor-core";
import { useEffect, useMemo, useRef } from "react";

type DistortionSource = HTMLCanvasElement | HTMLImageElement | HTMLVideoElement;

/** Cap the remap buffer so the per-pixel warp stays real-time. */
const MAX_REMAP_SIDE = 320;

function distortionStages({
	program,
}: {
	program?: EffectRenderProgram;
}): EffectDistortionRenderStage[] {
	return (
		program?.stages.filter(
			(stage): stage is EffectDistortionRenderStage =>
				stage.kind === "distortion"
		) ?? []
	);
}

function sourceReady({ source }: { source: DistortionSource }): boolean {
	if (source instanceof HTMLVideoElement) return source.readyState >= 2;
	if (source instanceof HTMLImageElement) return source.complete;
	return source.width > 0 && source.height > 0;
}

export function EffectDistortionCanvas({
	program,
	sourceSelector = 'img[data-effect-preview-base="true"]',
}: {
	program?: EffectRenderProgram;
	sourceSelector?: string;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const stages = useMemo(() => distortionStages({ program }), [program]);

	useEffect(() => {
		const canvas = canvasRef.current;
		const parent = canvas?.parentElement;
		if (!canvas || !parent || stages.length === 0) return;
		const animated = stages.some(
			(stage) => stage.variant === "ripple" || stage.variant === "shockwave"
		);
		if (
			animated &&
			window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
		) {
			return;
		}

		const scratch = document.createElement("canvas");
		// Cache both contexts once; querying getContext per frame is wasteful.
		const scratchContext = scratch.getContext("2d", {
			willReadFrequently: true,
		});
		const outputContext = canvas.getContext("2d");
		let cancelled = false;
		let animationFrame = 0;
		let lastVideoTime = -1;
		const startTime = performance.now();

		const resolveSource = (): DistortionSource | null => {
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

		const draw = (source: DistortionSource | null = resolveSource()) => {
			if (
				!source ||
				!outputContext ||
				!scratchContext ||
				!sourceReady({ source })
			) {
				return;
			}

			const aspect = parent.clientHeight
				? parent.clientWidth / parent.clientHeight
				: 16 / 9;
			const width =
				aspect >= 1 ? MAX_REMAP_SIDE : Math.round(MAX_REMAP_SIDE * aspect);
			const height =
				aspect >= 1 ? Math.round(MAX_REMAP_SIDE / aspect) : MAX_REMAP_SIDE;
			if (canvas.width !== width || canvas.height !== height) {
				canvas.width = width;
				canvas.height = height;
				scratch.width = width;
				scratch.height = height;
			}

			// Cover-fit the source into the scratch buffer.
			scratchContext.clearRect(0, 0, width, height);
			scratchContext.filter = getComputedStyle(source).filter || "none";
			const sw =
				source instanceof HTMLVideoElement
					? source.videoWidth
					: source instanceof HTMLImageElement
						? source.naturalWidth
						: source.width;
			const sh =
				source instanceof HTMLVideoElement
					? source.videoHeight
					: source instanceof HTMLImageElement
						? source.naturalHeight
						: source.height;
			if (sw <= 0 || sh <= 0) return;
			const cover = Math.max(width / sw, height / sh);
			const dw = sw * cover;
			const dh = sh * cover;
			scratchContext.drawImage(
				source,
				(width - dw) / 2,
				(height - dh) / 2,
				dw,
				dh
			);

			const sourcePixels = scratchContext.getImageData(0, 0, width, height);
			const output = outputContext.createImageData(width, height);
			const timeSeconds = (performance.now() - startTime) / 1000;
			const src = sourcePixels.data;
			const dst = output.data;
			const stage = stages[0];
			for (let y = 0; y < height; y += 1) {
				const v = (y + 0.5) / height;
				for (let x = 0; x < width; x += 1) {
					const u = (x + 0.5) / width;
					const sample = sampleDistortionSource({
						stage,
						u,
						v,
						timeSeconds,
					});
					// floor (not round): round shifts by one pixel + duplicates edges.
					const sx = Math.min(
						width - 1,
						Math.max(0, Math.floor(sample.u * width))
					);
					const sy = Math.min(
						height - 1,
						Math.max(0, Math.floor(sample.v * height))
					);
					const from = (sy * width + sx) * 4;
					const to = (y * width + x) * 4;
					dst[to] = src[from];
					dst[to + 1] = src[from + 1];
					dst[to + 2] = src[from + 2];
					dst[to + 3] = src[from + 3];
				}
			}
			outputContext.putImageData(output, 0, 0);
			if (source instanceof HTMLVideoElement)
				lastVideoTime = source.currentTime;
		};

		const redraw = () => draw();
		const loop = () => {
			if (cancelled) return;
			const source = resolveSource();
			if (
				animated ||
				source instanceof HTMLCanvasElement ||
				(source instanceof HTMLVideoElement &&
					Math.abs(source.currentTime - lastVideoTime) > 0.001)
			) {
				draw(source);
			}
			animationFrame = requestAnimationFrame(loop);
		};

		draw();
		const observer = new ResizeObserver(redraw);
		observer.observe(parent);
		parent.addEventListener("loadeddata", redraw, true);
		parent.addEventListener("load", redraw, true);
		parent.addEventListener("seeked", redraw, true);
		animationFrame = requestAnimationFrame(loop);
		return () => {
			cancelled = true;
			observer.disconnect();
			parent.removeEventListener("loadeddata", redraw, true);
			parent.removeEventListener("load", redraw, true);
			parent.removeEventListener("seeked", redraw, true);
			cancelAnimationFrame(animationFrame);
		};
	}, [sourceSelector, stages]);

	if (stages.length === 0) return null;
	return (
		<canvas
			ref={canvasRef}
			className="pointer-events-none absolute inset-0 z-10 size-full"
			data-effect-distortion={stages.map((stage) => stage.variant).join(",")}
		/>
	);
}
