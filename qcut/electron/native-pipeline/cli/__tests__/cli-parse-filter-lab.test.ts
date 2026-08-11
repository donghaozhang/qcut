import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../cli.js";
import { getCommand, getCommandFlag } from "../command-registry.js";

describe("Filter Lab verification CLI registration", () => {
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
		]);
		expect(options).toMatchObject({
			command: "filter-lab-verify",
			resourceId: "filter-1",
			filterVersion: "v2",
			referenceFrame: "jianying.png",
			candidateFrame: "qcut.png",
			referenceMask: "jianying-mask.png",
			candidateMask: "qcut-mask.png",
			referenceVideo: "jianying.mov",
			candidateVideo: "qcut.mov",
		});
	});
});
