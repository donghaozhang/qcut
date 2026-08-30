import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../cli.js";
import { getCommand, getCommandFlag } from "../command-registry.js";

describe("Filter Lab verification CLI registration", () => {
	it.each(["render", "apply"])("registers and parses %s", (action) => {
		const options = parseCliArgs([
			"filter-lab",
			action,
			"--resource-id",
			"123",
			"-i",
			"input.mp4",
			"--output",
			"output.mp4",
			"--filter-intensity",
			"75",
			"--duration",
			"1",
			"--fps",
			"24",
			"--force",
		]);
		expect(options).toMatchObject({
			command: "filter-lab-render",
			resourceId: "123",
			input: "input.mp4",
			output: "output.mp4",
			filterIntensity: 75,
			duration: "1",
			fps: 24,
			force: true,
		});
		expect(getCommand("filter-lab-render")?.category).toBe("filter-lab");
	});

	it("registers and parses an ordered filter pipeline", () => {
		const options = parseCliArgs([
			"filter-lab",
			"pipeline",
			"--filter-step",
			"123:70",
			"--filter-step",
			"456:35",
			"-i",
			"input.mp4",
			"--output",
			"output.mp4",
			"--duration",
			"2",
			"--fps",
			"24",
		]);
		expect(options).toMatchObject({
			command: "filter-lab-pipeline",
			filterSteps: ["123:70", "456:35"],
			input: "input.mp4",
			output: "output.mp4",
			duration: "2",
			fps: 24,
		});
		expect(getCommandFlag("filter-lab-pipeline", "--filter-step")?.type).toBe(
			"string[]"
		);
	});

	it("registers rendered parity verification", () => {
		expect(getCommand("filter-lab-verify")?.category).toBe("filter-lab");
		expect(getCommandFlag("filter-lab-verify", "--reference-frame")?.type).toBe(
			"string"
		);
	});

	it("parses grouped frame, mask, and video evidence", () => {
		const options = parseCliArgs([
			"filter-lab",
			"verify",
			"--resource-id",
			"filter-1",
			"--reference-kind",
			"jianying-ui",
			"--filter-version",
			"v2",
			"--reference-frame",
			"jianying.png",
			"--candidate-frame",
			"qcut.png",
			"--reference-mask",
			"jianying-mask.png",
			"--candidate-mask",
			"qcut-mask.png",
			"--reference-video",
			"jianying.mov",
			"--candidate-video",
			"qcut.mov",
			"--details",
		]);
		expect(options).toMatchObject({
			command: "filter-lab-verify",
			resourceId: "filter-1",
			referenceKind: "jianying-ui",
			filterVersion: "v2",
			referenceFrame: "jianying.png",
			candidateFrame: "qcut.png",
			referenceMask: "jianying-mask.png",
			candidateMask: "qcut-mask.png",
			referenceVideo: "jianying.mov",
			candidateVideo: "qcut.mov",
			details: true,
		});
	});
});
