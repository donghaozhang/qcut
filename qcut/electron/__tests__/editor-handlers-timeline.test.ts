import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { EditorApiClient } from "../native-pipeline/editor/editor-api-client.js";
import { handleTimelineEditingCommand } from "../native-pipeline/editor/editor-handlers-timeline.js";
import type { CLIRunOptions } from "../native-pipeline/cli/cli-runner.js";

// ---------------------------------------------------------------------------
// Mock HTTP server using global fetch mock
// ---------------------------------------------------------------------------

const routes = new Map<string, { status: number; body: unknown }>();

function mockRoute(method: string, path: string, body: unknown, status = 200) {
	routes.set(`${method} ${path}`, { status, body });
}

function clearRoutes() {
	routes.clear();
}

const originalFetch = globalThis.fetch;
const BASE_URL = "http://127.0.0.1:19877";

function installFetchMock(baseUrl: string) {
	globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === "string" ? input : input.toString();
		const method = init?.method ?? "GET";
		const pathname = url.replace(baseUrl, "").split("?")[0];
		const key = `${method} ${pathname}`;

		const route = routes.get(key);
		if (!route) {
			return new Response(
				JSON.stringify({
					success: false,
					error: `Not found: ${key}`,
					timestamp: Date.now(),
				}),
				{ status: 404, headers: { "Content-Type": "application/json" } }
			);
		}

		return new Response(JSON.stringify(route.body), {
			status: route.status,
			headers: { "Content-Type": "application/json" },
		});
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOpts(overrides: Partial<CLIRunOptions>): CLIRunOptions {
	return {
		command: "editor:timeline:export",
		outputDir: "./output",
		json: false,
		verbose: false,
		quiet: false,
		saveIntermediates: false,
		...overrides,
	} as CLIRunOptions;
}

const noopProgress = () => {};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Timeline handlers", () => {
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

	// -- Export / Import --

	describe("export", () => {
		it("calls correct endpoint with project-id", async () => {
			mockRoute("GET", "/api/claude/timeline/proj1", {
				success: true,
				data: { tracks: [], elements: [] },
			});
			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({ command: "editor:timeline:export", projectId: "proj1" }),
				noopProgress
			);
			expect(result.success).toBe(true);
		});

		it("requires project-id", async () => {
			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({ command: "editor:timeline:export" }),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--project-id");
		});
	});

	describe("import", () => {
		it("requires project-id and data", async () => {
			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({ command: "editor:timeline:import" }),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--project-id");
		});

		it("sends data to import endpoint", async () => {
			mockRoute("POST", "/api/claude/timeline/proj1/import", {
				success: true,
				data: { imported: 3 },
			});
			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:timeline:import",
					projectId: "proj1",
					data: '{"tracks":[]}',
				}),
				noopProgress
			);
			expect(result.success).toBe(true);
		});

		it("sends replace flag when specified", async () => {
			let capturedBody: string | null = null;
			const origFetch = globalThis.fetch;
			globalThis.fetch = async (
				_input: RequestInfo | URL,
				init?: RequestInit
			) => {
				capturedBody = init?.body as string;
				return new Response(
					JSON.stringify({ success: true, data: { imported: 1 } }),
					{ headers: { "Content-Type": "application/json" } }
				);
			};

			await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:timeline:import",
					projectId: "proj1",
					data: '{"tracks":[]}',
					replace: true,
				}),
				noopProgress
			);

			expect(JSON.parse(capturedBody!).replace).toBe(true);

			globalThis.fetch = origFetch;
			installFetchMock(BASE_URL);
		});
	});

	// -- Element CRUD --

	describe("add-element", () => {
		it("requires project-id and data", async () => {
			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({ command: "editor:timeline:add-element", projectId: "p1" }),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--data");
		});

		it("sends element to correct endpoint", async () => {
			mockRoute("POST", "/api/claude/timeline/p1/elements", {
				success: true,
				data: { elementId: "e1" },
			});
			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:timeline:add-element",
					projectId: "p1",
					data: '{"type":"video","trackIndex":0}',
				}),
				noopProgress
			);
			expect(result.success).toBe(true);
		});
	});

	describe("batch-add", () => {
		it("rejects >50 elements", async () => {
			const elements = Array.from({ length: 51 }, (_, i) => ({
				type: "video",
				id: `e${i}`,
			}));
			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:timeline:batch-add",
					projectId: "p1",
					elements: JSON.stringify(elements),
				}),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("Batch limit");
		});

		it("accepts valid batch", async () => {
			mockRoute("POST", "/api/claude/timeline/p1/elements/batch", {
				success: true,
				data: { added: 2 },
			});
			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:timeline:batch-add",
					projectId: "p1",
					elements:
						'[{"type":"video","trackId":"t1"},{"type":"audio","trackId":"t1"}]',
				}),
				noopProgress
			);
			expect(result.success).toBe(true);
		});
	});

	describe("update-element", () => {
		it("requires element-id and changes", async () => {
			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:timeline:update-element",
					projectId: "p1",
				}),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--element-id");
		});

		it("sends changes to correct endpoint", async () => {
			let capturedBody: string | null = null;
			const origFetch = globalThis.fetch;
			globalThis.fetch = async (
				_input: RequestInfo | URL,
				init?: RequestInit
			) => {
				capturedBody = init?.body as string;
				return new Response(
					JSON.stringify({ success: true, data: { updated: true } }),
					{ headers: { "Content-Type": "application/json" } }
				);
			};

			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:timeline:update-element",
					projectId: "p1",
					elementId: "elem1",
					changes: '{"startTime":5}',
				}),
				noopProgress
			);
			expect(result.success).toBe(true);
			expect(JSON.parse(capturedBody!)).toEqual({ startTime: 5 });

			globalThis.fetch = origFetch;
			installFetchMock(BASE_URL);
		});
	});

	describe("trim", () => {
		it("sends direct timeline fields in the PATCH body", async () => {
			let capturedBody: string | null = null;
			const origFetch = globalThis.fetch;
			globalThis.fetch = async (
				_input: RequestInfo | URL,
				init?: RequestInit
			) => {
				capturedBody = init?.body as string;
				return new Response(
					JSON.stringify({ success: true, data: { updated: true } }),
					{ headers: { "Content-Type": "application/json" } }
				);
			};

			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:timeline:trim",
					projectId: "p1",
					elementId: "elem1",
					endTime: 3,
				}),
				noopProgress
			);

			expect(result.success).toBe(true);
			expect(JSON.parse(capturedBody!)).toEqual({ endTime: 3 });

			globalThis.fetch = origFetch;
			installFetchMock(BASE_URL);
		});
	});

	describe("batch-delete", () => {
		it("includes ripple flag in body", async () => {
			let capturedBody: string | null = null;
			const origFetch = globalThis.fetch;
			globalThis.fetch = async (
				_input: RequestInfo | URL,
				init?: RequestInit
			) => {
				capturedBody = init?.body as string;
				return new Response(
					JSON.stringify({ success: true, data: { deleted: 2 } }),
					{ headers: { "Content-Type": "application/json" } }
				);
			};

			await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:timeline:batch-delete",
					projectId: "p1",
					elements: '[{"trackId":"t1","elementId":"e1"}]',
					ripple: true,
				}),
				noopProgress
			);

			expect(JSON.parse(capturedBody!).ripple).toBe(true);

			globalThis.fetch = origFetch;
			installFetchMock(BASE_URL);
		});
	});

	// -- Manipulation --

	describe("split", () => {
		it("requires split-time to be a number", async () => {
			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:timeline:split",
					projectId: "p1",
					elementId: "e1",
				}),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--split-time");
		});

		it("sends split request to correct endpoint", async () => {
			mockRoute("POST", "/api/claude/timeline/p1/elements/e1/split", {
				success: true,
				data: { left: "e1a", right: "e1b" },
			});
			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:timeline:split",
					projectId: "p1",
					elementId: "e1",
					splitTime: 5.5,
				}),
				noopProgress
			);
			expect(result.success).toBe(true);
		});
	});

	describe("move", () => {
		it("requires to-track", async () => {
			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:timeline:move",
					projectId: "p1",
					elementId: "e1",
				}),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--to-track");
		});

		it("sends move request with correct path", async () => {
			mockRoute("POST", "/api/claude/timeline/p1/elements/e1/move", {
				success: true,
				data: { moved: true },
			});
			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:timeline:move",
					projectId: "p1",
					elementId: "e1",
					toTrack: "track2",
				}),
				noopProgress
			);
			expect(result.success).toBe(true);
		});
	});

	describe("arrange", () => {
		it("validates mode against allowed values", async () => {
			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:timeline:arrange",
					projectId: "p1",
					trackId: "t1",
					mode: "invalid",
				}),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("Invalid --mode");
		});

		it("accepts sequential mode", async () => {
			mockRoute("POST", "/api/claude/timeline/p1/arrange", {
				success: true,
				data: { arranged: 3 },
			});
			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:timeline:arrange",
					projectId: "p1",
					trackId: "t1",
					mode: "sequential",
				}),
				noopProgress
			);
			expect(result.success).toBe(true);
		});
	});

	// -- Selection --

	describe("get-selection", () => {
		it("calls GET on selection endpoint", async () => {
			mockRoute("GET", "/api/claude/timeline/p1/selection", {
				success: true,
				data: { elements: [] },
			});
			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:timeline:get-selection",
					projectId: "p1",
				}),
				noopProgress
			);
			expect(result.success).toBe(true);
		});
	});

	describe("clear-selection", () => {
		it("calls DELETE on selection endpoint", async () => {
			mockRoute("DELETE", "/api/claude/timeline/p1/selection", {
				success: true,
				data: { cleared: true },
			});
			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:timeline:clear-selection",
					projectId: "p1",
				}),
				noopProgress
			);
			expect(result.success).toBe(true);
		});
	});
});

