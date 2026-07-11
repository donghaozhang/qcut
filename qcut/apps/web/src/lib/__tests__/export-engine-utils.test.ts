// Location: apps/web/src/lib/__tests__/export-engine-utils.test.ts

import { describe, it, expect, vi } from "vitest";
import {
	calculateTotalFrames,
	getActiveElements,
	calculateElementBounds,
} from "../export/export-engine-utils";
import type {
	TimelineTrack,
	MediaElement,
	TextElement,
} from "@/types/timeline";

// Mock stores
vi.mock("@/stores/ai/effects-store", () => ({
	useEffectsStore: {
		getState: () => ({
			getElementEffects: () => [],
		}),
	},
}));

vi.mock("@/lib/debug/debug-config", () => ({
	debugLog: vi.fn(),
	debugWarn: vi.fn(),
}));

// Helper to create mock media elements
const createMediaElement = (
	id: string,
	mediaId: string,
	startTime: number,
	duration: number,
	options: { hidden?: boolean } = {}
): MediaElement => ({
	id,
	type: "media" as const,
	mediaId,
	name: `Element ${id}`,
	startTime,
	duration,
	trimStart: 0,
	trimEnd: 0,
	hidden: options.hidden || false,
});

const createTextElement = (
	id: string,
	startTime: number,
	duration: number,
	options: { x?: number; y?: number } = {}
): TextElement => ({
	id,
	type: "text" as const,
	name: `Text ${id}`,
	content: "Sample text",
	fontSize: 24,
	fontFamily: "Arial",
	color: "#ffffff",
	backgroundColor: "transparent",
	textAlign: "left" as const,
	fontWeight: "normal" as const,
	fontStyle: "normal" as const,
	textDecoration: "none" as const,
	startTime,
	duration,
	trimStart: 0,
	trimEnd: 0,
	x: options.x ?? 100,
	y: options.y ?? 100,
	rotation: 0,
	opacity: 1,
});

describe("Export Engine Utils", () => {
	describe("calculateTotalFrames", () => {
		it("returns correct count for 10s at 30fps", () => {
			expect(calculateTotalFrames(10, 30)).toBe(300);
		});

		it("returns correct count for 5s at 60fps", () => {
			expect(calculateTotalFrames(5, 60)).toBe(300);
		});

		it("rounds up for fractional frames", () => {
			expect(calculateTotalFrames(1.5, 30)).toBe(45);
			expect(calculateTotalFrames(1.1, 30)).toBe(33);
		});

		it("returns 0 for zero duration", () => {
			expect(calculateTotalFrames(0, 30)).toBe(0);
		});
	});

	describe("getActiveElements", () => {
		it("filters elements by time", () => {
			const element = createMediaElement("e1", "m1", 1, 3);
			const tracks: TimelineTrack[] = [
				{
					id: "t1",
					name: "Track 1",
					type: "media",
					elements: [element],
					muted: false,
				},
			];
			const mediaItems = [
				{
					id: "m1",
					type: "video" as const,
					url: "test.mp4",
					name: "Test",
					file: new File([], "test.mp4"),
				},
			];

			// At time 2s (within element's range 1-4)
			const active = getActiveElements(tracks, mediaItems, 2);
			expect(active).toHaveLength(1);
			expect(active[0].element.id).toBe("e1");
		});

		it("returns empty array when no elements are active", () => {
			const element = createMediaElement("e1", "m1", 5, 2);
			const tracks: TimelineTrack[] = [
				{
					id: "t1",
					name: "Track 1",
					type: "media",
					elements: [element],
					muted: false,
				},
			];

			// At time 0 (before element starts)
			const active = getActiveElements(tracks, [], 0);
			expect(active).toHaveLength(0);
		});

		it("excludes hidden elements", () => {
			const visible = createMediaElement("e1", "m1", 0, 5);
			const hidden = createMediaElement("e2", "m2", 0, 5, {
				hidden: true,
			});
			const tracks: TimelineTrack[] = [
				{
					id: "t1",
					name: "Track 1",
					type: "media",
					elements: [visible, hidden],
					muted: false,
				},
			];

			const active = getActiveElements(tracks, [], 1);
			expect(active).toHaveLength(1);
			expect(active[0].element.id).toBe("e1");
		});

		it("finds elements across multiple tracks", () => {
			const e1 = createMediaElement("e1", "m1", 0, 5);
			const e2 = createMediaElement("e2", "m2", 1, 3);
			const tracks: TimelineTrack[] = [
				{
					id: "t1",
					name: "Track 1",
					type: "media",
					elements: [e1],
					muted: false,
				},
				{
					id: "t2",
					name: "Track 2",
					type: "media",
					elements: [e2],
					muted: false,
				},
			];

			const active = getActiveElements(tracks, [], 2);
			expect(active).toHaveLength(2);
		});

		it("returns visual elements in bottom-to-top track order", () => {
			const topElement = createTextElement("top-element", 0, 5);
			const bottomElement = createMediaElement("bottom-element", "m1", 0, 5);
			const tracks: TimelineTrack[] = [
				{
					id: "top",
					name: "Top",
					type: "text",
					order: 0,
					elements: [topElement],
				},
				{
					id: "bottom",
					name: "Bottom",
					type: "media",
					order: 1,
					elements: [bottomElement],
				},
			];

			const active = getActiveElements(tracks, [], 1);

			expect(active.map(({ element }) => element.id)).toEqual([
				"bottom-element",
				"top-element",
			]);
		});

		it("excludes every element on a hidden track", () => {
			const tracks: TimelineTrack[] = [
				{
					id: "hidden-track",
					name: "Hidden",
					type: "text",
					order: 0,
					hidden: true,
					elements: [createTextElement("hidden-element", 0, 5)],
				},
			];

			expect(getActiveElements(tracks, [], 1)).toHaveLength(0);
		});
	});

	describe("calculateElementBounds", () => {
		it("scales down larger media to fit canvas", () => {
			const element = createMediaElement("e1", "m1", 0, 5);
			const bounds = calculateElementBounds(element, 3840, 2160, 1920, 1080);

			expect(bounds.width).toBe(1920);
			expect(bounds.height).toBe(1080);
			expect(bounds.x).toBe(0);
			expect(bounds.y).toBe(0);
		});

		it("keeps original size for smaller media", () => {
			const element = createMediaElement("e1", "m1", 0, 5);
			const bounds = calculateElementBounds(element, 640, 480, 1920, 1080);

			expect(bounds.width).toBe(640);
			expect(bounds.height).toBe(480);
			// Should be centered
			expect(bounds.x).toBe((1920 - 640) / 2);
			expect(bounds.y).toBe((1080 - 480) / 2);
		});

		it("maintains aspect ratio when scaling wider media", () => {
			const element = createMediaElement("e1", "m1", 0, 5);
			// Ultra-wide media: 2560x720 (aspect 3.55)
			const bounds = calculateElementBounds(element, 2560, 720, 1920, 1080);

			// Should fit to width
			expect(bounds.width).toBe(1920);
			// Height should maintain aspect ratio
			expect(bounds.height).toBeCloseTo(1920 / (2560 / 720), 0);
		});

		it("uses element position for text elements", () => {
			const element = createTextElement("t1", 0, 5, {
				x: 200,
				y: 300,
			});
			const bounds = calculateElementBounds(element, 100, 50, 1920, 1080);

			expect(bounds.x).toBe(200);
			expect(bounds.y).toBe(300);
		});
	});
});
