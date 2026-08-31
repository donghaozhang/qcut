import type { PlanarQuad } from "@qcut/editor-core";
import { describe, expect, it, vi } from "vitest";
import type {
	PlanarFrameSource,
	PlanarFrameSourceMetadata,
} from "../mediabunny-planar-frame-source";
import {
	analyzePlanarTracking,
	sha256Blob,
	type PlanarTrackerProvider,
} from "../planar-tracking-analyzer";
import type {
	PlanarAnalysisFrame,
	PlanarTrackerConfiguration,
} from "../planar-tracker-protocol";

const QUAD: PlanarQuad = {
	topLeft: { x: 0.2, y: 0.2 },
	topRight: { x: 0.8, y: 0.2 },
	bottomRight: { x: 0.8, y: 0.8 },
	bottomLeft: { x: 0.2, y: 0.8 },
};

function frame({ ptsUs }: { ptsUs: number }): PlanarAnalysisFrame {
	return { gray: new Uint8Array([ptsUs]), height: 1, ptsUs, width: 1 };
}

class FakeFrameSource implements PlanarFrameSource {
	readonly visited: number[] = [];
	readonly metadataValue: PlanarFrameSourceMetadata = {
		analysisHeight: 180,
		analysisWidth: 320,
		endPtsUs: 100,
		firstPtsUs: 0,
		sourceDisplayHeight: 1080,
		sourceDisplayWidth: 1920,
	};

	async *backwardFrames(): AsyncGenerator<PlanarAnalysisFrame> {
		for (const ptsUs of [40, 20, 0]) {
			this.visited.push(ptsUs);
			yield frame({ ptsUs });
		}
	}

	async dispose(): Promise<void> {}

	async *forwardFrames(): AsyncGenerator<PlanarAnalysisFrame> {
		for (const ptsUs of [60, 80, 100]) {
			this.visited.push(ptsUs);
			yield frame({ ptsUs });
		}
	}

	async frameAt(): Promise<PlanarAnalysisFrame> {
		return frame({ ptsUs: 50 });
	}

	async metadata(): Promise<PlanarFrameSourceMetadata> {
		return this.metadataValue;
	}
}

class FakeTracker implements PlanarTrackerProvider {
	resetCount = 0;
	terminated = false;
	trackStarted: Promise<void>;
	trackReject?: (reason: unknown) => void;
	private blockNextTrack = false;
	private readonly resolveTrackStarted: () => void;

	constructor() {
		let resolveTrackStarted = (): void => {};
		this.trackStarted = new Promise<void>((resolve) => {
			resolveTrackStarted = resolve;
		});
		this.resolveTrackStarted = resolveTrackStarted;
	}

	async begin({
		frame: seedFrame,
	}: {
		configuration?: PlanarTrackerConfiguration;
		frame: PlanarAnalysisFrame;
		seedQuad: PlanarQuad;
	}) {
		return {
			diagnostics: {
				coverage: 1,
				inlierRatio: 1,
				inliers: 20,
				medianSymmetricErrorPx: 0,
				trackedPoints: 20,
			},
			featureCount: 20,
			sample: {
				confidence: 1,
				ptsUs: seedFrame.ptsUs,
				quad: QUAD,
				status: "corrected" as const,
			},
		};
	}

	async dispose(): Promise<void> {}

	async initialize(): Promise<{ providerVersion: string }> {
		return { providerVersion: "test-provider" };
	}

	async reset(): Promise<void> {
		this.resetCount += 1;
	}

	terminate(): void {
		this.terminated = true;
		this.trackReject?.(new Error("terminated"));
	}

	async track({ frame: nextFrame }: { frame: PlanarAnalysisFrame }) {
		if (this.blockNextTrack) {
			this.resolveTrackStarted();
			return new Promise<never>((_resolve, reject) => {
				this.trackReject = reject;
			});
		}
		return {
			sample: {
				confidence: nextFrame.ptsUs === 80 ? 0 : 0.9,
				ptsUs: nextFrame.ptsUs,
				quad: QUAD,
				status:
					nextFrame.ptsUs === 80 ? ("lost" as const) : ("tracked" as const),
			},
		};
	}

	blockTracking(): void {
		this.blockNextTrack = true;
	}
}

describe("planar tracking analyzer", () => {
	it("hashes blobs incrementally", async () => {
		await expect(sha256Blob({ blob: new Blob(["abc"]) })).resolves.toBe(
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
		);
	});

	it("tracks both directions, stops at loss, and emits a valid ordered sidecar", async () => {
		const frameSource = new FakeFrameSource();
		const tracker = new FakeTracker();
		const onProgress = vi.fn();
		const result = await analyzePlanarTracking({
			direction: "both",
			file: new File(["source"], "source.mp4", { type: "video/mp4" }),
			frameSource,
			onProgress,
			seedPtsUs: 52,
			seedQuad: QUAD,
			sourceMediaId: "media-1",
			tracker,
		});

		expect(result.sidecar.samples.map((sample) => sample.ptsUs)).toEqual([
			0, 20, 40, 50, 60, 80,
		]);
		expect(result.sidecar.samples.at(-1)?.status).toBe("lost");
		expect(result.lostDirections).toEqual(["forward"]);
		expect(frameSource.visited).toEqual([40, 20, 0, 60, 80]);
		expect(tracker.resetCount).toBe(1);
		expect(result.sidecar.source).toMatchObject({
			displayHeight: 1080,
			displayWidth: 1920,
			mediaId: "media-1",
		});
		expect(result.sidecar.source.contentSha256).toHaveLength(64);
		expect(result.sidecar.provider.parametersHash).toHaveLength(64);
		expect(onProgress).toHaveBeenLastCalledWith({
			phase: "complete",
			processedFrames: 5,
			progress: 1,
		});
	});

	it("terminates an in-flight provider when cancelled", async () => {
		const controller = new AbortController();
		const tracker = new FakeTracker();
		tracker.blockTracking();
		const analysis = analyzePlanarTracking({
			direction: "forward",
			file: new File(["source"], "source.mp4"),
			frameSource: new FakeFrameSource(),
			seedPtsUs: 50,
			seedQuad: QUAD,
			signal: controller.signal,
			sourceMediaId: "media-1",
			tracker,
		});
		await tracker.trackStarted;
		controller.abort();

		await expect(analysis).rejects.toMatchObject({ name: "AbortError" });
		expect(tracker.terminated).toBe(true);
	});
});
