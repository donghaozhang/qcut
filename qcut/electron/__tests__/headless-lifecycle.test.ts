/**
 * Unit tests for the headless recorder lifecycle utilities.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import {
	PID_FILE,
	PORT_FILE,
	clearStateFiles,
	installIdleTimer,
	isProcessAlive,
	readDaemonInfo,
	writePidFile,
	writePortFile,
} from "../headless-recorder/lifecycle.js";

describe("state files", () => {
	beforeEach(() => clearStateFiles());
	afterEach(() => clearStateFiles());

	it("round-trips pid and port", () => {
		writePidFile(12345);
		writePortFile(8765);
		expect(readFileSync(PID_FILE, "utf8").trim()).toBe("12345");
		expect(readFileSync(PORT_FILE, "utf8").trim()).toBe("8765");
		expect(readDaemonInfo()).toEqual({ pid: 12345, port: 8765 });
	});

	it("clearStateFiles removes both", () => {
		writePidFile(1);
		writePortFile(2);
		clearStateFiles();
		expect(existsSync(PID_FILE)).toBe(false);
		expect(existsSync(PORT_FILE)).toBe(false);
	});

	it("readDaemonInfo returns null for missing files", () => {
		clearStateFiles();
		expect(readDaemonInfo()).toBeNull();
	});

	it("readDaemonInfo returns null for malformed content", () => {
		writePidFile(NaN as unknown as number); // writes "NaN"
		writePortFile(8765);
		expect(readDaemonInfo()).toBeNull();
	});
});

describe("isProcessAlive", () => {
	it("returns true for the current process", () => {
		expect(isProcessAlive(process.pid)).toBe(true);
	});

	it("returns false for an unlikely-to-exist high PID", () => {
		expect(isProcessAlive(999_999)).toBe(false);
	});

	it("returns false for invalid input", () => {
		expect(isProcessAlive(0)).toBe(false);
		expect(isProcessAlive(-1)).toBe(false);
		expect(isProcessAlive(NaN as unknown as number)).toBe(false);
	});
});

describe("installIdleTimer", () => {
	it("fires onIdle after the timeout when isActive returns false", async () => {
		let fired = false;
		const { dispose } = installIdleTimer({
			idleTimeoutMs: 20,
			pollIntervalMs: 5,
			onIdle: () => {
				fired = true;
			},
			isActive: () => false,
		});
		await new Promise((r) => setTimeout(r, 60));
		dispose();
		expect(fired).toBe(true);
	});

	it("does not fire while isActive returns true", async () => {
		let fired = false;
		const { dispose } = installIdleTimer({
			idleTimeoutMs: 20,
			pollIntervalMs: 5,
			onIdle: () => {
				fired = true;
			},
			isActive: () => true,
		});
		await new Promise((r) => setTimeout(r, 60));
		dispose();
		expect(fired).toBe(false);
	});

	it("bump() resets the idle clock", async () => {
		let fired = false;
		const { dispose, bump } = installIdleTimer({
			idleTimeoutMs: 40,
			pollIntervalMs: 5,
			onIdle: () => {
				fired = true;
			},
			isActive: () => false,
		});
		// Bump three times over ~60ms; idle clock should keep resetting.
		for (let i = 0; i < 3; i++) {
			await new Promise((r) => setTimeout(r, 20));
			bump();
		}
		expect(fired).toBe(false);
		// Now stop bumping; after another 60ms idle timer should fire.
		await new Promise((r) => setTimeout(r, 60));
		dispose();
		expect(fired).toBe(true);
	});
});
