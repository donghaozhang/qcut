import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createMediaMask } from "@/lib/video/media-mask-stack";
import type { MediaMask, MediaMaskKeyframeProperty } from "@/types/timeline";
import { MediaMaskTransformControls } from "../media-mask-transform-controls";

type NumericChange = (options: {
	updates: Partial<Record<MediaMaskKeyframeProperty, number>>;
}) => void;
type SizeChange = (options: {
	property: "width" | "height";
	value: number;
}) => void;

function renderControls({
	mask,
	onNumericChange = vi.fn<NumericChange>(),
	onSizeChange = vi.fn<SizeChange>(),
}: {
	mask: MediaMask;
	onNumericChange?: NumericChange;
	onSizeChange?: SizeChange;
}) {
	render(
		<MediaMaskTransformControls
			mask={mask}
			isKeyframed={() => false}
			onNumericChange={onNumericChange}
			onSizeChange={onSizeChange}
			onToggleKeyframes={vi.fn()}
			onAspectRatioChange={vi.fn()}
			onInteractionStart={vi.fn()}
			onInteractionEnd={vi.fn()}
		/>
	);
	return { onNumericChange, onSizeChange };
}

describe("MediaMaskTransformControls", () => {
	it("shows the compact rectangle controls from the mask inspector", () => {
		const mask = createMediaMask({
			id: "mask-rectangle",
			type: "rectangle",
			index: 0,
		});
		renderControls({ mask });

		expect(screen.getByLabelText("X 位置数值")).toHaveValue(0);
		expect(screen.getByLabelText("Y 位置数值")).toHaveValue(0);
		expect(screen.getByLabelText("旋转数值")).toBeVisible();
		expect(screen.getByLabelText("宽度数值")).toBeVisible();
		expect(screen.getByLabelText("高度数值")).toBeVisible();
		expect(screen.getByRole("slider", { name: "羽化" })).toBeVisible();
		expect(screen.getByRole("slider", { name: "圆角" })).toBeVisible();
	});

	it("uses the reduced position, rotation, and feather set for linear masks", () => {
		const mask = createMediaMask({
			id: "mask-linear",
			type: "linear",
			index: 0,
		});
		renderControls({ mask });

		expect(screen.getByLabelText("X 位置数值")).toBeVisible();
		expect(screen.getByLabelText("旋转数值")).toBeVisible();
		expect(screen.getByRole("slider", { name: "羽化" })).toBeVisible();
		expect(screen.queryByLabelText("宽度数值")).not.toBeInTheDocument();
		expect(screen.queryByLabelText("高度数值")).not.toBeInTheDocument();
		expect(
			screen.queryByRole("slider", { name: "圆角" })
		).not.toBeInTheDocument();
	});

	it("maps centered position values and delegates linked size updates", () => {
		const mask = createMediaMask({
			id: "mask-inputs",
			type: "rectangle",
			index: 0,
		});
		const onNumericChange = vi.fn();
		const onSizeChange = vi.fn();
		renderControls({ mask, onNumericChange, onSizeChange });

		fireEvent.change(screen.getByLabelText("X 位置数值"), {
			target: { value: "25" },
		});
		fireEvent.change(screen.getByLabelText("宽度数值"), {
			target: { value: "120" },
		});

		expect(onNumericChange).toHaveBeenCalledWith({
			updates: { centerX: 0.75 },
		});
		expect(onSizeChange).toHaveBeenCalledWith({
			property: "width",
			value: 1.2,
		});
	});
});
