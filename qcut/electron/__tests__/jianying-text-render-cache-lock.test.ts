import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	utimes,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import { withJianyingTextRenderCacheLock } from "../jianying-text-runtime/render-cache-lock.js";

const temporaryDirectories: string[] = [];
const cacheKey = "a".repeat(64);

async function createCacheRoot() {
	const cacheRoot = await mkdtemp(
		path.join(os.tmpdir(), "qcut-jianying-render-lock-")
	);
	temporaryDirectories.push(cacheRoot);
	return cacheRoot;
}

function runLocked<T>({
	cacheRoot,
	options,
	task,
	throwIfCancelled = () => undefined,
}: {
	cacheRoot: string;
	options?: { retryMs?: number; staleMs?: number; timeoutMs?: number };
	task: () => Promise<T>;
	throwIfCancelled?: () => void;
}) {
	return withJianyingTextRenderCacheLock({
		cacheKey,
		cacheRoot,
		options: {
			retryMs: 5,
			staleMs: 1_000,
			timeoutMs: 1_000,
			...options,
		},
		task,
		throwIfCancelled,
	});
}

describe("Jianying text render cache lock", () => {
	afterEach(async () => {
		await Promise.all(
			temporaryDirectories
				.splice(0)
				.map((directory) => rm(directory, { recursive: true, force: true }))
		);
	});

	it("serializes writers sharing one cache key", async () => {
		const cacheRoot = await createCacheRoot();
		const events: string[] = [];
		let releaseFirst: (() => void) | undefined;
		const firstMayFinish = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		const first = runLocked({
			cacheRoot,
			task: async () => {
				events.push("first:start");
				await firstMayFinish;
				events.push("first:end");
			},
		});
		await delay(20);
		const second = runLocked({
			cacheRoot,
			task: async () => {
				events.push("second:start");
			},
		});
		await delay(20);
		expect(events).toEqual(["first:start"]);
		releaseFirst?.();
		await Promise.all([first, second]);
		expect(events).toEqual(["first:start", "first:end", "second:start"]);
	});

	it("stops a cancelled waiter before it enters the critical section", async () => {
		const cacheRoot = await createCacheRoot();
		let releaseFirst: (() => void) | undefined;
		const firstMayFinish = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		const first = runLocked({ cacheRoot, task: () => firstMayFinish });
		await delay(20);
		let cancelled = false;
		const waiting = runLocked({
			cacheRoot,
			task: async () => {
				throw new Error("cancelled task entered critical section");
			},
			throwIfCancelled: () => {
				if (cancelled) throw new Error("render cancelled");
			},
		});
		await delay(20);
		cancelled = true;
		await expect(waiting).rejects.toThrow("render cancelled");
		releaseFirst?.();
		await first;
	});

	it("recovers a stale lock left by a crashed renderer", async () => {
		const cacheRoot = await createCacheRoot();
		const lockPath = path.join(cacheRoot, `${cacheKey}.lock`);
		await mkdir(cacheRoot, { recursive: true });
		await writeFile(lockPath, JSON.stringify({ pid: 0 }), "utf8");
		const stale = new Date(Date.now() - 10_000);
		await utimes(lockPath, stale, stale);

		await expect(
			runLocked({ cacheRoot, task: async () => "rendered" })
		).resolves.toBe("rendered");
		await expect(readFile(lockPath, "utf8")).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	it("honors the deadline while discarding stale locks", async () => {
		const cacheRoot = await createCacheRoot();
		const lockPath = path.join(cacheRoot, `${cacheKey}.lock`);
		await writeFile(lockPath, JSON.stringify({ pid: 0 }), "utf8");
		const stale = new Date(Date.now() - 10_000);
		await utimes(lockPath, stale, stale);

		await expect(
			runLocked({
				cacheRoot,
				options: { timeoutMs: 0 },
				task: async () => "rendered",
			})
		).rejects.toThrow("Timed out acquiring Jianying text render cache lock");
	});

	it("renews a live lock while rendering exceeds the stale threshold", async () => {
		const cacheRoot = await createCacheRoot();
		const events: string[] = [];
		let releaseFirst: (() => void) | undefined;
		const firstMayFinish = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		const options = { retryMs: 5, staleMs: 80, timeoutMs: 1_000 };
		const first = runLocked({
			cacheRoot,
			options,
			task: async () => {
				events.push("first:start");
				await firstMayFinish;
				events.push("first:end");
			},
		});
		await delay(240);
		const second = runLocked({
			cacheRoot,
			options,
			task: async () => {
				events.push("second:start");
			},
		});
		await delay(40);
		expect(events).toEqual(["first:start"]);
		releaseFirst?.();
		await Promise.all([first, second]);
		expect(events).toEqual(["first:start", "first:end", "second:start"]);
	});

	it("releases the lock when rendering fails", async () => {
		const cacheRoot = await createCacheRoot();
		await expect(
			runLocked({
				cacheRoot,
				task: async () => {
					throw new Error("render failed");
				},
			})
		).rejects.toThrow("render failed");
		await expect(
			runLocked({ cacheRoot, task: async () => "retry succeeded" })
		).resolves.toBe("retry succeeded");
	});
});
