import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
	SHAPE_STICKERS,
	StickerShapeLibrary,
	buildShapeStickerFile,
} from "../components/sticker-shape-library";

describe("StickerShapeLibrary", () => {
	it("lists the basic Jianying-style shapes", () => {
		render(<StickerShapeLibrary onSelect={async () => {}} />);

		expect(screen.getAllByTestId("sticker-shape-item")).toHaveLength(
			SHAPE_STICKERS.length
		);
		for (const label of [
			"正方形",
			"圆形",
			"三角形",
			"平行四边形",
			"梯形",
			"直线",
			"箭头",
		]) {
			expect(
				screen.getByRole("button", { name: `添加${label}到时间线` })
			).toBeInTheDocument();
		}
	});

	it("inserts the clicked shape as an SVG sticker file", async () => {
		const onSelect = vi.fn(async (_: { file: File }) => {});
		render(<StickerShapeLibrary onSelect={onSelect} />);

		fireEvent.click(screen.getByRole("button", { name: "添加箭头到时间线" }));

		await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
		const file = onSelect.mock.calls[0]?.[0].file;
		expect(file).toBeInstanceOf(File);
		expect(file?.name).toBe("shape-arrow.svg");
		expect(file?.type).toBe("image/svg+xml");
		const svg = await file?.text();
		expect(svg).toContain("<svg");
		expect(svg).toContain("polygon");
	});

	it("builds a white-stroke standalone SVG document", async () => {
		const square = SHAPE_STICKERS.find((shape) => shape.id === "square");
		if (!square) throw new Error("Expected square shape");

		const svg = await buildShapeStickerFile({ shape: square }).text();
		expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
		expect(svg).toContain('stroke="#FFFFFF"');
		expect(svg).toContain("<rect");
	});

	it("surfaces insertion failures and stays retryable", async () => {
		const onSelect = vi
			.fn(async (_: { file: File }) => {})
			.mockRejectedValueOnce(new Error("timeline unavailable"));
		render(<StickerShapeLibrary onSelect={onSelect} />);

		const button = screen.getByRole("button", { name: "添加圆形到时间线" });
		fireEvent.click(button);

		expect(
			await screen.findByText("无法添加到时间线，请重试")
		).toBeInTheDocument();
		expect(button).toBeEnabled();

		fireEvent.click(button);
		await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(2));
	});
});
