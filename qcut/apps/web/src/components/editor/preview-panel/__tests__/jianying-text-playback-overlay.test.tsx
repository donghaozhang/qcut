import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
	JianyingTextRuntimeRenderRequest,
	JianyingTextRuntimeRenderResult,
} from "@/types/electron/api-jianying-text-runtime";
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

function createRenderResult({
	request,
	digest = "a",
}: {
	request: JianyingTextRuntimeRenderRequest;
	digest?: string;
}): JianyingTextRuntimeRenderResult {
	return {
		requestId: request.requestId,
		resourceId: request.reference.resourceId,
		packageHash: request.reference.packageHash,
		templateDuration: 3,
		frameCount: request.frameCount,
		strategy: "runtime-parameters",
		cacheHit: false,
		x: 714,
		y: 279,
		width: 512,
		height: 512,
		contentBounds: { x: 76, y: 146, width: 360, height: 220 },
		previewUrl: `app://jianying-text-preview/${digest.repeat(64)}.webm`,
		source: {
			kind: "image-sequence",
			path: "/tmp/jianying/frame-%06d.png",
			frameRate: 30,
		},
	};
}

describe("Jianying text playback overlay", () => {
	const renderText = vi.fn(async (request: JianyingTextRuntimeRenderRequest) =>
		createRenderResult({ request })
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
		const onBoundsChange = vi.fn();
		const view = render(
			<JianyingTextPlaybackOverlay
				enabled
				activeElements={[{ element, track, mediaItem: null }]}
				canvasWidth={1920}
				canvasHeight={1080}
				fps={30}
				currentTime={1.4}
				isPlaying
				previewTransforms={new Map()}
				onStatusChange={onStatusChange}
				onBoundsChange={onBoundsChange}
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
		expect(onBoundsChange).toHaveBeenCalledWith({
			elementId: element.id,
			snapshot: {
				bounds: { offsetX: 0, offsetY: 0, width: 392, height: 252 },
				transform: {
					x: 10,
					y: -5,
					width: 512,
					height: 512,
					rotation: 0,
				},
			},
		});
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
				previewTransforms={new Map()}
				onStatusChange={onStatusChange}
				onBoundsChange={onBoundsChange}
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
		const onBoundsChange = vi.fn();
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
				previewTransforms={new Map()}
				onStatusChange={onStatusChange}
				onBoundsChange={onBoundsChange}
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
		const onBoundsChange = vi.fn();
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
				previewTransforms={new Map()}
				onStatusChange={onStatusChange}
				onBoundsChange={onBoundsChange}
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
				previewTransforms={new Map()}
				onStatusChange={onStatusChange}
				onBoundsChange={onBoundsChange}
			/>
		);

		await waitFor(() => expect(play).toHaveBeenCalled());
		expect(renderText).toHaveBeenCalledTimes(1);
	});

	it("resynchronizes the cached preview when the timeline loops backward", async () => {
		const element = createTextElement();
		const track = createTrack({ element });
		const onStatusChange = vi.fn();
		const onBoundsChange = vi.fn();
		const view = render(
			<JianyingTextPlaybackOverlay
				enabled
				activeElements={[{ element, track, mediaItem: null }]}
				canvasWidth={1920}
				canvasHeight={1080}
				fps={30}
				currentTime={3.9}
				isPlaying
				previewTransforms={new Map()}
				onStatusChange={onStatusChange}
				onBoundsChange={onBoundsChange}
			/>
		);
		const video = (await screen.findByLabelText(
			"剪映原版动态花字播放预览"
		)) as HTMLVideoElement;
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
				previewTransforms={new Map()}
				onStatusChange={onStatusChange}
				onBoundsChange={onBoundsChange}
			/>
		);

		await waitFor(() => expect(video.currentTime).toBeCloseTo(0.05, 5));
		expect(renderText).toHaveBeenCalledTimes(1);
	});

	it("applies an interactive transform to the cached video without rerendering", async () => {
		const element = createTextElement();
		const track = createTrack({ element });
		const onStatusChange = vi.fn();
		const onBoundsChange = vi.fn();
		const view = render(
			<JianyingTextPlaybackOverlay
				enabled
				activeElements={[{ element, track, mediaItem: null }]}
				canvasWidth={1920}
				canvasHeight={1080}
				fps={30}
				currentTime={1.4}
				isPlaying={false}
				previewTransforms={new Map()}
				onStatusChange={onStatusChange}
				onBoundsChange={onBoundsChange}
			/>
		);
		const video = await screen.findByLabelText("剪映原版动态花字播放预览");

		view.rerender(
			<JianyingTextPlaybackOverlay
				enabled
				activeElements={[{ element, track, mediaItem: null }]}
				canvasWidth={1920}
				canvasHeight={1080}
				fps={30}
				currentTime={1.4}
				isPlaying={false}
				previewTransforms={
					new Map([
						[
							element.id,
							{
								x: 110,
								y: 45,
								width: 1024,
								height: 1024,
								rotation: 30,
							},
						],
					])
				}
				onStatusChange={onStatusChange}
				onBoundsChange={onBoundsChange}
			/>
		);

		expect(renderText).toHaveBeenCalledTimes(1);
		expect(video.style.transform).toBe("rotate(30deg) scale(2, 2)");
		expect(Number.parseFloat(video.style.left)).toBeCloseTo(42.395_833, 6);
		expect(Number.parseFloat(video.style.top)).toBeCloseTo(30.462_963, 6);
	});

	it("keeps the previous native layer and bounds while a committed rerender is pending", async () => {
		const element = createTextElement();
		const track = createTrack({ element });
		const onStatusChange = vi.fn();
		const onBoundsChange = vi.fn();
		let resolveSecondRender!: (result: JianyingTextRuntimeRenderResult) => void;
		let secondRequest!: JianyingTextRuntimeRenderRequest;
		const secondRender = new Promise<JianyingTextRuntimeRenderResult>(
			(resolve) => {
				resolveSecondRender = resolve;
			}
		);
		renderText.mockImplementationOnce(async (request) =>
			createRenderResult({ request })
		);
		renderText.mockImplementationOnce((request) => {
			secondRequest = request;
			return secondRender;
		});
		const view = render(
			<JianyingTextPlaybackOverlay
				enabled
				activeElements={[{ element, track, mediaItem: null }]}
				canvasWidth={1920}
				canvasHeight={1080}
				fps={30}
				currentTime={1.4}
				isPlaying={false}
				previewTransforms={new Map()}
				onStatusChange={onStatusChange}
				onBoundsChange={onBoundsChange}
			/>
		);
		const video = await screen.findByLabelText("剪映原版动态花字播放预览");
		fireEvent.loadedData(video);
		onStatusChange.mockClear();
		onBoundsChange.mockClear();

		const updatedElement = {
			...element,
			x: 110,
			y: 45,
			width: 1024,
			height: 1024,
			rotation: 30,
		};
		view.rerender(
			<JianyingTextPlaybackOverlay
				enabled
				activeElements={[
					{
						element: updatedElement,
						track: createTrack({ element: updatedElement }),
						mediaItem: null,
					},
				]}
				canvasWidth={1920}
				canvasHeight={1080}
				fps={30}
				currentTime={1.4}
				isPlaying={false}
				previewTransforms={new Map()}
				onStatusChange={onStatusChange}
				onBoundsChange={onBoundsChange}
			/>
		);

		await waitFor(() => expect(renderText).toHaveBeenCalledTimes(2));
		expect(screen.getByLabelText("剪映原版动态花字播放预览")).toBe(video);
		expect(video.getAttribute("src")).toContain("a".repeat(64));
		expect(video.style.transform).toBe("rotate(30deg) scale(2, 2)");
		expect(onBoundsChange).not.toHaveBeenCalled();
		expect(onStatusChange).not.toHaveBeenCalledWith({
			elementId: element.id,
			status: "loading",
		});
		expect(onStatusChange).not.toHaveBeenCalledWith({
			elementId: element.id,
			status: "idle",
		});

		resolveSecondRender(
			createRenderResult({ request: secondRequest, digest: "b" })
		);
		await waitFor(() =>
			expect(video.getAttribute("src")).toContain("b".repeat(64))
		);
	});
});
