import { describe, expect, it, vi } from "vitest";
import {
	detectPersonCutoutModelRoute,
	JIANYING_FACE_SAMPLE_RATIO_THRESHOLD,
	type PersonCutoutModelRouterDependencies,
	resolvePersonCutoutRoutingMode,
	selectPersonCutoutRoute,
} from "../jianying-person-cutout/model-router.js";

const WIDTH = 2;
const HEIGHT = 2;
const FRAME_BYTES = WIDTH * HEIGHT * 4;

function createRouterHarness({
	cleanupFails = false,
	detectionFailureIndexes = new Set<number>(),
	extractionFailureIndexes = new Set<number>(),
	faceResults = [false, false, false],
	shortSampleIndexes = new Set<number>(),
	warningFails = false,
}: {
	cleanupFails?: boolean;
	detectionFailureIndexes?: Set<number>;
	extractionFailureIndexes?: Set<number>;
	faceResults?: boolean[];
	shortSampleIndexes?: Set<number>;
	warningFails?: boolean;
} = {}) {
	let detectionIndex = 0;
	const clear = cleanupFails
		? vi.fn().mockRejectedValue(new Error("clear failed"))
		: vi.fn().mockResolvedValue(undefined);
	const detectFace = vi.fn(async () => {
		const currentIndex = detectionIndex;
		detectionIndex += 1;
		if (detectionFailureIndexes.has(currentIndex)) {
			throw new Error(`detection ${currentIndex} failed`);
		}
		return faceResults[currentIndex] ?? false;
	});
	const createFaceDetector = vi.fn(() => ({ clear, detectFace }));
	const createTemporaryDirectory = vi
		.fn()
		.mockResolvedValue("/tmp/router-test");
	const extractSample = vi.fn(
		async ({ sampleIndex }: { sampleIndex: number }) => {
			if (extractionFailureIndexes.has(sampleIndex)) {
				throw new Error(`extraction ${sampleIndex} failed`);
			}
		}
	);
	const readSample = vi.fn(async ({ filePath }: { filePath: string }) => {
		const match = /sample-(\d+)\.rgba$/.exec(filePath);
		const sampleIndex = Number(match?.[1] ?? -1);
		return new Uint8Array(
			shortSampleIndexes.has(sampleIndex) ? FRAME_BYTES - 1 : FRAME_BYTES
		);
	});
	const removeTemporaryDirectory = cleanupFails
		? vi.fn().mockRejectedValue(new Error("remove failed"))
		: vi.fn().mockResolvedValue(undefined);
	const warn = warningFails
		? vi.fn(() => {
				throw new Error("warning failed");
			})
		: vi.fn();
	const dependencies: PersonCutoutModelRouterDependencies = {
		createFaceDetector,
		createTemporaryDirectory,
		extractSample,
		readSample,
		removeTemporaryDirectory,
		warn,
	};
	return {
		clear,
		createFaceDetector,
		createTemporaryDirectory,
		dependencies,
		detectFace,
		extractSample,
		readSample,
		removeTemporaryDirectory,
		warn,
	};
}

function detectionRequest({
	dependencies,
	duration = 2,
	frameRate = 30,
	height = HEIGHT,
	signal,
	videoObjectCandidateAvailable = true,
	width = WIDTH,
}: {
	dependencies: PersonCutoutModelRouterDependencies;
	duration?: number;
	frameRate?: number;
	height?: number;
	signal?: AbortSignal;
	videoObjectCandidateAvailable?: boolean;
	width?: number;
}) {
	return detectPersonCutoutModelRoute({
		dependencies,
		duration,
		ffmpegPath: "/ffmpeg",
		frameRate,
		height,
		signal,
		sourcePath: "/source.mp4",
		videoObjectCandidateAvailable,
		width,
	});
}

