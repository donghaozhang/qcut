import type { Context, Next } from "hono";

/**
 * Simple in-memory sliding-window rate limiter.
 * Keyed by userId (set by authMiddleware). Limits requests per minute.
 *
 * Note: In a multi-instance deployment each worker has its own counter,
 * so the effective limit is per-worker. For Cloudflare Workers on a single
 * isolate this is fine; for horizontal scaling consider Durable Objects or KV.
 */

interface WindowEntry {
	timestamps: number[];
}

const windows = new Map<string, WindowEntry>();

const WINDOW_MS = 60_000; // 1 minute
const CLEANUP_INTERVAL_MS = 300_000; // 5 minutes

let lastCleanup = Date.now();

function getLimit(): number {
	const envLimit = Number(process.env.AI_PROXY_RATE_LIMIT);
	return Number.isFinite(envLimit) && envLimit > 0 ? envLimit : 60;
}

/** Removes stale entries to prevent unbounded memory growth. */
function cleanupIfNeeded(now: number): void {
	if (now - lastCleanup < CLEANUP_INTERVAL_MS) {
		return;
	}
	lastCleanup = now;
	const cutoff = now - WINDOW_MS;
	for (const [key, entry] of windows) {
		entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
		if (entry.timestamps.length === 0) {
			windows.delete(key);
		}
	}
}

export async function rateLimitMiddleware(c: Context, next: Next) {
	const userId = c.get("userId") as string | undefined;
	if (!userId) {
		// No user context — auth middleware should have rejected already
		return c.json({ error: "Unauthorized" }, 401);
	}

	const now = Date.now();
	const limit = getLimit();

	cleanupIfNeeded(now);

	const entry = windows.get(userId) ?? { timestamps: [] };
	const cutoff = now - WINDOW_MS;

	// Drop timestamps outside the current window
	entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

	if (entry.timestamps.length >= limit) {
		const oldestInWindow = entry.timestamps[0] ?? now;
		const retryAfterSeconds = Math.ceil(
			(oldestInWindow + WINDOW_MS - now) / 1000
		);
		c.header("Retry-After", String(retryAfterSeconds));
		return c.json(
			{
				error: "Too many requests",
				retryAfter: retryAfterSeconds,
			},
			429
		);
	}

	entry.timestamps.push(now);
	windows.set(userId, entry);

	await next();
}

/** Resets all rate-limit state. Useful for tests. */
export function resetRateLimitState(): void {
	windows.clear();
	lastCleanup = Date.now();
}
