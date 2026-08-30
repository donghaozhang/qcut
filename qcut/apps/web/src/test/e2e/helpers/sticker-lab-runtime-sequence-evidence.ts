import { evaluateStickerRuntime } from "@qcut/editor-core/sticker-lab";
import type { StickerExportRuntimeDraw } from "./sticker-lab-export-runtime-trace";
import type { PreparedStickerSource } from "./sticker-lab-source-frame-evidence";

export interface StickerRuntimeSequenceFrameEvidence {
	expectedRuntimeFrameIndex: number;
	expectedRuntimePixelHash: string;
	expectedSourceFrameHash: string;
	outputFrameIndex: number;
	runtimePixelHash: string;
}

export interface StickerRuntimeVisualFrameEvidence {
	expectedRuntimeFrameIndices: number[];
	expectedSourceFrameHash: string;
	runtimePixelHashes: string[];
}

export interface StickerRuntimeSequenceEvidence {
	absoluteRuntimeHashMatchCount: number;
	distinctRuntimePixelHashCount: number;
	expectedOutputFrameCount: number;
	failures: string[];
	frames: StickerRuntimeSequenceFrameEvidence[];
	observedSourceVisualFrameCount: number;
	observable: boolean;
	outputRateReachableSourceVisualFrameCount: number;
	passed: boolean;
	requiredCycleDurationSeconds: number;
	runtimeDrawCount: number;
	runtimeWindowDurationSeconds: number;
	sourceVisualFrameCount: number;
	visualFrames: StickerRuntimeVisualFrameEvidence[];
}

interface ExpectedRuntimeFrame {
	frameIndex: number;
	sourceFrameHash: string;
}

function expectedRuntimeFrames({
	frameRate,
	source,
}: {
	frameRate: number;
	source: PreparedStickerSource;
}): Map<number, ExpectedRuntimeFrame> {
	if (!(Number.isFinite(frameRate) && frameRate > 0)) {
		throw new Error("Sticker runtime trace frame rate must be positive");
	}
	const descriptor = source.descriptor;
	if (!descriptor) {
		throw new Error("Sticker runtime sequence evidence requires a GIF source");
	}
	if (source.frameHashes.length !== descriptor.frames.length) {
		throw new Error(
			`Sticker ${source.item.sample.itemId} source frame hashes do not match its runtime descriptor`
		);
	}
	const { endFrame, startFrame } = source.item;
	const timeline = {
		sourceOffsetSeconds: 0,
		timelineDurationSeconds: (endFrame - startFrame) / frameRate,
		timelineStartSeconds: startFrame / frameRate,
	};
	const expected = new Map<number, ExpectedRuntimeFrame>();
	for (let outputFrame = startFrame; outputFrame < endFrame; outputFrame += 1) {
		const state = evaluateStickerRuntime({
			descriptor,
			timeline,
			timelineTimeSeconds: outputFrame / frameRate,
		});
		if (!(state.active && state.kind === "direct-gif")) {
			throw new Error(
				`Sticker ${source.item.sample.itemId} runtime is inactive at output frame ${outputFrame}`
			);
		}
		const sourceFrameHash = source.frameHashes[state.frameIndex];
		if (!sourceFrameHash) {
			throw new Error(
				`Sticker ${source.item.sample.itemId} has no source hash for runtime frame ${state.frameIndex}`
			);
		}
		expected.set(outputFrame, {
			frameIndex: state.frameIndex,
			sourceFrameHash,
		});
	}
	return expected;
}

function runtimeDrawsByOutputFrame({
	draws,
	source,
}: {
	draws: StickerExportRuntimeDraw[];
	source: PreparedStickerSource;
}): Map<number, StickerExportRuntimeDraw[]> {
	const descriptor = source.descriptor;
	if (!descriptor) {
		throw new Error("Sticker runtime sequence evidence requires a GIF source");
	}
	const { endFrame, startFrame } = source.item;
	const matchingDraws = draws.filter(
		(draw) =>
			draw.outputFrameIndex !== undefined &&
			Number.isInteger(draw.outputFrameIndex) &&
			draw.outputFrameIndex >= startFrame &&
			draw.outputFrameIndex < endFrame &&
			draw.sourceWidth === descriptor.canvasSize.width &&
			draw.sourceHeight === descriptor.canvasSize.height
	);
	const byOutputFrame = new Map<number, StickerExportRuntimeDraw[]>();
	for (const draw of matchingDraws) {
		const outputFrameIndex = draw.outputFrameIndex;
		if (outputFrameIndex === undefined) continue;
		const frameDraws = byOutputFrame.get(outputFrameIndex) ?? [];
		frameDraws.push(draw);
		byOutputFrame.set(outputFrameIndex, frameDraws);
	}
	return byOutputFrame;
}

