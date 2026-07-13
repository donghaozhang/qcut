import { afterEach, describe, expect, it } from "vitest";
import {
	clearSharedFrameCaches,
	getSharedFrameCache,
	SharedFrameCache,
} from "../shared-frame-cache";

function imageData({ bytes }: { bytes: number }): ImageData {
	return {
		data: new Uint8ClampedArray(bytes),
		width: bytes / 4,
		height: 1,
		colorSpace: "srgb",
	} as ImageData;
}

function createCache({
	namespace = "test",
	maxBytes = 32,
	maxEntries = 4,
	ttlMs = 1_000,
}: {
	namespace?: string;
	maxBytes?: number;
	maxEntries?: number;
	ttlMs?: number;
} = {}): SharedFrameCache {
	return new SharedFrameCache({ namespace, maxBytes, maxEntries, ttlMs });
}

afterEach(() => clearSharedFrameCaches());

describe("SharedFrameCache", () => {
	it("shares one store between consumers in the same project namespace", () => {
		const first = getSharedFrameCache({
			namespace: "project-a",
			maxBytes: 32,
			maxEntries: 4,
			ttlMs: 1_000,
		});
		const second = getSharedFrameCache({
			namespace: "project-a",
			maxBytes: 32,
			maxEntries: 4,
			ttlMs: 1_000,
		});
		first.write({
			key: 1,
			imageData: imageData({ bytes: 8 }),
			timelineHash: "frame-a",
			currentTime: 1,
			now: 100,
		});

		expect(second).toBe(first);
		expect(second.has({ key: 1, timelineHash: "frame-a", now: 101 })).toBe(
			true
		);
	});

	it("isolates entries belonging to different projects", () => {
		const first = getSharedFrameCache({
			namespace: "project-a",
			maxBytes: 32,
			maxEntries: 4,
			ttlMs: 1_000,
		});
		const second = getSharedFrameCache({
			namespace: "project-b",
			maxBytes: 32,
			maxEntries: 4,
			ttlMs: 1_000,
		});
		first.write({
			key: 1,
			imageData: imageData({ bytes: 8 }),
			timelineHash: "frame-a",
			currentTime: 1,
			now: 100,
		});

		expect(second.has({ key: 1, timelineHash: "frame-a", now: 101 })).toBe(
			false
		);
	});

	it("evicts distant frames until the byte budget is satisfied", () => {
		const cache = createCache({ maxBytes: 12 });
		cache.write({
			key: 0,
			imageData: imageData({ bytes: 8 }),
			timelineHash: "zero",
			currentTime: 0,
			now: 100,
		});
		cache.write({
			key: 10,
			imageData: imageData({ bytes: 8 }),
			timelineHash: "ten",
			currentTime: 10,
			now: 101,
		});

		expect(cache.has({ key: 0, timelineHash: "zero", now: 102 })).toBe(false);
		expect(cache.has({ key: 10, timelineHash: "ten", now: 102 })).toBe(true);
		expect(cache.metrics).toMatchObject({
			bytes: 8,
			entries: 1,
			evictions: 1,
			peakBytes: 16,
		});
	});

	it("rejects a frame that cannot fit in the configured memory budget", () => {
		const cache = createCache({ maxBytes: 4 });

		expect(
			cache.write({
				key: 0,
				imageData: imageData({ bytes: 8 }),
				timelineHash: "oversized",
				currentTime: 0,
				now: 100,
			})
		).toBe(false);
		expect(cache.metrics).toMatchObject({
			bytes: 0,
			entries: 0,
			rejectedFrames: 1,
		});
	});

	it("invalidates stale timeline hashes and expired frames", () => {
		const cache = createCache({ ttlMs: 10 });
		cache.write({
			key: 0,
			imageData: imageData({ bytes: 8 }),
			timelineHash: "old-visual",
			currentTime: 0,
			now: 100,
		});

		expect(
			cache.read({ key: 0, timelineHash: "new-visual", now: 101 })
		).toBeNull();
		cache.write({
			key: 1,
			imageData: imageData({ bytes: 8 }),
			timelineHash: "current",
			currentTime: 1,
			now: 100,
		});
		expect(cache.read({ key: 1, timelineHash: "current", now: 111 })).toBeNull();
	});
});
