/**
 * Claude editor integration platform API.
 * Covers media, timeline, transaction, project, export, diagnostics,
 * analyze, events, notifications, navigator, screen recording bridge,
 * UI, state, and project CRUD sub-namespaces.
 *
 * This is the largest API surface — desktop-only in QCut Lite.
 *
 * @module @qcut/platform-core/types/claude-api
 */

// ---------------------------------------------------------------------------
// Claude Media
// ---------------------------------------------------------------------------

export interface PlatformClaudeMediaAPI {
	list(projectId: string): Promise<unknown[]>;
	info(projectId: string, mediaId: string): Promise<unknown>;
	import(projectId: string, source: unknown): Promise<unknown>;
	delete(projectId: string, mediaId: string): Promise<boolean>;
	rename(projectId: string, mediaId: string, newName: string): Promise<unknown>;
	onMediaImported(callback: (data: unknown) => void): void;
}

// ---------------------------------------------------------------------------
// Claude Timeline
// ---------------------------------------------------------------------------

export interface PlatformClaudeTimelineAPI {
	export(projectId: string, format?: string): Promise<unknown>;
	import(projectId: string, data: unknown, format?: string): Promise<unknown>;
	addElement(projectId: string, element: unknown): Promise<unknown>;
	batchAddElements(projectId: string, elements: unknown[]): Promise<unknown>;
	updateElement(
		projectId: string,
		elementId: string,
		changes: unknown
	): Promise<unknown>;
	batchUpdateElements(projectId: string, updates: unknown[]): Promise<unknown>;
	removeElement(projectId: string, elementId: string): Promise<unknown>;
	batchDeleteElements(
		projectId: string,
		elements: unknown[],
		ripple?: boolean
	): Promise<unknown>;
	deleteRange(projectId: string, request: unknown): Promise<unknown>;
	arrange(projectId: string, request: unknown): Promise<unknown>;
	splitElement(
		projectId: string,
		elementId: string,
		splitTime: number,
		mode?: string
	): Promise<unknown>;
	moveElement(
		projectId: string,
		elementId: string,
		toTrackId: string,
		newStartTime: number
	): Promise<unknown>;
	selectElements(projectId: string, elements: unknown[]): Promise<unknown>;
	getSelection(projectId: string): Promise<unknown[]>;
	clearSelection(projectId: string): Promise<unknown>;

	// Event listeners
	onRequest(callback: () => void): void;
	onApply(callback: (timeline: unknown, replace?: boolean) => void): void;
	onAddElement(callback: (element: unknown) => void): void;
	onBatchAddElements(callback: (data: unknown) => void): void;
	sendBatchAddElementsResponse(requestId: string, result: unknown): void;
	onUpdateElement(callback: (data: unknown) => void): void;
	onBatchUpdateElements(callback: (data: unknown) => void): void;
	sendBatchUpdateElementsResponse(requestId: string, result: unknown): void;
	onRemoveElement(callback: (id: string) => void): void;
	onBatchDeleteElements(callback: (data: unknown) => void): void;
	sendBatchDeleteElementsResponse(requestId: string, result: unknown): void;
	onSplitElement(callback: (data: unknown) => void): void;
	sendSplitResponse(requestId: string, result: unknown): void;
	onExecuteCuts(callback: (data: unknown) => void): void;
	sendExecuteCutsResponse(requestId: string, result: unknown): void;
	onMoveElement(callback: (data: unknown) => void): void;
	onSelectElements(callback: (data: unknown) => void): void;
	onGetSelection(callback: (data: unknown) => void): void;
	sendSelectionResponse(requestId: string, elements: unknown): void;
	onClearSelection(callback: () => void): void;
	onPlayback(callback: (data: { action: string; time?: number }) => void): void;
	onDeleteRange(callback: (data: unknown) => void): void;
	sendDeleteRangeResponse(requestId: string, result: unknown): void;
	onArrange(callback: (data: unknown) => void): void;
	sendArrangeResponse(requestId: string, result: unknown): void;
	onLoadSpeech(callback: (data: unknown) => void): void;
	sendResponse(timeline: unknown): void;
	removeListeners(): void;
}

