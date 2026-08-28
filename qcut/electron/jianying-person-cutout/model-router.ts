import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createJianyingPortraitAdjustmentProvider } from "../jianying-portrait-adjustment-runtime/provider.js";
import {
	createPersonCutoutAbortError,
	throwIfPersonCutoutAborted,
} from "./abort.js";
import type { PersonCutoutModelRoute } from "./mask-cache.js";

const execFileAsync = promisify(execFile);
const SAMPLE_POSITIONS = [0.15, 0.35, 0.6] as const;
export const JIANYING_FACE_SAMPLE_RATIO_THRESHOLD = 0.5;

export type PersonCutoutRoutingMode = PersonCutoutModelRoute | "auto";

export type PersonCutoutRouteReason =
	| "face-ratio-at-or-above-threshold"
	| "face-ratio-below-threshold"
	| "face-sampling-failed"
	| "incomplete-face-samples"
	| "invalid-face-sample-counts"
	| "invalid-video-metadata"
	| "video-object-unavailable";

export interface PersonCutoutRouteDecision {
	confidence: "fail-closed" | "sampled-face-ratio";
	expectedSampleCount: number;
	facePositiveSampleCount: number;
	faceSampleRatio: number | null;
	reason: PersonCutoutRouteReason;
	route: PersonCutoutModelRoute;
	threshold: number;
	validSampleCount: number;
}

interface FaceSampleRequest {
	frameNumber: number;
	height: number;
	rgba: Uint8Array;
	width: number;
}

interface FaceSampleDetector {
	clear: () => Promise<void>;
	detectFace: (request: FaceSampleRequest) => Promise<boolean>;
}

interface ExtractFaceSampleRequest {
	ffmpegPath: string;
	outputPath: string;
	sampleIndex: number;
	signal?: AbortSignal;
	sourcePath: string;
	timestamp: number;
}

export interface PersonCutoutModelRouterDependencies {
	createFaceDetector: () => FaceSampleDetector;
	createTemporaryDirectory: () => Promise<string>;
	extractSample: (request: ExtractFaceSampleRequest) => Promise<void>;
	readSample: ({ filePath }: { filePath: string }) => Promise<Uint8Array>;
	removeTemporaryDirectory: ({
		directory,
	}: {
		directory: string;
	}) => Promise<void>;
	warn: (message: string, error: unknown) => void;
}

const defaultDependencies: PersonCutoutModelRouterDependencies = {
	createFaceDetector: () => {
		const provider = createJianyingPortraitAdjustmentProvider();
		return {
			clear: () => provider.clear(),
			detectFace: async ({ frameNumber, height, rgba, width }) => {
				const result = await provider.detect({
					frameNumber,
					height,
					personBindings: [],
					rgba,
					width,
				});
				return result.faces.length > 0;
			},
		};
	},
	createTemporaryDirectory: () =>
		mkdtemp(path.join(os.tmpdir(), "qcut-matting-route-")),
	extractSample: async ({
		ffmpegPath,
		outputPath,
		signal,
		sourcePath,
		timestamp,
	}) => {
		await execFileAsync(
			ffmpegPath,
			[
				"-y",
				"-v",
				"error",
				"-ss",
				String(timestamp),
				"-i",
				sourcePath,
				"-frames:v",
				"1",
				"-pix_fmt",
				"rgba",
				"-f",
				"rawvideo",
				outputPath,
			],
			{ maxBuffer: 4 * 1024 * 1024, signal }
		);
	},
	readSample: async ({ filePath }) => new Uint8Array(await readFile(filePath)),
	removeTemporaryDirectory: async ({ directory }) => {
		await rm(directory, { force: true, recursive: true });
	},
	warn: (message, error) => console.warn(message, error),
};

function failClosedDecision({
	expectedSampleCount,
	facePositiveSampleCount = 0,
	reason,
	validSampleCount = 0,
}: {
	expectedSampleCount: number;
	facePositiveSampleCount?: number;
	reason: Exclude<
		PersonCutoutRouteReason,
		"face-ratio-at-or-above-threshold" | "face-ratio-below-threshold"
	>;
	validSampleCount?: number;
}): PersonCutoutRouteDecision {
	return {
		confidence: "fail-closed",
		expectedSampleCount,
		facePositiveSampleCount,
		faceSampleRatio: null,
		reason,
		route: "portrait-gru",
		threshold: JIANYING_FACE_SAMPLE_RATIO_THRESHOLD,
		validSampleCount,
	};
}

export function resolvePersonCutoutRoutingMode({
	automaticRoutingEnabled,
	requestedRoute,
}: {
	automaticRoutingEnabled: boolean;
	requestedRoute?: string;
}): PersonCutoutRoutingMode {
	if (
		requestedRoute === "portrait-gru" ||
		requestedRoute === "video-object" ||
		requestedRoute === "saliency-script"
	) {
		return requestedRoute;
	}
	return automaticRoutingEnabled ? "auto" : "portrait-gru";
}

