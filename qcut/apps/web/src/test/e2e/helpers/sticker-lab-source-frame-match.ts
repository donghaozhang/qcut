import type {
	PreparedStickerSource,
	StickerEvidencePixelRect,
	StickerSourceFrameSelection,
} from "./sticker-lab-source-frame-evidence";
import {
	STICKER_SOURCE_MATCH_FRAME_SIZE,
	STICKER_SOURCE_VISIBLE_ALPHA_THRESHOLD,
} from "./sticker-lab-source-frame-evidence";

const ACTUAL_CHANGED_CHANNEL_THRESHOLD = 18;
const MIN_COMPOSITE_ERROR_ADVANTAGE = 1;
const MIN_FOREGROUND_RECALL = 0.1;
const MIN_IDENTITY_CORRELATION_ADVANTAGE = 0.015;
const MIN_SOURCE_CORRELATION = 0.2;
const MIN_TEMPORAL_SEQUENCE_COMPOSITE_ERROR_ADVANTAGE = 0.1;
const MIN_TEMPORAL_SEQUENCE_CORRELATION_ADVANTAGE = 0.001;

export interface StickerSourceFrameMatchEvidence {
	actualToExpectedCorrelation: number;
	actualToExpectedMeanAbsoluteError: number;
	actualToBaselineMeanAbsoluteError: number;
	compositeErrorAdvantage: number;
	expectedAlphaPixelRatio: number;
	expectedChangedPixelRatio: number;
	expectedMeanAbsoluteDifference: number;
	expectedSourceFrameHash: string;
	expectedSourceFrameIndex: number;
	foregroundRecall: number;
	identityCorrelationAdvantage: number | null;
	matched: boolean;
	observableAgainstBaseline: boolean;
	temporalCompositeErrorAdvantage: number | null;
	temporalCorrelationAdvantage: number | null;
	temporalAlternatives: StickerTemporalAlternativeEvidence[];
}

export interface StickerTemporalAlternativeEvidence {
	compositeErrorAdvantage: number;
	correlationAdvantage: number;
	sourceFrameHash: string;
}

export interface StickerTemporalSequenceEvidence {
	distinctExpectedFrameCount: number;
	minimumFrozenCompositeErrorAdvantage: number | null;
	minimumFrozenCorrelationAdvantage: number | null;
	supportsExpectedSequence: boolean;
}

interface SourceFrameMatchMetrics {
	correlation: number;
	expectedAlphaPixelRatio: number;
	expectedChangedPixelRatio: number;
	expectedMeanAbsoluteDifference: number;
	foregroundRecall: number;
	meanAbsoluteBaselineError: number;
	meanAbsoluteCompositeError: number;
}

function sourceFrameMatchMetrics({
	baseline,
	output,
	sourceFrame,
	sourceRect,
}: {
	baseline: Buffer;
	output: Buffer;
	sourceFrame: Buffer;
	sourceRect: StickerEvidencePixelRect;
}): SourceFrameMatchMetrics {
	const frameWidth = STICKER_SOURCE_MATCH_FRAME_SIZE.width;
	const expectedFrameBytes =
		frameWidth * STICKER_SOURCE_MATCH_FRAME_SIZE.height * 3;
	if (
		baseline.byteLength !== expectedFrameBytes ||
		output.byteLength !== expectedFrameBytes ||
		sourceFrame.byteLength !== sourceRect.width * sourceRect.height * 4
	) {
		throw new Error("Sticker source match received malformed frame pixels");
	}
	let actualEnergy = 0;
	let baselineError = 0;
	let comparedChannels = 0;
	let dotProduct = 0;
	let expectedEnergy = 0;
	let expectedForegroundPixels = 0;
	let expectedChangedPixels = 0;
	let expectedDifference = 0;
	let matchedForegroundPixels = 0;
	let predictedError = 0;
	for (let sourceY = 0; sourceY < sourceRect.height; sourceY += 1) {
		for (let sourceX = 0; sourceX < sourceRect.width; sourceX += 1) {
			const sourceOffset = (sourceY * sourceRect.width + sourceX) * 4;
			const frameOffset =
				((sourceRect.top + sourceY) * frameWidth + sourceRect.left + sourceX) *
				3;
			const alpha = sourceFrame[sourceOffset + 3];
			const actualResiduals: number[] = [];
			const expectedResiduals: number[] = [];
			const predictedChannels: number[] = [];
			for (let channel = 0; channel < 3; channel += 1) {
				const baselineChannel = baseline[frameOffset + channel];
				const outputChannel = output[frameOffset + channel];
				const sourceChannel = sourceFrame[sourceOffset + channel];
				const predictedChannel = Math.round(
					(sourceChannel * alpha + baselineChannel * (255 - alpha)) / 255
				);
				const actualResidual = outputChannel - baselineChannel;
				const expectedResidual = predictedChannel - baselineChannel;
				actualResiduals.push(actualResidual);
				expectedResiduals.push(expectedResidual);
				predictedChannels.push(predictedChannel);
				expectedDifference += Math.abs(expectedResidual);
				dotProduct += actualResidual * expectedResidual;
				actualEnergy += actualResidual * actualResidual;
				expectedEnergy += expectedResidual * expectedResidual;
			}
			const actualPixelChanged = actualResiduals.some(
				(value) => Math.abs(value) >= ACTUAL_CHANGED_CHANNEL_THRESHOLD
			);
			const expectedPixelChanged = expectedResiduals.some(
				(value) => Math.abs(value) >= ACTUAL_CHANGED_CHANNEL_THRESHOLD
			);
			if (expectedPixelChanged) expectedChangedPixels += 1;
			if (
				alpha >= STICKER_SOURCE_VISIBLE_ALPHA_THRESHOLD ||
				actualPixelChanged ||
				expectedPixelChanged
			) {
				for (let channel = 0; channel < 3; channel += 1) {
					baselineError += Math.abs(actualResiduals[channel]);
					predictedError += Math.abs(
						output[frameOffset + channel] - predictedChannels[channel]
					);
					comparedChannels += 1;
				}
			}
			if (alpha >= STICKER_SOURCE_VISIBLE_ALPHA_THRESHOLD) {
				expectedForegroundPixels += 1;
			}
			if (
				alpha >= STICKER_SOURCE_VISIBLE_ALPHA_THRESHOLD &&
				actualPixelChanged &&
				expectedPixelChanged
			) {
				matchedForegroundPixels += 1;
			}
		}
	}
	const correlationDenominator = Math.sqrt(actualEnergy * expectedEnergy);
	return {
		correlation:
			correlationDenominator > 0 ? dotProduct / correlationDenominator : 0,
		expectedAlphaPixelRatio:
			expectedForegroundPixels / (sourceRect.width * sourceRect.height),
		expectedChangedPixelRatio:
			expectedChangedPixels / (sourceRect.width * sourceRect.height),
		expectedMeanAbsoluteDifference:
			expectedDifference / (sourceRect.width * sourceRect.height * 3),
		foregroundRecall:
			expectedForegroundPixels > 0
				? matchedForegroundPixels / expectedForegroundPixels
				: 0,
		meanAbsoluteBaselineError:
			comparedChannels > 0 ? baselineError / comparedChannels : 0,
		meanAbsoluteCompositeError:
			comparedChannels > 0 ? predictedError / comparedChannels : 0,
	};
}

