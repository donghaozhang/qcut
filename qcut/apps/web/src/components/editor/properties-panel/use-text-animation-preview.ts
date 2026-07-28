import { useEffect, useState } from "react";

const DEFAULT_STATIC_PROGRESS = 0.55;

export function prefersReducedMotion(): boolean {
	return (
		typeof window !== "undefined" &&
		window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
	);
}

export function useTextAnimationPreview({
	active,
	duration,
	staticProgress = DEFAULT_STATIC_PROGRESS,
}: {
	active: boolean;
	duration: number;
	staticProgress?: number;
}): number {
	const [progress, setProgress] = useState(staticProgress);

	useEffect(() => {
		if (!active || prefersReducedMotion()) {
			setProgress(staticProgress);
			return;
		}

		let animationFrame = 0;
		let startedAt: number | undefined;
		const durationMs = Math.max(300, duration * 1000);
		const tick = (timestamp: number) => {
			startedAt ??= timestamp;
			setProgress(((timestamp - startedAt) % durationMs) / durationMs);
			animationFrame = requestAnimationFrame(tick);
		};

		animationFrame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(animationFrame);
	}, [active, duration, staticProgress]);

	return progress;
}
