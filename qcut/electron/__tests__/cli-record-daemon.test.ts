/**
 * Unit tests for `qcut record-daemon` utility command.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleRecordDaemon } from "../native-pipeline/cli/cli-handlers-record-daemon.js";
import type { CLIRunOptions } from "../native-pipeline/cli/cli-runner/types.js";
import {
	clearStateFiles,
	writePidFile,
	writePortFile,
} from "../headless-recorder/lifecycle.js";

function baseOptions(extra: Partial<CLIRunOptions> = {}): CLIRunOptions {
	return {
		command: "record-daemon",
		outputDir: "./output",
		saveIntermediates: false,
		json: false,
		verbose: false,
		quiet: false,
		...extra,
	} as CLIRunOptions;
}

describe("handleRecordDaemon --status (default)", () => {
	beforeEach(() => clearStateFiles());
	afterEach(() => clearStateFiles());

	it("reports running=false when no daemon file is present", async () => {
		const result = await handleRecordDaemon(
			baseOptions(),
			() => undefined,
			new AbortController().signal
		);
		expect(result.success).toBe(true);
		expect(result.data).toMatchObject({
			running: false,
			pid: null,
			port: null,
		});
	});

	it("reports running=true when a live daemon is recorded", async () => {
		writePidFile(process.pid);
		writePortFile(9100);
		const result = await handleRecordDaemon(
			baseOptions(),
			() => undefined,
			new AbortController().signal
		);
		expect(result.success).toBe(true);
		expect(result.data).toMatchObject({
			running: true,
			pid: process.pid,
			port: 9100,
		});
	});

	it("reports running=false when the recorded PID is dead", async () => {
		writePidFile(999_999); // unlikely to exist
		writePortFile(9100);
		const result = await handleRecordDaemon(
			baseOptions(),
			() => undefined,
			new AbortController().signal
		);
		expect(result.data).toMatchObject({ running: false });
	});
});

describe("handleRecordDaemon --stop", () => {
	beforeEach(() => clearStateFiles());
	afterEach(() => clearStateFiles());

	it("returns no-op success when nothing is running", async () => {
		const result = await handleRecordDaemon(
			baseOptions({ command: "record-daemon" }),
			() => undefined,
			new AbortController().signal,
			{
				killImpl: () => {
					throw new Error("should not be called");
				},
				findExistingImpl: () => null,
			}
		);
		// Stop treats missing daemon as a successful no-op.
		// `stop` flag injected via the raw options bag.
		expect(result.success).toBe(true);
	});

	it("signals SIGTERM when a daemon is running", async () => {
		const killed: Array<{ pid: number; signal: string }> = [];
		const options = baseOptions();
		(options as unknown as Record<string, unknown>).stop = true;

		const result = await handleRecordDaemon(
			options,
			() => undefined,
			new AbortController().signal,
			{
				findExistingImpl: () => ({ pid: 42, port: 8765 }),
				killImpl: (pid, signal) => {
					killed.push({ pid, signal: signal as string });
				},
			}
		);
		expect(result.success).toBe(true);
		expect(killed).toEqual([{ pid: 42, signal: "SIGTERM" }]);
		expect(result.data).toMatchObject({ stopped: true, pid: 42, port: 8765 });
	});

	it("returns an error when kill throws", async () => {
		const options = baseOptions();
		(options as unknown as Record<string, unknown>).stop = true;

		const result = await handleRecordDaemon(
			options,
			() => undefined,
			new AbortController().signal,
			{
				findExistingImpl: () => ({ pid: 42, port: 8765 }),
				killImpl: () => {
					throw new Error("EPERM");
				},
			}
		);
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/EPERM/);
	});
});

describe("handleRecordDaemon --start", () => {
	beforeEach(() => clearStateFiles());
	afterEach(() => clearStateFiles());

	it("is a no-op when a daemon is already running", async () => {
		const options = baseOptions();
		(options as unknown as Record<string, unknown>).start = true;

		const result = await handleRecordDaemon(
			options,
			() => undefined,
			new AbortController().signal,
			{
				findExistingImpl: () => ({ pid: 42, port: 8765 }),
				launchImpl: async () => {
					throw new Error("should not be called");
				},
			}
		);
		expect(result.success).toBe(true);
		expect(result.data).toMatchObject({
			started: false,
			pid: 42,
			port: 8765,
		});
	});

	it("spawns a fresh daemon when none is running", async () => {
		const options = baseOptions();
		(options as unknown as Record<string, unknown>).start = true;

		let spawned = false;
		const result = await handleRecordDaemon(
			options,
			() => undefined,
			new AbortController().signal,
			{
				findExistingImpl: () => null,
				launchImpl: async () => {
					spawned = true;
					return { port: 8765 };
				},
			}
		);
		expect(spawned).toBe(true);
		expect(result.success).toBe(true);
		expect(result.data).toMatchObject({ started: true, port: 8765 });
	});

	it("surfaces launch errors", async () => {
		const options = baseOptions();
		(options as unknown as Record<string, unknown>).start = true;

		const result = await handleRecordDaemon(
			options,
			() => undefined,
			new AbortController().signal,
			{
				findExistingImpl: () => null,
				launchImpl: async () => {
					throw new Error("binary missing");
				},
			}
		);
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/binary missing/);
	});
});
