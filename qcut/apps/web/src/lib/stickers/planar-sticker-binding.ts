import {
	buildPlanarHomography,
	buildRelativePlanarHomography,
	projectPlanarPoint,
	projectPlanarQuad,
} from "@qcut/editor-core";
import type {
	MediaElement,
	MediaPerspective,
	NormalizedPoint,
	PlanarQuad,
	PlanarTrackingSample,
	PlanarTrackingSidecarV1,
	StickerElement,
	TimelineTrack,
} from "@/types/timeline";
import type { OverlaySticker } from "@/types/sticker-overlay";
import { getPlanarFitMapping } from "@/lib/tracking/planar-tracking-overlay-geometry";
import { getMediaSourcePlaybackTime } from "@/lib/video/video-timing";
import { resolveMediaKeyframes } from "@/lib/video/video-properties";

interface PlanarSampleResolution {
	quad?: PlanarQuad;
	visible: boolean;
}

const QUAD_KEYS = ["topLeft", "topRight", "bottomRight", "bottomLeft"] as const;

function interpolatePoint({
	from,
	progress,
	to,
}: {
	from: NormalizedPoint;
	progress: number;
	to: NormalizedPoint;
}): NormalizedPoint {
	return {
		x: from.x + (to.x - from.x) * progress,
		y: from.y + (to.y - from.y) * progress,
	};
}

function interpolateQuad({
	from,
	progress,
	to,
}: {
	from: PlanarQuad;
	progress: number;
	to: PlanarQuad;
}): PlanarQuad {
	return Object.fromEntries(
		QUAD_KEYS.map((key) => [
			key,
			interpolatePoint({ from: from[key], progress, to: to[key] }),
		])
	) as unknown as PlanarQuad;
}

function lastTrackedSample({
	fromIndex,
	samples,
}: {
	fromIndex: number;
	samples: PlanarTrackingSample[];
}): PlanarTrackingSample | undefined {
	for (let index = fromIndex; index >= 0; index--) {
		if (samples[index]?.status !== "lost") return samples[index];
	}
}

export function resolvePlanarSampleQuad({
	lostBehavior,
	ptsUs,
	sidecar,
}: {
	lostBehavior: "hold" | "hide";
	ptsUs: number;
	sidecar: PlanarTrackingSidecarV1;
}): PlanarSampleResolution {
	const { samples } = sidecar;
	if (samples.length === 0) return { visible: false };
	let low = 0;
	let high = samples.length - 1;
	while (low <= high) {
		const middle = Math.floor((low + high) / 2);
		if (samples[middle].ptsUs < ptsUs) low = middle + 1;
		else high = middle - 1;
	}
	const rightIndex = low;
	const exact = samples[rightIndex]?.ptsUs === ptsUs;
	if (exact) {
		const sample = samples[rightIndex];
		if (sample.status !== "lost") return { quad: sample.quad, visible: true };
		const held = lastTrackedSample({ fromIndex: rightIndex - 1, samples });
		return lostBehavior === "hold" && held
			? { quad: held.quad, visible: true }
			: { visible: false };
	}
	const left = samples[rightIndex - 1];
	const right = samples[rightIndex];
	if (!left || !right) {
		const boundary = left ?? right;
		return lostBehavior === "hold" && boundary?.status !== "lost"
			? { quad: boundary.quad, visible: true }
			: { visible: false };
	}
	if (left.status === "lost" || right.status === "lost") {
		const held = lastTrackedSample({ fromIndex: rightIndex - 1, samples });
		return lostBehavior === "hold" && held
			? { quad: held.quad, visible: true }
			: { visible: false };
	}
	const progress = (ptsUs - left.ptsUs) / Math.max(1, right.ptsUs - left.ptsUs);
	return {
		quad: interpolateQuad({ from: left.quad, progress, to: right.quad }),
		visible: true,
	};
}

