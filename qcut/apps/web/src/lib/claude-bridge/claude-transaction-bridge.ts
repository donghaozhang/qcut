import { debugError, debugLog, debugWarn } from "@/lib/debug/debug-config";
import { platform } from "@qcut/platform-core";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { TimelineTrack } from "@/types/timeline";
import type { TimelineStore } from "@/stores/timeline/types";

type ClaudeTransactionAPI = NonNullable<
	NonNullable<ReturnType<typeof platform>["claude"]>["transaction"]
>;

type TransactionHistoryEntry = {
	label: string;
	timestamp: number;
	transactionId?: string;
};

type ActiveTransactionContext = {
	transactionId: string;
	label?: string;
	createdAt: number;
	expiresAt: number;
	preTracks: TimelineTrack[];
	preSelection: TimelineStore["selectedElements"];
};

type TimelineHistoryPatches = Pick<
	TimelineStore,
	"pushHistory" | "undo" | "redo"
>;

type TransactionResponse = {
	success: boolean;
	error?: string;
	message?: string;
};

type CommitResponse = TransactionResponse & {
	historyEntryAdded?: boolean;
};

const DEFAULT_HISTORY_LABEL = "Edit";
const DEFAULT_TRANSACTION_LABEL = "Claude transaction";

let activeTransaction: ActiveTransactionContext | null = null;
let historyEntries: TransactionHistoryEntry[] = [];
let redoEntries: TransactionHistoryEntry[] = [];
let originalHistoryPatches: TimelineHistoryPatches | null = null;
let isHistoryPatched = false;

function cloneJson<T>({ value }: { value: T }): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function createHistoryEntry({
	label,
	transactionId,
	timestamp,
}: {
	label?: string;
	transactionId?: string;
	timestamp?: number;
}): TransactionHistoryEntry {
	return {
		label:
			typeof label === "string" && label.trim()
				? label.trim()
				: DEFAULT_HISTORY_LABEL,
		timestamp: typeof timestamp === "number" ? timestamp : Date.now(),
		transactionId,
	};
}

function syncHistoryMetadataWithStore(): void {
	try {
		const store = useTimelineStore.getState();
		while (historyEntries.length > store.history.length) {
			historyEntries.pop();
		}
		while (redoEntries.length > store.redoStack.length) {
			redoEntries.pop();
		}
		while (historyEntries.length < store.history.length) {
			historyEntries.push(createHistoryEntry({ label: DEFAULT_HISTORY_LABEL }));
		}
		while (redoEntries.length < store.redoStack.length) {
			redoEntries.push(createHistoryEntry({ label: DEFAULT_HISTORY_LABEL }));
		}
	} catch (error) {
		debugWarn(
			"[ClaudeTransactionBridge] Failed to sync history metadata:",
			error
		);
	}
}

