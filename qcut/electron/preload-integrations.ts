/**
 * Preload integration API builders.
 *
 * Each function returns an API group object that gets spread
 * into the main electronAPI in preload.ts.
 *
 * @module electron/preload-integrations
 */

import { ipcRenderer, type IpcRendererEvent } from "electron";
import type {
	ElectronAPI,
	Skill,
	MediaImportOptions,
	MediaImportResult,
} from "./preload-types.js";
import type {
	MediaFile,
	ClaudeTimeline,
	ClaudeElement,
	ClaudeSplitResponse,
	ClaudeMoveRequest,
	ClaudeSelectionItem,
	ProjectSettings,
	ProjectStats,
	ExportPreset,
	ExportRecommendation,
	ErrorReport,
	DiagnosticResult,
	EditorEvent,
	EditorStateRequest,
	EditorStateSnapshot,
} from "./types/claude-api.js";
import type {
	QCutPersistedImportEvidenceRendererRequest,
	QCutPersistedImportEvidenceSnapshot,
} from "./types/qcut-import-evidence-api.js";
import type {
	QCutSameProfileWritebackRendererRequest,
	QCutSameProfileWritebackResult,
} from "./types/qcut-same-profile-writeback-api.js";
import type {
	QCutJianyingProjectImportRendererRequest,
	QCutJianyingProjectImportResult,
} from "./types/qcut-jianying-project-import-api.js";
import type {
	QCutJianyingProjectExportRendererRequest,
	QCutJianyingProjectExportResult,
} from "./types/qcut-jianying-project-export-api.js";

// ============================================================================
// PTY Terminal
// ============================================================================

/** Create the PTY terminal API for the renderer process. */
export function createPtyAPI(): ElectronAPI["pty"] {
	return {
		spawn: (options?) => ipcRenderer.invoke("pty:spawn", options),
		write: (sessionId, data) =>
			ipcRenderer.invoke("pty:write", sessionId, data),
		resize: (sessionId, cols, rows) =>
			ipcRenderer.invoke("pty:resize", sessionId, cols, rows),
		kill: (sessionId) => ipcRenderer.invoke("pty:kill", sessionId),
		killAll: () => ipcRenderer.invoke("pty:kill-all"),
		onData: (callback) => {
			ipcRenderer.removeAllListeners("pty:data");
			ipcRenderer.on("pty:data", (_, data) => callback(data));
		},
		onExit: (callback) => {
			ipcRenderer.removeAllListeners("pty:exit");
			ipcRenderer.on("pty:exit", (_, data) => callback(data));
		},
		removeListeners: () => {
			ipcRenderer.removeAllListeners("pty:data");
			ipcRenderer.removeAllListeners("pty:exit");
		},
	};
}

// ============================================================================
// MCP App Bridge
// ============================================================================

/** Create the MCP app bridge API for the renderer process. */
export function createMcpAPI(): NonNullable<ElectronAPI["mcp"]> {
	return {
		onAppHtml: (callback) => {
			ipcRenderer.removeAllListeners("mcp:app-html");
			ipcRenderer.on("mcp:app-html", (_, payload) => callback(payload));
		},
		removeListeners: () => {
			ipcRenderer.removeAllListeners("mcp:app-html");
		},
	};
}

// ============================================================================
// Skills
// ============================================================================

/** Create the skills management API for the renderer process. */
export function createSkillsAPI(): NonNullable<ElectronAPI["skills"]> {
	return {
		list: (projectId) => ipcRenderer.invoke("skills:list", projectId),
		import: (projectId, sourcePath) =>
			ipcRenderer.invoke("skills:import", projectId, sourcePath),
		delete: (projectId, skillId) =>
			ipcRenderer.invoke("skills:delete", projectId, skillId),
		getContent: (projectId, skillId, filename) =>
			ipcRenderer.invoke("skills:getContent", projectId, skillId, filename),
		browse: () => ipcRenderer.invoke("skills:browse"),
		getPath: (projectId) => ipcRenderer.invoke("skills:getPath", projectId),
		scanGlobal: () => ipcRenderer.invoke("skills:scanGlobal"),
		syncForClaude: (projectId) =>
			ipcRenderer.invoke("skills:syncForClaude", projectId),
	};
}

// ============================================================================
// AI Pipeline
// ============================================================================

/** Create the AI content pipeline API for the renderer process. */
export function createAIPipelineAPI(): NonNullable<ElectronAPI["aiPipeline"]> {
	return {
		check: () => ipcRenderer.invoke("ai-pipeline:check"),
		status: () => ipcRenderer.invoke("ai-pipeline:status"),
		generate: (options) => ipcRenderer.invoke("ai-pipeline:generate", options),
		listModels: () => ipcRenderer.invoke("ai-pipeline:list-models"),
		estimateCost: (options) =>
			ipcRenderer.invoke("ai-pipeline:estimate-cost", options),
		cancel: (sessionId) => ipcRenderer.invoke("ai-pipeline:cancel", sessionId),
		refresh: () => ipcRenderer.invoke("ai-pipeline:refresh"),
		onProgress: (callback) => {
			const handler = (
				_event: IpcRendererEvent,
				progress: {
					stage: string;
					percent: number;
					message: string;
					model?: string;
					eta?: number;
					sessionId?: string;
				}
			) => callback(progress);
			ipcRenderer.on("ai-pipeline:progress", handler);
			return () => {
				ipcRenderer.removeListener("ai-pipeline:progress", handler);
			};
		},
	};
}

