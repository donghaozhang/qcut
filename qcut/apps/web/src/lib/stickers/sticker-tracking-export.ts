import {
	getStickerFrameContext,
	resolveStickerKeyframes,
} from "./sticker-keyframes";
import {
	getStickerTrackingTargets,
	resolveStickerMotionTracking,
} from "./sticker-tracking";
import type {
	StickerElement,
	StickerPropertyKeyframe,
	TimelineTrack,
} from "@/types/timeline";

type TrackingExportProperty = "x" | "y" | "width" | "height";

export type StickerTrackingExportKeyframes = Partial<
	Record<TrackingExportProperty, StickerPropertyKeyframe[]>
>;

const MAX_TRACKING_EXPORT_SAMPLES = 18_001;

export class StickerTrackingExportLimitError extends Error {
	constructor({
		elementId,
		sampleCount,
	}: {
		elementId: string;
		sampleCount: number;
	}) {
		super(
			`Sticker ${elementId} needs ${sampleCount.toLocaleString("en-US")} tracking samples, exceeding the ${MAX_TRACKING_EXPORT_SAMPLES.toLocaleString("en-US")} sample export limit. Shorten the clip or reduce the project frame rate.`
		);
		this.name = "StickerTrackingExportLimitError";
	}
}

function normalizedExportFps({ fps }: { fps: number }): number {
	if (!Number.isFinite(fps) || fps <= 0) return 30;
	return Math.min(240, fps);
}

function valueKeyframe({
	element,
	property,
	frame,
	value,
}: {
	element: StickerElement;
	property: TrackingExportProperty;
	frame: number;
	value: number;
}): StickerPropertyKeyframe {
	return {
		id: `${element.id}-tracking-${property}-${frame.toString()}`,
		frame,
		value,
		easing: "linear",
	};
}

export function buildStickerTrackingExportKeyframes({
	element,
	tracks,
	fps,
	canvasWidth,
	canvasHeight,
}: {
	element: StickerElement;
	tracks: TimelineTrack[];
	fps: number;
	canvasWidth: number;
	canvasHeight: number;
}): StickerTrackingExportKeyframes | undefined {
	if (!element.tracking) return;
	if (
		!Number.isFinite(canvasWidth) ||
		!Number.isFinite(canvasHeight) ||
		canvasWidth <= 0 ||
		canvasHeight <= 0
	) {
		return;
	}
	const sampleFps = normalizedExportFps({ fps });
	const target = getStickerTrackingTargets({
		sticker: element,
		tracks,
		fps: sampleFps,
	}).find(
		(candidate) =>
			candidate.element.id === element.tracking?.targetElementId &&
			candidate.mask.id === element.tracking?.targetMaskId
	);
	if (!target) return;

	const { clipDurationFrames: maxFrame } = getStickerFrameContext({
		element,
		currentTime: element.startTime,
		fps: sampleFps,
	});
	if (!Number.isSafeInteger(maxFrame) || maxFrame < 0) return;
	const sampleCount = maxFrame + 1;
	if (sampleCount > MAX_TRACKING_EXPORT_SAMPLES) {
		throw new StickerTrackingExportLimitError({
			elementId: element.id,
			sampleCount,
		});
	}

	const properties: TrackingExportProperty[] = element.tracking.followScale
		? ["x", "y", "width", "height"]
		: ["x", "y"];
	const result: StickerTrackingExportKeyframes = {};
	for (const property of properties) {
		result[property] = [];
	}
	for (let frame = 0; frame <= maxFrame; frame += 1) {
		const currentTime = element.startTime + frame / sampleFps;
		const keyframed = resolveStickerKeyframes({
			element,
			currentTime,
			fps: sampleFps,
		});
		const resolved = resolveStickerMotionTracking({
			element: keyframed,
			tracks,
			currentTime,
			fps: sampleFps,
			canvasWidth,
			canvasHeight,
		});
		for (const property of properties) {
			const value = resolved[property];
			if (typeof value !== "number" || !Number.isFinite(value)) return;
			result[property]?.push(
				valueKeyframe({ element, property, frame, value })
			);
		}
	}
	return result;
}
