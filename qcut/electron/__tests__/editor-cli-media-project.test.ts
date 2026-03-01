import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { handleMediaProjectCommand } from "../native-pipeline/editor/editor-handlers-media.js";
import { EditorApiClient } from "../native-pipeline/editor/editor-api-client.js";
import {
	mockRoute,
	clearRoutes,
	installFetchMock,
	makeOpts,
	noopProgress,
	originalFetch,
	BASE_URL,
	lastCapturedBody,
	lastCapturedMethod,
} from "./editor-cli-test-setup";

// ---------------------------------------------------------------------------
// Media handlers — uncovered actions
// ---------------------------------------------------------------------------

describe("Media handlers — uncovered actions", () => {
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

	describe("media:info", () => {
		it("requires project-id and media-id", async () => {
			const result = await handleMediaProjectCommand(
				client,
				makeOpts({ command: "editor:media:info" }),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--project-id");

			const result2 = await handleMediaProjectCommand(
				client,
				makeOpts({ command: "editor:media:info", projectId: "p1" }),
				noopProgress
			);
			expect(result2.success).toBe(false);
			expect(result2.error).toContain("--media-id");
		});

		it("calls correct GET endpoint", async () => {
			mockRoute("GET", "/api/claude/media/p1/m1", {
				success: true,
				data: { id: "m1", name: "video.mp4", type: "video", duration: 30 },
			});
			const result = await handleMediaProjectCommand(
				client,
				makeOpts({
					command: "editor:media:info",
					projectId: "p1",
					mediaId: "m1",
				}),
				noopProgress
			);
			expect(result.success).toBe(true);
			expect((result.data as { name: string }).name).toBe("video.mp4");
		});
	});

	describe("media:import-url", () => {
		it("requires project-id and url", async () => {
			const result = await handleMediaProjectCommand(
				client,
				makeOpts({ command: "editor:media:import-url", projectId: "p1" }),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--url");
		});

		it("sends URL to correct endpoint", async () => {
			mockRoute("POST", "/api/claude/media/p1/import-from-url", {
				success: true,
				data: { imported: true, mediaId: "m2" },
			});
			const result = await handleMediaProjectCommand(
				client,
				makeOpts({
					command: "editor:media:import-url",
					projectId: "p1",
					imageUrl: "https://example.com/video.mp4",
				}),
				noopProgress
			);
			expect(result.success).toBe(true);
		});

		it("includes filename when provided", async () => {
			mockRoute("POST", "/api/claude/media/p1/import-from-url", {
				success: true,
				data: { imported: true },
			});
			await handleMediaProjectCommand(
				client,
				makeOpts({
					command: "editor:media:import-url",
					projectId: "p1",
					imageUrl: "https://example.com/video.mp4",
					filename: "my-video.mp4",
				}),
				noopProgress
			);
			const body = JSON.parse(lastCapturedBody!);
			expect(body.filename).toBe("my-video.mp4");
		});
	});

	describe("media:extract-frame", () => {
		it("requires project-id, media-id, and timestamp", async () => {
			const result = await handleMediaProjectCommand(
				client,
				makeOpts({
					command: "editor:media:extract-frame",
					projectId: "p1",
					mediaId: "m1",
				}),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--timestamp");
		});

		it("sends POST with correct body", async () => {
			mockRoute("POST", "/api/claude/media/p1/m1/extract-frame", {
				success: true,
				data: { framePath: "/tmp/frame.png" },
			});
			const result = await handleMediaProjectCommand(
				client,
				makeOpts({
					command: "editor:media:extract-frame",
					projectId: "p1",
					mediaId: "m1",
					startTime: 5.5,
				}),
				noopProgress
			);
			expect(result.success).toBe(true);
		});
	});

	describe("media:rename", () => {
		it("requires project-id, media-id, and new-name", async () => {
			const result = await handleMediaProjectCommand(
				client,
				makeOpts({
					command: "editor:media:rename",
					projectId: "p1",
					mediaId: "m1",
				}),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--new-name");
		});

		it("sends PATCH with new name", async () => {
			mockRoute("PATCH", "/api/claude/media/p1/m1/rename", {
				success: true,
				data: { renamed: true },
			});
			const result = await handleMediaProjectCommand(
				client,
				makeOpts({
					command: "editor:media:rename",
					projectId: "p1",
					mediaId: "m1",
					newName: "new-video-name.mp4",
				}),
				noopProgress
			);
			expect(result.success).toBe(true);
			const body = JSON.parse(lastCapturedBody!);
			expect(body.newName).toBe("new-video-name.mp4");
		});
	});

	describe("media:delete", () => {
		it("requires project-id and media-id", async () => {
			const result = await handleMediaProjectCommand(
				client,
				makeOpts({ command: "editor:media:delete", projectId: "p1" }),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--media-id");
		});

		it("sends DELETE to correct endpoint", async () => {
			mockRoute("DELETE", "/api/claude/media/p1/m1", {
				success: true,
				data: { deleted: true },
			});
			const result = await handleMediaProjectCommand(
				client,
				makeOpts({
					command: "editor:media:delete",
					projectId: "p1",
					mediaId: "m1",
				}),
				noopProgress
			);
			expect(result.success).toBe(true);
			expect(lastCapturedMethod).toBe("DELETE");
		});
	});

	describe("unknown media action", () => {
		it("returns error for unknown action", async () => {
			const result = await handleMediaProjectCommand(
				client,
				makeOpts({
					command: "editor:media:nonexistent",
					projectId: "p1",
				}),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("Unknown media action");
		});
	});
});

// ---------------------------------------------------------------------------
// Project handlers — uncovered actions
// ---------------------------------------------------------------------------

describe("Project handlers — uncovered actions", () => {
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

	describe("project:summary", () => {
		it("requires project-id", async () => {
			const result = await handleMediaProjectCommand(
				client,
				makeOpts({ command: "editor:project:summary" }),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--project-id");
		});

		it("calls GET on summary endpoint", async () => {
			mockRoute("GET", "/api/claude/project/p1/summary", {
				success: true,
				data: { name: "My Project", totalDuration: 120 },
			});
			const result = await handleMediaProjectCommand(
				client,
				makeOpts({
					command: "editor:project:summary",
					projectId: "p1",
				}),
				noopProgress
			);
			expect(result.success).toBe(true);
			expect((result.data as { name: string }).name).toBe("My Project");
		});
	});

	describe("project:report", () => {
		it("requires project-id", async () => {
			const result = await handleMediaProjectCommand(
				client,
				makeOpts({ command: "editor:project:report" }),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--project-id");
		});

		it("sends POST to report endpoint", async () => {
			mockRoute("POST", "/api/claude/project/p1/report", {
				success: true,
				data: { reportPath: "/tmp/report.md" },
			});
			const result = await handleMediaProjectCommand(
				client,
				makeOpts({
					command: "editor:project:report",
					projectId: "p1",
				}),
				noopProgress
			);
			expect(result.success).toBe(true);
		});
	});

	describe("project:update-settings missing data", () => {
		it("requires --data flag", async () => {
			const result = await handleMediaProjectCommand(
				client,
				makeOpts({
					command: "editor:project:update-settings",
					projectId: "p1",
				}),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--data");
		});
	});

	describe("unknown project action", () => {
		it("returns error for unknown action", async () => {
			const result = await handleMediaProjectCommand(
				client,
				makeOpts({
					command: "editor:project:nonexistent",
					projectId: "p1",
				}),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("Unknown project action");
		});
	});
});
