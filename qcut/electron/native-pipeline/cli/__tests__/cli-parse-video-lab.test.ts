import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../cli.js";
import { getCommand, getCommandFlag } from "../command-registry.js";

describe("Video Lab CLI registration", () => {
	it("parses the grouped local deflicker command", () => {
		const options = parseCliArgs([
			"edit",
			"deflicker",
			"-i",
			"source.mp4",
			"--output",
			"result.mp4",
			"--strength",
			"85",
			"--force",
		]);

		expect(options).toMatchObject({
			command: "video-lab-deflicker",
			force: true,
			input: "source.mp4",
			output: "result.mp4",
			strength: 85,
		});
		expect(getCommand("video-lab-deflicker")?.category).toBe("editing");
		expect(getCommandFlag("video-lab-deflicker", "--strength")?.type).toBe(
			"number"
		);
	});
});
