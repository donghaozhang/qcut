import { describe, expect, it } from "vitest";
import { runPreviewProcess } from "../jianying-transition/preview-cache-shared.js";

describe("Jianying preview process", () => {
	it("resolves when the child process succeeds", async () => {
		await expect(
			runPreviewProcess({
				command: process.execPath,
				args: ["-e", "process.exit(0)"],
				timeoutMs: 1_000,
			})
		).resolves.toBeUndefined();
	});

	it("kills a child process that exceeds the timeout", async () => {
		await expect(
			runPreviewProcess({
				command: process.execPath,
				args: ["-e", "setInterval(() => undefined, 1_000)"],
				timeoutMs: 50,
			})
		).rejects.toThrow("timed out after 50ms");
	});
});
