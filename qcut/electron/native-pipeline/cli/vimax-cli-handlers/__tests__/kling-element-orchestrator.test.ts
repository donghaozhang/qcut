import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	ensureKlingElements,
	readElementCache,
	writeElementCache,
	type KlingElementCache,
} from "../kling-element-orchestrator.js";

function makeTmpDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "kling-orch-"));
}

describe("readElementCache / writeElementCache", () => {
	it("returns empty object when file does not exist", () => {
		const tmp = makeTmpDir();
		try {
			expect(readElementCache(path.join(tmp, "missing.json"))).toEqual({});
		} finally {
			fs.rmSync(tmp, { recursive: true, force: true });
		}
	});

	it("round-trips a cache via write + read", () => {
		const tmp = makeTmpDir();
		const cachePath = path.join(tmp, "videos", "kling-elements.json");
		try {
			const cache: KlingElementCache = {
				Alice: {
					element_id: "123",
					portrait_url: "https://cdn/a.png",
					created_at: "2026-04-16T00:00:00Z",
				},
			};
			writeElementCache(cachePath, cache);
			expect(fs.existsSync(cachePath)).toBe(true);
			expect(readElementCache(cachePath)).toEqual(cache);
		} finally {
			fs.rmSync(tmp, { recursive: true, force: true });
		}
	});

	it("returns empty object when the cache file is not valid JSON", () => {
		const tmp = makeTmpDir();
		const cachePath = path.join(tmp, "bad.json");
		try {
			fs.writeFileSync(cachePath, "{ not json ");
			expect(readElementCache(cachePath)).toEqual({});
		} finally {
			fs.rmSync(tmp, { recursive: true, force: true });
		}
	});
});

