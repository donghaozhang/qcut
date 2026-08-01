import { describe, expect, it } from "vitest";
import { runCommand } from "../capcut-e2e/runtime.js";

interface MutableBunRuntime {
	spawn: (...args: unknown[]) => unknown;
}

describe("CapCut E2E command runtime", () => {
	it("handles stream failures that occur after a command timeout", async () => {
		const originalRuntime = (globalThis as { Bun?: MutableBunRuntime }).Bun;
		const streamControllers: Array<{ error(reason?: unknown): void }> = [];
		const createPendingStream = () =>
			new ReadableStream<Uint8Array>({
				start(controller) {
					streamControllers.push(controller);
				},
			});
		const unhandledRejections: unknown[] = [];
		const recordUnhandledRejection = (reason: unknown) => {
			unhandledRejections.push(reason);
		};
		process.on("unhandledRejection", recordUnhandledRejection);
		Reflect.set(globalThis, "Bun", {
			spawn: () => ({
				exited: new Promise<number>(() => {}),
				kill: () => {},
				stderr: createPendingStream(),
				stdout: createPendingStream(),
			}),
		});

		try {
			await expect(
				runCommand({
					args: [],
					command: "timeout-fixture",
					timeoutMilliseconds: 1,
				})
			).rejects.toThrow("timeout-fixture timed out after 1 milliseconds");

			for (const controller of streamControllers) {
				controller.error(new Error("late stream failure"));
			}
			await new Promise((resolve) => setTimeout(resolve, 20));

			expect(unhandledRejections).toEqual([]);
		} finally {
			if (originalRuntime) {
				Reflect.set(globalThis, "Bun", originalRuntime);
			} else {
				Reflect.deleteProperty(globalThis, "Bun");
			}
			process.off("unhandledRejection", recordUnhandledRejection);
		}
	});
});
