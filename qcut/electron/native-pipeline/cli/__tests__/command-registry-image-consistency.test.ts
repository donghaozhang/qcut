import { describe, expect, it } from "vitest";
import { getCommand, getCommandFlag } from "../command-registry.js";
import { parseCliArgs } from "../cli.js";

describe("image consistency command registration", () => {
	it("registers analyze-image-consistency flags", () => {
		const command = getCommand("analyze-image-consistency");

		expect(command?.category).toBe("analysis");
		expect(getCommandFlag("analyze-image-consistency", "--ref")?.type).toBe(
			"string[]"
		);
		expect(
			getCommandFlag("analyze-image-consistency", "--candidate")?.type
		).toBe("string[]");
		expect(
			getCommandFlag("analyze-image-consistency", "--model")?.default
		).toBe("openrouter_gemini_3_5_flash_video");
	});

	it("parses qcut analyze image-consistency with repeatable refs and candidates", () => {
		const options = parseCliArgs([
			"analyze",
			"image-consistency",
			"--ref",
			"ref1.png",
			"--ref",
			"ref2.png",
			"--candidate",
			"gen1.png",
			"--candidate",
			"gen2.png",
			"--rules-file",
			"rule.md",
			"--min-severity",
			"medium",
		]);

		expect(options.command).toBe("analyze-image-consistency");
		expect(options.refs).toEqual(["ref1.png", "ref2.png"]);
		expect(options.candidates).toEqual(["gen1.png", "gen2.png"]);
		expect(options.rulesFile).toBe("rule.md");
		expect(options.minSeverity).toBe("medium");
	});
});