export function calculateStickerSourceFrameMatch({
	alternativeSources,
	baseline,
	expectedSource,
	output,
	selection,
}: {
	alternativeSources: Array<{
		frameIndex: number;
		itemId: string;
		source: PreparedStickerSource;
	}>;
	baseline: Buffer;
	expectedSource: PreparedStickerSource;
	output: Buffer;
	selection: StickerSourceFrameSelection;
}): StickerSourceFrameMatchEvidence {
	const expectedMetrics = sourceFrameMatchMetrics({
		baseline,
		output,
		sourceFrame: expectedSource.frames[selection.sourceFrameIndex],
		sourceRect: expectedSource.pixelRect,
	});
	let bestIdentityCorrelation: number | null = null;
	let bestTemporalCorrelation: number | null = null;
	let bestTemporalCompositeError: number | null = null;
	const temporalAlternativeMetrics: Array<{
		correlation: number;
		meanAbsoluteCompositeError: number;
		sourceFrameHash: string;
	}> = [];
	for (const alternative of alternativeSources) {
		const metrics = sourceFrameMatchMetrics({
			baseline,
			output,
			sourceFrame: alternative.source.frames[alternative.frameIndex],
			sourceRect: alternative.source.pixelRect,
		});
		if (alternative.itemId === expectedSource.item.sample.itemId) {
			const sourceFrameHash =
				alternative.source.frameHashes[alternative.frameIndex];
			if (sourceFrameHash !== selection.sourceFrameHash) {
				if (
					!temporalAlternativeMetrics.some(
						(candidate) => candidate.sourceFrameHash === sourceFrameHash
					)
				) {
					temporalAlternativeMetrics.push({
						correlation: metrics.correlation,
						meanAbsoluteCompositeError: metrics.meanAbsoluteCompositeError,
						sourceFrameHash,
					});
				}
				bestTemporalCorrelation = Math.max(
					bestTemporalCorrelation ?? -1,
					metrics.correlation
				);
				bestTemporalCompositeError = Math.min(
					bestTemporalCompositeError ?? Number.POSITIVE_INFINITY,
					metrics.meanAbsoluteCompositeError
				);
			}
			continue;
		}
		bestIdentityCorrelation = Math.max(
			bestIdentityCorrelation ?? -1,
			metrics.correlation
		);
	}
	const compositeErrorAdvantage =
		expectedMetrics.meanAbsoluteBaselineError -
		expectedMetrics.meanAbsoluteCompositeError;
	const identityCorrelationAdvantage =
		bestIdentityCorrelation === null
			? null
			: expectedMetrics.correlation - bestIdentityCorrelation;
	const temporalCorrelationAdvantage =
		bestTemporalCorrelation === null
			? null
			: expectedMetrics.correlation - bestTemporalCorrelation;
	const temporalCompositeErrorAdvantage =
		bestTemporalCompositeError === null
			? null
			: bestTemporalCompositeError - expectedMetrics.meanAbsoluteCompositeError;
	const observableAgainstBaseline =
		expectedMetrics.expectedMeanAbsoluteDifference > 0;
	const hasForegroundRecall =
		expectedMetrics.expectedChangedPixelRatio === 0 ||
		expectedMetrics.foregroundRecall >= MIN_FOREGROUND_RECALL;
	const matched =
		observableAgainstBaseline &&
		expectedMetrics.correlation >= MIN_SOURCE_CORRELATION &&
		compositeErrorAdvantage >= MIN_COMPOSITE_ERROR_ADVANTAGE &&
		hasForegroundRecall &&
		(identityCorrelationAdvantage === null ||
			identityCorrelationAdvantage >= MIN_IDENTITY_CORRELATION_ADVANTAGE);
	return {
		actualToExpectedCorrelation: expectedMetrics.correlation,
		actualToExpectedMeanAbsoluteError:
			expectedMetrics.meanAbsoluteCompositeError,
		actualToBaselineMeanAbsoluteError:
			expectedMetrics.meanAbsoluteBaselineError,
		compositeErrorAdvantage,
		expectedAlphaPixelRatio: expectedMetrics.expectedAlphaPixelRatio,
		expectedChangedPixelRatio: expectedMetrics.expectedChangedPixelRatio,
		expectedMeanAbsoluteDifference:
			expectedMetrics.expectedMeanAbsoluteDifference,
		expectedSourceFrameHash: selection.sourceFrameHash,
		expectedSourceFrameIndex: selection.sourceFrameIndex,
		foregroundRecall: expectedMetrics.foregroundRecall,
		identityCorrelationAdvantage,
		matched,
		observableAgainstBaseline,
		temporalCompositeErrorAdvantage,
		temporalCorrelationAdvantage,
		temporalAlternatives: temporalAlternativeMetrics.map(
			({ correlation, meanAbsoluteCompositeError, sourceFrameHash }) => ({
				compositeErrorAdvantage:
					meanAbsoluteCompositeError -
					expectedMetrics.meanAbsoluteCompositeError,
				correlationAdvantage: expectedMetrics.correlation - correlation,
				sourceFrameHash,
			})
		),
	};
}