function installHistoryPatches(): void {
	try {
		if (isHistoryPatched) {
			return;
		}

		const state = useTimelineStore.getState();
		originalHistoryPatches = {
			pushHistory: state.pushHistory,
			undo: state.undo,
			redo: state.redo,
		};

		const patchedPushHistory: TimelineStore["pushHistory"] = () => {
			try {
				if (activeTransaction) {
					debugLog(
						"[ClaudeTransactionBridge] Suppressing pushHistory during transaction:",
						activeTransaction.transactionId
					);
					return;
				}
				if (!originalHistoryPatches) {
					return;
				}
				originalHistoryPatches.pushHistory();
				syncHistoryMetadataWithStore();
				if (historyEntries.length > 0) {
					historyEntries[historyEntries.length - 1] = createHistoryEntry({
						label: DEFAULT_HISTORY_LABEL,
					});
				}
				redoEntries = [];
			} catch (error) {
				debugError(
					"[ClaudeTransactionBridge] Patched pushHistory failed:",
					error
				);
				try {
					originalHistoryPatches?.pushHistory();
				} catch (innerError) {
					debugError(
						"[ClaudeTransactionBridge] Fallback pushHistory failed:",
						innerError
					);
				}
			}
		};

		const patchedUndo: TimelineStore["undo"] = () => {
			try {
				if (activeTransaction) {
					debugWarn(
						"[ClaudeTransactionBridge] Blocking undo while transaction is active"
					);
					return;
				}
				if (!originalHistoryPatches) {
					return;
				}
				syncHistoryMetadataWithStore();
				const before = useTimelineStore.getState();
				const beforeUndoCount = before.history.length;
				const beforeRedoCount = before.redoStack.length;
				originalHistoryPatches.undo();
				const after = useTimelineStore.getState();
				if (
					after.history.length === beforeUndoCount - 1 &&
					after.redoStack.length === beforeRedoCount + 1
				) {
					const moved = historyEntries.pop() || createHistoryEntry({});
					redoEntries.push(moved);
				}
				syncHistoryMetadataWithStore();
			} catch (error) {
				debugError("[ClaudeTransactionBridge] Patched undo failed:", error);
				try {
					originalHistoryPatches?.undo();
				} catch (innerError) {
					debugError(
						"[ClaudeTransactionBridge] Fallback undo failed:",
						innerError
					);
				}
			}
		};

		const patchedRedo: TimelineStore["redo"] = () => {
			try {
				if (activeTransaction) {
					debugWarn(
						"[ClaudeTransactionBridge] Blocking redo while transaction is active"
					);
					return;
				}
				if (!originalHistoryPatches) {
					return;
				}
				syncHistoryMetadataWithStore();
				const before = useTimelineStore.getState();
				const beforeUndoCount = before.history.length;
				const beforeRedoCount = before.redoStack.length;
				originalHistoryPatches.redo();
				const after = useTimelineStore.getState();
				if (
					after.history.length === beforeUndoCount + 1 &&
					after.redoStack.length === beforeRedoCount - 1
				) {
					const moved = redoEntries.pop() || createHistoryEntry({});
					historyEntries.push(moved);
				}
				syncHistoryMetadataWithStore();
			} catch (error) {
				debugError("[ClaudeTransactionBridge] Patched redo failed:", error);
				try {
					originalHistoryPatches?.redo();
				} catch (innerError) {
					debugError(
						"[ClaudeTransactionBridge] Fallback redo failed:",
						innerError
					);
				}
			}
		};

		useTimelineStore.setState({
			pushHistory: patchedPushHistory,
			undo: patchedUndo,
			redo: patchedRedo,
		});
		isHistoryPatched = true;
		syncHistoryMetadataWithStore();
		debugLog("[ClaudeTransactionBridge] Installed timeline history patches");
	} catch (error) {
		debugError(
			"[ClaudeTransactionBridge] Failed to install history patches:",
			error
		);
	}
}

/**
 * Restores the timeline store's original history methods and clears internal patching state.
 *
 * If history patches are not installed, this function does nothing. On success it reinstates
 * the original pushHistory/undo/redo implementations, resets the patched flag and stored originals,
 * and logs the restoration; failures are caught and logged.
 */
function restoreHistoryPatches(): void {
	try {
		if (!isHistoryPatched || !originalHistoryPatches) {
			return;
		}
		useTimelineStore.setState({
			pushHistory: originalHistoryPatches.pushHistory,
			undo: originalHistoryPatches.undo,
			redo: originalHistoryPatches.redo,
		});
		isHistoryPatched = false;
		originalHistoryPatches = null;
		debugLog("[ClaudeTransactionBridge] Restored timeline history patches");
	} catch (error) {
		debugError(
			"[ClaudeTransactionBridge] Failed to restore history patches:",
			error
		);
	}
}

/**
 * Retrieve the Claude transaction API from the platform if available.
 *
 * @returns The Claude transaction API instance, or `null` if it is not available on the current platform.
 */
function getTransactionAPI(): ClaudeTransactionAPI | null {
	if (!platform().claude?.transaction) {
		return null;
	}
	return platform().claude!.transaction!;
}

/**
 * Send a Begin response to the Claude transaction API and log any failure.
 *
 * @param requestId - The transaction request identifier to correlate this response with the original Begin request
 * @param result - The Begin operation result to send to the Claude API
 */
function sendBeginResponse({
	api,
	requestId,
	result,
}: {
	api: ClaudeTransactionAPI;
	requestId: string;
	result: TransactionResponse;
}): void {
	try {
		api.sendBeginResponse(requestId, result);
	} catch (error) {
		debugError(
			"[ClaudeTransactionBridge] Failed to send begin response:",
			error
		);
	}
}

function sendCommitResponse({
	api,
	requestId,
	result,
}: {
	api: ClaudeTransactionAPI;
	requestId: string;
	result: CommitResponse;
}): void {
	try {
		api.sendCommitResponse(requestId, result);
	} catch (error) {
		debugError(
			"[ClaudeTransactionBridge] Failed to send commit response:",
			error
		);
	}
}

