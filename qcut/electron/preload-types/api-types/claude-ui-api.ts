import type {
	EditorEvent,
	EditorStateRequest,
	EditorStateSnapshot,
} from "../../types/claude-api";

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
