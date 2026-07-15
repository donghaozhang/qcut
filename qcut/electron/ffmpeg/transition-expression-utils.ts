import type { VideoTransition } from "./types";

export type PlaneSampler = ({
	input,
	x,
	y,
}: {
	input: "a" | "b";
	x: string;
	y: string;
}) => string;

export function tintPlaneExpression({
	tint,
}: {
	tint: string | undefined;
}): string {
	const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(tint ?? "");
	const [red, green, blue] = match
		? match.slice(1).map((part) => Number.parseInt(part, 16))
		: [255, 90, 31];
	// xfade runs in gbrap, so planes 0/1/2 are green/blue/red.
	return `if(eq(PLANE,0),${green},if(eq(PLANE,1),${blue},if(eq(PLANE,2),${red},255)))`;
}

export function planeSample({
	input,
	x,
	y,
}: {
	input: "a" | "b";
	x: string;
	y: string;
}): string {
	return (
		"if(eq(PLANE,0)," +
		input +
		"0(" +
		x +
		"," +
		y +
		"),if(eq(PLANE,1)," +
		input +
		"1(" +
		x +
		"," +
		y +
		"),if(eq(PLANE,2)," +
		input +
		"2(" +
		x +
		"," +
		y +
		")," +
		input +
		"3(" +
		x +
		"," +
		y +
		"))))"
	);
}

function clampSampleCoordinate({
	value,
	limit,
}: {
	value: string;
	limit: "W" | "H";
}): string {
	return "min(max(" + value + ",0)," + limit + "-1)";
}

export function clampedPlaneSample({
	input,
	x,
	y,
}: {
	input: "a" | "b";
	x: string;
	y: string;
}): string {
	return planeSample({
		input,
		x: clampSampleCoordinate({ value: x, limit: "W" }),
		y: clampSampleCoordinate({ value: y, limit: "H" }),
	});
}

export function transitionPeakExpression({
	progress,
}: {
	progress: string;
}): string {
	return "(4*(" + progress + ")*(1-(" + progress + ")))";
}

export function blendSamples({
	progress,
	outgoing,
	incoming,
}: {
	progress: string;
	outgoing: string;
	incoming: string;
}): string {
	return (
		"(" +
		outgoing +
		")*(1-(" +
		progress +
		"))+(" +
		incoming +
		")*(" +
		progress +
		")"
	);
}

export function motionBlurPlaneSample({
	input,
	x,
	y,
	direction,
	radius,
}: {
	input: "a" | "b";
	x: string;
	y: string;
	direction: VideoTransition["direction"];
	radius: string;
}): string {
	const horizontal = direction !== "up" && direction !== "down";
	const coordinates = [-1, 0, 1].map((offset) => ({
		x: horizontal ? "(" + x + ")+" + offset + "*(" + radius + ")" : x,
		y: horizontal ? y : "(" + y + ")+" + offset + "*(" + radius + ")",
	}));
	const samples = coordinates.map(({ x: sampleX, y: sampleY }) =>
		clampedPlaneSample({ input, x: sampleX, y: sampleY })
	);
	return "(" + samples.join("+") + ")/3";
}
