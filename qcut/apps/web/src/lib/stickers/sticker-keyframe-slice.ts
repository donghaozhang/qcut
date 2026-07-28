import type {
	StickerElement,
	StickerKeyframeProperty,
	StickerPropertyKeyframe,
	TimelineElement,
} from "@/types/timeline";
import {
	getStickerFrameContext,
	interpolateStickerKeyframes,
	STICKER_KEYFRAME_PROPERTIES,
} from "./sticker-keyframes";

type StickerKeyframeMap = NonNullable<StickerElement["keyframes"]>;
type StickerKeyframeUpdate = Partial<Pick<StickerElement, "keyframes">>;

export const MAX_STICKER_SPLIT_SAMPLES_PER_SEGMENT = 96;

export interface StickerSplitKeyframeUpdates {
	left: StickerKeyframeUpdate;
	right: StickerKeyframeUpdate;
}

function normalizePropertyKeyframes({
	keyframes,
}: {
	keyframes: StickerPropertyKeyframe[];
}): StickerPropertyKeyframe[] {
	const byFrame = new Map<number, StickerPropertyKeyframe>();
	for (const keyframe of keyframes) {
		if (!Number.isFinite(keyframe.frame) || !Number.isFinite(keyframe.value)) {
			continue;
		}
		const frame = Math.max(0, Math.round(keyframe.frame));
		byFrame.set(frame, { ...keyframe, frame });
	}
	return [...byFrame.values()].sort((left, right) => left.frame - right.frame);
}

function easingAtFrame({
	keyframes,
	frame,
}: {
	keyframes: StickerPropertyKeyframe[];
	frame: number;
}): StickerPropertyKeyframe["easing"] {
	// Easing belongs to the destination key, so an inserted boundary inherits
	// the next source key's segment easing.
	return (
		keyframes.find((keyframe) => keyframe.frame >= frame)?.easing ??
		keyframes.at(-1)?.easing ??
		"linear"
	);
}

function createBoundaryKeyframe({
	keyframes,
	property,
	sourceFrame,
	outputFrame,
	edge,
}: {
	keyframes: StickerPropertyKeyframe[];
	property: StickerKeyframeProperty;
	sourceFrame: number;
	outputFrame: number;
	edge: "start" | "end";
}): StickerPropertyKeyframe | undefined {
	const exact = keyframes.find((keyframe) => keyframe.frame === sourceFrame);
	if (exact) return { ...exact, frame: outputFrame };

	const value = interpolateStickerKeyframes({
		keyframes,
		frame: sourceFrame,
	});
	if (value === undefined) return;

	return {
		id: `sticker-keyframe-slice-${property}-${sourceFrame}-${edge}`,
		frame: outputFrame,
		value,
		easing: easingAtFrame({ keyframes, frame: sourceFrame }),
	};
}

function ensureUniqueKeyframeIds({
	keyframes,
}: {
	keyframes: StickerPropertyKeyframe[];
}): StickerPropertyKeyframe[] {
	const usedIds = new Set<string>();
	const uniqueKeyframes: StickerPropertyKeyframe[] = [];
	for (const [index, keyframe] of keyframes.entries()) {
		let id = keyframe.id;
		let suffix = 0;
		while (usedIds.has(id)) {
			suffix += 1;
			id = `${keyframe.id}-slice-${index}-${suffix}`;
		}
		usedIds.add(id);
		uniqueKeyframes.push(id === keyframe.id ? keyframe : { ...keyframe, id });
	}
	return uniqueKeyframes;
}

function outputFrameForSourceFrame({
	sourceFrame,
	startFrame,
	endFrame,
	outputEndFrame,
}: {
	sourceFrame: number;
	startFrame: number;
	endFrame: number;
	outputEndFrame: number;
}): number {
	if (sourceFrame <= startFrame) return 0;
	if (sourceFrame >= endFrame) return outputEndFrame;
	return sourceFrame - startFrame;
}

function samplePartialNonlinearSegments({
	keyframes,
	property,
	startFrame,
	endFrame,
	outputEndFrame,
}: {
	keyframes: StickerPropertyKeyframe[];
	property: StickerKeyframeProperty;
	startFrame: number;
	endFrame: number;
	outputEndFrame: number;
}): StickerPropertyKeyframe[] {
	const samples: StickerPropertyKeyframe[] = [];
	for (let index = 0; index < keyframes.length - 1; index += 1) {
		const from = keyframes[index];
		const to = keyframes[index + 1];
		if (to.easing === "linear" || from.value === to.value) continue;

		const intersectionStart = Math.max(startFrame, from.frame);
		const intersectionEnd = Math.min(endFrame, to.frame);
		if (intersectionEnd <= intersectionStart) continue;
		const outputIntersectionStart = outputFrameForSourceFrame({
			sourceFrame: intersectionStart,
			startFrame,
			endFrame,
			outputEndFrame,
		});
		const outputIntersectionEnd = outputFrameForSourceFrame({
			sourceFrame: intersectionEnd,
			startFrame,
			endFrame,
			outputEndFrame,
		});
		const retainsEntireSegment =
			intersectionStart === from.frame &&
			intersectionEnd === to.frame &&
			outputIntersectionEnd - outputIntersectionStart === to.frame - from.frame;
		if (retainsEntireSegment) continue;

		const sourceFrameSpan = intersectionEnd - intersectionStart;
		const sampleCount = Math.min(
			sourceFrameSpan,
			MAX_STICKER_SPLIT_SAMPLES_PER_SEGMENT
		);
		let previousSourceFrame = intersectionStart;
		for (let sampleIndex = 1; sampleIndex <= sampleCount; sampleIndex += 1) {
			const sourceFrame =
				sampleIndex === sampleCount
					? intersectionEnd
					: Math.round(
							intersectionStart + (sourceFrameSpan * sampleIndex) / sampleCount
						);
			if (sourceFrame <= previousSourceFrame) continue;
			previousSourceFrame = sourceFrame;

			const outputFrame = outputFrameForSourceFrame({
				sourceFrame,
				startFrame,
				endFrame,
				outputEndFrame,
			});
			if (outputFrame <= 0 || outputFrame > outputEndFrame) continue;
			if (outputFrame === outputEndFrame && sourceFrame !== endFrame) {
				continue;
			}

			const value = interpolateStickerKeyframes({
				keyframes,
				frame: sourceFrame,
			});
			if (value === undefined) continue;
			samples.push({
				id: `sticker-keyframe-sample-${property}-${sourceFrame}`,
				frame: outputFrame,
				value,
				easing: "linear",
			});
		}
	}
	return samples;
}

