/**
 * Unit tests for auto-spawn helper (Phase 2 of standalone CLI recording).
 *
 * The dispatcher-integration test is covered by the existing
 * editor-screen-recording-cli.test.ts suite; here we exercise the helper
 * in isolation with injected launcher + fetch.
 */

import { describe, expect, it } from "vitest";
import {
	ensureHeadlessDaemon,
	isAutoSpawnEligible,
	isEditorReachable,
} from "../native-pipeline/cli/auto-spawn-editor.js";

describe("isAutoSpawnEligible", () => {
	it("matches screen-recording commands", () => {
		expect(isAutoSpawnEligible("editor:screen-recording:start")).toBe(true);
		expect(isAutoSpawnEligible("editor:screen-recording:status")).toBe(true);
		expect(isAutoSpawnEligible("editor:screen-recording:force-stop")).toBe(
			true
		);
	});

	it("rejects other editor commands", () => {
		expect(isAutoSpawnEligible("editor:health")).toBe(false);
		expect(isAutoSpawnEligible("editor:timeline:info")).toBe(false);
		expect(isAutoSpawnEligible("editor:media:list")).toBe(false);
	});

	it("rejects non-editor commands", () => {
		expect(isAutoSpawnEligible("record")).toBe(false);
		expect(isAutoSpawnEligible("gen image")).toBe(false);
	});
});

describe("ensureHeadlessDaemon", () => {
	it("reuses an existing daemon when one is alive", async () => {
		let launchCalls = 0;
		const result = await ensureHeadlessDaemon({
			findExistingImpl: () => ({ pid: process.pid, port: 9100 }),
			launchImpl: async () => {
				launchCalls += 1;
				throw new Error("should not be called");
			},
		});
		expect(result).toEqual({ port: 9100, reused: true });
		expect(launchCalls).toBe(0);
	});

	it("spawns a fresh daemon when none is running", async () => {
		let launchCalls = 0;
		const ready: Array<{ port: number; reused: boolean }> = [];

		const result = await ensureHeadlessDaemon({
			findExistingImpl: () => null,
			launchImpl: async () => {
				launchCalls += 1;
				return {
					child: {
						kill: () => true,
					} as unknown as import("node:child_process").ChildProcess,
					port: 8765,
				};
			},
			onDaemonReady: (info) => ready.push(info),
		});

		expect(result).toEqual({ port: 8765, reused: false });
		expect(launchCalls).toBe(1);
		expect(ready).toEqual([{ port: 8765, reused: false }]);
	});

	it("propagates launcher errors unchanged", async () => {
		await expect(
			ensureHeadlessDaemon({
				findExistingImpl: () => null,
				launchImpl: async () => {
					throw new Error("QCut binary not found");
				},
			})
		).rejects.toThrow(/binary not found/);
	});
});

describe("isEditorReachable", () => {
	it("returns true for 200 OK", async () => {
		const fetchImpl = (async () =>
			new Response("ok", { status: 200 })) as unknown as typeof fetch;
		await expect(isEditorReachable({ port: 8765, fetchImpl })).resolves.toBe(
			true
		);
	});

	it("returns false on ECONNREFUSED / thrown error", async () => {
		const fetchImpl = (async () => {
			throw new Error("ECONNREFUSED");
		}) as unknown as typeof fetch;
		await expect(isEditorReachable({ port: 8765, fetchImpl })).resolves.toBe(
			false
		);
	});

	it("returns false on non-2xx responses", async () => {
		const fetchImpl = (async () =>
			new Response("down", { status: 503 })) as unknown as typeof fetch;
		await expect(isEditorReachable({ port: 8765, fetchImpl })).resolves.toBe(
			false
		);
	});

	it("respects the timeout (returns false, does not hang)", async () => {
		const fetchImpl = ((_url: string, init?: RequestInit) => {
			return new Promise((_resolve, reject) => {
				init?.signal?.addEventListener("abort", () =>
					reject(new Error("aborted"))
				);
			});
		}) as unknown as typeof fetch;

		const result = await isEditorReachable({
			port: 8765,
			fetchImpl,
			timeoutMs: 50,
		});
		expect(result).toBe(false);
	});
});
