import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TestInfo } from "@playwright/test";
import { getFFmpegPath } from "../../../../../../electron/ffmpeg/paths";
import {
	calculateFrameDifference,
	type FrameDifferenceEvidence,
	STICKER_VIDEO_EVIDENCE_FRAME_SIZE,
	runStickerVideoEvidenceBinary,
} from "./sticker-lab-real-video-evidence";
import {
	calculateStickerSourceFrameMatch,
	calculateTemporalSourceSequenceEvidence,
	type StickerSourceFrameMatchEvidence,
	type StickerTemporalSequenceEvidence,
} from "./sticker-lab-source-frame-match";
import {
	prepareStickerSources,
	selectStickerSourceEvidenceFrames,
	type PreparedStickerSource,
	type StickerSourceFrameSelection,
	STICKER_SOURCE_MATCH_FRAME_SIZE,
	type StratifiedStickerSourceReference,
	type StratifiedStickerTimelineSource,
} from "./sticker-lab-source-frame-evidence";
import type { StratifiedStickerSample } from "./sticker-lab-stratified-samples";
import type { StickerExportRuntimeDraw } from "./sticker-lab-export-runtime-trace";
import {
	type StickerRuntimeSequenceEvidence,
	verifyStickerRuntimeSequence,
} from "./sticker-lab-runtime-sequence-evidence";

const MIN_REGION_CHANGED_PIXEL_ADVANTAGE = 0.002;
const MIN_REGION_MEAN_ADVANTAGE = 0.05;
const MIN_REGION_MEAN_DIFFERENCE = 0.1;

export interface StratifiedStickerTimelineItem
	extends StratifiedStickerTimelineSource {
	elementId: string;
}

interface StickerItemEvidence {
	differences: FrameDifferenceEvidence[];
	distinctDifferenceCount: number;
	distinctExpectedSourceFrameCount: number;
	elementId: string;
	endFrame: number;
	passed: boolean;
	sample: StratifiedStickerSample;
	sampledFrames: number[];
	sourceFrameMatches: StickerSourceFrameMatchEvidence[];
	encodedTemporalDiagnostic: StickerTemporalSequenceEvidence | null;
	runtimeTiming: StickerRuntimeSequenceEvidence | null;
	startFrame: number;
}

export interface StratifiedStickerBatchEvidence {
	baselineFileName: string;
	batchId: string;
	failedItemIds: string[];
	frameRate: number;
	items: StickerItemEvidence[];
	outputFileName: string;
	passedItemCount: number;
	reportFileName: string;
}

async function decodeSelectedFrames({
	filePath,
	frameSize = STICKER_VIDEO_EVIDENCE_FRAME_SIZE,
	frames,
}: {
	filePath: string;
	frameSize?: { height: number; width: number };
	frames: number[];
}): Promise<Map<number, Buffer>> {
	const orderedFrames = [...new Set(frames)].sort(
		(left, right) => left - right
	);
	const selection = orderedFrames.map((frame) => `eq(n\\,${frame})`).join("+");
	const pixels = await runStickerVideoEvidenceBinary({
		args: [
			"-v",
			"error",
			"-i",
			filePath,
			"-map",
			"0:v:0",
			"-an",
			"-vf",
			`select=${selection},scale=${frameSize.width}:${frameSize.height}`,
			"-fps_mode",
			"passthrough",
			"-pix_fmt",
			"rgb24",
			"-f",
			"rawvideo",
			"-",
		],
		binaryPath: getFFmpegPath(),
	});
	const frameByteSize = frameSize.width * frameSize.height * 3;
	if (pixels.byteLength !== orderedFrames.length * frameByteSize) {
		throw new Error(
			`Decoded ${pixels.byteLength} bytes for ${orderedFrames.length} selected frame(s) from ${path.basename(filePath)}`
		);
	}
	return new Map(
		orderedFrames.map((frame, index) => [
			frame,
			pixels.subarray(index * frameByteSize, (index + 1) * frameByteSize),
		])
	);
}

function localizedStickerDifference({
	difference,
}: {
	difference: FrameDifferenceEvidence;
}): boolean {
	if (
		difference.stickerRegionMeanAbsoluteDifference <= MIN_REGION_MEAN_DIFFERENCE
	) {
		return false;
	}
	const changedPixelAdvantage =
		difference.stickerRegionChangedPixelRatio -
		difference.outsideStickerRegionChangedPixelRatio;
	const meanDifferenceAdvantage =
		difference.stickerRegionMeanAbsoluteDifference -
		difference.outsideStickerRegionMeanAbsoluteDifference;
	return (
		changedPixelAdvantage > MIN_REGION_CHANGED_PIXEL_ADVANTAGE ||
		meanDifferenceAdvantage > MIN_REGION_MEAN_ADVANTAGE
	);
}

