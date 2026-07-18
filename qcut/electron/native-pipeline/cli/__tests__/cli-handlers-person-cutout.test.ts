import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import {
	buildBackgroundCompositeArgs,
	buildPersonCutoutPayload,
	handlePersonCutout,
	resolvePersonCutoutPaths,
	type PersonCutoutDependencies,
} from "../cli-handlers-person-cutout.js";
import { parseCliArgs } from "../cli.js";
import type { CLIRunOptions } from "../cli-runner/types.js";

function baseOptions({
	input,
	outputDir,
}: {
	input: string;
	outputDir: string;
}): CLIRunOptions {
	return {
		command: "person-cutout",
		input,
		outputDir,
		saveIntermediates: false,
		json: true,
		verbose: false,
		quiet: true,
	};
}

describe("person-cutout CLI", () => {
	it("parses the grouped command and background options", () => {
		const options = parseCliArgs([
			"edit",
			"person-cutout",
			"-i",
			"speaker.mov",
			"-b",
			"office.png",
			"-o",
			"output",
			"--cutout-output",
			"output/person.webm",
			"--output",
			"output/editable.mp4",
			"--background-fit",
			"contain",
			"--portrait-filter",
			"clean-beauty",
			"--filter-intensity",
			"62",
			"--beauty",
			"25",
		]);

		expect(options.command).toBe("person-cutout");
		expect(options.input).toBe("speaker.mov");
		expect(options.background).toBe("office.png");
		expect(options.outputDir).toBe("output");
		expect(options.cutoutOutput).toBe("output/person.webm");
		expect(options.output).toBe("output/editable.mp4");
		expect(options.backgroundFit).toBe("contain");
		expect(options.portraitFilter).toBe("clean-beauty");
		expect(options.filterIntensity).toBe(62);
		expect(options.beauty).toBe(25);
	});

	it("builds a transparent cloud request and alpha-aware FFmpeg composition", () => {
		const options = {
			...baseOptions({ input: "speaker.mov", outputDir: "output" }),
			background: "office.png",
			output: "output/editable.mp4",
			backgroundFit: "cover",
			portraitFilter: "clean-beauty",
			filterIntensity: 68,
			beauty: 25,
		};
		const paths = resolvePersonCutoutPaths({ options, cwd: "/project" });
		const args = buildBackgroundCompositeArgs({
			paths,
			probe: { width: 1081, height: 1921, frameRate: 29.97, duration: 5 },
		});

		expect(
			buildPersonCutoutPayload({ videoUrl: "https://cdn/video.mp4" })
		).toEqual({
			video_url: "https://cdn/video.mp4",
			output_container_and_codec: "webm_vp9",
			preserve_audio: true,
			background_color: "Transparent",
		});
		expect(paths.cutoutOutput).toBe("/project/output/speaker_cutout.webm");
		expect(args.slice(args.indexOf("-c:v"), args.indexOf("-c:v") + 2)).toEqual([
			"-c:v",
			"libvpx-vp9",
		]);
		expect(args[args.indexOf("-map") + 1]).toBe("[video]");
		expect(args).toContain("2:a?");
		expect(args.join(" ")).toContain("crop=1080:1920");
		expect(args.join(" ")).toContain("alphaextract");
		expect(args.join(" ")).toContain("alphamerge");
		expect(args.join(" ")).toContain("hqdn3d=");
		expect(args.join(" ")).toContain("lut3d=file=");
		expect(args.at(-1)).toBe("/project/output/editable.mp4");
	});

	it("uploads, downloads, composites, and reports both deliverables", async () => {
		const directory = mkdtempSync(join(tmpdir(), "qcut-person-cutout-"));
		const input = join(directory, "speaker.mov");
		const background = join(directory, "office.png");
		const output = join(directory, "editable.mp4");
		const cutout = join(directory, "person.webm");
		writeFileSync(input, "video");
		writeFileSync(background, "image");
		let apiOptions: unknown;
		let compositeArgs: string[] = [];
		const dependencies: PersonCutoutDependencies = {
			uploadFile: async () => ({
				success: true,
				url: "https://fal.storage/source.mov",
			}),
			callModel: async ({ options: callOptions }) => {
				apiOptions = callOptions;
				return {
					success: true,
					outputUrl: "https://fal.media/cutout.webm",
					duration: 1,
				};
			},
			downloadFile: async ({ outputPath }) => {
				writeFileSync(outputPath, "cutout");
				return outputPath;
			},
			probeVideo: async () => ({
				width: 720,
				height: 1280,
				frameRate: 30,
				duration: 5,
			}),
			composeVideo: async ({ args }) => {
				compositeArgs = args;
				writeFileSync(args.at(-1) ?? "", "composite");
			},
		};

		const result = await handlePersonCutout(
			{
				...baseOptions({ input, outputDir: directory }),
				background,
				output,
				cutoutOutput: cutout,
			},
			() => undefined,
			new AbortController().signal,
			dependencies
		);

		expect(result.success).toBe(true);
		expect(result.outputPath).toBe(output);
		expect(result.outputPaths).toEqual([cutout, output]);
		expect(existsSync(cutout)).toBe(true);
		expect(existsSync(output)).toBe(true);
		expect(compositeArgs).toContain(background);
		expect(apiOptions).toMatchObject({
			endpoint: "bria/video/background-removal/v3",
			provider: "fal",
			payload: { background_color: "Transparent" },
		});
	});

	it("rejects source replacement and non-WebM alpha outputs", () => {
		const options = baseOptions({ input: "speaker.mov", outputDir: "." });
		expect(() =>
			resolvePersonCutoutPaths({
				options: { ...options, cutoutOutput: "speaker.mov" },
				cwd: "/project",
			})
		).toThrow("must use .webm");
		expect(() =>
			resolvePersonCutoutPaths({
				options: {
					...baseOptions({ input: "speaker.mp4", outputDir: "." }),
					background: "office.png",
					cutoutOutput: "speaker.webm",
					output: "speaker.mp4",
				},
				cwd: "/project",
			})
		).toThrow("cannot replace an input file");
	});
});
