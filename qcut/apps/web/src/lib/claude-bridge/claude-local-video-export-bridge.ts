import { debugError } from "@/lib/debug/debug-config";
import { useExportStore } from "@/stores/export-store";
import { useProjectStore } from "@/stores/project-store";
import { PanelView } from "@/types/panel";
import type { ClaudeLocalVideoExportRequest } from "../../../../../electron/types/claude-local-video-export-api";

interface LocalVideoExportActions {
	export: (request: ClaudeLocalVideoExportRequest) => Promise<void>;
}

function readLocalVideoExportActions(): LocalVideoExportActions | null {
	const actions = (window as Window & { __exportActions?: unknown })
		.__exportActions;
	if (typeof actions !== "object" || actions === null) return null;
	const candidate = actions as { export?: unknown };
	return typeof candidate.export === "function"
		? (candidate as LocalVideoExportActions)
		: null;
}

async function waitForLocalVideoExportActions(): Promise<LocalVideoExportActions> {
	const deadline = Date.now() + 10_000;
	while (Date.now() < deadline) {
		const actions = readLocalVideoExportActions();
		if (actions) return actions;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	throw new Error("QCut export panel did not become ready.");
}

export function setupClaudeLocalVideoExportBridge(): void {
	const exportApi = window.electronAPI?.claude?.export;
	if (!exportApi?.onLocalVideoExportRequest) return;
	exportApi.onLocalVideoExportRequest(({ request, requestId }) => {
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
				await actions.export(request);
				exportApi.sendLocalVideoExportResponse({ requestId, success: true });
			} catch (error) {
				debugError("[ClaudeLocalVideoExportBridge] Export failed", error);
				exportApi.sendLocalVideoExportResponse({
					error: error instanceof Error ? error.message : String(error),
					requestId,
				});
			}
		})();
	});
}

export function cleanupClaudeLocalVideoExportBridge(): void {
	window.electronAPI?.claude?.export.removeLocalVideoExportListener?.();
}
