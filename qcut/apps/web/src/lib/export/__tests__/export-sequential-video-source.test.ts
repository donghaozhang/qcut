import { beforeEach, describe, expect, it, vi } from "vitest";

const mediabunnyMocks = vi.hoisted(() => ({
	openCalls: 0,
	iteratorStarts: [] as number[],
	nextCalls: 0,
	disposed: 0,
	canDecode: true,
	frameDuration: 1 / 30,
	totalFrames: 90,
}));

vi.mock("mediabunny", () => {
	class BlobSource {
		constructor(public blob: Blob) {}
	}
	class Input {
		constructor(_options: unknown) {
			mediabunnyMocks.openCalls += 1;
		}
		async getPrimaryVideoTrack() {
			return {
				canDecode: async () => mediabunnyMocks.canDecode,
			};
		}
		dispose() {
			mediabunnyMocks.disposed += 1;
		}
	}
	class CanvasSink {
		canvases(startTimestamp = 0) {
			mediabunnyMocks.iteratorStarts.push(startTimestamp);
			const d = mediabunnyMocks.frameDuration;
			let frame = Math.max(0, Math.floor(startTimestamp / d + 1e-6));
			return {
				async next() {
					mediabunnyMocks.nextCalls += 1;
					if (frame >= mediabunnyMocks.totalFrames) {
						return { done: true, value: undefined };
					}
					const timestamp = frame * d;
					frame += 1;
					const canvas = { width: 320, height: 180, __frame: frame - 1 };
					return { done: false, value: { canvas, timestamp, duration: d } };
				},
				async return() {
					return { done: true, value: undefined };
				},
			};
		}
	}
	return { ALL_FORMATS: [], BlobSource, CanvasSink, Input };
});

vi.mock("@/lib/debug/debug-config", () => ({
	debugWarn: vi.fn(),
}));

// Static import pre-registers the mock so the module under test's dynamic
// `import("mediabunny")` calls resolve the mock even when issued concurrently.
import "mediabunny";
import {
	SequentialVideoFrameSource,
	SequentialVideoRegistry,
	setSequentialDecodeDisabled,
} from "../export-sequential-video-source";

function frameIndex(frame: { canvas: unknown } | null): number | null {
	return frame ? (frame.canvas as { __frame: number }).__frame : null;
}

describe("SequentialVideoFrameSource", () => {
	beforeEach(() => {
		mediabunnyMocks.openCalls = 0;
		mediabunnyMocks.iteratorStarts = [];
		mediabunnyMocks.nextCalls = 0;
		mediabunnyMocks.disposed = 0;
		mediabunnyMocks.canDecode = true;
		setSequentialDecodeDisabled(false);
	});

	it("advances monotonically with exactly one decode per frame", async () => {
		const source = await SequentialVideoFrameSource.open({
			blob: new Blob(["x"]),
		});
		expect(source).not.toBeNull();
		const d = 1 / 30;
		for (let i = 0; i < 30; i++) {
			const frame = await source!.frameAt(i * d + d / 2);
			expect(frameIndex(frame)).toBe(i);
		}
		// One iterator, started once at ~0 — no per-frame restarts.
		expect(mediabunnyMocks.iteratorStarts).toHaveLength(1);
		// next() pulls: first frame + one lookahead per advance ≈ frames + 1.
		expect(mediabunnyMocks.nextCalls).toBeLessThanOrEqual(31);
	});

	it("restarts on a backwards jump and a large forward gap", async () => {
		const source = await SequentialVideoFrameSource.open({
			blob: new Blob(["x"]),
		});
		const d = 1 / 30;
		await source!.frameAt(1.0);
		expect(mediabunnyMocks.iteratorStarts).toHaveLength(1);

		// Backwards: must reposition, not scan from the current point.
		const back = await source!.frameAt(0.2 + d / 2);
		expect(mediabunnyMocks.iteratorStarts).toHaveLength(2);
		expect(frameIndex(back)).toBe(Math.floor(0.2 / d + 0.5));

		// A forward jump beyond the restart gap seeks instead of decoding through.
		await source!.frameAt(2.5);
		expect(mediabunnyMocks.iteratorStarts).toHaveLength(3);
	});

	it("resolves an exact frame boundary to the frame that starts there", async () => {
		// A 2x clip with a frame-aligned trim samples exactly on source frame
		// boundaries every frame. An HTMLVideoElement seek displays the frame
		// whose [pts, pts+duration) interval contains the time — the newer
		// frame — so the sequential source must not hold the previous one.
		const source = await SequentialVideoFrameSource.open({
			blob: new Blob(["x"]),
		});
		const d = 1 / 30;
		for (let k = 0; k < 10; k++) {
			const boundary = (2 * k + 1) * d;
			const frame = await source!.frameAt(boundary);
			expect(frameIndex(frame), `boundary ${2 * k + 1}`).toBe(2 * k + 1);
		}
		// Still sequential: one iterator, no restarts.
		expect(mediabunnyMocks.iteratorStarts).toHaveLength(1);
	});

	it("prefers the newer frame within epsilon below a boundary", async () => {
		const source = await SequentialVideoFrameSource.open({
			blob: new Blob(["x"]),
		});
		const d = 1 / 30;
		// 0.5ms below frame 6's start — inside the epsilon window where float
		// noise around an intended boundary landing must resolve stably.
		const frame = await source!.frameAt(6 * d - 0.0005);
		expect(frameIndex(frame)).toBe(6);
		// Mid-frame requests are untouched by the boundary bias.
		const mid = await source!.frameAt(6 * d + d / 2);
		expect(frameIndex(mid)).toBe(6);
	});

	it("holds the final frame past the end of the stream", async () => {
		const source = await SequentialVideoFrameSource.open({
			blob: new Blob(["x"]),
		});
		const d = 1 / 30;
		const lastTimestamp = (mediabunnyMocks.totalFrames - 1) * d;
		const last = await source!.frameAt(lastTimestamp + d / 2);
		expect(frameIndex(last)).toBe(mediabunnyMocks.totalFrames - 1);
		const beyond = await source!.frameAt(lastTimestamp + 0.5);
		expect(frameIndex(beyond)).toBe(mediabunnyMocks.totalFrames - 1);
	});

	it("reports null for undecodable sources", async () => {
		mediabunnyMocks.canDecode = false;
		const source = await SequentialVideoFrameSource.open({
			blob: new Blob(["x"]),
		});
		expect(source).toBeNull();
	});

	it("disposes the underlying input", async () => {
		const source = await SequentialVideoFrameSource.open({
			blob: new Blob(["x"]),
		});
		await source!.frameAt(0.1);
		await source!.dispose();
		expect(mediabunnyMocks.disposed).toBe(1);
	});
});

