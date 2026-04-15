import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../cli.js";

describe("parseCliArgs — Kling V3 Omni flags", () => {
	it("parses --sound on", () => {
		const opts = parseCliArgs([
			"gen",
			"video",
			"-m",
			"gmi_kling_v3_omni_t2v",
			"-t",
			"test",
			"--sound",
			"on",
		]);
		expect(opts.sound).toBe("on");
	});

	it("parses --sound off", () => {
		const opts = parseCliArgs([
			"gen",
			"video",
			"-m",
			"gmi_kling_v3_omni_t2v",
			"-t",
			"test",
			"--sound",
			"off",
		]);
		expect(opts.sound).toBe("off");
	});

	it("parses --watermark as boolean true", () => {
		const opts = parseCliArgs([
			"gen",
			"video",
			"-m",
			"gmi_kling_v3_omni_t2v",
			"-t",
			"test",
			"--watermark",
		]);
		expect(opts.watermark).toBe(true);
	});

	it("defaults watermark to false when omitted", () => {
		const opts = parseCliArgs([
			"gen",
			"video",
			"-m",
			"gmi_kling_v3_omni_t2v",
			"-t",
			"test",
		]);
		expect(opts.watermark).toBe(false);
	});

	it("parses repeated --tag-list entries into an array", () => {
		const opts = parseCliArgs([
			"create-element",
			"--name",
			"Detective",
			"--description",
			"Female detective",
			"--frontal-image",
			"/tmp/front.jpg",
			"--tag-list",
			"o_102",
			"--tag-list",
			"o_105",
		]);
		expect(opts.tagList).toEqual(["o_102", "o_105"]);
	});

	it("parses multiple --element-ids together with --sound and --watermark", () => {
		const opts = parseCliArgs([
			"gen",
			"video",
			"-m",
			"gmi_kling_v3_omni_i2v",
			"-t",
			"<<<element_1>>> and <<<element_2>>>",
			"--element-ids",
			"abc123",
			"--element-ids",
			"def456",
			"--sound",
			"on",
			"--watermark",
		]);
		expect(opts.elementIds).toEqual(["abc123", "def456"]);
		expect(opts.sound).toBe("on");
		expect(opts.watermark).toBe(true);
	});
});
