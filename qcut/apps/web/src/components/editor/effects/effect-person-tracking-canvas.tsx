import type { EffectRenderProgram } from "@qcut/editor-core";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	drawPersonEffectFrame,
	getEffectPersonTrackingStages,
} from "@/lib/effects/effect-person-rendering";
import { PersonCutoutClient } from "@/lib/segmentation/person-cutout-client";
import type { PersonCutoutMaskOptions } from "@/lib/segmentation/person-cutout-mask";

type PersonEffectSource =
	| HTMLCanvasElement
	| HTMLImageElement
	| HTMLVideoElement;

const MAX_INFERENCE_WIDTH = 480;
const MIN_VIDEO_SAMPLE_SECONDS = 1 / 15;
const MASK_OPTIONS: PersonCutoutMaskOptions = {
	threshold: 0.5,
	temporalSmoothing: 0.55,
	edgeShift: 1,
	feather: 1.5,
};

function sourceDimensions({ source }: { source: PersonEffectSource }) {
	if (source instanceof HTMLVideoElement) {
		return { width: source.videoWidth, height: source.videoHeight };
	}
	if (source instanceof HTMLImageElement) {
		return { width: source.naturalWidth, height: source.naturalHeight };
	}
	return { width: source.width, height: source.height };
}

function sourceReady({ source }: { source: PersonEffectSource }): boolean {
	if (source instanceof HTMLVideoElement) return source.readyState >= 2;
	if (source instanceof HTMLImageElement) return source.complete;
	return source.width > 0 && source.height > 0;
}

function drawFittedSource({
	context,
	source,
	width,
	height,
	fitMode,
}: {
	context: CanvasRenderingContext2D;
	source: PersonEffectSource;
	width: number;
	height: number;
	fitMode: "contain" | "cover" | "fill";
}) {
	const dimensions = sourceDimensions({ source });
	if (dimensions.width <= 0 || dimensions.height <= 0) return;
	context.clearRect(0, 0, width, height);
	context.filter = getComputedStyle(source).filter || "none";
	if (fitMode === "fill") {
		context.drawImage(source, 0, 0, width, height);
		context.filter = "none";
		return;
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
	context.filter = "none";
}

export function EffectPersonTrackingCanvas({
	program,
	sourceSelector,
	fitMode,
}: {
	program?: EffectRenderProgram;
	sourceSelector: string;
	fitMode: "contain" | "cover" | "fill";
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const clientRef = useRef<PersonCutoutClient | null>(null);
	const lastVideoTimeRef = useRef(Number.NEGATIVE_INFINITY);
	const [status, setStatus] = useState<
		"idle" | "processing" | "ready" | "error"
	>("idle");
	const stages = useMemo(
		() => getEffectPersonTrackingStages({ program }),
		[program]
	);

	useEffect(() => {
		const canvas = canvasRef.current;
		const parent = canvas?.parentElement;
		if (!canvas || !parent || stages.length === 0) return;
		let cancelled = false;
		let animationFrame = 0;
		let processing = false;
		let rerender = false;

		const resolveSource = (): PersonEffectSource | null => {
			const colorCanvas = parent.querySelector<HTMLCanvasElement>(
				'canvas[data-testid="color-preview-canvas"]'
			);
			return (
				colorCanvas ?? parent.querySelector<PersonEffectSource>(sourceSelector)
			);
		};
		const resize = () => {
			const width = Math.max(1, parent.clientWidth);
			const height = Math.max(1, parent.clientHeight);
			const scale = Math.min(1, MAX_INFERENCE_WIDTH / width);
			canvas.width = Math.max(1, Math.round(width * scale));
			canvas.height = Math.max(1, Math.round(height * scale));
		};
		const render = async () => {
			if (cancelled) return;
			if (processing) {
				rerender = true;
				return;
			}
			const source = resolveSource();
			if (!source || !sourceReady({ source })) return;
			processing = true;
			setStatus("processing");
			try {
				sourceCanvasRef.current ??= document.createElement("canvas");
				maskCanvasRef.current ??= document.createElement("canvas");
				const sourceCanvas = sourceCanvasRef.current;
				sourceCanvas.width = canvas.width;
				sourceCanvas.height = canvas.height;
				const sourceContext = sourceCanvas.getContext("2d");
				if (!sourceContext)
					throw new Error("Unable to create person preview canvas");
				drawFittedSource({
					context: sourceContext,
					source,
					width: sourceCanvas.width,
					height: sourceCanvas.height,
					fitMode,
				});
				const frame = await createImageBitmap(sourceCanvas);
				const client = clientRef.current ?? new PersonCutoutClient();
				clientRef.current = client;
				const sourceTimestampMs =
					source instanceof HTMLVideoElement ? source.currentTime * 1000 : 0;
				const mask = await client.segment({
					frame,
					sourceTimestampMs,
					options: MASK_OPTIONS,
				});
				if (cancelled) return;
				drawPersonEffectFrame({
					outputCanvas: canvas,
					maskCanvas: maskCanvasRef.current,
					source: sourceCanvas,
					mask,
					stages,
				});
				setStatus("ready");
			} catch {
				if (!cancelled) setStatus("error");
			} finally {
				processing = false;
				if (rerender && !cancelled) {
					rerender = false;
					void render();
				}
			}
		};
		const loop = () => {
			if (cancelled) return;
			const source = resolveSource();
			if (source instanceof HTMLVideoElement && !source.paused) {
				const elapsed = Math.abs(source.currentTime - lastVideoTimeRef.current);
				if (elapsed >= MIN_VIDEO_SAMPLE_SECONDS) {
					lastVideoTimeRef.current = source.currentTime;
					void render();
				}
			}
			animationFrame = requestAnimationFrame(loop);
		};

		resize();
		void render();
		const observer = new ResizeObserver(() => {
			resize();
			void render();
		});
		observer.observe(parent);
		const redraw = () => void render();
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
			clientRef.current?.dispose();
			clientRef.current = null;
		};
	}, [fitMode, sourceSelector, stages]);

	if (stages.length === 0) return null;
	return (
		<canvas
			ref={canvasRef}
			className="pointer-events-none absolute inset-0 z-[9] size-full"
			data-effect-person-treatment={stages
				.map((stage) => stage.treatment)
				.join(",")}
			data-effect-person-status={status}
		/>
	);
}