describe("SequentialVideoRegistry", () => {
	beforeEach(() => {
		mediabunnyMocks.openCalls = 0;
		mediabunnyMocks.canDecode = true;
		setSequentialDecodeDisabled(false);
	});

	function mediaItem(id: string) {
		return { id, file: new Blob(["media"]) } as never;
	}

	it("opens one source per media item and caches it", async () => {
		const registry = new SequentialVideoRegistry();
		// Sequential awaits: vitest's dynamic-import mock resolution races when
		// two first-time `import("mediabunny")` calls overlap in one tick.
		const a = await registry.getOrOpen(mediaItem("m1"));
		const b = await registry.getOrOpen(mediaItem("m2"));
		const again = await registry.getOrOpen(mediaItem("m1"));
		expect(a).not.toBeNull();
		expect(b).not.toBeNull();
		expect(again).toBe(a);
		expect(mediabunnyMocks.openCalls).toBe(2);
		const disposedBefore = mediabunnyMocks.disposed;
		await registry.disposeAll();
		expect(mediabunnyMocks.disposed).toBe(disposedBefore + 2);
	});

	it("keeps one decoder per lane so overlapping clips never share", async () => {
		// Two elements cut from the same file read far-apart source times in
		// the same exported frame; separate lanes keep both monotonic instead
		// of restarting a shared decoder every alternating read.
		const registry = new SequentialVideoRegistry();
		const item = mediaItem("m1");
		const laneA = await registry.getOrOpen(item, "element-a");
		const laneB = await registry.getOrOpen(item, "element-b");
		expect(laneA).not.toBeNull();
		expect(laneB).not.toBeNull();
		expect(laneB).not.toBe(laneA);
		expect(await registry.getOrOpen(item, "element-a")).toBe(laneA);
		expect(mediabunnyMocks.openCalls).toBe(2);
		await registry.disposeAll();
	});

	it("evicts the least recently used lane beyond the open-decoder cap", async () => {
		mediabunnyMocks.disposed = 0;
		const registry = new SequentialVideoRegistry();
		const opened: unknown[] = [];
		for (let index = 0; index < 8; index++) {
			opened.push(await registry.getOrOpen(mediaItem(`m${index}`), "e"));
		}
		expect(mediabunnyMocks.disposed).toBe(0);
		// Touch lane 0 so lane 1 becomes the least recently used.
		await registry.getOrOpen(mediaItem("m0"), "e");
		await registry.getOrOpen(mediaItem("m8"), "e");
		await vi.waitFor(() => expect(mediabunnyMocks.disposed).toBe(1));
		// The touched lane survived; the evicted one reopens as a new source.
		expect(await registry.getOrOpen(mediaItem("m0"), "e")).toBe(opened[0]);
		const reopened = await registry.getOrOpen(mediaItem("m1"), "e");
		expect(reopened).not.toBe(opened[1]);
		await registry.disposeAll();
	});

	it("returns null for every item while the debug disable flag is set", async () => {
		setSequentialDecodeDisabled(true);
		const registry = new SequentialVideoRegistry();
		expect(await registry.getOrOpen(mediaItem("m1"))).toBeNull();
		expect(mediabunnyMocks.openCalls).toBe(0);
		setSequentialDecodeDisabled(false);
		expect(await registry.getOrOpen(mediaItem("m1"))).not.toBeNull();
	});
});
