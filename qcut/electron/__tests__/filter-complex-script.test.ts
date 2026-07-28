import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRANSITION_PARITY_CASES } from "../../apps/web/src/components/editor/media-panel/views/transitions/transition-parity-ten";
import { buildFFmpegArgs } from "../ffmpeg-args-builder";
import {
	prepareFFmpegFilterComplexScripts,
	prepareFFmpegFilterScript,
} from "../ffmpeg/filter-complex-script";
import type { VideoSource, VideoTransition } from "../ffmpeg/types";

function createTemporaryRoot(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "qcut-filter-test-"));
}

describe("FFmpeg filter complex scripts", () => {
	it("leaves commands without complex filters unchanged", () => {
		const prepared = prepareFFmpegFilterComplexScripts({
			args: ["-i", "input.mp4", "-vf", "scale=320:240", "output.mp4"],
		});

		expect(prepared.args).toEqual([
			"-i",
			"input.mp4",
			"-vf",
			"scale=320:240",
			"output.mp4",
		]);
		expect(prepared.scriptPaths).toEqual([]);
		prepared.cleanup();
	});

	it("keeps short complex filters inline", () => {
		const temporaryRoot = createTemporaryRoot();
		try {
			const args = [
				"-i",
				"input.mp4",
				"-filter_complex",
				"[0:v]scale=320:240[out]",
				"-map",
				"[out]",
				"output.mp4",
			];
			const prepared = prepareFFmpegFilterComplexScripts({
				args,
				temporaryDirectory: temporaryRoot,
			});

			expect(prepared.args).toEqual(args);
			expect(prepared.scriptPaths).toEqual([]);
			expect(fs.readdirSync(temporaryRoot)).toEqual([]);
			prepared.cleanup();
		} finally {
			fs.rmSync(temporaryRoot, { recursive: true, force: true });
		}
	});

	it("moves every complex graph out of the process arguments", () => {
		const temporaryRoot = createTemporaryRoot();
		try {
			const longGraph = `[0:v]${"null,".repeat(20_000)}null[first]`;
			const graphs = [longGraph, "[0:a][1:a]amix=inputs=2[aout]"];
			const prepared = prepareFFmpegFilterComplexScripts({
				args: [
					"-i",
					"input.mp4",
					"-filter_complex",
					graphs[0],
					"-map",
					"[first]",
					"-filter_complex",
					graphs[1],
					"-map",
					"[aout]",
					"output.mp4",
				],
				temporaryDirectory: temporaryRoot,
			});

			expect(prepared.args).not.toContain("-filter_complex");
			expect(
				prepared.args.filter((value) => value === "-filter_complex_script")
			).toHaveLength(2);
			expect(Buffer.byteLength(longGraph)).toBeGreaterThan(32_767);
			expect(Buffer.byteLength(prepared.args.join("\0"))).toBeLessThan(1_000);
			expect(
				prepared.scriptPaths.map((scriptPath) =>
					fs.readFileSync(scriptPath, "utf8")
				)
			).toEqual(graphs);
			if (process.platform !== "win32") {
				for (const scriptPath of prepared.scriptPaths) {
					expect(fs.statSync(scriptPath).mode & 0o777).toBe(0o600);
				}
			}

			const [directory] = prepared.scriptPaths.map((scriptPath) =>
				path.dirname(scriptPath)
			);
			prepared.cleanup();
			prepared.cleanup();
			expect(fs.existsSync(directory)).toBe(false);
		} finally {
			fs.rmSync(temporaryRoot, { recursive: true, force: true });
		}
	});

	it("rejects a missing graph without leaking its temporary directory", () => {
		const temporaryRoot = createTemporaryRoot();
		try {
			expect(() =>
				prepareFFmpegFilterComplexScripts({
					args: ["-i", "input.mp4", "-filter_complex"],
					temporaryDirectory: temporaryRoot,
				})
			).toThrowError("FFmpeg filter_complex is missing its graph");
			expect(fs.readdirSync(temporaryRoot)).toEqual([]);
		} finally {
			fs.rmSync(temporaryRoot, { recursive: true, force: true });
		}
	});
});

