import { describe, it, expect } from "vitest";
import { checkElementOverlaps, resolveElementOverlaps } from "@/lib/timeline";
import { TimelineElement } from "@/types/timeline";

describe("Timeline Calculations", () => {
	describe("checkElementOverlaps", () => {
		it("detects no overlaps when elements are sequential", () => {
			const elements: TimelineElement[] = [
				{
					id: "1",
					type: "media" as const,
					mediaId: "media-001",
					name: "Video",
					startTime: 0,
					duration: 5,
					trimStart: 0,
					trimEnd: 0,
				},
				{
					id: "2",
					type: "media" as const,
					mediaId: "media-001",
					name: "Video",
					startTime: 5,
					duration: 5,
					trimStart: 0,
					trimEnd: 0,
				},
			];

			expect(checkElementOverlaps(elements)).toBe(false);
		});

		it("detects overlaps when elements overlap", () => {
			const elements: TimelineElement[] = [
				{
					id: "1",
					type: "media" as const,
					mediaId: "media-001",
					name: "Video",
					startTime: 0,
					duration: 5,
					trimStart: 0,
					trimEnd: 0,
				},
				{
					id: "2",
					type: "media" as const,
					mediaId: "media-001",
					name: "Video",
					startTime: 3,
					duration: 5,
					trimStart: 0,
					trimEnd: 0,
				},
			];

			expect(checkElementOverlaps(elements)).toBe(true);
		});

		it("accounts for trim when checking overlaps", () => {
			const elements: TimelineElement[] = [
				{
					id: "1",
					type: "media" as const,
					mediaId: "media-001",
					name: "Video",
					startTime: 0,
					duration: 10,
					trimStart: 0,
					trimEnd: 5, // Trimmed 5 seconds from end
				},
				{
					id: "2",
					type: "media" as const,
					mediaId: "media-001",
					name: "Video",
					startTime: 5,
					duration: 5,
					trimStart: 0,
					trimEnd: 0,
				},
			];

			expect(checkElementOverlaps(elements)).toBe(false);
		});

		it("uses playback-adjusted duration when checking overlaps", () => {
			const elements: TimelineElement[] = [
				{
					id: "fast",
					type: "media",
					mediaId: "media-001",
					name: "Fast video",
					startTime: 0,
					duration: 10,
					trimStart: 0,
					trimEnd: 0,
					playbackRate: 2,
				},
				{
					id: "next",
					type: "media",
					mediaId: "media-002",
					name: "Next video",
					startTime: 5,
					duration: 5,
					trimStart: 0,
					trimEnd: 0,
				},
			];

			expect(checkElementOverlaps(elements)).toBe(false);
		});
	});

	describe("resolveElementOverlaps", () => {
		it("adjusts overlapping elements to be sequential", () => {
			const elements: TimelineElement[] = [
				{
					id: "1",
					type: "media" as const,
					mediaId: "media-001",
					name: "Video",
					startTime: 0,
					duration: 5,
					trimStart: 0,
					trimEnd: 0,
				},
				{
					id: "2",
					type: "media" as const,
					mediaId: "media-001",
					name: "Video",
					startTime: 3, // Overlaps with first element
					duration: 5,
					trimStart: 0,
					trimEnd: 0,
				},
			];

			const resolved = resolveElementOverlaps(elements);
			expect(resolved[1].startTime).toBe(5); // Pushed to after first element
			expect(checkElementOverlaps(resolved)).toBe(false);
		});

		it("handles multiple overlapping elements", () => {
			const elements: TimelineElement[] = [
				{
					id: "1",
					type: "media" as const,
					mediaId: "media-001",
					name: "Video",
					startTime: 5,
					duration: 10,
					trimStart: 0,
					trimEnd: 0,
				},
				{
					id: "2",
					type: "media" as const,
					mediaId: "media-001",
					name: "Video",
					startTime: 0,
					duration: 10,
					trimStart: 0,
					trimEnd: 0,
				},
				{
					id: "3",
					type: "media" as const,
					mediaId: "media-001",
					name: "Video",
					startTime: 2,
					duration: 5,
					trimStart: 0,
					trimEnd: 0,
				},
			];

			const resolved = resolveElementOverlaps(elements);

			// Should be sorted and adjusted: [2, 3, 1]
			expect(resolved[0].id).toBe("2");
			expect(resolved[0].startTime).toBe(0);
			expect(resolved[1].id).toBe("3");
			expect(resolved[1].startTime).toBe(10); // After element 2
			expect(resolved[2].id).toBe("1");
			expect(resolved[2].startTime).toBe(15); // After element 3

			expect(checkElementOverlaps(resolved)).toBe(false);
		});
	});
});
