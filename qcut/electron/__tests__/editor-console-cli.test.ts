import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { handleEditorCommand } from "../native-pipeline/cli/cli-handlers-editor.js";
import type { CLIRunOptions } from "../native-pipeline/cli/cli-runner.js";

const originalFetch = globalThis.fetch;

interface RouteResponse {
	status?: number;
	body: unknown;
}

type RouteEntry = RouteResponse;

const routes = new Map<string, RouteEntry>();
const requestLog: Array<{
	method: string;
	path: string;
	query: string;
	body: string | null;
}> = [];

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
						name: "debug.console",
						version: "1.0.0",
						description: "Console capture",
						since: "1.0.0",
						category: "debug",
					},
				],
			},
		}),
	});
}

function makeOpts({
	command,
	level,
	since,
	limit,
	clear,
}: {
	command: string;
	level?: string;
	since?: string;
	limit?: number;
	clear?: boolean;
}): CLIRunOptions {
	return {
		command,
		outputDir: "./output",
		json: false,
		verbose: false,
		quiet: false,
		saveIntermediates: false,
		host: "127.0.0.1",
		port: "19893",
		level,
		since,
		limit,
		clear,
	} as CLIRunOptions;
}

const noopProgress = () => {};

describe("editor console CLI handlers", () => {
	beforeAll(() => {
		globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = new URL(typeof input === "string" ? input : input.toString());
			const method = init?.method ?? "GET";
			const path = url.pathname;
			const query = url.search;
			const body = (init?.body as string) ?? null;

			requestLog.push({ method, path, query, body });

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

			return new Response(JSON.stringify(route.body), {
				status: route.status ?? 200,
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

	it("routes editor:console filters to the console endpoint", async () => {
		registerHealthyEditorRoutes();
		setRoute({
			method: "GET",
			path: "/api/claude/console",
			entry: jsonEnvelope({
				data: {
					messages: [{ level: "error", message: "Boom" }],
					count: 1,
				},
			}),
		});

		const result = await handleEditorCommand(
			makeOpts({
				command: "editor:console",
				level: "error",
				since: "30s",
				limit: 5,
			}),
			noopProgress
		);

		expect(result.success).toBe(true);
		const request = requestLog.find(
			(entry) => entry.method === "GET" && entry.path === "/api/claude/console"
		);
		expect(request?.query).toContain("level=error");
		expect(request?.query).toContain("since=30s");
		expect(request?.query).toContain("limit=5");
	});

	it("routes editor:errors to the errors endpoint", async () => {
		registerHealthyEditorRoutes();
		setRoute({
			method: "GET",
			path: "/api/claude/errors",
			entry: jsonEnvelope({
				data: {
					messages: [{ level: "error", message: "Renderer failed" }],
					count: 1,
				},
			}),
		});

		const result = await handleEditorCommand(
			makeOpts({ command: "editor:errors", since: "10s" }),
			noopProgress
		);

		expect(result.success).toBe(true);
		expect(
			requestLog.some(
				(entry) =>
					entry.method === "GET" && entry.path === "/api/claude/errors"
			)
		).toBe(true);
	});

	it("routes editor:console --clear to DELETE /api/claude/console", async () => {
		registerHealthyEditorRoutes();
		setRoute({
			method: "DELETE",
			path: "/api/claude/console",
			entry: jsonEnvelope({
				data: {
					clearedCount: 2,
				},
			}),
		});

		const result = await handleEditorCommand(
			makeOpts({ command: "editor:console", clear: true }),
			noopProgress
		);

		expect(result.success).toBe(true);
		expect(
			requestLog.some(
				(entry) =>
					entry.method === "DELETE" && entry.path === "/api/claude/console"
			)
		).toBe(true);
	});
});
