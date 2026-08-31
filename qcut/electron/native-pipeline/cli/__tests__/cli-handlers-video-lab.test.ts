import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CLIRunOptions } from "../cli-runner/types.js";

const { deflickerRuntime } = vi.hoisted(() => ({
	deflickerRuntime: vi.fn(),
}));

vi.mock("../../../jianying-basic-video-runtime/runtime.js", () => ({
	deflickerWithJianyingRuntime: deflickerRuntime,
}));

import { handleVideoLabDeflicker } from "../cli-handlers-video-lab.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory() {
	const directory = await mkdtemp(
		path.join(os.tmpdir(), "qcut-video-lab-cli-")
	);
	temporaryDirectories.push(directory);
	return directory;
}

function options({
	input,
	output,
	strength = 80,
}: {
	input: string;
	output: string;
	strength?: number;
}): CLIRunOptions {
	return {
		command: "video-lab-deflicker",
		force: false,
		input,
		json: true,
		output,
		outputDir: path.dirname(output),
		quiet: true,
		saveIntermediates: false,
		strength,
		verbose: false,
	};
}

describe("video-lab deflicker CLI handler", () => {
	afterEach(async () => {
		vi.clearAllMocks();
		await Promise.all(
			temporaryDirectories
				.splice(0)
				.map((directory) => rm(directory, { force: true, recursive: true }))
		);
	});

	it("publishes the verified cache result to the requested path", async () => {
		const directory = await temporaryDirectory();
		const input = path.join(directory, "source.mp4");
		const cache = path.join(directory, "cache.mp4");
		const output = path.join(directory, "result.mp4");
		await Promise.all([
			writeFile(input, "source"),
			writeFile(cache, "processed-video"),
		]);
		deflickerRuntime.mockImplementation(
			async ({ onProgress }: { onProgress: (value: unknown) => void }) => {
				onProgress({ progress: 75, stage: "process", status: "processing" });
				return {
					cacheHit: false,
					fps: 24,
					frameCount: 72,
					hasAudio: true,
					height: 1080,
					outputPath: cache,
					provider: "jianying-private-cache",
					route: "qcut-jianying-private-deflicker-v2",
					strength: 80,
					width: 1920,
				};
			}
		);
		const progress = vi.fn();

		const result = await handleVideoLabDeflicker(
			options({ input, output }),
			progress,
			new AbortController().signal
		);

		expect(result.success).toBe(true);
		expect(result.outputPath).toBe(output);
		expect(await readFile(output, "utf8")).toBe("processed-video");
		expect(progress).toHaveBeenCalledWith({
			message: "processing",
			model: "jianying-private-cache",
			percent: 75,
			stage: "process",
		});
	});

	it("rejects an existing output before running the private model", async () => {
		const directory = await temporaryDirectory();
		const input = path.join(directory, "source.mp4");
		const output = path.join(directory, "result.mp4");
		await Promise.all([writeFile(input, "source"), writeFile(output, "old")]);

		const result = await handleVideoLabDeflicker(
			options({ input, output }),
			vi.fn(),
			new AbortController().signal
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("Output already exists");
		expect(deflickerRuntime).not.toHaveBeenCalled();
	});
});
