import { beforeEach, describe, expect, it, vi } from "vitest";
import { setupBatchHandlers } from "../claude-timeline-bridge-batch";
import type {
	ClaudeTimelineBridgeAPI,
	ClaudeTimelineBridgeSharedUtils,
} from "../claude-timeline-bridge";

const storeMocks = vi.hoisted(() => {
	const track = {
		id: "track-1",
		name: "Main Video",
		type: "media",
		elements: [] as Array<{
			id: string;
			type: "media";
			startTime: number;
			duration: number;
			trimStart: number;
			trimEnd: number;
			enhancements?: Record<string, number>;
		}>,
	};
	const state = {
		tracks: [track],
		pushHistory: vi.fn(),
		addElementToTrack: vi.fn(),
		updateElementStartTime: vi.fn(),
		updateElementTrim: vi.fn(),
		updateElementDuration: vi.fn(),
		updateMarkdownElement: vi.fn(),
		updateTextElement: vi.fn(),
		updateMediaElement: vi.fn(),
		updateMediaTiming: vi.fn(),
		setColorLabelForElements: vi.fn(),
		saveImmediate: vi.fn(async () => undefined),
	};
	return { state, track };
});

vi.mock("@/stores/timeline/timeline-store", () => ({
	useTimelineStore: {
		getState: vi.fn(() => storeMocks.state),
	},
}));

vi.mock("@/stores/project-store", () => ({
	useProjectStore: {
		getState: vi.fn(() => ({ activeProject: { id: "project-1" } })),
	},
}));

vi.mock("@/lib/project/project-folder-sync", () => ({
	syncProjectFolder: vi.fn(async () => undefined),
}));

vi.mock("@/lib/debug/debug-config", () => ({
	debugError: vi.fn(),
}));

