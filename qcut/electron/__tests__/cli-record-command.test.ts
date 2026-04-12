/**
 * Unit tests for `qcut record` handler.
 *
 * Covers the orchestration layer (launch → start → wait → stop → cleanup)
 * with spawn and fetch injected so no real Electron/HTTP is needed.
 */

import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { handleRecord } from "../native-pipeline/cli/cli-handlers-record.js";
import type { CLIRunOptions } from "../native-pipeline/cli/cli-runner.js";

class FakeChild extends EventEmitter {
	killed = false;
	stdout = new EventEmitter() as unknown as ChildProcess["stdout"];
	stderr = new EventEmitter() as unknown as ChildProcess["stderr"];
	kill(_signal?: NodeJS.Signals | number): boolean {
		this.killed = true;
		return true;
	}
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

interface RouteMap {
	[urlPath: string]: (body: Record<string, unknown>) => Response;
}

function makeFetchRouter(routes: RouteMap): {
	fetch: typeof fetch;
	calls: Array<{ url: string; body: Record<string, unknown> }>;
} {
	const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
	const fetchImpl = (async (
		url: string | URL | Request,
		init?: RequestInit
	) => {
		const urlStr = typeof url === "string" ? url : url.toString();
		const path = new URL(urlStr).pathname;
		let body: Record<string, unknown> = {};
		if (init?.body && typeof init.body === "string") {
			try {
				body = JSON.parse(init.body);
			} catch {
				body = {};
			}
		}
		calls.push({ url: urlStr, body });
		const handler = routes[path];
		if (!handler) return new Response("not found", { status: 404 });
		return handler(body);
	}) as unknown as typeof fetch;
	return { fetch: fetchImpl, calls };
}

function makeBaseOptions(overrides: Partial<CLIRunOptions> = {}): CLIRunOptions {
	return {
		command: "record",
		outputDir: "./output",
		saveIntermediates: false,
		json: false,
		verbose: false,
		quiet: false,
		...overrides,
	} as CLIRunOptions;
}

describe("handleRecord", () => {
	it("orchestrates spawn → start → stop → teardown on happy path", async () => {
		const child = new FakeChild();
		const port = 9999;
		const { fetch: fetchImpl, calls } = makeFetchRouter({
			"/api/claude/screen-recording/start": () =>
				jsonResponse({
					sessionId: "sr-123",
					filePath: "/tmp/recording.mp4",
					sourceId: "screen:0:0",
					sourceName: "Screen",
					mimeType: "video/mp4",
				}),
			"/api/claude/screen-recording/stop": () =>
				jsonResponse({
					success: true,
					filePath: "/tmp/recording.mp4",
					bytesWritten: 1024,
					durationMs: 50,
					discarded: false,
				}),
		});

		const options = makeBaseOptions({
			recordDuration: 0.05, // 50ms — keeps the unit test fast
			sourceId: "screen:0:0",
			output: "recording.mp4",
		});

		const progressEvents: Array<{ stage?: string; message?: string }> = [];
		const ac = new AbortController();

		const result = await handleRecord(
			options,
			(e) => progressEvents.push(e),
			ac.signal,
			{
				fetchImpl,
				launchImpl: async () => ({
					child: child as unknown as ChildProcess,
					port,
				}),
			}
		);

		expect(result.success).toBe(true);
		expect(result.outputPath).toBe("/tmp/recording.mp4");
		expect(child.killed).toBe(true);

		// Verify endpoints called in order
		expect(calls.map((c) => new URL(c.url).pathname)).toEqual([
			"/api/claude/screen-recording/start",
			"/api/claude/screen-recording/stop",
		]);
		expect(calls[0].body).toMatchObject({
			sourceId: "screen:0:0",
			fileName: "recording.mp4",
		});

		// Progress stages observed
		expect(progressEvents.some((e) => e.stage === "launching")).toBe(true);
		expect(progressEvents.some((e) => e.stage === "recording")).toBe(true);
		expect(progressEvents.some((e) => e.stage === "stopping")).toBe(true);
		expect(progressEvents.some((e) => e.stage === "complete")).toBe(true);
	});

	it("returns success=false and calls force-stop when start fails", async () => {
		const child = new FakeChild();
		const { fetch: fetchImpl, calls } = makeFetchRouter({
			"/api/claude/screen-recording/start": () =>
				jsonResponse({ error: "desktopCapturer unavailable" }, 500),
			"/api/claude/screen-recording/force-stop": () =>
				jsonResponse({ success: true, filePath: null }),
		});

		const result = await handleRecord(
			makeBaseOptions({ recordDuration: 1 }),
			() => undefined,
			new AbortController().signal,
			{
				fetchImpl,
				launchImpl: async () => ({
					child: child as unknown as ChildProcess,
					port: 9999,
				}),
			}
		);

		expect(result.success).toBe(false);
		expect(result.error).toMatch(/desktopCapturer unavailable/);
		// force-stop invoked on the error cleanup path
		const hit = calls.some(
			(c) =>
				new URL(c.url).pathname === "/api/claude/screen-recording/force-stop"
		);
		expect(hit).toBe(true);
		expect(child.killed).toBe(true);
	});

	it("returns failure (not throw) when launcher fails", async () => {
		const result = await handleRecord(
			makeBaseOptions({ recordDuration: 1 }),
			() => undefined,
			new AbortController().signal,
			{
				fetchImpl: fetch, // not used — launcher fails first
				launchImpl: async () => {
					throw new Error("QCut binary not found");
				},
			}
		);

		expect(result.success).toBe(false);
		expect(result.error).toMatch(/QCut binary not found/);
	});

	it("falls back to `--duration Ns` when --record-duration is absent", async () => {
		const child = new FakeChild();
		const calls: Array<string> = [];
		const fetchImpl = (async (url: string | URL | Request) => {
			const urlStr = typeof url === "string" ? url : url.toString();
			calls.push(new URL(urlStr).pathname);
			if (urlStr.endsWith("/start"))
				return jsonResponse({ filePath: "/tmp/x.mp4", sessionId: "s" });
			return jsonResponse({ success: true, filePath: "/tmp/x.mp4" });
		}) as unknown as typeof fetch;

		const result = await handleRecord(
			makeBaseOptions({ duration: "0.05s" }),
			() => undefined,
			new AbortController().signal,
			{
				fetchImpl,
				launchImpl: async () => ({
					child: child as unknown as ChildProcess,
					port: 9999,
				}),
			}
		);

		expect(result.success).toBe(true);
		expect(calls).toContain("/api/claude/screen-recording/start");
		expect(calls).toContain("/api/claude/screen-recording/stop");
	});

	it("stops recording when abort signal fires (no --duration)", async () => {
		const child = new FakeChild();
		const { fetch: fetchImpl, calls } = makeFetchRouter({
			"/api/claude/screen-recording/start": () =>
				jsonResponse({ sessionId: "sr-1", filePath: "/tmp/a.mp4" }),
			"/api/claude/screen-recording/stop": () =>
				jsonResponse({ success: true, filePath: "/tmp/a.mp4" }),
		});

		const ac = new AbortController();
		const recordPromise = handleRecord(
			makeBaseOptions(),
			() => undefined,
			ac.signal,
			{
				fetchImpl,
				launchImpl: async () => ({
					child: child as unknown as ChildProcess,
					port: 9999,
				}),
			}
		);

		// Give the start call a tick to land, then abort.
		await new Promise((r) => setTimeout(r, 10));
		ac.abort();

		const result = await recordPromise;
		expect(result.success).toBe(true);
		expect(calls.map((c) => new URL(c.url).pathname)).toEqual([
			"/api/claude/screen-recording/start",
			"/api/claude/screen-recording/stop",
		]);
	});
});
