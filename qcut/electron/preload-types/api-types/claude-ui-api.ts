import type {
	AgentPointerVisualState,
	EditorEvent,
	EditorStateRequest,
	EditorStateSnapshot,
	SceneDetectionRequest,
	SceneDetectionResult,
} from "../../types/claude-api";
import type {
	QCutPersistedImportEvidenceRendererRequest,
	QCutPersistedImportEvidenceSnapshot,
} from "../../types/qcut-import-evidence-api";

/** Claude video analysis operations. */
export interface ClaudeAnalyzeAPI {
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
		scenes: (
			projectId: string,
			options: SceneDetectionRequest
		) => Promise<SceneDetectionResult>;
	};
}

/** Claude editor event emitter. */
export interface ClaudeEventsAPI {
	events: {
		emit: (
			event: Omit<EditorEvent, "eventId" | "timestamp"> &
				Partial<Pick<EditorEvent, "eventId" | "timestamp">>
		) => void;
	};
}

/** Claude notification bridge. */
export interface ClaudeNotificationsAPI {
	notifications: {
		enable: (
			sessionId: string
		) => Promise<{ enabled: boolean; sessionId: string | null }>;
		disable: () => Promise<{ enabled: boolean; sessionId: string | null }>;
		status: () => Promise<{ enabled: boolean; sessionId: string | null }>;
		history: (limit?: number) => Promise<string[]>;
	};
}

/** Claude project navigator bridge. */
export interface ClaudeNavigatorAPI {
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
}

/** Claude screen recording bridge. */
export interface ClaudeScreenRecordingBridgeAPI {
	screenRecordingBridge: {
		onStartRequest: (
			callback: (data: {
				requestId: string;
				options: {
					sourceId?: string;
					fileName?: string;
					captureMode?: string;
					recordingQuality?: string;
				};
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
				firstChunkAt?: number;
				captureStartedAt?: number;
				readyAt?: number;
				bytesWritten?: number;
				captureWidth?: number;
				captureHeight?: number;
				frameRate?: number;
				videoBitsPerSecond?: number;
				meetsFullHd?: boolean;
				sourceWidth?: number;
				sourceHeight?: number;
				outputWidth?: number;
				outputHeight?: number;
				qualityPreset?: "native" | "1080p" | "1440p" | "2160p";
				captureMode?: "editor" | "preview";
				isUpscaled?: boolean;
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
				wallDurationMs?: number;
				firstChunkAt?: number | null;
				chunkCount?: number;
				durationVerified?: boolean;
			},
			error?: string
		) => void;
		removeListeners: () => void;
	};
}

/** Claude project CRUD bridge. */
export interface ClaudeProjectCrudAPI {
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
			result?: {
				renamed: boolean;
				projectId: string;
				name: string;
			},
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
}

/** Claude UI panel switching bridge. */
export interface ClaudeUiAPI {
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
}

/** Visible Agent pointer state bridge. */
export interface ClaudePointerAPI {
	pointer: {
		onStateChange: (callback: (state: AgentPointerVisualState) => void) => void;
		removeListeners: () => void;
	};
}

/** Claude editor state snapshot bridge. */
export interface ClaudeStateAPI {
	state: {
		onSnapshotRequest: (
			callback: (data: {
				requestId: string;
				request?: EditorStateRequest;
			}) => void
		) => void;
		sendSnapshotResponse: (
			requestId: string,
			result?: EditorStateSnapshot,
			error?: string
		) => void;
		removeListeners: () => void;
	};
}

/** Trusted persisted import evidence bridge. */
export interface ClaudeImportEvidenceAPI {
	importEvidence: {
		onSnapshotRequest: (
			callback: (data: QCutPersistedImportEvidenceRendererRequest) => void
		) => void;
		sendSnapshotResponse: (
			requestId: string,
			result?: QCutPersistedImportEvidenceSnapshot,
			error?: string
		) => void;
		removeListeners: () => void;
	};
}
