import type { EffectRenderProgram } from "@qcut/editor-core";
import { useEffect, useMemo, useRef } from "react";
import {
	decorationStages,
	drawDecorationStageFrame,
	isDecorationStageAnimated,
} from "@/lib/effects/effect-procedural-draw";

/**
 * Procedural decoration overlay (上下网格 / 彩虹射线 / 全剧终 / 开幕 / 悬浮待机 /
 * 射线爆闪 / 超大光斑 / 文字悬浮) drawn on a canvas, mounted like the particle
 * overlay in the thumbnail and timeline preview.
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
		const reducedMotion =
			window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
		// Animate only if a non-static stage is present and motion is allowed;
		// otherwise every stage (including a static grid) still draws once below.
		const animated =
			!reducedMotion &&
			stages.some((stage) => isDecorationStageAnimated({ stage }));

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
				drawDecorationStageFrame({
					context,
					stage,
					timeSeconds,
					width,
					height,
				});
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