const clipDuration = 2;

function buildExactTenProductionArgs({
	inputDirectory,
}: {
	inputDirectory: string;
}): string[] {
	const videoSources: VideoSource[] = Array.from(
		{ length: TRANSITION_PARITY_CASES.length + 1 },
		(_, index) => {
			const clipPath = path.join(inputDirectory, `clip-${index}.mp4`);
			fs.writeFileSync(clipPath, "");
			return {
				elementId: `clip-${index}`,
				trackId: "main",
				trackOrder: 0,
				elementOrder: index,
				path: clipPath,
				startTime: index * clipDuration,
				duration: clipDuration,
			};
		}
	);
	const videoTransitions: VideoTransition[] = TRANSITION_PARITY_CASES.map(
		({ qcutPresetId, expectedConfig }, index) => ({
			id: `transition-${index}`,
			trackId: "main",
			fromElementId: `clip-${index}`,
			toElementId: `clip-${index + 1}`,
			presetId: qcutPresetId,
			duration: 0.4,
			easing: "easeInOut",
			...expectedConfig,
		})
	);

	return buildFFmpegArgs({
		inputDir: inputDirectory,
		outputFile: path.join(inputDirectory, "output.mp4"),
		width: 1920,
		height: 1080,
		fps: 30,
		quality: "medium",
		duration: videoSources.length * clipDuration,
		videoSources,
		videoTransitions,
	});
}