// ---------------------------------------------------------------------------
// Claude Transaction
// ---------------------------------------------------------------------------

export interface PlatformClaudeTransactionAPI {
	onBegin(
		callback: (data: {
			requestId: string;
			transactionId: string;
			label?: string;
			timeoutMs: number;
			createdAt: number;
			expiresAt: number;
		}) => void
	): void;
	sendBeginResponse(
		requestId: string,
		result: { success: boolean; error?: string; message?: string }
	): void;
	onCommit(
		callback: (data: {
			requestId: string;
			transactionId: string;
			label?: string;
		}) => void
	): void;
	sendCommitResponse(
		requestId: string,
		result: {
			success: boolean;
			error?: string;
			message?: string;
			historyEntryAdded?: boolean;
		}
	): void;
	onRollback(
		callback: (data: {
			requestId: string;
			transactionId: string;
			reason?: string;
		}) => void
	): void;
	sendRollbackResponse(
		requestId: string,
		result: { success: boolean; error?: string; message?: string }
	): void;
	onUndo(callback: (data: { requestId: string }) => void): void;
	sendUndoResponse(
		requestId: string,
		result: { applied: boolean; undoCount: number; redoCount: number }
	): void;
	onRedo(callback: (data: { requestId: string }) => void): void;
	sendRedoResponse(
		requestId: string,
		result: { applied: boolean; undoCount: number; redoCount: number }
	): void;
	onHistory(callback: (data: { requestId: string }) => void): void;
	sendHistoryResponse(
		requestId: string,
		result: {
			undoCount: number;
			redoCount: number;
			entries: Array<{
				label: string;
				timestamp: number;
				transactionId?: string;
			}>;
			redoEntries?: Array<{
				label: string;
				timestamp: number;
				transactionId?: string;
			}>;
		}
	): void;
	removeListeners(): void;
}

// ---------------------------------------------------------------------------
// Claude Project
// ---------------------------------------------------------------------------

export interface PlatformClaudeProjectAPI {
	getSettings(projectId: string): Promise<unknown>;
	updateSettings(projectId: string, settings: unknown): Promise<unknown>;
	getStats(projectId: string): Promise<unknown>;
	onStatsRequest(
		callback: (projectId: string, requestId: string) => void
	): void;
	sendStatsResponse(stats: unknown, requestId: string): void;
	onUpdated(
		callback: (projectId: string, settings: Record<string, unknown>) => void
	): void;
	removeListeners(): void;
}

// ---------------------------------------------------------------------------
// Claude Export
// ---------------------------------------------------------------------------

