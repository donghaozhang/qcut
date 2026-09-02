import { act, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { MediaElement } from "@/types/timeline";
import { useCustomCutoutEditorStore } from "@/stores/editor/custom-cutout-editor-store";
import { useMaskEditorStore } from "@/stores/editor/mask-editor-store";
import { MediaTransformOverlay } from "../media-transform-overlay";

const element = {
	id: "clip-1",
	type: "media",
	name: "clip",
	mediaId: "media-1",
	startTime: 0,
	duration: 4,
	trimStart: 0,
	trimEnd: 0,
} as MediaElement;

function renderOverlay() {
	const previewRef = createRef<HTMLDivElement>();
	return render(
		<div ref={previewRef}>
			<MediaTransformOverlay
				targets={[{ trackId: "track-1", element }]}
				canvasSize={{ width: 1920, height: 1080 }}
				previewRef={previewRef}
				currentTime={1}
				fps={30}
			/>
		</div>
	);
}

afterEach(() => {
	act(() => {
		useCustomCutoutEditorStore.getState().stopEditing();
		useMaskEditorStore.getState().setEditing(false);
	});
});

/**
 * The transform box sits above every preview element, so any overlay that
 * needs the clip surface for pointer input has to make it yield.
 */
describe("MediaTransformOverlay visibility", () => {
	it("shows the transform box for a selected clip", () => {
		renderOverlay();
		expect(screen.getByTestId("media-transform-box")).toBeInTheDocument();
	});

	it("yields while a custom cutout is being painted", () => {
		act(() => {
			useCustomCutoutEditorStore.getState().startEditing(element.id);
		});
		renderOverlay();
		expect(screen.queryByTestId("media-transform-box")).toBeNull();
	});

	it("yields while a mask is being edited", () => {
		act(() => {
			useMaskEditorStore.getState().setEditing(true);
		});
		renderOverlay();
		expect(screen.queryByTestId("media-transform-box")).toBeNull();
	});
});
