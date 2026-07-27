import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import * as analyze from "./analyze";
import * as graph from "./analyze-graph";
import { type CommandRunner, runAnalyze } from "./analyze";

describe("qcut-cityfilm analyze surface", () => {
	test("re-exports every pure helper so callers need one import", () => {
		for (const name of [
			"buildContactSheetArgs",
			"buildProbeArgs",
			"buildSceneDetectArgs",
			"buildTileTimestamps",
			"extractAudioArgs",
			"parsePacing",
			"parseProbeJson",
			"tileTimestamp",
		] as const) {
			expect(analyze[name]).toBe(graph[name]);
		}
	});
});

function createFakeRunner({
	outputDir,
	hasAudio,
}: {
	outputDir: string;
	hasAudio: boolean;
}): { calls: string[][]; runner: CommandRunner } {
	const calls: string[][] = [];
	const runner: CommandRunner = ({ executable, args }) => {
		calls.push([executable, ...args]);
		if (executable.includes("ffprobe")) {
			return Promise.resolve({
				exitCode: 0,
				stderr: "",
				stdout: JSON.stringify({
					streams: hasAudio
						? [
								{ codec_type: "video", width: 1920, height: 1080 },
								{ codec_type: "audio" },
							]
						: [{ codec_type: "video", width: 1920, height: 1080 }],
					format: { duration: "120" },
				}),
			});
		}
		const graph = args[args.indexOf("-vf") + 1] ?? "";
		if (graph.includes("tile=")) {
			writeFileSync(join(outputDir, "sheet_01.jpg"), "first");
			writeFileSync(join(outputDir, "sheet_02.jpg"), "second");
		} else if (graph.includes("select=")) {
			writeFileSync(
				join(outputDir, "scenes.txt"),
				"pts_time:3.5\nlavfi.scene_score=0.9\npts_time:70\n"
			);
		} else {
			writeFileSync(args[args.length - 1], "audio");
		}
		return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
	};
	return { calls, runner };
}

describe("qcut-cityfilm analyze run", () => {
	test("probes, sheets, detects, then extracts audio", async () => {
		const directory = mkdtempSync(join(tmpdir(), "qcut-cityfilm-analyze-"));
		const input = join(directory, "melbourne.mp4");
		const outputDir = join(directory, "analysis");
		writeFileSync(input, "film");
		const { calls, runner } = createFakeRunner({ outputDir, hasAudio: true });

		const result = await runAnalyze({
			input,
			outputDir,
			ffmpegPath: "/bin/fake-ffmpeg",
			ffprobePath: "/bin/fake-ffprobe",
			runner,
		});

		expect(calls).toHaveLength(4);
		expect(calls[0][0]).toBe("/bin/fake-ffprobe");
		expect(calls.slice(1).every((call) => call[0] === "/bin/fake-ffmpeg")).toBe(
			true
		);
		expect(result.probe.durationSeconds).toBe(120);
		expect(result.pacing).toEqual({
			durationSeconds: 120,
			cutCount: 2,
			cutsPerMinute: [1, 1],
			averageShotSeconds: 60,
		});
		expect(result.contactSheet.sheets).toEqual([
			join(outputDir, "sheet_01.jpg"),
			join(outputDir, "sheet_02.jpg"),
		]);
		expect(result.contactSheet.tileTimestamps).toHaveLength(40);
		expect(result.contactSheet.tileTimestamps[1]).toBe(3);
		expect(result.audioPath).toBe(join(outputDir, "melbourne-audio.mp3"));

		const written = JSON.parse(readFileSync(result.analysisPath, "utf8"));
		expect(written.pacing.cutCount).toBe(2);
		expect(written.audioPath).toBe(result.audioPath);
		expect(typeof written.generatedAt).toBe("string");
	});

	test("skips audio extraction for silent sources", async () => {
		const directory = mkdtempSync(join(tmpdir(), "qcut-cityfilm-silent-"));
		const input = join(directory, "silent.mov");
		const outputDir = join(directory, "analysis");
		writeFileSync(input, "film");
		const { calls, runner } = createFakeRunner({ outputDir, hasAudio: false });

		const result = await runAnalyze({
			input,
			outputDir,
			frames: 8,
			columns: 4,
			rows: 2,
			ffmpegPath: "/bin/fake-ffmpeg",
			ffprobePath: "/bin/fake-ffprobe",
			runner,
		});

		expect(calls).toHaveLength(3);
		expect(result.audioPath).toBeUndefined();
		expect(result.contactSheet.frames).toBe(8);
	});

	test("surfaces the tail of stderr when a tool fails", async () => {
		const directory = mkdtempSync(join(tmpdir(), "qcut-cityfilm-fail-"));
		const failing: CommandRunner = () =>
			Promise.resolve({
				exitCode: 1,
				stdout: "",
				stderr: "line one\nInvalid data found when processing input\n",
			});

		await expect(
			runAnalyze({
				input: join(directory, "broken.mp4"),
				outputDir: join(directory, "analysis"),
				ffprobePath: "/bin/fake-ffprobe",
				runner: failing,
			})
		).rejects.toThrow("Invalid data found");
	});
});