describe("ensureKlingElements", () => {
	let tmp: string;
	let cachePath: string;

	beforeEach(() => {
		tmp = makeTmpDir();
		cachePath = path.join(tmp, "videos", "kling-elements.json");
	});

	afterEach(() => {
		fs.rmSync(tmp, { recursive: true, force: true });
	});

	it("creates elements for every portrait on a cold start", async () => {
		const calls: Array<{ name: string; url: string }> = [];
		const result = await ensureKlingElements({
			portraitUrls: {
				Alice: "https://cdn/a.png",
				Bob: "https://cdn/b.png",
			},
			cachePath,
			createElementImpl: async ({ name, frontalImageUrl }) => {
				calls.push({ name, url: frontalImageUrl });
				return { success: true, elementId: `elm-${name}` };
			},
		});
		expect(result.elementIds).toEqual({ Alice: "elm-Alice", Bob: "elm-Bob" });
		expect(result.created).toEqual(["Alice", "Bob"]);
		expect(result.cached).toEqual([]);
		expect(Object.keys(result.failed)).toHaveLength(0);
		expect(calls).toHaveLength(2);
		// Cache persisted for reuse
		const cache = readElementCache(cachePath);
		expect(cache.Alice.element_id).toBe("elm-Alice");
		expect(cache.Bob.portrait_url).toBe("https://cdn/b.png");
	});

	it("reuses cached entries whose portrait_url still matches", async () => {
		writeElementCache(cachePath, {
			Alice: {
				element_id: "cached-Alice",
				portrait_url: "https://cdn/a.png",
				created_at: "2026-04-15T00:00:00Z",
			},
		});
		let createCalls = 0;
		const result = await ensureKlingElements({
			portraitUrls: { Alice: "https://cdn/a.png" },
			cachePath,
			createElementImpl: async ({ name }) => {
				createCalls++;
				return { success: true, elementId: `new-${name}` };
			},
		});
		expect(result.elementIds.Alice).toBe("cached-Alice");
		expect(result.cached).toEqual(["Alice"]);
		expect(result.created).toEqual([]);
		expect(createCalls).toBe(0);
	});

	it("re-creates when the cached portrait_url drifted (portrait regenerated)", async () => {
		writeElementCache(cachePath, {
			Alice: {
				element_id: "stale-id",
				portrait_url: "https://cdn/old.png",
				created_at: "2026-04-15T00:00:00Z",
			},
		});
		const result = await ensureKlingElements({
			portraitUrls: { Alice: "https://cdn/new.png" },
			cachePath,
			createElementImpl: async ({ name }) => ({
				success: true,
				elementId: `fresh-${name}`,
			}),
		});
		expect(result.elementIds.Alice).toBe("fresh-Alice");
		expect(result.created).toEqual(["Alice"]);
		expect(result.cached).toEqual([]);
		const cache = readElementCache(cachePath);
		expect(cache.Alice.element_id).toBe("fresh-Alice");
		expect(cache.Alice.portrait_url).toBe("https://cdn/new.png");
	});

	it("records failures without aborting the remaining portraits", async () => {
		const result = await ensureKlingElements({
			portraitUrls: {
				Alice: "https://cdn/a.png",
				Bob: "https://cdn/b.png",
			},
			cachePath,
			createElementImpl: async ({ name }) => {
				if (name === "Alice") {
					return { success: false, error: "rate-limited" };
				}
				return { success: true, elementId: `ok-${name}` };
			},
		});
		expect(result.elementIds).toEqual({ Bob: "ok-Bob" });
		expect(result.failed).toEqual({ Alice: "rate-limited" });
		expect(result.created).toEqual(["Bob"]);
	});

	it("mixes cached and new portraits in a single call (incremental)", async () => {
		writeElementCache(cachePath, {
			Alice: {
				element_id: "cached-Alice",
				portrait_url: "https://cdn/a.png",
				created_at: "2026-04-15T00:00:00Z",
			},
		});
		const createdFor: string[] = [];
		const result = await ensureKlingElements({
			portraitUrls: {
				Alice: "https://cdn/a.png",
				Bob: "https://cdn/b.png",
			},
			cachePath,
			createElementImpl: async ({ name }) => {
				createdFor.push(name);
				return { success: true, elementId: `new-${name}` };
			},
		});
		expect(result.elementIds).toEqual({
			Alice: "cached-Alice",
			Bob: "new-Bob",
		});
		expect(result.cached).toEqual(["Alice"]);
		expect(result.created).toEqual(["Bob"]);
		expect(createdFor).toEqual(["Bob"]);
	});

	it("runs element creation in parallel up to the concurrency limit", async () => {
		// Each mock create takes ~50ms. With concurrency=3 and 3 portraits,
		// total wall-clock should be ~50ms (all in flight at once), not
		// ~150ms (serial). We assert on inFlight peak instead of a timing
		// race so the test is robust under load.
		let inFlight = 0;
		let peak = 0;
		const result = await ensureKlingElements({
			portraitUrls: {
				Alice: "https://cdn/a.png",
				Bob: "https://cdn/b.png",
				Chris: "https://cdn/c.png",
			},
			cachePath,
			concurrency: 3,
			createElementImpl: async ({ name }) => {
				inFlight++;
				peak = Math.max(peak, inFlight);
				await new Promise((r) => setTimeout(r, 10));
				inFlight--;
				return { success: true, elementId: `elm-${name}` };
			},
		});
		expect(result.created.sort()).toEqual(["Alice", "Bob", "Chris"]);
		expect(peak).toBe(3); // all three in flight at the same time
	});

	it("respects a concurrency limit below the portrait count", async () => {
		let inFlight = 0;
		let peak = 0;
		await ensureKlingElements({
			portraitUrls: {
				Alice: "https://cdn/a.png",
				Bob: "https://cdn/b.png",
				Chris: "https://cdn/c.png",
				Dana: "https://cdn/d.png",
			},
			cachePath,
			concurrency: 2,
			createElementImpl: async ({ name }) => {
				inFlight++;
				peak = Math.max(peak, inFlight);
				await new Promise((r) => setTimeout(r, 10));
				inFlight--;
				return { success: true, elementId: `elm-${name}` };
			},
		});
		expect(peak).toBe(2); // never more than 2 in flight
	});

	it("fires onProgress for each portrait with the correct status", async () => {
		writeElementCache(cachePath, {
			Alice: {
				element_id: "cached-Alice",
				portrait_url: "https://cdn/a.png",
				created_at: "2026-04-15T00:00:00Z",
			},
		});
		const events: Array<{ name: string; status: string }> = [];
		await ensureKlingElements({
			portraitUrls: {
				Alice: "https://cdn/a.png",
				Bob: "https://cdn/b.png",
			},
			cachePath,
			createElementImpl: async ({ name }) => ({
				success: true,
				elementId: `new-${name}`,
			}),
			onProgress: (e) => events.push({ name: e.name, status: e.status }),
		});
		// Cached hit fires "cached"; new entries fire "creating" then "created".
		expect(events).toEqual([
			{ name: "Alice", status: "cached" },
			{ name: "Bob", status: "creating" },
			{ name: "Bob", status: "created" },
		]);
	});
});
