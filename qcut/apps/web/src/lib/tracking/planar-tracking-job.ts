import type {
	PlanarQuad,
	PlanarTrackingDirection,
	PlanarTrackingErrorCode,
	PlanarTrackingReference,
	PlanarTrackingResultStore,
	StickerPlanarTracking,
} from "@qcut/editor-core";
import {
	analyzePlanarTracking,
	type AnalyzePlanarTrackingOptions,
	type PlanarTrackingAnalysisProgress,
	type PlanarTrackingAnalysisResult,
} from "./planar-tracking-analyzer";
import { OPENCV_PLANAR_PROVIDER_VERSION } from "./planar-tracker-protocol";

const PLANAR_ERROR_CODES = new Set<PlanarTrackingErrorCode>([
	"provider-unavailable",
	"decode-failed",
	"invalid-seed-quad",
	"insufficient-texture",
	"tracking-lost",
	"degenerate-homography",
	"result-write-failed",
	"result-corrupt",
	"cancelled",
]);

type AnalyzePlanarTracking = (
	options: AnalyzePlanarTrackingOptions
) => Promise<PlanarTrackingAnalysisResult>;

export interface RunPlanarTrackingJobOptions {
	analyze?: AnalyzePlanarTracking;
	direction: PlanarTrackingDirection;
	file: File;
	lostBehavior: StickerPlanarTracking["lostBehavior"];
	onBinding: (binding: StickerPlanarTracking) => void;
	onProgress?: (progress: PlanarTrackingAnalysisProgress) => void;
	onReference: (reference: PlanarTrackingReference) => void;
	projectId: string;
	resultStore: PlanarTrackingResultStore;
	seedPtsUs: number;
	seedQuad: PlanarQuad;
	seedTargetQuad: PlanarQuad;
	signal?: AbortSignal;
	sourceDisplayHeight: number;
	sourceDisplayWidth: number;
	sourceElementId: string;
	sourceMediaId: string;
	trackingId: string;
}

export interface PlanarTrackingJobResult {
	binding: StickerPlanarTracking;
	reference: PlanarTrackingReference;
}

function analysisSize({ height, width }: { height: number; width: number }): {
	height: number;
	width: number;
} {
	const safeWidth = Math.max(1, Math.round(width));
	const safeHeight = Math.max(1, Math.round(height));
	const scale = Math.min(1, 960 / safeWidth, 540 / safeHeight);
	return {
		height: Math.max(1, Math.round(safeHeight * scale)),
		width: Math.max(1, Math.round(safeWidth * scale)),
	};
}

function errorCode({ cause }: { cause: unknown }): PlanarTrackingErrorCode {
	if (cause instanceof DOMException && cause.name === "AbortError") {
		return "cancelled";
	}
	if (cause instanceof Error) {
		const code = Reflect.get(cause, "code");
		if (
			typeof code === "string" &&
			PLANAR_ERROR_CODES.has(code as PlanarTrackingErrorCode)
		) {
			return code as PlanarTrackingErrorCode;
		}
	}
	return "decode-failed";
}

function failedReference({
	code,
	reference,
}: {
	code: PlanarTrackingErrorCode;
	reference: PlanarTrackingReference;
}): PlanarTrackingReference {
	return {
		...reference,
		status: "error",
		errorCode: code,
	};
}

export async function runPlanarTrackingJob({
	analyze = analyzePlanarTracking,
	direction,
	file,
	lostBehavior,
	onBinding,
	onProgress,
	onReference,
	projectId,
	resultStore,
	seedPtsUs,
	seedQuad,
	seedTargetQuad,
	signal,
	sourceDisplayHeight,
	sourceDisplayWidth,
	sourceElementId,
	sourceMediaId,
	trackingId,
}: RunPlanarTrackingJobOptions): Promise<PlanarTrackingJobResult> {
	const initialSize = analysisSize({
		height: sourceDisplayHeight,
		width: sourceDisplayWidth,
	});
	const processingReference: PlanarTrackingReference = {
		schemaVersion: 1,
		id: trackingId,
		sourceMediaId,
		seedPtsUs,
		seedQuad,
		direction,
		provider: "opencv-wasm",
		providerVersion: OPENCV_PLANAR_PROVIDER_VERSION,
		analysisWidth: initialSize.width,
		analysisHeight: initialSize.height,
		status: "processing",
	};
	onReference(processingReference);

	let analysis: PlanarTrackingAnalysisResult;
	try {
		analysis = await analyze({
			direction,
			file,
			onProgress,
			seedPtsUs,
			seedQuad,
			signal,
			sourceMediaId,
		});
	} catch (cause) {
		onReference(
			failedReference({
				code: errorCode({ cause }),
				reference: processingReference,
			})
		);
		throw cause;
	}

	let stored: Awaited<ReturnType<PlanarTrackingResultStore["write"]>>;
	try {
		stored = await resultStore.write({
			projectId,
			trackingId,
			sidecar: analysis.sidecar,
		});
	} catch (cause) {
		onReference(
			failedReference({
				code: "result-write-failed",
				reference: processingReference,
			})
		);
		throw cause;
	}

	const firstSample = analysis.sidecar.samples[0];
	const lastSample = analysis.sidecar.samples.at(-1) ?? firstSample;
	const reference: PlanarTrackingReference = {
		...processingReference,
		resultUri: stored.resultUri,
		resultSha256: stored.resultSha256,
		seedPtsUs: analysis.sidecar.seed.ptsUs,
		providerVersion: analysis.providerVersion,
		analysisWidth: analysis.analysisWidth,
		analysisHeight: analysis.analysisHeight,
		status: analysis.lostDirections.length > 0 ? "partial" : "ready",
		sampleCount: analysis.sidecar.samples.length,
		trackedRange: {
			startPtsUs: firstSample.ptsUs,
			endPtsUs: lastSample.ptsUs,
		},
	};
	const binding: StickerPlanarTracking = {
		mode: "planar",
		sourceElementId,
		surfaceTrackingId: trackingId,
		seedPtsUs: analysis.sidecar.seed.ptsUs,
		seedTargetQuad,
		lostBehavior,
	};
	onReference(reference);
	onBinding(binding);
	return { binding, reference };
}
