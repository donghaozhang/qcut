import type { CursorTelemetryData } from "@/types/electron/cursor-telemetry";
import type { TextPropertyKeyframe } from "@/types/timeline";

export interface CursorTextTrackingResult {
	x: TextPropertyKeyframe[];
	y: TextPropertyKeyframe[];
}

export function buildCursorTextTrackingKeyframes({
	telemetry,
	canvasSize,
	elementStartTime,
	elementDuration,
	fps,
	offset = { x: 32, y: 32 },
	sampleIntervalMs = 250,
}: {
	telemetry: CursorTelemetryData;
	canvasSize: { width: number; height: number };
	elementStartTime: number;
	elementDuration: number;
	fps: number;
	offset?: { x: number; y: number };
	sampleIntervalMs?: number;
}): CursorTextTrackingResult {
	const endTime = elementStartTime + elementDuration;
	const x: TextPropertyKeyframe[] = [];
	const y: TextPropertyKeyframe[] = [];
	let lastSampleTime = Number.NEGATIVE_INFINITY;

	for (const [index, point] of telemetry.points.entries()) {
		const pointTime = point.t / 1000;
		if (pointTime < elementStartTime || pointTime > endTime) continue;
		const isLastPoint = index === telemetry.points.length - 1;
		if (!isLastPoint && point.t - lastSampleTime < sampleIntervalMs) continue;
		lastSampleTime = point.t;

		const normalizedX =
			(point.x - telemetry.captureRect.x) / telemetry.captureRect.width;
		const normalizedY =
			(point.y - telemetry.captureRect.y) / telemetry.captureRect.height;
		const frame = Math.max(0, Math.round((pointTime - elementStartTime) * fps));
		const xValue =
			(Math.min(1, Math.max(0, normalizedX)) - 0.5) * canvasSize.width +
			offset.x;
		const yValue =
			(Math.min(1, Math.max(0, normalizedY)) - 0.5) * canvasSize.height +
			offset.y;

		// The forced last telemetry point can round to the same frame as the
		// prior sample; keep the newest value instead of emitting a duplicate.
		if (x.length > 0 && x[x.length - 1].frame === frame) {
			x.pop();
			y.pop();
		}

		x.push({
			id: `cursor-x-${frame}`,
			frame,
			value: Math.round(xValue),
			easing: "linear",
		});
		y.push({
			id: `cursor-y-${frame}`,
			frame,
			value: Math.round(yValue),
			easing: "linear",
		});
	}

	return { x, y };
}