export function selectPersonCutoutRoute({
	expectedSampleCount,
	facePositiveSampleCount,
	validSampleCount,
	videoObjectCandidateAvailable,
}: {
	expectedSampleCount: number;
	facePositiveSampleCount: number;
	validSampleCount: number;
	videoObjectCandidateAvailable: boolean;
}): PersonCutoutRouteDecision {
	if (!videoObjectCandidateAvailable) {
		return failClosedDecision({
			expectedSampleCount,
			facePositiveSampleCount,
			reason: "video-object-unavailable",
			validSampleCount,
		});
	}
	const countsAreValid =
		Number.isSafeInteger(expectedSampleCount) &&
		expectedSampleCount > 0 &&
		Number.isSafeInteger(validSampleCount) &&
		validSampleCount >= 0 &&
		validSampleCount <= expectedSampleCount &&
		Number.isSafeInteger(facePositiveSampleCount) &&
		facePositiveSampleCount >= 0 &&
		facePositiveSampleCount <= validSampleCount;
	if (!countsAreValid) {
		return failClosedDecision({
			expectedSampleCount,
			facePositiveSampleCount,
			reason: "invalid-face-sample-counts",
			validSampleCount,
		});
	}
	if (validSampleCount !== expectedSampleCount) {
		return failClosedDecision({
			expectedSampleCount,
			facePositiveSampleCount,
			reason: "incomplete-face-samples",
			validSampleCount,
		});
	}
	const faceSampleRatio = facePositiveSampleCount / validSampleCount;
	const keepsPortrait = faceSampleRatio >= JIANYING_FACE_SAMPLE_RATIO_THRESHOLD;
	return {
		confidence: "sampled-face-ratio",
		expectedSampleCount,
		facePositiveSampleCount,
		faceSampleRatio,
		reason: keepsPortrait
			? "face-ratio-at-or-above-threshold"
			: "face-ratio-below-threshold",
		route: keepsPortrait ? "portrait-gru" : "video-object",
		threshold: JIANYING_FACE_SAMPLE_RATIO_THRESHOLD,
		validSampleCount,
	};
}

function validVideoMetadata({
	duration,
	frameRate,
	height,
	width,
}: {
	duration: number;
	frameRate: number;
	height: number;
	width: number;
}) {
	return (
		Number.isFinite(duration) &&
		duration > 0 &&
		Number.isFinite(frameRate) &&
		frameRate > 0 &&
		Number.isSafeInteger(width) &&
		width > 0 &&
		Number.isSafeInteger(height) &&
		height > 0 &&
		Number.isSafeInteger(width * height * 4)
	);
}

function warnWithoutThrowing({
	dependencies,
	error,
	message,
}: {
	dependencies: PersonCutoutModelRouterDependencies;
	error: unknown;
	message: string;
}) {
	try {
		dependencies.warn(message, error);
	} catch {
		// Diagnostics must not change the fail-closed routing result.
	}
}

async function detectFaceSamples({
	dependencies,
	detector,
	frameRate,
	height,
	sampleFrames,
	sampleIndex = 0,
	sampleTimes,
	signal,
	width,
}: {
	dependencies: PersonCutoutModelRouterDependencies;
	detector: FaceSampleDetector;
	frameRate: number;
	height: number;
	sampleFrames: Array<Uint8Array | null>;
	sampleIndex?: number;
	sampleTimes: number[];
	signal?: AbortSignal;
	width: number;
}): Promise<Array<boolean | null>> {
	throwIfPersonCutoutAborted({ signal });
	if (sampleIndex >= sampleFrames.length) return [];
	const rgba = sampleFrames[sampleIndex];
	if (!rgba) {
		return [
			null,
			...(await detectFaceSamples({
				dependencies,
				detector,
				frameRate,
				height,
				sampleFrames,
				sampleIndex: sampleIndex + 1,
				sampleTimes,
				signal,
				width,
			})),
		];
	}
	let detected: boolean | null = null;
	try {
		detected = await detector.detectFace({
			frameNumber: Math.round(sampleTimes[sampleIndex] * frameRate),
			height,
			rgba,
			width,
		});
	} catch (error) {
		if (signal?.aborted) throw createPersonCutoutAbortError();
		warnWithoutThrowing({
			dependencies,
			error,
			message: `Person cutout face sample ${sampleIndex} failed.`,
		});
	}
	throwIfPersonCutoutAborted({ signal });
	return [
		detected,
		...(await detectFaceSamples({
			dependencies,
			detector,
			frameRate,
			height,
			sampleFrames,
			sampleIndex: sampleIndex + 1,
			sampleTimes,
			signal,
			width,
		})),
	];
}

