import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
	extractKeyframes,
	frameExtractorInternals,
	probeVideoMeta,
} from "../frame-extractor.js";

function makeExecFileMock({
	stdout,
	onFfmpeg,
}: {
	stdout: string;
	onFfmpeg?: ({ outputPattern }: { outputPattern: string }) => void;
}) {
	return vi.fn(async (command: string, args: string[]) => {
		if (command === "ffmpeg" && Array.isArray(args)) {
			onFfmpeg?.({ outputPattern: args.at(-1) as string });
		}
		return { stdout, stderr: "" };
	});
}

describe("frame-extractor", () => {
	it("parses ffprobe fps, duration, and total frame count", async () => {
		const execFileMock = makeExecFileMock({
			stdout: JSON.stringify({
				streams: [{ r_frame_rate: "30000/1001", duration: "10.01" }],
				format: { duration: "10.01" },
			}),
		});

		const meta = await probeVideoMeta({
			input: "video.mp4",
			execFileAsyncFn: execFileMock,
		});

		expect(meta.fps).toBeCloseTo(29.97, 2);
		expect(meta.durationSeconds).toBe(10.01);
		expect(meta.totalFrames).toBe(300);
		expect(execFileMock).toHaveBeenCalledWith(
			"ffprobe",
			expect.arrayContaining(["-of", "json", "video.mp4"])
		);
	});

	it("extracts deterministic keyframe metadata from generated JPEG names", async () => {
		const outputDir = await mkdtemp(path.join(os.tmpdir(), "qcut-frames-"));
		const execFileMock = makeExecFileMock({
			stdout: "",
			onFfmpeg: ({ outputPattern }) => {
				const framesDir = path.dirname(outputPattern);
				mkdirSync(framesDir, { recursive: true });
				writeFileSync(path.join(framesDir, "frame-000001.jpg"), "a");
				writeFileSync(path.join(framesDir, "frame-000002.jpg"), "b");
			},
		});

		const keyframes = await extractKeyframes({
			input: "video.mp4",
			fps: 1,
			sceneDetect: false,
			outputDir,
			videoFps: 30,
			execFileAsyncFn: execFileMock,
		});

		expect(keyframes).toEqual([
			{
				index: 0,
				frameNumber: 0,
				timeSeconds: 0,
				path: path.join(outputDir, "consistency-frames", "frame-000001.jpg"),
			},
			{
				index: 1,
				frameNumber: 30,
				timeSeconds: 1,
				path: path.join(outputDir, "consistency-frames", "frame-000002.jpg"),
			},
		]);
		expect(execFileMock).toHaveBeenCalledWith(
			"ffmpeg",
			expect.arrayContaining(["-vf", expect.stringContaining("fps=1")])
		);
	});

	it("builds a scene-detect filter", () => {
		expect(
			frameExtractorInternals.buildVideoFilter({
				fps: 1,
				sceneDetect: true,
				maxLongEdge: 768,
			})
		).toContain("select='gt(scene,0.4)'");
	});
});
