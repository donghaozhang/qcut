import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import {
	EditorApiClient,
	EditorApiError,
	createEditorClient,
} from "../native-pipeline/editor/editor-api-client.js";
import { resolveJsonInput } from "../native-pipeline/editor/editor-api-types.js";
import {
	handleEditorHealth,
	handleMediaProjectCommand,
} from "../native-pipeline/editor/editor-handlers-media.js";
import type { CLIRunOptions } from "../native-pipeline/cli/cli-runner.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

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
					error: "Not found",
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
// Tests
// ---------------------------------------------------------------------------

const BASE_URL = "http://127.0.0.1:19876";

describe("EditorApiClient", () => {
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

	describe("checkHealth", () => {
		it("returns true when server responds successfully", async () => {
			mockRoute("GET", "/api/claude/health", {
				success: true,
				data: { status: "ok", version: "1.0.0", uptime: 100 },
			});
			expect(await client.checkHealth()).toBe(true);
		});

		it("returns false when server returns error", async () => {
			mockRoute(
				"GET",
				"/api/claude/health",
				{ success: false, error: "down" },
				500
			);
			expect(await client.checkHealth()).toBe(false);
		});

		it("stays healthy when capability endpoint is unavailable", async () => {
			const freshClient = new EditorApiClient({ baseUrl: BASE_URL });
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			mockRoute("GET", "/api/claude/health", {
				success: true,
				data: { status: "ok", version: "1.0.0", uptime: 100 },
			});
			mockRoute(
				"GET",
				"/api/claude/capabilities",
				{ success: false, error: "Not found" },
				404
			);

			expect(await freshClient.checkHealth()).toBe(true);
			expect(warnSpy).toHaveBeenCalled();

			warnSpy.mockRestore();
		});
	});

	describe("capability negotiation", () => {
		it("caches capability manifest after first fetch", async () => {
			let capabilityFetchCount = 0;
			const freshClient = new EditorApiClient({ baseUrl: BASE_URL });
			const origFetch = globalThis.fetch;

			globalThis.fetch = async (
				input: RequestInfo | URL,
				init?: RequestInit
			) => {
				const url = typeof input === "string" ? input : input.toString();
				const method = init?.method ?? "GET";
				const pathname = url.replace(BASE_URL, "").split("?")[0];

				if (method === "GET" && pathname === "/api/claude/capabilities") {
					capabilityFetchCount++;
					return new Response(
						JSON.stringify({
							success: true,
							data: {
								apiVersion: "1.1.0",
								protocolVersion: "1.0.0",
								capabilities: [
									{
										name: "state.health",
										version: "1.0.0",
										description: "Health",
										since: "1.0.0",
										category: "state",
									},
								],
							},
						}),
						{ headers: { "Content-Type": "application/json" } }
					);
				}

				return new Response(
					JSON.stringify({
						success: true,
						data: { status: "ok", version: "1.0.0" },
					}),
					{ headers: { "Content-Type": "application/json" } }
				);
			};

			const first = await freshClient.negotiateCapabilities();
			const second = await freshClient.negotiateCapabilities();

			expect(first?.apiVersion).toBe("1.1.0");
			expect(second?.apiVersion).toBe("1.1.0");
			expect(capabilityFetchCount).toBe(1);

			globalThis.fetch = origFetch;
			installFetchMock(BASE_URL);
		});

		it("warns before calling an endpoint when required capability is missing", async () => {
			const freshClient = new EditorApiClient({ baseUrl: BASE_URL });
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			mockRoute("GET", "/api/claude/capabilities", {
				success: true,
				data: {
					apiVersion: "1.1.0",
					protocolVersion: "1.0.0",
					capabilities: [
						{
							name: "state.health",
							version: "1.0.0",
							description: "Health",
							since: "1.0.0",
							category: "state",
						},
					],
				},
			});
			mockRoute("GET", "/api/claude/media/proj1", {
				success: true,
				data: [],
			});

			await freshClient.get("/api/claude/media/proj1");

			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining("media.library")
			);

			warnSpy.mockRestore();
		});

		it("getApiVersion returns negotiated api version", async () => {
			const freshClient = new EditorApiClient({ baseUrl: BASE_URL });

			mockRoute("GET", "/api/claude/capabilities", {
				success: true,
				data: {
					apiVersion: "1.2.3",
					protocolVersion: "1.0.0",
					capabilities: [],
				},
			});

			await expect(freshClient.getApiVersion()).resolves.toBe("1.2.3");
		});
	});

	describe("get", () => {
		it("unwraps response envelope and returns data", async () => {
			mockRoute("GET", "/api/claude/media/proj1", {
				success: true,
				data: [{ id: "m1", name: "test.mp4" }],
			});
			const result = await client.get("/api/claude/media/proj1");
			expect(result).toEqual([{ id: "m1", name: "test.mp4" }]);
		});

		it("throws EditorApiError when success is false", async () => {
			mockRoute("GET", "/api/claude/media/bad", {
				success: false,
				error: "Project not found",
			});
			await expect(client.get("/api/claude/media/bad")).rejects.toThrow(
				EditorApiError
			);
		});

		it("appends query params", async () => {
			let capturedUrl = "";
			const origFetch = globalThis.fetch;
			globalThis.fetch = async (input: RequestInfo | URL) => {
				capturedUrl = input.toString();
				return new Response(JSON.stringify({ success: true, data: "ok" }), {
					headers: { "Content-Type": "application/json" },
				});
			};

			await client.get("/api/claude/timeline/p1", { format: "md" });
			expect(capturedUrl).toContain("format=md");

			globalThis.fetch = origFetch;
			installFetchMock(BASE_URL);
		});
	});

	describe("post", () => {
		it("sends JSON body with Content-Type header", async () => {
			let capturedBody: string | null = null;
			let capturedHeaders: Record<string, string> = {};
			const origFetch = globalThis.fetch;
			globalThis.fetch = async (
				_input: RequestInfo | URL,
				init?: RequestInit
			) => {
				capturedBody = init?.body as string;
				capturedHeaders = Object.fromEntries(
					Object.entries(init?.headers ?? {})
				);
				return new Response(
					JSON.stringify({ success: true, data: { imported: true } }),
					{ headers: { "Content-Type": "application/json" } }
				);
			};

			await client.post("/api/claude/media/p1/import", {
				source: "/tmp/video.mp4",
			});
			expect(capturedHeaders["Content-Type"]).toBe("application/json");
			expect(JSON.parse(capturedBody!)).toEqual({
				source: "/tmp/video.mp4",
			});

			globalThis.fetch = origFetch;
			installFetchMock(BASE_URL);
		});
	});

	describe("auth token", () => {
		it("includes Authorization header when token is set", async () => {
			let capturedHeaders: Record<string, string> = {};
			const origFetch = globalThis.fetch;
			globalThis.fetch = async (
				_input: RequestInfo | URL,
				init?: RequestInit
			) => {
				capturedHeaders = Object.fromEntries(
					Object.entries(init?.headers ?? {})
				);
				return new Response(JSON.stringify({ success: true, data: {} }), {
					headers: { "Content-Type": "application/json" },
				});
			};

			const authedClient = new EditorApiClient({
				baseUrl: BASE_URL,
				token: "my-secret",
			});
			await authedClient.get("/api/claude/health");
			expect(capturedHeaders.Authorization).toBe("Bearer my-secret");

			globalThis.fetch = origFetch;
			installFetchMock(BASE_URL);
		});
	});

	describe("pollJob", () => {
		it("polls until status is completed and returns result", async () => {
			let callCount = 0;
			const origFetch = globalThis.fetch;
			globalThis.fetch = async () => {
				callCount++;
				const status =
					callCount < 3
						? { status: "running", progress: callCount * 30 }
						: {
								status: "completed",
								progress: 100,
								result: { output: "done" },
							};
				return new Response(JSON.stringify({ success: true, data: status }), {
					headers: { "Content-Type": "application/json" },
				});
			};

			const result = await client.pollJob("/api/claude/jobs/j1", {
				interval: 10,
			});
			expect((result as { status: string }).status).toBe("completed");
			expect(callCount).toBe(3);

			globalThis.fetch = origFetch;
			installFetchMock(BASE_URL);
		});

		it("throws on job failure", async () => {
			const origFetch = globalThis.fetch;
			globalThis.fetch = async () => {
				return new Response(
					JSON.stringify({
						success: true,
						data: {
							status: "failed",
							message: "Model unavailable",
						},
					}),
					{ headers: { "Content-Type": "application/json" } }
				);
			};

			await expect(
				client.pollJob("/api/claude/jobs/j2", { interval: 10 })
			).rejects.toThrow("Model unavailable");

			globalThis.fetch = origFetch;
			installFetchMock(BASE_URL);
		});

		it("includes structured failure context when available", async () => {
			const origFetch = globalThis.fetch;
			globalThis.fetch = async () => {
				return new Response(
					JSON.stringify({
						success: true,
						data: {
							status: "failed",
							message: "Auto-edit pipeline failed",
							errorDetails: {
								stage: "apply-cuts",
								process: "main",
								action: "auto-edit pipeline execution",
								guard: "ipc-main-ready",
								hint: "Check batch-cuts IPC bridge and renderer cut execution handlers.",
							},
						},
					}),
					{ headers: { "Content-Type": "application/json" } }
				);
			};

			await expect(
				client.pollJob("/api/claude/jobs/j4", { interval: 10 })
			).rejects.toThrow("guard=ipc-main-ready");

			globalThis.fetch = origFetch;
			installFetchMock(BASE_URL);
		});

		it("includes debug trace context when enabled", async () => {
			const origFetch = globalThis.fetch;
			globalThis.fetch = async () => {
				return new Response(
					JSON.stringify({
						success: true,
						data: {
							status: "failed",
							message: "Auto-edit pipeline failed",
							correlationId: "corr_abc123",
							errorDetails: {
								stage: "apply-cuts",
								process: "main",
								action: "auto-edit pipeline execution",
								guard: "ipc-main-ready",
								hint: "Check bridge",
								statusCode: 503,
								cause: "IPC bridge unavailable for batch cut execution",
								timestamp: 1_700_000_000_000,
							},
						},
					}),
					{ headers: { "Content-Type": "application/json" } }
				);
			};

			await expect(
				client.pollJob("/api/claude/jobs/j5", {
					interval: 10,
					debugTrace: true,
				})
			).rejects.toThrow(
				"statusCode=503, cause=IPC bridge unavailable for batch cut execution, errorTs=1700000000000, correlationId=corr_abc123"
			);

			globalThis.fetch = origFetch;
			installFetchMock(BASE_URL);
		});

		it("times out after configured timeout", async () => {
			const origFetch = globalThis.fetch;
			globalThis.fetch = async () => {
				return new Response(
					JSON.stringify({
						success: true,
						data: { status: "running", progress: 10 },
					}),
					{ headers: { "Content-Type": "application/json" } }
				);
			};

			await expect(
				client.pollJob("/api/claude/jobs/j3", {
					interval: 10,
					timeout: 50,
				})
			).rejects.toThrow("timed out");

			globalThis.fetch = origFetch;
			installFetchMock(BASE_URL);
		});
	});
});

