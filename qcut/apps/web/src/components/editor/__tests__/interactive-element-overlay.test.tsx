import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TextElement } from "@/types/timeline";
import { InteractiveElementOverlay } from "../interactive-element-overlay";

vi.mock("@/stores/ai/effects-store", () => ({
	useEffectsStore: () => ({ getElementEffects: () => [] }),
}));

function createTextElement({
	overrides = {},
}: {
	overrides?: Partial<TextElement>;
} = {}): TextElement {
	return {
		id: "text-1",
		type: "text",
		name: "Test text",
		duration: 5,
		startTime: 0,
		trimStart: 0,
		trimEnd: 0,
		content: "Hello",
		fontSize: 48,
		fontFamily: "Arial",
		color: "#ffffff",
		backgroundColor: "transparent",
		textAlign: "center",
		fontWeight: "normal",
		fontStyle: "normal",
		textDecoration: "none",
		x: 10,
		y: 20,
		width: 400,
		height: 120,
		rotation: 0,
		opacity: 1,
		...overrides,
	};
}

function renderOverlay({ isSelected }: { isSelected: boolean }) {
	const onSelect = vi.fn();
	const onTransformUpdate = vi.fn();
	render(
		<InteractiveElementOverlay
			element={createTextElement()}
			isSelected={isSelected}
			canvasSize={{ width: 1920, height: 1080 }}
			previewDimensions={{ width: 960, height: 540 }}
			onSelect={onSelect}
			onTransformUpdate={onTransformUpdate}
		/>
	);

	return { onSelect, onTransformUpdate };
}

describe("InteractiveElementOverlay", () => {
	it("keeps an unselected text hit target above the media transform layer", () => {
		const { onSelect } = renderOverlay({ isSelected: false });
		const overlay = screen.getByTestId("interactive-element-overlay");
		const dragSurface = screen.getByRole("button", {
			name: "Select text element",
			hidden: true,
		});

		expect(overlay).toHaveClass("z-[80]");
		expect(dragSurface).toHaveClass("absolute", "inset-0");
		fireEvent.mouseDown(dragSurface, { clientX: 100, clientY: 100 });

		expect(onSelect).toHaveBeenCalledWith({ multi: false });
	});

	it("drags selected text from anywhere inside the full bounding box", () => {
		const { onSelect, onTransformUpdate } = renderOverlay({
			isSelected: true,
		});
		const dragSurface = screen.getByRole("button", {
			name: "Move element. Use arrow keys to move",
		});

		fireEvent.mouseDown(dragSurface, { clientX: 100, clientY: 100 });
		fireEvent.mouseMove(window, { clientX: 120, clientY: 110 });

		expect(onSelect).toHaveBeenCalledWith({ multi: false });
		expect(onTransformUpdate).toHaveBeenCalledWith(
			"text-1",
			expect.objectContaining({ x: 50, y: 40 })
		);
	});

	it("keeps resize handles exclusive to selected text", () => {
		const { rerender } = render(
			<InteractiveElementOverlay
				element={createTextElement()}
				isSelected={false}
				canvasSize={{ width: 1920, height: 1080 }}
				previewDimensions={{ width: 960, height: 540 }}
				onSelect={vi.fn()}
				onTransformUpdate={vi.fn()}
			/>
		);

		expect(
			screen.queryByRole("button", { name: "Resize from top-left corner" })
		).not.toBeInTheDocument();

		rerender(
			<InteractiveElementOverlay
				element={createTextElement()}
				isSelected
				canvasSize={{ width: 1920, height: 1080 }}
				previewDimensions={{ width: 960, height: 540 }}
				onSelect={vi.fn()}
				onTransformUpdate={vi.fn()}
			/>
		);

		expect(
			screen.getByRole("button", { name: "Resize from top-left corner" })
		).toBeInTheDocument();
	});
});
