import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { platform } from "@qcut/platform-core";
import type { ActiveElement } from "@/components/editor/preview-panel/types";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import { extractStickerSources } from "@/lib/export-cli/sources";
import { buildTimelineAssLayers } from "@/lib/export/export-engine-cli-text";
import {
	canUseNativeCompositionPreview,
	useNativeCompositionFramePreview,
} from "../use-native-composition-frame-preview";

vi.mock("@qcut/platform-core", () => ({ platform: vi.fn() }));
vi.mock("@/lib/export-cli/sources", () => ({
	extractVideoSources: vi.fn(async () => [
		{
			elementId: "element-1",
			trackId: "track-1",
			path: "/tmp/source.mp4",
			startTime: 0,
			duration: 5,
			trimStart: 0,
			trimEnd: 0,
			playbackRate: 1,
			reverse: false,
			freezeFrameDuration: 0,
		},
	]),
	extractImageSources: vi.fn(async () => []),
	extractStickerSources: vi.fn(async () => []),
	extractVideoTransitions: vi.fn(() => []),
}));
vi.mock("@/lib/export/export-engine-cli-text", () => ({
	buildTimelineAssLayers: vi.fn(() => ({
		layers: [],
		renderedTextElementIds: new Set<string>(),
	})),
}));

const renderVideoCompositionFramePreview = vi.fn();
const cancelVideoFramePreview = vi.fn();
const createExportSession = vi.fn();
const cleanupExportSession = vi.fn();
const createObjectURL = vi.fn(() => "blob:composition-preview");
const revokeObjectURL = vi.fn();

function mediaElement({
	overrides = {},
}: {
	overrides?: Partial<MediaElement>;
} = {}): MediaElement {
	return {
		id: "element-1",
		type: "media",
		mediaId: "media-1",
		name: "Video",
		startTime: 0,
		duration: 5,
		trimStart: 0,
		trimEnd: 0,
		...overrides,
	};
}

function activeVideo({
	overrides = {},
}: {
	overrides?: Partial<MediaElement>;
} = {}): ActiveElement {
	return {
		element: mediaElement({ overrides }),
		track: { id: "track-1", name: "Main", type: "media", elements: [] },
		mediaItem: {
			id: "media-1",
			name: "Video",
			type: "video",
			file: new File([], "source.mp4", { type: "video/mp4" }),
			duration: 5,
			localPath: "/tmp/source.mp4",
		} as ActiveElement["mediaItem"],
	};
}

function hookProps({
	enabled = true,
	currentTime = 0.4,
	tracks,
}: {
	enabled?: boolean;
	currentTime?: number;
	tracks?: TimelineTrack[];
} = {}) {
	return {
		enabled,
		tracks:
			tracks ??
			([
				{
					id: "track-1",
					type: "media" as const,
					elements: [mediaElement()],
				},
			] as TimelineTrack[]),
		mediaItems: [activeVideo().mediaItem!],
		currentTime,
		totalDuration: 5,
		width: 1920,
		height: 1080,
		fps: 30,
		backgroundColor: "#101010",
	};
}