// ============================================================================
// Media Import
// ============================================================================

/** Create the media import API for the renderer process. */
export function createMediaImportAPI(): NonNullable<
	ElectronAPI["mediaImport"]
> {
	return {
		import: (options) => ipcRenderer.invoke("media-import:import", options),
		validateSymlink: (path) =>
			ipcRenderer.invoke("media-import:validate-symlink", path),
		locateOriginal: (mediaPath) =>
			ipcRenderer.invoke("media-import:locate-original", mediaPath),
		relinkMedia: (projectId, mediaId, newSourcePath) =>
			ipcRenderer.invoke(
				"media-import:relink",
				projectId,
				mediaId,
				newSourcePath
			),
		remove: (projectId, mediaId) =>
			ipcRenderer.invoke("media-import:remove", projectId, mediaId),
		checkSymlinkSupport: () =>
			ipcRenderer.invoke("media-import:check-symlink-support"),
		getMediaPath: (projectId) =>
			ipcRenderer.invoke("media-import:get-media-path", projectId),
	};
}

// ============================================================================
// Project Folder
// ============================================================================

/** Create the project folder API for the renderer process. */
export function createProjectFolderAPI(): NonNullable<
	ElectronAPI["projectFolder"]
> {
	return {
		getRoot: (projectId) =>
			ipcRenderer.invoke("project-folder:get-root", projectId),
		scan: (projectId, subPath?, options?) =>
			ipcRenderer.invoke("project-folder:scan", projectId, subPath, options),
		list: (projectId, subPath?) =>
			ipcRenderer.invoke("project-folder:list", projectId, subPath),
		ensureStructure: (projectId) =>
			ipcRenderer.invoke("project-folder:ensure-structure", projectId),
	};
}

// ============================================================================
// Claude Code Integration
// ============================================================================

