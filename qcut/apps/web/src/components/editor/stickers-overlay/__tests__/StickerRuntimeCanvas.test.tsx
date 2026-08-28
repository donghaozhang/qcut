import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StickerRuntimeDescriptor } from "@qcut/editor-core/sticker-lab";
import type { StickerRuntimeRenderedFrame } from "@/lib/stickers/sticker-runtime-renderer";
import { usePlaybackStore } from "@/stores/editor/playback-store";
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

function pngSequenceFrame({
	frameIndex,
}: {
	frameIndex: number;
}): StickerRuntimeRenderedFrame {
	if (descriptor.kind !== "png-sequence") {
		throw new Error("Expected a PNG sequence descriptor");
	}
	const frame = descriptor.frames[frameIndex];
	if (!frame) throw new Error(`Missing test frame ${frameIndex}`);
	return {
		active: true,
		image: {} as CanvasImageSource,
		width: 2,
		height: 1,
		state: {
			active: true,
			kind: "png-sequence",
			cycleTimeSeconds: frame.startSeconds,
			iterationIndex: 0,
			sourceTimeSeconds: frame.startSeconds,
			frozen: false,
			frame,
			frameElapsedSeconds: 0,
			frameIndex,
		},
	};
}

const alphaVideoDescriptor: StickerRuntimeDescriptor = {
	kind: "alpha-video",
	source: "alpha-video.mp4",
	sourceDurationSeconds: 1,
	cycleDurationSeconds: 1,
	layout: { kind: "embedded-alpha" },
	progressKeyframes: [
		{ atSeconds: 0, sourceProgress: 0, interpolation: "linear" },
		{ atSeconds: 1, sourceProgress: 1, interpolation: "hold" },
	],
	repeat: { kind: "infinite" },
	completion: "freeze-last",
};

function alphaVideoFrame({
	sourceTimeInVideoSeconds,
}: {
	sourceTimeInVideoSeconds: number;
}): StickerRuntimeRenderedFrame {
	if (alphaVideoDescriptor.kind !== "alpha-video") {
		throw new Error("Expected an alpha video descriptor");
	}
	return {
		active: true,
		image: {} as CanvasImageSource,
		width: 2,
		height: 1,
		state: {
			active: true,
			kind: "alpha-video",
			cycleTimeSeconds: sourceTimeInVideoSeconds,
			iterationIndex: 0,
			sourceTimeSeconds: sourceTimeInVideoSeconds,
			frozen: false,
			layout: alphaVideoDescriptor.layout,
			sourceProgress: sourceTimeInVideoSeconds,
			sourceTimeInVideoSeconds,
		},
	};
}

