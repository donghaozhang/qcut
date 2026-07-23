import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { EditorApiClient } from "../native-pipeline/editor/editor-api-client.js";
import { handleGenerateExportCommand } from "../native-pipeline/editor/editor-handlers-generate.js";
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
const BASE_URL = "http://127.0.0.1:19879";

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

function makeOpts(overrides: Partial<CLIRunOptions>): CLIRunOptions {
	return {
		command: "editor:generate:start",
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
// Generate handlers
// ---------------------------------------------------------------------------

describe("Generate handlers", () => {
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

	describe("generate:start", () => {
		it("requires project-id, model, and prompt", async () => {
			const result = await handleGenerateExportCommand(
				client,
				makeOpts({ command: "editor:generate:start" }),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--project-id");
		});

		it("requires model", async () => {
			const result = await handleGenerateExportCommand(
				client,
				makeOpts({
					command: "editor:generate:start",
					projectId: "p1",
				}),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--model");
		});

		it("without --poll returns jobId", async () => {
			mockRoute("POST", "/api/claude/generate/p1/start", {
				success: true,
				data: { jobId: "gj1" },
			});
			const result = await handleGenerateExportCommand(
				client,
				makeOpts({
					command: "editor:generate:start",
					projectId: "p1",
					model: "flux_dev",
					text: "A sunset",
				}),
				noopProgress
			);
			expect(result.success).toBe(true);
			expect((result.data as { jobId: string }).jobId).toBe("gj1");
		});

		it("with --poll sends start then polls", async () => {
			let callCount = 0;
			const origFetch = globalThis.fetch;
			globalThis.fetch = async (
				input: RequestInfo | URL,
				init?: RequestInit
			) => {
				const url = input.toString();
				const method = init?.method ?? "GET";
				callCount++;

				if (method === "POST" && url.includes("/generate/p1/start")) {
					return new Response(
						JSON.stringify({ success: true, data: { jobId: "gj2" } }),
						{ headers: { "Content-Type": "application/json" } }
					);
				}

				if (method === "GET" && url.includes("/jobs/gj2")) {
					return new Response(
						JSON.stringify({
							success: true,
							data:
								callCount >= 4
									? {
											status: "completed",
											progress: 100,
											result: { url: "https://..." },
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

			const result = await handleGenerateExportCommand(
				client,
				makeOpts({
					command: "editor:generate:start",
					projectId: "p1",
					model: "flux_dev",
					text: "A sunset",
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
	});

	describe("generate:status", () => {
		it("requires job-id", async () => {
			const result = await handleGenerateExportCommand(
				client,
				makeOpts({
					command: "editor:generate:status",
					projectId: "p1",
				}),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--job-id");
		});
	});

	describe("generate:models", () => {
		it("calls GET on models endpoint", async () => {
			mockRoute("GET", "/api/claude/generate/models", {
				success: true,
				data: { models: [] },
			});
			const result = await handleGenerateExportCommand(
				client,
				makeOpts({ command: "editor:generate:models" }),
				noopProgress
			);
			expect(result.success).toBe(true);
		});
	});

	describe("generate:cancel", () => {
		it("sends POST to cancel endpoint", async () => {
			mockRoute("POST", "/api/claude/generate/p1/jobs/gj1/cancel", {
				success: true,
				data: { cancelled: true },
			});
			const result = await handleGenerateExportCommand(
				client,
				makeOpts({
					command: "editor:generate:cancel",
					projectId: "p1",
					jobId: "gj1",
				}),
				noopProgress
			);
			expect(result.success).toBe(true);
		});
	});

	describe("generate:estimate-cost", () => {
		it("requires model", async () => {
			const result = await handleGenerateExportCommand(
				client,
				makeOpts({ command: "editor:generate:estimate-cost" }),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--model");
		});

		it("sends cost estimate request", async () => {
			mockRoute("POST", "/api/claude/generate/estimate-cost", {
				success: true,
				data: { estimatedCost: 0.05, currency: "USD" },
			});
			const result = await handleGenerateExportCommand(
				client,
				makeOpts({
					command: "editor:generate:estimate-cost",
					model: "kling_pro",
				}),
				noopProgress
			);
			expect(result.success).toBe(true);
		});
	});
});

// ---------------------------------------------------------------------------
// Export handlers
// ---------------------------------------------------------------------------

describe("Export handlers", () => {
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

	describe("export:presets", () => {
		it("calls GET on presets endpoint", async () => {
			mockRoute("GET", "/api/claude/export/presets", {
				success: true,
				data: { presets: [] },
			});
			const result = await handleGenerateExportCommand(
				client,
				makeOpts({ command: "editor:export:presets" }),
				noopProgress
			);
			expect(result.success).toBe(true);
		});
	});

	describe("export:recommend", () => {
		it("requires target", async () => {
			const result = await handleGenerateExportCommand(
				client,
				makeOpts({
					command: "editor:export:recommend",
					projectId: "p1",
				}),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--target");
		});

		it("calls correct endpoint with target", async () => {
			mockRoute("GET", "/api/claude/export/p1/recommend/tiktok", {
				success: true,
				data: { preset: "tiktok", width: 1080, height: 1920, fps: 30 },
			});
			const result = await handleGenerateExportCommand(
				client,
				makeOpts({
					command: "editor:export:recommend",
					projectId: "p1",
					target: "tiktok",
				}),
				noopProgress
			);
			expect(result.success).toBe(true);
		});
	});

	describe("export:start", () => {
		it("requires project-id", async () => {
			const result = await handleGenerateExportCommand(
				client,
				makeOpts({ command: "editor:export:start" }),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--project-id");
		});

		it("without --poll returns jobId", async () => {
			mockRoute("POST", "/api/claude/export/p1/start", {
				success: true,
				data: { jobId: "ej1" },
			});
			const result = await handleGenerateExportCommand(
				client,
				makeOpts({
					command: "editor:export:start",
					projectId: "p1",
					preset: "youtube-1080p",
				}),
				noopProgress
			);
			expect(result.success).toBe(true);
			expect((result.data as { jobId: string }).jobId).toBe("ej1");
		});

		it("honors an exact output path and explicit engine", async () => {
			let capturedBody: Record<string, unknown> | undefined;
			const origFetch = globalThis.fetch;
			globalThis.fetch = async (
				_input: RequestInfo | URL,
				init?: RequestInit
			) => {
				capturedBody = JSON.parse(String(init?.body));
				return new Response(
					JSON.stringify({ success: true, data: { jobId: "ej-exact" } }),
					{ headers: { "Content-Type": "application/json" } }
				);
			};

			const result = await handleGenerateExportCommand(
				client,
				makeOpts({
					command: "editor:export:start",
					projectId: "p1",
					output: "/tmp/qcut-exact-export",
					engine: "cli",
				}),
				noopProgress
			);

			expect(result.success).toBe(true);
			expect(capturedBody).toEqual(
				expect.objectContaining({
					engine: "cli",
					outputPath: "/tmp/qcut-exact-export.mp4",
				})
			);

			globalThis.fetch = origFetch;
			installFetchMock(BASE_URL);
		});
	});

	describe("export:status", () => {
		it("calls GET on job endpoint", async () => {
			mockRoute("GET", "/api/claude/export/p1/jobs/ej1", {
				success: true,
				data: { status: "running", progress: 30 },
			});
			const result = await handleGenerateExportCommand(
				client,
				makeOpts({
					command: "editor:export:status",
					projectId: "p1",
					jobId: "ej1",
				}),
				noopProgress
			);
			expect(result.success).toBe(true);
		});
	});

	describe("export:list-jobs", () => {
		it("calls GET on jobs endpoint", async () => {
			mockRoute("GET", "/api/claude/export/p1/jobs", {
				success: true,
				data: { jobs: [] },
			});
			const result = await handleGenerateExportCommand(
				client,
				makeOpts({
					command: "editor:export:list-jobs",
					projectId: "p1",
				}),
				noopProgress
			);
			expect(result.success).toBe(true);
		});
	});
});

// ---------------------------------------------------------------------------
// Diagnostics handlers
// ---------------------------------------------------------------------------

describe("Diagnostics handlers", () => {
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

	describe("diagnostics:analyze", () => {
		it("requires message", async () => {
			const result = await handleGenerateExportCommand(
				client,
				makeOpts({ command: "editor:diagnostics:analyze" }),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--message");
		});

		it("sends diagnostic request", async () => {
			mockRoute("POST", "/api/claude/diagnostics/analyze", {
				success: true,
				data: { errorType: "RenderError", severity: "high" },
			});
			const result = await handleGenerateExportCommand(
				client,
				makeOpts({
					command: "editor:diagnostics:analyze",
					message: "Canvas rendering failed",
					stack: "Error at line 42",
				}),
				noopProgress
			);
			expect(result.success).toBe(true);
		});
	});
});

// ---------------------------------------------------------------------------
// MCP handlers
// ---------------------------------------------------------------------------

describe("MCP handlers", () => {
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

	describe("mcp:forward-html", () => {
		it("requires html", async () => {
			const result = await handleGenerateExportCommand(
				client,
				makeOpts({ command: "editor:mcp:forward-html" }),
				noopProgress
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--html");
		});

		it("sends inline HTML", async () => {
			let capturedBody: string | null = null;
			const origFetch = globalThis.fetch;
			globalThis.fetch = async (
				_input: RequestInfo | URL,
				init?: RequestInit
			) => {
				capturedBody = init?.body as string;
				return new Response(
					JSON.stringify({ success: true, data: { forwarded: true } }),
					{ headers: { "Content-Type": "application/json" } }
				);
			};

			await handleGenerateExportCommand(
				client,
				makeOpts({
					command: "editor:mcp:forward-html",
					html: "<h1>Hello</h1>",
				}),
				noopProgress
			);

			expect(JSON.parse(capturedBody!).html).toBe("<h1>Hello</h1>");

			globalThis.fetch = origFetch;
			installFetchMock(BASE_URL);
		});
	});
});