describe("Claude timeline batch bridge", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		storeMocks.track.elements = [];
		storeMocks.state.addElementToTrack.mockImplementation(
			(
				_trackId: string,
				element: {
					type: "media";
					startTime: number;
					duration: number;
					trimStart: number;
					trimEnd: number;
				}
			) => {
				storeMocks.track.elements.push({
					...element,
					id: "element-1",
				});
				return "element-1";
			}
		);
	});

	it("creates media elements with source trims", async () => {
		let batchHandler:
			| ((data: {
					requestId: string;
					projectId: string;
					elements: Array<Record<string, unknown>>;
			  }) => Promise<void>)
			| undefined;
		const sendResponse = vi.fn();
		const claudeAPI = {
			onBatchAddElements: vi.fn(
				(
					handler: (data: {
						requestId: string;
						projectId: string;
						elements: Array<Record<string, unknown>>;
					}) => Promise<void>
				) => {
					batchHandler = handler;
				}
			),
			sendBatchAddElementsResponse: sendResponse,
		} as unknown as ClaudeTimelineBridgeAPI;
		const sharedUtils = {
			normalizeClaudeElementType: vi.fn(() => "media"),
			resolveMediaIdForBatchElement: vi.fn(() => "media-1"),
		} as unknown as ClaudeTimelineBridgeSharedUtils;

		setupBatchHandlers({ claudeAPI, sharedUtils });
		expect(batchHandler).toBeDefined();
		await batchHandler?.({
			requestId: "request-1",
			projectId: "project-1",
			elements: [
				{
					type: "media",
					trackId: "track-1",
					sourceId: "media-1",
					sourceName: "yarra.mp4",
					startTime: 3.295,
					duration: 20,
					trimStart: 2.4,
					trimEnd: 11.9,
					playbackRate: 1.5,
					reverse: true,
					colorLabel: "blue",
				},
			],
		});

		expect(storeMocks.state.addElementToTrack).toHaveBeenCalledWith(
			"track-1",
			expect.objectContaining({
				trimStart: 2.4,
				trimEnd: 11.9,
				playbackRate: 1.5,
				reverse: true,
				colorLabel: "blue",
			}),
			{
				pushHistory: false,
				selectElement: false,
			}
		);
		expect(sendResponse).toHaveBeenCalledWith("request-1", {
			added: [{ index: 0, success: true, elementId: "element-1" }],
			failedCount: 0,
		});

		storeMocks.state.addElementToTrack.mockClear();
		await batchHandler?.({
			requestId: "request-invalid-collision",
			projectId: "project-1",
			elements: [
				{
					type: "media",
					trackId: "track-1",
					sourceId: "media-1",
					startTime: 0,
					duration: 2,
					collision: "merge",
				},
			],
		});

		expect(storeMocks.state.addElementToTrack).not.toHaveBeenCalled();
		expect(sendResponse).toHaveBeenCalledWith("request-invalid-collision", {
			added: [
				{
					index: 0,
					success: false,
					error: "Unsupported collision policy: merge",
				},
			],
			failedCount: 1,
		});
	});

	it("persists batch updates before acknowledging nested and flat shapes", async () => {
		storeMocks.track.elements = [
			{
				id: "clip",
				type: "media",
				startTime: 0,
				duration: 8,
				trimStart: 0,
				trimEnd: 0,
			},
		];

		let updateHandler:
			| ((data: {
					requestId: string;
					updates: Array<Record<string, unknown>>;
			  }) => Promise<void>)
			| undefined;
		const sendResponse = vi.fn();
		const claudeAPI = {
			onBatchUpdateElements: vi.fn(
				(
					handler: (data: {
						requestId: string;
						updates: Array<Record<string, unknown>>;
					}) => Promise<void>
				) => {
					updateHandler = handler;
				}
			),
			sendBatchUpdateElementsResponse: sendResponse,
		} as unknown as ClaudeTimelineBridgeAPI;

		setupBatchHandlers({
			claudeAPI,
			sharedUtils: {} as ClaudeTimelineBridgeSharedUtils,
		});
		expect(updateHandler).toBeDefined();
		await updateHandler?.({
			requestId: "request-2",
			updates: [
				// Documented nested shape — previously silently ignored
				{ elementId: "clip", changes: { startTime: 7 } },
				// Legacy flat shape — must keep working
				{ elementId: "clip", startTime: 9 },
				{ elementId: "clip", changes: { colorLabel: "rose" } },
				{
					elementId: "clip",
					changes: { enhancements: { labEyeCorrection: 60 } },
				},
			],
		});

		expect(storeMocks.state.updateElementStartTime).toHaveBeenNthCalledWith(
			1,
			"track-1",
			"clip",
			7,
			false
		);
		expect(storeMocks.state.updateElementStartTime).toHaveBeenNthCalledWith(
			2,
			"track-1",
			"clip",
			9,
			false
		);
		expect(storeMocks.state.setColorLabelForElements).toHaveBeenCalledWith({
			elements: [{ trackId: "track-1", elementId: "clip" }],
			colorLabel: "rose",
			pushHistory: false,
		});
		expect(storeMocks.state.updateMediaElement).toHaveBeenCalledWith(
			"track-1",
			"clip",
			{
				enhancements: expect.objectContaining({
					labEyeCorrection: 60,
					stabilization: 0,
					upscale: 1,
				}),
			},
			false
		);
		expect(storeMocks.state.saveImmediate).toHaveBeenCalledOnce();
		expect(
			storeMocks.state.saveImmediate.mock.invocationCallOrder[0]
		).toBeLessThan(sendResponse.mock.invocationCallOrder[0]);
		expect(sendResponse).toHaveBeenCalledWith("request-2", {
			updatedCount: 4,
			failedCount: 0,
			results: [
				{ index: 0, success: true },
				{ index: 1, success: true },
				{ index: 2, success: true },
				{ index: 3, success: true },
			],
		});
	});
});