/** Create the Claude code integration API for the renderer process. */
export function createClaudeAPI(): NonNullable<ElectronAPI["claude"]> {
	return {
		media: {
			list: (projectId) => ipcRenderer.invoke("claude:media:list", projectId),
			info: (projectId, mediaId) =>
				ipcRenderer.invoke("claude:media:info", projectId, mediaId),
			import: (projectId, source) =>
				ipcRenderer.invoke("claude:media:import", projectId, source),
			delete: (projectId, mediaId) =>
				ipcRenderer.invoke("claude:media:delete", projectId, mediaId),
			rename: (projectId, mediaId, newName) =>
				ipcRenderer.invoke("claude:media:rename", projectId, mediaId, newName),
			onMediaImported: (callback) => {
				ipcRenderer.removeAllListeners("claude:media:imported");
				ipcRenderer.on("claude:media:imported", (_, data) => callback(data));
			},
		},
		search: {
			loadTranscriptions: (projectId) =>
				ipcRenderer.invoke("claude:search:transcriptions", projectId),
		},
		timeline: {
			export: (projectId, format) =>
				ipcRenderer.invoke("claude:timeline:export", projectId, format),
			import: (projectId, data, format) =>
				ipcRenderer.invoke("claude:timeline:import", projectId, data, format),
			addElement: (projectId, element) =>
				ipcRenderer.invoke("claude:timeline:addElement", projectId, element),
			batchAddElements: (projectId, elements) =>
				ipcRenderer.invoke(
					"claude:timeline:batchAddElements",
					projectId,
					elements
				),
			updateElement: (projectId, elementId, changes) =>
				ipcRenderer.invoke(
					"claude:timeline:updateElement",
					projectId,
					elementId,
					changes
				),
			batchUpdateElements: (projectId, updates) =>
				ipcRenderer.invoke(
					"claude:timeline:batchUpdateElements",
					projectId,
					updates
				),
			removeElement: (projectId, elementId) =>
				ipcRenderer.invoke(
					"claude:timeline:removeElement",
					projectId,
					elementId
				),
			batchDeleteElements: (projectId, elements, ripple) =>
				ipcRenderer.invoke(
					"claude:timeline:batchDeleteElements",
					projectId,
					elements,
					ripple
				),
			deleteRange: (projectId, request) =>
				ipcRenderer.invoke("claude:timeline:deleteRange", projectId, request),
			arrange: (projectId, request) =>
				ipcRenderer.invoke("claude:timeline:arrange", projectId, request),
			trackOperation: (projectId, request) =>
				ipcRenderer.invoke(
					"claude:timeline:trackOperation",
					projectId,
					request
				),
			splitElement: (projectId, elementId, splitTime, mode) =>
				ipcRenderer.invoke(
					"claude:timeline:splitElement",
					projectId,
					elementId,
					splitTime,
					mode
				),
			moveElement: (projectId, elementId, toTrackId, newStartTime) =>
				ipcRenderer.invoke(
					"claude:timeline:moveElement",
					projectId,
					elementId,
					toTrackId,
					newStartTime
				),
			selectElements: (projectId, elements) =>
				ipcRenderer.invoke(
					"claude:timeline:selectElements",
					projectId,
					elements
				),
			getSelection: (projectId) =>
				ipcRenderer.invoke("claude:timeline:getSelection", projectId),
			clearSelection: (projectId) =>
				ipcRenderer.invoke("claude:timeline:clearSelection", projectId),
			onRequest: (callback) => {
				ipcRenderer.removeAllListeners("claude:timeline:request");
				ipcRenderer.on("claude:timeline:request", () => callback());
			},
			onApply: (callback) => {
				ipcRenderer.removeAllListeners("claude:timeline:apply");
				ipcRenderer.on(
					"claude:timeline:apply",
					(_, data: { timeline: any; replace?: boolean } | any) => {
						// Support both new {timeline, replace} format and legacy raw timeline
						if (
							data &&
							data.timeline &&
							typeof data.timeline === "object" &&
							"tracks" in data.timeline
						) {
							callback(data.timeline, data.replace);
						} else {
							callback(data, false);
						}
					}
				);
			},
			onAddElement: (callback) => {
				ipcRenderer.removeAllListeners("claude:timeline:addElement");
				ipcRenderer.on("claude:timeline:addElement", (_, element) =>
					callback(element)
				);
			},
			onBatchAddElements: (callback) => {
				ipcRenderer.removeAllListeners("claude:timeline:batchAddElements");
				ipcRenderer.on("claude:timeline:batchAddElements", (_, data) =>
					callback(data)
				);
			},
			sendBatchAddElementsResponse: (requestId, result) => {
				ipcRenderer.send("claude:timeline:batchAddElements:response", {
					requestId,
					result,
				});
			},
			onUpdateElement: (callback) => {
				ipcRenderer.removeAllListeners("claude:timeline:updateElement");
				ipcRenderer.on("claude:timeline:updateElement", (_, data) =>
					callback(data)
				);
			},
			onBatchUpdateElements: (callback) => {
				ipcRenderer.removeAllListeners("claude:timeline:batchUpdateElements");
				ipcRenderer.on("claude:timeline:batchUpdateElements", (_, data) =>
					callback(data)
				);
			},
			sendBatchUpdateElementsResponse: (requestId, result) => {
				ipcRenderer.send("claude:timeline:batchUpdateElements:response", {
					requestId,
					result,
				});
			},
			onRemoveElement: (callback) => {
				ipcRenderer.removeAllListeners("claude:timeline:removeElement");
				ipcRenderer.on("claude:timeline:removeElement", (_, id) =>
					callback(id)
				);
			},
			onBatchDeleteElements: (callback) => {
				ipcRenderer.removeAllListeners("claude:timeline:batchDeleteElements");
				ipcRenderer.on("claude:timeline:batchDeleteElements", (_, data) =>
					callback(data)
				);
			},
			sendBatchDeleteElementsResponse: (requestId, result) => {
				ipcRenderer.send("claude:timeline:batchDeleteElements:response", {
					requestId,
					result,
				});
			},
			onSplitElement: (callback) => {
				ipcRenderer.removeAllListeners("claude:timeline:splitElement");
				ipcRenderer.on("claude:timeline:splitElement", (_, data) =>
					callback(data)
				);
			},
			sendSplitResponse: (requestId, result) => {
				ipcRenderer.send("claude:timeline:splitElement:response", {
					requestId,
					result,
				});
			},
			onExecuteCuts: (callback) => {
				ipcRenderer.removeAllListeners("claude:timeline:executeCuts");
				ipcRenderer.on("claude:timeline:executeCuts", (_, data) =>
					callback(data)
				);
			},
			sendExecuteCutsResponse: (requestId, result) => {
				ipcRenderer.send("claude:timeline:executeCuts:response", {
					requestId,
					result,
				});
			},
			onMoveElement: (callback) => {
				ipcRenderer.removeAllListeners("claude:timeline:moveElement");
				ipcRenderer.on("claude:timeline:moveElement", (_, data) =>
					callback(data)
				);
			},
			onSelectElements: (callback) => {
				ipcRenderer.removeAllListeners("claude:timeline:selectElements");
				ipcRenderer.on("claude:timeline:selectElements", (_, data) =>
					callback(data)
				);
			},
			onGetSelection: (callback) => {
				ipcRenderer.removeAllListeners("claude:timeline:getSelection");
				ipcRenderer.on("claude:timeline:getSelection", (_, data) =>
					callback(data)
				);
			},
			sendSelectionResponse: (requestId, elements) => {
				ipcRenderer.send("claude:timeline:getSelection:response", {
					requestId,
					elements,
				});
			},
			onClearSelection: (callback) => {
				ipcRenderer.removeAllListeners("claude:timeline:clearSelection");
				ipcRenderer.on("claude:timeline:clearSelection", () => callback());
			},
			onPlayback: (
				callback: (data: { action: string; time?: number }) => void
			) => {
				ipcRenderer.removeAllListeners("claude:timeline:playback");
				ipcRenderer.on(
					"claude:timeline:playback",
					(_: unknown, data: { action: string; time?: number }) =>
						callback(data)
				);
			},
			onDeleteRange: (callback) => {
				ipcRenderer.removeAllListeners("claude:timeline:deleteRange");
				ipcRenderer.on("claude:timeline:deleteRange", (_, data) =>
					callback(data)
				);
			},
			sendDeleteRangeResponse: (requestId, result) => {
				ipcRenderer.send("claude:timeline:deleteRange:response", {
					requestId,
					result,
				});
			},
			onArrange: (callback) => {
				ipcRenderer.removeAllListeners("claude:timeline:arrange");
				ipcRenderer.on("claude:timeline:arrange", (_, data) => callback(data));
			},
			sendArrangeResponse: (requestId, result) => {
				ipcRenderer.send("claude:timeline:arrange:response", {
					requestId,
					result,
				});
			},
			onTrackOperation: (callback) => {
				ipcRenderer.removeAllListeners("claude:timeline:trackOperation");
				ipcRenderer.on("claude:timeline:trackOperation", (_, data) =>
					callback(data)
				);
			},
			sendTrackOperationResponse: (requestId, result) => {
				ipcRenderer.send("claude:timeline:trackOperation:response", {
					requestId,
					result,
				});
			},
			onLoadSpeech: (callback) => {
				ipcRenderer.removeAllListeners("claude:speech:load");
				ipcRenderer.on("claude:speech:load", (_, data) => callback(data));
			},
			sendResponse: (timeline) => {
				ipcRenderer.send("claude:timeline:response", timeline);
			},
			removeListeners: () => {
				ipcRenderer.removeAllListeners("claude:timeline:request");
				ipcRenderer.removeAllListeners("claude:timeline:apply");
				ipcRenderer.removeAllListeners("claude:timeline:addElement");
				ipcRenderer.removeAllListeners("claude:timeline:batchAddElements");
				ipcRenderer.removeAllListeners("claude:timeline:updateElement");
				ipcRenderer.removeAllListeners("claude:timeline:batchUpdateElements");
				ipcRenderer.removeAllListeners("claude:timeline:removeElement");
				ipcRenderer.removeAllListeners("claude:timeline:batchDeleteElements");
				ipcRenderer.removeAllListeners("claude:timeline:splitElement");
				ipcRenderer.removeAllListeners("claude:timeline:executeCuts");
				ipcRenderer.removeAllListeners("claude:timeline:moveElement");
				ipcRenderer.removeAllListeners("claude:timeline:selectElements");
				ipcRenderer.removeAllListeners("claude:timeline:getSelection");
				ipcRenderer.removeAllListeners("claude:timeline:clearSelection");
				ipcRenderer.removeAllListeners("claude:timeline:playback");
				ipcRenderer.removeAllListeners("claude:timeline:deleteRange");
				ipcRenderer.removeAllListeners("claude:timeline:arrange");
				ipcRenderer.removeAllListeners("claude:timeline:trackOperation");
				ipcRenderer.removeAllListeners("claude:speech:load");
			},
		},
		transaction: {
			onBegin: (callback) => {
				ipcRenderer.removeAllListeners("claude:transaction:begin");
				ipcRenderer.on("claude:transaction:begin", (_, data) => callback(data));
			},
			sendBeginResponse: (requestId, result) => {
				ipcRenderer.send("claude:transaction:begin:response", {
					requestId,
					result,
				});
			},
			onCommit: (callback) => {
				ipcRenderer.removeAllListeners("claude:transaction:commit");
				ipcRenderer.on("claude:transaction:commit", (_, data) =>
					callback(data)
				);
			},
			sendCommitResponse: (requestId, result) => {
				ipcRenderer.send("claude:transaction:commit:response", {
					requestId,
					result,
				});
			},
			onRollback: (callback) => {
				ipcRenderer.removeAllListeners("claude:transaction:rollback");
				ipcRenderer.on("claude:transaction:rollback", (_, data) =>
					callback(data)
				);
			},
			sendRollbackResponse: (requestId, result) => {
				ipcRenderer.send("claude:transaction:rollback:response", {
					requestId,
					result,
				});
			},
			onUndo: (callback) => {
				ipcRenderer.removeAllListeners("claude:transaction:undo");
				ipcRenderer.on("claude:transaction:undo", (_, data) => callback(data));
			},
			sendUndoResponse: (requestId, result) => {
				ipcRenderer.send("claude:transaction:undo:response", {
					requestId,
					result,
				});
			},
			onRedo: (callback) => {
				ipcRenderer.removeAllListeners("claude:transaction:redo");
				ipcRenderer.on("claude:transaction:redo", (_, data) => callback(data));
			},
			sendRedoResponse: (requestId, result) => {
				ipcRenderer.send("claude:transaction:redo:response", {
					requestId,
					result,
				});
			},
			onHistory: (callback) => {
				ipcRenderer.removeAllListeners("claude:transaction:history");
				ipcRenderer.on("claude:transaction:history", (_, data) =>
					callback(data)
				);
			},
			sendHistoryResponse: (requestId, result) => {
				ipcRenderer.send("claude:transaction:history:response", {
					requestId,
					result,
				});
			},
			removeListeners: () => {
				ipcRenderer.removeAllListeners("claude:transaction:begin");
				ipcRenderer.removeAllListeners("claude:transaction:commit");
				ipcRenderer.removeAllListeners("claude:transaction:rollback");
				ipcRenderer.removeAllListeners("claude:transaction:undo");
				ipcRenderer.removeAllListeners("claude:transaction:redo");
				ipcRenderer.removeAllListeners("claude:transaction:history");
			},
		},
		project: {
			getSettings: (projectId) =>
				ipcRenderer.invoke("claude:project:getSettings", projectId),
			updateSettings: (projectId, settings) =>
				ipcRenderer.invoke(
					"claude:project:updateSettings",
					projectId,
					settings
				),
			getStats: (projectId) =>
				ipcRenderer.invoke("claude:project:getStats", projectId),
			onStatsRequest: (callback) => {
				ipcRenderer.removeAllListeners("claude:project:statsRequest");
				ipcRenderer.on(
					"claude:project:statsRequest",
					(_event, { projectId, requestId }) => callback(projectId, requestId)
				);
			},
			sendStatsResponse: (stats, requestId) => {
				ipcRenderer.send("claude:project:statsResponse", stats, requestId);
			},
			onUpdated: (callback) => {
				ipcRenderer.removeAllListeners("claude:project:updated");
				ipcRenderer.on("claude:project:updated", (_, projectId, settings) =>
					callback(projectId, settings)
				);
			},
			removeListeners: () => {
				ipcRenderer.removeAllListeners("claude:project:statsRequest");
				ipcRenderer.removeAllListeners("claude:project:updated");
			},
		},
		export: {
			getPresets: () => ipcRenderer.invoke("claude:export:getPresets"),
			recommend: (projectId, target) =>
				ipcRenderer.invoke("claude:export:recommend", projectId, target),
		},
		diagnostics: {
			analyze: (error) =>
				ipcRenderer.invoke("claude:diagnostics:analyze", error),
		},
		analyze: {
			run: (projectId, options) =>
				ipcRenderer.invoke("claude:analyze:run", projectId, options),
			models: () => ipcRenderer.invoke("claude:analyze:models"),
			scenes: (projectId, options) =>
				ipcRenderer.invoke("claude:analyze:scenes", projectId, options),
		},
		events: {
			emit: (
				event: Omit<EditorEvent, "eventId" | "timestamp"> &
					Partial<Pick<EditorEvent, "eventId" | "timestamp">>
			) => {
				ipcRenderer.send("claude:events:emit", event);
			},
		},
		notifications: {
			enable: (sessionId) =>
				ipcRenderer.invoke("claude:notifications:enable", { sessionId }),
			disable: () => ipcRenderer.invoke("claude:notifications:disable"),
			status: () => ipcRenderer.invoke("claude:notifications:status"),
			history: (limit) =>
				ipcRenderer.invoke("claude:notifications:history", { limit }),
		},
		navigator: {
			onProjectsRequest: (callback) => {
				ipcRenderer.removeAllListeners("claude:navigator:projects:request");
				ipcRenderer.on("claude:navigator:projects:request", (_, data) =>
					callback(data)
				);
			},
			sendProjectsResponse: (requestId, result) => {
				ipcRenderer.send("claude:navigator:projects:response", {
					requestId,
					result,
				});
			},
			onOpenRequest: (callback) => {
				ipcRenderer.removeAllListeners("claude:navigator:open:request");
				ipcRenderer.on("claude:navigator:open:request", (_, data) =>
					callback(data)
				);
			},
			sendOpenResponse: (requestId, result) => {
				ipcRenderer.send("claude:navigator:open:response", {
					requestId,
					result,
				});
			},
			removeListeners: () => {
				ipcRenderer.removeAllListeners("claude:navigator:projects:request");
				ipcRenderer.removeAllListeners("claude:navigator:open:request");
			},
		},
		screenRecordingBridge: {
			onStartRequest: (callback) => {
				ipcRenderer.removeAllListeners("claude:screen-recording:start:request");
				ipcRenderer.on("claude:screen-recording:start:request", (_, data) =>
					callback(data)
				);
			},
			sendStartResponse: (requestId, result, error) => {
				ipcRenderer.send("claude:screen-recording:start:response", {
					requestId,
					result,
					error,
				});
			},
			onStopRequest: (callback) => {
				ipcRenderer.removeAllListeners("claude:screen-recording:stop:request");
				ipcRenderer.on("claude:screen-recording:stop:request", (_, data) =>
					callback(data)
				);
			},
			sendStopResponse: (requestId, result, error) => {
				ipcRenderer.send("claude:screen-recording:stop:response", {
					requestId,
					result,
					error,
				});
			},
			removeListeners: () => {
				ipcRenderer.removeAllListeners("claude:screen-recording:start:request");
				ipcRenderer.removeAllListeners("claude:screen-recording:stop:request");
			},
		},
		ui: {
			onSwitchPanelRequest: (
				callback: (data: {
					requestId: string;
					panel: string;
					tab?: string;
				}) => void
			) => {
				ipcRenderer.removeAllListeners("claude:ui:switch-panel:request");
				ipcRenderer.on(
					"claude:ui:switch-panel:request",
					(
						_: unknown,
						data: { requestId: string; panel: string; tab?: string }
					) => callback(data)
				);
			},
			sendSwitchPanelResponse: (
				requestId: string,
				result?: { switched: boolean; panel: string; group: string },
				error?: string
			) => {
				ipcRenderer.send("claude:ui:switch-panel:response", {
					requestId,
					result,
					error,
				});
			},
			removeListeners: () => {
				ipcRenderer.removeAllListeners("claude:ui:switch-panel:request");
			},
		},
		pointer: {
			onStateChange: (callback) => {
				ipcRenderer.removeAllListeners("claude:pointer:state");
				ipcRenderer.on("claude:pointer:state", (_, state) => callback(state));
			},
			removeListeners: () => {
				ipcRenderer.removeAllListeners("claude:pointer:state");
			},
		},
		state: {
			onSnapshotRequest: (
				callback: (data: {
					requestId: string;
					request?: EditorStateRequest;
				}) => void
			) => {
				ipcRenderer.removeAllListeners("claude:state:snapshot");
				ipcRenderer.on(
					"claude:state:snapshot",
					(
						_: unknown,
						data: {
							requestId: string;
							request?: EditorStateRequest;
						}
					) => callback(data)
				);
			},
			sendSnapshotResponse: (
				requestId: string,
				result?: EditorStateSnapshot,
				error?: string
			) => {
				ipcRenderer.send("claude:state:snapshot:response", {
					requestId,
					result,
					error,
				});
			},
			removeListeners: () => {
				ipcRenderer.removeAllListeners("claude:state:snapshot");
			},
		},
		importEvidence: {
			onSnapshotRequest: (
				callback: (data: QCutPersistedImportEvidenceRendererRequest) => void
			) => {
				ipcRenderer.removeAllListeners("qcut:interop:import-evidence:request");
				ipcRenderer.on(
					"qcut:interop:import-evidence:request",
					(_: unknown, data: QCutPersistedImportEvidenceRendererRequest) =>
						callback(data)
				);
			},
			sendSnapshotResponse: (
				requestId: string,
				result?: QCutPersistedImportEvidenceSnapshot,
				error?: string
			) => {
				ipcRenderer.send("qcut:interop:import-evidence:response", {
					requestId,
					result,
					error,
				});
			},
			removeListeners: () => {
				ipcRenderer.removeAllListeners("qcut:interop:import-evidence:request");
			},
		},
		sameProfileWriteback: {
			onRequest: (
				callback: (data: QCutSameProfileWritebackRendererRequest) => void
			) => {
				ipcRenderer.removeAllListeners(
					"qcut:interop:same-profile-writeback:request"
				);
				ipcRenderer.on(
					"qcut:interop:same-profile-writeback:request",
					(_: unknown, data: QCutSameProfileWritebackRendererRequest) =>
						callback(data)
				);
			},
			sendResponse: (
				requestId: string,
				result?: QCutSameProfileWritebackResult,
				error?: string
			) => {
				ipcRenderer.send("qcut:interop:same-profile-writeback:response", {
					error,
					requestId,
					result,
				});
			},
			removeListeners: () => {
				ipcRenderer.removeAllListeners(
					"qcut:interop:same-profile-writeback:request"
				);
			},
		},
		jianyingProjectImport: {
			onRequest: (
				callback: (data: QCutJianyingProjectImportRendererRequest) => void
			) => {
				ipcRenderer.removeAllListeners(
					"qcut:interop:jianying-project-import:request"
				);
				ipcRenderer.on(
					"qcut:interop:jianying-project-import:request",
					(_: unknown, data: QCutJianyingProjectImportRendererRequest) =>
						callback(data)
				);
			},
			sendResponse: (
				requestId: string,
				result?: QCutJianyingProjectImportResult,
				error?: string
			) => {
				ipcRenderer.send("qcut:interop:jianying-project-import:response", {
					error,
					requestId,
					result,
				});
			},
			removeListeners: () => {
				ipcRenderer.removeAllListeners(
					"qcut:interop:jianying-project-import:request"
				);
			},
		},
		jianyingProjectExport: {
			onRequest: (
				callback: (data: QCutJianyingProjectExportRendererRequest) => void
			) => {
				ipcRenderer.removeAllListeners(
					"qcut:interop:jianying-project-export:request"
				);
				ipcRenderer.on(
					"qcut:interop:jianying-project-export:request",
					(_: unknown, data: QCutJianyingProjectExportRendererRequest) =>
						callback(data)
				);
			},
			sendResponse: (
				requestId: string,
				result?: QCutJianyingProjectExportResult,
				error?: string
			) => {
				ipcRenderer.send("qcut:interop:jianying-project-export:response", {
					error,
					requestId,
					result,
				});
			},
			removeListeners: () => {
				ipcRenderer.removeAllListeners(
					"qcut:interop:jianying-project-export:request"
				);
			},
		},
		projectCrud: {
			onCreateRequest: (
				callback: (data: { requestId: string; name: string }) => void
			) => {
				ipcRenderer.removeAllListeners("claude:project:create:request");
				ipcRenderer.on(
					"claude:project:create:request",
					(_: unknown, data: { requestId: string; name: string }) =>
						callback(data)
				);
			},
			sendCreateResponse: (
				requestId: string,
				result?: { projectId: string; name: string },
				error?: string
			) => {
				ipcRenderer.send("claude:project:create:response", {
					requestId,
					result,
					error,
				});
			},
			onDeleteRequest: (
				callback: (data: { requestId: string; projectId: string }) => void
			) => {
				ipcRenderer.removeAllListeners("claude:project:delete:request");
				ipcRenderer.on(
					"claude:project:delete:request",
					(_: unknown, data: { requestId: string; projectId: string }) =>
						callback(data)
				);
			},
			sendDeleteResponse: (
				requestId: string,
				result?: { deleted: boolean; projectId: string },
				error?: string
			) => {
				ipcRenderer.send("claude:project:delete:response", {
					requestId,
					result,
					error,
				});
			},
			onRenameRequest: (
				callback: (data: {
					requestId: string;
					projectId: string;
					name: string;
				}) => void
			) => {
				ipcRenderer.removeAllListeners("claude:project:rename:request");
				ipcRenderer.on(
					"claude:project:rename:request",
					(
						_: unknown,
						data: {
							requestId: string;
							projectId: string;
							name: string;
						}
					) => callback(data)
				);
			},
			sendRenameResponse: (
				requestId: string,
				result?: {
					renamed: boolean;
					projectId: string;
					name: string;
				},
				error?: string
			) => {
				ipcRenderer.send("claude:project:rename:response", {
					requestId,
					result,
					error,
				});
			},
			onDuplicateRequest: (
				callback: (data: { requestId: string; projectId: string }) => void
			) => {
				ipcRenderer.removeAllListeners("claude:project:duplicate:request");
				ipcRenderer.on(
					"claude:project:duplicate:request",
					(_: unknown, data: { requestId: string; projectId: string }) =>
						callback(data)
				);
			},
			sendDuplicateResponse: (
				requestId: string,
				result?: {
					projectId: string;
					name: string;
					sourceProjectId: string;
				},
				error?: string
			) => {
				ipcRenderer.send("claude:project:duplicate:response", {
					requestId,
					result,
					error,
				});
			},
			removeListeners: () => {
				ipcRenderer.removeAllListeners("claude:project:create:request");
				ipcRenderer.removeAllListeners("claude:project:delete:request");
				ipcRenderer.removeAllListeners("claude:project:rename:request");
				ipcRenderer.removeAllListeners("claude:project:duplicate:request");
			},
		},
	};
}

