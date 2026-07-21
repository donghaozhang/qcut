import type { EffectRenderProgram } from "@qcut/editor-core";
import { useEffect, useMemo, useRef } from "react";
import {
	drawParticleStageFrame,
	particleStages,
} from "@/lib/effects/effect-procedural-draw";

/**
 * Animated procedural particle overlay (雪花/樱花/星火/繁星/彩带/雾) rendered
 * deterministically from the shared particle model, so the catalog thumbnail
 * and the timeline preview show the same field.
 */
export function EffectParticleCanvas({
	program,
}: {
	program?: EffectRenderProgram;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const stages = useMemo(() => particleStages({ program }), [program]);

	useEffect(() => {
		const canvas = canvasRef.current;
		const parent = canvas?.parentElement;
		if (!canvas || !parent || stages.length === 0) return;
		if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
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
				drawParticleStageFrame({ context, stage, timeSeconds, width, height });
			}
		};

		const loop = () => {
			if (cancelled) return;
			draw();
			animationFrame = requestAnimationFrame(loop);
		};

		resize();
		const observer = new ResizeObserver(resize);
		observer.observe(parent);
		animationFrame = requestAnimationFrame(loop);
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
			data-effect-particles={stages.map((stage) => stage.variant).join(",")}
		/>
	);
}
