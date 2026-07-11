import type { VideoVisual } from "./types";

type VideoCustomCutout = NonNullable<VideoVisual["customCutout"]>;
type CustomCutoutStroke = VideoCustomCutout["strokes"][number];

function clamp({
	value,
	min,
	max,
}: {
	value: number;
	min: number;
	max: number;
}) {
	return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function sampledStrokePoints({
	stroke,
	maxPoints,
}: {
	stroke: CustomCutoutStroke;
	maxPoints: number;
}): Array<{ x: number; y: number }> {
	const source = stroke.points.map((point) => ({
		x: clamp({ value: point.x, min: 0, max: 1 }),
		y: clamp({ value: point.y, min: 0, max: 1 }),
	}));
	if (source.length <= 1) return source;
	const spacing = Math.max(
		0.004,
		clamp({ value: stroke.size, min: 0.005, max: 0.25 }) * 0.35
	);
	const sampled: Array<{ x: number; y: number }> = [{ ...source[0] }];
	for (let index = 1; index < source.length; index += 1) {
		const start = source[index - 1];
		const end = source[index];
		const distance = Math.hypot(end.x - start.x, end.y - start.y);
		const steps = Math.max(1, Math.ceil(distance / spacing));
		for (let step = 1; step <= steps; step += 1) {
			const progress = step / steps;
			sampled.push({
				x: start.x + (end.x - start.x) * progress,
				y: start.y + (end.y - start.y) * progress,
			});
			if (sampled.length >= maxPoints) return sampled;
		}
	}
	return sampled;
}

function unionExpressions({ expressions }: { expressions: string[] }): string {
	if (expressions.length === 0) return "0";
	return expressions.reduce(
		(combined, expression) => `max(${combined},${expression})`
	);
}

function strokeExpression({
	stroke,
	pointBudget,
}: {
	stroke: CustomCutoutStroke;
	pointBudget: number;
}): string {
	const radius = clamp({ value: stroke.size, min: 0.005, max: 0.25 }) / 2;
	const circles = sampledStrokePoints({ stroke, maxPoints: pointBudget }).map(
		(point) =>
			`lte(pow(X/W-${point.x},2)+pow(Y/H-${point.y},2),${radius * radius})`
	);
	return unionExpressions({ expressions: circles });
}

function staticCutoutExpression({
	strokes,
}: {
	strokes: CustomCutoutStroke[];
}): string {
	const hasForeground = strokes.some((stroke) => stroke.mode === "foreground");
	let expression = hasForeground ? "0" : "1";
	let remainingPointBudget = 512;
	for (const stroke of strokes.slice(-64)) {
		if (remainingPointBudget <= 0) break;
		const pointBudget = Math.min(32, remainingPointBudget);
		const next = strokeExpression({ stroke, pointBudget });
		remainingPointBudget -= pointBudget;
		expression =
			stroke.mode === "foreground"
				? `max(${expression},${next})`
				: `(${expression})*(1-(${next}))`;
	}
	return expression;
}

function correctionFrames({ strokes }: { strokes: CustomCutoutStroke[] }) {
	const frames = [
		...new Set(strokes.map((stroke) => Math.max(0, Math.round(stroke.frame)))),
	].sort((left, right) => left - right);
	if (frames.length <= 12) return frames;
	return Array.from(
		{ length: 12 },
		(_, index) => frames[Math.round((index / 11) * (frames.length - 1))]
	).filter(
		(frame, index, values) => index === 0 || frame !== values[index - 1]
	);
}

export function buildCustomCutoutExpression({
	customCutout,
	fps,
	timeVariable = `(N/${Math.max(1, fps)})`,
}: {
	customCutout?: VideoVisual["customCutout"];
	fps: number;
	timeVariable?: string;
}): string {
	if (
		!customCutout?.enabled ||
		!customCutout.applyStrokes ||
		customCutout.strokes.length === 0
	) {
		return "1";
	}
	const strokes = customCutout.strokes
		.filter((stroke) => stroke.points.length > 0)
		.sort((left, right) => left.frame - right.frame);
	const frames = correctionFrames({ strokes });
	if (frames.length === 0) return "1";
	const snapshots = frames.map((frame) => ({
		frame,
		expression: staticCutoutExpression({
			strokes: strokes.filter((stroke) => stroke.frame <= frame),
		}),
	}));
	let expression = snapshots[snapshots.length - 1].expression;
	for (let index = snapshots.length - 2; index >= 0; index -= 1) {
		const next = snapshots[index + 1];
		expression = `if(lt(${timeVariable},${next.frame / Math.max(1, fps)}),${snapshots[index].expression},${expression})`;
	}
	return expression;
}
