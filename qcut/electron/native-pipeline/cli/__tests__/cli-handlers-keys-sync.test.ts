import { describe, expect, it } from "vitest";
import type { CLIRunOptions } from "../cli-runner/types.js";
import { handleSyncKeys, pullCloudKeys } from "../cli-handlers-keys-sync.js";

function makeStore(initial: Record<string, string>) {
	const store = new Map(Object.entries(initial));
	return {
		store,
		readKey: (name: string) => store.get(name),
		writeKey: (name: string, value: string) => {
			store.set(name, value);
		},
	};
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function syncOptions(overrides: Partial<CLIRunOptions> = {}): CLIRunOptions {
	return { command: "sync-keys", ...overrides } as CLIRunOptions;
}

describe("pullCloudKeys", () => {
	it("adds missing keys and keeps existing local values", async () => {
		const { store, readKey, writeKey } = makeStore({
			QCUT_AUTH_TOKEN: "session-token",
			FAL_KEY: "local-fal",
		});
		const fetchFn = (async () =>
			jsonResponse({
				keys: { FAL_KEY: "cloud-fal", ELEVENLABS_API_KEY: "cloud-el" },
			})) as unknown as typeof fetch;

		const result = await pullCloudKeys(
			{ overwrite: false },
			{ fetchFn, readKey, writeKey }
		);

		expect(result.added).toEqual(["ELEVENLABS_API_KEY"]);
		expect(result.skipped).toEqual(["FAL_KEY"]);
		expect(store.get("FAL_KEY")).toBe("local-fal");
		expect(store.get("ELEVENLABS_API_KEY")).toBe("cloud-el");
	});

	it("overwrites differing local values when overwrite is set", async () => {
		const { store, readKey, writeKey } = makeStore({
			QCUT_AUTH_TOKEN: "session-token",
			FAL_KEY: "local-fal",
		});
		const fetchFn = (async () =>
			jsonResponse({
				keys: { FAL_KEY: "cloud-fal" },
			})) as unknown as typeof fetch;

		const result = await pullCloudKeys(
			{ overwrite: true },
			{ fetchFn, readKey, writeKey }
		);

		expect(result.overwritten).toEqual(["FAL_KEY"]);
		expect(store.get("FAL_KEY")).toBe("cloud-fal");
	});

	it("never writes the session token from the cloud payload", async () => {
		const { store, readKey, writeKey } = makeStore({
			QCUT_AUTH_TOKEN: "session-token",
		});
		const fetchFn = (async () =>
			jsonResponse({
				keys: { QCUT_AUTH_TOKEN: "evil-token" },
			})) as unknown as typeof fetch;

		const result = await pullCloudKeys(
			{ overwrite: true },
			{ fetchFn, readKey, writeKey }
		);

		expect(result.added).toEqual([]);
		expect(store.get("QCUT_AUTH_TOKEN")).toBe("session-token");
	});

	it("fails without a login token", async () => {
		const { readKey, writeKey } = makeStore({});
		await expect(
			pullCloudKeys({ overwrite: false }, { readKey, writeKey })
		).rejects.toThrow(/Not logged in/);
	});
});

describe("handleSyncKeys", () => {
	it("pushes only configured known keys, excluding the session token", async () => {
		const { readKey, writeKey } = makeStore({
			QCUT_AUTH_TOKEN: "session-token",
			FAL_KEY: "local-fal",
			ELEVENLABS_API_KEY: "local-el",
		});
		const requests: Array<{ url: string; body: unknown }> = [];
		const fetchFn = (async (url: string, init?: RequestInit) => {
			requests.push({ url, body: JSON.parse(String(init?.body)) });
			return jsonResponse({ saved: 2 });
		}) as unknown as typeof fetch;

		const result = await handleSyncKeys(syncOptions({ push: true }), {
			fetchFn,
			readKey,
			writeKey,
		});

		expect(result.success).toBe(true);
		expect(requests).toHaveLength(1);
		expect(requests[0].url).toContain("/api/keys");
		expect(requests[0].body).toEqual({
			keys: { FAL_KEY: "local-fal", ELEVENLABS_API_KEY: "local-el" },
		});
	});

	it("pulls by default and reports counts", async () => {
		const { readKey, writeKey } = makeStore({
			QCUT_AUTH_TOKEN: "session-token",
		});
		const fetchFn = (async () =>
			jsonResponse({
				keys: { FAL_KEY: "cloud-fal" },
			})) as unknown as typeof fetch;

		const result = await handleSyncKeys(syncOptions(), {
			fetchFn,
			readKey,
			writeKey,
		});

		expect(result.success).toBe(true);
		expect(result.data).toMatchObject({
			direction: "pull",
			added: ["FAL_KEY"],
		});
	});

	it("rejects --push together with --pull", async () => {
		const result = await handleSyncKeys(
			syncOptions({ push: true, pull: true })
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("either --push or --pull");
	});

	it("surfaces server errors as command failures", async () => {
		const { readKey, writeKey } = makeStore({
			QCUT_AUTH_TOKEN: "session-token",
		});
		const fetchFn = (async () =>
			jsonResponse({ error: "boom" }, 500)) as unknown as typeof fetch;

		const result = await handleSyncKeys(syncOptions(), {
			fetchFn,
			readKey,
			writeKey,
		});

		expect(result.success).toBe(false);
		expect(result.error).toBe("boom");
	});
});
