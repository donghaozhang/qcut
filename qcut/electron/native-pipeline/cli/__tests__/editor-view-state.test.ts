import { describe, expect, it, vi } from "vitest";
import type { EditorApiClient } from "../../editor/editor-api-client.js";
import { resolveEditorViewState, withViewState } from "../editor-view-state.js";

function stateFor({ projectId }: { projectId: string | null }) {
	return {
		state: { project: { activeProject: projectId ? { id: projectId } : null } },
	};
}

/** A client whose active project changes only after navigator/open is posted. */
function fakeClient({
	activeProjectId,
	navigateTo,
	failState = false,
}: {
	activeProjectId: string | null;
	navigateTo?: string;
	failState?: boolean;
}) {
	let current = activeProjectId;
	const post = vi.fn(async (path: string) => {
		if (path === "/api/claude/navigator/open" && navigateTo)
			current = navigateTo;
		return {};
	});
	const get = vi.fn(async () => {
		if (failState) throw new Error("state unavailable");
		return stateFor({ projectId: current });
	});
	return { client: { get, post } as unknown as EditorApiClient, get, post };
}

describe("resolveEditorViewState", () => {
	it("returns nothing when no project was targeted", async () => {
		const { client, get } = fakeClient({ activeProjectId: "a" });
		const view = await resolveEditorViewState({
			client,
			projectId: undefined,
			focus: false,
		});
		expect(view).toBeUndefined();
		expect(get).not.toHaveBeenCalled();
	});

	it("reports a match when the window shows the target", async () => {
		const { client } = fakeClient({ activeProjectId: "a" });
		const view = await resolveEditorViewState({
			client,
			projectId: "a",
			focus: false,
		});
		expect(view).toEqual({ activeProjectId: "a", matchesTarget: true });
	});

	it("reports the mismatch that would otherwise be silent", async () => {
		const { client, post } = fakeClient({ activeProjectId: "a" });
		const view = await resolveEditorViewState({
			client,
			projectId: "b",
			focus: false,
		});
		expect(view).toEqual({ activeProjectId: "a", matchesTarget: false });
		// Without --focus the window must not be taken from the user.
		expect(post).not.toHaveBeenCalled();
	});

	it("navigates to the target when focus is requested", async () => {
		const { client, post } = fakeClient({
			activeProjectId: "a",
			navigateTo: "b",
		});
		const view = await resolveEditorViewState({
			client,
			projectId: "b",
			focus: true,
		});
		expect(post).toHaveBeenCalledWith("/api/claude/navigator/open", {
			projectId: "b",
		});
		expect(view).toEqual({
			activeProjectId: "b",
			matchesTarget: true,
			focused: true,
		});
	});

	it("reports focused when the window already shows the target", async () => {
		const { client, post } = fakeClient({ activeProjectId: "b" });
		const view = await resolveEditorViewState({
			client,
			projectId: "b",
			focus: true,
		});
		// No navigation was needed, which is a focused window, not a failure.
		expect(post).not.toHaveBeenCalled();
		expect(view?.focused).toBe(true);
	});

	it("stays silent when the state cannot be read", async () => {
		const { client } = fakeClient({ activeProjectId: "a", failState: true });
		const view = await resolveEditorViewState({
			client,
			projectId: "b",
			focus: false,
		});
		// Reporting is attached to an already-successful command and must never
		// turn it into a failure.
		expect(view).toBeUndefined();
	});
});

describe("withViewState", () => {
	const view = { activeProjectId: "a", matchesTarget: true };

	it("merges into an object payload", () => {
		expect(withViewState({ data: { elementId: "e1" }, view })).toEqual({
			elementId: "e1",
			view,
		});
	});

	it("nests a non-object payload rather than losing it", () => {
		expect(withViewState({ data: [1, 2], view })).toEqual({
			data: [1, 2],
			view,
		});
	});

	it("leaves the payload untouched when there is no view", () => {
		const data = { elementId: "e1" };
		expect(withViewState({ data, view: undefined })).toBe(data);
	});
});