describe("Editing handlers", () => {
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

	describe("batch-cuts", () => {
		it("sends cuts array in body", async () => {
			let capturedBody: string | null = null;
			const origFetch = globalThis.fetch;
			globalThis.fetch = async (
				_input: RequestInfo | URL,
				init?: RequestInit
			) => {
				capturedBody = init?.body as string;
				return new Response(
					JSON.stringify({ success: true, data: { cutsApplied: 2 } }),
					{ headers: { "Content-Type": "application/json" } }
				);
			};

			await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:editing:batch-cuts",
					projectId: "p1",
					elementId: "e1",
					cuts: '[{"start":1,"end":3},{"start":5,"end":7}]',
				}),
				noopProgress
			);

			const body = JSON.parse(capturedBody!);
			expect(body.cuts).toHaveLength(2);
			expect(body.elementId).toBe("e1");

			globalThis.fetch = origFetch;
			installFetchMock(BASE_URL);
		});

		it("requires element-id and cuts", async () => {
			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:editing:batch-cuts",
					projectId: "p1",
				}),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--element-id");
		});
	});

	describe("delete-range", () => {
		it("validates start-time < end-time", async () => {
			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:editing:delete-range",
					projectId: "p1",
					startTime: 10,
					endTime: 5,
				}),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("less than");
		});

		it("splits comma-separated track-id", async () => {
			let capturedBody: string | null = null;
			const origFetch = globalThis.fetch;
			globalThis.fetch = async (
				_input: RequestInfo | URL,
				init?: RequestInit
			) => {
				capturedBody = init?.body as string;
				return new Response(
					JSON.stringify({ success: true, data: { deleted: 1 } }),
					{ headers: { "Content-Type": "application/json" } }
				);
			};

			await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:editing:delete-range",
					projectId: "p1",
					startTime: 1,
					endTime: 5,
					trackId: "t1, t2, t3",
				}),
				noopProgress
			);

			const body = JSON.parse(capturedBody!);
			expect(body.trackIds).toEqual(["t1", "t2", "t3"]);

			globalThis.fetch = origFetch;
			installFetchMock(BASE_URL);
		});
	});

	describe("auto-edit", () => {
		it("without --poll sends sync POST", async () => {
			mockRoute("POST", "/api/claude/timeline/p1/auto-edit", {
				success: true,
				data: { edits: 5, removedFillers: 3 },
			});
			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:editing:auto-edit",
					projectId: "p1",
					elementId: "e1",
					mediaId: "m1",
					removeFillers: true,
				}),
				noopProgress
			);
			expect(result.success).toBe(true);
		});

		it("with --poll sends async POST and polls", async () => {
			let callCount = 0;
			const origFetch = globalThis.fetch;
			globalThis.fetch = async (
				input: RequestInfo | URL,
				init?: RequestInit
			) => {
				const url = input.toString();
				const method = init?.method ?? "GET";
				callCount++;

				// First call: POST to /start
				if (method === "POST" && url.includes("/auto-edit/start")) {
					return new Response(
						JSON.stringify({
							success: true,
							data: { jobId: "job123" },
						}),
						{ headers: { "Content-Type": "application/json" } }
					);
				}

				// Poll calls: GET /jobs/job123
				if (method === "GET" && url.includes("/jobs/job123")) {
					const done = callCount >= 4;
					return new Response(
						JSON.stringify({
							success: true,
							data: done
								? {
										status: "completed",
										progress: 100,
										result: { edits: 3 },
									}
								: { status: "running", progress: 50 },
						}),
						{ headers: { "Content-Type": "application/json" } }
					);
				}

				return new Response(
					JSON.stringify({ success: false, error: "unexpected" }),
					{ status: 404, headers: { "Content-Type": "application/json" } }
				);
			};

			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:editing:auto-edit",
					projectId: "p1",
					elementId: "e1",
					mediaId: "m1",
					poll: true,
					pollInterval: 0.01,
				}),
				noopProgress
			);

			expect(result.success).toBe(true);
			expect(callCount).toBeGreaterThanOrEqual(3);

			globalThis.fetch = origFetch;
			installFetchMock(BASE_URL);
		});

		it("requires element-id and media-id", async () => {
			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:editing:auto-edit",
					projectId: "p1",
				}),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--element-id");
		});
	});

	describe("suggest-cuts", () => {
		it("maps to /analyze/ endpoint", async () => {
			let capturedUrl = "";
			const origFetch = globalThis.fetch;
			globalThis.fetch = async (
				input: RequestInfo | URL,
				_init?: RequestInit
			) => {
				capturedUrl = input.toString();
				return new Response(
					JSON.stringify({
						success: true,
						data: { cuts: [], suggestionsCount: 0 },
					}),
					{ headers: { "Content-Type": "application/json" } }
				);
			};

			await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:editing:suggest-cuts",
					projectId: "p1",
					mediaId: "m1",
				}),
				noopProgress
			);

			expect(capturedUrl).toContain("/api/claude/analyze/");
			expect(capturedUrl).not.toContain("/api/claude/timeline/");

			globalThis.fetch = origFetch;
			installFetchMock(BASE_URL);
		});

		it("requires media-id", async () => {
			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:editing:suggest-cuts",
					projectId: "p1",
				}),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--media-id");
		});
	});

	describe("suggest-status", () => {
		it("calls GET on analyze endpoint", async () => {
			mockRoute("GET", "/api/claude/analyze/p1/suggest-cuts/jobs/j1", {
				success: true,
				data: { status: "running", progress: 40 },
			});
			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:editing:suggest-status",
					projectId: "p1",
					jobId: "j1",
				}),
				noopProgress
			);
			expect(result.success).toBe(true);
		});

		it("requires job-id", async () => {
			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:editing:suggest-status",
					projectId: "p1",
				}),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--job-id");
		});
	});

	describe("auto-edit-list", () => {
		it("calls GET on auto-edit jobs endpoint", async () => {
			mockRoute("GET", "/api/claude/timeline/p1/auto-edit/jobs", {
				success: true,
				data: { jobs: [] },
			});
			const result = await handleTimelineEditingCommand(
				client,
				makeOpts({
					command: "editor:editing:auto-edit-list",
					projectId: "p1",
				}),
				noopProgress
			);
			expect(result.success).toBe(true);
		});
	});
});
