import type {
	EffectDecorationRenderStage,
	EffectRenderProgram,
} from "@qcut/editor-core";
import { useEffect, useMemo, useRef } from "react";

function decorationStages({
	program,
}: {
	program?: EffectRenderProgram;
}): EffectDecorationRenderStage[] {
	return (
		program?.stages.filter(
			(stage): stage is EffectDecorationRenderStage =>
				stage.kind === "decoration"
		) ?? []
	);
}

function drawGrid({
	context,
	stage,
	width,
	height,
}: {
	context: CanvasRenderingContext2D;
	stage: EffectDecorationRenderStage;
	width: number;
	height: number;
}) {
	const rows = 4;
	const columns = 6;
	context.globalAlpha = stage.opacity;
	context.strokeStyle = stage.color;
	context.lineWidth = Math.max(1, Math.round(Math.min(width, height) / 220));
	context.beginPath();
	for (let row = 1; row < rows; row += 1) {
		const y = Math.round((row / rows) * height);
		context.moveTo(0, y);
		context.lineTo(width, y);
	}
	for (let column = 1; column < columns; column += 1) {
		const x = Math.round((column / columns) * width);
		context.moveTo(x, 0);
		context.lineTo(x, height);
	}
	context.stroke();
	context.globalAlpha = 1;
}

function drawRainbowRays({
	context,
	stage,
	width,
	height,
	timeSeconds,
}: {
	context: CanvasRenderingContext2D;
	stage: EffectDecorationRenderStage;
	width: number;
	height: number;
	timeSeconds: number;
}) {
	const centerX = width / 2;
	const centerY = height / 2;
	const radius = Math.hypot(width, height);
	const rayCount = 14;
	const rotation = timeSeconds * 0.25;
	const hueBase = (timeSeconds * 30) % 360;
	context.globalAlpha = stage.opacity;
	context.globalCompositeOperation = "screen";
	for (let index = 0; index < rayCount; index += 1) {
		const start = rotation + (index / rayCount) * Math.PI * 2;
		const end = start + (Math.PI * 2) / rayCount / 2;
		const hue = (hueBase + (index / rayCount) * 360) % 360;
		context.beginPath();
		context.moveTo(centerX, centerY);
		context.arc(centerX, centerY, radius, start, end);
		context.closePath();
		context.fillStyle = `hsla(${hue}, 90%, 60%, 0.5)`;
		context.fill();
	}
	context.globalCompositeOperation = "source-over";
	context.globalAlpha = 1;
}

function drawFilmEnd({
	context,
	stage,
	width,
	height,
	timeSeconds,
}: {
	context: CanvasRenderingContext2D;
	stage: EffectDecorationRenderStage;
	width: number;
	height: number;
	timeSeconds: number;
}) {
	// Letterbox bars + a centered "全剧终" title that fades in.
	const barHeight = Math.round(height * 0.14);
	context.globalAlpha = stage.opacity;
	context.fillStyle = "#000000";
	context.fillRect(0, 0, width, barHeight);
	context.fillRect(0, height - barHeight, width, barHeight);
	const fade = Math.min(1, timeSeconds / 1.2);
	context.globalAlpha = stage.opacity * (0.35 + 0.4 * fade);
	context.fillRect(0, 0, width, height);
	context.globalAlpha = fade;
	context.fillStyle = stage.color;
	context.textAlign = "center";
	context.textBaseline = "middle";
	context.font = `600 ${Math.round(height * 0.14)}px "Noto Sans SC", sans-serif`;
	context.fillText("全剧终", width / 2, height / 2);
	context.globalAlpha = 1;
}

/**
 * Procedural decoration overlay (上下网格 / 彩虹射线 / 全剧终) drawn on a canvas,
 * mounted like the particle overlay in the thumbnail and timeline preview.
 */
export function EffectDecorationCanvas({
	program,
}: {
	program?: EffectRenderProgram;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const stages = useMemo(() => decorationStages({ program }), [program]);

	useEffect(() => {
		const canvas = canvasRef.current;
		const parent = canvas?.parentElement;
		if (!canvas || !parent || stages.length === 0) return;
		const animated = stages.some(
			(stage) =>
				stage.variant === "rainbow-rays" || stage.variant === "film-end"
		);
		if (
			animated &&
			window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
		) {
			return;
		}

		let cancelled = false;
		let animationFrame = 0;
		const startTime = performance.now();

		const resize = () => {
			const scale = Math.min(2, window.devicePixelRatio || 1);
			canvas.width = Math.max(1, Math.round(parent.clientWidth * scale));
			canvas.height = Math.max(1, Math.round(parent.clientHeight * scale));
		};

		const draw = () => {
			const context = canvas.getContext("2d");
			if (!context) return;
			const { width, height } = canvas;
			const timeSeconds = (performance.now() - startTime) / 1000;
			context.clearRect(0, 0, width, height);
			for (const stage of stages) {
				if (stage.variant === "grid") {
					drawGrid({ context, stage, width, height });
				} else if (stage.variant === "rainbow-rays") {
					drawRainbowRays({ context, stage, width, height, timeSeconds });
				} else {
					drawFilmEnd({ context, stage, width, height, timeSeconds });
				}
			}
		};

		const loop = () => {
			if (cancelled) return;
			draw();
			animationFrame = requestAnimationFrame(loop);
		};

		resize();
		const observer = new ResizeObserver(() => {
			resize();
			if (!animated) draw();
		});
		observer.observe(parent);
		if (animated) {
			animationFrame = requestAnimationFrame(loop);
		} else {
			draw();
		}
		return () => {
			cancelled = true;
			observer.disconnect();
			cancelAnimationFrame(animationFrame);
		};
	}, [stages]);

	if (stages.length === 0) return null;
	return (
		<canvas
			ref={canvasRef}
			className="pointer-events-none absolute inset-0 z-20 size-full"
			data-effect-decoration={stages.map((stage) => stage.variant).join(",")}
		/>
	);
}
