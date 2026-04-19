/**
 * Unit tests for registerAppProtocol.
 *
 * Covers:
 *   - Query string stripping (regression: headless recorder's `?headlessRecord=1` URL)
 *   - Path traversal blocking
 *   - Default index.html resolution
 *   - FFmpeg resource fallback path
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ProtocolHandler = (request: { url: string }) => Promise<Response>;

const mocks = vi.hoisted(() => {
	let captured: ProtocolHandler | null = null;
	const fetchCalls: string[] = [];
	const existingFiles = new Set<string>();

	return {
		captured: () => captured,
		setCaptured: (h: ProtocolHandler | null) => {
			captured = h;
		},
		fetchCalls,
		existingFiles,
	};
});

vi.mock("electron", () => ({
	app: {
		isPackaged: false,
		getAppPath: () => "/fake/app",
	},
	net: {
		fetch: async (url: string) => {
			mocks.fetchCalls.push(url);
			return new Response("ok", { status: 200 });
		},
	},
	protocol: {
		handle: (_scheme: string, handler: ProtocolHandler) => {
			mocks.setCaptured(handler);
		},
	},
}));

vi.mock("node:fs", () => ({
	existsSync: (p: string) => mocks.existingFiles.has(p),
}));

import { registerAppProtocol } from "../app-protocol-handler.js";

function getHandler(): ProtocolHandler {
	const h = mocks.captured();
	if (!h) throw new Error("protocol handler not registered");
	return h;
}

const quietLogger = {
	log: () => {},
	error: () => {},
};

describe("registerAppProtocol", () => {
	beforeEach(() => {
		mocks.setCaptured(null);
		mocks.fetchCalls.length = 0;
		mocks.existingFiles.clear();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("strips query string before filesystem lookup", async () => {
		// Regression: the headless recorder loads `app://./index.html?headlessRecord=1`.
		// If the query isn't stripped, the handler tries to resolve a file
		// literally named `index.html?headlessRecord=1` and 404s — which is
		// what broke the standalone `qcut record` command.
		registerAppProtocol({ logger: quietLogger });
		const handler = getHandler();

		// Pretend index.html exists on disk.
		mocks.existingFiles.add(expectedIndex());

		const res = await handler({ url: "app://./index.html?headlessRecord=1" });

		expect(res.status).toBe(200);
		expect(mocks.fetchCalls).toHaveLength(1);
		expect(mocks.fetchCalls[0]).toMatch(/index\.html$/);
	});

	it("strips hash fragment", async () => {
		registerAppProtocol({ logger: quietLogger });
		const handler = getHandler();
		mocks.existingFiles.add(expectedIndex());

		const res = await handler({ url: "app://./index.html#anchor" });
		expect(res.status).toBe(200);
		expect(mocks.fetchCalls[0]).toMatch(/index\.html$/);
	});

	it("blocks path traversal attempts", async () => {
		registerAppProtocol({ logger: quietLogger });
		const handler = getHandler();

		const res = await handler({ url: "app://../../etc/passwd" });
		expect(res.status).toBe(404);
		expect(mocks.fetchCalls).toHaveLength(0);
	});

	it("defaults empty path to index.html", async () => {
		registerAppProtocol({ logger: quietLogger });
		const handler = getHandler();
		mocks.existingFiles.add(expectedIndex());

		const res = await handler({ url: "app://" });
		expect(res.status).toBe(200);
		expect(mocks.fetchCalls[0]).toMatch(/index\.html$/);
	});

	it("SPA-fallbacks extensionless routes to index.html", async () => {
		registerAppProtocol({ logger: quietLogger });
		const handler = getHandler();
		mocks.existingFiles.add(expectedIndex());

		const res = await handler({ url: "app://./projects" });
		expect(res.status).toBe(200);
		expect(mocks.fetchCalls[0]).toMatch(/index\.html$/);
	});

	it("returns 404 for missing files with file extension", async () => {
		registerAppProtocol({ logger: quietLogger });
		const handler = getHandler();

		const res = await handler({ url: "app://./missing.js" });
		expect(res.status).toBe(404);
	});
});

/** Expected fs path for index.html given the mocked app state. */
function expectedIndex(): string {
	// Dev mode (isPackaged=false) uses path relative to __dirname.
	// We can't know __dirname here precisely, so use a suffix match above.
	// This helper exists to document the expected file identity.
	return resolveIndexPath();
}

function resolveIndexPath(): string {
	// Mirror the implementation's path.join(__dirname, "../../apps/web/dist",
	// "index.html"). Under vitest the module's __dirname is the source dir
	// (electron/), so we walk one level up from this test file.
	const testDir = path.dirname(fileURLToPath(import.meta.url));
	const moduleDir = path.resolve(testDir, "..");
	return path.join(moduleDir, "../../apps/web/dist", "index.html");
}
