import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createMediaMask } from "@/lib/video/media-mask-stack";
import { changeMediaMaskShape, MASK_SHAPES } from "../media-mask-shapes";
import { MediaMaskShapeGrid } from "../media-mask-shape-grid";

describe("MediaMaskShapeGrid", () => {
	it("shows every mask shape without opening a menu", () => {
		render(<MediaMaskShapeGrid selectedType="rectangle" onSelect={vi.fn()} />);

		expect(screen.getAllByRole("button")).toHaveLength(MASK_SHAPES.length);
		expect(
			screen.getByRole("button", { name: "已选矩形蒙版" })
		).toHaveAttribute("aria-pressed", "true");
		expect(screen.getByRole("button", { name: "选择人物蒙版" })).toBeVisible();
	});

	it("selects shapes with pointer and keyboard input", () => {
		const onSelect = vi.fn();
		render(<MediaMaskShapeGrid selectedType="rectangle" onSelect={onSelect} />);

		fireEvent.click(screen.getByRole("button", { name: "选择圆形蒙版" }));
		fireEvent.keyDown(screen.getByRole("button", { name: "选择钢笔蒙版" }), {
			key: "Enter",
		});

		expect(onSelect).toHaveBeenNthCalledWith(1, "ellipse");
		expect(onSelect).toHaveBeenNthCalledWith(2, "pen");
	});

	it("initializes shape-specific data and removes stale fields", () => {
		const rectangle = {
			...createMediaMask({ id: "mask-1", type: "rectangle", index: 0 }),
			name: "主体",
			centerX: 0.35,
		};
		const pen = changeMediaMaskShape({
			mask: rectangle,
			type: "pen",
			index: 0,
		});

		expect(pen).toMatchObject({
			id: "mask-1",
			name: "主体",
			type: "pen",
			centerX: 0.35,
		});
		expect(pen.points).toHaveLength(4);

		const ellipse = changeMediaMaskShape({
			mask: pen,
			type: "ellipse",
			index: 0,
		});
		expect(ellipse.type).toBe("ellipse");
		expect(ellipse.points).toBeUndefined();

		const text = changeMediaMaskShape({
			mask: ellipse,
			type: "text",
			index: 0,
		});
		expect(text).toMatchObject({ text: "文本", fontFamily: "sans-serif" });
	});
});
