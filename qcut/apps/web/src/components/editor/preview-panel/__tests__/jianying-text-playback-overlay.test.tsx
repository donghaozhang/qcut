import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JianyingTextRuntimeRenderRequest } from "@/types/electron/api-jianying-text-runtime";
import type { TextElement, TimelineTrack } from "@/types/timeline";
import { JianyingTextPlaybackOverlay } from "../jianying-text-playback-overlay";

function createTextElement(): TextElement {
	return {
		id: "jianying-text",
		type: "text",
		name: "Jianying text",
		content: "动态花字",
		startTime: 1,
		duration: 3,
		trimStart: 0,
		trimEnd: 0,
		fontSize: 72,
		fontFamily: "PingFang SC",
		color: "#ffffff",
		backgroundColor: "transparent",
		textAlign: "center",
		fontWeight: "bold",
		fontStyle: "normal",
		textDecoration: "none",
		x: 10,
		y: -5,
		width: 512,
		height: 512,
		rotation: 0,
		opacity: 1,
		blendMode: "normal",
		jianyingTextStyle: {
			schemaVersion: 1,
			source: "jianying-cache",
			packageKind: "ScriptInfoSticker",
			resourceId: "7280819425605930279",
			packageHash: "f46ef1dfceca013a755b566632c150bf",
			editMode: "runtime-with-preload-fallback",
			slotMapping: "line-to-widget",
			timeMapping: "stretch",
			templateDuration: 3,
		},
	};
}

function createTrack({ element }: { element: TextElement }): TimelineTrack {
	return {
		id: "text-track",
		name: "Text",
		type: "text",
		elements: [element],
	};
}

describe("Jianying text playback overlay", () => {
	const renderText = vi.fn(
		async (request: JianyingTextRuntimeRenderRequest) => ({
			requestId: request.requestId,
			resourceId: request.reference.resourceId,
			packageHash: request.reference.packageHash,
			templateDuration: 3,
			frameCount: request.frameCount,
			strategy: "runtime-parameters" as const,
			cacheHit: false,
			x: 714,
			y: 279,
			width: 512,
			height: 512,
			previewUrl: `app://jianying-text-preview/${"a".repeat(64)}.webm`,
			source: {
				kind: "image-sequence" as const,
				path: "/tmp/jianying/frame-%06d.png",
				frameRate: 30,
			},
		})
	);
	const cancelText = vi.fn(async () => true);

	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
		vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
		window.electronAPI = {
			platform: "darwin",
			jianyingTextRuntime: {
				inspect: vi.fn(),
				render: renderText,
				cancel: cancelText,
			},
		} as never;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders one reusable alpha video and keeps it synced during playback", async () => {
		const element = createTextElement();
		const track = createTrack({ element });
		const onStatusChange = vi.fn();
		const view = render(
			<JianyingTextPlaybackOverlay
				enabled
				activeElements={[{ element, track, mediaItem: null }]}
				canvasWidth={1920}
				canvasHeight={1080}
				fps={30}
				currentTime={1.4}
				isPlaying
				onStatusChange={onStatusChange}
			/>
		);

		const video = await screen.findByLabelText("剪映原版动态花字播放预览");
		expect(renderText).toHaveBeenCalledTimes(1);
		expect(renderText).toHaveBeenCalledWith(
			expect.objectContaining({
				content: "动态花字",
				sourceStart: 0,
				frameCount: 90,
				fps: 30,
				previewVideo: true,
			})
		);
		expect(video.getAttribute("src")).toBe(
			`app://jianying-text-preview/${"a".repeat(64)}.webm`
		);
		fireEvent.loadedData(video);
		expect(onStatusChange).toHaveBeenCalledWith({
			elementId: element.id,
			status: "ready",
		});

		view.rerender(
			<JianyingTextPlaybackOverlay
				enabled
				activeElements={[{ element, track, mediaItem: null }]}
				canvasWidth={1920}
				canvasHeight={1080}
				fps={30}
				currentTime={2.1}
				isPlaying
				onStatusChange={onStatusChange}
			/>
		);
		await waitFor(() => expect(renderText).toHaveBeenCalledTimes(1));
		view.unmount();
		expect(cancelText).toHaveBeenCalledTimes(1);
		expect(onStatusChange).toHaveBeenLastCalledWith({
			elementId: element.id,
			status: "idle",
		});
	});

	it("shows an explicit error instead of pretending the fallback is original", async () => {
		const element = createTextElement();
		const onStatusChange = vi.fn();
		renderText.mockRejectedValueOnce(
			new Error("本机剪映花字缺少 1 个动态依赖")
		);
		render(
			<JianyingTextPlaybackOverlay
				enabled
				activeElements={[
					{ element, track: createTrack({ element }), mediaItem: null },
				]}
				canvasWidth={1920}
				canvasHeight={1080}
				fps={30}
				currentTime={1.4}
				isPlaying
				onStatusChange={onStatusChange}
			/>
		);

		expect(
			await screen.findByTitle("本机剪映花字缺少 1 个动态依赖")
		).toHaveAttribute("data-jianying-text-playback", "error");
		expect(onStatusChange).toHaveBeenCalledWith({
			elementId: element.id,
			status: "error",
		});
	});

	it("prewarms while paused and reuses the sequence when playback starts", async () => {
		const element = createTextElement();
		const track = createTrack({ element });
		const onStatusChange = vi.fn();
		const play = vi.spyOn(HTMLMediaElement.prototype, "play");
		const view = render(
			<JianyingTextPlaybackOverlay
				enabled
				activeElements={[{ element, track, mediaItem: null }]}
				canvasWidth={1920}
				canvasHeight={1080}
				fps={30}
				currentTime={1.4}
				isPlaying={false}
				onStatusChange={onStatusChange}
			/>
		);

		const video = await screen.findByLabelText("剪映原版动态花字播放预览");
		fireEvent.loadedData(video);
		expect(renderText).toHaveBeenCalledTimes(1);
		expect(play).not.toHaveBeenCalled();

		view.rerender(
			<JianyingTextPlaybackOverlay
				enabled
				activeElements={[{ element, track, mediaItem: null }]}
				canvasWidth={1920}
				canvasHeight={1080}
				fps={30}
				currentTime={1.5}
				isPlaying
				onStatusChange={onStatusChange}
			/>
		);

		await waitFor(() => expect(play).toHaveBeenCalled());
		expect(renderText).toHaveBeenCalledTimes(1);
	});

	it("resynchronizes the cached preview when the timeline loops backward", async () => {
		const element = createTextElement();
		const track = createTrack({ element });
		const onStatusChange = vi.fn();
		const view = render(
			<JianyingTextPlaybackOverlay
				enabled
				activeElements={[{ element, track, mediaItem: null }]}
				canvasWidth={1920}
				canvasHeight={1080}
				fps={30}
				currentTime={3.9}
				isPlaying
				onStatusChange={onStatusChange}
			/>
		);
		const video = await screen.findByLabelText("剪映原版动态花字播放预览");
		fireEvent.loadedData(video);
		video.currentTime = 2.9;

		view.rerender(
			<JianyingTextPlaybackOverlay
				enabled
				activeElements={[{ element, track, mediaItem: null }]}
				canvasWidth={1920}
				canvasHeight={1080}
				fps={30}
				currentTime={1.05}
				isPlaying
				onStatusChange={onStatusChange}
			/>
		);

		await waitFor(() => expect(video.currentTime).toBeCloseTo(0.05, 5));
		expect(renderText).toHaveBeenCalledTimes(1);
	});
});