export async function detectPersonCutoutModelRoute({
	dependencies = defaultDependencies,
	duration,
	ffmpegPath,
	frameRate,
	height,
	signal,
	videoObjectCandidateAvailable,
	sourcePath,
	width,
}: {
	dependencies?: PersonCutoutModelRouterDependencies;
	duration: number;
	ffmpegPath: string;
	frameRate: number;
	height: number;
	signal?: AbortSignal;
	videoObjectCandidateAvailable: boolean;
	sourcePath: string;
	width: number;
}): Promise<PersonCutoutRouteDecision> {
	throwIfPersonCutoutAborted({ signal });
	const expectedSampleCount = SAMPLE_POSITIONS.length;
	if (!videoObjectCandidateAvailable) {
		return selectPersonCutoutRoute({
			expectedSampleCount,
			facePositiveSampleCount: 0,
			validSampleCount: 0,
			videoObjectCandidateAvailable,
		});
	}
	if (!validVideoMetadata({ duration, frameRate, height, width })) {
		return failClosedDecision({
			expectedSampleCount,
			reason: "invalid-video-metadata",
		});
	}

	let detector: FaceSampleDetector | null = null;
	let directory: string | null = null;
	let decision = failClosedDecision({
		expectedSampleCount,
		reason: "face-sampling-failed",
	});
	try {
		const workingDirectory = await dependencies.createTemporaryDirectory();
		directory = workingDirectory;
		throwIfPersonCutoutAborted({ signal });
		const activeDetector = dependencies.createFaceDetector();
		detector = activeDetector;
		throwIfPersonCutoutAborted({ signal });
		const sampleTimes = SAMPLE_POSITIONS.map((position) =>
			Math.max(0, Math.min(duration - 1 / frameRate, duration * position))
		);
		const samplePaths = sampleTimes.map((_, index) =>
			path.join(workingDirectory, `sample-${index}.rgba`)
		);
		const extractionResults = await Promise.allSettled(
			sampleTimes.map((timestamp, sampleIndex) =>
				dependencies.extractSample({
					ffmpegPath,
					outputPath: samplePaths[sampleIndex],
					sampleIndex,
					signal,
					sourcePath,
					timestamp,
				})
			)
		);
		throwIfPersonCutoutAborted({ signal });
		const expectedBytes = width * height * 4;
		const sampleFrames = await Promise.all(
			samplePaths.map(async (filePath, sampleIndex) => {
				if (extractionResults[sampleIndex]?.status !== "fulfilled") return null;
				try {
					const rgba = await dependencies.readSample({ filePath });
					return rgba.byteLength === expectedBytes ? rgba : null;
				} catch (error) {
					warnWithoutThrowing({
						dependencies,
						error,
						message: `Person cutout face sample ${sampleIndex} failed.`,
					});
					return null;
				}
			})
		);
		const faceSampleResults = await detectFaceSamples({
			dependencies,
			detector: activeDetector,
			frameRate,
			height,
			sampleFrames,
			sampleTimes,
			signal,
			width,
		});
		const validSampleCount = faceSampleResults.filter(
			(result) => result !== null
		).length;
		const facePositiveSampleCount = faceSampleResults.filter(
			(result) => result === true
		).length;
		decision = selectPersonCutoutRoute({
			expectedSampleCount,
			facePositiveSampleCount,
			validSampleCount,
			videoObjectCandidateAvailable,
		});
	} catch (error) {
		if (
			signal?.aborted ||
			(error instanceof Error && error.name === "AbortError")
		) {
			throw createPersonCutoutAbortError();
		}
		warnWithoutThrowing({
			dependencies,
			error,
			message:
				"Person cutout model routing failed; keeping the portrait GRU route.",
		});
	} finally {
		const cleanupTasks: Array<() => Promise<void>> = [];
		const detectorToClear = detector;
		if (detectorToClear) {
			cleanupTasks.push(() => detectorToClear.clear());
		}
		const directoryToRemove = directory;
		if (directoryToRemove) {
			cleanupTasks.push(() =>
				dependencies.removeTemporaryDirectory({ directory: directoryToRemove })
			);
		}
		const cleanupResults = await Promise.allSettled(
			cleanupTasks.map((cleanup) => Promise.resolve().then(cleanup))
		);
		for (const cleanupResult of cleanupResults) {
			if (cleanupResult.status === "fulfilled") continue;
			warnWithoutThrowing({
				dependencies,
				error: cleanupResult.reason,
				message: "Person cutout model routing cleanup failed.",
			});
		}
	}
	return decision;
}
