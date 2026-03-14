/**
 * Claude Code Integration sub-interface for ElectronAPI.
 */

import type {
	MediaFile,
	ClaudeTimeline,
	ClaudeElement,
	ClaudeSplitResponse,
	ClaudeMoveRequest,
	ClaudeSelectionItem,
	ClaudeBatchAddElementRequest,
	ClaudeBatchAddResponse,
	ClaudeBatchDeleteItemRequest,
	ClaudeBatchDeleteResponse,
	ClaudeBatchUpdateItemRequest,
	ClaudeBatchUpdateResponse,
	ClaudeArrangeRequest,
	ClaudeArrangeResponse,
	ClaudeRangeDeleteRequest,
	ClaudeRangeDeleteResponse,
	BatchCutResponse,
	ProjectSettings,
	ProjectStats,
	ExportPreset,
	ExportRecommendation,
	ErrorReport,
	DiagnosticResult,
	EditorEvent,
} from "../../../../../electron/types/claude-api";

type EmitPayload = Omit<EditorEvent, "eventId" | "timestamp"> &
	Partial<Pick<EditorEvent, "eventId" | "timestamp">>;

export interface ElectronClaudeOps {
	claude?: {
		events: {
			emit: (event: EmitPayload) => void;
		};
		media: {
			list: (projectId: string) => Promise<MediaFile[]>;
			info: (projectId: string, mediaId: string) => Promise<MediaFile | null>;
			import: (projectId: string, source: string) => Promise<MediaFile | null>;
			delete: (projectId: string, mediaId: string) => Promise<boolean>;
			rename: (
				projectId: string,
				mediaId: string,
				newName: string
			) => Promise<boolean>;
			onMediaImported: (
				callback: (data: {
					path: string;
					name: string;
					id: string;
					type: string;
					size: number;
				}) => void
			) => void;
		};
		search: {
			loadTranscriptions: (projectId: string) => Promise<unknown[]>;
		};
		timeline: {
			export: (projectId: string, format: "json" | "md") => Promise<string>;
			import: (
				projectId: string,
				data: string,
				format: "json" | "md"
			) => Promise<void>;
			addElement: (
				projectId: string,
				element: Partial<ClaudeElement>
			) => Promise<string>;
			batchAddElements: (
				projectId: string,
				elements: ClaudeBatchAddElementRequest[]
			) => Promise<ClaudeBatchAddResponse>;
			updateElement: (
				projectId: string,
				elementId: string,
				changes: Partial<ClaudeElement>
			) => Promise<void>;
			batchUpdateElements: (
				projectId: string,
				updates: ClaudeBatchUpdateItemRequest[]
			) => Promise<ClaudeBatchUpdateResponse>;
			removeElement: (projectId: string, elementId: string) => Promise<void>;
			batchDeleteElements: (
				projectId: string,
				elements: ClaudeBatchDeleteItemRequest[],
				ripple?: boolean
			) => Promise<ClaudeBatchDeleteResponse>;
			deleteRange: (
				projectId: string,
				request: ClaudeRangeDeleteRequest
			) => Promise<ClaudeRangeDeleteResponse>;
			arrange: (
				projectId: string,
				request: ClaudeArrangeRequest
			) => Promise<ClaudeArrangeResponse>;
			splitElement: (
				projectId: string,
				elementId: string,
				splitTime: number,
				mode?: "split" | "keepLeft" | "keepRight"
			) => Promise<ClaudeSplitResponse>;
			moveElement: (
				projectId: string,
				elementId: string,
				toTrackId: string,
				newStartTime?: number
			) => Promise<void>;
			selectElements: (
				projectId: string,
				elements: ClaudeSelectionItem[]
			) => Promise<void>;
			getSelection: (projectId: string) => Promise<ClaudeSelectionItem[]>;
			clearSelection: (projectId: string) => Promise<void>;
			onRequest: (callback: () => void) => void;
			onApply: (
				callback: (timeline: ClaudeTimeline, replace?: boolean) => void
			) => void;
			onAddElement: (
				callback: (element: Partial<ClaudeElement>) => void
			) => void;
			onBatchAddElements: (
				callback: (data: {
					requestId: string;
					elements: ClaudeBatchAddElementRequest[];
				}) => void
			) => void;
			sendBatchAddElementsResponse: (
				requestId: string,
				result: ClaudeBatchAddResponse
			) => void;
			onUpdateElement: (
				callback: (data: {
					elementId: string;
					changes: Partial<ClaudeElement>;
				}) => void
			) => void;
			onBatchUpdateElements: (
				callback: (data: {
					requestId: string;
					updates: ClaudeBatchUpdateItemRequest[];
				}) => void
			) => void;
			sendBatchUpdateElementsResponse: (
				requestId: string,
				result: ClaudeBatchUpdateResponse
			) => void;
			onRemoveElement: (callback: (elementId: string) => void) => void;
			onBatchDeleteElements: (
				callback: (data: {
					requestId: string;
					elements: ClaudeBatchDeleteItemRequest[];
					ripple?: boolean;
				}) => void
			) => void;
			sendBatchDeleteElementsResponse: (
				requestId: string,
				result: ClaudeBatchDeleteResponse
			) => void;
			onSplitElement: (
				callback: (data: {
					requestId: string;
					elementId: string;
					splitTime: number;
					mode: "split" | "keepLeft" | "keepRight";
				}) => void
			) => void;
			sendSplitResponse: (
				requestId: string,
				result: ClaudeSplitResponse
			) => void;
			onExecuteCuts: (
				callback: (data: {
					requestId: string;
					elementId: string;
					cuts: Array<{ start: number; end: number }>;
					ripple: boolean;
				}) => void
			) => void;
			sendExecuteCutsResponse: (
				requestId: string,
				result: BatchCutResponse
			) => void;
			onMoveElement: (
				callback: (data: {
					elementId: string;
					toTrackId: string;
					newStartTime?: number;
				}) => void
			) => void;
			onSelectElements: (
				callback: (data: { elements: ClaudeSelectionItem[] }) => void
			) => void;
			onGetSelection: (callback: (data: { requestId: string }) => void) => void;
			sendSelectionResponse: (
				requestId: string,
				elements: ClaudeSelectionItem[]
			) => void;
			onClearSelection: (callback: () => void) => void;
			onPlayback: (
				callback: (data: { action: string; time?: number }) => void
			) => void;
			onDeleteRange: (
				callback: (data: {
					requestId: string;
					request: ClaudeRangeDeleteRequest;
				}) => void
			) => void;
			sendDeleteRangeResponse: (
				requestId: string,
				result: ClaudeRangeDeleteResponse
			) => void;
			onArrange: (
				callback: (data: {
					requestId: string;
					request: ClaudeArrangeRequest;
				}) => void
			) => void;
			sendArrangeResponse: (
				requestId: string,
				result: ClaudeArrangeResponse
			) => void;
			onLoadSpeech: (
				callback: (data: {
					text: string;
					language_code: string;
					language_probability: number;
					words: Array<{
						text: string;
						start: number;
						end: number;
						type: string;
						speaker_id: string | null;
					}>;
					fileName: string;
				}) => void
			) => void;
			sendResponse: (timeline: ClaudeTimeline) => void;
			removeListeners: () => void;
		};
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
				callback: (
					projectId: string,
					settings: Partial<ProjectSettings>
				) => void
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
		analyze: {
			run: (
				projectId: string,
				options: {
					source: {
						type: "timeline" | "media" | "path";
						elementId?: string;
						mediaId?: string;
						filePath?: string;
					};
					analysisType?: "timeline" | "describe" | "transcribe";
					model?: string;
					format?: "md" | "json" | "both";
				}
			) => Promise<{
				success: boolean;
				markdown?: string;
				json?: Record<string, unknown>;
				outputFiles?: string[];
				videoPath?: string;
				duration?: number;
				cost?: number;
				error?: string;
			}>;
			models: () => Promise<{
				models: Array<{
					key: string;
					provider: string;
					modelId: string;
					description: string;
				}>;
			}>;
		};
		navigator: {
			onProjectsRequest: (
				callback: (data: { requestId: string }) => void
			) => void;
			sendProjectsResponse: (
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
			) => void;
			onOpenRequest: (
				callback: (data: { requestId: string; projectId: string }) => void
			) => void;
			sendOpenResponse: (
				requestId: string,
				result: { navigated: boolean; projectId: string }
			) => void;
			removeListeners: () => void;
		};
		screenRecordingBridge: {
			onStartRequest: (
				callback: (data: {
					requestId: string;
					options: { sourceId?: string; fileName?: string };
				}) => void
			) => void;
			sendStartResponse: (
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
			) => void;
			onStopRequest: (
				callback: (data: {
					requestId: string;
					options: { discard?: boolean };
				}) => void
			) => void;
			sendStopResponse: (
				requestId: string,
				result?: {
					success: boolean;
					filePath: string | null;
					bytesWritten: number;
					durationMs: number;
					discarded: boolean;
				},
				error?: string
			) => void;
			removeListeners: () => void;
		};
		projectCrud: {
			onCreateRequest: (
				callback: (data: { requestId: string; name: string }) => void
			) => void;
			sendCreateResponse: (
				requestId: string,
				result?: { projectId: string; name: string },
				error?: string
			) => void;
			onDeleteRequest: (
				callback: (data: { requestId: string; projectId: string }) => void
			) => void;
			sendDeleteResponse: (
				requestId: string,
				result?: { deleted: boolean; projectId: string },
				error?: string
			) => void;
			onRenameRequest: (
				callback: (data: {
					requestId: string;
					projectId: string;
					name: string;
				}) => void
			) => void;
			sendRenameResponse: (
				requestId: string,
				result?: { renamed: boolean; projectId: string; name: string },
				error?: string
			) => void;
			onDuplicateRequest: (
				callback: (data: { requestId: string; projectId: string }) => void
			) => void;
			sendDuplicateResponse: (
				requestId: string,
				result?: {
					projectId: string;
					name: string;
					sourceProjectId: string;
				},
				error?: string
			) => void;
			removeListeners: () => void;
		};
		ui: {
			onSwitchPanelRequest: (
				callback: (data: {
					requestId: string;
					panel: string;
					tab?: string;
				}) => void
			) => void;
			sendSwitchPanelResponse: (
				requestId: string,
				result?: { switched: boolean; panel: string; group: string },
				error?: string
			) => void;
			removeListeners: () => void;
		};
	};
}

// Re-export claude-api types that consumers may need
export type {
	MediaFile,
	ClaudeTimeline,
	ClaudeElement,
	ClaudeSplitResponse,
	ClaudeMoveRequest,
	ClaudeSelectionItem,
	ClaudeBatchAddElementRequest,
	ClaudeBatchAddResponse,
	ClaudeBatchDeleteItemRequest,
	ClaudeBatchDeleteResponse,
	ClaudeBatchUpdateItemRequest,
	ClaudeBatchUpdateResponse,
	ClaudeArrangeRequest,
	ClaudeArrangeResponse,
	ClaudeRangeDeleteRequest,
	ClaudeRangeDeleteResponse,
	BatchCutResponse,
	ProjectSettings,
	ProjectStats,
	ExportPreset,
	ExportRecommendation,
	ErrorReport,
	DiagnosticResult,
};
