import type {
	KeyPointVector,
	Mat,
	Point,
	Size,
	TermCriteria,
} from "@techstark/opencv-js";
import type {
	PlanarMatrix3,
	PlanarQuad,
	PlanarTrackingDiagnostics,
} from "@qcut/editor-core";
import {
	buildPlanarQuadMask,
	calculatePlanarTrackingDiagnostics,
	denormalizePlanarQuad,
	planarTrackingConfidence,
	projectTrackedPlanarQuad,
	type PixelPoint,
} from "./planar-tracker-metrics";
import type {
	PlanarAnalysisFrame,
	PlanarTrackerBeginResult,
	PlanarTrackerConfiguration,
	PlanarTrackerStepResult,
} from "./planar-tracker-protocol";

interface GfttDetector {
	delete: () => void;
	detect: (image: Mat, keypoints: KeyPointVector, mask: Mat) => void;
	setBlockSize: (value: number) => void;
	setHarrisDetector: (value: boolean) => void;
	setK: (value: number) => void;
	setMaxFeatures: (value: number) => void;
	setMinDistance: (value: number) => void;
	setQualityLevel: (value: number) => void;
}

type OpenCvExports = typeof import("@techstark/opencv-js");

export type OpenCvPlanarRuntime = OpenCvExports & {
	GFTTDetector: new () => GfttDetector;
	KeyPointVector: new () => KeyPointVector;
	Mat: typeof Mat;
	Point: typeof Point;
	Size: typeof Size;
	TermCriteria: typeof TermCriteria;
};

interface TrackerState {
	configuration: PlanarTrackerConfiguration;
	height: number;
	lastQuad: PlanarQuad;
	prevGray: Mat;
	prevPoints: PixelPoint[];
	seedGray: Mat;
	seedPoints: PixelPoint[];
	seedPointsOriginal: PixelPoint[];
	seedQuad: PlanarQuad;
	seedQuadPixels: PlanarQuad;
	seedPtsUs: number;
	width: number;
}

export class OpenCvPlanarTrackerError extends Error {
	readonly code: string;

	constructor({ code, message }: { code: string; message: string }) {
		super(message);
		this.name = "OpenCvPlanarTrackerError";
		this.code = code;
	}
}

function validateFrame({ frame }: { frame: PlanarAnalysisFrame }): void {
	if (
		!Number.isSafeInteger(frame.ptsUs) ||
		frame.width < 1 ||
		frame.height < 1 ||
		frame.gray.length !== frame.width * frame.height
	) {
		throw new OpenCvPlanarTrackerError({
			code: "decode-failed",
			message: "Invalid planar analysis frame.",
		});
	}
}

function pointsToMat({
	cv,
	points,
}: {
	cv: OpenCvPlanarRuntime;
	points: readonly PixelPoint[];
}): Mat {
	return cv.matFromArray(
		points.length,
		1,
		cv.CV_32FC2,
		points.flatMap((point) => [point.x, point.y])
	);
}

function pointsFromMat({ mat }: { mat: Mat }): PixelPoint[] {
	const points: PixelPoint[] = [];
	for (let index = 0; index < mat.rows; index += 1) {
		points.push({ x: mat.data32F[index * 2], y: mat.data32F[index * 2 + 1] });
	}
	return points;
}

function matrixFromMat({ mat }: { mat: Mat }): PlanarMatrix3 | null {
	if (mat.rows !== 3 || mat.cols !== 3 || mat.data64F.length < 9) return null;
	const values = Array.from(mat.data64F.slice(0, 9));
	if (!values.every(Number.isFinite)) return null;
	return values as unknown as PlanarMatrix3;
}

function emptyDiagnostics({
	trackedPoints,
}: {
	trackedPoints: number;
}): PlanarTrackingDiagnostics {
	return {
		trackedPoints,
		inliers: 0,
		inlierRatio: 0,
		medianSymmetricErrorPx: Number.MAX_VALUE,
		coverage: 0,
	};
}

export class OpenCvPlanarTrackerKernel {
	private readonly cv: OpenCvPlanarRuntime;
	private state?: TrackerState;

	constructor({ cv }: { cv: OpenCvPlanarRuntime }) {
		this.cv = cv;
	}

	private frameMat({ frame }: { frame: PlanarAnalysisFrame }): Mat {
		validateFrame({ frame });
		return this.cv.matFromArray(
			frame.height,
			frame.width,
			this.cv.CV_8UC1,
			frame.gray
		);
	}

