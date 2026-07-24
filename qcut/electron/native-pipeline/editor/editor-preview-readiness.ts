import type {
	EditorStateSnapshot,
	PreviewStateSnapshot,
} from "../../types/claude-api.js";
import type { EditorApiClient } from "./editor-api-client.js";

export interface PreviewReadyResult {
	projectId?: string;
	elapsedMs: number;
	preview: PreviewStateSnapshot;
}

const sleep = (durationMs: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, durationMs));

function previewReadinessFailure({
	snapshot,
	projectId,
	afterTimestamp,
}: {
	snapshot: EditorStateSnapshot;
	projectId?: string;
	afterTimestamp?: number;
}): string | null {
	const activeProjectId = snapshot.state.project?.activeProject?.id;
	if (projectId && activeProjectId !== projectId) {
		return `active-project:${activeProjectId ?? "none"}`;
	}
	const initialization = snapshot.state.editor?.initialization;
	if (
		initialization?.isInitializing === true ||
		initialization?.isPanelsReady !== true
	) {
		return "editor-not-ready";
	}
	const preview = snapshot.state.editor?.preview;
	if (!preview) return "preview-state-unavailable";
	if (!preview.ready) return preview.reason ?? "preview-not-ready";
	if (
		afterTimestamp !== undefined &&
		preview.activeVideoMediaIds.length > 0 &&
		(preview.lastPresentedAt ?? 0) < afterTimestamp
	) {
		return "preview-frame-predates-request";
	}
	return null;
}

export async function ensureEditorPreviewReady({
	client,
	projectId,
	afterTimestamp,
	timeoutMs = 15_000,
	intervalMs = 100,
}: {
	client: EditorApiClient;
	projectId?: string;
	afterTimestamp?: number;
	timeoutMs?: number;
	intervalMs?: number;
}): Promise<PreviewReadyResult> {
	const startedAt = Date.now();
	let lastReason = "preview-state-unavailable";
	let lastError: unknown;

	while (Date.now() - startedAt <= Math.max(1, timeoutMs)) {
		try {
			const snapshot = await client.get<EditorStateSnapshot>(
				"/api/claude/state",
				{ include: "timeline,playhead,media,editor,project" }
			);
			const failure = previewReadinessFailure({
				snapshot,
				projectId,
				afterTimestamp,
			});
			const preview = snapshot.state.editor?.preview;
			if (!failure && preview) {
				return {
					projectId,
					elapsedMs: Date.now() - startedAt,
					preview,
				};
			}
			lastReason = failure ?? lastReason;
		} catch (error) {
			lastError = error;
		}
		await sleep(Math.max(20, intervalMs));
	}

	throw new Error(
		`Editor preview did not become frame-ready within ${timeoutMs}ms (last state: ${lastReason})${
			lastError instanceof Error ? `: ${lastError.message}` : ""
		}`
	);
}
