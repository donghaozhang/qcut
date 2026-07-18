import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
	handlePortraitFilter,
	resolvePortraitFilterPaths,
	type PortraitFilterDependencies,
} from "../cli-handlers-portrait-filter";
import { parseCliArgs } from "../cli";
import type { CLIRunOptions } from "../cli-runner/types";
import { buildPortraitFilterArgs } from "../../filters/portrait-filter-ffmpeg";

function baseOptions({
	input,
	outputDir,
}: {
	input?: string;
	outputDir: string;
}): CLIRunOptions {
	return {
		command: "portrait-filter",
		input,
		outputDir,
		saveIntermediates: false,
		json: true,
		verbose: false,
		quiet: true,
	};
}

describe("portrait-filter CLI", () => {
	test("parses the grouped command and builds an audio-preserving filter", () => {
		const options = parseCliArgs([
			"edit",
			"portrait-filter",
			"-i",
			"speaker.mov",
			"--preset",
			"clean-beauty",
			"--filter-intensity",
			"60",
			"--beauty",
			"20",
			"--output",
			"filtered.mp4",
		]);
		const paths = resolvePortraitFilterPaths({ options, cwd: "/project" });
		const args = buildPortraitFilterArgs(paths);

		expect(options.command).toBe("portrait-filter");
		expect(paths.filter).toMatchObject({
			presetId: "clean-beauty",
			intensity: 60,
			beauty: 20,
		});
		expect(args.join(" ")).toContain("hqdn3d=");
		expect(args.join(" ")).toContain("lut3d=file=");
		expect(args).toContain("0:a?");
		expect(args.at(-1)).toBe("/project/filtered.mp4");
	});

	test("renders and verifies a filtered MP4", async () => {
		const directory = mkdtempSync(join(tmpdir(), "qcut-portrait-filter-"));
		const input = join(directory, "speaker.mov");
		const output = join(directory, "filtered.mp4");
		writeFileSync(input, "source");
		let renderArgs: string[] = [];
		const dependencies: PortraitFilterDependencies = {
			renderVideo: async ({ args }) => {
				renderArgs = args;
				writeFileSync(args.at(-1) ?? "", "filtered");
			},
			probeVideo: async ({ filePath }) => ({
				duration: filePath === input ? 5 : 5.01,
				width: 720,
				height: 1280,
				hasAudio: true,
			}),
		};

		const result = await handlePortraitFilter(
			{
				...baseOptions({ input, outputDir: directory }),
				output,
				preset: "clean-beauty",
				beauty: 25,
			},
			() => undefined,
			new AbortController().signal,
			dependencies
		);

		expect(result.success).toBe(true);
		expect(result.outputPath).toBe(output);
		expect(existsSync(output)).toBe(true);
		expect(renderArgs).toContain("0:a?");
		expect(result.data).toMatchObject({
			preset: "clean-beauty",
			beauty: 25,
			audio_preserved: true,
		});
	});

	test("lists presets without input and rejects unsafe output", async () => {
		const listed = await handlePortraitFilter(
			{
				...baseOptions({ outputDir: "/tmp" }),
				listPresets: true,
			},
			() => undefined,
			new AbortController().signal
		);
		expect(listed.success).toBe(true);
		expect(listed.data?.presets).toBeArray();

		expect(() =>
			resolvePortraitFilterPaths({
				options: {
					...baseOptions({ input: "speaker.mp4", outputDir: "." }),
					output: "speaker.mp4",
				},
				cwd: "/project",
			})
		).toThrow("cannot replace");
	});
});
