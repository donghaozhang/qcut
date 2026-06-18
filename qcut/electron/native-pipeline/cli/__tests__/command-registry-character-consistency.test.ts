import { describe, expect, it } from "vitest";
import { getCommand, getCommandFlag } from "../command-registry.js";
import { parseCliArgs } from "../cli.js";

describe("character consistency command registration", () => {
	it("registers analyze-consistency flags", () => {
		const command = getCommand("analyze-consistency");

		expect(command?.category).toBe("analysis");
		expect(getCommandFlag("analyze-consistency", "--ref")?.type).toBe(
			"string[]"
		);
		expect(getCommandFlag("analyze-consistency", "--model")?.default).toBe(
			"openrouter_gemini_3_5_flash_video"
		);
	});

	it("parses qcut analyze consistency with repeatable refs", () => {
		const options = parseCliArgs([
			"analyze",
			"consistency",
			"--ref",
			"ref1.jpg",
			"--ref",
			"ref2.jpg",
			"-i",
			"scene.mp4",
			"--fps",
			"2",
			"--batch-size",
			"3",
			"--min-severity",
			"medium",
		]);

		expect(options.command).toBe("analyze-consistency");
		expect(options.refs).toEqual(["ref1.jpg", "ref2.jpg"]);
		expect(options.ref).toBe("ref1.jpg");
		expect(options.input).toBe("scene.mp4");
		expect(options.fps).toBe(2);
		expect(options.batchSize).toBe(3);
		expect(options.minSeverity).toBe("medium");
	});
});
