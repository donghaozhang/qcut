const MINIMUM_TRANSITION_DURATION_SECONDS = 0.05;

type TransitionEdge = "left" | "right";

function clampTransitionDuration({
	duration,
	maxDuration,
}: {
	duration: number;
	maxDuration: number;
}) {
	const minimumDuration = Math.min(
		MINIMUM_TRANSITION_DURATION_SECONDS,
		maxDuration
	);
	return Math.min(maxDuration, Math.max(minimumDuration, duration));
}

export function calculateTransitionPointerResize({
	currentX,
	initialDuration,
	maxDuration,
	pixelsPerSecond,
	side,
	startX,
}: {
	currentX: number;
	initialDuration: number;
	maxDuration: number;
	pixelsPerSecond: number;
	side: TransitionEdge;
	startX: number;
}) {
	const edgeDirection = side === "right" ? 1 : -1;
	const durationDelta =
		(edgeDirection * 2 * (currentX - startX)) / pixelsPerSecond;
	return clampTransitionDuration({
		duration: initialDuration + durationDelta,
		maxDuration,
	});
}

export function calculateTransitionKeyboardResize({
	duration,
	key,
	maxDuration,
	shiftKey,
	side,
}: {
	duration: number;
	key: "ArrowLeft" | "ArrowRight";
	maxDuration: number;
	shiftKey: boolean;
	side: TransitionEdge;
}) {
	const pointerDirection = key === "ArrowRight" ? 1 : -1;
	const edgeDirection = side === "right" ? 1 : -1;
	const step = shiftKey ? 0.25 : 0.05;
	return clampTransitionDuration({
		duration: duration + pointerDirection * edgeDirection * step * 2,
		maxDuration,
	});
}
