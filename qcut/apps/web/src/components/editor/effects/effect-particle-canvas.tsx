import {
	sampleEffectParticles,
	type EffectParticleRenderStage,
	type EffectRenderProgram,
	type SampledEffectParticle,
} from "@qcut/editor-core";
import { useEffect, useMemo, useRef } from "react";

function particleStages({
	program,
}: {
	program?: EffectRenderProgram;
}): EffectParticleRenderStage[] {
	return (
		program?.stages.filter(
			(stage): stage is EffectParticleRenderStage => stage.kind === "particles"
		) ?? []
	);
}

function drawParticle({
	context,
	stage,
	particle,
	width,
	height,
}: {
	context: CanvasRenderingContext2D;
	stage: EffectParticleRenderStage;
	particle: SampledEffectParticle;
	width: number;
	height: number;
}) {
	const minSide = Math.min(width, height);
	const px = particle.x * width;
	const py = particle.y * height;
	const size = Math.max(1, particle.size * minSide);
	context.globalAlpha = particle.opacity;

	if (stage.variant === "fog") {
		const gradient = context.createRadialGradient(px, py, 0, px, py, size);
		gradient.addColorStop(0, stage.color);
		gradient.addColorStop(1, "rgba(255,255,255,0)");
		context.fillStyle = gradient;
		context.beginPath();
		context.arc(px, py, size, 0, Math.PI * 2);
		context.fill();
		return;
	}

	if (stage.variant === "embers" || stage.variant === "stars") {
		const gradient = context.createRadialGradient(px, py, 0, px, py, size * 2);
		gradient.addColorStop(0, stage.color);
		gradient.addColorStop(1, "rgba(0,0,0,0)");
		context.fillStyle = gradient;
		context.beginPath();
		context.arc(px, py, size * 2, 0, Math.PI * 2);
		context.fill();
		return;
	}

	if (stage.variant === "confetti") {
		context.save();
		context.translate(px, py);
		context.rotate((particle.rotation * Math.PI) / 180);
		context.fillStyle = stage.color;
		context.fillRect(-size / 2, -size, size, size * 2);
		context.restore();
		return;
	}

	if (stage.variant === "coins") {
		// Spinning gold coin: width oscillates with rotation to fake a flip.
		context.save();
		context.translate(px, py);
		const flip = Math.abs(Math.cos((particle.rotation * Math.PI) / 180));
		context.fillStyle = stage.color;
		context.beginPath();
		context.ellipse(0, 0, Math.max(0.5, size * flip), size, 0, 0, Math.PI * 2);
		context.fill();
		context.restore();
		return;
	}

	if (stage.variant === "butterfly") {
		context.save();
		context.translate(px, py);
		context.rotate(
			(Math.sin((particle.rotation * Math.PI) / 180) * 20 * Math.PI) / 180
		);
		context.fillStyle = stage.color;
		// Two wings that flap: wing width follows the rotation phase.
		const flap =
			0.4 + 0.6 * Math.abs(Math.sin((particle.rotation * Math.PI) / 90));
		for (const dir of [-1, 1]) {
			context.beginPath();
			context.ellipse(
				dir * size * 0.6 * flap,
				0,
				size * flap,
				size * 0.7,
				0,
				0,
				Math.PI * 2
			);
			context.fill();
		}
		context.restore();
		return;
	}

	if (stage.variant === "sakura") {
		context.save();
		context.translate(px, py);
		context.rotate((particle.rotation * Math.PI) / 180);
		context.fillStyle = stage.color;
		context.beginPath();
		context.ellipse(0, 0, size, size * 0.6, 0, 0, Math.PI * 2);
		context.fill();
		context.restore();
		return;
	}

	// snow (default): soft round flakes
	context.fillStyle = stage.color;
	context.beginPath();
	context.arc(px, py, size, 0, Math.PI * 2);
	context.fill();
}

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
			const aspectRatio = height > 0 ? width / height : 16 / 9;
			context.clearRect(0, 0, width, height);
			for (const stage of stages) {
				const particles = sampleEffectParticles({
					stage,
					timeSeconds,
					aspectRatio,
				});
				for (const particle of particles) {
					drawParticle({ context, stage, particle, width, height });
				}
			}
			context.globalAlpha = 1;
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
