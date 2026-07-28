import { getTimelineElementEndTime } from "@/lib/timeline";
import {
	resolveMediaKeyframes,
	resolveMediaMasks,
} from "@/lib/video/video-properties";
import { getMediaAnimationState } from "@/lib/video/video-animation";
import {
	buildPerspectiveMatrix3d,
	projectMediaPerspectivePoint,
} from "@/lib/video/video-perspective";
import type {
	MediaElement,
	MediaMask,
	StickerElement,
	StickerMotionTracking,
	StickerTrackingAnchor,
	TimelineTrack,
} from "@/types/timeline";

export interface StickerTrackingTarget {
	element: MediaElement;
	mask: MediaMask;
	trackId: string;
}

export interface StickerTrackingMediaTarget {
	element: MediaElement;
	trackId: string;
}

export interface StickerMotionTrackingTransform {
	offsetX: number;
	offsetY: number;
	scale: number;
}

interface Point {
	x: number;
	y: number;
}

function finiteOr({
	value,
	fallback,
}: {
	value: number | undefined;
	fallback: number;
}): number {
	return Number.isFinite(value) ? (value as number) : fallback;
}

function rotatePoint({
	point,
	degrees,
}: {
	point: Point;
	degrees: number;
}): Point {
	const radians = (degrees * Math.PI) / 180;
	const cosine = Math.cos(radians);
	const sine = Math.sin(radians);
	return {
		x: point.x * cosine - point.y * sine,
		y: point.x * sine + point.y * cosine,
	};
}

function distance({ from, to }: { from: Point; to: Point }): number {
	return Math.hypot(to.x - from.x, to.y - from.y);
}

function hasRealTrackingResult({ mask }: { mask: MediaMask }): boolean {
	const source = mask.tracking?.source;
	const trackedSource =
		source === "mediapipe" || source === "sam3" || source === "optical-flow";
	return Boolean(
		trackedSource &&
			mask.tracking?.status === "ready" &&
			mask.keyframes?.centerX?.length &&
			mask.keyframes?.centerY?.length
	);
}

export function getStickerTrackingTargets({
	sticker,
	tracks,
	fps,
}: {
	sticker: StickerElement;
	tracks: TimelineTrack[];
	fps: number;
}): StickerTrackingTarget[] {
	return getStickerTrackingMediaTargets({ sticker, tracks, fps }).flatMap(
		({ element, trackId }) =>
			resolveMediaMasks(element).flatMap((mask) =>
				hasRealTrackingResult({ mask }) && mask.id
					? [{ element, mask, trackId }]
					: []
			)
	);
}

export function getStickerTrackingMediaTargets({
	sticker,
	tracks,
	fps,
}: {
	sticker: StickerElement;
	tracks: TimelineTrack[];
	fps: number;
}): StickerTrackingMediaTarget[] {
	const stickerEnd = getTimelineElementEndTime({ element: sticker, fps });
	return tracks.flatMap((track) =>
		track.elements.flatMap((element) => {
			if (
				element.type !== "media" ||
				element.startTime >= stickerEnd ||
				getTimelineElementEndTime({ element, fps }) <= sticker.startTime
			) {
				return [];
			}
			return [{ element, trackId: track.id }];
		})
	);
}

function maskLocalPoints({
	mask,
	width,
	height,
}: {
	mask: MediaMask;
	width: number;
	height: number;
}): { center: Point; corners: [Point, Point, Point, Point] } {
	const center = {
		x: mask.centerX * width,
		y: mask.centerY * height,
	};
	const halfWidth = (mask.width * width) / 2;
	const halfHeight = (mask.height * height) / 2;
	const corners = [
		{ x: -halfWidth, y: -halfHeight },
		{ x: halfWidth, y: -halfHeight },
		{ x: halfWidth, y: halfHeight },
		{ x: -halfWidth, y: halfHeight },
	].map((point) => {
		const rotated = rotatePoint({
			point,
			degrees: finiteOr({ value: mask.rotation, fallback: 0 }),
		});
		return {
			x: center.x + rotated.x,
			y: center.y + rotated.y,
		};
	}) as [Point, Point, Point, Point];
	return { center, corners };
}

function targetCanvasPoint({
	point,
	width,
	height,
	matrix,
	scaleX,
	scaleY,
	rotation,
	center,
}: {
	point: Point;
	width: number;
	height: number;
	matrix: number[] | null;
	scaleX: number;
	scaleY: number;
	rotation: number;
	center: Point;
}): Point {
	const projected = matrix
		? projectMediaPerspectivePoint({ ...point, matrix })
		: point;
	const scaled = {
		x: (projected.x - width / 2) * scaleX,
		y: (projected.y - height / 2) * scaleY,
	};
	const rotated = rotatePoint({ point: scaled, degrees: rotation });
	return {
		x: center.x + rotated.x,
		y: center.y + rotated.y,
	};
}