describe("createEditorClient", () => {
	it("reads host, port, token from options", () => {
		const opts = {
			command: "editor:health",
			outputDir: "./output",
			json: false,
			verbose: false,
			quiet: false,
			saveIntermediates: false,
			host: "192.168.1.1",
			port: "9999",
			token: "abc",
		} as CLIRunOptions;

		const client = createEditorClient(opts);
		// Client should be created without errors
		expect(client).toBeInstanceOf(EditorApiClient);
	});
});

describe("resolveJsonInput", () => {
	it("parses inline JSON object", async () => {
		const result = await resolveJsonInput('{"key":"value"}');
		expect(result).toEqual({ key: "value" });
	});

	it("parses inline JSON array", async () => {
		const result = await resolveJsonInput("[1, 2, 3]");
		expect(result).toEqual([1, 2, 3]);
	});

	it("reads and parses @file.json", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "editor-test-"));
		const tmpFile = path.join(tmpDir, "test.json");
		fs.writeFileSync(tmpFile, '{"from":"file"}');

		const result = await resolveJsonInput(`@${tmpFile}`);
		expect(result).toEqual({ from: "file" });

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("throws on invalid JSON", async () => {
		await expect(resolveJsonInput("not-json")).rejects.toThrow("Invalid JSON");
	});

	it("throws on missing file", async () => {
		await expect(resolveJsonInput("@/nonexistent/file.json")).rejects.toThrow(
			"Cannot read file"
		);
	});
});