function sendRollbackResponse({
	api,
	requestId,
	result,
}: {
	api: ClaudeTransactionAPI;
	requestId: string;
	result: TransactionResponse;
}): void {
	try {
		api.sendRollbackResponse(requestId, result);
	} catch (error) {
		debugError(
			"[ClaudeTransactionBridge] Failed to send rollback response:",
			error
		);
	}
}

function commitSingleHistoryEntry({
	label,
	transactionId,
	preTracks,
}: {
	label?: string;
	transactionId: string;
	preTracks: TimelineTrack[];
}): boolean {
	try {
		const storeBefore = useTimelineStore.getState();
		const finalTracks = cloneJson({ value: storeBefore._tracks });
		const beforeSerialized = JSON.stringify(preTracks);
		const afterSerialized = JSON.stringify(finalTracks);
		if (beforeSerialized === afterSerialized) {
			return false;
		}

		useTimelineStore.setState((state) => ({
			history: [...state.history, cloneJson({ value: preTracks })],
			redoStack: [],
		}));
		syncHistoryMetadataWithStore();
		if (historyEntries.length > 0) {
			historyEntries[historyEntries.length - 1] = createHistoryEntry({
				label: label || DEFAULT_TRANSACTION_LABEL,
				transactionId,
			});
		}
		redoEntries = [];
		debugLog(
			"[ClaudeTransactionBridge] Committed grouped history entry for transaction:",
			transactionId
		);
		return true;
	} catch (error) {
		debugError(
			"[ClaudeTransactionBridge] Failed to commit grouped history entry:",
			error
		);
		return false;
	}
}