describe("prepareFFmpegFilterScript", () => {
	let tempRoot: string;

	beforeEach(() => {
		tempRoot = createTemporaryRoot();
	});

	afterEach(() => {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	});

	it("keeps a short filter command in argv without writing a script", () => {
		const originalArgs = [
			"-i",
			"input.mp4",
			"-filter_complex",
			"[0:v]scale=1280:720[out]",
			"-map",
			"[out]",
		];

		const prepared = prepareFFmpegFilterScript({
			executablePath: "/usr/bin/ffmpeg",
			args: originalArgs,
			commandLengthThreshold: Number.MAX_SAFE_INTEGER,
			tempDirectory: tempRoot,
		});

		expect(prepared.args).toEqual(originalArgs);
		expect(prepared.filterScriptPath).toBeUndefined();
		expect(fs.readdirSync(tempRoot)).toEqual([]);
		prepared.cleanup();
		expect(fs.readdirSync(tempRoot)).toEqual([]);
	});

	it("replaces an oversized filter graph with a byte-identical script", () => {
		const filterGraph =
			"[0:v]scale=1920:1080[scaled];\n" +
			"[scaled]drawtext=text='逐字一致; []':x=10:y=20[out]";
		const originalArgs = [
			"-i",
			"input.mp4",
			"-filter_complex",
			filterGraph,
			"-map",
			"[out]",
		];

		const prepared = prepareFFmpegFilterScript({
			executablePath: "/usr/bin/ffmpeg",
			args: originalArgs,
			commandLengthThreshold: 1,
			tempDirectory: tempRoot,
		});

		expect(prepared.filterScriptPath).toBeDefined();
		if (!prepared.filterScriptPath) {
			throw new Error("Expected an FFmpeg filter script path");
		}
		expect(prepared.args).toEqual([
			"-i",
			"input.mp4",
			"-filter_complex_script",
			prepared.filterScriptPath,
			"-map",
			"[out]",
		]);
		expect(fs.readFileSync(prepared.filterScriptPath, "utf8")).toBe(
			filterGraph
		);
	});

	it("scripts the production exact-ten transition graph at the default threshold", () => {
		const originalArgs = buildExactTenProductionArgs({
			inputDirectory: tempRoot,
		});
		const prepared = prepareFFmpegFilterScript({
			executablePath: "/usr/bin/ffmpeg",
			args: originalArgs,
			tempDirectory: tempRoot,
		});

		expect(prepared.filterScriptPath).toBeDefined();
		if (!prepared.filterScriptPath) {
			throw new Error("Expected an FFmpeg filter script path");
		}
		const scriptDirectory = path.dirname(prepared.filterScriptPath);
		const filterGraph = fs.readFileSync(prepared.filterScriptPath, "utf8");

		expect(prepared.args).toContain("-filter_complex_script");
		expect(prepared.args).not.toContain("-filter_complex");
		expect(filterGraph.match(/xfade=transition=custom/g)).toHaveLength(10);
		expect(fs.existsSync(scriptDirectory)).toBe(true);

		prepared.cleanup();
		expect(fs.existsSync(scriptDirectory)).toBe(false);
	});

	it("removes the generated directory once when cleanup is repeated", () => {
		const prepared = prepareFFmpegFilterScript({
			executablePath: "/usr/bin/ffmpeg",
			args: ["-filter_complex", "[0:v]null[out]"],
			commandLengthThreshold: 1,
			tempDirectory: tempRoot,
		});
		expect(prepared.filterScriptPath).toBeDefined();
		if (!prepared.filterScriptPath) {
			throw new Error("Expected an FFmpeg filter script path");
		}
		const scriptDirectory = path.dirname(prepared.filterScriptPath);
		expect(fs.existsSync(scriptDirectory)).toBe(true);

		prepared.cleanup();
		expect(fs.existsSync(scriptDirectory)).toBe(false);
		expect(() => prepared.cleanup()).not.toThrow();
		expect(fs.existsSync(scriptDirectory)).toBe(false);
	});

	it("falls back to asynchronous removal when Windows keeps the directory busy", () => {
		const prepared = prepareFFmpegFilterScript({
			executablePath: "C:\\ffmpeg\\bin\\ffmpeg.exe",
			args: ["-filter_complex", "[0:v]null[out]"],
			commandLengthThreshold: 1,
			tempDirectory: tempRoot,
		});
		expect(prepared.filterScriptPath).toBeDefined();
		if (!prepared.filterScriptPath) {
			throw new Error("Expected an FFmpeg filter script path");
		}
		const scriptDirectory = path.dirname(prepared.filterScriptPath);
		const permissionError = Object.assign(
			new Error("operation not permitted"),
			{
				code: "EPERM",
			}
		);
		const rmSyncSpy = vi.spyOn(fs, "rmSync").mockImplementationOnce(() => {
			throw permissionError;
		});
		const rmSpy = vi.spyOn(fs, "rm").mockImplementation(() => undefined);

		try {
			expect(() => prepared.cleanup()).not.toThrow();
			expect(rmSyncSpy).toHaveBeenCalledWith(scriptDirectory, {
				recursive: true,
				force: true,
			});
			expect(rmSpy).toHaveBeenCalledWith(
				scriptDirectory,
				{
					recursive: true,
					force: true,
					maxRetries: 5,
					retryDelay: 100,
				},
				expect.any(Function)
			);
			expect(fs.existsSync(scriptDirectory)).toBe(true);
		} finally {
			rmSyncSpy.mockRestore();
			rmSpy.mockRestore();
			fs.rmSync(scriptDirectory, { recursive: true, force: true });
		}

		expect(fs.existsSync(scriptDirectory)).toBe(false);
	});

	it("rejects a filter_complex flag without its graph argument", () => {
		expect(() =>
			prepareFFmpegFilterScript({
				executablePath: "/usr/bin/ffmpeg",
				args: ["-hide_banner", "-filter_complex"],
				commandLengthThreshold: 1,
				tempDirectory: tempRoot,
			})
		).toThrow("FFmpeg filter graph argument is missing");
		expect(fs.readdirSync(tempRoot)).toEqual([]);
	});
});
