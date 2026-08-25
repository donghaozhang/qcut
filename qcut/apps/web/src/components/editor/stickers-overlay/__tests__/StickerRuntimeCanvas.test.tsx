import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StickerRuntimeDescriptor } from "@qcut/editor-core/sticker-lab";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { StickerElement } from "@/types/timeline";

const mocks = vi.hoisted(() => ({
	drawImage: vi.fn(),
	renderFrame: vi.fn(),
}));

vi.mock("@/lib/stickers/sticker-runtime-browser-assets", () => ({
	createBrowserStickerRuntimeAssetResolver: () => ({ resolve: vi.fn() }),
	createBrowserStickerRuntimeCanvas: vi.fn(),
}));

vi.mock("@/lib/stickers/sticker-runtime-renderer", () => ({
	renderStickerRuntimeFrame: mocks.renderFrame,
}));

import { StickerRuntimeCanvas } from "../StickerRuntimeCanvas";

const descriptor: StickerRuntimeDescriptor = {
	kind: "png-sequence",
	cycleDurationSeconds: 0.4,
	frames: [
		{ source: "red.png", startSeconds: 0, durationSeconds: 0.1 },
		{ source: "blue.png", startSeconds: 0.1, durationSeconds: 0.3 },
	],
	repeat: { kind: "infinite" },
	completion: "freeze-last",
};

const element: StickerElement = {
	id: "runtime-element",
	type: "sticker",
	stickerId: "runtime-sticker",
	mediaId: "runtime-media",
	name: "Runtime sticker",
	startTime: 2,
	duration: 3,
	trimStart: 0.1,
	trimEnd: 0,
	stickerRuntime: descriptor,
};

const mediaItem: MediaItem = {
	id: "runtime-media",
	name: "runtime.gif",
	type: "image",
	file: new File([], "runtime.gif", { type: "image/gif" }),
	url: "blob:runtime",
};

describe("StickerRuntimeCanvas", () => {
	beforeEach(() => {
		mocks.drawImage.mockReset();
		mocks.renderFrame.mockReset().mockResolvedValue({
			active: true,
			image: {} as CanvasImageSource,
			width: 2,
			height: 1,
			state: {
				active: true,
				kind: "png-sequence",
				cycleTimeSeconds: 0.1,
				iterationIndex: 0,
				sourceTimeSeconds: 0.1,
				frozen: false,
				frame: descriptor.frames[1],
				frameElapsedSeconds: 0,
				frameIndex: 1,
			},
		});
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
			() =>
				({
					clearRect: vi.fn(),
					drawImage: mocks.drawImage,
				}) as never
		);
	});

	it("renders the requested timeline frame into a canvas instead of a wall-clock image", async () => {
		const view = render(
			<StickerRuntimeCanvas
				currentTime={2.2}
				descriptor={descriptor}
				element={element}
				mediaItem={mediaItem}
			/>
		);

		await waitFor(() =>
			expect(view.getByRole("img")).toHaveAttribute(
				"data-sticker-runtime-frame",
				"1"
			)
		);
		expect(mocks.renderFrame).toHaveBeenCalledWith(
			expect.objectContaining({
				descriptor,
				timeline: {
					timelineStartSeconds: 2,
					timelineDurationSeconds: 2.9,
					sourceOffsetSeconds: 0.1,
				},
				timelineTimeSeconds: 2.2,
			})
		);
		expect(mocks.drawImage).toHaveBeenCalledOnce();
		expect(view.container.querySelector("img")).toBeNull();
	});
});
