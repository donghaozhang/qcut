import type { TextAnimationEasing } from "./model.js";

export function clampUnitInterval({ value }: { value: number }): number {
	return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function cubicCoordinate({
	time,
	first,
	second,
}: {
	time: number;
	first: number;
	second: number;
}): number {
	const inverse = 1 - time;
	return (
		3 * inverse ** 2 * time * first +
		3 * inverse * time ** 2 * second +
		time ** 3
	);
}

function cubicDerivative({
	time,
	first,
	second,
}: {
	time: number;
	first: number;
	second: number;
}): number {
	const inverse = 1 - time;
	return (
		3 * inverse ** 2 * first +
		6 * inverse * time * (second - first) +
		3 * time ** 2 * (1 - second)
	);
}

function cubicBezierProgress({
	progress,
	x1,
	y1,
	x2,
	y2,
}: {
	progress: number;
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}): number {
	let parameter = progress;
	for (let iteration = 0; iteration < 8; iteration++) {
		const error =
			cubicCoordinate({ time: parameter, first: x1, second: x2 }) - progress;
		const derivative = cubicDerivative({
			time: parameter,
			first: x1,
			second: x2,
		});
		if (Math.abs(derivative) < 1e-7) break;
		parameter = clampUnitInterval({ value: parameter - error / derivative });
	}
	return cubicCoordinate({ time: parameter, first: y1, second: y2 });
}

export function springProgress({
	progress,
	mass,
	stiffness,
	damping,
	velocity,
}: {
	progress: number;
	mass: number;
	stiffness: number;
	damping: number;
	velocity: number;
}): number {
	if (progress <= 0) return 0;
	if (progress >= 1) return 1;
	const angularFrequency = Math.sqrt(stiffness / mass);
	const dampingRatio = damping / (2 * Math.sqrt(stiffness * mass));
	if (dampingRatio < 1) {
		const dampedFrequency = angularFrequency * Math.sqrt(1 - dampingRatio ** 2);
		const coefficient =
			(dampingRatio * angularFrequency - velocity) / dampedFrequency;
		return (
			1 -
			Math.exp(-dampingRatio * angularFrequency * progress) *
				(Math.cos(dampedFrequency * progress) +
					coefficient * Math.sin(dampedFrequency * progress))
		);
	}
	const decay = Math.exp(-angularFrequency * progress);
	return 1 - decay * (1 + (angularFrequency - velocity) * progress);
}

export function easeTextAnimationProgress({
	progress,
	easing,
}: {
	progress: number;
	easing: TextAnimationEasing;
}): number {
	const value = clampUnitInterval({ value: progress });
	if (value === 0 || value === 1) return value;
	if (easing === "linear") return value;
	if (easing === "easeIn") return value ** 3;
	if (easing === "easeOut") return 1 - (1 - value) ** 3;
	if (easing === "easeInOut") {
		return value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
	}
	if (easing.type === "cubicBezier") {
		return cubicBezierProgress({
			progress: value,
			x1: easing.x1,
			y1: easing.y1,
			x2: easing.x2,
			y2: easing.y2,
		});
	}
	return springProgress({ progress: value, ...easing });
}
