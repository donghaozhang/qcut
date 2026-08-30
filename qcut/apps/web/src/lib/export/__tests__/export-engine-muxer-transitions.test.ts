import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaItem } from "@/stores/media/media-store-types";
import type {
	ClipTransition,
	MediaElement,
	TimelineTrack,
} from "@/types/timeline";
import { resolveJianyingTransition } from "../../../../../../electron/jianying-transition-catalog";

const mocks = vi.hoisted(() => ({
	add: vi.fn(async () => {}),
	finalize: vi.fn(async () => {}),
	start: vi.fn(async () => {}),
	addVideoTrack: vi.fn(),
	addAudioTrack: vi.fn(),
	createExportSession: vi.fn(async () => ({
		sessionId: "session-1",
		frameDir: "/tmp/qcut-export/session-1/frames",
		outputDir: "/tmp/qcut-export/session-1/output",
	})),
	readOutputFile: vi.fn(async () => new ArrayBuffer(8)),
	cleanupExportSession: vi.fn(async () => true),
	writeFile: vi.fn(async () => true),
	renderFrame: vi.fn(async () => {}),
}));

vi.mock("mediabunny", () => ({
	Output: class {
		start = mocks.start;
		finalize = mocks.finalize;
		addVideoTrack = mocks.addVideoTrack;
		addAudioTrack = mocks.addAudioTrack;
	},
	Mp4OutputFormat: class {},
	BufferTarget: class {
		buffer = new ArrayBuffer(100);
	},
	VideoSampleSource: class {
		add = mocks.add;
	},
	VideoSample: class {
		close = vi.fn();
	},
	AudioBufferSource: class {
		add = mocks.add;
	},
}));

// The engine converts frames itself; keep the converter out of jsdom's way.
vi.mock("../export-canvas-yuv", () => ({
	EXPORT_VIDEO_COLOR_SPACE: {
		primaries: "bt709",
		transfer: "bt709",
		matrix: "bt709",
		fullRange: false,
	},
	createCanvasYuvConverter: vi.fn(
		({ width, height }: { width: number; height: number }) => ({
			kind: "cpu" as const,
			convert: () => ({
				data: new Uint8Array((width * height * 3) / 2),
				codedWidth: width,
				codedHeight: height,
			}),
			dispose: vi.fn(),
		})
	),
}));

vi.mock("@qcut/platform-core", () => ({
	platform: () => ({
		isElectron: true,
		ffmpeg: {
			createExportSession: mocks.createExportSession,
			readOutputFile: mocks.readOutputFile,
			cleanupExportSession: mocks.cleanupExportSession,
		},
		files: { writeFile: mocks.writeFile },
	}),
}));

vi.mock("../export-engine-renderer", () => ({
	renderFrame: mocks.renderFrame,
	renderOverlayStickers: vi.fn(),
	destroyExportCompositor: vi.fn(),
}));

vi.mock("@/lib/ffmpeg/ffmpeg-video-recorder", () => ({
	FFmpegVideoRecorder: class {},
	isFFmpegExportEnabled: () => false,
}));

vi.mock("@/lib/debug/debug-config", () => ({
	debugLog: vi.fn(),
	debugError: vi.fn(),
	debugWarn: vi.fn(),
}));

vi.mock("@/stores/stickers-overlay-store", () => ({
	useStickersOverlayStore: {
		getState: () => ({
			getStickersForExport: () => [],
			getVisibleStickersAtTime: () => [],
		}),
	},
}));

vi.mock("@/stores/media/media-store", () => ({
	useMediaStore: { getState: () => ({ mediaItems: [] }) },
}));

vi.mock("@/stores/ai/effects-store", () => ({
	useEffectsStore: { getState: () => ({ getElementEffects: () => [] }) },
}));

vi.mock("@/lib/stickers/sticker-export-helper", () => ({
	preloadStickerImages: vi.fn(),
	renderStickersToCanvas: vi.fn(),
}));

vi.mock("@/types/export", () => ({
	FORMAT_INFO: { mp4: { extension: "mp4" } },
	ExportPurpose: { PREVIEW: "preview", FINAL: "final" },
	shouldIncludeAudio: (settings: { includeAudio?: boolean }) =>
		settings.includeAudio ?? true,
}));

import { ExportEngineMuxer } from "../export-engine-muxer";

const WIDTH = 640;
const HEIGHT = 360;

function createCanvas(): HTMLCanvasElement {
	const canvas = document.createElement("canvas");
	const ctx = {
		clearRect: vi.fn(),
		fillRect: vi.fn(),
		drawImage: vi.fn(),
		imageSmoothingEnabled: true,
		imageSmoothingQuality: "high",
		globalAlpha: 1,
		fillStyle: "",
	} as unknown as CanvasRenderingContext2D;
	canvas.getContext = (() => ctx) as unknown as typeof canvas.getContext;
	return canvas;
}

function clip({
	id,
	startTime,
	mediaId,
}: {
	id: string;
	startTime: number;
	mediaId: string;
}): MediaElement {
	return {
		id,
		name: id,
		type: "media",
		mediaId,
		startTime,
		duration: 1,
		trimStart: 0,
		trimEnd: 0,
	};
}

function videoItem({ id }: { id: string }): MediaItem {
	return {
		id,
		name: `${id}.mp4`,
		type: "video",
		file: new File(["x"], `${id}.mp4`, { type: "video/mp4" }),
		url: `blob:${id}`,
	};
}