export function hasStickerSourceContentProof({
	differences,
	matches,
	mimeType,
}: {
	differences: FrameDifferenceEvidence[];
	matches: StickerSourceFrameMatchEvidence[];
	mimeType: StratifiedStickerSample["mimeType"];
}): boolean {
	if (differences.length !== matches.length || matches.length === 0) {
		throw new Error("Sticker source proof frames are incomplete");
	}
	if (mimeType === "image/gif") {
		return matches.every(({ matched }) => matched);
	}
	const guardedMatches = matches.map((match, index) => ({
		difference: differences[index],
		match,
	}));
	const observableMatches = guardedMatches.filter(
		({ match }) => match.observableAgainstBaseline
	);
	const invisibleMatchesStayedInvisible = guardedMatches
		.filter(({ match }) => !match.observableAgainstBaseline)
		.every(({ difference }) => !localizedStickerDifference({ difference }));
	return (
		observableMatches.length > 0 &&
		observableMatches.every(
			({ difference, match }) =>
				match.matched && localizedStickerDifference({ difference })
		) &&
		invisibleMatchesStayedInvisible
	);
}

function itemEvidence({
	baselineFrames,
	frameRate,
	item,
	outputFrames,
	preparedSources,
	runtimeFrameHashesByItemId,
	sourceBaselineFrames,
	sourceOutputFrames,
	selections,
	selectionsByItemId,
	runtimeDraws,
}: {
	baselineFrames: Map<number, Buffer>;
	frameRate: number;
	item: StratifiedStickerTimelineItem;
	outputFrames: Map<number, Buffer>;
	preparedSources: ReadonlyMap<string, PreparedStickerSource>;
	runtimeFrameHashesByItemId: ReadonlyMap<string, string[]>;
	sourceBaselineFrames: Map<number, Buffer>;
	sourceOutputFrames: Map<number, Buffer>;
	selections: StickerSourceFrameSelection[];
	selectionsByItemId: ReadonlyMap<string, StickerSourceFrameSelection[]>;
	runtimeDraws: StickerExportRuntimeDraw[];
}): StickerItemEvidence {
	const sampledFrames = selections.map(({ outputFrame }) => outputFrame);
	const differences = sampledFrames.map((frame) => {
		const baseline = baselineFrames.get(frame);
		const output = outputFrames.get(frame);
		if (!(baseline && output)) {
			throw new Error(`Missing decoded evidence frame ${frame}`);
		}
		return calculateFrameDifference({
			baseline,
			output,
			stickerRegion: item.region,
			timeSeconds: frame / frameRate,
		});
	});
	const visibleDifferences = differences.filter((difference) =>
		localizedStickerDifference({ difference })
	);
	const expectedSource = preparedSources.get(item.sample.itemId);
	if (!expectedSource) {
		throw new Error(`Sticker ${item.sample.itemId} prepared source is missing`);
	}
	const alternativeSources = [...selectionsByItemId.entries()].flatMap(
		([itemId, sourceSelections]) => {
			const source = preparedSources.get(itemId);
			if (!source) {
				throw new Error(`Sticker ${itemId} alternative source is missing`);
			}
			return sourceSelections.map(({ sourceFrameIndex }) => ({
				frameIndex: sourceFrameIndex,
				itemId,
				source,
			}));
		}
	);
	const sourceFrameMatches = selections.map((selection) => {
		const baseline = sourceBaselineFrames.get(selection.outputFrame);
		const output = sourceOutputFrames.get(selection.outputFrame);
		if (!(baseline && output)) {
			throw new Error(
				`Missing source match frame ${selection.outputFrame} for ${item.sample.itemId}`
			);
		}
		return calculateStickerSourceFrameMatch({
			alternativeSources,
			baseline,
			expectedSource,
			output,
			selection,
		});
	});
	const distinctExpectedSourceFrameCount = new Set(
		selections.map(({ sourceFrameHash }) => sourceFrameHash)
	).size;
	const requiredVisibleFrames =
		item.sample.mimeType === "image/gif"
			? Math.min(2, distinctExpectedSourceFrameCount)
			: 1;
	const sourceContentPassed = hasStickerSourceContentProof({
		differences,
		matches: sourceFrameMatches,
		mimeType: item.sample.mimeType,
	});
	const encodedTemporalDiagnostic =
		item.sample.mimeType === "image/png"
			? null
			: calculateTemporalSourceSequenceEvidence({
					matches: sourceFrameMatches,
					selections,
				});
	let runtimeTiming: StickerRuntimeSequenceEvidence | null = null;
	if (item.sample.mimeType === "image/gif") {
		const runtimeFrameHashes = runtimeFrameHashesByItemId.get(
			item.sample.itemId
		);
		if (!runtimeFrameHashes) {
			throw new Error(
				`Sticker ${item.sample.itemId} browser runtime hashes are missing`
			);
		}
		runtimeTiming = verifyStickerRuntimeSequence({
			draws: runtimeDraws,
			frameRate,
			runtimeFrameHashes,
			source: expectedSource,
		});
	}
	return {
		differences,
		distinctDifferenceCount: new Set(
			visibleDifferences.map(
				({ stickerRegionDifferenceHash }) => stickerRegionDifferenceHash
			)
		).size,
		distinctExpectedSourceFrameCount,
		encodedTemporalDiagnostic,
		elementId: item.elementId,
		endFrame: item.endFrame,
		passed:
			visibleDifferences.length >= requiredVisibleFrames &&
			sourceContentPassed &&
			(runtimeTiming?.passed ?? true),
		runtimeTiming,
		sample: item.sample,
		sampledFrames,
		sourceFrameMatches,
		startFrame: item.startFrame,
	};
}