export function resolveStickerTrackingTargetAnchor({
	target,
	currentTime,
	fps,
	canvasWidth,
	canvasHeight,
}: {
	target: StickerTrackingTarget;
	currentTime: number;
	fps: number;
	canvasWidth: number;
	canvasHeight: number;
}): StickerTrackingAnchor | null {
	const { element, mask: sourceMask } = target;
	if (
		currentTime < element.startTime ||
		currentTime > getTimelineElementEndTime({ element, fps }) ||
		canvasWidth <= 0 ||
		canvasHeight <= 0
	) {
		return null;
	}
	const visual = resolveMediaKeyframes({ element, currentTime, fps });
	const animation = getMediaAnimationState({
		element,
		currentTime,
		canvasWidth,
		canvasHeight,
	});
	const mask = visual.masks.find((candidate) => candidate.id === sourceMask.id);
	if (!mask) return null;

	const width = Math.max(
		1,
		finiteOr({ value: element.width, fallback: canvasWidth })
	);
	const height = Math.max(
		1,
		finiteOr({ value: element.height, fallback: canvasHeight })
	);
	const scaleX =
		visual.scaleX * animation.scale * (visual.flipHorizontal ? -1 : 1);
	const scaleY =
		visual.scaleY * animation.scale * (visual.flipVertical ? -1 : 1);
	const center = {
		x: canvasWidth / 2 + visual.x + animation.offsetX,
		y: canvasHeight / 2 + visual.y + animation.offsetY,
	};
	const matrix = buildPerspectiveMatrix3d({
		width,
		height,
		perspective: visual.perspective,
	});
	const local = maskLocalPoints({ mask, width, height });
	const project = (point: Point) =>
		targetCanvasPoint({
			point,
			width,
			height,
			matrix,
			scaleX,
			scaleY,
			rotation: visual.rotation,
			center,
		});
	const projectedCenter = project(local.center);
	const [topLeft, topRight, bottomRight, bottomLeft] =
		local.corners.map(project);
	const shortEdge = Math.min(canvasWidth, canvasHeight);

	return {
		centerX: (projectedCenter.x / canvasWidth) * 100,
		centerY: (projectedCenter.y / canvasHeight) * 100,
		width:
			((distance({ from: topLeft, to: topRight }) +
				distance({ from: bottomLeft, to: bottomRight })) /
				2 /
				shortEdge) *
			100,
		height:
			((distance({ from: topLeft, to: bottomLeft }) +
				distance({ from: topRight, to: bottomRight })) /
				2 /
				shortEdge) *
			100,
	};
}

export function createStickerMotionTracking({
	target,
	currentTime,
	fps,
	canvasWidth,
	canvasHeight,
}: {
	target: StickerTrackingTarget;
	currentTime: number;
	fps: number;
	canvasWidth: number;
	canvasHeight: number;
}): StickerMotionTracking | null {
	const anchor = resolveStickerTrackingTargetAnchor({
		target,
		currentTime,
		fps,
		canvasWidth,
		canvasHeight,
	});
	if (!anchor || !target.mask.id) return null;
	return {
		mode: "motion",
		targetElementId: target.element.id,
		targetMaskId: target.mask.id,
		anchor,
		followScale: false,
	};
}

export function resolveStickerMotionTracking({
	element,
	tracks,
	currentTime,
	fps,
	canvasWidth,
	canvasHeight,
}: {
	element: StickerElement;
	tracks: TimelineTrack[];
	currentTime: number;
	fps: number;
	canvasWidth: number;
	canvasHeight: number;
}): StickerElement {
	const transform = resolveStickerMotionTrackingTransform({
		element,
		tracks,
		currentTime,
		fps,
		canvasWidth,
		canvasHeight,
	});
	if (!transform) return element;
	return {
		...element,
		x: finiteOr({ value: element.x, fallback: 50 }) + transform.offsetX,
		y: finiteOr({ value: element.y, fallback: 50 }) + transform.offsetY,
		width: finiteOr({ value: element.width, fallback: 15 }) * transform.scale,
		height: finiteOr({ value: element.height, fallback: 15 }) * transform.scale,
	};
}

export function resolveStickerMotionTrackingTransform({
	element,
	tracks,
	currentTime,
	fps,
	canvasWidth,
	canvasHeight,
}: {
	element: StickerElement;
	tracks: TimelineTrack[];
	currentTime: number;
	fps: number;
	canvasWidth: number;
	canvasHeight: number;
}): StickerMotionTrackingTransform | null {
	const binding = element.tracking;
	if (!binding || binding.mode !== "motion") return null;
	const target = getStickerTrackingTargets({
		sticker: element,
		tracks,
		fps,
	}).find(
		(candidate) =>
			candidate.element.id === binding.targetElementId &&
			candidate.mask.id === binding.targetMaskId
	);
	if (!target) return null;
	const current = resolveStickerTrackingTargetAnchor({
		target,
		currentTime,
		fps,
		canvasWidth,
		canvasHeight,
	});
	if (!current) return null;

	const anchorArea = binding.anchor.width * binding.anchor.height;
	const currentArea = current.width * current.height;
	const scale =
		binding.followScale && anchorArea > 1e-9 && currentArea > 0
			? Math.sqrt(currentArea / anchorArea)
			: 1;
	return {
		offsetX: current.centerX - binding.anchor.centerX,
		offsetY: current.centerY - binding.anchor.centerY,
		scale,
	};
}
