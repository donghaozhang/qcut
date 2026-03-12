import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { handleEditorCommand } from "../native-pipeline/cli/cli-handlers-editor.js";
import type { CLIRunOptions } from "../native-pipeline/cli/cli-runner.js";

const originalFetch = globalThis.fetch;

interface RouteResponse {
	status?: number;
	body: unknown;
}

type RouteHandler = () => Response | RouteResponse;
type RouteEntry = RouteResponse | RouteHandler;

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
						name: "editor.snapshot",
						version: "1.0.0",
						description: "Editor accessibility snapshot",
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
	interactive,
	depth,
	ref,
	text,
	json,
}: {
	command: string;
	interactive?: boolean;
	depth?: number;
	ref?: string;
	text?: string;
	json?: boolean;
}): CLIRunOptions {
	return {
		command,
		outputDir: "./output",
		json: json ?? false,
		verbose: false,
		quiet: false,
		saveIntermediates: false,
		host: "127.0.0.1",
		port: "19893",
		interactive,
		depth,
		ref,
		text,
	} as CLIRunOptions;
}

const noopProgress = () => {};

describe("editor snapshot CLI handlers", () => {
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

			if (typeof route === "function") {
				const result = route();
				if (result instanceof Response) {
					return result;
				}
				return new Response(JSON.stringify(result.body), {
					status: result.status ?? 200,
					headers: { "Content-Type": "application/json" },
				});
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

	afterEach(() => {
		clearMockState();
	});

	afterAll(() => {
		globalThis.fetch = originalFetch;
	});

	it("routes editor:snapshot flags to the snapshot endpoint", async () => {
		registerHealthyEditorRoutes();
		setRoute({
			method: "GET",
			path: "/api/claude/snapshot",
			entry: jsonEnvelope({
				data: {
					version: 1,
					timestamp: 123,
					interactiveOnly: true,
					maxDepth: 2,
					elements: [],
					summary: {
						total: 0,
						actionable: 0,
					},
				},
			}),
		});

		const result = await handleEditorCommand(
			makeOpts({
				command: "editor:snapshot",
				interactive: true,
				depth: 2,
				json: true,
			}),
			noopProgress
		);

		expect(result.success).toBe(true);
		const request = requestLog.find(
			(entry) =>
				entry.method === "GET" && entry.path === "/api/claude/snapshot"
		);
		expect(request?.query).toContain("interactive=true");
		expect(request?.query).toContain("depth=2");
	});

	it("routes editor:snapshot:click to the click endpoint", async () => {
		registerHealthyEditorRoutes();
		setRoute({
			method: "POST",
			path: "/api/claude/snapshot/click",
			entry: jsonEnvelope({
				data: {
					action: "click",
					ref: "@e1",
					tagName: "button",
					role: "button",
					name: "Export",
					value: null,
				},
			}),
		});

		const result = await handleEditorCommand(
			makeOpts({
				command: "editor:snapshot:click",
				ref: "@e1",
				json: true,
			}),
			noopProgress
		);

		expect(result.success).toBe(true);
		const request = requestLog.find(
			(entry) =>
				entry.method === "POST" &&
				entry.path === "/api/claude/snapshot/click"
		);
		expect(JSON.parse(request?.body ?? "{}")).toEqual({ ref: "@e1" });
	});

	it("routes editor:snapshot:fill to the fill endpoint", async () => {
		registerHealthyEditorRoutes();
		setRoute({
			method: "POST",
			path: "/api/claude/snapshot/fill",
			entry: jsonEnvelope({
				data: {
					action: "fill",
					ref: "@e2",
					tagName: "input",
					role: "textbox",
					name: "Project name",
					value: "Updated title",
				},
			}),
		});

		const result = await handleEditorCommand(
			makeOpts({
				command: "editor:snapshot:fill",
				ref: "@e2",
				text: "Updated title",
				json: true,
			}),
			noopProgress
		);

		expect(result.success).toBe(true);
		const request = requestLog.find(
			(entry) =>
				entry.method === "POST" &&
				entry.path === "/api/claude/snapshot/fill"
		);
		expect(JSON.parse(request?.body ?? "{}")).toEqual({
			ref: "@e2",
			value: "Updated title",
		});
	});

	it("requires ref for editor:snapshot:click", async () => {
		registerHealthyEditorRoutes();

		const result = await handleEditorCommand(
			makeOpts({
				command: "editor:snapshot:click",
				json: true,
			}),
			noopProgress
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("--ref");
	});
});
