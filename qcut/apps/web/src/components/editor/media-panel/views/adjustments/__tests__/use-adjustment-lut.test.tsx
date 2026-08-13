import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { TimelineStore } from "@/stores/timeline/types";
import type { ColorCubeLut, TimelineTrack } from "@/types/timeline";
import { useAdjustmentLut } from "../use-adjustment-lut";

vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn() },
}));

function cube({ value }: { value: number }): ColorCubeLut {
	return {
		size: 2,
		domainMin: [0, 0, 0],
		domainMax: [1, 1, 1],
		values: new Array(24).fill(value),
	};
}

describe("useAdjustmentLut", () => {
	const updateAdjustmentElement = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		const tracks: TimelineTrack[] = [
			{
				id: "adjustments",
				name: "Adjustments",
				type: "adjustment",
				elements: [
					{
						id: "adjustment-1",
						type: "adjustment",
						name: "Grade",
						startTime: 0,
						duration: 3,
						trimStart: 0,
						trimEnd: 0,
						opacity: 1,
					},
				],
			},
		];
		useTimelineStore.setState({
			_tracks: tracks,
			tracks,
			selectedElements: [{ trackId: "adjustments", elementId: "adjustment-1" }],
			updateAdjustmentElement:
				updateAdjustmentElement as unknown as TimelineStore["updateAdjustmentElement"],
		});
	});

	it("stores both LUT branches and clears the skin branch for a later single LUT", () => {
		const background = cube({ value: 0.2 });
		const skin = cube({ value: 0.8 });
		const { result } = renderHook(() => useAdjustmentLut());

		act(() => {
			result.current.applyLut({
				name: "Portrait dual",
				cube: background,
				skinCube: skin,
			});
		});
		expect(updateAdjustmentElement).toHaveBeenLastCalledWith(
			"adjustments",
			"adjustment-1",
			expect.objectContaining({
				color: expect.objectContaining({
					lut: expect.objectContaining({
						cube: background,
						dual: { skinCube: skin, maskKind: "skin-tone-v1" },
					}),
				}),
			}),
			true
		);

		act(() => {
			result.current.applyLut({ name: "Single", cube: background });
		});
		const latest = updateAdjustmentElement.mock.calls.at(-1)?.[2] as {
			color: { lut: { dual?: unknown } };
		};
		expect(latest.color.lut.dual).toBeUndefined();
	});

	it("stores a replaceable local portrait provider identity for Filter Lab", () => {
		const background = cube({ value: 0.2 });
		const skin = cube({ value: 0.8 });
		const { result } = renderHook(() => useAdjustmentLut());

		act(() => {
			result.current.applyLut({
				name: "Olympus",
				cube: background,
				skinCube: skin,
				localPortraitResourceId: "7361792068475325735",
			});
		});

		expect(updateAdjustmentElement).toHaveBeenLastCalledWith(
			"adjustments",
			"adjustment-1",
			expect.objectContaining({
				color: expect.objectContaining({
					lut: expect.objectContaining({
						dual: {
							skinCube: skin,
							maskKind: "skin-segmentation-v1",
							resourceId: "7361792068475325735",
						},
					}),
				}),
			}),
			true
		);
	});

	it("stores shader recipes separately from the ordinary LUT slot", () => {
		const { result } = renderHook(() => useAdjustmentLut());
		const lutCube = cube({ value: 0.4 });

		act(() => {
			result.current.applyMultiPass({
				settings: {
					enabled: true,
					presetId: "jianying:food:v1",
					name: "清透美食",
					intensity: 100,
					fidelity: "structural",
					passes: [
						{ kind: "sharpen", amount: 1 },
						{ kind: "lut", cube: lutCube, intensity: 100 },
					],
				},
			});
		});

		expect(updateAdjustmentElement).toHaveBeenLastCalledWith(
			"adjustments",
			"adjustment-1",
			expect.objectContaining({
				color: expect.objectContaining({
					lut: expect.objectContaining({ enabled: false }),
					multiPass: expect.objectContaining({
						name: "清透美食",
						passes: [
							expect.objectContaining({ kind: "sharpen" }),
							expect.objectContaining({ kind: "lut", cube: lutCube }),
						],
					}),
				}),
			}),
			true
		);
	});
});
