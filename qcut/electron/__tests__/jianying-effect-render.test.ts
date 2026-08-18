import { afterEach, describe, expect, it } from "vitest";
import {
	bridgeEnvironment,
	EFFECT_FRAME_COUNT_PATTERN,
	runJianyingEffectProcess,
} from "../jianying-effect/render.js";
import type { JianyingEffectRuntimeInspection } from "../jianying-effect/runtime-discovery.js";

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

describe("bridgeEnvironment", () => {
	const inspection: JianyingEffectRuntimeInspection = {
		status: {
			state: "ready",
			message: "ready",
		} as JianyingEffectRuntimeInspection["status"],
		appBundlePath: null,
		runtimeRootPath: null,
		bridgePath: "/tmp/bridge",
		effects: [],
	};

	afterEach(() => {
		delete process.env.JY_MODEL_DIRECTORY;
	});

	// The bridge enters algorithm mode purely on JY_MODEL_DIRECTORY being
	// present, so a value inherited from QCut's own environment must not
	// leak into a blit render whose definition never asked for models.
	it("drops an inherited JY_MODEL_DIRECTORY for blit renders", () => {
		process.env.JY_MODEL_DIRECTORY = "/tmp/inherited-models";

		const environment = bridgeEnvironment({ inspection, extra: {} });

		expect(environment.JY_MODEL_DIRECTORY).toBeUndefined();
	});

	it("keeps the explicitly supplied model directory", () => {
		process.env.JY_MODEL_DIRECTORY = "/tmp/inherited-models";

		const environment = bridgeEnvironment({
			inspection,
			extra: { JY_MODEL_DIRECTORY: "/tmp/algorithm-models" },
		});

		expect(environment.JY_MODEL_DIRECTORY).toBe("/tmp/algorithm-models");
	});
});