export function calculateTemporalSourceSequenceEvidence({
	matches,
	selections,
}: {
	matches: StickerSourceFrameMatchEvidence[];
	selections: StickerSourceFrameSelection[];
}): StickerTemporalSequenceEvidence {
	const expectedFrameHashes = [
		...new Set(selections.map(({ sourceFrameHash }) => sourceFrameHash)),
	];
	if (expectedFrameHashes.length < 2 || matches.length !== selections.length) {
		return {
			distinctExpectedFrameCount: expectedFrameHashes.length,
			minimumFrozenCompositeErrorAdvantage: null,
			minimumFrozenCorrelationAdvantage: null,
			supportsExpectedSequence: false,
		};
	}
	const frozenCandidates = expectedFrameHashes.map((frozenFrameHash) => {
		let compositeErrorAdvantage = 0;
		let correlationAdvantage = 0;
		let comparisonCount = 0;
		for (const match of matches) {
			if (match.expectedSourceFrameHash === frozenFrameHash) continue;
			const alternative = match.temporalAlternatives.find(
				(candidate) => candidate.sourceFrameHash === frozenFrameHash
			);
			if (!alternative) {
				return {
					compositeErrorAdvantage: Number.NEGATIVE_INFINITY,
					correlationAdvantage: Number.NEGATIVE_INFINITY,
				};
			}
			compositeErrorAdvantage += alternative.compositeErrorAdvantage;
			correlationAdvantage += alternative.correlationAdvantage;
			comparisonCount += 1;
		}
		if (comparisonCount === 0) {
			return {
				compositeErrorAdvantage: Number.NEGATIVE_INFINITY,
				correlationAdvantage: Number.NEGATIVE_INFINITY,
			};
		}
		return {
			compositeErrorAdvantage: compositeErrorAdvantage / comparisonCount,
			correlationAdvantage: correlationAdvantage / comparisonCount,
		};
	});
	const minimumFrozenCompositeErrorAdvantage = Math.min(
		...frozenCandidates.map(
			({ compositeErrorAdvantage }) => compositeErrorAdvantage
		)
	);
	const minimumFrozenCorrelationAdvantage = Math.min(
		...frozenCandidates.map(({ correlationAdvantage }) => correlationAdvantage)
	);
	return {
		distinctExpectedFrameCount: expectedFrameHashes.length,
		minimumFrozenCompositeErrorAdvantage,
		minimumFrozenCorrelationAdvantage,
		supportsExpectedSequence:
			minimumFrozenCompositeErrorAdvantage >=
				MIN_TEMPORAL_SEQUENCE_COMPOSITE_ERROR_ADVANTAGE ||
			minimumFrozenCorrelationAdvantage >=
				MIN_TEMPORAL_SEQUENCE_CORRELATION_ADVANTAGE,
	};
}
