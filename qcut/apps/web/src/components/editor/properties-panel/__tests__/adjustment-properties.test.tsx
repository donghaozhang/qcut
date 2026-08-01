import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_MEDIA_COLOR_SETTINGS } from "@/lib/color/color-properties";
import { createMediaMask } from "@/lib/video/media-mask-stack";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { TimelineStore } from "@/stores/timeline/types";
import type { AdjustmentElement } from "@/types/timeline";
import { AdjustmentProperties } from "../adjustment-properties";

vi.mock("sonner", () => ({
	toast: {
		success: vi.fn(),
		info: vi.fn(),
		error: vi.fn(),
	},
}));

const adjustment: AdjustmentElement = {
	id: "adjustment-1",
	type: "adjustment",
	name: "调节1",
	duration: 5,
	startTime: 0,
	trimStart: 0,
	trimEnd: 0,
	opacity: 1,
};

async function activateTab({
	name,
	visibleTestId,
}: {
	name: string;
	visibleTestId: string;
}) {
	const tab = screen.getByRole("tab", { name });
	fireEvent.pointerDown(tab, { button: 0, ctrlKey: false });
	fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
	fireEvent.click(tab);
	await waitFor(() => expect(screen.getByTestId(visibleTestId)).toBeVisible());
}

describe("AdjustmentProperties", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		usePlaybackStore.setState({ currentTime: 1 });
		useProjectStore.setState({
			activeProject: { fps: 30 } as ReturnType<
				typeof useProjectStore.getState
			>["activeProject"],
		});
	});

	it("writes color settings to the selected adjustment layer", () => {
		const updateAdjustmentElement = vi.fn();
		useTimelineStore.setState({
			updateAdjustmentElement:
				updateAdjustmentElement as unknown as TimelineStore["updateAdjustmentElement"],
			pushHistory: vi.fn(),
		});

		render(
			<AdjustmentProperties element={adjustment} trackId="adjustment-track" />
		);
		fireEvent.click(screen.getByLabelText("启用调节"));

		expect(updateAdjustmentElement).toHaveBeenCalledWith(
			"adjustment-track",
			"adjustment-1",
			expect.objectContaining({
				color: expect.objectContaining({ enabled: false }),
			}),
			true
		);
	});

	it("exposes the full adjustment tabs from the reference color panel", () => {
		useTimelineStore.setState({
			updateAdjustmentElement: vi.fn(),
			pushHistory: vi.fn(),
		});

		render(
			<AdjustmentProperties element={adjustment} trackId="adjustment-track" />
		);

		expect(screen.getByTestId("color-module-basic")).toBeVisible();
		expect(screen.getByRole("tab", { name: "基础" })).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: "HSL" })).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: "曲线" })).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: "色轮" })).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: "蒙版" })).toBeInTheDocument();
		expect(screen.getByTestId("color-module-lut")).toBeVisible();
		expect(screen.getByText("色彩")).toBeVisible();
		expect(screen.getByText("明度")).toBeVisible();
		expect(screen.getByText("效果")).toBeVisible();
	});

	it("adds editable masks to the selected adjustment layer", async () => {
		const updateAdjustmentElement = vi.fn();
		useTimelineStore.setState({
			updateAdjustmentElement:
				updateAdjustmentElement as unknown as TimelineStore["updateAdjustmentElement"],
			pushHistory: vi.fn(),
		});

		render(
			<AdjustmentProperties element={adjustment} trackId="adjustment-track" />
		);

		await activateTab({ name: "蒙版", visibleTestId: "media-mask-shape-grid" });
		fireEvent.click(screen.getByLabelText("选择矩形蒙版"));

		expect(updateAdjustmentElement).toHaveBeenCalledWith(
			"adjustment-track",
			"adjustment-1",
			{
				masks: [
					expect.objectContaining({
						type: "rectangle",
						name: "蒙版 1",
					}),
				],
			},
			true
		);
	});

	it("persists the selected mask as the adjustment color scope", async () => {
		const updateAdjustmentElement = vi.fn();
		const mask = createMediaMask({
			id: "grade-mask-1",
			index: 0,
			name: "主体范围",
			type: "ellipse",
		});
		const color = structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS);
		color.mask.enabled = true;
		useTimelineStore.setState({
			updateAdjustmentElement:
				updateAdjustmentElement as unknown as TimelineStore["updateAdjustmentElement"],
			pushHistory: vi.fn(),
		});

		render(
			<AdjustmentProperties
				element={{ ...adjustment, color, masks: [mask] }}
				trackId="adjustment-track"
			/>
		);

		await activateTab({ name: "蒙版", visibleTestId: "color-module-mask" });
		const maskLabel = within(screen.getByTestId("color-module-mask"))
			.getByText("主体范围")
			.closest("label");
		if (!maskLabel) throw new Error("Expected a color-mask assignment label.");
		fireEvent.click(within(maskLabel).getByRole("checkbox"));

		expect(updateAdjustmentElement).toHaveBeenCalledWith(
			"adjustment-track",
			"adjustment-1",
			expect.objectContaining({
				color: expect.objectContaining({
					mask: {
						enabled: true,
						invert: false,
						maskIds: ["grade-mask-1"],
					},
				}),
			}),
			true
		);
	});

	it("edits wheel luminance and creates wheel keyframes", async () => {
		const updateAdjustmentElement = vi.fn();
		const color = structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS);
		color.wheels.enabled = true;
		color.wheels.shadows.luminance = 12;
		useTimelineStore.setState({
			updateAdjustmentElement:
				updateAdjustmentElement as unknown as TimelineStore["updateAdjustmentElement"],
			pushHistory: vi.fn(),
		});

		render(
			<AdjustmentProperties
				element={{ ...adjustment, color }}
				trackId="adjustment-track"
			/>
		);

		await activateTab({ name: "色轮", visibleTestId: "color-module-wheels" });
		fireEvent.click(screen.getByText("亮度与关键帧"));

		expect(screen.getByLabelText("暗部 X数值")).toBeVisible();
		expect(screen.getByLabelText("暗部 Y数值")).toBeVisible();
		const luminanceInput = screen.getByLabelText("暗部亮度数值");
		expect(luminanceInput).toHaveValue(12);
		fireEvent.change(luminanceInput, { target: { value: "18" } });
		expect(updateAdjustmentElement).toHaveBeenCalledWith(
			"adjustment-track",
			"adjustment-1",
			expect.objectContaining({
				color: expect.objectContaining({
					wheels: expect.objectContaining({
						shadows: expect.objectContaining({ luminance: 18 }),
					}),
				}),
			}),
			true
		);

		updateAdjustmentElement.mockClear();
		fireEvent.click(screen.getByRole("button", { name: "添加暗部亮度关键帧" }));
		expect(updateAdjustmentElement).toHaveBeenCalledWith(
			"adjustment-track",
			"adjustment-1",
			expect.objectContaining({
				color: expect.objectContaining({
					keyframes: expect.objectContaining({
						"wheels.shadows.luminance": [
							expect.objectContaining({ frame: 30, value: 12 }),
						],
					}),
				}),
			}),
			true
		);
	});
});
