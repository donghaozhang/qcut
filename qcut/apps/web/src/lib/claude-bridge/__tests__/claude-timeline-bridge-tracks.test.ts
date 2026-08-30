import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTransitionOps } from "@/stores/timeline/timeline-transition-ops";
import type { TimelineStore } from "@/stores/timeline/types";
import type { OperationDeps } from "@/stores/timeline/timeline-store-operations";
import type { ClipTransition, TimelineTrack } from "@/types/timeline";
import { setupTrackHandlers } from "../claude-timeline-bridge-tracks";
import type { ClaudeTimelineBridgeAPI } from "../claude-timeline-bridge";

const storeMocks = vi.hoisted(() => ({
	getState: vi.fn(),
}));
const mediaMocks = vi.hoisted(() => ({
	mediaItems: [] as Array<{ id: string; type: string }>,
}));

vi.mock("@/stores/timeline/timeline-store", () => ({
	useTimelineStore: { getState: storeMocks.getState },
}));
vi.mock("@/stores/media/media-store", () => ({
	useMediaStore: {
		getState: vi.fn(() => ({ mediaItems: mediaMocks.mediaItems })),
	},
}));
vi.mock("@/lib/debug/debug-config", () => ({
	debugError: vi.fn(),
}));

function mediaElement({
	id,
	mediaId,
	startTime,
}: {
	id: string;
	mediaId: string;
	startTime: number;
}) {
	return {
		id,
		type: "media" as const,
		mediaId,
		name: id,
		startTime,
		duration: 5,
		trimStart: 0,
		trimEnd: 0,
	};
}

/**
 * A minimal live store around the REAL transition ops, so tests assert what
 * actually lands in track state — not just what the bridge sends.
 */
function makeTransitionStore({
	secondClipStart = 5,
}: {
	secondClipStart?: number;
} = {}) {
	const track: TimelineTrack = {
		id: "track-1",
		name: "Main",
		type: "media",
		isMain: true,
		muted: false,
		hidden: false,
		locked: false,
		elements: [
			mediaElement({ id: "clip-a", mediaId: "video-1", startTime: 0 }),
			mediaElement({
				id: "clip-b",
				mediaId: "video-2",
				startTime: secondClipStart,
			}),
		],
		transitions: [],
	} as unknown as TimelineTrack;
	const state = {
		_tracks: [track],
		tracks: [track],
		selectedElements: [] as unknown[],
		selectedTransition: null as unknown,
		pushHistory: vi.fn(),
	};
	const get = () => state as unknown as TimelineStore;
	const set = (partial: unknown) => {
		Object.assign(
			state,
			typeof partial === "function"
				? (partial as (current: unknown) => object)(state)
				: (partial as object)
		);
	};
	const deps = {
		updateTracksAndSave: vi.fn((tracks: TimelineTrack[]) => {
			state._tracks = tracks;
			state.tracks = tracks;
		}),
	} as unknown as OperationDeps;
	const ops = createTransitionOps(get, set as never, deps) as unknown as Pick<
		TimelineStore,
		"addTransition"
	>;
	return {
		state,
		store: {
			get tracks() {
				return state.tracks;
			},
			addTransition: ops.addTransition,
		},
	};
}

function setupHandler() {
	let trackHandler:
		| ((data: { requestId: string; request: Record<string, unknown> }) => void)
		| undefined;
	const sendResponse = vi.fn();
	const claudeAPI = {
		onTrackOperation: vi.fn(
			(
				handler: (data: {
					requestId: string;
					request: Record<string, unknown>;
				}) => void
			) => {
				trackHandler = handler;
			}
		),
		sendTrackOperationResponse: sendResponse,
	} as unknown as ClaudeTimelineBridgeAPI;
	setupTrackHandlers({ claudeAPI });
	if (!trackHandler) throw new Error("Track handler was not registered");
	return { trackHandler, sendResponse };
}

function addTransitionRequest({
	transition,
}: {
	transition: Record<string, unknown>;
}) {
	return {
		requestId: "request-1",
		request: {
			action: "add-transition",
			trackId: "track-1",
			transition: {
				fromElementId: "clip-a",
				toElementId: "clip-b",
				presetId: "dissolve",
				type: "dissolve",
				duration: 1,
				...transition,
			},
		},
	};
}

const QCUT_TRANSITION_TYPES = [
	"dissolve",
	"slide",
	"push",
	"page-flip",
	"cube",
	"whip-pan",
] as const;

