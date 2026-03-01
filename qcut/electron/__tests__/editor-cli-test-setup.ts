import type { CLIRunOptions } from "../native-pipeline/cli/cli-runner.js";

// ---------------------------------------------------------------------------
// Mock HTTP server
// ---------------------------------------------------------------------------

const routes = new Map<
	string,
	{ status: number; body: unknown; capturedBody?: string }
>();
export let lastCapturedUrl = "";
export let lastCapturedBody: string | null = null;
export let lastCapturedMethod = "";

export function mockRoute(
	method: string,
	path: string,
	body: unknown,
	status = 200
) {
	routes.set(`${method} ${path}`, { status, body });
}

export function clearRoutes() {
	routes.clear();
	lastCapturedUrl = "";
	lastCapturedBody = null;
	lastCapturedMethod = "";
}

export const originalFetch = globalThis.fetch;
export const BASE_URL = "http://127.0.0.1:19880";

export function installFetchMock(baseUrl: string) {
	globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === "string" ? input : input.toString();
		const method = init?.method ?? "GET";
		const pathname = url.replace(baseUrl, "").split("?")[0];
		const key = `${method} ${pathname}`;

		lastCapturedUrl = url;
		lastCapturedBody = (init?.body as string) ?? null;
		lastCapturedMethod = method;

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

export function makeOpts(overrides: Partial<CLIRunOptions>): CLIRunOptions {
	return {
		command: "editor:health",
		outputDir: "./output",
		json: false,
		verbose: false,
		quiet: false,
		saveIntermediates: false,
		host: "127.0.0.1",
		port: "19880",
		...overrides,
	} as CLIRunOptions;
}

export const noopProgress = () => {};
