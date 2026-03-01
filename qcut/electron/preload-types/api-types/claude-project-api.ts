import type {
	ProjectSettings,
	ProjectStats,
	ExportPreset,
	ExportRecommendation,
	ErrorReport,
	DiagnosticResult,
} from "../../types/claude-api";

/** Claude transaction operations (begin, commit, rollback, undo, redo, history). */
export interface ClaudeTransactionAPI {
	transaction: {
		onBegin: (
			callback: (data: {
				requestId: string;
				transactionId: string;
				label?: string;
				timeoutMs: number;
				createdAt: number;
				expiresAt: number;
			}) => void
		) => void;
		sendBeginResponse: (
			requestId: string,
			result: {
				success: boolean;
				error?: string;
				message?: string;
			}
		) => void;
		onCommit: (
			callback: (data: {
				requestId: string;
				transactionId: string;
				label?: string;
			}) => void
		) => void;
		sendCommitResponse: (
			requestId: string,
			result: {
				success: boolean;
				error?: string;
				message?: string;
				historyEntryAdded?: boolean;
			}
		) => void;
		onRollback: (
			callback: (data: {
				requestId: string;
				transactionId: string;
				reason?: string;
			}) => void
		) => void;
		sendRollbackResponse: (
			requestId: string,
			result: {
				success: boolean;
				error?: string;
				message?: string;
			}
		) => void;
		onUndo: (callback: (data: { requestId: string }) => void) => void;
		sendUndoResponse: (
			requestId: string,
			result: {
				applied: boolean;
				undoCount: number;
				redoCount: number;
			}
		) => void;
		onRedo: (callback: (data: { requestId: string }) => void) => void;
		sendRedoResponse: (
			requestId: string,
			result: {
				applied: boolean;
				undoCount: number;
				redoCount: number;
			}
		) => void;
		onHistory: (callback: (data: { requestId: string }) => void) => void;
		sendHistoryResponse: (
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
		) => void;
		removeListeners: () => void;
	};
}

/** Claude project settings, stats, export presets. */
export interface ClaudeProjectAPI {
	project: {
		getSettings: (projectId: string) => Promise<ProjectSettings>;
		updateSettings: (
			projectId: string,
			settings: Partial<ProjectSettings>
		) => Promise<void>;
		getStats: (projectId: string) => Promise<ProjectStats>;
		onStatsRequest: (
			callback: (projectId: string, requestId: string) => void
		) => void;
		sendStatsResponse: (stats: ProjectStats, requestId: string) => void;
		onUpdated: (
			callback: (projectId: string, settings: Partial<ProjectSettings>) => void
		) => void;
		removeListeners: () => void;
	};
	export: {
		getPresets: () => Promise<ExportPreset[]>;
		recommend: (
			projectId: string,
			target: string
		) => Promise<ExportRecommendation>;
	};
	diagnostics: {
		analyze: (error: ErrorReport) => Promise<DiagnosticResult>;
	};
}