describe("Media handlers", () => {
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

	function makeOpts(overrides: Partial<CLIRunOptions>): CLIRunOptions {
		return {
			command: "editor:media:list",
			outputDir: "./output",
			json: false,
			verbose: false,
			quiet: false,
			saveIntermediates: false,
			...overrides,
		} as CLIRunOptions;
	}

	const noopProgress = () => {};

	it("editor:health returns health data", async () => {
		mockRoute("GET", "/api/claude/health", {
			success: true,
			data: { status: "ok", version: "1.0.0" },
		});
		const result = await handleEditorHealth(client);
		expect(result.success).toBe(true);
		expect((result.data as { status: string }).status).toBe("ok");
	});

	it("editor:health --status-only --deep includes deepStatus", async () => {
		mockRoute("GET", "/api/claude/health", {
			success: true,
			data: {
				status: "ok",
				version: "1.0.0",
				apiVersion: "1.1.0",
				deepStatus: "degraded",
			},
		});
		const result = await handleEditorHealth(
			client,
			makeOpts({
				command: "editor:health",
				statusOnly: true,
				deep: true,
			})
		);
		expect(result.success).toBe(true);
		expect((result.data as { deepStatus?: string }).deepStatus).toBe(
			"degraded"
		);
	});

	it("editor:media:list requires project-id", async () => {
		const result = await handleMediaProjectCommand(
			client,
			makeOpts({ command: "editor:media:list" }),
			noopProgress
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("--project-id");
	});

	it("editor:media:list calls correct endpoint", async () => {
		mockRoute("GET", "/api/claude/media/test-proj", {
			success: true,
			data: [{ id: "m1", name: "video.mp4" }],
		});
		const result = await handleMediaProjectCommand(
			client,
			makeOpts({
				command: "editor:media:list",
				projectId: "test-proj",
			}),
			noopProgress
		);
		expect(result.success).toBe(true);
	});

	it("editor:media:import validates file exists", async () => {
		const result = await handleMediaProjectCommand(
			client,
			makeOpts({
				command: "editor:media:import",
				projectId: "test-proj",
				source: "/nonexistent/video.mp4",
			}),
			noopProgress
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("File not found");
	});

	it("editor:media:batch-import rejects >20 items", async () => {
		const items = Array.from({ length: 21 }, (_, i) => ({
			path: `/tmp/file${i}.mp4`,
		}));
		const result = await handleMediaProjectCommand(
			client,
			makeOpts({
				command: "editor:media:batch-import",
				projectId: "test-proj",
				items: JSON.stringify(items),
			}),
			noopProgress
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("Batch limit");
	});
});

describe("Project handlers", () => {
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

	function makeOpts(overrides: Partial<CLIRunOptions>): CLIRunOptions {
		return {
			command: "editor:project:settings",
			outputDir: "./output",
			json: false,
			verbose: false,
			quiet: false,
			saveIntermediates: false,
			...overrides,
		} as CLIRunOptions;
	}

	const noopProgress = () => {};

	it("editor:project:settings calls GET endpoint", async () => {
		mockRoute("GET", "/api/claude/project/proj1/settings", {
			success: true,
			data: { name: "My Project", width: 1920, height: 1080, fps: 30 },
		});
		const result = await handleMediaProjectCommand(
			client,
			makeOpts({
				command: "editor:project:settings",
				projectId: "proj1",
			}),
			noopProgress
		);
		expect(result.success).toBe(true);
		expect((result.data as { name: string }).name).toBe("My Project");
	});

	it("editor:project:update-settings sends PATCH with JSON body", async () => {
		mockRoute("PATCH", "/api/claude/project/proj1/settings", {
			success: true,
			data: { updated: true },
		});
		const result = await handleMediaProjectCommand(
			client,
			makeOpts({
				command: "editor:project:update-settings",
				projectId: "proj1",
				data: '{"fps":60}',
			}),
			noopProgress
		);
		expect(result.success).toBe(true);
	});

	it("editor:project:stats requires project-id", async () => {
		const result = await handleMediaProjectCommand(
			client,
			makeOpts({ command: "editor:project:stats" }),
			noopProgress
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("--project-id");
	});
});
