import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const electronMock = vi.hoisted(() => ({ userDataPath: "" }));

vi.mock("electron", () => ({
	app: {
		getPath: () => electronMock.userDataPath,
	},
}));

import { getVideoPreviewProxyPath } from "../ffmpeg/video-preview-proxy-cache";
import { renderVideoPreviewProxy } from "../ffmpeg/video-preview-proxy";
import type { VideoPreviewProxyOptions } from "../ffmpeg/types";

const ffmpegPath = path.resolve(
	__dirname,
	"../resources/ffmpeg/darwin-arm64/ffmpeg"
);
const ffprobePath = path.resolve(
	__dirname,
	"../resources/ffmpeg/darwin-arm64/ffprobe"
);
const tempDir = path.resolve(__dirname, "../../.tmp/video-preview-proxy-real");
const sourcePath = path.join(tempDir, "source.mp4");

function run({ binary, args }: { binary: string; args: string[] }) {
	const result = spawnSync(binary, args, {
		encoding: "utf8",
		timeout: 60_000,
		maxBuffer: 16 * 1024 * 1024,
	});
	if (result.status !== 0) {
		throw new Error(result.stderr || `${binary} exited ${result.status}`);
	}
	return result.stdout;
}

function proxyOptions({
	requestId,
}: {
	requestId: string;
}): VideoPreviewProxyOptions {
	return {
		requestId,
		sourcePath,
		sourceStart: 0.3,
		sourceDuration: 1.2,
		width: 160,
		height: 90,
		fps: 30,
		enhancements: {
			stabilization: 15,
			denoise: 20,
			clarity: 30,
			upscale: 1,
			relight: 10,
			beauty: 5,
		},
	};
}

beforeAll(() => {
	fs.rmSync(tempDir, { recursive: true, force: true });
	fs.mkdirSync(tempDir, { recursive: true });
	electronMock.userDataPath = tempDir;
	run({
		binary: ffmpegPath,
		args: [
			"-y",
			"-v",
			"error",
			"-f",
			"lavfi",
			"-i",
			"testsrc2=size=320x180:rate=30:duration=2",
			"-f",
			"lavfi",
			"-i",
			"sine=frequency=440:sample_rate=48000:duration=2",
			"-shortest",
			"-c:v",
			"libx264",
			"-preset",
			"ultrafast",
			"-pix_fmt",
			"yuv420p",
			"-c:a",
			"aac",
			sourcePath,
		],
	});
});

afterAll(() => {
	fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("video preview proxy real FFmpeg", () => {
	it("renders a playable cached proxy with progress and audio", async () => {
		const progress: number[] = [];
		const first = await renderVideoPreviewProxy({
			options: proxyOptions({ requestId: "real-first" }),
			onProgress: (event) => progress.push(event.progress),
		});
		const proxyPath = getVideoPreviewProxyPath({ cacheKey: first.cacheKey });
		const probe = JSON.parse(
			run({
				binary: ffprobePath,
				args: [
					"-v",
					"error",
					"-show_entries",
					"stream=codec_type,width,height:format=duration",
					"-of",
					"json",
					proxyPath,
				],
			})
		) as {
			streams: Array<{ codec_type: string; width?: number; height?: number }>;
			format: { duration: string };
		};
		const video = probe.streams.find((stream) => stream.codec_type === "video");

		expect(first).toMatchObject({
			cacheHit: false,
			sourceStart: 0.3,
			duration: 1.2,
			width: 160,
			height: 90,
		});
		expect(first.proxyUrl).toBe(
			`app://video-preview-proxy/${first.cacheKey}.mp4`
		);
		expect(video).toMatchObject({ width: 160, height: 90 });
		expect(probe.streams.some((stream) => stream.codec_type === "audio")).toBe(
			true
		);
		expect(Number(probe.format.duration)).toBeCloseTo(1.2, 1);
		expect(progress[0]).toBe(0);
		expect(progress.at(-1)).toBe(1);

		const cached = await renderVideoPreviewProxy({
			options: proxyOptions({ requestId: "real-cached" }),
		});
		expect(cached.cacheHit).toBe(true);
		expect(cached.cacheKey).toBe(first.cacheKey);
	});
});
