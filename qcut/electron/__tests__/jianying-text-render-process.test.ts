// @vitest-environment node
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import {
	captureJianyingTextProcess,
	cancelJianyingTextRender,
	finishJianyingTextRender,
	runJianyingTextProcess,
} from "../jianying-text-runtime/render-process.js";

const requestIds = new Set<string>();

function requestId({ suffix }: { suffix: string }) {
	const value = `render-process-test:${suffix}`;
	requestIds.add(value);
	return value;
}

describe("Jianying text bounded render process", () => {
	afterEach(() => {
		for (const id of requestIds) finishJianyingTextRender({ requestId: id });
		requestIds.clear();
	});

	it("completes a successful child process", async () => {
		await expect(
			runJianyingTextProcess({
				requestId: requestId({ suffix: "complete" }),
				command: process.execPath,
				args: ["-e", "process.exit(0)"],
				timeoutMs: 1_000,
			})
		).resolves.toBeUndefined();
	});

	it("captures stdout and stderr independently", async () => {
		await expect(
			captureJianyingTextProcess({
				requestId: requestId({ suffix: "capture" }),
				command: process.execPath,
				args: [
					"-e",
					'process.stdout.write("out"); process.stderr.write("err")',
				],
				timeoutMs: 1_000,
			})
		).resolves.toEqual({ stdout: "out", stderr: "err" });
	});

	it("honors cancellation requested before a child starts", async () => {
		const id = requestId({ suffix: "cancel-before-start" });
		expect(cancelJianyingTextRender({ requestId: id })).toBe(false);
		await expect(
			runJianyingTextProcess({
				requestId: id,
				command: process.execPath,
				args: ["-e", "process.exit(0)"],
				timeoutMs: 1_000,
			})
		).rejects.toThrow("render cancelled");
	});

	it("kills a child process after its deadline", async () => {
		await expect(
			runJianyingTextProcess({
				requestId: requestId({ suffix: "timeout" }),
				command: process.execPath,
				args: ["-e", "setInterval(() => undefined, 1000)"],
				timeoutMs: 40,
			})
		).rejects.toThrow("timed out after 40ms");
	});

	it("contains a crashing child and remains reusable", async () => {
		const id = requestId({ suffix: "crash-isolation" });
		await expect(
			runJianyingTextProcess({
				requestId: id,
				command: process.execPath,
				args: ["-e", "process.abort()"],
				timeoutMs: 1_000,
			})
		).rejects.toThrow("failed");

		await expect(
			runJianyingTextProcess({
				requestId: id,
				command: process.execPath,
				args: ["-e", "process.exit(0)"],
				timeoutMs: 1_000,
			})
		).resolves.toBeUndefined();
	});

	it("cancels only the matching request", async () => {
		const cancelledId = requestId({ suffix: "cancelled" });
		const independentId = requestId({ suffix: "independent" });
		const cancelled = runJianyingTextProcess({
			requestId: cancelledId,
			command: process.execPath,
			args: ["-e", "setInterval(() => undefined, 1000)"],
			timeoutMs: 2_000,
		});
		const independent = runJianyingTextProcess({
			requestId: independentId,
			command: process.execPath,
			args: ["-e", "setTimeout(() => process.exit(0), 80)"],
			timeoutMs: 2_000,
		});
		await delay(25);
		expect(cancelJianyingTextRender({ requestId: cancelledId })).toBe(true);
		await expect(cancelled).rejects.toThrow("render cancelled");
		await expect(independent).resolves.toBeUndefined();
	});
});
