import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
	ClaudeBatchAddElementRequest,
	ClaudeBatchAddResponse,
	ClaudeElement,
	ClaudeTimeline,
} from "../../../../../electron/types/claude-api";
import { setupClaudeTimelineBridge } from "@/lib/claude-bridge/claude-timeline-bridge";
import { initPlatform } from "@qcut/platform-core";
import { createDesktopAdapter } from "@qcut/platform-desktop";
import type { MediaItem } from "@/stores/media/media-store";

const storeMocks = vi.hoisted(() => {
	const timelineStoreState = {
		tracks: [] as Array<{
			id: string;
			name: string;
			type: string;
			elements: Array<{ id: string; type: string }>;
		}>,
		findOrCreateTrack: vi.fn(),
		addElementToTrack: vi.fn(),
		removeElementFromTrack: vi.fn(),
		pushHistory: vi.fn(),
	};

	const mediaStoreState: { mediaItems: MediaItem[] } = {
		mediaItems: [],
	};

	const projectStoreState: {
		activeProject: { id: string } | null;
	} = {
		activeProject: null,
	};

	return {
		timelineStoreState,
		mediaStoreState,
		projectStoreState,
		timelineGetState: vi.fn(() => timelineStoreState),
		mediaGetState: vi.fn(() => mediaStoreState),
		projectGetState: vi.fn(() => projectStoreState),
	};
});

const syncProjectFolderMock = vi.hoisted(() => vi.fn());

vi.mock("@/stores/timeline/timeline-store", () => ({
	useTimelineStore: {
		getState: storeMocks.timelineGetState,
	},
}));

vi.mock("@/stores/media/media-store", () => ({
	useMediaStore: {
		getState: storeMocks.mediaGetState,
	},
}));

vi.mock("@/stores/project-store", () => ({
	useProjectStore: {
		getState: storeMocks.projectGetState,
	},
}));

vi.mock("@/lib/project/project-folder-sync", () => ({
	syncProjectFolder: syncProjectFolderMock,
}));

const debugMocks = vi.hoisted(() => ({
	debugLog: vi.fn(),
	debugWarn: vi.fn(),
	debugError: vi.fn(),
}));

vi.mock("@/lib/debug/debug-config", () => debugMocks);

vi.mock("@/types/timeline", () => ({
	validateElementTrackCompatibility: vi.fn(() => ({ isValid: true })),
}));

type AddElementHandler = (
	element: Partial<ClaudeElement>
) => void | Promise<void>;

function setupTimelineBridgeWithHandlers({
	withProjectFolder = false,
}: {
	withProjectFolder?: boolean;
} = {}): {
	addElementHandler: AddElementHandler;
	timelineApi: {
		onRequest: ReturnType<typeof vi.fn>;
		onApply: ReturnType<typeof vi.fn>;
		onAddElement: ReturnType<typeof vi.fn>;
		onUpdateElement: ReturnType<typeof vi.fn>;
		onRemoveElement: ReturnType<typeof vi.fn>;
		sendResponse: ReturnType<typeof vi.fn>;
		removeListeners: ReturnType<typeof vi.fn>;
	};
} {
	let addElementHandler: AddElementHandler | null = null;

	const timelineApi = {
		onRequest: vi.fn((_callback: () => void) => {}),
		onApply: vi.fn((_callback: (timeline: ClaudeTimeline) => void) => {}),
		onAddElement: vi.fn(
			(callback: (element: Partial<ClaudeElement>) => void) => {
				addElementHandler = callback;
			}
		),
		onUpdateElement: vi.fn(
			(
				_callback: (data: {
					elementId: string;
					changes: Partial<ClaudeElement>;
				}) => void
			) => {}
		),
		onRemoveElement: vi.fn((_callback: (elementId: string) => void) => {}),
		onSplitElement: vi.fn((_callback: (...args: unknown[]) => void) => {}),
		onMoveElement: vi.fn((_callback: (...args: unknown[]) => void) => {}),
		onSelectElements: vi.fn((_callback: (...args: unknown[]) => void) => {}),
		onGetSelection: vi.fn((_callback: (...args: unknown[]) => void) => {}),
		onClearSelection: vi.fn((_callback: (...args: unknown[]) => void) => {}),
		onExecuteCuts: vi.fn((_callback: (...args: unknown[]) => void) => {}),
		sendExecuteCutsResponse: vi.fn(),
		onDeleteRange: vi.fn((_callback: (...args: unknown[]) => void) => {}),
		sendDeleteRangeResponse: vi.fn(),
		sendResponse: vi.fn(),
		sendSplitResponse: vi.fn(),
		sendSelectionResponse: vi.fn(),
		removeListeners: vi.fn(),
	};

	const electronAPI: {
		claude: {
			timeline: typeof timelineApi;
		};
		projectFolder?: object;
	} = {
		claude: {
			timeline: timelineApi,
		},
	};
	if (withProjectFolder) {
		electronAPI.projectFolder = {};
	}

	(
		window as unknown as {
			electronAPI?: {
				claude?: {
					timeline?: typeof timelineApi;
				};
				projectFolder?: object;
			};
		}
	).electronAPI = electronAPI;

	// Initialize platform adapter so platform() calls in the bridge resolve correctly
	initPlatform(createDesktopAdapter());

	setupClaudeTimelineBridge();

	if (!addElementHandler) {
		throw new Error("addElement handler was not registered");
	}
	const registeredAddElementHandler: AddElementHandler = addElementHandler;

	return {
		addElementHandler: registeredAddElementHandler,
		timelineApi,
	};
}