export async function verifyStratifiedStickerBatchVideo({
	baselinePath,
	batchId,
	frameRate,
	items,
	outputPath,
	reportPath,
	runtimeFrameHashesByItemId,
	sourceReferences,
	runtimeDraws,
	testInfo,
}: {
	baselinePath: string;
	batchId: string;
	frameRate: number;
	items: StratifiedStickerTimelineItem[];
	outputPath: string;
	reportPath: string;
	runtimeFrameHashesByItemId: ReadonlyMap<string, string[]>;
	sourceReferences: ReadonlyMap<string, StratifiedStickerSourceReference>;
	runtimeDraws: StickerExportRuntimeDraw[];
	testInfo: TestInfo;
}): Promise<StratifiedStickerBatchEvidence> {
	const temporaryDirectory = await mkdtemp(
		path.join(tmpdir(), "qcut-sticker-source-evidence-")
	);
	try {
		const preparedSources = await prepareStickerSources({
			items,
			sourceReferences,
			temporaryDirectory,
		});
		const selectionsByItemId = new Map(
			items.map((item) => {
				const source = preparedSources.get(item.sample.itemId);
				if (!source) {
					throw new Error(
						`Sticker ${item.sample.itemId} prepared source is missing`
					);
				}
				return [
					item.sample.itemId,
					selectStickerSourceEvidenceFrames({ frameRate, source }),
				] as const;
			})
		);
		const selectedFrames = [...selectionsByItemId.values()].flatMap(
			(selections) => selections.map(({ outputFrame }) => outputFrame)
		);
		const [
			baselineFrames,
			outputFrames,
			sourceBaselineFrames,
			sourceOutputFrames,
		] = await Promise.all([
			decodeSelectedFrames({ filePath: baselinePath, frames: selectedFrames }),
			decodeSelectedFrames({ filePath: outputPath, frames: selectedFrames }),
			decodeSelectedFrames({
				filePath: baselinePath,
				frameSize: STICKER_SOURCE_MATCH_FRAME_SIZE,
				frames: selectedFrames,
			}),
			decodeSelectedFrames({
				filePath: outputPath,
				frameSize: STICKER_SOURCE_MATCH_FRAME_SIZE,
				frames: selectedFrames,
			}),
		]);
		const itemResults = items.map((item) =>
			itemEvidence({
				baselineFrames,
				frameRate,
				item,
				outputFrames,
				preparedSources,
				runtimeFrameHashesByItemId,
				sourceBaselineFrames,
				sourceOutputFrames,
				selections: selectionsByItemId.get(item.sample.itemId) ?? [],
				selectionsByItemId,
				runtimeDraws,
			})
		);
		const failedItemIds = itemResults
			.filter(({ passed }) => !passed)
			.map(({ sample }) => sample.itemId);
		const report: StratifiedStickerBatchEvidence = {
			baselineFileName: path.basename(baselinePath),
			batchId,
			failedItemIds,
			frameRate,
			items: itemResults,
			outputFileName: path.basename(outputPath),
			passedItemCount: itemResults.length - failedItemIds.length,
			reportFileName: path.basename(reportPath),
		};
		await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
		await testInfo.attach(`${batchId}-sticker-evidence`, {
			body: Buffer.from(JSON.stringify(report, null, 2)),
			contentType: "application/json",
		});
		return report;
	} finally {
		await rm(temporaryDirectory, { force: true, recursive: true });
	}
}