function tracksWith({
	transitions,
}: {
	transitions: ClipTransition[];
}): TimelineTrack[] {
	return [
		{
			id: "main",
			name: "Media",
			type: "media",
			elements: [
				clip({ id: "a", startTime: 0, mediaId: "m1" }),
				clip({ id: "b", startTime: 1, mediaId: "m2" }),
			],
			transitions,
		},
	];
}

function createEngine({ tracks }: { tracks: TimelineTrack[] }) {
	return new ExportEngineMuxer(
		createCanvas(),
		{
			format: "mp4",
			quality: "720p",
			filename: "test.mp4",
			width: WIDTH,
			height: HEIGHT,
			frameRate: 30,
			includeAudio: false,
		} as never,
		tracks,
		[videoItem({ id: "m1" }), videoItem({ id: "m2" })],
		2
	);
}

const local = resolveJianyingTransition({ value: "jianying-local-traverse-3" });
if (!local) throw new Error("Missing local Jianying transition fixture");

const localTransition: ClipTransition = {
	id: "ab",
	fromElementId: "a",
	toElementId: "b",
	presetId: local.id,
	engine: "jianying-local",
	packageHash: local.metadataMd5,
	type: "dissolve",
	duration: 0.5,
	easing: "easeInOut",
};

describe("ExportEngineMuxer clip transitions", () => {
	const renderTimeline = vi.fn(
		async (request: { outputPath: string; transitions: unknown[] }) => ({
			outputPath: request.outputPath,
			fps: 30,
			width: WIDTH,
			height: HEIGHT,
			frameCount: 60,
			transitionCount: request.transitions.length,
		})
	);

	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("electronAPI", {
			jianyingTransitions: { renderTimeline },
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("routes jianying-local seams through the native timeline pass after muxing", async () => {
		const engine = createEngine({
			tracks: tracksWith({ transitions: [localTransition] }),
		});
		const statuses: string[] = [];

		const blob = await engine.export((_progress, status) => {
			statuses.push(status);
		});

		expect(mocks.finalize).toHaveBeenCalledOnce();
		expect(mocks.writeFile).toHaveBeenCalledWith(
			"/tmp/qcut-export/session-1/output/canvas-export.mp4",
			expect.any(ArrayBuffer)
		);
		expect(renderTimeline).toHaveBeenCalledWith({
			inputPath: "/tmp/qcut-export/session-1/output/canvas-export.mp4",
			outputPath:
				"/tmp/qcut-export/session-1/output/canvas-export-jianying.mp4",
			transitions: [
				{
					presetId: local.id,
					packageHash: local.metadataMd5,
					cutTime: 1,
					duration: 0.5,
				},
			],
			fps: 30,
			width: WIDTH,
			height: HEIGHT,
			overwrite: true,
		});
		expect(mocks.readOutputFile).toHaveBeenCalledWith(
			"/tmp/qcut-export/session-1/output/canvas-export-jianying.mp4"
		);
		expect(mocks.cleanupExportSession).toHaveBeenCalledWith("session-1");
		expect(blob.size).toBe(8);
		expect(statuses).toContain("已用本机剪映引擎渲染 1 个转场");
		expect(statuses.at(-1)).toBe("Export complete!");
	});

	it("fails closed before encoding when a QCut transition cannot render on canvas", async () => {
		const engine = createEngine({
			tracks: tracksWith({
				transitions: [
					{
						id: "ab",
						fromElementId: "a",
						toElementId: "b",
						presetId: "cube-left",
						type: "cube",
						direction: "left",
						duration: 0.5,
						easing: "easeInOut",
					},
				],
			}),
		});

		await expect(engine.export()).rejects.toThrow(
			/"cube-left" \(cube\) needs 3D perspective transforms/
		);
		expect(mocks.start).not.toHaveBeenCalled();
		expect(engine.isExportInProgress()).toBe(false);
	});

	it("refuses jianying-local seams without the desktop bridge instead of hard cutting", async () => {
		vi.stubGlobal("electronAPI", undefined);
		const engine = createEngine({
			tracks: tracksWith({ transitions: [localTransition] }),
		});

		await expect(engine.export()).rejects.toThrow(
			"本机剪映转场需要 QCut 桌面版"
		);
		expect(mocks.start).not.toHaveBeenCalled();
	});

	it("renders canvas transitions inline without touching the native pass", async () => {
		const engine = createEngine({
			tracks: tracksWith({
				transitions: [
					{
						id: "ab",
						fromElementId: "a",
						toElementId: "b",
						presetId: "dissolve",
						type: "dissolve",
						duration: 0.5,
						easing: "easeInOut",
					},
				],
			}),
		});

		const blob = await engine.export();

		expect(blob.size).toBe(100);
		expect(mocks.renderFrame).toHaveBeenCalledTimes(60);
		expect(mocks.createExportSession).not.toHaveBeenCalled();
		expect(renderTimeline).not.toHaveBeenCalled();
	});

	it("keeps transition-free exports on the plain muxer path", async () => {
		const engine = createEngine({ tracks: tracksWith({ transitions: [] }) });

		const blob = await engine.export();

		expect(blob.size).toBe(100);
		expect(mocks.createExportSession).not.toHaveBeenCalled();
		expect(mocks.writeFile).not.toHaveBeenCalled();
		expect(renderTimeline).not.toHaveBeenCalled();
	});
});