// ============================================================================
// Remotion Folder
// ============================================================================

/** Create the Remotion folder API for the renderer process. */
export function createRemotionFolderAPI(): NonNullable<
	ElectronAPI["remotionFolder"]
> {
	return {
		select: () => ipcRenderer.invoke("remotion-folder:select"),
		scan: (folderPath) =>
			ipcRenderer.invoke("remotion-folder:scan", folderPath),
		bundle: (folderPath, compositionIds?) =>
			ipcRenderer.invoke("remotion-folder:bundle", folderPath, compositionIds),
		import: (folderPath) =>
			ipcRenderer.invoke("remotion-folder:import", folderPath),
		checkBundler: () => ipcRenderer.invoke("remotion-folder:check-bundler"),
		validate: (folderPath) =>
			ipcRenderer.invoke("remotion-folder:validate", folderPath),
		bundleFile: (filePath: string, compositionId: string) =>
			ipcRenderer.invoke("remotion-file:bundle", filePath, compositionId),
	};
}

// ============================================================================
// HyperFrames
// ============================================================================

/** Create the HyperFrames import, preview, and render API. */
export function createHyperframesAPI(): ElectronAPI["hyperframes"] {
	return {
		select: () => ipcRenderer.invoke("hyperframes:select"),
		registerPreview: (options) =>
			ipcRenderer.invoke("hyperframes:preview-register", options),
		releasePreview: (token) =>
			ipcRenderer.invoke("hyperframes:preview-release", token),
		render: (options) => ipcRenderer.invoke("hyperframes:render", options),
		cancel: (renderId) => ipcRenderer.invoke("hyperframes:cancel", renderId),
		cleanup: (sessionId) =>
			ipcRenderer.invoke("hyperframes:cleanup", sessionId),
		onRenderProgress: (callback) => {
			const listener = (
				_event: IpcRendererEvent,
				progress: Parameters<typeof callback>[0]
			) => callback(progress);
			ipcRenderer.on("hyperframes:render-progress", listener);
			return () =>
				ipcRenderer.removeListener("hyperframes:render-progress", listener);
		},
	};
}

