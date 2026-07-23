import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { handleEditorCommand } from "../native-pipeline/cli/cli-handlers-editor.js";
import type { CLIRunOptions } from "../native-pipeline/cli/cli-runner.js";

const BASE_URL = "http://127.0.0.1:19892";
const originalFetch = globalThis.fetch;

interface RouteResponse {
	status?: number;
	body: unknown;
}

type RouteHandler = () => RouteResponse;
type RouteEntry = RouteResponse | RouteHandler;

const routes = new Map<string, RouteEntry>();
const requestLog: Array<{ method: string; path: string; body: string | null }> =
	[];

function setRoute({
	method,
	path,
	entry,
}: {
	method: string;
	path: string;
	entry: RouteEntry;
}): void {
	routes.set(`${method} ${path}`, entry);
}

function clearMockState(): void {
	routes.clear();
	requestLog.splice(0, requestLog.length);
}

function jsonEnvelope({
	data,
	success = true,
}: {
	data?: unknown;
	success?: boolean;
}): RouteResponse {
	return {
		status: 200,
		body: {
			success,
			data,
			timestamp: Date.now(),
		},
	};
}

function registerHealthyEditorRoutes(): void {
	setRoute({
		method: "GET",
		path: "/api/claude/health",
		entry: jsonEnvelope({ data: { status: "ok", version: "test" } }),
	});
	setRoute({
		method: "GET",
		path: "/api/claude/capabilities",
		entry: jsonEnvelope({
			data: {
				apiVersion: "1.0.0",
				protocolVersion: "1.0.0",
				capabilities: [
					{
						name: "media.screenRecording",
						version: "1.0.0",
						description: "Screen recording controls",
						since: "1.0.0",
						category: "media",
					},
				],
			},
		}),
	});
}

function makeStatus({ recording }: { recording: boolean }): RouteResponse {
	return jsonEnvelope({
		data: {
			state: recording ? "recording" : "idle",
			recording,
			sessionId: recording ? "s1" : null,
			sourceId: null,
			sourceName: null,
			filePath: null,
			bytesWritten: 0,
			startedAt: null,
			durationMs: 0,
			mimeType: null,
		},
	});
}

function makeOpts({
	command,
	discard,
}: {
	command: string;
	discard?: boolean;
}): CLIRunOptions {
	return {
		command,
		outputDir: "./output",
		json: false,
		verbose: false,
		quiet: false,
		saveIntermediates: false,
		host: "127.0.0.1",
		port: "19892",
		discard,
	} as CLIRunOptions;
}

const noopProgress = () => {};

