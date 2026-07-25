import {
	findSurroundingKeyframes,
	interpolateNumber,
	sortKeyframes,
	type Keyframe,
} from "@/lib/remotion/keyframe-converter";
import type { MediaElement, MediaPropertyKeyframe } from "@/types/timeline";
import {
	getMediaSourceDuration,
	resolveSpeedAtSourceTime,
} from "./video-timing";

const TIME_EPSILON = 1e-7;

function framesMatch({
	left,
	right,
}: {
	left: number;
	right: number;
}): boolean {
	return Math.abs(left - right) <= TIME_EPSILON;
}

function getBoundaryEasing({
	keyframes,
	frame,
}: {
	keyframes: MediaPropertyKeyframe[];
	frame: number;
}): MediaPropertyKeyframe["easing"] {
	const surrounding = findSurroundingKeyframes(keyframes as Keyframe[], frame);
	return (surrounding?.[1].easing ??
		keyframes[keyframes.length - 1]?.easing ??
		"linear") as MediaPropertyKeyframe["easing"];
}

function createBoundaryKeyframe({
	keyframes,
	frame,
	outputFrame,
	edge,
}: {
	keyframes: MediaPropertyKeyframe[];
	frame: number;
	outputFrame: number;
	edge: "start" | "end";
}): MediaPropertyKeyframe {
	const exact = keyframes.find((keyframe) =>
		framesMatch({ left: keyframe.frame, right: frame })
	);
	if (exact) {
		return { ...exact, frame: outputFrame };
	}

	return {
		id: `${keyframes[0]?.id ?? "speed"}-crop-${edge}-${frame.toFixed(4)}`,
		frame: outputFrame,
		value: interpolateNumber(keyframes as Keyframe[], frame),
		easing: edge === "end" ? getBoundaryEasing({ keyframes, frame }) : "linear",
	};
}

export function cropMediaSpeedKeyframes({
	keyframes,
	startSourceTime,
	endSourceTime,
	fps,
}: {
	keyframes: MediaPropertyKeyframe[] | undefined;
	startSourceTime: number;
	endSourceTime: number;
	fps: number;
}): MediaPropertyKeyframe[] | undefined {
	if (!keyframes || keyframes.length === 0) return keyframes;

	const safeFps = Math.max(1, fps);
	const startFrame = Math.max(0, startSourceTime * safeFps);
	const endFrame = Math.max(startFrame, endSourceTime * safeFps);
	const sorted = sortKeyframes(keyframes);
	const outputEndFrame = endFrame - startFrame;
	const cropped = [
		createBoundaryKeyframe({
			keyframes: sorted,
			frame: startFrame,
			outputFrame: 0,
			edge: "start",
		}),
		...sorted
			.filter(
				(keyframe) =>
					keyframe.frame > startFrame + TIME_EPSILON &&
					keyframe.frame < endFrame - TIME_EPSILON
			)
			.map((keyframe) => ({
				...keyframe,
				frame: keyframe.frame - startFrame,
			})),
	];

	if (outputEndFrame > TIME_EPSILON) {
		cropped.push(
			createBoundaryKeyframe({
				keyframes: sorted,
				frame: endFrame,
				outputFrame: outputEndFrame,
				edge: "end",
			})
		);
	}

	return cropped;
}

export function extendSpeedKeyframes({
	element,
	side,
	sourceExtension,
	fps,
}: {
	element: MediaElement;
	side: "left" | "right";
	sourceExtension: number;
	fps: number;
}): MediaPropertyKeyframe[] | undefined {
	const keyframes = element.speedKeyframes;
	if (!keyframes || keyframes.length === 0) return keyframes;

	const safeFps = Math.max(1, fps);
	const sourceDuration = getMediaSourceDuration(element);
	const extensionFrames = sourceExtension * safeFps;
	const boundarySourceTime = side === "left" ? 0 : sourceDuration;
	const boundaryRate = resolveSpeedAtSourceTime({
		baseRate: element.playbackRate ?? 1,
		keyframes,
		sourceTime: boundarySourceTime,
		fps: safeFps,
	});
	const sorted = sortKeyframes(keyframes);

	if (side === "left") {
		return [
			{
				id: `${sorted[0].id}-extend-left-${extensionFrames.toFixed(4)}`,
				frame: 0,
				value: boundaryRate,
				easing: "linear",
			},
			...sorted.map((keyframe) => ({
				...keyframe,
				frame: keyframe.frame + extensionFrames,
			})),
		];
	}

	const outputEndFrame = (sourceDuration + sourceExtension) * safeFps;
	return [
		...sorted,
		{
			id: `${sorted[sorted.length - 1].id}-extend-right-${extensionFrames.toFixed(4)}`,
			frame: outputEndFrame,
			value: boundaryRate,
			easing: "linear",
		},
	];
}
