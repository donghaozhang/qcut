import type {
	PlanarQuad,
	PlanarTrackingDiagnostics,
	PlanarTrackingSample,
} from "@qcut/editor-core";

export interface PlanarAnalysisFrame {
	gray: Uint8Array;
	height: number;
	ptsUs: number;
	width: number;
}

export interface PlanarTrackerConfiguration {
	blockSize: number;
	forwardBackwardMaxErrorPx: number;
	lkMaxError: number;
	lkWindowSize: number;
	maxFeatures: number;
	maxMedianErrorPx: number;
	minFeatureDistancePx: number;
	minInlierRatio: number;
	minInliers: number;
	minTrackedPoints: number;
	pyramidLevels: number;
	qualityLevel: number;
	ransacReprojectionThresholdPx: number;
}

export const DEFAULT_PLANAR_TRACKER_CONFIGURATION = {
	blockSize: 7,
	forwardBackwardMaxErrorPx: 1.5,
	lkMaxError: 24,
	lkWindowSize: 21,
	maxFeatures: 240,
	maxMedianErrorPx: 3.5,
	minFeatureDistancePx: 6,
	minInlierRatio: 0.45,
	minInliers: 8,
	minTrackedPoints: 10,
	pyramidLevels: 3,
	qualityLevel: 0.01,
	ransacReprojectionThresholdPx: 2.5,
} satisfies PlanarTrackerConfiguration;

export const OPENCV_PLANAR_PROVIDER_VERSION = "5.0.0-techstark.1";

export interface PlanarTrackerBeginResult {
	diagnostics: PlanarTrackingDiagnostics;
	featureCount: number;
	sample: PlanarTrackingSample;
}

export interface PlanarTrackerStepResult {
	lostReason?: string;
	sample: PlanarTrackingSample;
}

export type PlanarTrackerWorkerRequest =
	| {
			id: number;
			runtimeUrl: string;
			type: "initialize";
	  }
	| {
			configuration: PlanarTrackerConfiguration;
			frame: PlanarAnalysisFrame;
			id: number;
			seedQuad: PlanarQuad;
			type: "begin";
	  }
	| {
			frame: PlanarAnalysisFrame;
			id: number;
			type: "track";
	  }
	| {
			id: number;
			type: "reset";
	  }
	| {
			id: number;
			type: "dispose";
	  };

export type PlanarTrackerWorkerResponse =
	| {
			id: number;
			result: { providerVersion: string };
			type: "initialized";
	  }
	| {
			id: number;
			result: PlanarTrackerBeginResult;
			type: "begun";
	  }
	| {
			id: number;
			result: PlanarTrackerStepResult;
			type: "tracked";
	  }
	| {
			id: number;
			type: "reset" | "disposed";
	  }
	| {
			code?: string;
			id: number;
			message: string;
			type: "error";
	  };
