import type {
	JianyingMotionTrackingAPI,
	JianyingMotionTrackingDirection,
	JianyingMotionTrackingRequest,
	JianyingMotionTrackingResult,
} from "@/types/electron/api-jianying-motion-tracking";
import type {
	MediaElement,
	MediaMask,
	MediaMaskTrackingDirection,
} from "@/types/timeline";
import { applyMaskTrackingSamples } from "./media-mask-tracking";
import { resolveMediaMaskKeyframes } from "./video-properties";
import {
	getMediaSourcePlaybackTime,
	getMediaTimelineDuration,
	mapMediaSourceTime,
} from "./video-timing";

interface PreparedMotionTrackingRequest {
	request: JianyingMotionTrackingRequest;
	resolvedMask: MediaMask;
}

function clamp({
	maximum,
	minimum,
	value,
}: {
	maximum: number;
	minimum: number;
	value: number;
}) {
	return Math.min(maximum, Math.max(minimum, value));
}

function normalizeRotationDelta({ degrees }: { degrees: number }) {
	return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

export function motionTrackingRectForMask({ mask }: { mask: MediaMask }) {
	const radians = ((mask.rotation ?? 0) * Math.PI) / 180;
	const axisAlignedWidth =
		Math.abs(mask.width * Math.cos(radians)) +
		Math.abs(mask.height * Math.sin(radians));
	const axisAlignedHeight =
		Math.abs(mask.width * Math.sin(radians)) +
		Math.abs(mask.height * Math.cos(radians));
	const left = clamp({
		minimum: 0,
		maximum: 1,
		value: mask.centerX - axisAlignedWidth / 2,
	});
	const right = clamp({
		minimum: 0,
		maximum: 1,
		value: mask.centerX + axisAlignedWidth / 2,
	});
	const top = clamp({
		minimum: 0,
		maximum: 1,
		value: mask.centerY - axisAlignedHeight / 2,
	});
	const bottom = clamp({
		minimum: 0,
		maximum: 1,
		value: mask.centerY + axisAlignedHeight / 2,
	});
	if (right - left < 0.001 || bottom - top < 0.001) {
		throw new Error("当前蒙版没有可跟踪的有效区域");
	}
	return { bottom, left, right, top };
}

export function sourceTrackingDirection({
	direction,
	reverse,
}: {
	direction: MediaMaskTrackingDirection;
	reverse: boolean;
}): JianyingMotionTrackingDirection {
	if (!reverse || direction === "both") return direction;
	return direction === "forward" ? "backward" : "forward";
}

export function prepareJianyingMotionTrackingRequest({
	currentFrame,
	direction,
	element,
	fps,
	mask,
	sourcePath,
	taskId,
}: {
	currentFrame: number;
	direction: MediaMaskTrackingDirection;
	element: MediaElement;
	fps: number;
	mask: MediaMask;
	sourcePath: string;
	taskId: string;
}): PreparedMotionTrackingRequest {
	if ((element.freezeFrameDuration ?? 0) > 0) {
		throw new Error("运动跟踪暂不支持带定格的片段，请先移除定格");
	}
	if (!sourcePath.trim()) throw new Error("找不到视频的本机路径");
	const rangeStartTimeSeconds = Math.max(0, element.trimStart);
	const rangeEndTimeSeconds = Math.max(
		rangeStartTimeSeconds,
		element.duration - element.trimEnd
	);
	if (rangeEndTimeSeconds <= rangeStartTimeSeconds) {
		throw new Error("当前片段没有可跟踪的视频范围");
	}
	const localTimelineTime = currentFrame / Math.max(1, fps);
	const anchorTimeSeconds = clamp({
		minimum: rangeStartTimeSeconds,
		maximum: rangeEndTimeSeconds,
		value: getMediaSourcePlaybackTime({ element, localTimelineTime, fps }),
	});
	const resolvedMask = resolveMediaMaskKeyframes({
		mask,
		currentTime: element.startTime + localTimelineTime,
		elementStartTime: element.startTime,
		fps,
	});
	return {
		request: {
			anchorTimeSeconds,
			direction: sourceTrackingDirection({
				direction,
				reverse: Boolean(element.reverse),
			}),
			initialRect: motionTrackingRectForMask({ mask: resolvedMask }),
			rangeEndTimeSeconds,
			rangeStartTimeSeconds,
			sourcePath,
			taskId,
		},
		resolvedMask,
	};
}

function unwrappedRotations({
	result,
}: {
	result: JianyingMotionTrackingResult;
}) {
	const tracked = result.samples
		.filter(
			(sample) =>
				sample.status === "tracked" &&
				typeof sample.rotationDegrees === "number" &&
				Number.isFinite(sample.rotationDegrees)
		)
		.sort((first, second) => first.sourceTimeUs - second.sourceTimeUs);
	const rotations = new Map<number, number>();
	let previousRaw: number | undefined;
	let previousUnwrapped: number | undefined;
	for (const sample of tracked) {
		const raw = sample.rotationDegrees as number;
		const unwrapped =
			previousRaw === undefined || previousUnwrapped === undefined
				? raw
				: previousUnwrapped +
					normalizeRotationDelta({ degrees: raw - previousRaw });
		rotations.set(sample.frameIndex, unwrapped);
		previousRaw = raw;
		previousUnwrapped = unwrapped;
	}
	return rotations;
}

export function jianyingResultToMaskSamples({
	element,
	fps,
	result,
	resolvedMask,
}: {
	element: MediaElement;
	fps: number;
	result: JianyingMotionTrackingResult;
	resolvedMask: MediaMask;
}) {
	const rotations = unwrappedRotations({ result });
	const anchorRotation = rotations.get(result.anchorFrameIndex) ?? 0;
	const anchorSample = result.samples.find(
		(sample) =>
			sample.frameIndex === result.anchorFrameIndex &&
			sample.status === "tracked"
	);
	const anchorWidth = anchorSample
		? anchorSample.rect.right - anchorSample.rect.left
		: 0;
	const anchorHeight = anchorSample
		? anchorSample.rect.bottom - anchorSample.rect.top
		: 0;
	if (anchorWidth <= 0 || anchorHeight <= 0) {
		throw new Error("运动跟踪结果缺少有效锚点框");
	}
	return result.samples
		.filter(
			(sample) =>
				sample.status === "tracked" &&
				sample.rect.right > sample.rect.left &&
				sample.rect.bottom > sample.rect.top
		)
		.map((sample) => {
			const { bottom, left, right, top } = sample.rect;
			const rotation = rotations.get(sample.frameIndex);
			return {
				frame: Math.round(
					mapMediaSourceTime({
						element,
						fps,
						sourceTime: sample.sourceTimeUs / 1_000_000,
					}) * fps
				),
				centerX: (left + right) / 2,
				centerY: (top + bottom) / 2,
				width: resolvedMask.width * ((right - left) / anchorWidth),
				height: resolvedMask.height * ((bottom - top) / anchorHeight),
				rotation:
					rotation === undefined
						? undefined
						: resolvedMask.rotation + (rotation - anchorRotation),
			};
		});
}

export async function trackMediaMaskWithJianying({
	api,
	currentFrame,
	direction,
	element,
	fps,
	mask,
	sourcePath,
	taskId,
}: {
	api: JianyingMotionTrackingAPI;
	currentFrame: number;
	direction: MediaMaskTrackingDirection;
	element: MediaElement;
	fps: number;
	mask: MediaMask;
	sourcePath: string;
	taskId: string;
}): Promise<MediaMask> {
	const { request, resolvedMask } = prepareJianyingMotionTrackingRequest({
		currentFrame,
		direction,
		element,
		fps,
		mask,
		sourcePath,
		taskId,
	});
	const result = await api.track(request);
	const samples = jianyingResultToMaskSamples({
		element,
		fps,
		result,
		resolvedMask,
	});
	const trackedMask = applyMaskTrackingSamples({
		mask,
		samples,
		direction,
		anchorFrame: currentFrame,
		source: "jianying-bingo",
		maxFrame: Math.round(getMediaTimelineDuration(element, fps) * fps),
	});
	if (trackedMask.tracking?.status !== "ready") return trackedMask;
	return {
		...trackedMask,
		tracking: {
			...trackedMask.tracking,
			trackedFrames: samples.length,
			totalFrames: result.samples.length,
		},
	};
}
