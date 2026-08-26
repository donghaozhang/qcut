import type { AlphaVideoLayout } from "./runtime-model.js";
import { compareMediaTimeSeconds } from "./runtime-media-time.js";
import {
	assertDescriptorKind,
	assertRuntimeControls,
	invalidDescriptor,
	readBoolean,
	readFiniteNumber,
	readNonEmptyString,
	readNormalizedRect,
	readRecord,
	rectanglesOverlap,
} from "./runtime-validation-helpers.js";

function readAlphaMask({ value }: { value: unknown }): {
	channel: "alpha" | "luma";
	inverted: boolean;
} {
	const record = readRecord({ value, label: "Alpha-video mask" });
	if (record.channel !== "alpha" && record.channel !== "luma") {
		invalidDescriptor({
			message: "Alpha-video mask channel must be alpha or luma",
		});
	}
	return {
		channel: record.channel,
		inverted: readBoolean({
			value: record.inverted,
			label: "Alpha-video mask inverted",
		}),
	};
}

function readAlphaLayout({ layout }: { layout: unknown }): AlphaVideoLayout {
	const record = readRecord({ value: layout, label: "Alpha-video layout" });
	if (record.kind === "embedded-alpha") return { kind: "embedded-alpha" };
	const mask = readAlphaMask({ value: record.mask });
	if (record.kind === "separate-mask") {
		return {
			kind: "separate-mask",
			maskSource: readNonEmptyString({
				value: record.maskSource,
				label: "Alpha-video maskSource",
			}),
			mask,
		};
	}
	if (record.kind !== "side-by-side") {
		invalidDescriptor({
			message:
				"Alpha-video layout kind must be embedded-alpha, separate-mask, or side-by-side",
		});
	}
	const colorRect = readNormalizedRect({
		value: record.colorRect,
		label: "Alpha-video colorRect",
	});
	const maskRect = readNormalizedRect({
		value: record.maskRect,
		label: "Alpha-video maskRect",
	});
	if (rectanglesOverlap({ left: colorRect, right: maskRect })) {
		invalidDescriptor({
			message: "Side-by-side color and mask rectangles cannot overlap",
		});
	}
	return { kind: "side-by-side", colorRect, maskRect, mask };
}

export function assertAlphaVideoRuntimeDescriptor({
	descriptor,
}: {
	descriptor: unknown;
}): void {
	const record = readRecord({
		value: descriptor,
		label: "alpha-video descriptor",
	});
	assertDescriptorKind({ record, kind: "alpha-video" });
	assertRuntimeControls({
		completion: record.completion,
		repeat: record.repeat,
	});
	readNonEmptyString({ value: record.source, label: "Alpha-video source" });
	readFiniteNumber({
		value: record.sourceDurationSeconds,
		label: "Alpha-video sourceDurationSeconds",
		positive: true,
	});
	const cycleDurationSeconds = readFiniteNumber({
		value: record.cycleDurationSeconds,
		label: "Alpha-video cycleDurationSeconds",
		positive: true,
	});
	readAlphaLayout({ layout: record.layout });
	if (!Array.isArray(record.progressKeyframes)) {
		invalidDescriptor({
			message: "Alpha-video progressKeyframes must be an array",
		});
	}
	const keyframes = record.progressKeyframes.map((keyframe, index) => {
		const keyframeRecord = readRecord({
			value: keyframe,
			label: `Alpha-video progressKeyframes[${index}]`,
		});
		const interpolation = keyframeRecord.interpolation;
		if (interpolation !== "hold" && interpolation !== "linear") {
			invalidDescriptor({
				message: `Alpha-video progressKeyframes[${index}].interpolation must be hold or linear`,
			});
		}
		const sourceProgress = readFiniteNumber({
			value: keyframeRecord.sourceProgress,
			label: `Alpha-video progressKeyframes[${index}].sourceProgress`,
			positive: false,
		});
		if (sourceProgress > 1) {
			invalidDescriptor({
				message: "Alpha-video sourceProgress must remain inside [0, 1]",
			});
		}
		return {
			atSeconds: readFiniteNumber({
				value: keyframeRecord.atSeconds,
				label: `Alpha-video progressKeyframes[${index}].atSeconds`,
				positive: false,
			}),
			interpolation,
			sourceProgress,
		};
	});
	const first = keyframes[0];
	const last = keyframes.at(-1);
	if (
		!first ||
		!last ||
		compareMediaTimeSeconds({ left: first.atSeconds, right: 0 }) !== 0 ||
		compareMediaTimeSeconds({
			left: last.atSeconds,
			right: cycleDurationSeconds,
		}) !== 0
	) {
		invalidDescriptor({
			message:
				"Alpha-video progress keyframes must start at zero and end at the cycle duration",
		});
	}
	let previousTimeSeconds = -1;
	for (const keyframe of keyframes) {
		if (
			compareMediaTimeSeconds({
				left: keyframe.atSeconds,
				right: previousTimeSeconds,
			}) <= 0
		) {
			invalidDescriptor({
				message: "Alpha-video progress keyframes must be strictly ordered",
			});
		}
		previousTimeSeconds = keyframe.atSeconds;
	}
}
