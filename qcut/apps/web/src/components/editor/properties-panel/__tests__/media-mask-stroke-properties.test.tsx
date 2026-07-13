import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MediaMaskStrokeProperties } from "../media-mask-stroke-properties";

describe("MediaMaskStrokeProperties", () => {
	it("applies only presets backed by preview and export implementations", () => {
		const onChange = vi.fn();
		render(
			<MediaMaskStrokeProperties
				onChange={onChange}
				onInteractionStart={vi.fn()}
				onInteractionEnd={vi.fn()}
			/>
		);

		for (const label of [
			"无",
			"单层",
			"发光",
			"偏移",
			"三层",
			"手绘",
			"虚线",
		]) {
			expect(
				screen.getByRole("button", { name: `${label}描边` })
			).toBeVisible();
		}
		fireEvent.click(screen.getByRole("button", { name: "发光描边" }));
		expect(onChange).toHaveBeenLastCalledWith(
			expect.objectContaining({ style: "glow", width: 4, glow: 12 }),
			true
		);
	});

	it("updates visible style parameters", () => {
		const onChange = vi.fn();
		render(
			<MediaMaskStrokeProperties
				stroke={{
					style: "offset",
					color: "#ffffff",
					width: 5,
					opacity: 1,
					glow: 0,
					offsetX: 8,
					offsetY: 8,
				}}
				onChange={onChange}
				onInteractionStart={vi.fn()}
				onInteractionEnd={vi.fn()}
			/>
		);

		fireEvent.change(screen.getByLabelText("水平偏移数值"), {
			target: { value: "14" },
		});
		expect(onChange).toHaveBeenLastCalledWith(
			expect.objectContaining({ style: "offset", offsetX: 14 }),
			false
		);
	});
});