	private detectFeatures({
		configuration,
		gray,
		mask,
	}: {
		configuration: PlanarTrackerConfiguration;
		gray: Mat;
		mask: Mat;
	}): PixelPoint[] {
		const detector = new this.cv.GFTTDetector();
		const keypoints = new this.cv.KeyPointVector();
		try {
			detector.setMaxFeatures(configuration.maxFeatures);
			detector.setQualityLevel(configuration.qualityLevel);
			detector.setMinDistance(configuration.minFeatureDistancePx);
			detector.setBlockSize(configuration.blockSize);
			detector.setHarrisDetector(false);
			detector.setK(0.04);
			detector.detect(gray, keypoints, mask);
			const points: PixelPoint[] = [];
			for (let index = 0; index < keypoints.size(); index += 1) {
				const keypoint = keypoints.get(index) as unknown as { pt: PixelPoint };
				if (Number.isFinite(keypoint.pt.x) && Number.isFinite(keypoint.pt.y)) {
					points.push({ x: keypoint.pt.x, y: keypoint.pt.y });
				}
			}
			return points;
		} finally {
			keypoints.delete();
			detector.delete();
		}
	}

	begin({
		configuration,
		frame,
		seedQuad,
	}: {
		configuration: PlanarTrackerConfiguration;
		frame: PlanarAnalysisFrame;
		seedQuad: PlanarQuad;
	}): PlanarTrackerBeginResult {
		this.dispose();
		const seedGray = this.frameMat({ frame });
		const seedQuadPixels = denormalizePlanarQuad({
			height: frame.height,
			quad: seedQuad,
			width: frame.width,
		});
		const mask = this.cv.matFromArray(
			frame.height,
			frame.width,
			this.cv.CV_8UC1,
			buildPlanarQuadMask({
				height: frame.height,
				quad: seedQuadPixels,
				width: frame.width,
			})
		);
		let points: PixelPoint[];
		try {
			points = this.detectFeatures({ configuration, gray: seedGray, mask });
		} finally {
			mask.delete();
		}
		if (points.length < configuration.minTrackedPoints) {
			seedGray.delete();
			throw new OpenCvPlanarTrackerError({
				code: "insufficient-texture",
				message: `Planar seed contains only ${points.length} trackable features.`,
			});
		}
		this.state = {
			configuration,
			height: frame.height,
			lastQuad: seedQuad,
			prevGray: seedGray.clone(),
			prevPoints: points.map((point) => ({ ...point })),
			seedGray,
			seedPoints: points.map((point) => ({ ...point })),
			seedPointsOriginal: points.map((point) => ({ ...point })),
			seedQuad,
			seedQuadPixels,
			seedPtsUs: frame.ptsUs,
			width: frame.width,
		};
		const diagnostics = calculatePlanarTrackingDiagnostics({
			currentInliers: points,
			inliers: points.length,
			matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
			seedInliers: points,
			seedQuad: seedQuadPixels,
			trackedPoints: points.length,
		});
		return {
			diagnostics,
			featureCount: points.length,
			sample: {
				ptsUs: frame.ptsUs,
				quad: seedQuad,
				status: "corrected",
				confidence: 1,
				diagnostics,
			},
		};
	}

	reset(): void {
		const state = this.state;
		if (!state) {
			throw new OpenCvPlanarTrackerError({
				code: "provider-unavailable",
				message: "Planar tracker has not been initialized.",
			});
		}
		state.prevGray.delete();
		state.prevGray = state.seedGray.clone();
		state.prevPoints = state.seedPointsOriginal.map((point) => ({ ...point }));
		state.seedPoints = state.seedPointsOriginal.map((point) => ({ ...point }));
		state.lastQuad = state.seedQuad;
	}

	private lostResult({
		diagnostics,
		ptsUs,
		reason,
	}: {
		diagnostics: PlanarTrackingDiagnostics;
		ptsUs: number;
		reason: string;
	}): PlanarTrackerStepResult {
		const state = this.state;
		if (!state) throw new Error("Planar tracker state is missing.");
		return {
			lostReason: reason,
			sample: {
				ptsUs,
				quad: state.lastQuad,
				status: "lost",
				confidence: 0,
				diagnostics,
			},
		};
	}

