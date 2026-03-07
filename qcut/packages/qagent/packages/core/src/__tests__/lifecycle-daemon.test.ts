import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { getDaemonPidPath } from "../paths.js";
import { ensureLifecycleDaemon } from "../session-manager-spawn.js";

describe("getDaemonPidPath", () => {
	let tmpDir: string;
	let configPath: string;

	beforeEach(() => {
		tmpDir = join(tmpdir(), `ao-test-daemon-${randomUUID()}`);
		mkdirSync(tmpDir, { recursive: true });
		configPath = join(tmpDir, "qagent.yaml");
		writeFileSync(configPath, "projects: {}\n");
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("returns a path under ~/.qagent with lifecycle- prefix", () => {
		const pidPath = getDaemonPidPath(configPath);
		expect(pidPath).toMatch(/\.qagent\/lifecycle-[a-f0-9]+\.pid$/);
	});

	it("returns consistent path for same config", () => {
		const path1 = getDaemonPidPath(configPath);
		const path2 = getDaemonPidPath(configPath);
		expect(path1).toBe(path2);
	});

	it("returns different paths for different configs", () => {
		const tmpDir2 = join(tmpdir(), `ao-test-daemon-${randomUUID()}`);
		mkdirSync(tmpDir2, { recursive: true });
		const configPath2 = join(tmpDir2, "qagent.yaml");
		writeFileSync(configPath2, "projects: {}\n");

		const path1 = getDaemonPidPath(configPath);
		const path2 = getDaemonPidPath(configPath2);
		expect(path1).not.toBe(path2);

		rmSync(tmpDir2, { recursive: true, force: true });
	});
});

describe("ensureLifecycleDaemon", () => {
	let tmpDir: string;
	let configPath: string;

	beforeEach(() => {
		tmpDir = join(tmpdir(), `ao-test-daemon-${randomUUID()}`);
		mkdirSync(tmpDir, { recursive: true });
		configPath = join(tmpDir, "qagent.yaml");
		writeFileSync(configPath, "projects: {}\n");
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("does nothing when daemon is already running (PID alive)", () => {
		const pidPath = getDaemonPidPath(configPath);
		// Write our own PID — guaranteed to be alive
		writeFileSync(pidPath, String(process.pid));

		// Should return without spawning
		ensureLifecycleDaemon(configPath);

		// Verify PID file still has our PID (not overwritten)
		const stored = readFileSync(pidPath, "utf-8").trim();
		expect(stored).toBe(String(process.pid));
	});

	it("does not crash when daemon script does not exist", () => {
		// ensureLifecycleDaemon should gracefully handle missing daemon script
		// (compiled .js file won't exist in test environment)
		expect(() => ensureLifecycleDaemon(configPath)).not.toThrow();
	});

	it("ignores stale PID files with dead processes", () => {
		const pidPath = getDaemonPidPath(configPath);
		// Write a PID that's definitely dead (PID 1 is init, but a very large PID won't exist)
		writeFileSync(pidPath, "999999999");

		// Should not throw — will try to spawn (which won't find the script, but that's OK)
		expect(() => ensureLifecycleDaemon(configPath)).not.toThrow();
	});
});