export function verifyStickerRuntimeSequence({
	draws,
	frameRate,
	runtimeFrameHashes,
	source,
}: {
	draws: StickerExportRuntimeDraw[];
	frameRate: number;
	runtimeFrameHashes: string[];
	source: PreparedStickerSource;
}): StickerRuntimeSequenceEvidence {
	const expectedFrames = expectedRuntimeFrames({ frameRate, source });
	const drawsByOutputFrame = runtimeDrawsByOutputFrame({ draws, source });
	const failures: string[] = [];
	const descriptor = source.descriptor;
	if (!descriptor) {
		throw new Error("Sticker runtime sequence evidence requires a GIF source");
	}
	if (runtimeFrameHashes.length !== descriptor.frames.length) {
		throw new Error(
			`Sticker ${source.item.sample.itemId} has ${runtimeFrameHashes.length} browser source hashes for ${descriptor.frames.length} runtime frames`
		);
	}
	const runtimeWindowDurationSeconds =
		(source.item.endFrame - source.item.startFrame) / frameRate;
	if (runtimeWindowDurationSeconds + 1e-9 < descriptor.cycleDurationSeconds) {
		failures.push(
			`Runtime window is ${runtimeWindowDurationSeconds}s; expected at least one ${descriptor.cycleDurationSeconds}s source cycle`
		);
	}
	const frames: StickerRuntimeSequenceFrameEvidence[] = [];
	for (const [outputFrameIndex, expected] of expectedFrames) {
		const frameDraws = drawsByOutputFrame.get(outputFrameIndex) ?? [];
		if (frameDraws.length !== 1) {
			failures.push(
				`Output frame ${outputFrameIndex} has ${frameDraws.length} matching runtime draws; expected 1`
			);
			continue;
		}
		const expectedRuntimePixelHash = runtimeFrameHashes[expected.frameIndex];
		if (!expectedRuntimePixelHash) {
			throw new Error(
				`Sticker ${source.item.sample.itemId} has no browser source hash for runtime frame ${expected.frameIndex}`
			);
		}
		if (frameDraws[0].pixelHash !== expectedRuntimePixelHash) {
			failures.push(
				`Output frame ${outputFrameIndex} drew runtime hash ${frameDraws[0].pixelHash}; expected ${expectedRuntimePixelHash}`
			);
		}
		frames.push({
			expectedRuntimeFrameIndex: expected.frameIndex,
			expectedRuntimePixelHash,
			expectedSourceFrameHash: expected.sourceFrameHash,
			outputFrameIndex,
			runtimePixelHash: frameDraws[0].pixelHash,
		});
	}

	const sourceVisualFrameHashes = new Set(source.frameHashes);
	const outputRateReachableSourceVisualFrameHashes = new Set(
		[...expectedFrames.values()].map(({ sourceFrameHash }) => sourceFrameHash)
	);

	const visualFrameMap = new Map<
		string,
		{ frameIndices: Set<number>; runtimeHashes: Set<string> }
	>();
	for (const frame of frames) {
		const visualFrame = visualFrameMap.get(frame.expectedSourceFrameHash) ?? {
			frameIndices: new Set<number>(),
			runtimeHashes: new Set<string>(),
		};
		visualFrame.frameIndices.add(frame.expectedRuntimeFrameIndex);
		visualFrame.runtimeHashes.add(frame.runtimePixelHash);
		visualFrameMap.set(frame.expectedSourceFrameHash, visualFrame);
	}
	const visualFrames = [...visualFrameMap.entries()]
		.map(([expectedSourceFrameHash, value]) => ({
			expectedRuntimeFrameIndices: [...value.frameIndices].sort(
				(left, right) => left - right
			),
			expectedSourceFrameHash,
			runtimePixelHashes: [...value.runtimeHashes].sort(),
		}))
		.sort((left, right) =>
			left.expectedSourceFrameHash.localeCompare(right.expectedSourceFrameHash)
		);
	if (visualFrames.length !== outputRateReachableSourceVisualFrameHashes.size) {
		failures.push(
			`Runtime trace observes ${visualFrames.length} of ${outputRateReachableSourceVisualFrameHashes.size} output-rate-reachable source visual frames`
		);
	}
	for (const visualFrame of visualFrames) {
		if (visualFrame.runtimePixelHashes.length !== 1) {
			failures.push(
				`Source visual frame ${visualFrame.expectedSourceFrameHash} produced ${visualFrame.runtimePixelHashes.length} runtime hashes; expected 1`
			);
		}
	}
	const distinctRuntimePixelHashes = new Set(
		visualFrames.flatMap(({ runtimePixelHashes }) => runtimePixelHashes)
	);
	if (
		visualFrames.every(
			({ runtimePixelHashes }) => runtimePixelHashes.length === 1
		) &&
		distinctRuntimePixelHashes.size !== visualFrames.length
	) {
		failures.push(
			`${visualFrames.length} source visual frames map to ${distinctRuntimePixelHashes.size} distinct runtime hashes`
		);
	}

	return {
		absoluteRuntimeHashMatchCount: frames.filter(
			({ expectedRuntimePixelHash, runtimePixelHash }) =>
				expectedRuntimePixelHash === runtimePixelHash
		).length,
		distinctRuntimePixelHashCount: distinctRuntimePixelHashes.size,
		expectedOutputFrameCount: expectedFrames.size,
		failures,
		frames,
		observedSourceVisualFrameCount: visualFrames.length,
		observable: outputRateReachableSourceVisualFrameHashes.size > 1,
		outputRateReachableSourceVisualFrameCount:
			outputRateReachableSourceVisualFrameHashes.size,
		passed: failures.length === 0,
		requiredCycleDurationSeconds: descriptor.cycleDurationSeconds,
		runtimeDrawCount: [...drawsByOutputFrame.values()].reduce(
			(total, frameDraws) => total + frameDraws.length,
			0
		),
		runtimeWindowDurationSeconds,
		sourceVisualFrameCount: sourceVisualFrameHashes.size,
		visualFrames,
	};
}