describe("Claude timeline batch audio fades", () => {
	function setupAddHandler() {
		let batchHandler:
			| ((data: {
					requestId: string;
					projectId: string;
					elements: Array<Record<string, unknown>>;
			  }) => Promise<void>)
			| undefined;
		const sendResponse = vi.fn();
		const claudeAPI = {
			onBatchAddElements: vi.fn(
				(
					handler: (data: {
						requestId: string;
						projectId: string;
						elements: Array<Record<string, unknown>>;
					}) => Promise<void>
				) => {
					batchHandler = handler;
				}
			),
			sendBatchAddElementsResponse: sendResponse,
		} as unknown as ClaudeTimelineBridgeAPI;
		const sharedUtils = {
			normalizeClaudeElementType: vi.fn(() => "media"),
			resolveMediaIdForBatchElement: vi.fn(() => "media-1"),
		} as unknown as ClaudeTimelineBridgeSharedUtils;
		setupBatchHandlers({ claudeAPI, sharedUtils });
		if (!batchHandler) throw new Error("Batch handler was not registered");
		return { batchHandler, sendResponse };
	}

	const baseAudio = {
		type: "media",
		trackId: "track-1",
		sourceId: "media-1",
		startTime: 0,
	};

	it("maps fadeIn/fadeOut onto audioFadeIn/audioFadeOut across playback rates", async () => {
		const { batchHandler, sendResponse } = setupAddHandler();
		// Each case fills the clip's timeline span exactly with its fades:
		// span = (duration - trims) / rate.
		const cases = [
			// 1×: (10 - 1 - 1) / 1 = 8s span; 3 + 5 fades fit.
			{ duration: 10, trimStart: 1, trimEnd: 1, fadeIn: 3, fadeOut: 5 },
			// 2×: (10 - 2 - 0) / 2 = 4s span; a 4s fade only fits at 2×.
			{
				duration: 10,
				trimStart: 2,
				trimEnd: 0,
				playbackRate: 2,
				fadeIn: 4,
				fadeOut: 0,
			},
			// 0.5×: (6 - 1 - 1) / 0.5 = 8s span; 8s fade-out fits only slowed.
			{
				duration: 6,
				trimStart: 1,
				trimEnd: 1,
				playbackRate: 0.5,
				fadeIn: 0,
				fadeOut: 8,
			},
		];
		await batchHandler({
			requestId: "request-fades",
			projectId: "project-1",
			elements: cases.map((partial) => ({ ...baseAudio, ...partial })),
		});

		expect(sendResponse).toHaveBeenCalledWith("request-fades", {
			added: [
				{ index: 0, success: true, elementId: "element-1" },
				{ index: 1, success: true, elementId: "element-1" },
				{ index: 2, success: true, elementId: "element-1" },
			],
			failedCount: 0,
		});
		const storedElements = storeMocks.state.addElementToTrack.mock.calls.map(
			([, element]: [string, Record<string, unknown>]) => element
		);
		expect(storedElements[0]).toMatchObject({
			audioFadeIn: 3,
			audioFadeOut: 5,
			trimStart: 1,
			trimEnd: 1,
		});
		expect(storedElements[1]).toMatchObject({
			audioFadeIn: 4,
			audioFadeOut: 0,
			playbackRate: 2,
		});
		expect(storedElements[2]).toMatchObject({
			audioFadeIn: 0,
			audioFadeOut: 8,
			playbackRate: 0.5,
		});
	});

	it("prefers explicit audioFadeIn/audioFadeOut over the fade aliases", async () => {
		const { batchHandler } = setupAddHandler();
		await batchHandler({
			requestId: "request-alias",
			projectId: "project-1",
			elements: [
				{
					...baseAudio,
					duration: 10,
					fadeIn: 9,
					audioFadeIn: 1,
					audioFadeOut: 2,
				},
			],
		});
		const [, stored] = storeMocks.state.addElementToTrack.mock.calls[0];
		expect(stored).toMatchObject({ audioFadeIn: 1, audioFadeOut: 2 });
	});

	it("rejects negative, non-finite, and over-length fades", async () => {
		const { batchHandler, sendResponse } = setupAddHandler();
		await batchHandler({
			requestId: "request-bad-fades",
			projectId: "project-1",
			elements: [
				{ ...baseAudio, duration: 10, fadeIn: -1 },
				{ ...baseAudio, duration: 10, fadeOut: Number.NaN },
				// 2×: (10 - 0 - 0) / 2 = 5s span; a 6s fade no longer fits.
				{ ...baseAudio, duration: 10, playbackRate: 2, fadeIn: 6 },
				// Same 6s fade fits at 1× — proves the rate is what rejects it.
				{ ...baseAudio, duration: 10, fadeIn: 6 },
			],
		});

		expect(storeMocks.state.addElementToTrack).toHaveBeenCalledTimes(1);
		expect(sendResponse).toHaveBeenCalledWith("request-bad-fades", {
			added: [
				{
					index: 0,
					success: false,
					error: "audioFadeIn must be a non-negative finite number",
				},
				{
					index: 1,
					success: false,
					error: "audioFadeOut must be a non-negative finite number",
				},
				{
					index: 2,
					success: false,
					error: "audioFadeIn (6s) must fit inside the clip's 5s timeline span",
				},
				{ index: 3, success: true, elementId: "element-1" },
			],
			failedCount: 3,
		});
	});
});
