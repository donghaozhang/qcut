import type { EditorApiClient } from "../editor/editor-api-client.js";

/**
 * Which project the editor window is actually showing.
 *
 * Editor mutations apply to a project by id, and the window follows those
 * changes live only when it already has that project open. A command targeting
 * some other project still succeeds, so without this the caller sees a run of
 * "ok" responses while the user is looking at an unrelated screen.
 */
export interface EditorViewState {
	activeProjectId: string | null;
	/** False when the mutation landed somewhere the user cannot see. */
	matchesTarget: boolean;
	/**
	 * With --focus, whether the window ended up on the target project. Reports
	 * the outcome rather than whether a navigation was needed, so a window
	 * already showing the target is not reported as a failed focus.
	 */
	focused?: boolean;
}

interface StateResponse {
	state?: { project?: { activeProject?: { id?: unknown } } };
}

async function activeProjectId({
	client,
}: {
	client: EditorApiClient;
}): Promise<string | null> {
	const response = await client.get<StateResponse>(
		"/api/claude/state?include=project"
	);
	const id = response?.state?.project?.activeProject?.id;
	return typeof id === "string" ? id : null;
}

const FOCUS_POLL_INTERVAL_MS = 150;
const FOCUS_TIMEOUT_MS = 3000;

async function waitForActiveProject({
	client,
	projectId,
}: {
	client: EditorApiClient;
	projectId: string;
}): Promise<string | null> {
	const deadline = Date.now() + FOCUS_TIMEOUT_MS;
	let activeId = await activeProjectId({ client });
	while (activeId !== projectId && Date.now() < deadline) {
		await new Promise((settle) => setTimeout(settle, FOCUS_POLL_INTERVAL_MS));
		activeId = await activeProjectId({ client });
	}
	return activeId;
}

/**
 * Resolves the view state for a command that targeted `projectId`, optionally
 * navigating there first. Never throws: this is reporting attached to an
 * already-successful command, so a failure to read it must not turn that
 * command into an error.
 */
export async function resolveEditorViewState({
	client,
	projectId,
	focus,
}: {
	client: EditorApiClient;
	projectId: string | undefined;
	focus: boolean | undefined;
}): Promise<EditorViewState | undefined> {
	if (!projectId) return;
	try {
		let activeId = await activeProjectId({ client });
		if (focus && activeId !== projectId) {
			await client.post("/api/claude/navigator/open", { projectId });
			// The route change is asynchronous, so reading the state straight
			// back reports the previous project and looks like a failed focus.
			activeId = await waitForActiveProject({ client, projectId });
		}
		const matchesTarget = activeId === projectId;
		return {
			activeProjectId: activeId,
			matchesTarget,
			...(focus ? { focused: matchesTarget } : {}),
		};
	} catch {
		return;
	}
}

/** Attaches view state to a result payload without disturbing its shape. */
export function withViewState({
	data,
	view,
}: {
	data: unknown;
	view: EditorViewState | undefined;
}): unknown {
	if (!view) return data;
	if (data === null || data === undefined) return { view };
	if (typeof data !== "object" || Array.isArray(data)) return { data, view };
	return { ...(data as Record<string, unknown>), view };
}
