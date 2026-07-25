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
		}>,
	};
	const state = {
		tracks: [track],
		pushHistory: vi.fn(),
		addElementToTrack: vi.fn(),
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
		getState: vi.fn(() => ({ activeProject: null })),
	},
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
					elements: Array<Record<string, unknown>>;
			  }) => Promise<void>)
			| undefined;
		const sendResponse = vi.fn();
		const claudeAPI = {
			onBatchAddElements: vi.fn(
				(
					handler: (data: {
						requestId: string;
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
	});
});