// ============================================================================
// Moyin (Script-to-Storyboard)
// ============================================================================

/** Create the Moyin script/storyboard API for the renderer process. */
export function createMoyinAPI(): NonNullable<ElectronAPI["moyin"]> {
	return {
		parseScript: (options) => ipcRenderer.invoke("moyin:parse-script", options),
		generateStoryboard: (options) =>
			ipcRenderer.invoke("moyin:generate-storyboard", options),
		callLLM: (options) => ipcRenderer.invoke("moyin:call-llm", options),
		generateImage: (options) =>
			ipcRenderer.invoke("moyin:generate-image", options),
		generateVideo: (options) =>
			ipcRenderer.invoke("moyin:generate-video", options),
		isClaudeAvailable: () => ipcRenderer.invoke("moyin:is-claude-available"),
		saveTempScript: (options: { rawScript: string }) =>
			ipcRenderer.invoke("moyin:save-temp-script", options),
		cleanupTempScript: (filePath: string) =>
			ipcRenderer.invoke("moyin:cleanup-temp-script", filePath),
		onParsed: (callback) => {
			ipcRenderer.removeAllListeners("claude:moyin:parsed");
			ipcRenderer.on("claude:moyin:parsed", (_, data) => callback(data));
		},
		removeParseListener: () => {
			ipcRenderer.removeAllListeners("claude:moyin:parsed");
		},
		onSetScript: (callback: (data: { text: string }) => void) => {
			ipcRenderer.removeAllListeners("claude:moyin:set-script");
			ipcRenderer.on(
				"claude:moyin:set-script",
				(_: unknown, data: { text: string }) => callback(data)
			);
		},
		onTriggerParse: (callback: (data?: { model?: string }) => void) => {
			ipcRenderer.removeAllListeners("claude:moyin:trigger-parse");
			ipcRenderer.on(
				"claude:moyin:trigger-parse",
				(_: unknown, data: { model?: string }) => callback(data)
			);
		},
		onGenerateScript: (
			callback: (data: {
				idea: string;
				genre?: string;
				targetDuration?: string;
			}) => void
		) => {
			ipcRenderer.removeAllListeners("claude:moyin:generate-script");
			ipcRenderer.on(
				"claude:moyin:generate-script",
				(
					_: unknown,
					data: { idea: string; genre?: string; targetDuration?: string }
				) => callback(data)
			);
		},
		onStatusRequest: (callback: (data: { requestId: string }) => void) => {
			ipcRenderer.removeAllListeners("claude:moyin:status:request");
			ipcRenderer.on(
				"claude:moyin:status:request",
				(_: unknown, data: { requestId: string }) => callback(data)
			);
		},
		sendStatusResponse: (
			requestId: string,
			result?: Record<string, unknown>,
			error?: string
		) => {
			ipcRenderer.send("claude:moyin:status:response", {
				requestId,
				result,
				error,
			});
		},
		onExportRequest: (callback: (data: { requestId: string }) => void) => {
			ipcRenderer.removeAllListeners("claude:moyin:export:request");
			ipcRenderer.on(
				"claude:moyin:export:request",
				(_: unknown, data: { requestId: string }) => callback(data)
			);
		},
		sendExportResponse: (
			requestId: string,
			result?: Record<string, unknown>,
			error?: string
		) => {
			ipcRenderer.send("claude:moyin:export:response", {
				requestId,
				result,
				error,
			});
		},
		removeMoyinBridgeListeners: () => {
			ipcRenderer.removeAllListeners("claude:moyin:set-script");
			ipcRenderer.removeAllListeners("claude:moyin:trigger-parse");
			ipcRenderer.removeAllListeners("claude:moyin:generate-script");
			ipcRenderer.removeAllListeners("claude:moyin:status:request");
			ipcRenderer.removeAllListeners("claude:moyin:export:request");
		},
	};
}

