import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyElementChanges } from "../claude-timeline-bridge-elements";

const storeMocks = vi.hoisted(() => {
	const state = {
		tracks: [
			{
				id: "track",
				name: "Media",
				type: "media",
				elements: [
					{
						id: "clip",
						type: "media" as const,
						mediaId: "media",
						name: "Clip",
						startTime: 0,
						duration: 8,
						trimStart: 0,
						trimEnd: 0,
					},
				],
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

vi.mock("@/lib/debug/debug-config", () => ({
	debugLog: vi.fn(),
	debugWarn: vi.fn(),
	debugError: vi.fn(),
}));

describe("Claude portrait adjustment bridge", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("normalizes and applies global and per-face portrait adjustments", () => {
		const updated = applyElementChanges({
			elementId: "clip",
			changes: {
				portraitAdjustments: {
					enabled: true,
					values: {
						body_adjust_StretchLeg: 55,
						unknown_adjustment: 90,
					},
					faces: [
						{
							trackId: 3,
							values: { face_adjust_TotalFace: 90 },
							makeup: {
								lip: { cardId: "lip-soft-pink", intensity: 80 },
							},
						},
					],
					manualBody: {
						zoom: { intensity: 45, x: 0.6, y: 0.4, radius: 0.2 },
					},
				},
			},
			pushHistory: true,
		});

		expect(updated).toBe(true);
		expect(storeMocks.state.pushHistory).toHaveBeenCalledOnce();
		expect(storeMocks.state.updateMediaElement).toHaveBeenCalledWith(
			"track",
			"clip",
			{
				portraitAdjustments: {
					enabled: true,
					values: { body_adjust_StretchLeg: 55 },
					faces: [
						{
							trackId: 3,
							values: { face_adjust_TotalFace: 90 },
							makeup: {
								lip: { cardId: "lip-soft-pink", intensity: 80 },
							},
						},
					],
					manualBody: {
						zoom: { intensity: 45, x: 0.6, y: 0.4, radius: 0.2 },
					},
				},
			},
			false
		);
	});

	it("rejects a non-object portrait adjustment payload", () => {
		const updated = applyElementChanges({
			elementId: "clip",
			changes: { portraitAdjustments: "invalid" },
			pushHistory: false,
		});

		expect(updated).toBe(false);
		expect(storeMocks.state.updateMediaElement).not.toHaveBeenCalled();
	});
});
