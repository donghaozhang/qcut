import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyElementChanges } from "../claude-timeline-bridge-elements";
import { getClaudeMediaTimingProperties } from "../claude-timeline-bridge-helpers";

const storeMocks = vi.hoisted(() => {
	const mediaElement = {
		id: "clip",
		type: "media" as const,
		mediaId: "media",
		name: "Clip",
		startTime: 0,
		duration: 8,
		trimStart: 0,
		trimEnd: 0,
	};
	const state = {
		tracks: [
			{
				id: "track",
				name: "Media",
				type: "media",
				elements: [mediaElement],
			},
		],
		pushHistory: vi.fn(),
		updateElementStartTime: vi.fn(),
		updateElementTrim: vi.fn(),
		updateElementDuration: vi.fn(),
		updateMarkdownElement: vi.fn(),
		updateTextElement: vi.fn(),
		updateMediaElement: vi.fn(),
		updateMediaTiming: vi.fn(),
	};
	return { state };
});

vi.mock("@/stores/timeline/timeline-store", () => ({
	useTimelineStore: {
		getState: vi.fn(() => storeMocks.state),
	},
}));

vi.mock("@/stores/project-store", () => ({
	useProjectStore: {
		getState: vi.fn(() => ({ activeProject: null })),
	},
}));

vi.mock("@/lib/debug/debug-config", () => ({
	debugLog: vi.fn(),
	debugWarn: vi.fn(),
	debugError: vi.fn(),
}));

describe("Claude media timing bridge", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("normalizes external speed timing and clamps rates", () => {
		expect(
			getClaudeMediaTimingProperties({
				element: {
					playbackRate: 12,
					reverse: true,
					freezeFrameTime: 2,
					freezeFrameDuration: 1.5,
					speedKeyframes: [
						{
							id: "slow",
							frame: 0,
							value: 0.01,
							easing: "linear",
						},
						{
							id: "fast",
							frame: 120,
							value: 20,
							easing: "easeOut",
						},
					],
				},
			})
		).toEqual({
			playbackRate: 8,
			reverse: true,
			freezeFrameTime: 2,
			freezeFrameDuration: 1.5,
			speedKeyframes: [
				{ id: "slow", frame: 0, value: 0.1, easing: "linear" },
				{ id: "fast", frame: 120, value: 8, easing: "easeOut" },
			],
		});
	});

	it("drops an invalid speed curve as one atomic value", () => {
		expect(
			getClaudeMediaTimingProperties({
				element: {
					speedKeyframes: [
						{
							id: "invalid",
							frame: -1,
							value: 2,
							easing: "linear",
						},
					],
				},
			})
		).toEqual({});
	});

	it("routes media timing updates through the ripple-aware store action", () => {
		const updated = applyElementChanges({
			elementId: "clip",
			changes: {
				playbackRate: 2,
				reverse: true,
				freezeFrameTime: 1,
				freezeFrameDuration: 0.5,
			},
			pushHistory: true,
		});

		expect(updated).toBe(true);
		expect(storeMocks.state.pushHistory).toHaveBeenCalledOnce();
		expect(storeMocks.state.updateMediaTiming).toHaveBeenCalledWith(
			"track",
			"clip",
			{
				playbackRate: 2,
				reverse: true,
				freezeFrameTime: 1,
				freezeFrameDuration: 0.5,
			},
			false
		);
	});
});