describe("native composition frame preview", () => {
	beforeEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
		vi.mocked(platform).mockReturnValue({
			isElectron: true,
			ffmpeg: {
				renderVideoCompositionFramePreview,
				cancelVideoFramePreview,
				createExportSession,
				cleanupExportSession,
			},
		} as never);
		createExportSession.mockResolvedValue({
			sessionId: "preview-session",
			framesDir: "/tmp/preview-session",
		});
		cleanupExportSession.mockResolvedValue(true);
		vi.mocked(extractStickerSources).mockResolvedValue([]);
		vi.mocked(buildTimelineAssLayers).mockReturnValue({
			layers: [],
			renderedTextElementIds: new Set<string>(),
		});
		renderVideoCompositionFramePreview.mockImplementation(
			async ({
				requestId,
				timelineTime,
			}: {
				requestId: string;
				timelineTime: number;
			}) => ({
				requestId,
				pngData: new Uint8Array([137, 80, 78, 71]),
				cacheHit: false,
				timelineTime,
			})
		);
		cancelVideoFramePreview.mockResolvedValue(false);
		URL.createObjectURL = createObjectURL;
		URL.revokeObjectURL = revokeObjectURL;
	});

	it("enables exact preview for edited media or an active transition", () => {
		expect(
			canUseNativeCompositionPreview({
				activeElements: [
					activeVideo({
						overrides: {
							adjustments: {
								brightness: 10,
								contrast: 0,
								saturation: 0,
								temperature: 0,
								tint: 0,
								sharpness: 0,
								fade: 0,
								vignette: 0,
							},
						},
					}),
				],
				hasActiveTransition: false,
			})
		).toBe(true);
		expect(
			canUseNativeCompositionPreview({
				activeElements: [activeVideo()],
				hasActiveTransition: true,
			})
		).toBe(true);
		expect(
			canUseNativeCompositionPreview({
				activeElements: [
					activeVideo(),
					{
						element: {
							id: "text-1",
							type: "text",
							name: "Title",
							startTime: 0,
							duration: 5,
							trimStart: 0,
							trimEnd: 0,
						} as ActiveElement["element"],
						track: {
							id: "text-track",
							name: "Text",
							type: "text",
							elements: [],
						},
						mediaItem: null,
					},
				],
				hasActiveTransition: true,
			})
		).toBe(true);
		expect(
			canUseNativeCompositionPreview({
				activeElements: [
					activeVideo(),
					{
						element: {
							id: "remotion-1",
							type: "remotion",
							name: "Motion graphic",
							startTime: 0,
							duration: 5,
							trimStart: 0,
							trimEnd: 0,
						} as ActiveElement["element"],
						track: {
							id: "remotion-track",
							name: "Motion",
							type: "remotion",
							elements: [],
						},
						mediaItem: null,
					},
				],
				hasActiveTransition: true,
			})
		).toBe(false);
	});

	it("disables the static composition frame while an element is selected", () => {
		expect(
			canUseNativeCompositionPreview({
				activeElements: [activeVideo()],
				hasActiveTransition: true,
				hasSelection: true,
			})
		).toBe(false);
	});

	it("renders the exact timeline frame and exposes its object URL", async () => {
		const { result } = renderHook(() =>
			useNativeCompositionFramePreview(hookProps())
		);
		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(renderVideoCompositionFramePreview).toHaveBeenCalledWith(
			expect.objectContaining({
				timelineTime: 0.4,
				duration: 5,
				width: 1920,
				height: 1080,
				backgroundColor: "#101010",
			})
		);
		expect(result.current.url).toBe("blob:composition-preview");
	});

	it("reuses export text and sticker sources and cleans its temp session", async () => {
		const tracks = [
			{
				id: "track-1",
				name: "Main",
				type: "media" as const,
				elements: [mediaElement()],
			},
			{
				id: "sticker-track",
				name: "Stickers",
				type: "sticker" as const,
				elements: [
					{
						id: "sticker-element",
						type: "sticker" as const,
						name: "Sticker",
						stickerId: "sticker-1",
						mediaId: "sticker-media",
						startTime: 0,
						duration: 5,
						trimStart: 0,
						trimEnd: 0,
					},
				],
			},
		] as TimelineTrack[];
		vi.mocked(extractStickerSources).mockResolvedValue([
			{
				id: "sticker-1",
				path: "/tmp/sticker.png",
				x: 10,
				y: 20,
				width: 80,
				height: 60,
				startTime: 0,
				endTime: 5,
				zIndex: 1,
			},
		]);
		vi.mocked(buildTimelineAssLayers).mockReturnValue({
			layers: [
				{
					content: "[Script Info]",
					blendMode: "normal",
					trackOrder: 0,
					elementOrder: 0,
				},
			],
			renderedTextElementIds: new Set(["text-1"]),
		});

		const { result, unmount } = renderHook(() =>
			useNativeCompositionFramePreview(hookProps({ tracks }))
		);
		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(createExportSession).toHaveBeenCalledTimes(1);
		expect(renderVideoCompositionFramePreview).toHaveBeenCalledWith(
			expect.objectContaining({
				stickerSources: [expect.objectContaining({ id: "sticker-1" })],
				textAssLayers: [expect.objectContaining({ content: "[Script Info]" })],
			})
		);
		unmount();
		await waitFor(() =>
			expect(cleanupExportSession).toHaveBeenCalledWith("preview-session")
		);
	});

	it("cancels stale work when the playhead changes", async () => {
		renderVideoCompositionFramePreview.mockReturnValue(new Promise(() => {}));
		const { rerender } = renderHook(
			({ currentTime }) =>
				useNativeCompositionFramePreview(hookProps({ currentTime })),
			{ initialProps: { currentTime: 0.4 } }
		);
		await waitFor(() =>
			expect(renderVideoCompositionFramePreview).toHaveBeenCalledTimes(1)
		);
		rerender({ currentTime: 0.8 });
		await waitFor(() => expect(cancelVideoFramePreview).toHaveBeenCalled());
	});
});
