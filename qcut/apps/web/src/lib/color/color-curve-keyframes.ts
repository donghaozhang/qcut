import type {
	ColorCurvePoint,
	ColorCurveShapeKeyframe,
	ColorCurveShapeProperty,
	MediaColorSettings,
} from "@/types/timeline";
import { createCurveSampler } from "./color-curve-math";
import { buildSecondaryCurve } from "./color-secondary-curves";

const INTERPOLATED_POINT_COUNT = 65;

function easedProgress({
	progress,
	easing,
}: {
	progress: number;
	easing: ColorCurveShapeKeyframe["easing"];
}): number {
	if (easing === "easeIn") return progress ** 2;
	if (easing === "easeOut") return 1 - (1 - progress) ** 2;
	if (easing === "easeInOut") return progress ** 2 * (3 - 2 * progress);
	if (easing === "spring") {
		return progress + Math.sin(progress * Math.PI) * 0.15 * (1 - progress);
	}
	return progress;
}

function interpolatePoints({
	from,
	to,
	progress,
}: {
	from: ColorCurvePoint[];
	to: ColorCurvePoint[];
	progress: number;
}): ColorCurvePoint[] {
	const sampleFrom = createCurveSampler({ points: from });
	const sampleTo = createCurveSampler({ points: to });
	return Array.from({ length: INTERPOLATED_POINT_COUNT }, (_, index) => {
		const x = index / (INTERPOLATED_POINT_COUNT - 1);
		const fromY = sampleFrom(x);
		return {
			id: `interpolated-${index}`,
			x,
			y: fromY + (sampleTo(x) - fromY) * progress,
		};
	});
}

export function curveShapeAtFrame({
	base,
	keyframes,
	frame,
}: {
	base: ColorCurvePoint[];
	keyframes: ColorCurveShapeKeyframe[];
	frame: number;
}): ColorCurvePoint[] {
	const sorted = [...keyframes].sort((left, right) => left.frame - right.frame);
	if (sorted.length === 0) return base.map((point) => ({ ...point }));
	if (frame <= sorted[0].frame) {
		return sorted[0].points.map((point) => ({ ...point }));
	}
	for (let index = 1; index < sorted.length; index += 1) {
		const to = sorted[index];
		if (frame > to.frame) continue;
		const from = sorted[index - 1];
		if (frame === to.frame) return to.points.map((point) => ({ ...point }));
		const progress = (frame - from.frame) / Math.max(1, to.frame - from.frame);
		return interpolatePoints({
			from: from.points,
			to: to.points,
			progress: easedProgress({ progress, easing: to.easing }),
		});
	}
	return sorted.at(-1)?.points.map((point) => ({ ...point })) ?? base;
}

export function colorCurvePoints({
	settings,
	property,
}: {
	settings: MediaColorSettings;
	property: ColorCurveShapeProperty;
}): ColorCurvePoint[] {
	const [group, name] = property.split(".") as [
		"curves" | "secondaryCurves",
		string,
	];
	if (group === "curves") {
		return settings.curves[name as "master" | "red" | "green" | "blue"];
	}
	return settings.secondaryCurves[
		name as keyof Omit<MediaColorSettings["secondaryCurves"], "enabled" | "mix">
	].points;
}

export function setColorCurvePoints({
	settings,
	property,
	points,
}: {
	settings: MediaColorSettings;
	property: ColorCurveShapeProperty;
	points: ColorCurvePoint[];
}): MediaColorSettings {
	const [group, name] = property.split(".") as [
		"curves" | "secondaryCurves",
		string,
	];
	if (group === "curves") {
		return {
			...settings,
			curves: { ...settings.curves, [name]: points },
		};
	}
	return {
		...settings,
		secondaryCurves: {
			...settings.secondaryCurves,
			[name]: buildSecondaryCurve({ points }),
		},
	};
}

export function resolveColorCurveShapes({
	settings,
	frame,
}: {
	settings: MediaColorSettings;
	frame: number;
}): MediaColorSettings {
	let resolved = settings;
	for (const [property, keyframes] of Object.entries(
		settings.curveShapeKeyframes ?? {}
	) as Array<
		[ColorCurveShapeProperty, ColorCurveShapeKeyframe[] | undefined]
	>) {
		if (!keyframes?.length) continue;
		resolved = setColorCurvePoints({
			settings: resolved,
			property,
			points: curveShapeAtFrame({
				base: colorCurvePoints({ settings, property }),
				keyframes,
				frame,
			}),
		});
	}
	return resolved;
}

export function upsertCurveShapeKeyframe({
	keyframes,
	keyframe,
}: {
	keyframes: ColorCurveShapeKeyframe[];
	keyframe: ColorCurveShapeKeyframe;
}): ColorCurveShapeKeyframe[] {
	return [
		...keyframes.filter(
			(candidate) =>
				candidate.id !== keyframe.id && candidate.frame !== keyframe.frame
		),
		keyframe,
	].sort((left, right) => left.frame - right.frame);
}

export function removeCurveShapeKeyframes({
	settings,
	properties,
}: {
	settings: MediaColorSettings;
	properties: ColorCurveShapeProperty[];
}): MediaColorSettings {
	const removed = new Set(properties);
	return {
		...settings,
		curveShapeKeyframes: Object.fromEntries(
			Object.entries(settings.curveShapeKeyframes ?? {}).filter(
				([property]) => !removed.has(property as ColorCurveShapeProperty)
			)
		) as MediaColorSettings["curveShapeKeyframes"],
	};
}