export function setupClaudeTransactionBridge(): void {
	try {
		const api = getTransactionAPI();
		if (!api) {
			debugWarn(
				"[ClaudeTransactionBridge] Claude Transaction API not available"
			);
			return;
		}

		installHistoryPatches();

		api.onBegin((data) => {
			try {
				if (activeTransaction) {
					sendBeginResponse({
						api,
						requestId: data.requestId,
						result: {
							success: false,
							error: `Nested transactions are not supported. Active transaction: ${activeTransaction.transactionId}`,
						},
					});
					return;
				}

				const store = useTimelineStore.getState();
				activeTransaction = {
					transactionId: data.transactionId,
					label: typeof data.label === "string" ? data.label : undefined,
					createdAt:
						typeof data.createdAt === "number" ? data.createdAt : Date.now(),
					expiresAt:
						typeof data.expiresAt === "number" ? data.expiresAt : Date.now(),
					preTracks: cloneJson({ value: store._tracks }),
					preSelection: cloneJson({ value: store.selectedElements }),
				};

				debugLog(
					"[ClaudeTransactionBridge] Began transaction:",
					data.transactionId,
					data.label
				);
				sendBeginResponse({
					api,
					requestId: data.requestId,
					result: { success: true },
				});
			} catch (error) {
				sendBeginResponse({
					api,
					requestId: data.requestId,
					result: {
						success: false,
						error: error instanceof Error ? error.message : "Begin failed",
					},
				});
			}
		});

		api.onCommit((data) => {
			try {
				if (!activeTransaction) {
					sendCommitResponse({
						api,
						requestId: data.requestId,
						result: {
							success: false,
							error: "No active transaction",
						},
					});
					return;
				}
				if (activeTransaction.transactionId !== data.transactionId) {
					sendCommitResponse({
						api,
						requestId: data.requestId,
						result: {
							success: false,
							error: `Active transaction mismatch: ${activeTransaction.transactionId}`,
						},
					});
					return;
				}

				const current = activeTransaction;
				const historyEntryAdded = commitSingleHistoryEntry({
					label: current.label,
					transactionId: current.transactionId,
					preTracks: current.preTracks,
				});
				activeTransaction = null;

				sendCommitResponse({
					api,
					requestId: data.requestId,
					result: {
						success: true,
						historyEntryAdded,
					},
				});
			} catch (error) {
				sendCommitResponse({
					api,
					requestId: data.requestId,
					result: {
						success: false,
						error: error instanceof Error ? error.message : "Commit failed",
					},
				});
			}
		});

		api.onRollback((data) => {
			try {
				if (!activeTransaction) {
					sendRollbackResponse({
						api,
						requestId: data.requestId,
						result: {
							success: false,
							error: "No active transaction",
						},
					});
					return;
				}
				if (activeTransaction.transactionId !== data.transactionId) {
					sendRollbackResponse({
						api,
						requestId: data.requestId,
						result: {
							success: false,
							error: `Active transaction mismatch: ${activeTransaction.transactionId}`,
						},
					});
					return;
				}

				const current = activeTransaction;
				const store = useTimelineStore.getState();
				store.restoreTracks(cloneJson({ value: current.preTracks }));
				store.setSelectedElements(cloneJson({ value: current.preSelection }));
				activeTransaction = null;

				debugLog(
					"[ClaudeTransactionBridge] Rolled back transaction:",
					data.transactionId,
					data.reason
				);
				sendRollbackResponse({
					api,
					requestId: data.requestId,
					result: { success: true },
				});
			} catch (error) {
				sendRollbackResponse({
					api,
					requestId: data.requestId,
					result: {
						success: false,
						error: error instanceof Error ? error.message : "Rollback failed",
					},
				});
			}
		});

		api.onUndo((data) => {
			try {
				if (activeTransaction) {
					api.sendUndoResponse(data.requestId, {
						applied: false,
						undoCount: useTimelineStore.getState().history.length,
						redoCount: useTimelineStore.getState().redoStack.length,
					});
					return;
				}
				const before = useTimelineStore.getState();
				const beforeUndoCount = before.history.length;
				const beforeRedoCount = before.redoStack.length;
				before.undo();
				syncHistoryMetadataWithStore();
				const after = useTimelineStore.getState();
				api.sendUndoResponse(data.requestId, {
					applied:
						after.history.length !== beforeUndoCount ||
						after.redoStack.length !== beforeRedoCount,
					undoCount: after.history.length,
					redoCount: after.redoStack.length,
				});
			} catch (error) {
				debugError("[ClaudeTransactionBridge] Undo handler failed:", error);
				const store = useTimelineStore.getState();
				api.sendUndoResponse(data.requestId, {
					applied: false,
					undoCount: store.history.length,
					redoCount: store.redoStack.length,
				});
			}
		});

		api.onRedo((data) => {
			try {
				if (activeTransaction) {
					api.sendRedoResponse(data.requestId, {
						applied: false,
						undoCount: useTimelineStore.getState().history.length,
						redoCount: useTimelineStore.getState().redoStack.length,
					});
					return;
				}
				const before = useTimelineStore.getState();
				const beforeUndoCount = before.history.length;
				const beforeRedoCount = before.redoStack.length;
				before.redo();
				syncHistoryMetadataWithStore();
				const after = useTimelineStore.getState();
				api.sendRedoResponse(data.requestId, {
					applied:
						after.history.length !== beforeUndoCount ||
						after.redoStack.length !== beforeRedoCount,
					undoCount: after.history.length,
					redoCount: after.redoStack.length,
				});
			} catch (error) {
				debugError("[ClaudeTransactionBridge] Redo handler failed:", error);
				const store = useTimelineStore.getState();
				api.sendRedoResponse(data.requestId, {
					applied: false,
					undoCount: store.history.length,
					redoCount: store.redoStack.length,
				});
			}
		});

		api.onHistory((data) => {
			try {
				syncHistoryMetadataWithStore();
				const store = useTimelineStore.getState();
				api.sendHistoryResponse(data.requestId, {
					undoCount: store.history.length,
					redoCount: store.redoStack.length,
					entries: [...historyEntries],
					redoEntries: [...redoEntries],
				});
			} catch (error) {
				debugError("[ClaudeTransactionBridge] History handler failed:", error);
				api.sendHistoryResponse(data.requestId, {
					undoCount: 0,
					redoCount: 0,
					entries: [],
				});
			}
		});

		debugLog("[ClaudeTransactionBridge] Bridge setup complete");
	} catch (error) {
		debugError("[ClaudeTransactionBridge] Failed to setup bridge:", error);
	}
}

export function cleanupClaudeTransactionBridge(): void {
	try {
		const api = getTransactionAPI();
		if (api?.removeListeners) {
			api.removeListeners();
		}
		activeTransaction = null;
		historyEntries = [];
		redoEntries = [];
		restoreHistoryPatches();
		debugLog("[ClaudeTransactionBridge] Bridge cleanup complete");
	} catch (error) {
		debugError("[ClaudeTransactionBridge] Failed to cleanup bridge:", error);
	}
}