function slicePropertyKeyframes({
	keyframes,
	property,
	startFrame,
	endFrame,
	outputEndFrame,
}: {
	keyframes: StickerPropertyKeyframe[];
	property: StickerKeyframeProperty;
	startFrame: number;
	endFrame: number;
	outputEndFrame: number;
}): StickerPropertyKeyframe[] {
	const source = normalizePropertyKeyframes({ keyframes });
	if (source.length === 0) return [];

	const normalizedStart = Math.max(0, Math.round(startFrame));
	const normalizedEnd = Math.max(normalizedStart, Math.round(endFrame));
	const normalizedOutputEnd = Math.max(0, Math.round(outputEndFrame));
	const sliced: StickerPropertyKeyframe[] = [];
	const startBoundary = createBoundaryKeyframe({
		keyframes: source,
		property,
		sourceFrame: normalizedStart,
		outputFrame: 0,
		edge: "start",
	});
	if (startBoundary) sliced.push(startBoundary);

	for (const keyframe of source) {
		if (keyframe.frame <= normalizedStart || keyframe.frame >= normalizedEnd) {
			continue;
		}
		const outputFrame = keyframe.frame - normalizedStart;
		if (outputFrame >= normalizedOutputEnd) continue;
		sliced.push({
			...keyframe,
			frame: outputFrame,
		});
	}

	if (normalizedEnd > normalizedStart && normalizedOutputEnd > 0) {
		const endBoundary = createBoundaryKeyframe({
			keyframes: source,
			property,
			sourceFrame: normalizedEnd,
			outputFrame: normalizedOutputEnd,
			edge: "end",
		});
		if (endBoundary) sliced.push(endBoundary);
	}

	const byFrame = new Map<number, StickerPropertyKeyframe>();
	for (const keyframe of sliced) byFrame.set(keyframe.frame, keyframe);
	const samples = samplePartialNonlinearSegments({
		keyframes: source,
		property,
		startFrame: normalizedStart,
		endFrame: normalizedEnd,
		outputEndFrame: normalizedOutputEnd,
	});
	for (const sample of samples) {
		const existing = byFrame.get(sample.frame);
		byFrame.set(sample.frame, {
			...sample,
			id: existing?.id ?? sample.id,
		});
	}

	return ensureUniqueKeyframeIds({
		keyframes: [...byFrame.values()].sort(
			(left, right) => left.frame - right.frame
		),
	});
}

function sliceKeyframeMap({
	keyframes,
	startFrame,
	endFrame,
	outputEndFrame,
}: {
	keyframes: StickerKeyframeMap;
	startFrame: number;
	endFrame: number;
	outputEndFrame: number;
}): StickerKeyframeMap {
	const sliced: StickerKeyframeMap = {};
	for (const property of STICKER_KEYFRAME_PROPERTIES) {
		const propertyKeyframes = keyframes[property];
		if (propertyKeyframes === undefined) continue;
		sliced[property] = slicePropertyKeyframes({
			keyframes: propertyKeyframes,
			property,
			startFrame,
			endFrame,
			outputEndFrame,
		});
	}
	return sliced;
}

export function getStickerSplitKeyframeUpdates({
	element,
	splitTime,
	fps,
}: {
	element: TimelineElement;
	splitTime: number;
	fps: number;
}): StickerSplitKeyframeUpdates {
	if (element.type !== "sticker" || element.keyframes === undefined) {
		return { left: {}, right: {} };
	}

	const { clipLocalFrame, clipDurationFrames } = getStickerFrameContext({
		element,
		currentTime: splitTime,
		fps,
	});
	const rightFrameContext = getStickerFrameContext({
		element: {
			...element,
			startTime: splitTime,
			trimStart: element.trimStart + (splitTime - element.startTime),
		},
		currentTime: splitTime,
		fps,
	});

	return {
		left: {
			keyframes: sliceKeyframeMap({
				keyframes: element.keyframes,
				startFrame: 0,
				endFrame: clipLocalFrame,
				outputEndFrame: clipLocalFrame,
			}),
		},
		right: {
			keyframes: sliceKeyframeMap({
				keyframes: element.keyframes,
				startFrame: clipLocalFrame,
				endFrame: clipDurationFrames,
				outputEndFrame: rightFrameContext.clipDurationFrames,
			}),
		},
	};
}
