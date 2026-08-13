import type { FileHandle } from "node:fs/promises";
import { lstat, open, unlink } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const DEFAULT_LOCK_RETRY_MS = 50;
const DEFAULT_LOCK_STALE_MS = 30 * 60_000;
const DEFAULT_LOCK_TIMEOUT_MS = 20 * 60_000;

interface RenderCacheLock {
	device: string;
	handle: FileHandle;
	inode: string;
	lockPath: string;
}

interface RenderCacheLockOptions {
	retryMs?: number;
	staleMs?: number;
	timeoutMs?: number;
}

function nodeErrorCode({ error }: { error: unknown }) {
	return error && typeof error === "object" && "code" in error
		? String(error.code)
		: undefined;
}

async function discardStaleRenderCacheLock({
	lockPath,
	staleMs,
}: {
	lockPath: string;
	staleMs: number;
}) {
	try {
		const existing = await lstat(lockPath, { bigint: true });
		if (Date.now() - Number(existing.mtimeMs) < staleMs) return false;
		const current = await lstat(lockPath, { bigint: true });
		if (
			current.dev !== existing.dev ||
			current.ino !== existing.ino ||
			current.mtimeNs !== existing.mtimeNs ||
			Date.now() - Number(current.mtimeMs) < staleMs
		)
			return false;
		await unlink(lockPath);
		return true;
	} catch (error) {
		if (nodeErrorCode({ error }) === "ENOENT") return true;
		throw error;
	}
}

async function refreshRenderCacheLock({ lock }: { lock: RenderCacheLock }) {
	const refreshedAt = new Date();
	await lock.handle.utimes(refreshedAt, refreshedAt);
	const current = await lstat(lock.lockPath, { bigint: true });
	if (
		current.dev.toString() !== lock.device ||
		current.ino.toString() !== lock.inode
	) {
		throw new Error("Jianying text render cache lock ownership was lost");
	}
}

function startRenderCacheLockLease({
	lock,
	staleMs,
}: {
	lock: RenderCacheLock;
	staleMs: number;
}) {
	const refreshIntervalMs = Math.max(1, Math.floor(staleMs / 3));
	let refreshError: unknown;
	let refreshPromise: Promise<void> | undefined;
	const timer = setInterval(() => {
		if (refreshPromise) return;
		refreshPromise = refreshRenderCacheLock({ lock })
			.catch((cause: unknown) => {
				refreshError = cause;
				clearInterval(timer);
			})
			.finally(() => {
				refreshPromise = undefined;
			});
	}, refreshIntervalMs);
	timer.unref();
	return {
		getError: () => refreshError,
		stop: async () => {
			clearInterval(timer);
			await refreshPromise;
		},
	};
}

async function acquireRenderCacheLock({
	deadline,
	lockPath,
	retryMs,
	staleMs,
	throwIfCancelled,
}: {
	deadline: number;
	lockPath: string;
	retryMs: number;
	staleMs: number;
	throwIfCancelled: () => void;
}): Promise<RenderCacheLock> {
	throwIfCancelled();
	let handle: FileHandle;
	try {
		handle = await open(lockPath, "wx", 0o600);
	} catch (error) {
		if (nodeErrorCode({ error }) !== "EEXIST") throw error;
		if (await discardStaleRenderCacheLock({ lockPath, staleMs })) {
			return acquireRenderCacheLock({
				deadline,
				lockPath,
				retryMs,
				staleMs,
				throwIfCancelled,
			});
		}
		if (Date.now() >= deadline) {
			throw new Error(
				`Timed out acquiring Jianying text render cache lock: ${lockPath}`
			);
		}
		await delay(retryMs);
		return acquireRenderCacheLock({
			deadline,
			lockPath,
			retryMs,
			staleMs,
			throwIfCancelled,
		});
	}
	try {
		await handle.writeFile(
			JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })
		);
		await handle.sync();
		const identity = await handle.stat({ bigint: true });
		return {
			device: identity.dev.toString(),
			handle,
			inode: identity.ino.toString(),
			lockPath,
		};
	} catch (error) {
		await handle.close().catch(() => undefined);
		await unlink(lockPath).catch(() => undefined);
		throw error;
	}
}

async function releaseRenderCacheLock({ lock }: { lock: RenderCacheLock }) {
	await lock.handle.close();
	try {
		const current = await lstat(lock.lockPath, { bigint: true });
		if (
			current.dev.toString() !== lock.device ||
			current.ino.toString() !== lock.inode
		) {
			return;
		}
		await unlink(lock.lockPath);
	} catch (error) {
		if (nodeErrorCode({ error }) !== "ENOENT") throw error;
	}
}

export async function withJianyingTextRenderCacheLock<T>({
	cacheKey,
	cacheRoot,
	options = {},
	task,
	throwIfCancelled,
}: {
	cacheKey: string;
	cacheRoot: string;
	options?: RenderCacheLockOptions;
	task: () => Promise<T>;
	throwIfCancelled: () => void;
}) {
	const lockPath = path.join(cacheRoot, `${cacheKey}.lock`);
	const staleMs = options.staleMs ?? DEFAULT_LOCK_STALE_MS;
	const lock = await acquireRenderCacheLock({
		deadline: Date.now() + (options.timeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS),
		lockPath,
		retryMs: options.retryMs ?? DEFAULT_LOCK_RETRY_MS,
		staleMs,
		throwIfCancelled,
	});
	const lease = startRenderCacheLockLease({ lock, staleMs });
	try {
		throwIfCancelled();
		const result = await task();
		await lease.stop();
		const leaseError = lease.getError();
		if (leaseError) {
			const detail =
				leaseError instanceof Error ? `: ${leaseError.message}` : "";
			throw new Error(`Jianying text render cache lock lease failed${detail}`);
		}
		return result;
	} finally {
		await lease.stop();
		await releaseRenderCacheLock({ lock });
	}
}
