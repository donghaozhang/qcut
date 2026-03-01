import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { handleEditorCommand } from "../native-pipeline/cli/cli-handlers-editor.js";
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
// 1. Dispatcher integration tests (handleEditorCommand)
// ---------------------------------------------------------------------------

describe("handleEditorCommand dispatcher", () => {
	beforeAll(() => {
		installFetchMock(BASE_URL);
	});

	afterEach(() => {
		clearRoutes();
	});

	afterAll(() => {
		globalThis.fetch = originalFetch;
	});

	it("editor:health skips health check and returns data", async () => {
		mockRoute("GET", "/api/claude/health", {
			success: true,
			data: { status: "ok", version: "2.0.0", uptime: 500 },
		});
		const result = await handleEditorCommand(
			makeOpts({ command: "editor:health" }),
			noopProgress
		);
		expect(result.success).toBe(true);
		expect((result.data as { status: string }).status).toBe("ok");
	});

	it("returns error when QCut is not running (health check fails)", async () => {
		// No health route mocked — will return 404 with success:false
		const result = await handleEditorCommand(
			makeOpts({ command: "editor:media:list", projectId: "p1" }),
			noopProgress
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("QCut editor not running");
		expect(result.error).toContain("bun run electron:dev");
	});

	it("routes editor:media:* to media handler", async () => {
		mockRoute("GET", "/api/claude/health", {
			success: true,
			data: { status: "ok" },
		});
		mockRoute("GET", "/api/claude/media/proj1", {
			success: true,
			data: [{ id: "m1" }],
		});
		const result = await handleEditorCommand(
			makeOpts({ command: "editor:media:list", projectId: "proj1" }),
			noopProgress
		);
		expect(result.success).toBe(true);
	});

	it("routes editor:project:* to project handler", async () => {
		mockRoute("GET", "/api/claude/health", {
			success: true,
			data: { status: "ok" },
		});
		mockRoute("GET", "/api/claude/project/proj1/stats", {
			success: true,
			data: { totalDuration: 120, trackCount: 3 },
		});
		const result = await handleEditorCommand(
			makeOpts({ command: "editor:project:stats", projectId: "proj1" }),
			noopProgress
		);
		expect(result.success).toBe(true);
	});

	it("routes editor:timeline:* to timeline handler", async () => {
		mockRoute("GET", "/api/claude/health", {
			success: true,
			data: { status: "ok" },
		});
		mockRoute("GET", "/api/claude/timeline/p1", {
			success: true,
			data: { tracks: [] },
		});
		const result = await handleEditorCommand(
			makeOpts({ command: "editor:timeline:export", projectId: "p1" }),
			noopProgress
		);
		expect(result.success).toBe(true);
	});

	it("routes editor:analyze:* to analysis handler", async () => {
		mockRoute("GET", "/api/claude/health", {
			success: true,
			data: { status: "ok" },
		});
		mockRoute("GET", "/api/claude/analyze/models", {
			success: true,
			data: { models: ["gpt-4v"] },
		});
		const result = await handleEditorCommand(
			makeOpts({ command: "editor:analyze:models" }),
			noopProgress
		);
		expect(result.success).toBe(true);
	});

	it("routes editor:generate:* to generate handler", async () => {
		mockRoute("GET", "/api/claude/health", {
			success: true,
			data: { status: "ok" },
		});
		mockRoute("GET", "/api/claude/generate/models", {
			success: true,
			data: { models: [] },
		});
		const result = await handleEditorCommand(
			makeOpts({ command: "editor:generate:models" }),
			noopProgress
		);
		expect(result.success).toBe(true);
	});

	it("routes editor:export:* to export handler", async () => {
		mockRoute("GET", "/api/claude/health", {
			success: true,
			data: { status: "ok" },
		});
		mockRoute("GET", "/api/claude/export/presets", {
			success: true,
			data: { presets: [] },
		});
		const result = await handleEditorCommand(
			makeOpts({ command: "editor:export:presets" }),
			noopProgress
		);
		expect(result.success).toBe(true);
	});

	it("routes editor:diagnostics:* to diagnostics handler", async () => {
		mockRoute("GET", "/api/claude/health", {
			success: true,
			data: { status: "ok" },
		});
		mockRoute("POST", "/api/claude/diagnostics/analyze", {
			success: true,
			data: { errorType: "RenderError" },
		});
		const result = await handleEditorCommand(
			makeOpts({
				command: "editor:diagnostics:analyze",
				message: "render failed",
			}),
			noopProgress
		);
		expect(result.success).toBe(true);
	});

	it("routes editor:mcp:* to MCP handler", async () => {
		mockRoute("GET", "/api/claude/health", {
			success: true,
			data: { status: "ok" },
		});
		mockRoute("POST", "/api/claude/mcp/app", {
			success: true,
			data: { forwarded: true },
		});
		const result = await handleEditorCommand(
			makeOpts({
				command: "editor:mcp:forward-html",
				html: "<div>test</div>",
			}),
			noopProgress
		);
		expect(result.success).toBe(true);
	});

	it("returns error for unknown module", async () => {
		mockRoute("GET", "/api/claude/health", {
			success: true,
			data: { status: "ok" },
		});
		const result = await handleEditorCommand(
			makeOpts({ command: "editor:foobar:action" }),
			noopProgress
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("Unknown editor module: foobar");
	});
});

// ---------------------------------------------------------------------------
// EditorApiClient — error handling edge cases
// ---------------------------------------------------------------------------

describe("EditorApiClient — error edge cases", () => {
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

	it("patch sends correct method", async () => {
		mockRoute("PATCH", "/api/claude/test/patch", {
			success: true,
			data: { patched: true },
		});
		const result = await client.patch("/api/claude/test/patch", {
			key: "val",
		});
		expect(result).toEqual({ patched: true });
		expect(lastCapturedMethod).toBe("PATCH");
	});

	it("delete sends correct method", async () => {
		mockRoute("DELETE", "/api/claude/test/delete", {
			success: true,
			data: { deleted: true },
		});
		const result = await client.delete("/api/claude/test/delete");
		expect(result).toEqual({ deleted: true });
		expect(lastCapturedMethod).toBe("DELETE");
	});

	it("delete sends body when provided", async () => {
		mockRoute("DELETE", "/api/claude/test/delete-body", {
			success: true,
			data: { deleted: true },
		});
		await client.delete("/api/claude/test/delete-body", {
			ids: ["a", "b"],
		});
		const body = JSON.parse(lastCapturedBody!);
		expect(body.ids).toEqual(["a", "b"]);
	});

	it("pollJob handles cancelled status", async () => {
		const origFetch = globalThis.fetch;
		globalThis.fetch = async () => {
			return new Response(
				JSON.stringify({
					success: true,
					data: { status: "cancelled" },
				}),
				{ headers: { "Content-Type": "application/json" } }
			);
		};

		await expect(
			client.pollJob("/api/claude/jobs/cancelled1", { interval: 10 })
		).rejects.toThrow("cancelled");

		globalThis.fetch = origFetch;
		installFetchMock(BASE_URL);
	});
});
