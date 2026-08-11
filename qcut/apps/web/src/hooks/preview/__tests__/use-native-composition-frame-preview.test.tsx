import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { platform } from "@qcut/platform-core";
import type { ActiveElement } from "@/components/editor/preview-panel/types";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import type { JianyingTextRuntimeRenderRequest } from "@/types/electron";
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
	fps = 30,
	tracks,
}: {
	enabled?: boolean;
	currentTime?: number;
	fps?: number;
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
		fps,
		backgroundColor: "#101010",
	};
}

function tracksWithSticker(): TimelineTrack[] {
	return [
		{
			id: "track-1",
			name: "Main",
			type: "media",
			elements: [mediaElement()],
		},
		{
			id: "sticker-track",
			name: "Stickers",
			type: "sticker",
			elements: [
				{
					id: "sticker-element",
					type: "sticker",
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
	];
}

function tracksWithJianyingText(): TimelineTrack[] {
	return [
		{
			id: "track-1",
			name: "Main",
			type: "media",
			elements: [mediaElement()],
		},
		{
			id: "text-track",
			name: "Text",
			type: "text",
			elements: [
				{
					id: "jianying-text",
					type: "text",
					name: "Jianying text",
					content: "动态花字",
					startTime: 0,
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
				},
			],
		},
	] as TimelineTrack[];
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
		window.electronAPI = undefined;
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

	it("keeps canonical text animations on the live preview renderer", () => {
		expect(
			canUseNativeCompositionPreview({
				activeElements: [
					activeVideo(),
					{
						element: {
							id: "text-animated",
							type: "text",
							name: "Animated title",
							startTime: 0,
							duration: 5,
							trimStart: 0,
							trimEnd: 0,
							textAnimations: {
								schemaVersion: 1,
								entrance: {
									timing: {
										duration: 0.6,
										delay: 0,
										easing: "easeOut",
									},
									sequence: {
										unit: "all",
										order: "forward",
										staggerRatio: 0,
										seed: 1,
									},
									target: "textAndBackground",
									effect: {
										kind: "scale",
										hiddenScale: 0.2,
										overshoot: 0.1,
										fade: true,
									},
								},
							},
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
		).toBe(false);
	});

	it("keeps exact local-font text on the browser renderer", () => {
		expect(
			canUseNativeCompositionPreview({
				activeElements: [
					activeVideo(),
					{
						element: {
							id: "text-local-font",
							type: "text",
							name: "Local font title",
							startTime: 0,
							duration: 5,
							trimStart: 0,
							trimEnd: 0,
							fontAsset: {
								kind: "local-font",
								source: "jianying-cache",
								assetId: `sha256:${"a".repeat(64)}`,
								cssFamily: "QCutLocal_aaaaaaaaaaaaaaaaaaaa",
								familyName: "文悦新青年体",
								fullName: "文悦新青年体 W8",
								postscriptName: "WenYue-XinQingNianTi-W8",
							},
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

	it("renders only the active Jianying frame for paused composition", async () => {
		const renderJianyingText = vi.fn(
			async (request: JianyingTextRuntimeRenderRequest) => ({
				requestId: request.requestId,
				resourceId: request.reference.resourceId,
				packageHash: request.reference.packageHash,
				templateDuration: 3,
				frameCount: request.frameCount,
				strategy: "preload-copy" as const,
				cacheHit: false,
				x: 714,
				y: 279,
				width: 512,
				height: 512,
				source: {
					kind: "image-sequence" as const,
					path: "/tmp/jianying/frame-%06d.png",
					frameRate: 30,
				},
			})
		);
		const cancelJianyingText = vi.fn(async () => true);
		window.electronAPI = {
			platform: "darwin",
			jianyingTextRuntime: {
				inspect: vi.fn(),
				render: renderJianyingText,
				cancel: cancelJianyingText,
			},
		} as never;
		const { result, unmount } = renderHook(() =>
			useNativeCompositionFramePreview(
				hookProps({ tracks: tracksWithJianyingText() })
			)
		);
		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(renderJianyingText).toHaveBeenCalledWith(
			expect.objectContaining({
				content: "动态花字",
				sourceStart: 0.4,
				elementDuration: 3,
				frameCount: 1,
				fps: 30,
			})
		);
		expect(buildTimelineAssLayers).toHaveBeenCalledWith(
			expect.objectContaining({
				excludedTextElementIds: new Set(["jianying-text"]),
			})
		);
		expect(renderVideoCompositionFramePreview).toHaveBeenCalledWith(
			expect.objectContaining({
				textRasterLayers: [
					expect.objectContaining({
						elementId: "jianying-text",
						x: 714,
						y: 279,
					}),
				],
			})
		);
		unmount();
		await waitFor(() => expect(cancelJianyingText).toHaveBeenCalled());
	});

	it("reuses export text and sticker sources and cleans its temp session", async () => {
		const tracks = tracksWithSticker();
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
		expect(vi.mocked(extractStickerSources).mock.calls[0]?.[8]).toBe(30);
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

	it("extracts sticker sources using a non-30 project frame rate", async () => {
		const props = hookProps({ tracks: tracksWithSticker(), fps: 24 });
		const { result } = renderHook(() =>
			useNativeCompositionFramePreview(props)
		);

		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(vi.mocked(extractStickerSources).mock.calls[0]?.[8]).toBe(24);
		expect(renderVideoCompositionFramePreview).toHaveBeenCalledWith(
			expect.objectContaining({ fps: 24 })
		);
	});

	it("invalidates cached sticker sources when the project frame rate changes", async () => {
		const props = hookProps({ tracks: tracksWithSticker(), fps: 24 });
		const { rerender } = renderHook(
			({ fps }) =>
				useNativeCompositionFramePreview({
					...props,
					fps,
				}),
			{ initialProps: { fps: 24 } }
		);
		await waitFor(() =>
			expect(vi.mocked(extractStickerSources)).toHaveBeenCalledTimes(1)
		);

		rerender({ fps: 60 });
		await waitFor(() =>
			expect(vi.mocked(extractStickerSources)).toHaveBeenCalledTimes(2)
		);
		expect(
			vi.mocked(extractStickerSources).mock.calls.map((call) => call[8])
		).toEqual([24, 60]);
		expect(createExportSession).toHaveBeenCalledTimes(1);
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