	track({ frame }: { frame: PlanarAnalysisFrame }): PlanarTrackerStepResult {
		const state = this.state;
		if (!state) {
			throw new OpenCvPlanarTrackerError({
				code: "provider-unavailable",
				message: "Planar tracker has not been initialized.",
			});
		}
		validateFrame({ frame });
		if (frame.width !== state.width || frame.height !== state.height) {
			throw new OpenCvPlanarTrackerError({
				code: "decode-failed",
				message: "Planar analysis frame dimensions changed during tracking.",
			});
		}
		const nextGray = this.frameMat({ frame });
		const prevPointsMat = pointsToMat({
			cv: this.cv,
			points: state.prevPoints,
		});
		const nextPointsMat = new this.cv.Mat();
		const forwardStatus = new this.cv.Mat();
		const forwardError = new this.cv.Mat();
		const backwardPointsMat = new this.cv.Mat();
		const backwardStatus = new this.cv.Mat();
		const backwardError = new this.cv.Mat();
		let keepNextGray = false;
		try {
			const windowSize = new this.cv.Size(
				state.configuration.lkWindowSize,
				state.configuration.lkWindowSize
			);
			const criteria = new this.cv.TermCriteria(
				this.cv.TermCriteria_COUNT + this.cv.TermCriteria_EPS,
				30,
				0.01
			);
			this.cv.calcOpticalFlowPyrLK(
				state.prevGray,
				nextGray,
				prevPointsMat,
				nextPointsMat,
				forwardStatus,
				forwardError,
				windowSize,
				state.configuration.pyramidLevels,
				criteria
			);
			this.cv.calcOpticalFlowPyrLK(
				nextGray,
				state.prevGray,
				nextPointsMat,
				backwardPointsMat,
				backwardStatus,
				backwardError,
				windowSize,
				state.configuration.pyramidLevels,
				criteria
			);
			const nextPoints = pointsFromMat({ mat: nextPointsMat });
			const backwardPoints = pointsFromMat({ mat: backwardPointsMat });
			const seedCandidates: PixelPoint[] = [];
			const currentCandidates: PixelPoint[] = [];
			for (let index = 0; index < state.prevPoints.length; index += 1) {
				const previous = state.prevPoints[index];
				const current = nextPoints[index];
				const backward = backwardPoints[index];
				if (
					forwardStatus.data[index] !== 1 ||
					backwardStatus.data[index] !== 1 ||
					forwardError.data32F[index] > state.configuration.lkMaxError ||
					backwardError.data32F[index] > state.configuration.lkMaxError ||
					!current ||
					!backward ||
					current.x < 0 ||
					current.y < 0 ||
					current.x >= state.width ||
					current.y >= state.height ||
					Math.hypot(previous.x - backward.x, previous.y - backward.y) >
						state.configuration.forwardBackwardMaxErrorPx
				) {
					continue;
				}
				seedCandidates.push(state.seedPoints[index]);
				currentCandidates.push(current);
			}
			if (currentCandidates.length < state.configuration.minTrackedPoints) {
				return this.lostResult({
					diagnostics: emptyDiagnostics({
						trackedPoints: currentCandidates.length,
					}),
					ptsUs: frame.ptsUs,
					reason: "Too few forward-backward-consistent points.",
				});
			}
			const seedMat = pointsToMat({ cv: this.cv, points: seedCandidates });
			const currentMat = pointsToMat({
				cv: this.cv,
				points: currentCandidates,
			});
			const inlierMask = new this.cv.Mat();
			let homography: Mat | undefined;
			try {
				homography = this.cv.findHomography(
					seedMat,
					currentMat,
					this.cv.RANSAC,
					state.configuration.ransacReprojectionThresholdPx,
					inlierMask,
					2000,
					0.995
				);
				const matrix = matrixFromMat({ mat: homography });
				if (!matrix) {
					return this.lostResult({
						diagnostics: emptyDiagnostics({
							trackedPoints: currentCandidates.length,
						}),
						ptsUs: frame.ptsUs,
						reason: "Homography is degenerate.",
					});
				}
				const seedInliers: PixelPoint[] = [];
				const currentInliers: PixelPoint[] = [];
				for (let index = 0; index < currentCandidates.length; index += 1) {
					if (inlierMask.data[index] !== 1) continue;
					seedInliers.push(seedCandidates[index]);
					currentInliers.push(currentCandidates[index]);
				}
				const diagnostics = calculatePlanarTrackingDiagnostics({
					currentInliers,
					inliers: currentInliers.length,
					matrix,
					seedInliers,
					seedQuad: state.seedQuadPixels,
					trackedPoints: currentCandidates.length,
				});
				const quad = projectTrackedPlanarQuad({
					height: state.height,
					matrix,
					seedQuad: state.seedQuadPixels,
					width: state.width,
				});
				if (
					!quad ||
					diagnostics.inliers < state.configuration.minInliers ||
					diagnostics.inlierRatio < state.configuration.minInlierRatio ||
					diagnostics.medianSymmetricErrorPx >
						state.configuration.maxMedianErrorPx
				) {
					return this.lostResult({
						diagnostics,
						ptsUs: frame.ptsUs,
						reason: "Homography quality fell below the tracking threshold.",
					});
				}
				state.prevGray.delete();
				state.prevGray = nextGray;
				state.prevPoints = currentInliers;
				state.seedPoints = seedInliers;
				state.lastQuad = quad;
				keepNextGray = true;
				return {
					sample: {
						ptsUs: frame.ptsUs,
						quad,
						status: "tracked",
						confidence: planarTrackingConfidence({
							diagnostics,
							minInliers: state.configuration.minInliers,
						}),
						diagnostics,
					},
				};
			} finally {
				homography?.delete();
				inlierMask.delete();
				currentMat.delete();
				seedMat.delete();
			}
		} finally {
			if (!keepNextGray) nextGray.delete();
			backwardError.delete();
			backwardStatus.delete();
			backwardPointsMat.delete();
			forwardError.delete();
			forwardStatus.delete();
			nextPointsMat.delete();
			prevPointsMat.delete();
		}
	}

	dispose(): void {
		this.state?.prevGray.delete();
		this.state?.seedGray.delete();
		this.state = undefined;
	}
}
