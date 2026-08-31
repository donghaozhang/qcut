import {
	getStickerFrameContext,
	resolveStickerKeyframes,
} from "./sticker-keyframes";
import {
	getStickerTrackingTargets,
	resolveStickerMotionTracking,
} from "./sticker-tracking";
import type {
	PlanarTrackingSidecarV1,
	StickerElement,
	StickerKeyframeProperty,
	StickerPropertyKeyframe,
	TimelineTrack,
} from "@/types/timeline";
import type { OverlaySticker } from "@/types/sticker-overlay";
import { resolveTimelineStickerVisualAtTime } from "./timeline-sticker-visual";

type TrackingExportProperty = "x" | "y" | "width" | "height";

export type StickerTrackingExportKeyframes = Partial<
	Record<StickerKeyframeProperty, StickerPropertyKeyframe[]>
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

export class StickerPlanarTrackingExportDataError extends StickerTrackingExportError {
	constructor({
		detail,
		elementId,
	}: {
		detail: string;
		elementId: string;
	}) {
		super(
			`Sticker ${elementId} planar tracking cannot be exported: ${detail}. Re-run planar tracking before exporting.`
		);
		this.name = "StickerPlanarTrackingExportDataError";
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
	property: StickerKeyframeProperty;
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

const PLANAR_EXPORT_PROPERTIES = [
	"x",
	"y",
	"width",
	"height",
	"rotation",
	"opacity",
	"topLeftX",
	"topLeftY",
	"topRightX",
	"topRightY",
	"bottomRightX",
	"bottomRightY",
	"bottomLeftX",
	"bottomLeftY",
] as const satisfies readonly StickerKeyframeProperty[];

function planarVisualProperty({
	property,
	sticker,
}: {
	property: StickerKeyframeProperty;
	sticker: OverlaySticker;
}): number | undefined {
	if (property === "x") return sticker.position.x;
	if (property === "y") return sticker.position.y;
	if (property === "width") return sticker.size.width;
	if (property === "height") return sticker.size.height;
	if (property === "rotation") return sticker.rotation;
	if (property === "opacity") return sticker.opacity;
	return sticker.perspective?.[property];
}

export function buildStickerPlanarTrackingExportKeyframes({
	canvasHeight,
	canvasWidth,
	element,
	fallback,
	fps,
	sidecar,
	tracks,
}: {
	canvasHeight: number;
	canvasWidth: number;
	element: StickerElement;
	fallback?: OverlaySticker;
	fps: number;
	sidecar: PlanarTrackingSidecarV1 | undefined;
	tracks: TimelineTrack[];
}): StickerTrackingExportKeyframes | undefined {
	const binding = element.tracking;
	if (binding?.mode !== "planar") return;
	if (!sidecar) {
		throw new StickerPlanarTrackingExportDataError({
			detail: "the verified sidecar is unavailable",
			elementId: element.id,
		});
	}
	const source = tracks
		.flatMap((track) => track.elements)
		.find((candidate) => candidate.id === binding.sourceElementId);
	if (source?.type !== "media" || source.mediaId !== sidecar.source.mediaId) {
		throw new StickerPlanarTrackingExportDataError({
			detail: "the sidecar does not match its source media",
			elementId: element.id,
		});
	}
	if (
		!Number.isFinite(canvasWidth) ||
		!Number.isFinite(canvasHeight) ||
		canvasWidth <= 0 ||
		canvasHeight <= 0
	) {
		throw new StickerPlanarTrackingExportDataError({
			detail: "the export canvas dimensions are invalid",
			elementId: element.id,
		});
	}
	const sampleFps = normalizedExportFps({ fps });
	const { clipDurationFrames: maxFrame } = getStickerFrameContext({
		element,
		currentTime: element.startTime,
		fps: sampleFps,
	});
	if (!Number.isSafeInteger(maxFrame) || maxFrame < 0) {
		throw new StickerPlanarTrackingExportDataError({
			detail: "the clip duration is invalid",
			elementId: element.id,
		});
	}
	const sampleCount = maxFrame + 1;
	if (sampleCount > MAX_TRACKING_EXPORT_SAMPLES) {
		throw new StickerTrackingExportLimitError({
			elementId: element.id,
			sampleCount,
		});
	}
	const result: StickerTrackingExportKeyframes = Object.fromEntries(
		PLANAR_EXPORT_PROPERTIES.map((property) => [property, []])
	);
	for (let frame = 0; frame <= maxFrame; frame += 1) {
		const currentTime = element.startTime + frame / sampleFps;
		const visual = resolveTimelineStickerVisualAtTime({
			canvasHeight,
			canvasWidth,
			currentTime,
			element,
			fallback,
			fps: sampleFps,
			planarTrackingSidecar: sidecar,
			tracks,
		});
		for (const property of PLANAR_EXPORT_PROPERTIES) {
			const value = planarVisualProperty({ property, sticker: visual });
			if (typeof value !== "number" || !Number.isFinite(value)) {
				throw new StickerPlanarTrackingExportDataError({
					detail: `frame ${frame.toString()} produced invalid ${property}=${String(value)}`,
					elementId: element.id,
				});
			}
			result[property]?.push(
				valueKeyframe({ element, frame, property, value })
			);
		}
	}
	return result;
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
	if (!tracking || tracking.mode !== "motion") return;
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
