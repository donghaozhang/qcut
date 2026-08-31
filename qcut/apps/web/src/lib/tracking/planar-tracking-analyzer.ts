import { sha256 } from "@noble/hashes/sha2";
import type {
	PlanarQuad,
	PlanarTrackingDirection,
	PlanarTrackingSample,
	PlanarTrackingSidecarV1,
} from "@qcut/editor-core";
import {
	type PlanarFrameSource,
	MediabunnyPlanarFrameSource,
} from "./mediabunny-planar-frame-source";
import { OpenCvPlanarTrackerClient } from "./opencv-planar-tracker-client";
import {
	DEFAULT_PLANAR_TRACKER_CONFIGURATION,
	type PlanarAnalysisFrame,
	type PlanarTrackerBeginResult,
	type PlanarTrackerConfiguration,
	type PlanarTrackerStepResult,
} from "./planar-tracker-protocol";

const SHA256_PATTERN = /^[a-f\d]{64}$/i;

export type PlanarTrackingAnalysisPhase =
	| "hashing"
	| "initializing"
	| "backward"
	| "forward"
	| "complete";

export interface PlanarTrackingAnalysisProgress {
	phase: PlanarTrackingAnalysisPhase;
	processedFrames: number;
	progress: number;
	ptsUs?: number;
}

export interface PlanarTrackerProvider {
	begin: ({
		configuration,
		frame,
		seedQuad,
	}: {
		configuration?: PlanarTrackerConfiguration;
		frame: PlanarAnalysisFrame;
		seedQuad: PlanarQuad;
	}) => Promise<PlanarTrackerBeginResult>;
	dispose: () => Promise<void>;
	initialize: () => Promise<{ providerVersion: string }>;
	reset: () => Promise<void>;
	terminate: () => void;
	track: ({
		frame,
	}: {
		frame: PlanarAnalysisFrame;
	}) => Promise<PlanarTrackerStepResult>;
}

export interface AnalyzePlanarTrackingOptions {
	configuration?: PlanarTrackerConfiguration;
	direction: PlanarTrackingDirection;
	file: File;
	frameSource?: PlanarFrameSource;
	onProgress?: (progress: PlanarTrackingAnalysisProgress) => void;
	seedPtsUs: number;
	seedQuad: PlanarQuad;
	signal?: AbortSignal;
	sourceContentSha256?: string;
	sourceMediaId: string;
	tracker?: PlanarTrackerProvider;
}

export interface PlanarTrackingAnalysisResult {
	lostDirections: PlanarTrackingDirection[];
	providerVersion: string;
	sidecar: PlanarTrackingSidecarV1;
}

function bytesToHex({ bytes }: { bytes: Uint8Array }): string {
	return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(
		""
	);
}

export async function sha256Blob({
	blob,
	onProgress,
	signal,
}: {
	blob: Blob;
	onProgress?: (progress: number) => void;
	signal?: AbortSignal;
}): Promise<string> {
	const hasher = sha256.create();
	const chunkSize = 4 * 1024 * 1024;
	const hashChunk = async ({ offset }: { offset: number }): Promise<void> => {
		if (offset >= blob.size) return;
		signal?.throwIfAborted();
		const nextOffset = Math.min(offset + chunkSize, blob.size);
		const chunk = new Uint8Array(
			await blob.slice(offset, nextOffset).arrayBuffer()
		);
		hasher.update(chunk);
		onProgress?.(blob.size > 0 ? nextOffset / blob.size : 1);
		await hashChunk({ offset: nextOffset });
	};
	await hashChunk({ offset: 0 });
	signal?.throwIfAborted();
	return bytesToHex({ bytes: hasher.digest() });
}

function hashConfiguration({
	configuration,
}: {
	configuration: PlanarTrackerConfiguration;
}): string {
	const sorted = Object.fromEntries(
		Object.entries(configuration).sort(([left], [right]) =>
			left.localeCompare(right)
		)
	);
	return bytesToHex({
		bytes: sha256(new TextEncoder().encode(JSON.stringify(sorted))),
	});
}

