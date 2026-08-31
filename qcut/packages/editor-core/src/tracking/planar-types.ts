export interface NormalizedPoint {
	x: number;
	y: number;
}

export interface PlanarQuad {
	topLeft: NormalizedPoint;
	topRight: NormalizedPoint;
	bottomRight: NormalizedPoint;
	bottomLeft: NormalizedPoint;
}

export type PlanarMatrix3 = readonly [
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
	number,
];

export type PlanarTrackingDirection = "forward" | "backward" | "both";

export type PlanarSampleStatus = "tracked" | "lost" | "corrected";

export type PlanarTrackingReferenceStatus =
	| "idle"
	| "processing"
	| "paused"
	| "ready"
	| "partial"
	| "stale"
	| "error";

export type PlanarTrackingErrorCode =
	| "provider-unavailable"
	| "decode-failed"
	| "invalid-seed-quad"
	| "insufficient-texture"
	| "tracking-lost"
	| "degenerate-homography"
	| "result-write-failed"
	| "result-corrupt"
	| "cancelled";

export interface PlanarTrackingRange {
	startPtsUs: number;
	endPtsUs: number;
}

export interface PlanarTrackingReference {
	schemaVersion: 1;
	id: string;
	sourceMediaId: string;
	resultUri?: string;
	resultSha256?: string;
	seedPtsUs: number;
	seedQuad: PlanarQuad;
	direction: PlanarTrackingDirection;
	provider: "opencv-wasm";
	providerVersion: string;
	analysisWidth: number;
	analysisHeight: number;
	status: PlanarTrackingReferenceStatus;
	sampleCount?: number;
	trackedRange?: PlanarTrackingRange;
	errorCode?: PlanarTrackingErrorCode;
}

export interface StickerPlanarTracking {
	mode: "planar";
	sourceElementId: string;
	surfaceTrackingId: string;
	seedPtsUs: number;
	seedTargetQuad: PlanarQuad;
	lostBehavior: "hold" | "hide";
}

export interface PlanarTrackingDiagnostics {
	trackedPoints: number;
	inliers: number;
	inlierRatio: number;
	medianSymmetricErrorPx: number;
	coverage: number;
}

export interface PlanarTrackingSample {
	ptsUs: number;
	quad: PlanarQuad;
	status: PlanarSampleStatus;
	confidence: number;
	diagnostics?: PlanarTrackingDiagnostics;
}

export interface PlanarTrackingSidecarV1 {
	schemaVersion: 1;
	coordinateSpace: "source-display-normalized";
	timebase: "microseconds";
	source: {
		mediaId: string;
		contentSha256: string;
		displayWidth: number;
		displayHeight: number;
	};
	provider: {
		id: "opencv-wasm";
		version: string;
		parametersHash: string;
	};
	seed: {
		ptsUs: number;
		quad: PlanarQuad;
	};
	direction: PlanarTrackingDirection;
	samples: PlanarTrackingSample[];
}

export type PlanarTrackingValidationIssueCode =
	| "invalid-shape"
	| "invalid-literal"
	| "invalid-string"
	| "invalid-number"
	| "invalid-hash"
	| "invalid-quad"
	| "invalid-sample-order"
	| "invalid-seed-sample"
	| "invalid-diagnostics"
	| "invalid-reference-state"
	| "unsafe-result-uri"
	| "sample-limit-exceeded";

export interface PlanarTrackingValidationIssue {
	code: PlanarTrackingValidationIssueCode;
	path: string;
	message: string;
}

export type PlanarTrackingValidationResult<T> =
	| {
			valid: true;
			value: T;
			issues: [];
	  }
	| {
			valid: false;
			issues: PlanarTrackingValidationIssue[];
	  };
