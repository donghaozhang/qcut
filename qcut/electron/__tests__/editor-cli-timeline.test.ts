import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { handleTimelineEditingCommand } from "../native-pipeline/editor/editor-handlers-timeline.js";
import { EditorApiClient } from "../native-pipeline/editor/editor-api-client.js";
import {
	mockRoute,
	clearRoutes,
	installFetchMock,
	makeOpts,
	noopProgress,
	originalFetch,
	BASE_URL,
	lastCapturedMethod,
	lastCapturedBody,
} from "./editor-cli-test-setup";

// ---------------------------------------------------------------------------
// Timeline handlers — uncovered actions
// ---------------------------------------------------------------------------

describe("Timeline handlers — uncovered actions", () => {
	let client: EditorApiClient;

	beforeAll(() => {
		installFetchMock(BASE_URL);
		client = new EditorApiClient({ baseUrl: BASE_URL });
	});

	afterEach(() => {
		clearRoutes();
	});

	afterAll(() => {
		globalThis.fetch = originalFetch;
	});

	describe("delete-element", () => {
		it("requires project-id and element-id", async () => {
			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:timeline:delete-element",
					projectId: "p1",
				}),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--element-id");
		});

		it("sends DELETE to correct endpoint", async () => {
			mockRoute("DELETE", "/api/claude/timeline/p1/elements/e1", {
				success: true,
				data: { deleted: true },
			});
			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:timeline:delete-element",
					projectId: "p1",
					elementId: "e1",
				}),
				noopProgress
			);
			expect(result.success).toBe(true);
			expect(lastCapturedMethod).toBe("DELETE");
		});
	});

	describe("batch-update", () => {
		it("requires --updates", async () => {
			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:timeline:batch-update",
					projectId: "p1",
				}),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--updates");
		});

		it("rejects >50 updates", async () => {
			const updates = Array.from({ length: 51 }, (_, i) => ({
				elementId: `e${i}`,
				changes: { startTime: i },
			}));
			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:timeline:batch-update",
					projectId: "p1",
					updates: JSON.stringify(updates),
				}),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("Batch limit");
		});

		it("sends PATCH with updates array", async () => {
			mockRoute("PATCH", "/api/claude/timeline/p1/elements/batch", {
				success: true,
				data: { updated: 2 },
			});
			const updates = [
				{ elementId: "e1", changes: { startTime: 0 } },
				{ elementId: "e2", changes: { startTime: 5 } },
			];
			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:timeline:batch-update",
					projectId: "p1",
					updates: JSON.stringify(updates),
				}),
				noopProgress
			);
			expect(result.success).toBe(true);
			const body = JSON.parse(lastCapturedBody!);
			expect(body.updates).toHaveLength(2);
		});
	});

	describe("select", () => {
		it("requires --elements", async () => {
			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:timeline:select",
					projectId: "p1",
				}),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--elements");
		});

		it("sends POST with elements array", async () => {
			mockRoute("POST", "/api/claude/timeline/p1/selection", {
				success: true,
				data: { selected: 2 },
			});
			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:timeline:select",
					projectId: "p1",
					elements:
						'[{"trackId":"t1","elementId":"e1"},{"trackId":"t1","elementId":"e2"}]',
				}),
				noopProgress
			);
			expect(result.success).toBe(true);
			const body = JSON.parse(lastCapturedBody!);
			expect(body.elements).toHaveLength(2);
		});
	});

	describe("unknown timeline action", () => {
		it("returns error for unknown action", async () => {
			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:timeline:nonexistent",
					projectId: "p1",
				}),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("Unknown timeline action");
		});
	});

	describe("unknown editing action", () => {
		it("returns error for unknown action", async () => {
			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:editing:nonexistent",
					projectId: "p1",
				}),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("Unknown editing action");
		});
	});
});

// ---------------------------------------------------------------------------
// Editing handlers — uncovered actions
// ---------------------------------------------------------------------------

describe("Editing handlers — uncovered actions", () => {
	let client: EditorApiClient;

	beforeAll(() => {
		installFetchMock(BASE_URL);
		client = new EditorApiClient({ baseUrl: BASE_URL });
	});

	afterEach(() => {
		clearRoutes();
	});

	afterAll(() => {
		globalThis.fetch = originalFetch;
	});

	describe("auto-edit-status", () => {
		it("requires project-id and job-id", async () => {
			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:editing:auto-edit-status",
					projectId: "p1",
				}),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--job-id");
		});

		it("calls GET on auto-edit job endpoint", async () => {
			mockRoute("GET", "/api/claude/timeline/p1/auto-edit/jobs/j1", {
				success: true,
				data: { status: "completed", progress: 100, edits: 5 },
			});
			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:editing:auto-edit-status",
					projectId: "p1",
					jobId: "j1",
				}),
				noopProgress
			);
			expect(result.success).toBe(true);
			expect((result.data as { status: string }).status).toBe("completed");
		});
	});

	describe("delete-range with ripple flags", () => {
		it("sends ripple and crossTrackRipple in body", async () => {
			mockRoute("DELETE", "/api/claude/timeline/p1/range", {
				success: true,
				data: { deleted: 3 },
			});
			await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:editing:delete-range",
					projectId: "p1",
					startTime: 1,
					endTime: 5,
					ripple: true,
					crossTrackRipple: true,
				}),
				noopProgress
			);
			const body = JSON.parse(lastCapturedBody!);
			expect(body.ripple).toBe(true);
			expect(body.crossTrackRipple).toBe(true);
		});
	});
});