function sourceHash({
	file,
	onProgress,
	signal,
	sourceContentSha256,
}: {
	file: File;
	onProgress?: (progress: number) => void;
	signal?: AbortSignal;
	sourceContentSha256?: string;
}): Promise<string> {
	if (sourceContentSha256) {
		if (!SHA256_PATTERN.test(sourceContentSha256)) {
			return Promise.reject(new Error("Source media SHA-256 is invalid."));
		}
		onProgress?.(1);
		return Promise.resolve(sourceContentSha256.toLowerCase());
	}
	return sha256Blob({ blob: file, onProgress, signal });
}

function directionProgress({
	direction,
	endPtsUs,
	phase,
	ptsUs,
	seedPtsUs,
	startPtsUs,
}: {
	direction: PlanarTrackingDirection;
	endPtsUs: number;
	phase: "backward" | "forward";
	ptsUs: number;
	seedPtsUs: number;
	startPtsUs: number;
}): number {
	const phaseProgress =
		phase === "backward"
			? (seedPtsUs - ptsUs) / Math.max(seedPtsUs - startPtsUs, 1)
			: (ptsUs - seedPtsUs) / Math.max(endPtsUs - seedPtsUs, 1);
	const clamped = Math.min(1, Math.max(0, phaseProgress));
	if (direction !== "both") return 0.1 + clamped * 0.9;
	return phase === "backward" ? 0.1 + clamped * 0.45 : 0.55 + clamped * 0.45;
}

async function* trackedFrames({
	frames,
	tracker,
}: {
	frames: AsyncGenerator<PlanarAnalysisFrame>;
	tracker: PlanarTrackerProvider;
}): AsyncGenerator<PlanarTrackerStepResult> {
	for await (const frame of frames) {
		yield tracker.track({ frame });
	}
}

async function collectDirection({
	direction,
	endPtsUs,
	frames,
	onProgress,
	processedFrames,
	seedPtsUs,
	signal,
	startPtsUs,
	tracker,
}: {
	direction: PlanarTrackingDirection;
	endPtsUs: number;
	frames: AsyncGenerator<PlanarAnalysisFrame>;
	onProgress?: (progress: PlanarTrackingAnalysisProgress) => void;
	processedFrames: { value: number };
	seedPtsUs: number;
	signal?: AbortSignal;
	startPtsUs: number;
	tracker: PlanarTrackerProvider;
}): Promise<{ lost: boolean; samples: PlanarTrackingSample[] }> {
	const samples: PlanarTrackingSample[] = [];
	const phase = direction === "backward" ? "backward" : "forward";
	for await (const result of trackedFrames({ frames, tracker })) {
		signal?.throwIfAborted();
		processedFrames.value += 1;
		samples.push(result.sample);
		onProgress?.({
			phase,
			processedFrames: processedFrames.value,
			progress: directionProgress({
				direction,
				endPtsUs,
				phase,
				ptsUs: result.sample.ptsUs,
				seedPtsUs,
				startPtsUs,
			}),
			ptsUs: result.sample.ptsUs,
		});
		if (result.sample.status === "lost") {
			return { lost: true, samples };
		}
	}
	return { lost: false, samples };
}

function abortReason({ signal }: { signal?: AbortSignal }): unknown {
	return (
		signal?.reason ??
		new DOMException("Planar tracking was cancelled.", "AbortError")
	);
}

