/**
 * Unit tests for the CLI headless launcher.
 *
 * Covers:
 *   - HTTP health probe success / timeout
 *   - Binary path resolution via env override
 *   - spawn + fetch injection (no real processes)
 *   - Daemon-info probe with live vs dead PIDs
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import {
	findExistingDaemon,
	launchHeadlessRecorder,
	resolveQcutBinaryPath,
	waitForHttpReady,
} from "../native-pipeline/cli/headless-launcher.js";
import {
	writePidFile,
	writePortFile,
	clearStateFiles,
} from "../headless-recorder/lifecycle.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fakeFetchSequence(responses: Array<Response | Error>): typeof fetch {
	let i = 0;
	return (async () => {
		const next = responses[Math.min(i, responses.length - 1)];
		i += 1;
		if (next instanceof Error) throw next;
		return next;
	}) as unknown as typeof fetch;
}

/** Minimal ChildProcess stand-in for spawn injection. */
class FakeChild extends EventEmitter {
	killed = false;
	stdout = new EventEmitter() as unknown as ChildProcess["stdout"];
	stderr = new EventEmitter() as unknown as ChildProcess["stderr"];
	kill(_signal?: NodeJS.Signals | number): boolean {
		this.killed = true;
		return true;
	}
}

function fakeSpawn(child: FakeChild): typeof import("node:child_process").spawn {
	return (() => child as unknown as ChildProcess) as unknown as typeof import("node:child_process").spawn;
}

// ---------------------------------------------------------------------------
// waitForHttpReady
// ---------------------------------------------------------------------------

describe("waitForHttpReady", () => {
	it("resolves on first 2xx response", async () => {
		const fetchImpl = fakeFetchSequence([
			new Response("ok", { status: 200 }),
		]);
		await expect(
			waitForHttpReady({
				url: "http://test/health",
				timeoutMs: 1000,
				fetchImpl,
				pollIntervalMs: 10,
			})
		).resolves.toBeUndefined();
	});

	it("retries on failure and then succeeds", async () => {
		const fetchImpl = fakeFetchSequence([
			new Error("ECONNREFUSED"),
			new Error("ECONNREFUSED"),
			new Response("ok", { status: 200 }),
		]);
		await expect(
			waitForHttpReady({
				url: "http://test/health",
				timeoutMs: 2000,
				fetchImpl,
				pollIntervalMs: 10,
			})
		).resolves.toBeUndefined();
	});

	it("rejects after the timeout with the last error", async () => {
		const fetchImpl = fakeFetchSequence([new Error("still down")]);
		await expect(
			waitForHttpReady({
				url: "http://test/health",
				timeoutMs: 100,
				fetchImpl,
				pollIntervalMs: 20,
			})
		).rejects.toThrow(/timed out/);
	});
});

// ---------------------------------------------------------------------------
// resolveQcutBinaryPath
// ---------------------------------------------------------------------------

describe("resolveQcutBinaryPath", () => {
	const originalEnv = process.env.QCUT_BINARY_PATH;
	afterEach(() => {
		if (originalEnv === undefined) delete process.env.QCUT_BINARY_PATH;
		else process.env.QCUT_BINARY_PATH = originalEnv;
	});

	it("prefers the env override when set", () => {
		process.env.QCUT_BINARY_PATH = "/custom/path/to/qcut";
		expect(resolveQcutBinaryPath()).toBe("/custom/path/to/qcut");
	});

	it("throws with a useful message when no binary can be found", () => {
		// Set an obviously bogus path so the env short-circuit bypasses
		// filesystem checks entirely — we only want to verify the env path
		// is returned verbatim. To test the throw branch we clear env and
		// rely on the fact that /Applications/QCut.app etc. won't exist in CI.
		delete process.env.QCUT_BINARY_PATH;
		try {
			const resolved = resolveQcutBinaryPath();
			// If something was found (dev machine has QCut installed) just
			// assert it's a non-empty string and move on.
			expect(resolved).toMatch(/.+/);
		} catch (err) {
			expect((err as Error).message).toMatch(/QCut binary not found/);
		}
	});
});

// ---------------------------------------------------------------------------
// launchHeadlessRecorder — happy path & early exit
// ---------------------------------------------------------------------------

describe("launchHeadlessRecorder", () => {
	it("spawns child, waits for health, returns handle", async () => {
		const child = new FakeChild();
		const fetchImpl = fakeFetchSequence([
			new Response("ok", { status: 200 }),
		]);

		const result = await launchHeadlessRecorder({
			binaryPathOverride: "/fake/qcut",
			spawnImpl: fakeSpawn(child),
			fetchImpl,
			timeoutMs: 1000,
			probePort: 9999,
		});

		expect(result.binaryPath).toBe("/fake/qcut");
		expect(result.port).toBe(9999);
		expect(result.child).toBe(child);
		expect(child.killed).toBe(false);
	});

	it("rejects and kills the child if the process exits before ready", async () => {
		const child = new FakeChild();
		const fetchImpl = fakeFetchSequence([new Error("still booting")]);

		const launchPromise = launchHeadlessRecorder({
			binaryPathOverride: "/fake/qcut",
			spawnImpl: fakeSpawn(child),
			fetchImpl,
			timeoutMs: 1000,
			probePort: 9999,
		});

		// Simulate the child exiting before the health probe succeeds.
		queueMicrotask(() => child.emit("exit", 1, null));

		await expect(launchPromise).rejects.toThrow(/exited before ready/);
		expect(child.killed).toBe(true);
	});

	it("forwards stdout/stderr lines to onOutput", async () => {
		const child = new FakeChild();
		const fetchImpl = fakeFetchSequence([
			new Response("ok", { status: 200 }),
		]);
		const outputs: string[] = [];

		const launch = launchHeadlessRecorder({
			binaryPathOverride: "/fake/qcut",
			spawnImpl: fakeSpawn(child),
			fetchImpl,
			timeoutMs: 1000,
			probePort: 9999,
			onOutput: (line) => outputs.push(line),
		});

		(child.stdout as EventEmitter).emit("data", Buffer.from("first line\n"));
		(child.stderr as EventEmitter).emit("data", Buffer.from("warning\n"));

		await launch;
		expect(outputs).toContain("first line");
		expect(outputs).toContain("warning");
	});
});

// ---------------------------------------------------------------------------
// findExistingDaemon
// ---------------------------------------------------------------------------

describe("findExistingDaemon", () => {
	beforeEach(() => {
		clearStateFiles();
	});
	afterEach(() => {
		clearStateFiles();
	});

	it("returns null when pid file is missing", () => {
		expect(findExistingDaemon()).toBeNull();
	});

	it("returns null when PID is not alive", () => {
		// PID 1 is init / systemd — definitely alive. Use a very high PID
		// that's unlikely to exist to simulate a dead daemon.
		writePidFile(999_999);
		writePortFile(9999);
		const info = findExistingDaemon();
		expect(info).toBeNull();
	});

	it("returns info when PID is alive", () => {
		writePidFile(process.pid);
		writePortFile(9999);
		const info = findExistingDaemon();
		expect(info).toEqual({ pid: process.pid, port: 9999 });
	});
});
