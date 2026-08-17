import { describe, expect, it } from "vitest";
import {
	EFFECT_FRAME_COUNT_PATTERN,
	runJianyingEffectProcess,
} from "../jianying-effect/render.js";

const FRAME_LINE = "[effect] frames: input=60, effect=60, output=60";

/** Runs node so the test exercises the real stdout/stderr plumbing. */
function runScript({ script }: { script: string }) {
	return runJianyingEffectProcess({
		command: process.execPath,
		args: ["-e", script],
		retainPattern: EFFECT_FRAME_COUNT_PATTERN,
		timeoutMs: 30_000,
	});
}

describe("runJianyingEffectProcess", () => {
	it("keeps the frame counts when teardown logs flood the tail window", async () => {
		// Packages with an embedded JS engine log ~90KB of scene teardown after
		// the probe prints its counts, which used to scroll them out of view.
		const output = await runScript({
			script: `process.stdout.write(${JSON.stringify(`${FRAME_LINE}\n`)});process.stdout.write("teardown\\n".repeat(4000));`,
		});

		expect(output).toMatch(EFFECT_FRAME_COUNT_PATTERN);
	});

	it("keeps the frame counts when they arrive split across chunks", async () => {
		const head = FRAME_LINE.slice(0, 20);
		const tail = FRAME_LINE.slice(20);
		const script = [
			`process.stdout.write(${JSON.stringify(head)});`,
			"setTimeout(() => {",
			`process.stdout.write(${JSON.stringify(`${tail}\n`)});`,
			`process.stdout.write("teardown\\n".repeat(4000));`,
			"}, 20);",
		].join("");

		expect(await runScript({ script })).toMatch(EFFECT_FRAME_COUNT_PATTERN);
	});

	it("still returns plain output when nothing matches", async () => {
		const output = await runScript({
			script: `process.stdout.write("no counts here\\n");`,
		});

		expect(output).toContain("no counts here");
		expect(output).not.toMatch(EFFECT_FRAME_COUNT_PATTERN);
	});

	it("rejects with the captured output when the process fails", async () => {
		await expect(
			runScript({
				script: `process.stderr.write("boom\\n");process.exit(3);`,
			})
		).rejects.toThrow(/boom/);
	});
});
