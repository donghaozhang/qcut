// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createPortraitTrackingScopePool } from "../jianying-portrait-adjustment-runtime/tracking-scope-pool.js";

function session() {
	return { process: { dispose: vi.fn(async () => undefined) } };
}

describe("Jianying portrait tracking scope pool", () => {
	it("keeps native trackers isolated when preview sources interleave", async () => {
		const pool = createPortraitTrackingScopePool<ReturnType<typeof session>>({
			limit: 2,
		});
		const foreground = await pool.acquire({ scopeKey: "foreground" });
		const foregroundSession = session();
		foreground.sessions.set("face", foregroundSession);
		foreground.lastTimestampSeconds = 0;

		const preload = await pool.acquire({ scopeKey: "preload" });
		preload.sessions.set("face", session());
		const foregroundAgain = await pool.acquire({ scopeKey: "foreground" });

		expect(foregroundAgain).toBe(foreground);
		expect(foregroundAgain.sessions.get("face")).toBe(foregroundSession);
		expect(foregroundSession.process.dispose).not.toHaveBeenCalled();
		await pool.clear();
	});

	it("disposes the least recently used scope at the bound", async () => {
		const pool = createPortraitTrackingScopePool<ReturnType<typeof session>>({
			limit: 2,
		});
		const first = await pool.acquire({ scopeKey: "first" });
		const firstSession = session();
		first.sessions.set("face", firstSession);
		await pool.acquire({ scopeKey: "second" });
		await pool.acquire({ scopeKey: "third" });

		expect(firstSession.process.dispose).toHaveBeenCalledOnce();
		const firstAgain = await pool.acquire({ scopeKey: "first" });
		expect(firstAgain).not.toBe(first);
		await pool.clear();
	});

	it("retires only the requested discontinuous source", async () => {
		const pool = createPortraitTrackingScopePool<ReturnType<typeof session>>({
			limit: 2,
		});
		const first = await pool.acquire({ scopeKey: "first" });
		const second = await pool.acquire({ scopeKey: "second" });
		const firstSession = session();
		const secondSession = session();
		first.sessions.set("face", firstSession);
		second.sessions.set("face", secondSession);

		await pool.retire({ scopeKey: "first" });

		expect(firstSession.process.dispose).toHaveBeenCalledOnce();
		expect(secondSession.process.dispose).not.toHaveBeenCalled();
		expect(await pool.acquire({ scopeKey: "second" })).toBe(second);
		await pool.clear();
	});
});