export interface PlatformClaudeExportAPI {
	getPresets(): Promise<unknown[]>;
	recommend(projectId: string, target?: string): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Claude Diagnostics
// ---------------------------------------------------------------------------

export interface PlatformClaudeDiagnosticsAPI {
	analyze(error: unknown): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Claude Analyze
// ---------------------------------------------------------------------------

export interface PlatformClaudeAnalyzeAPI {
	run(projectId: string, options?: Record<string, unknown>): Promise<unknown>;
	models(): Promise<unknown[]>;
}

// ---------------------------------------------------------------------------
// Claude Events
// ---------------------------------------------------------------------------

export interface PlatformClaudeEventsAPI {
	emit(event: Record<string, unknown>): void;
}

// ---------------------------------------------------------------------------
// Claude Notifications
// ---------------------------------------------------------------------------

export interface PlatformClaudeNotificationsAPI {
	enable(sessionId: string): Promise<unknown>;
	disable(): Promise<unknown>;
	status(): Promise<unknown>;
	history(limit?: number): Promise<unknown[]>;
}

// ---------------------------------------------------------------------------
// Claude Navigator
// ---------------------------------------------------------------------------

export interface PlatformClaudeNavigatorAPI {
	onProjectsRequest(callback: (data: { requestId: string }) => void): void;
	sendProjectsResponse(
		requestId: string,
		result: {
			projects: Array<{
				id: string;
				name: string;
				createdAt: string;
				updatedAt: string;
			}>;
			activeProjectId: string | null;
		}
	): void;
	onOpenRequest(
		callback: (data: { requestId: string; projectId: string }) => void
	): void;
	sendOpenResponse(
		requestId: string,
		result: { navigated: boolean; projectId: string }
	): void;
	removeListeners(): void;
}

// ---------------------------------------------------------------------------
// Claude Screen Recording Bridge
// ---------------------------------------------------------------------------

export interface PlatformClaudeScreenRecordingBridgeAPI {
	onStartRequest(
		callback: (data: {
			requestId: string;
			options: { sourceId?: string; fileName?: string };
		}) => void
	): void;
	sendStartResponse(
		requestId: string,
		result?: {
			sessionId: string;
			sourceId: string;
			sourceName: string;
			filePath: string;
			startedAt: number;
			mimeType: string | null;
		},
		error?: string
	): void;
	onStopRequest(
		callback: (data: {
			requestId: string;
			options: { discard?: boolean };
		}) => void
	): void;
	sendStopResponse(
		requestId: string,
		result?: {
			success: boolean;
			filePath: string | null;
			bytesWritten: number;
			durationMs: number;
			discarded: boolean;
		},
		error?: string
	): void;
	removeListeners(): void;
}

// ---------------------------------------------------------------------------
// Claude UI
// ---------------------------------------------------------------------------

export interface PlatformClaudeUiAPI {
	onSwitchPanelRequest(
		callback: (data: { requestId: string; panel: string; tab?: string }) => void
	): void;
	sendSwitchPanelResponse(
		requestId: string,
		result?: { switched: boolean; panel: string; group: string },
		error?: string
	): void;
	removeListeners(): void;
}

// ---------------------------------------------------------------------------
// Claude State
// ---------------------------------------------------------------------------

export interface PlatformClaudeStateAPI {
	onSnapshotRequest(
		callback: (data: { requestId: string; request?: unknown }) => void
	): void;
	sendSnapshotResponse(
		requestId: string,
		result?: unknown,
		error?: string
	): void;
	removeListeners(): void;
}

// ---------------------------------------------------------------------------
// Claude Project CRUD
// ---------------------------------------------------------------------------

export interface PlatformClaudeProjectCrudAPI {
	onCreateRequest(
		callback: (data: { requestId: string; name: string }) => void
	): void;
	sendCreateResponse(
		requestId: string,
		result?: { projectId: string; name: string },
		error?: string
	): void;
	onDeleteRequest(
		callback: (data: { requestId: string; projectId: string }) => void
	): void;
	sendDeleteResponse(
		requestId: string,
		result?: { deleted: boolean; projectId: string },
		error?: string
	): void;
	onRenameRequest(
		callback: (data: {
			requestId: string;
			projectId: string;
			name: string;
		}) => void
	): void;
	sendRenameResponse(
		requestId: string,
		result?: { renamed: boolean; projectId: string; name: string },
		error?: string
	): void;
	onDuplicateRequest(
		callback: (data: { requestId: string; projectId: string }) => void
	): void;
	sendDuplicateResponse(
		requestId: string,
		result?: {
			projectId: string;
			name: string;
			sourceProjectId: string;
		},
		error?: string
	): void;
	removeListeners(): void;
}

// ---------------------------------------------------------------------------
// Composite Claude API
// ---------------------------------------------------------------------------

export interface PlatformClaudeAPI {
	media: PlatformClaudeMediaAPI;
	timeline: PlatformClaudeTimelineAPI;
	transaction: PlatformClaudeTransactionAPI;
	project: PlatformClaudeProjectAPI;
	export: PlatformClaudeExportAPI;
	diagnostics: PlatformClaudeDiagnosticsAPI;
	analyze: PlatformClaudeAnalyzeAPI;
	events: PlatformClaudeEventsAPI;
	notifications: PlatformClaudeNotificationsAPI;
	navigator: PlatformClaudeNavigatorAPI;
	screenRecordingBridge: PlatformClaudeScreenRecordingBridgeAPI;
	ui: PlatformClaudeUiAPI;
	state: PlatformClaudeStateAPI;
	projectCrud: PlatformClaudeProjectCrudAPI;
}