describe("person cutout model routing", () => {
	it("keeps the user-facing person cutout on portrait GRU by default", () => {
		expect(
			resolvePersonCutoutRoutingMode({
				automaticRoutingEnabled: false,
			})
		).toBe("portrait-gru");
	});

	it("allows an explicit advanced model route", () => {
		expect(
			resolvePersonCutoutRoutingMode({
				automaticRoutingEnabled: false,
				requestedRoute: "video-object",
			})
		).toBe("video-object");
	});

	it("uses face-based routing only when the experiment is enabled", () => {
		expect(
			resolvePersonCutoutRoutingMode({
				automaticRoutingEnabled: true,
			})
		).toBe("auto");
		expect(
			resolvePersonCutoutRoutingMode({
				automaticRoutingEnabled: true,
				requestedRoute: "portrait-gru",
			})
		).toBe("portrait-gru");
	});

	it("matches Jianying's confirmed 0.5 face-frame ratio boundary", () => {
		expect(JIANYING_FACE_SAMPLE_RATIO_THRESHOLD).toBe(0.5);
		expect(
			selectPersonCutoutRoute({
				expectedSampleCount: 2,
				facePositiveSampleCount: 0,
				validSampleCount: 2,
				videoObjectCandidateAvailable: true,
			})
		).toMatchObject({
			confidence: "sampled-face-ratio",
			faceSampleRatio: 0,
			reason: "face-ratio-below-threshold",
			route: "video-object",
		});
		expect(
			selectPersonCutoutRoute({
				expectedSampleCount: 2,
				facePositiveSampleCount: 1,
				validSampleCount: 2,
				videoObjectCandidateAvailable: true,
			})
		).toMatchObject({
			confidence: "sampled-face-ratio",
			faceSampleRatio: 0.5,
			reason: "face-ratio-at-or-above-threshold",
			route: "portrait-gru",
		});
	});

	it("uses the complete sample ratio rather than exiting after the first face", async () => {
		const harness = createRouterHarness({
			faceResults: [true, false, false],
		});

		await expect(
			detectionRequest({ dependencies: harness.dependencies })
		).resolves.toMatchObject({
			confidence: "sampled-face-ratio",
			expectedSampleCount: 3,
			facePositiveSampleCount: 1,
			faceSampleRatio: 1 / 3,
			reason: "face-ratio-below-threshold",
			route: "video-object",
			validSampleCount: 3,
		});
		expect(harness.detectFace).toHaveBeenCalledTimes(3);
		expect(harness.clear).toHaveBeenCalledOnce();
		expect(harness.removeTemporaryDirectory).toHaveBeenCalledOnce();
	});

	it("fails closed when any extracted or detected sample is invalid", async () => {
		for (const harness of [
			createRouterHarness({ extractionFailureIndexes: new Set([1]) }),
			createRouterHarness({ shortSampleIndexes: new Set([1]) }),
			createRouterHarness({ detectionFailureIndexes: new Set([1]) }),
		]) {
			await expect(
				detectionRequest({ dependencies: harness.dependencies })
			).resolves.toMatchObject({
				confidence: "fail-closed",
				faceSampleRatio: null,
				reason: "incomplete-face-samples",
				route: "portrait-gru",
				validSampleCount: 2,
			});
		}
	});

	it("fails closed for zero, partial, and impossible sample counts", () => {
		for (const counts of [
			{
				expectedSampleCount: 0,
				facePositiveSampleCount: 0,
				validSampleCount: 0,
			},
			{
				expectedSampleCount: 3,
				facePositiveSampleCount: 0,
				validSampleCount: 2,
			},
			{
				expectedSampleCount: 3,
				facePositiveSampleCount: 3,
				validSampleCount: 2,
			},
			{
				expectedSampleCount: 3,
				facePositiveSampleCount: -1,
				validSampleCount: 3,
			},
		]) {
			const decision = selectPersonCutoutRoute({
				...counts,
				videoObjectCandidateAvailable: true,
			});
			expect(decision.route).toBe("portrait-gru");
			expect(decision.confidence).toBe("fail-closed");
			expect(decision.faceSampleRatio).toBeNull();
		}
	});

	it("skips sampling when video-object is unavailable", async () => {
		const harness = createRouterHarness();

		await expect(
			detectionRequest({
				dependencies: harness.dependencies,
				videoObjectCandidateAvailable: false,
			})
		).resolves.toMatchObject({
			confidence: "fail-closed",
			reason: "video-object-unavailable",
			route: "portrait-gru",
		});
		expect(harness.createTemporaryDirectory).not.toHaveBeenCalled();
		expect(harness.createFaceDetector).not.toHaveBeenCalled();
	});

	it("fails closed before sampling invalid video metadata", async () => {
		const harness = createRouterHarness();

		await expect(
			detectionRequest({
				dependencies: harness.dependencies,
				duration: 0,
			})
		).resolves.toMatchObject({
			confidence: "fail-closed",
			reason: "invalid-video-metadata",
			route: "portrait-gru",
		});
		expect(harness.createTemporaryDirectory).not.toHaveBeenCalled();
	});

	it("cancels before creating routing resources", async () => {
		const harness = createRouterHarness();
		const controller = new AbortController();
		controller.abort();

		await expect(
			detectionRequest({
				dependencies: harness.dependencies,
				signal: controller.signal,
			})
		).rejects.toMatchObject({ name: "AbortError" });
		expect(harness.createTemporaryDirectory).not.toHaveBeenCalled();
		expect(harness.createFaceDetector).not.toHaveBeenCalled();
	});

	it("stops before the next face sample after cancellation", async () => {
		const harness = createRouterHarness();
		const controller = new AbortController();
		harness.detectFace.mockImplementationOnce(async () => {
			controller.abort();
			return false;
		});

		await expect(
			detectionRequest({
				dependencies: harness.dependencies,
				signal: controller.signal,
			})
		).rejects.toMatchObject({ name: "AbortError" });
		expect(harness.detectFace).toHaveBeenCalledOnce();
		expect(harness.clear).toHaveBeenCalledOnce();
		expect(harness.removeTemporaryDirectory).toHaveBeenCalledOnce();
	});

	it("passes cancellation to every FFmpeg extraction", async () => {
		const harness = createRouterHarness();
		const controller = new AbortController();
		harness.extractSample.mockImplementation(
			async ({ sampleIndex }: { sampleIndex: number }) => {
				if (sampleIndex !== 0) return;
				controller.abort();
				throw new Error("extraction aborted");
			}
		);

		await expect(
			detectionRequest({
				dependencies: harness.dependencies,
				signal: controller.signal,
			})
		).rejects.toMatchObject({ name: "AbortError" });
		for (const call of harness.extractSample.mock.calls) {
			expect(call[0].signal).toBe(controller.signal);
		}
		expect(harness.detectFace).not.toHaveBeenCalled();
		expect(harness.clear).toHaveBeenCalledOnce();
		expect(harness.removeTemporaryDirectory).toHaveBeenCalledOnce();
	});

	it("does not let cleanup or diagnostic failures override fallback", async () => {
		const harness = createRouterHarness({
			cleanupFails: true,
			extractionFailureIndexes: new Set([1]),
			warningFails: true,
		});

		await expect(
			detectionRequest({ dependencies: harness.dependencies })
		).resolves.toMatchObject({
			confidence: "fail-closed",
			reason: "incomplete-face-samples",
			route: "portrait-gru",
		});
		expect(harness.clear).toHaveBeenCalledOnce();
		expect(harness.removeTemporaryDirectory).toHaveBeenCalledOnce();
		expect(harness.warn).toHaveBeenCalledTimes(2);
	});
});
