import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../cli.js";
import { getCommand, getCommandFlag } from "../command-registry.js";

describe("Transition Lab CLI registration", () => {
	it("registers list, doctor, and render commands", () => {
		expect(getCommand("transition-list")?.category).toBe("transition");
		expect(getCommand("transition-doctor")?.category).toBe("transition");
		expect(getCommand("transition-render")?.category).toBe("transition");
		expect(getCommandFlag("transition-render", "--input-a")?.required).toBe(
			true
		);
		expect(getCommandFlag("transition-render", "--input-b")?.required).toBe(
			true
		);
	});

	it("parses the grouped render command", () => {
		const options = parseCliArgs([
			"transition",
			"render",
			"--preset",
			"jianying-local-traverse-3",
			"--input-a",
			"a.mp4",
			"--input-b",
			"b.mp4",
			"--output",
			"joined.mp4",
			"--duration",
			"0.8",
			"--fps",
			"24",
			"--force",
		]);

		expect(options).toMatchObject({
			command: "transition-render",
			preset: "jianying-local-traverse-3",
			inputA: "a.mp4",
			inputB: "b.mp4",
			output: "joined.mp4",
			duration: "0.8",
			fps: 24,
			force: true,
		});
	});
});
