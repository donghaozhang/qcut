import { debugError } from "@/lib/debug/debug-config";
import { exportProfiler } from "@/lib/export/export-profiler";
import { setActiveExportJob } from "@/lib/export/export-progress-reporter";
import { setSequentialDecodeDisabled } from "@/lib/export/export-sequential-video-source";
import { useExportStore } from "@/stores/export-store";
import { useProjectStore } from "@/stores/project-store";
import { PanelView } from "@/types/panel";
import type { ClaudeLocalVideoExportRequest } from "../../../../../electron/types/claude-local-video-export-api";

interface LocalVideoExportActions {
	exportLocalVideo: (request: ClaudeLocalVideoExportRequest) => Promise<void>;
}

const EXPORT_ACTION_READY_TIMEOUT_MS = 10_000;
const EXPORT_ACTION_POLL_INTERVAL_MS = 25;
let localVideoExportInFlight = false;

function readLocalVideoExportActions(): LocalVideoExportActions | null {
	const actions = (window as Window & { __exportActions?: unknown })
		.__exportActions;
	if (typeof actions !== "object" || actions === null) return null;
	const candidate = actions as { exportLocalVideo?: unknown };
	return typeof candidate.exportLocalVideo === "function"
		? (candidate as LocalVideoExportActions)
		: null;
}

function waitForLocalVideoExportActions(): Promise<LocalVideoExportActions> {
	const deadline = Date.now() + EXPORT_ACTION_READY_TIMEOUT_MS;
	return new Promise((resolve, reject) => {
		const pollForActions = () => {
			const actions = readLocalVideoExportActions();
			if (actions) {
				resolve(actions);
				return;
			}
			if (Date.now() >= deadline) {
				reject(new Error("QCut export panel did not become ready."));
				return;
			}
			setTimeout(pollForActions, EXPORT_ACTION_POLL_INTERVAL_MS);
		};
		pollForActions();
	});
}

export function setupClaudeLocalVideoExportBridge(): void {
	const exportApi = window.electronAPI?.claude?.export;
	if (!exportApi?.onLocalVideoExportRequest) return;
	exportApi.onLocalVideoExportRequest(({ request, requestId }) => {
		if (localVideoExportInFlight) {
			exportApi.sendLocalVideoExportResponse({
				error: "Another QCut export is already in progress.",
				requestId,
			});
			return;
		}
		localVideoExportInFlight = true;
		void (async () => {
			try {
				if (useExportStore.getState().progress.isExporting) {
					throw new Error("Another QCut export is already in progress.");
				}
				const activeProjectId = useProjectStore.getState().activeProject?.id;
				if (activeProjectId !== request.projectId) {
					throw new Error(
						`Project ${request.projectId} is not open in the QCut editor.`
					);
				}
				useExportStore.getState().setPanelView(PanelView.EXPORT);
				const actions = await waitForLocalVideoExportActions();
				if (
					useProjectStore.getState().activeProject?.id !== request.projectId
				) {
					throw new Error(
						`Project ${request.projectId} is no longer open in the QCut editor.`
					);
				}
				// Stream real frame progress into the main-process job, and arm
				// the structured profiler when the caller asked for a profile.
				console.log(
					`[ClaudeLocalVideoExportBridge] jobId=${request.jobId ?? "-"} ` +
						`profilePath=${request.profilePath ?? "-"}`
				);
				if (request.jobId) setActiveExportJob({ jobId: request.jobId });
				if (request.profilePath) {
					exportProfiler.arm({ targetPath: request.profilePath });
				}
				setSequentialDecodeDisabled(request.disableSequentialDecode === true);
				await actions.exportLocalVideo(request);
				exportApi.sendLocalVideoExportResponse({ requestId, success: true });
			} catch (error) {
				debugError("[ClaudeLocalVideoExportBridge] Export failed", error);
				exportApi.sendLocalVideoExportResponse({
					error: error instanceof Error ? error.message : String(error),
					requestId,
				});
			} finally {
				setActiveExportJob({ jobId: null });
				exportProfiler.disarm();
				setSequentialDecodeDisabled(false);
				localVideoExportInFlight = false;
			}
		})();
	});
}

export function cleanupClaudeLocalVideoExportBridge(): void {
	window.electronAPI?.claude?.export.removeLocalVideoExportListener?.();
}