describe("editor screen-recording CLI handlers", () => {
	beforeAll(() => {
		globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = typeof input === "string" ? input : input.toString();
			const method = init?.method ?? "GET";
			const path = url.replace(BASE_URL, "").split("?")[0];
			const body = (init?.body as string) ?? null;

			requestLog.push({ method, path, body });

			const route = routes.get(`${method} ${path}`);
			if (!route) {
				return new Response(
					JSON.stringify({
						success: false,
						error: `Not found: ${method} ${path}`,
					}),
					{
						status: 404,
						headers: { "Content-Type": "application/json" },
					}
				);
			}

			const resolved = typeof route === "function" ? route() : route;
			return new Response(JSON.stringify(resolved.body), {
				status: resolved.status ?? 200,
				headers: { "Content-Type": "application/json" },
			});
		};
	});

	beforeEach(() => {
		clearMockState();
	});

	afterAll(() => {
		globalThis.fetch = originalFetch;
	});

	it("routes editor:screen-recording:force-stop to the force-stop endpoint", async () => {
		registerHealthyEditorRoutes();
		setRoute({
			method: "POST",
			path: "/api/claude/screen-recording/force-stop",
			entry: jsonEnvelope({
				data: {
					success: true,
					wasRecording: true,
					discarded: false,
				},
			}),
		});

		const result = await handleEditorCommand(
			makeOpts({ command: "editor:screen-recording:force-stop" }),
			noopProgress
		);

		expect(result.success).toBe(true);
		expect(
			requestLog.some(
				(entry) =>
					entry.method === "POST" &&
					entry.path === "/api/claude/screen-recording/force-stop"
			)
		).toBe(true);
	});

	it("returns recording permission diagnostics", async () => {
		registerHealthyEditorRoutes();
		setRoute({
			method: "GET",
			path: "/api/claude/screen-recording/diagnose",
			entry: jsonEnvelope({
				data: {
					ready: false,
					permission: "denied",
					remediation: ["Enable QCut in System Settings"],
				},
			}),
		});

		const result = await handleEditorCommand(
			makeOpts({ command: "editor:screen-recording:diagnose" }),
			noopProgress
		);

		expect(result.success).toBe(true);
		expect(result.data).toEqual(
			expect.objectContaining({ permission: "denied" })
		);
	});

	it("attaches diagnostics and a screenshot when source listing fails", async () => {
		registerHealthyEditorRoutes();
		setRoute({
			method: "GET",
			path: "/api/claude/screen-recording/sources",
			entry: { status: 500, body: { success: false, error: "TCC denied" } },
		});
		setRoute({
			method: "GET",
			path: "/api/claude/screen-recording/diagnose",
			entry: jsonEnvelope({ data: { ready: false, permission: "denied" } }),
		});
		setRoute({
			method: "POST",
			path: "/api/claude/screenshot/capture",
			entry: jsonEnvelope({ data: { filePath: "/tmp/failure.png" } }),
		});

		const result = await handleEditorCommand(
			makeOpts({ command: "editor:screen-recording:sources" }),
			noopProgress
		);

		expect(result.success).toBe(false);
		expect(result.data).toEqual({
			diagnostics: expect.objectContaining({ permission: "denied" }),
			screenshot: expect.objectContaining({ filePath: "/tmp/failure.png" }),
		});
	});

	it("stops recording without recovery when status is idle", async () => {
		registerHealthyEditorRoutes();
		setRoute({
			method: "POST",
			path: "/api/claude/screen-recording/stop",
			entry: jsonEnvelope({
				data: {
					success: true,
					filePath: "/tmp/recording.mp4",
					bytesWritten: 1024,
					durationMs: 1000,
					discarded: false,
				},
			}),
		});
		setRoute({
			method: "GET",
			path: "/api/claude/screen-recording/status",
			entry: makeStatus({ recording: false }),
		});

		const result = await handleEditorCommand(
			makeOpts({ command: "editor:screen-recording:stop" }),
			noopProgress
		);

		expect(result.success).toBe(true);
		expect(
			requestLog.some(
				(entry) =>
					entry.method === "POST" &&
					entry.path === "/api/claude/screen-recording/force-stop"
			)
		).toBe(false);
	});

	it("recovers with force-stop when recording remains active after stop", async () => {
		registerHealthyEditorRoutes();

		let statusChecks = 0;
		setRoute({
			method: "POST",
			path: "/api/claude/screen-recording/stop",
			entry: jsonEnvelope({
				data: {
					success: true,
					filePath: null,
					bytesWritten: 0,
					durationMs: 0,
					discarded: true,
				},
			}),
		});
		setRoute({
			method: "GET",
			path: "/api/claude/screen-recording/status",
			entry: () => {
				statusChecks += 1;
				return statusChecks <= 3
					? makeStatus({ recording: true })
					: makeStatus({ recording: false });
			},
		});
		setRoute({
			method: "POST",
			path: "/api/claude/screen-recording/force-stop",
			entry: jsonEnvelope({
				data: {
					success: true,
					wasRecording: true,
					filePath: "/tmp/recording.mp4",
					bytesWritten: 500,
					durationMs: 1000,
					discarded: false,
				},
			}),
		});

		const result = await handleEditorCommand(
			makeOpts({ command: "editor:screen-recording:stop" }),
			noopProgress
		);

		expect(result.success).toBe(true);
		expect(
			requestLog.some(
				(entry) =>
					entry.method === "POST" &&
					entry.path === "/api/claude/screen-recording/force-stop"
			)
		).toBe(true);
		expect(result.data).toEqual(
			expect.objectContaining({
				recoveredViaForceStop: true,
			})
		);
	});

	it("fails when force-stop recovery cannot clear active recording", async () => {
		registerHealthyEditorRoutes();
		setRoute({
			method: "POST",
			path: "/api/claude/screen-recording/stop",
			entry: jsonEnvelope({
				data: {
					success: true,
					filePath: null,
					bytesWritten: 0,
					durationMs: 0,
					discarded: true,
				},
			}),
		});
		setRoute({
			method: "GET",
			path: "/api/claude/screen-recording/status",
			entry: () => makeStatus({ recording: true }),
		});
		setRoute({
			method: "POST",
			path: "/api/claude/screen-recording/force-stop",
			entry: jsonEnvelope({
				data: {
					success: true,
					wasRecording: true,
					discarded: false,
				},
			}),
		});

		const result = await handleEditorCommand(
			makeOpts({ command: "editor:screen-recording:stop" }),
			noopProgress
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("still active after force-stop recovery");
	});
});