describe("StickerRuntimeCanvas", () => {
	beforeEach(() => {
		usePlaybackStore.setState({ currentTime: 0, isPlaying: false });
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

	it("coalesces playback ticks without committing an obsolete frame", async () => {
		let resolveFirstFrame: (frame: StickerRuntimeRenderedFrame) => void = () =>
			undefined;
		const firstFrame = new Promise<StickerRuntimeRenderedFrame>((resolve) => {
			resolveFirstFrame = resolve;
		});
		mocks.renderFrame
			.mockReturnValueOnce(firstFrame)
			.mockResolvedValue(pngSequenceFrame({ frameIndex: 0 }));
		const view = render(
			<StickerRuntimeCanvas
				currentTime={2.1}
				descriptor={descriptor}
				element={element}
				mediaItem={mediaItem}
			/>
		);
		await waitFor(() => expect(mocks.renderFrame).toHaveBeenCalledOnce());

		act(() => {
			window.dispatchEvent(
				new CustomEvent("playback-update", { detail: { time: 2.3 } })
			);
			window.dispatchEvent(
				new CustomEvent("playback-update", { detail: { time: 2.7 } })
			);
		});
		expect(mocks.renderFrame).toHaveBeenCalledOnce();

		await act(async () => {
			resolveFirstFrame(pngSequenceFrame({ frameIndex: 1 }));
			await firstFrame;
		});
		await waitFor(() => expect(mocks.renderFrame).toHaveBeenCalledTimes(2));
		expect(mocks.renderFrame).toHaveBeenLastCalledWith(
			expect.objectContaining({ timelineTimeSeconds: 2.7 })
		);
		await waitFor(() =>
			expect(view.getByRole("img")).toHaveAttribute(
				"data-sticker-runtime-frame",
				"0"
			)
		);
		expect(mocks.drawImage).toHaveBeenCalledOnce();
	});

	it("does not commit an asynchronous frame superseded by a seek", async () => {
		let resolveFirstFrame: (frame: StickerRuntimeRenderedFrame) => void = () =>
			undefined;
		const firstFrame = new Promise<StickerRuntimeRenderedFrame>((resolve) => {
			resolveFirstFrame = resolve;
		});
		mocks.renderFrame
			.mockReturnValueOnce(firstFrame)
			.mockResolvedValue(pngSequenceFrame({ frameIndex: 0 }));
		const view = render(
			<StickerRuntimeCanvas
				currentTime={2.1}
				descriptor={descriptor}
				element={element}
				mediaItem={mediaItem}
			/>
		);
		await waitFor(() => expect(mocks.renderFrame).toHaveBeenCalledOnce());

		act(() => {
			window.dispatchEvent(
				new CustomEvent("playback-seek", { detail: { time: 2.35 } })
			);
		});
		await act(async () => {
			resolveFirstFrame(pngSequenceFrame({ frameIndex: 1 }));
			await firstFrame;
		});

		await waitFor(() => expect(mocks.renderFrame).toHaveBeenCalledTimes(2));
		expect(mocks.renderFrame).toHaveBeenLastCalledWith(
			expect.objectContaining({ timelineTimeSeconds: 2.35 })
		);
		await waitFor(() =>
			expect(view.getByRole("img")).toHaveAttribute(
				"data-sticker-runtime-frame",
				"0"
			)
		);
		expect(mocks.drawImage).toHaveBeenCalledOnce();
	});

	it("does not expose an obsolete playback frame error", async () => {
		let rejectFirstFrame: (error: Error) => void = () => undefined;
		const firstFrame = new Promise<StickerRuntimeRenderedFrame>(
			(_resolve, reject) => {
				rejectFirstFrame = reject;
			}
		);
		let resolveSecondFrame: (frame: StickerRuntimeRenderedFrame) => void = () =>
			undefined;
		const secondFrame = new Promise<StickerRuntimeRenderedFrame>((resolve) => {
			resolveSecondFrame = resolve;
		});
		mocks.renderFrame
			.mockReturnValueOnce(firstFrame)
			.mockReturnValueOnce(secondFrame);
		const view = render(
			<StickerRuntimeCanvas
				currentTime={2.1}
				descriptor={descriptor}
				element={element}
				mediaItem={mediaItem}
			/>
		);
		await waitFor(() => expect(mocks.renderFrame).toHaveBeenCalledOnce());

		act(() => {
			window.dispatchEvent(
				new CustomEvent("playback-update", { detail: { time: 2.3 } })
			);
		});
		await act(async () => {
			rejectFirstFrame(new Error("Obsolete frame failed"));
			await firstFrame.catch(() => undefined);
		});
		await waitFor(() => expect(mocks.renderFrame).toHaveBeenCalledTimes(2));
		expect(view.getByRole("img")).not.toHaveAttribute(
			"data-sticker-runtime-error"
		);
		expect(mocks.drawImage).not.toHaveBeenCalled();

		await act(async () => {
			resolveSecondFrame(pngSequenceFrame({ frameIndex: 0 }));
			await secondFrame;
		});
		await waitFor(() =>
			expect(view.getByRole("img")).toHaveAttribute(
				"data-sticker-runtime-frame",
				"0"
			)
		);
		expect(mocks.drawImage).toHaveBeenCalledOnce();
	});

	it("preserves alpha video source times above 30 frames per second", async () => {
		mocks.renderFrame.mockResolvedValue(
			alphaVideoFrame({ sourceTimeInVideoSeconds: 0.2 })
		);
		render(
			<StickerRuntimeCanvas
				currentTime={2.1}
				descriptor={alphaVideoDescriptor}
				element={{ ...element, stickerRuntime: alphaVideoDescriptor }}
				mediaItem={mediaItem}
			/>
		);
		await waitFor(() => expect(mocks.renderFrame).toHaveBeenCalledOnce());

		act(() => {
			window.dispatchEvent(
				new CustomEvent("playback-update", { detail: { time: 2.11 } })
			);
		});
		await waitFor(() => expect(mocks.renderFrame).toHaveBeenCalledTimes(2));
		expect(mocks.renderFrame).toHaveBeenLastCalledWith(
			expect.objectContaining({ timelineTimeSeconds: 2.11 })
		);
	});

	it("supersedes alpha playback work when seek matches the pending time", async () => {
		let resolveFirstFrame: (frame: StickerRuntimeRenderedFrame) => void = () =>
			undefined;
		const firstFrame = new Promise<StickerRuntimeRenderedFrame>((resolve) => {
			resolveFirstFrame = resolve;
		});
		let resolveSecondFrame: (frame: StickerRuntimeRenderedFrame) => void = () =>
			undefined;
		const secondFrame = new Promise<StickerRuntimeRenderedFrame>((resolve) => {
			resolveSecondFrame = resolve;
		});
		mocks.renderFrame
			.mockReturnValueOnce(firstFrame)
			.mockReturnValueOnce(secondFrame);
		const view = render(
			<StickerRuntimeCanvas
				currentTime={2.1}
				descriptor={alphaVideoDescriptor}
				element={{ ...element, stickerRuntime: alphaVideoDescriptor }}
				mediaItem={mediaItem}
			/>
		);
		await waitFor(() => expect(mocks.renderFrame).toHaveBeenCalledOnce());

		act(() => {
			window.dispatchEvent(
				new CustomEvent("playback-update", { detail: { time: 2.2 } })
			);
			window.dispatchEvent(
				new CustomEvent("playback-seek", { detail: { time: 2.2 } })
			);
		});
		await act(async () => {
			resolveFirstFrame(alphaVideoFrame({ sourceTimeInVideoSeconds: 0.2 }));
			await firstFrame;
		});
		await waitFor(() => expect(mocks.renderFrame).toHaveBeenCalledTimes(2));
		expect(mocks.drawImage).not.toHaveBeenCalled();

		await act(async () => {
			resolveSecondFrame(alphaVideoFrame({ sourceTimeInVideoSeconds: 0.3 }));
			await secondFrame;
		});
		await waitFor(() =>
			expect(view.getByRole("img")).toHaveAttribute(
				"data-sticker-runtime-frame",
				"0.300000"
			)
		);
		expect(mocks.drawImage).toHaveBeenCalledOnce();
	});
});