// ============================================================================
// Updates & Release Notes
// ============================================================================

/** Create the auto-updates and release notes API for the renderer process. */
export function createUpdatesAPI(): NonNullable<ElectronAPI["updates"]> {
	return {
		checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
		downloadUpdate: () => ipcRenderer.invoke("download-update"),
		getState: () => ipcRenderer.invoke("get-update-state"),
		getPreferences: () => ipcRenderer.invoke("get-update-preferences"),
		setPreferences: (preferences) =>
			ipcRenderer.invoke("set-update-preferences", preferences),
		installUpdate: () => ipcRenderer.invoke("install-update"),
		getReleaseNotes: (version?) =>
			ipcRenderer.invoke("get-release-notes", version),
		getChangelog: () => ipcRenderer.invoke("get-changelog"),
		onUpdateAvailable: (callback) => {
			const handler = (
				_: IpcRendererEvent,
				data: {
					version: string;
					releaseNotes?: string;
					releaseDate?: string;
				}
			) => callback(data);
			ipcRenderer.on("update-available", handler);
			return () => ipcRenderer.removeListener("update-available", handler);
		},
		onDownloadProgress: (callback) => {
			const handler = (
				_: IpcRendererEvent,
				data: { percent: number; transferred: number; total: number }
			) => callback(data);
			ipcRenderer.on("download-progress", handler);
			return () => ipcRenderer.removeListener("download-progress", handler);
		},
		onUpdateDownloaded: (callback) => {
			const handler = (_: IpcRendererEvent, data: { version: string }) =>
				callback(data);
			ipcRenderer.on("update-downloaded", handler);
			return () => ipcRenderer.removeListener("update-downloaded", handler);
		},
		onStateChanged: (callback) => {
			const handler = (
				_: IpcRendererEvent,
				state: Parameters<typeof callback>[0]
			) => callback(state);
			ipcRenderer.on("update-state-changed", handler);
			return () => ipcRenderer.removeListener("update-state-changed", handler);
		},
		plugin: {
			checkForUpdates: () =>
				ipcRenderer.invoke("check-for-codex-plugin-updates"),
			installUpdate: () => ipcRenderer.invoke("install-codex-plugin-update"),
			getState: () => ipcRenderer.invoke("get-codex-plugin-update-state"),
			onStateChanged: (callback) => {
				const handler = (
					_: IpcRendererEvent,
					state: Parameters<typeof callback>[0]
				) => callback(state);
				ipcRenderer.on("codex-plugin-update-state-changed", handler);
				return () =>
					ipcRenderer.removeListener(
						"codex-plugin-update-state-changed",
						handler
					);
			},
		},
	};
}
