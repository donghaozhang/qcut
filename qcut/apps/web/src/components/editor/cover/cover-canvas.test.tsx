import { fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCoverText, type CoverDesignV1 } from "@qcut/editor-core/cover";
import { CoverCanvas } from "./cover-canvas";

vi.mock("./use-cover-interaction-preview", () => ({
	useCoverInteractionPreview: () => useRef(null),
}));

function setup() {
	const canvas = { width: 1920, height: 1080, backgroundColor: "#000000" };
	const text = createCoverText({ canvas, id: "title", content: "Title" });
	const sha256 = "a".repeat(64);
	const design: CoverDesignV1 = {
		schema: "qcut.cover-design",
		schemaVersion: 1,
		id: "gesture-test",
		revision: 1,
		source: { kind: "local-image", originalName: "background.png" },
		createdAt: "2026-09-06T00:00:00.000Z",
		updatedAt: "2026-09-06T00:00:00.000Z",
		canvas,
		layers: [
			{
				id: "background",
				kind: "image",
				fit: "cover",
				asset: {
					assetId: sha256,
					sha256,
					relativePath: `cover/objects/${sha256}.png`,
					mimeType: "image/png",
					byteLength: 1,
					width: 1920,
					height: 1080,
				},
			},
			text,
		],
	};
	const onEdit = vi.fn();
	render(
		<CoverCanvas
			design={design}
			preview={null}
			selectedId="title"
			onSelect={vi.fn()}
			onEdit={onEdit}
			cropping={false}
			disabled={false}
			rendering={false}
			projectId="p1"
			onError={vi.fn()}
		/>
	);
	const target = screen.getByTestId("cover-layer-title");
	target.setPointerCapture = vi.fn();
	return { target, onEdit, design };
}

describe("cover canvas gestures", () => {
	beforeEach(() => {
		vi.stubGlobal("PointerEvent", MouseEvent);
		vi.stubGlobal(
			"ResizeObserver",
			class {
				private callback: ResizeObserverCallback;
				constructor(callback: ResizeObserverCallback) {
					this.callback = callback;
				}
				observe() {
					this.callback(
						[
							{
								contentRect: { width: 984, height: 564 },
							} as ResizeObserverEntry,
						],
						this as unknown as ResizeObserver
					);
				}
				disconnect() {}
			}
		);
	});
	afterEach(() => vi.unstubAllGlobals());
	it("commits a completed drag once, with normalized coordinates", () => {
		const { target, onEdit } = setup();
		fireEvent.pointerDown(target, { button: 0, clientX: 100, clientY: 100 });
		fireEvent.pointerMove(target, { clientX: 196, clientY: 154 });
		expect(onEdit).not.toHaveBeenCalled();
		fireEvent.pointerUp(target);
		fireEvent.lostPointerCapture(target);
		expect(onEdit).toHaveBeenCalledTimes(1);
		expect(onEdit.mock.calls[0][0].layers[1]).toMatchObject({ x: 0.6, y: 0.6 });
	});
	it("discards cancelled pointer gestures", () => {
		const { target, onEdit } = setup();
		fireEvent.pointerDown(target, { button: 0, clientX: 100, clientY: 100 });
		fireEvent.pointerMove(target, { clientX: 900, clientY: 500 });
		fireEvent.pointerCancel(target);
		expect(onEdit).not.toHaveBeenCalled();
	});
	it("supports keyboard position adjustment without moving the background", () => {
		const { target, onEdit, design } = setup();
		fireEvent.keyDown(target, { key: "ArrowRight", shiftKey: true });
		expect(onEdit.mock.calls[0][0].layers[1].x).toBeCloseTo(0.55);
		expect(onEdit.mock.calls[0][0].layers[0]).toEqual(design.layers[0]);
	});
});
