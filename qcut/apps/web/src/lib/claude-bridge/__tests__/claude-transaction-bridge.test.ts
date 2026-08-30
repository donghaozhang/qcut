import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type TransactionCallback = (
	data: Record<string, unknown>
) => unknown | Promise<unknown>;

const transactionMocks = vi.hoisted(() => {
	const callbacks: Record<string, TransactionCallback | undefined> = {};
	const api = {
		onBegin: vi.fn((callback: TransactionCallback) => {
			callbacks.begin = callback;
		}),
		onCommit: vi.fn((callback: TransactionCallback) => {
			callbacks.commit = callback;
		}),
		onRollback: vi.fn((callback: TransactionCallback) => {
			callbacks.rollback = callback;
		}),
		onUndo: vi.fn((callback: TransactionCallback) => {
			callbacks.undo = callback;
		}),
		onRedo: vi.fn((callback: TransactionCallback) => {
			callbacks.redo = callback;
		}),
		onHistory: vi.fn((callback: TransactionCallback) => {
			callbacks.history = callback;
		}),
		sendBeginResponse: vi.fn(),
		sendCommitResponse: vi.fn(),
		sendRollbackResponse: vi.fn(),
		sendUndoResponse: vi.fn(),
		sendRedoResponse: vi.fn(),
		sendHistoryResponse: vi.fn(),
		removeListeners: vi.fn(),
	};
	return { api, callbacks };
});

const timelineMocks = vi.hoisted(() => {
	const state = {
		_tracks: [{ id: "track-before", elements: [] }] as Array<
			Record<string, unknown>
		>,
		selectedElements: [{ trackId: "track-before", elementId: "element-1" }],
		selectedTransition: null as Record<string, unknown> | null,
		history: [] as unknown[],
		redoStack: [] as unknown[],
		pushHistory: vi.fn(),
		undo: vi.fn(),
		redo: vi.fn(),
		restoreTracks: vi.fn((tracks: Array<Record<string, unknown>>) => {
			state._tracks = tracks;
		}),
		saveImmediate: vi.fn(async () => undefined),
	};
	const setState = vi.fn(
		(
			update:
				| Partial<typeof state>
				| ((current: typeof state) => Partial<typeof state>)
		) => {
			Object.assign(
				state,
				typeof update === "function" ? update(state) : update
			);
		}
	);
	return { state, setState };
});

const stickerMocks = vi.hoisted(() => {
	const saveToProject = vi.fn(async () => undefined);
	const state = {
		overlayStickers: new Map<string, Record<string, unknown>>(),
		selectedStickerId: null as string | null,
		isDragging: false,
		isResizing: false,
		isRotating: false,
		history: { past: [] as unknown[][], future: [] as unknown[][] },
		saveToProject,
	};
	const setState = vi.fn((update: Partial<typeof state>) => {
		Object.assign(state, update);
	});
	return { saveToProject, setState, state };
});

vi.mock("@qcut/platform-core", () => ({
	platform: vi.fn(() => ({
		claude: { transaction: transactionMocks.api },
	})),
}));
vi.mock("@/stores/timeline/timeline-store", () => ({
	useTimelineStore: {
		getState: vi.fn(() => timelineMocks.state),
		setState: timelineMocks.setState,
	},
}));
vi.mock("@/stores/stickers-overlay-store", () => ({
	useStickersOverlayStore: {
		getState: vi.fn(() => stickerMocks.state),
		setState: stickerMocks.setState,
	},
}));
vi.mock("@/stores/project-store", () => ({
	useProjectStore: {
		getState: vi.fn(() => ({ activeProject: { id: "project-1" } })),
	},
}));
vi.mock("@/stores/timeline/timeline-history", () => ({
	captureTimelineHistorySnapshot: vi.fn(
		({ tracks, selectedElements, selectedTransition }) => ({
			tracks: JSON.parse(JSON.stringify(tracks)),
			selectedElements: JSON.parse(JSON.stringify(selectedElements)),
			selectedTransition,
			playhead: 0,
		})
	),
	restoreTimelinePlayhead: vi.fn(),
}));
vi.mock("@/lib/debug/debug-config", () => ({
	debugError: vi.fn(),
	debugLog: vi.fn(),
	debugWarn: vi.fn(),
}));

import {
	cleanupClaudeTransactionBridge,
	setupClaudeTransactionBridge,
} from "../claude-transaction-bridge";

describe("Claude transaction bridge sticker rollback", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		for (const key of Object.keys(transactionMocks.callbacks)) {
			transactionMocks.callbacks[key] = undefined;
		}
		timelineMocks.state._tracks = [{ id: "track-before", elements: [] }];
		timelineMocks.state.selectedElements = [
			{ trackId: "track-before", elementId: "element-1" },
		];
		timelineMocks.state.selectedTransition = null;
		timelineMocks.state.history = [];
		timelineMocks.state.redoStack = [];
		stickerMocks.state.overlayStickers = new Map([
			[
				"sticker-before",
				{
					id: "sticker-before",
					mediaItemId: "media-before",
					position: { x: 50, y: 50 },
					size: { width: 15, height: 15 },
					rotation: 0,
					opacity: 1,
					zIndex: 1,
					maintainAspectRatio: true,
				},
			],
		]);
		stickerMocks.state.selectedStickerId = "sticker-before";
		stickerMocks.state.history = { past: [], future: [] };
	});

	afterEach(() => {
		cleanupClaudeTransactionBridge();
	});

	it("restores and persists timeline and overlay state before acknowledging rollback", async () => {
		setupClaudeTransactionBridge();
		await transactionMocks.callbacks.begin?.({
			requestId: "request-begin",
			transactionId: "transaction-1",
			createdAt: 1,
			expiresAt: 2,
		});

		timelineMocks.state._tracks = [{ id: "track-during", elements: [] }];
		stickerMocks.state.overlayStickers.set("sticker-during", {
			id: "sticker-during",
		});
		stickerMocks.state.selectedStickerId = "sticker-during";

		await transactionMocks.callbacks.rollback?.({
			requestId: "request-rollback",
			transactionId: "transaction-1",
			reason: "verification failed",
		});

		expect(timelineMocks.state._tracks).toEqual([
			{ id: "track-before", elements: [] },
		]);
		expect(Array.from(stickerMocks.state.overlayStickers.keys())).toEqual([
			"sticker-before",
		]);
		expect(stickerMocks.state.selectedStickerId).toBe("sticker-before");
		expect(timelineMocks.state.saveImmediate).toHaveBeenCalledOnce();
		expect(stickerMocks.saveToProject).toHaveBeenCalledWith("project-1");
		expect(transactionMocks.api.sendRollbackResponse).toHaveBeenCalledWith(
			"request-rollback",
			{ success: true }
		);
	});
});
