import { describe, expect, it, vi } from "vitest";
import { assertProjectIsOpen } from "../http/claude-http-shared-routes.js";
import type { WindowAccessor } from "../http/claude-http-shared-routes.js";

function accessorWith({
	openProjectId,
	fails = false,
	omitSnapshot = false,
}: {
	openProjectId?: string;
	fails?: boolean;
	omitSnapshot?: boolean;
}): WindowAccessor {
	const requestStateSnapshot = vi.fn(async () => {
		if (fails) throw new Error("renderer unavailable");
		return { project: { activeProject: { id: openProjectId } } };
	});
	return (omitSnapshot
		? {}
		: { requestStateSnapshot }) as unknown as WindowAccessor;
}

describe("assertProjectIsOpen", () => {
	it("allows the project the editor has open", async () => {
		await expect(
			assertProjectIsOpen({
				accessor: accessorWith({ openProjectId: "a" }),
				projectId: "a",
			})
		).resolves.toBeUndefined();
	});

	it("refuses a project the editor does not have open", async () => {
		// Previously this returned the open project's timeline, so a caller asking
		// about "b" was answered about "a" with no way to tell.
		await expect(
			assertProjectIsOpen({
				accessor: accessorWith({ openProjectId: "a" }),
				projectId: "b",
			})
		).rejects.toMatchObject({ status: 409 });
	});

	it("names both projects and how to recover", async () => {
		await expect(
			assertProjectIsOpen({
				accessor: accessorWith({ openProjectId: "a" }),
				projectId: "b",
			})
		).rejects.toThrow(/has a open, not b.*editor:navigator:open.*--focus/s);
	});

	it("stays out of the way when no project was named", async () => {
		await expect(
			assertProjectIsOpen({
				accessor: accessorWith({ openProjectId: "a" }),
				projectId: undefined,
			})
		).resolves.toBeUndefined();
	});

	it("does not block when the renderer cannot report its state", async () => {
		await expect(
			assertProjectIsOpen({
				accessor: accessorWith({ openProjectId: "a", fails: true }),
				projectId: "b",
			})
		).resolves.toBeUndefined();
	});

	it("does not block when the accessor cannot snapshot at all", async () => {
		await expect(
			assertProjectIsOpen({
				accessor: accessorWith({ omitSnapshot: true }),
				projectId: "b",
			})
		).resolves.toBeUndefined();
	});
});