describe("setupClaudeTimelineBridge - add element", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	beforeEach(() => {
		vi.clearAllMocks();
		syncProjectFolderMock.mockReset();

		storeMocks.timelineStoreState.findOrCreateTrack.mockReset();
		storeMocks.timelineStoreState.addElementToTrack.mockReset();
		storeMocks.timelineStoreState.removeElementFromTrack.mockReset();

		storeMocks.timelineStoreState.findOrCreateTrack.mockImplementation(
			(trackType: string) => `${trackType}-track`
		);
		storeMocks.timelineStoreState.tracks = [];

		storeMocks.mediaStoreState.mediaItems = [];
		storeMocks.projectStoreState.activeProject = null;

		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	it("adds a media element when sourceName matches imported media", async () => {
		storeMocks.mediaStoreState.mediaItems = [
			{
				id: "media-1",
				name: "clip-a.mp4",
				type: "video",
				file: new File([""], "clip-a.mp4"),
				duration: 12,
			},
		];

		const { addElementHandler } = setupTimelineBridgeWithHandlers();

		await addElementHandler({
			type: "video",
			sourceName: "clip-a.mp4",
			startTime: 2,
			endTime: 6,
		});

		expect(
			storeMocks.timelineStoreState.findOrCreateTrack
		).toHaveBeenCalledWith("media");
		expect(
			storeMocks.timelineStoreState.addElementToTrack
		).toHaveBeenCalledWith("media-track", {
			type: "media",
			name: "clip-a.mp4",
			mediaId: "media-1",
			startTime: 2,
			duration: 4,
			trimStart: 0,
			trimEnd: 0,
		});
	});

	it("adds a media element by sourceId and falls back to media duration", async () => {
		storeMocks.mediaStoreState.mediaItems = [
			{
				id: "media-2",
				name: "clip-b.mp4",
				type: "video",
				file: new File([""], "clip-b.mp4"),
				duration: 9,
			},
		];

		const { addElementHandler } = setupTimelineBridgeWithHandlers();

		await addElementHandler({
			type: "media",
			sourceId: "media-2",
			startTime: 3,
		});

		expect(
			storeMocks.timelineStoreState.addElementToTrack
		).toHaveBeenCalledWith("media-track", {
			type: "media",
			name: "clip-b.mp4",
			mediaId: "media-2",
			startTime: 3,
			duration: 9,
			trimStart: 0,
			trimEnd: 0,
		});
	});

	it("adds a media element using deterministic Claude sourceId", async () => {
		const filename = "clip-c.mp4";
		const bytes = new TextEncoder().encode(filename);
		const binary = Array.from(bytes, (value) =>
			String.fromCharCode(value)
		).join("");
		const sourceId = `media_${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")}`;

		storeMocks.mediaStoreState.mediaItems = [
			{
				id: "renderer-media-3",
				name: filename,
				type: "video",
				file: new File([""], filename),
				duration: 8,
			},
		];

		const { addElementHandler } = setupTimelineBridgeWithHandlers();

		await addElementHandler({
			type: "video",
			sourceId,
			startTime: 0,
			endTime: 4,
		});

		expect(
			storeMocks.timelineStoreState.addElementToTrack
		).toHaveBeenCalledWith("media-track", {
			type: "media",
			name: filename,
			mediaId: "renderer-media-3",
			startTime: 0,
			duration: 4,
			trimStart: 0,
			trimEnd: 0,
		});
	});

	it("adds a text element with defaults when content is missing", async () => {
		const { addElementHandler } = setupTimelineBridgeWithHandlers();

		await addElementHandler({
			type: "text",
			startTime: 1,
			endTime: 4,
		});

		expect(
			storeMocks.timelineStoreState.findOrCreateTrack
		).toHaveBeenCalledWith("text");
		expect(
			storeMocks.timelineStoreState.addElementToTrack
		).toHaveBeenCalledWith("text-track", {
			type: "text",
			name: "Text",
			content: "Text",
			startTime: 1,
			duration: 3,
			trimStart: 0,
			trimEnd: 0,
			fontSize: 48,
			fontFamily: "Inter",
			color: "#ffffff",
			backgroundColor: "transparent",
			textAlign: "center",
			fontWeight: "normal",
			fontStyle: "normal",
			textDecoration: "none",
			x: 0.5,
			y: 0.5,
			rotation: 0,
			opacity: 1,
		});
	});

	it("syncs project folder once and retries media resolution", async () => {
		storeMocks.projectStoreState.activeProject = { id: "proj-1" };
		syncProjectFolderMock.mockImplementation(async () => {
			storeMocks.mediaStoreState.mediaItems = [
				{
					id: "synced-image-1",
					name: "missing-image.png",
					type: "image",
					file: new File([""], "missing-image.png"),
					duration: 3,
				},
			];
			return {
				imported: 1,
				skipped: 0,
				errors: [],
				scanTime: 5,
				totalDiskFiles: 1,
			};
		});

		const { addElementHandler } = setupTimelineBridgeWithHandlers({
			withProjectFolder: true,
		});

		await addElementHandler({
			type: "image",
			sourceName: "missing-image.png",
			startTime: 0,
			endTime: 3,
		});

		expect(syncProjectFolderMock).toHaveBeenCalledTimes(1);
		expect(syncProjectFolderMock).toHaveBeenCalledWith("proj-1");
		expect(
			storeMocks.timelineStoreState.addElementToTrack
		).toHaveBeenCalledWith("media-track", {
			type: "media",
			name: "missing-image.png",
			mediaId: "synced-image-1",
			startTime: 0,
			duration: 3,
			trimStart: 0,
			trimEnd: 0,
		});
	});

	it("does not add media when referenced source does not exist", async () => {
		const { addElementHandler } = setupTimelineBridgeWithHandlers();

		await addElementHandler({
			type: "image",
			sourceName: "missing-image.png",
			startTime: 0,
			endTime: 3,
		});

		expect(
			storeMocks.timelineStoreState.addElementToTrack
		).not.toHaveBeenCalled();
		expect(debugMocks.debugWarn).toHaveBeenCalledWith(
			"[ClaudeTimelineBridge] Media not found:",
			"missing-image.png"
		);
	});
});

// ---------------------------------------------------------------------------
// Batch Add Elements
// ---------------------------------------------------------------------------

type BatchAddHandler = (data: {
	requestId: string;
	elements: ClaudeBatchAddElementRequest[];
}) => Promise<void>;

function setupBatchAddBridge({
	withProjectFolder = false,
}: {
	withProjectFolder?: boolean;
} = {}): {
	batchAddHandler: BatchAddHandler;
	sendBatchAddResponse: ReturnType<typeof vi.fn>;
} {
	let batchAddHandler: BatchAddHandler | null = null;
	const sendBatchAddResponse = vi.fn();

	const timelineApi = {
		onRequest: vi.fn(),
		onApply: vi.fn(),
		onAddElement: vi.fn(),
		onUpdateElement: vi.fn(),
		onRemoveElement: vi.fn(),
		onSplitElement: vi.fn(),
		onMoveElement: vi.fn(),
		onSelectElements: vi.fn(),
		onGetSelection: vi.fn(),
		onClearSelection: vi.fn(),
		onExecuteCuts: vi.fn(),
		sendExecuteCutsResponse: vi.fn(),
		onDeleteRange: vi.fn(),
		sendDeleteRangeResponse: vi.fn(),
		sendResponse: vi.fn(),
		sendSplitResponse: vi.fn(),
		sendSelectionResponse: vi.fn(),
		removeListeners: vi.fn(),
		onBatchAddElements: vi.fn(
			(
				callback: (data: {
					requestId: string;
					elements: ClaudeBatchAddElementRequest[];
				}) => Promise<void>
			) => {
				batchAddHandler = callback;
			}
		),
		sendBatchAddElementsResponse: sendBatchAddResponse,
		onBatchUpdateElements: vi.fn(),
		sendBatchUpdateElementsResponse: vi.fn(),
		onBatchDeleteElements: vi.fn(),
		sendBatchDeleteElementsResponse: vi.fn(),
		onArrange: vi.fn(),
		sendArrangeResponse: vi.fn(),
	};

	const electronAPI: Record<string, unknown> = {
		claude: { timeline: timelineApi },
	};
	if (withProjectFolder) {
		electronAPI.projectFolder = {};
	}

	(window as unknown as { electronAPI: typeof electronAPI }).electronAPI =
		electronAPI;

	// Re-initialize platform adapter so platform() calls resolve correctly
	initPlatform(createDesktopAdapter());

	setupClaudeTimelineBridge();

	if (!batchAddHandler) {
		throw new Error("batchAddElements handler was not registered");
	}

	return {
		batchAddHandler: batchAddHandler as BatchAddHandler,
		sendBatchAddResponse,
	};
}

describe("setupClaudeTimelineBridge - batch add elements", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	beforeEach(() => {
		vi.clearAllMocks();
		syncProjectFolderMock.mockReset();

		storeMocks.timelineStoreState.findOrCreateTrack.mockReset();
		storeMocks.timelineStoreState.addElementToTrack.mockReset();
		storeMocks.timelineStoreState.removeElementFromTrack.mockReset();
		storeMocks.timelineStoreState.pushHistory.mockReset();

		storeMocks.timelineStoreState.findOrCreateTrack.mockImplementation(
			(trackType: string) => `${trackType}-track`
		);
		storeMocks.timelineStoreState.addElementToTrack.mockReturnValue("elem-1");
		storeMocks.timelineStoreState.tracks = [
			{ id: "track-1", name: "Video", type: "media", elements: [] },
			{ id: "track-2", name: "Text", type: "text", elements: [] },
		];

		storeMocks.mediaStoreState.mediaItems = [];
		storeMocks.projectStoreState.activeProject = null;

		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	it("batch adds media elements when media is already in store", async () => {
		storeMocks.mediaStoreState.mediaItems = [
			{
				id: "media-1",
				name: "clip-a.mp4",
				type: "video",
				file: new File([""], "clip-a.mp4"),
				duration: 10,
			},
			{
				id: "media-2",
				name: "clip-b.mp4",
				type: "video",
				file: new File([""], "clip-b.mp4"),
				duration: 8,
			},
		];

		const { batchAddHandler, sendBatchAddResponse } = setupBatchAddBridge();

		await batchAddHandler({
			requestId: "req-1",
			elements: [
				{
					type: "video",
					trackId: "track-1",
					startTime: 0,
					duration: 5,
					sourceName: "clip-a.mp4",
				},
				{
					type: "video",
					trackId: "track-1",
					startTime: 5,
					duration: 4,
					sourceName: "clip-b.mp4",
				},
			],
		});

		expect(storeMocks.timelineStoreState.pushHistory).toHaveBeenCalledOnce();
		expect(
			storeMocks.timelineStoreState.addElementToTrack
		).toHaveBeenCalledTimes(2);

		const response: ClaudeBatchAddResponse =
			sendBatchAddResponse.mock.calls[0][1];
		expect(response.failedCount).toBe(0);
		expect(response.added).toHaveLength(2);
		expect(response.added[0].success).toBe(true);
		expect(response.added[1].success).toBe(true);
	});

	it("syncs project media before resolving batch elements", async () => {
		storeMocks.projectStoreState.activeProject = { id: "proj-1" };

		// Media not in store initially — simulates batch import to disk only
		syncProjectFolderMock.mockImplementation(async () => {
			storeMocks.mediaStoreState.mediaItems = [
				{
					id: "synced-1",
					name: "imported-video.mp4",
					type: "video",
					file: new File([""], "imported-video.mp4"),
					duration: 15,
				},
			];
		});

		const { batchAddHandler, sendBatchAddResponse } = setupBatchAddBridge({
			withProjectFolder: true,
		});

		await batchAddHandler({
			requestId: "req-2",
			elements: [
				{
					type: "video",
					trackId: "track-1",
					startTime: 0,
					duration: 10,
					sourceName: "imported-video.mp4",
				},
			],
		});

		expect(syncProjectFolderMock).toHaveBeenCalledWith("proj-1");
		const response: ClaudeBatchAddResponse =
			sendBatchAddResponse.mock.calls[0][1];
		expect(response.failedCount).toBe(0);
		expect(response.added[0].success).toBe(true);
	});

	it("fails with 'Media source could not be resolved' when media not found", async () => {
		// No media in store, no project to sync
		const { batchAddHandler, sendBatchAddResponse } = setupBatchAddBridge();

		await batchAddHandler({
			requestId: "req-3",
			elements: [
				{
					type: "video",
					trackId: "track-1",
					startTime: 0,
					duration: 5,
					sourceName: "nonexistent.mp4",
				},
			],
		});

		const response: ClaudeBatchAddResponse =
			sendBatchAddResponse.mock.calls[0][1];
		expect(response.failedCount).toBe(1);
		expect(response.added[0].success).toBe(false);
		expect(response.added[0].error).toBe("Media source could not be resolved");
	});

	it("resolves batch elements by mediaId", async () => {
		storeMocks.mediaStoreState.mediaItems = [
			{
				id: "media-direct",
				name: "direct.mp4",
				type: "video",
				file: new File([""], "direct.mp4"),
				duration: 7,
			},
		];

		const { batchAddHandler, sendBatchAddResponse } = setupBatchAddBridge();

		await batchAddHandler({
			requestId: "req-4",
			elements: [
				{
					type: "media",
					trackId: "track-1",
					startTime: 0,
					duration: 5,
					mediaId: "media-direct",
				},
			],
		});

		const response: ClaudeBatchAddResponse =
			sendBatchAddResponse.mock.calls[0][1];
		expect(response.added[0].success).toBe(true);
		expect(
			storeMocks.timelineStoreState.addElementToTrack
		).toHaveBeenCalledWith(
			"track-1",
			expect.objectContaining({ mediaId: "media-direct" }),
			{ pushHistory: false, selectElement: false }
		);
	});

	it("resolves batch elements by deterministic sourceId", async () => {
		const filename = "gen-video.mp4";
		const bytes = new TextEncoder().encode(filename);
		const binary = Array.from(bytes, (v) => String.fromCharCode(v)).join("");
		const sourceId = `media_${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")}`;

		storeMocks.mediaStoreState.mediaItems = [
			{
				id: "renderer-gen-1",
				name: filename,
				type: "video",
				file: new File([""], filename),
				duration: 6,
			},
		];

		const { batchAddHandler, sendBatchAddResponse } = setupBatchAddBridge();

		await batchAddHandler({
			requestId: "req-5",
			elements: [
				{
					type: "video",
					trackId: "track-1",
					startTime: 0,
					duration: 6,
					sourceId,
				},
			],
		});

		const response: ClaudeBatchAddResponse =
			sendBatchAddResponse.mock.calls[0][1];
		expect(response.added[0].success).toBe(true);
		expect(
			storeMocks.timelineStoreState.addElementToTrack
		).toHaveBeenCalledWith(
			"track-1",
			expect.objectContaining({ mediaId: "renderer-gen-1" }),
			{ pushHistory: false, selectElement: false }
		);
	});

	it("batch adds text elements", async () => {
		const { batchAddHandler, sendBatchAddResponse } = setupBatchAddBridge();

		await batchAddHandler({
			requestId: "req-6",
			elements: [
				{
					type: "text",
					trackId: "track-2",
					startTime: 0,
					duration: 3,
					content: "Hello World",
				},
			],
		});

		const response: ClaudeBatchAddResponse =
			sendBatchAddResponse.mock.calls[0][1];
		expect(response.added[0].success).toBe(true);
		expect(
			storeMocks.timelineStoreState.addElementToTrack
		).toHaveBeenCalledWith(
			"track-2",
			expect.objectContaining({ type: "text", content: "Hello World" }),
			{ pushHistory: false, selectElement: false }
		);
	});

	it("rejects batch exceeding 50 items", async () => {
		const elements = Array.from({ length: 51 }, (_, i) => ({
			type: "video" as const,
			trackId: "track-1",
			startTime: i,
			duration: 1,
			sourceName: `clip-${i}.mp4`,
		}));

		const { batchAddHandler, sendBatchAddResponse } = setupBatchAddBridge();

		await batchAddHandler({ requestId: "req-7", elements });

		const response: ClaudeBatchAddResponse =
			sendBatchAddResponse.mock.calls[0][1];
		expect(response.failedCount).toBe(51);
		expect(response.added[0].error).toContain("limit is 50");
	});

	it("handles empty batch gracefully", async () => {
		const { batchAddHandler, sendBatchAddResponse } = setupBatchAddBridge();

		await batchAddHandler({ requestId: "req-8", elements: [] });

		const response: ClaudeBatchAddResponse =
			sendBatchAddResponse.mock.calls[0][1];
		expect(response.failedCount).toBe(0);
		expect(response.added).toHaveLength(0);
	});

	it("reports per-element errors in mixed success/failure batch", async () => {
		storeMocks.mediaStoreState.mediaItems = [
			{
				id: "media-ok",
				name: "found.mp4",
				type: "video",
				file: new File([""], "found.mp4"),
				duration: 5,
			},
		];

		const { batchAddHandler, sendBatchAddResponse } = setupBatchAddBridge();

		await batchAddHandler({
			requestId: "req-9",
			elements: [
				{
					type: "video",
					trackId: "track-1",
					startTime: 0,
					duration: 5,
					sourceName: "found.mp4",
				},
				{
					type: "video",
					trackId: "track-1",
					startTime: 5,
					duration: 5,
					sourceName: "missing.mp4",
				},
			],
		});

		const response: ClaudeBatchAddResponse =
			sendBatchAddResponse.mock.calls[0][1];
		expect(response.failedCount).toBe(1);
		expect(response.added[0].success).toBe(true);
		expect(response.added[1].success).toBe(false);
		expect(response.added[1].error).toBe("Media source could not be resolved");
	});

	it("rejects elements with invalid track", async () => {
		const { batchAddHandler, sendBatchAddResponse } = setupBatchAddBridge();

		await batchAddHandler({
			requestId: "req-10",
			elements: [
				{
					type: "video",
					trackId: "nonexistent-track",
					startTime: 0,
					duration: 5,
					sourceName: "clip.mp4",
				},
			],
		});

		const response: ClaudeBatchAddResponse =
			sendBatchAddResponse.mock.calls[0][1];
		expect(response.added[0].success).toBe(false);
		expect(response.added[0].error).toContain("Track not found");
	});

	it("rejects elements with negative startTime", async () => {
		const { batchAddHandler, sendBatchAddResponse } = setupBatchAddBridge();

		await batchAddHandler({
			requestId: "req-11",
			elements: [
				{
					type: "video",
					trackId: "track-1",
					startTime: -1,
					duration: 5,
					sourceName: "clip.mp4",
				},
			],
		});

		const response: ClaudeBatchAddResponse =
			sendBatchAddResponse.mock.calls[0][1];
		expect(response.added[0].success).toBe(false);
		expect(response.added[0].error).toContain("non-negative");
	});

	it("rejects elements with zero duration", async () => {
		const { batchAddHandler, sendBatchAddResponse } = setupBatchAddBridge();

		await batchAddHandler({
			requestId: "req-12",
			elements: [
				{
					type: "video",
					trackId: "track-1",
					startTime: 0,
					duration: 0,
					sourceName: "clip.mp4",
				},
			],
		});

		const response: ClaudeBatchAddResponse =
			sendBatchAddResponse.mock.calls[0][1];
		expect(response.added[0].success).toBe(false);
		expect(response.added[0].error).toContain("greater than 0");
	});
});