function sourcePointToCanvas({
	canvasHeight,
	canvasWidth,
	fitMode,
	perspective,
	point,
	sourceHeight,
	sourceWidth,
}: {
	canvasHeight: number;
	canvasWidth: number;
	fitMode: "contain" | "cover" | "fill";
	perspective: MediaPerspective;
	point: NormalizedPoint;
	sourceHeight: number;
	sourceWidth: number;
}): NormalizedPoint {
	const mapping = getPlanarFitMapping({
		containerHeight: canvasHeight,
		containerWidth: canvasWidth,
		fitMode,
		sourceHeight,
		sourceWidth,
	});
	const fitted = {
		x: mapping.offsetX + point.x * mapping.displayWidth,
		y: mapping.offsetY + point.y * mapping.displayHeight,
	};
	const matrix = buildPlanarHomography({
		source: {
			topLeft: { x: 0, y: 0 },
			topRight: { x: canvasWidth, y: 0 },
			bottomRight: { x: canvasWidth, y: canvasHeight },
			bottomLeft: { x: 0, y: canvasHeight },
		},
		destination: {
			topLeft: {
				x: perspective.topLeftX * canvasWidth,
				y: perspective.topLeftY * canvasHeight,
			},
			topRight: {
				x: perspective.topRightX * canvasWidth,
				y: perspective.topRightY * canvasHeight,
			},
			bottomRight: {
				x: perspective.bottomRightX * canvasWidth,
				y: perspective.bottomRightY * canvasHeight,
			},
			bottomLeft: {
				x: perspective.bottomLeftX * canvasWidth,
				y: perspective.bottomLeftY * canvasHeight,
			},
		},
	});
	return matrix
		? (projectPlanarPoint({ point: fitted, matrix }) ?? fitted)
		: fitted;
}

function applyMediaTransform({
	canvasHeight,
	canvasWidth,
	flipHorizontal,
	flipVertical,
	point,
	rotation,
	scaleX,
	scaleY,
	x,
	y,
}: {
	canvasHeight: number;
	canvasWidth: number;
	flipHorizontal: boolean;
	flipVertical: boolean;
	point: NormalizedPoint;
	rotation: number;
	scaleX: number;
	scaleY: number;
	x: number;
	y: number;
}): NormalizedPoint {
	const centerX = canvasWidth / 2;
	const centerY = canvasHeight / 2;
	const radians = (rotation * Math.PI) / 180;
	const cosine = Math.cos(radians);
	const sine = Math.sin(radians);
	const deltaX = (point.x - centerX) * scaleX * (flipHorizontal ? -1 : 1);
	const deltaY = (point.y - centerY) * scaleY * (flipVertical ? -1 : 1);
	return {
		x: centerX + x + deltaX * cosine - deltaY * sine,
		y: centerY + y + deltaX * sine + deltaY * cosine,
	};
}

function trackedQuadToCanvas({
	canvasHeight,
	canvasWidth,
	currentTime,
	fps,
	quad,
	sidecar,
	sourceElement,
}: {
	canvasHeight: number;
	canvasWidth: number;
	currentTime: number;
	fps: number;
	quad: PlanarQuad;
	sidecar: PlanarTrackingSidecarV1;
	sourceElement: MediaElement;
}): PlanarQuad {
	const visual = resolveMediaKeyframes({
		element: sourceElement,
		currentTime,
		fps,
	});
	return Object.fromEntries(
		QUAD_KEYS.map((key) => {
			const fitted = sourcePointToCanvas({
				canvasHeight,
				canvasWidth,
				fitMode: visual.fitMode,
				perspective: visual.perspective,
				point: quad[key],
				sourceHeight: sidecar.source.displayHeight,
				sourceWidth: sidecar.source.displayWidth,
			});
			return [
				key,
				applyMediaTransform({
					canvasHeight,
					canvasWidth,
					flipHorizontal: visual.flipHorizontal,
					flipVertical: visual.flipVertical,
					point: fitted,
					rotation: visual.rotation,
					scaleX: visual.scaleX,
					scaleY: visual.scaleY,
					x: visual.x,
					y: visual.y,
				}),
			];
		})
	) as unknown as PlanarQuad;
}

