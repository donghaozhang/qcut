/**
 * Tests for video chunker (timestamp math).
 *
 * Only tests calculateChunkBoundaries — no FFmpeg needed.
 */

import { describe, it, expect } from "vitest";
import { calculateChunkBoundaries } from "../video-search/video-chunker";

describe("calculateChunkBoundaries", () => {
	it("15s video → 3 chunks with correct boundaries", () => {
		const chunks = calculateChunkBoundaries(15, 5);
		expect(chunks).toEqual([
			{ index: 0, startTime: 0, endTime: 5, duration: 5 },
			{ index: 1, startTime: 5, endTime: 10, duration: 5 },
			{ index: 2, startTime: 10, endTime: 15, duration: 5 },
		]);
	});

	it("7s video → 2 chunks, last one shorter", () => {
		const chunks = calculateChunkBoundaries(7, 5);
		expect(chunks).toEqual([
			{ index: 0, startTime: 0, endTime: 5, duration: 5 },
			{ index: 1, startTime: 5, endTime: 7, duration: 2 },
		]);
	});

	it("3s video → 1 chunk", () => {
		const chunks = calculateChunkBoundaries(3, 5);
		expect(chunks).toHaveLength(1);
		expect(chunks[0]).toEqual({
			index: 0,
			startTime: 0,
			endTime: 3,
			duration: 3,
		});
	});

	it("exactly 5s video → 1 chunk", () => {
		const chunks = calculateChunkBoundaries(5, 5);
		expect(chunks).toHaveLength(1);
		expect(chunks[0].duration).toBe(5);
	});

	it("10s chunk duration", () => {
		const chunks = calculateChunkBoundaries(25, 10);
		expect(chunks).toHaveLength(3);
		expect(chunks[2].duration).toBe(5);
	});

	it("0s video → empty array", () => {
		const chunks = calculateChunkBoundaries(0, 5);
		expect(chunks).toEqual([]);
	});

	it("chunk indices are sequential", () => {
		const chunks = calculateChunkBoundaries(30, 5);
		for (let i = 0; i < chunks.length; i++) {
			expect(chunks[i].index).toBe(i);
		}
	});

	it("no gaps between chunks", () => {
		const chunks = calculateChunkBoundaries(23, 5);
		for (let i = 1; i < chunks.length; i++) {
			expect(chunks[i].startTime).toBe(chunks[i - 1].endTime);
		}
	});
});
