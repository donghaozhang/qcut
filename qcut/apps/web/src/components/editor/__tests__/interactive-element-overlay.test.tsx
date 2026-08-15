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

function renderOverlay({
	isSelected,
	element = createTextElement(),
	contentBounds,
	contentBoundsTransform,
}: {
	isSelected: boolean;
	element?: TextElement;
	contentBounds?: {
		offsetX: number;
		offsetY: number;
		width: number;
		height: number;
	};
	contentBoundsTransform?: {
		x: number;
		y: number;
		width: number;
		height: number;
		rotation: number;
	};
}) {
	const onSelect = vi.fn();
	const onTransformUpdate = vi.fn();
	const onTransformPreview = vi.fn();
	render(
		<InteractiveElementOverlay
			element={element}
			isSelected={isSelected}
			canvasSize={{ width: 1920, height: 1080 }}
			previewDimensions={{ width: 960, height: 540 }}
			onSelect={onSelect}
			onTransformUpdate={onTransformUpdate}
			onTransformPreview={onTransformPreview}
			contentBounds={contentBounds}
			contentBoundsTransform={contentBoundsTransform}
		/>
	);

	return { onSelect, onTransformPreview, onTransformUpdate };
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

	it("previews a drag locally and commits it once on mouseup", () => {
		const { onSelect, onTransformPreview, onTransformUpdate } = renderOverlay({
			isSelected: true,
		});
		const dragSurface = screen.getByRole("button", {
			name: "Move element. Use arrow keys to move",
		});

		fireEvent.mouseDown(dragSurface, { clientX: 100, clientY: 100 });
		fireEvent.mouseMove(window, { clientX: 120, clientY: 110 });

		expect(onSelect).toHaveBeenCalledWith({ multi: false });
		expect(onTransformPreview).toHaveBeenCalledWith(
			"text-1",
			expect.objectContaining({ x: 50, y: 40 })
		);
		expect(onTransformUpdate).not.toHaveBeenCalled();

		fireEvent.mouseUp(window);
		expect(onTransformUpdate).toHaveBeenCalledWith(
			"text-1",
			expect.objectContaining({ x: 50, y: 40 })
		);
		expect(onTransformUpdate).toHaveBeenCalledTimes(1);
		expect(onTransformPreview).toHaveBeenLastCalledWith("text-1", null);
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
		).toHaveClass("pointer-events-auto");
	});

	it("uses native flower-text content bounds for the transform box", () => {
		render(
			<InteractiveElementOverlay
				element={createTextElement()}
				isSelected
				canvasSize={{ width: 1920, height: 1080 }}
				previewDimensions={{ width: 960, height: 540 }}
				contentBounds={{
					offsetX: 20,
					offsetY: -10,
					width: 320,
					height: 180,
				}}
				onSelect={vi.fn()}
				onTransformUpdate={vi.fn()}
			/>
		);

		const overlay = screen.getByTestId("interactive-element-overlay");
		expect(overlay.style.width).toBe("160px");
		expect(overlay.style.height).toBe("90px");
		expect(overlay.style.left).toBe("51.5625%");
		expect(overlay.style.top).toBe("50.925925925925924%");
	});

	it("puts the rotation handle below the bounding box", () => {
		renderOverlay({ isSelected: true });

		const rotationHandle = screen.getByRole("button", {
			name: "Rotate element. Use arrow keys to rotate",
		});
		expect(rotationHandle).toHaveClass("-bottom-8", "pointer-events-auto");
	});

	it("keeps native flower-text corner resizing centered and proportional", () => {
		const element = createTextElement({
			overrides: {
				jianyingTextStyle: {
					schemaVersion: 1,
					source: "jianying-cache",
					packageKind: "ScriptInfoSticker",
					resourceId: "flower-text",
					packageHash: "hash",
					editMode: "runtime-with-preload-fallback",
					slotMapping: "line-to-widget",
					timeMapping: "stretch",
					templateDuration: 3,
				},
			},
		});
		const { onTransformPreview, onTransformUpdate } = renderOverlay({
			isSelected: true,
			element,
		});
		const handle = screen.getByRole("button", {
			name: "Resize from bottom-right corner",
		});

		fireEvent.mouseDown(handle, { clientX: 0, clientY: 0 });
		fireEvent.mouseMove(window, { clientX: 100, clientY: 30 });

		expect(onTransformPreview).toHaveBeenCalledWith("text-1", {
			x: 10,
			y: 20,
			width: 800,
			height: 240,
			rotation: 0,
		});
		expect(onTransformUpdate).not.toHaveBeenCalled();
	});

	it("rotates native flower text around its visible bounds center", () => {
		const element = createTextElement({
			overrides: {
				jianyingTextStyle: {
					schemaVersion: 1,
					source: "jianying-cache",
					packageKind: "ScriptInfoSticker",
					resourceId: "flower-text",
					packageHash: "hash",
					editMode: "runtime-with-preload-fallback",
					slotMapping: "line-to-widget",
					timeMapping: "stretch",
					templateDuration: 3,
				},
			},
		});
		const sourceTransform = {
			x: 10,
			y: 20,
			width: 400,
			height: 120,
			rotation: 0,
		};
		const { onTransformPreview } = renderOverlay({
			isSelected: true,
			element,
			contentBounds: {
				offsetX: 20,
				offsetY: -10,
				width: 320,
				height: 100,
			},
			contentBoundsTransform: sourceTransform,
		});
		const overlay = screen.getByTestId("interactive-element-overlay");
		vi.spyOn(overlay, "getBoundingClientRect").mockReturnValue({
			x: 100,
			y: 100,
			left: 100,
			top: 100,
			right: 420,
			bottom: 300,
			width: 320,
			height: 200,
			toJSON: () => ({}),
		});
		const rotationHandle = screen.getByRole("button", {
			name: "Rotate element. Use arrow keys to rotate",
		});

		fireEvent.mouseDown(rotationHandle, { clientX: 260, clientY: 300 });
		fireEvent.mouseMove(window, {
			clientX: 210,
			clientY: 286.60254037844385,
		});

		const preview = onTransformPreview.mock.calls.at(-1)?.[1];
		expect(preview?.rotation).toBe(30);
		expect(preview?.x).toBeCloseTo(7.6795, 3);
		expect(preview?.y).toBeCloseTo(8.6603, 3);
	});
});