function applyCanvasQuadToSticker({
	canvasHeight,
	canvasWidth,
	quad,
	sticker,
}: {
	canvasHeight: number;
	canvasWidth: number;
	quad: PlanarQuad;
	sticker: OverlaySticker;
}): OverlaySticker {
	const points = QUAD_KEYS.map((key) => quad[key]);
	const left = Math.min(...points.map((point) => point.x));
	const right = Math.max(...points.map((point) => point.x));
	const top = Math.min(...points.map((point) => point.y));
	const bottom = Math.max(...points.map((point) => point.y));
	const width = Math.max(1e-6, right - left);
	const height = Math.max(1e-6, bottom - top);
	const shortSide = Math.max(1e-6, Math.min(canvasWidth, canvasHeight));
	return {
		...sticker,
		maintainAspectRatio: false,
		position: {
			x: ((left + right) / 2 / canvasWidth) * 100,
			y: ((top + bottom) / 2 / canvasHeight) * 100,
		},
		size: {
			width: (width / shortSide) * 100,
			height: (height / shortSide) * 100,
		},
		rotation: 0,
		perspective: {
			topLeftX: (quad.topLeft.x - left) / width,
			topLeftY: (quad.topLeft.y - top) / height,
			topRightX: (quad.topRight.x - left) / width,
			topRightY: (quad.topRight.y - top) / height,
			bottomRightX: (quad.bottomRight.x - left) / width,
			bottomRightY: (quad.bottomRight.y - top) / height,
			bottomLeftX: (quad.bottomLeft.x - left) / width,
			bottomLeftY: (quad.bottomLeft.y - top) / height,
		},
	};
}

function findSourceElement({
	sourceElementId,
	tracks,
}: {
	sourceElementId: string;
	tracks: TimelineTrack[];
}): MediaElement | undefined {
	const source = tracks
		.flatMap((track) => track.elements)
		.find((candidate) => candidate.id === sourceElementId);
	return source?.type === "media" ? source : undefined;
}

export function resolveStickerPlanarTracking({
	canvasHeight,
	canvasWidth,
	currentTime,
	element,
	fps,
	sidecar,
	sticker,
	tracks,
}: {
	canvasHeight: number;
	canvasWidth: number;
	currentTime: number;
	element: StickerElement;
	fps: number;
	sidecar: PlanarTrackingSidecarV1 | undefined;
	sticker: OverlaySticker;
	tracks: TimelineTrack[];
}): OverlaySticker {
	const binding = element.tracking;
	if (binding?.mode !== "planar" || !sidecar) return sticker;
	const sourceElement = findSourceElement({
		sourceElementId: binding.sourceElementId,
		tracks,
	});
	if (!sourceElement || sidecar.source.mediaId !== sourceElement.mediaId) {
		return sticker;
	}
	const sourceTime = getMediaSourcePlaybackTime({
		element: sourceElement,
		fps,
		localTimelineTime: currentTime - sourceElement.startTime,
	});
	const sample = resolvePlanarSampleQuad({
		lostBehavior: binding.lostBehavior,
		ptsUs: Math.max(0, Math.round(sourceTime * 1_000_000)),
		sidecar,
	});
	if (!sample.visible || !sample.quad) return { ...sticker, opacity: 0 };
	const relative = buildRelativePlanarHomography({
		seedQuad: sidecar.seed.quad,
		currentQuad: sample.quad,
	});
	const targetQuad = relative
		? projectPlanarQuad({ quad: binding.seedTargetQuad, matrix: relative })
		: undefined;
	if (!targetQuad) return { ...sticker, opacity: 0 };
	return applyCanvasQuadToSticker({
		canvasHeight,
		canvasWidth,
		quad: trackedQuadToCanvas({
			canvasHeight,
			canvasWidth,
			currentTime,
			fps,
			quad: targetQuad,
			sidecar,
			sourceElement,
		}),
		sticker,
	});
}
