import type { EditorApiClient } from "./editor-api-client.js";

interface NavigatorProjects {
	activeProjectId?: string | null;
}

export interface ProjectReadyResult {
	projectId: string;
	opened: boolean;
	elapsedMs: number;
}

const sleep = (durationMs: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, durationMs));

export async function ensureEditorProjectReady({
	client,
	projectId,
	open = true,
	timeoutMs = 15_000,
	intervalMs = 150,
}: {
	client: EditorApiClient;
	projectId: string;
	open?: boolean;
	timeoutMs?: number;
	intervalMs?: number;
}): Promise<ProjectReadyResult> {
	const startedAt = Date.now();
	let opened = false;
	if (open) {
		const navigation = await client.post<{
			navigated?: boolean;
			projectId?: string;
		}>("/api/claude/navigator/open", { projectId });
		if (navigation.navigated === false) {
			throw new Error(`QCut could not open project '${projectId}'`);
		}
		opened = true;
	} else {
		const initial = await client.get<NavigatorProjects>(
			"/api/claude/navigator/projects"
		);
		if (initial.activeProjectId !== projectId) {
			throw new Error(
				`Project '${projectId}' is not active. Open it first or enable automatic project opening.`
			);
		}
	}

	let lastError: unknown;
	while (Date.now() - startedAt <= Math.max(1, timeoutMs)) {
		try {
			const navigator = await client.get<NavigatorProjects>(
				"/api/claude/navigator/projects"
			);
			if (navigator.activeProjectId === projectId) {
				await Promise.all([
					client.get(`/api/claude/media/${encodeURIComponent(projectId)}`),
					client.get(`/api/claude/timeline/${encodeURIComponent(projectId)}`),
				]);
				return {
					projectId,
					opened,
					elapsedMs: Date.now() - startedAt,
				};
			}
		} catch (error) {
			lastError = error;
		}
		await sleep(Math.max(20, intervalMs));
	}

	throw new Error(
		`Project '${projectId}' did not become editor-ready within ${timeoutMs}ms${
			lastError instanceof Error ? `: ${lastError.message}` : ""
		}`
	);
}
