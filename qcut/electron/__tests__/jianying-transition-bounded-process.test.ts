import { describe, expect, it } from "vitest";
import { runBoundedProcess } from "../../research/jianying-runtime-probe/bounded-process.js";

describe("Jianying research subprocess", () => {
	it("returns completed process output", async () => {
		await expect(
			runBoundedProcess({
				command: process.execPath,
				args: ["-e", "console.log('complete')"],
				cwd: process.cwd(),
				timeoutMs: 1_000,
			})
		).resolves.toMatchObject({ exitCode: 0, stdout: "complete\n" });
	});

	it("kills a process that exceeds its deadline", async () => {
		await expect(
			runBoundedProcess({
				command: process.execPath,
				args: ["-e", "setInterval(() => undefined, 1_000)"],
				cwd: process.cwd(),
				timeoutMs: 50,
			})
		).rejects.toThrow("timed out after 50 milliseconds");
	});
});