describe("Claude track bridge transitions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mediaMocks.mediaItems = [
			{ id: "video-1", type: "video" },
			{ id: "video-2", type: "video" },
		];
	});

	it("persists engine qcut for every QCut transition type", () => {
		for (const type of QCUT_TRANSITION_TYPES) {
			const { state, store } = makeTransitionStore();
			storeMocks.getState.mockReturnValue(store);
			const { trackHandler, sendResponse } = setupHandler();

			trackHandler(
				addTransitionRequest({ transition: { presetId: type, type } })
			);

			const [, response] = sendResponse.mock.calls.at(-1) as [
				string,
				{ success: boolean; transitionId?: string },
			];
			expect(response.success).toBe(true);
			const saved = (state.tracks[0].transitions ?? []) as ClipTransition[];
			expect(saved).toHaveLength(1);
			expect(saved[0]).toMatchObject({
				id: response.transitionId,
				type,
				engine: "qcut",
			});
			expect(saved[0].packageHash).toBeUndefined();
		}
	});

	it("persists engine and packageHash for jianying-local transitions", () => {
		const packageHash = "a".repeat(40);
		const { state, store } = makeTransitionStore();
		storeMocks.getState.mockReturnValue(store);
		const { trackHandler, sendResponse } = setupHandler();

		trackHandler(
			addTransitionRequest({
				transition: {
					presetId: "jianying-wipe",
					type: "wipe",
					engine: "jianying-local",
					packageHash,
				},
			})
		);

		const [, response] = sendResponse.mock.calls.at(-1) as [
			string,
			{ success: boolean },
		];
		expect(response.success).toBe(true);
		const saved = (state.tracks[0].transitions ?? []) as ClipTransition[];
		expect(saved[0]).toMatchObject({
			engine: "jianying-local",
			packageHash,
			type: "wipe",
		});
	});

	it("rejects jianying-local transitions without a valid package hash", () => {
		for (const packageHash of [
			undefined,
			"tooshort",
			"G".repeat(40),
			"a".repeat(70),
		]) {
			const { state, store } = makeTransitionStore();
			storeMocks.getState.mockReturnValue(store);
			const { trackHandler, sendResponse } = setupHandler();

			trackHandler(
				addTransitionRequest({
					transition: { engine: "jianying-local", packageHash },
				})
			);

			const [, response] = sendResponse.mock.calls.at(-1) as [
				string,
				{ success: boolean; error?: string },
			];
			expect(response.success).toBe(false);
			expect(response.error).toContain("packageHash");
			expect(state.tracks[0].transitions ?? []).toHaveLength(0);
		}
	});

	it("rejects a packageHash on the qcut engine and unknown engines", () => {
		const { state, store } = makeTransitionStore();
		storeMocks.getState.mockReturnValue(store);
		const { trackHandler, sendResponse } = setupHandler();

		trackHandler(
			addTransitionRequest({
				transition: { engine: "qcut", packageHash: "a".repeat(40) },
			})
		);
		trackHandler(addTransitionRequest({ transition: { engine: "premiere" } }));

		const responses = sendResponse.mock.calls.map(
			(call) => call[1] as { success: boolean; error?: string }
		);
		expect(responses[0].success).toBe(false);
		expect(responses[0].error).toContain("jianying-local");
		expect(responses[1].success).toBe(false);
		expect(responses[1].error).toContain("Unsupported transition engine");
		expect(state.tracks[0].transitions ?? []).toHaveLength(0);
	});

	it("rejects non-adjacent clips and non-video media", () => {
		// Clips with a 3s gap: the transition window comes out empty.
		const gapped = makeTransitionStore({ secondClipStart: 8 });
		storeMocks.getState.mockReturnValue(gapped.store);
		const gapHandler = setupHandler();
		gapHandler.trackHandler(addTransitionRequest({ transition: {} }));
		const [, gapResponse] = gapHandler.sendResponse.mock.calls.at(-1) as [
			string,
			{ success: boolean; error?: string },
		];
		expect(gapResponse.success).toBe(false);
		expect(gapResponse.error).toContain("adjacent");
		expect(gapped.state.tracks[0].transitions ?? []).toHaveLength(0);

		// Audio media on one side: the pair is not two video clips.
		mediaMocks.mediaItems = [
			{ id: "video-1", type: "video" },
			{ id: "video-2", type: "audio" },
		];
		const wrongMedia = makeTransitionStore();
		storeMocks.getState.mockReturnValue(wrongMedia.store);
		const wrongHandler = setupHandler();
		wrongHandler.trackHandler(addTransitionRequest({ transition: {} }));
		const [, wrongResponse] = wrongHandler.sendResponse.mock.calls.at(-1) as [
			string,
			{ success: boolean; error?: string },
		];
		expect(wrongResponse.success).toBe(false);
		expect(wrongMedia.state.tracks[0].transitions ?? []).toHaveLength(0);
	});
});
