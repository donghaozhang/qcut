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

export class StickerTrackingExportError extends Error {}

export class StickerTrackingExportLimitError extends StickerTrackingExportError {
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

export class StickerTrackingExportDataError extends StickerTrackingExportError {
	constructor({
		elementId,
		targetElementId,
		targetMaskId,
		frame,
		property,
		value,
	}: {
		elementId: string;
		targetElementId: string;
		targetMaskId: string;
		frame: number;
		property: TrackingExportProperty;
		value: unknown;
	}) {
		super(
			`Sticker ${elementId} tracking target ${targetElementId}/${targetMaskId} produced invalid ${property}=${String(value)} at export frame ${frame}. Re-run tracking before exporting.`
		);
		this.name = "StickerTrackingExportDataError";
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
	const tracking = element.tracking;
	if (!tracking) return;
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
			candidate.element.id === tracking.targetElementId &&
			candidate.mask.id === tracking.targetMaskId
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

	const properties: TrackingExportProperty[] = tracking.followScale
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
			if (typeof value !== "number" || !Number.isFinite(value)) {
				throw new StickerTrackingExportDataError({
					elementId: element.id,
					targetElementId: target.element.id,
					targetMaskId: tracking.targetMaskId,
					frame,
					property,
					value,
				});
			}
			result[property]?.push(
				valueKeyframe({ element, property, frame, value })
			);
		}
	}
	return result;
}