export async function analyzePlanarTracking({
	configuration = DEFAULT_PLANAR_TRACKER_CONFIGURATION,
	direction,
	file,
	frameSource = new MediabunnyPlanarFrameSource({ file }),
	onProgress,
	seedPtsUs,
	seedQuad,
	signal,
	sourceContentSha256,
	sourceMediaId,
	tracker = new OpenCvPlanarTrackerClient(),
}: AnalyzePlanarTrackingOptions): Promise<PlanarTrackingAnalysisResult> {
	const terminateOnAbort = (): void => tracker.terminate();
	signal?.addEventListener("abort", terminateOnAbort, { once: true });
	try {
		signal?.throwIfAborted();
		onProgress?.({ phase: "hashing", processedFrames: 0, progress: 0 });
		const contentSha256 = await sourceHash({
			file,
			onProgress: (progress) =>
				onProgress?.({
					phase: "hashing",
					processedFrames: 0,
					progress: progress * 0.05,
				}),
			signal,
			sourceContentSha256,
		});
		onProgress?.({ phase: "initializing", processedFrames: 0, progress: 0.05 });
		const [metadata, provider, seedFrame] = await Promise.all([
			frameSource.metadata(),
			tracker.initialize(),
			frameSource.frameAt({ ptsUs: seedPtsUs, signal }),
		]);
		signal?.throwIfAborted();
		const begin = await tracker.begin({
			configuration,
			frame: seedFrame,
			seedQuad,
		});
		const canonicalSeedPtsUs = begin.sample.ptsUs;
		const backwardSamples: PlanarTrackingSample[] = [];
		const forwardSamples: PlanarTrackingSample[] = [];
		const lostDirections: PlanarTrackingDirection[] = [];
		const processedFrames = { value: 0 };

		if (direction === "backward" || direction === "both") {
			const backward = await collectDirection({
				direction,
				endPtsUs: metadata.endPtsUs,
				frames: frameSource.backwardFrames({
					beforePtsUs: canonicalSeedPtsUs,
					signal,
					startPtsUs: metadata.firstPtsUs,
				}),
				onProgress,
				processedFrames,
				seedPtsUs: canonicalSeedPtsUs,
				signal,
				startPtsUs: metadata.firstPtsUs,
				tracker,
			});
			backwardSamples.push(...backward.samples.reverse());
			if (backward.lost) lostDirections.push("backward");
		}

		if (direction === "both") await tracker.reset();
		if (direction === "forward" || direction === "both") {
			const forward = await collectDirection({
				direction,
				endPtsUs: metadata.endPtsUs,
				frames: frameSource.forwardFrames({
					afterPtsUs: canonicalSeedPtsUs,
					endPtsUs: metadata.endPtsUs,
					signal,
				}),
				onProgress,
				processedFrames,
				seedPtsUs: canonicalSeedPtsUs,
				signal,
				startPtsUs: metadata.firstPtsUs,
				tracker,
			});
			forwardSamples.push(...forward.samples);
			if (forward.lost) lostDirections.push("forward");
		}

		const sidecar: PlanarTrackingSidecarV1 = {
			schemaVersion: 1,
			coordinateSpace: "source-display-normalized",
			timebase: "microseconds",
			source: {
				mediaId: sourceMediaId,
				contentSha256,
				displayWidth: metadata.sourceDisplayWidth,
				displayHeight: metadata.sourceDisplayHeight,
			},
			provider: {
				id: "opencv-wasm",
				version: provider.providerVersion,
				parametersHash: hashConfiguration({ configuration }),
			},
			seed: { ptsUs: canonicalSeedPtsUs, quad: seedQuad },
			direction,
			samples: [...backwardSamples, begin.sample, ...forwardSamples],
		};
		onProgress?.({
			phase: "complete",
			processedFrames: processedFrames.value,
			progress: 1,
		});
		return {
			lostDirections,
			providerVersion: provider.providerVersion,
			sidecar,
		};
	} catch (cause) {
		if (signal?.aborted) throw abortReason({ signal });
		throw cause;
	} finally {
		signal?.removeEventListener("abort", terminateOnAbort);
		await Promise.allSettled([tracker.dispose(), frameSource.dispose()]);
	}
}
