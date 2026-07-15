import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { buildVideoFramePreviewCommand } from "../ffmpeg/video-frame-preview";
import type { VideoFramePreviewOptions } from "../ffmpeg/types";

const tempDir = path.resolve(__dirname, "../../.tmp/video-frame-preview-unit");
const sourcePath = path.join(tempDir, "source.mp4");

function previewOptions({
	overrides = {},
}: {
	overrides?: Partial<VideoFramePreviewOptions>;
} = {}): VideoFramePreviewOptions {
	return {
		requestId: "request-1",
		sourcePath,
		sourceTime: 1.234,
		width: 640,
		height: 360,
		fps: 30,
		fitMode: "cover",
		enhancements: {
			stabilization: 50,
			denoise: 0,
			clarity: 20,
			upscale: 1,
			relight: 0,
			beauty: 0,
		},
		...overrides,
	};
}

describe("video frame preview command", () => {
	beforeAll(() => {
		fs.mkdirSync(tempDir, { recursive: true });
		fs.writeFileSync(sourcePath, "fixture");
	});

	afterAll(() => fs.rmSync(tempDir, { recursive: true, force: true }));

	it("uses temporal preroll and the shared export filters", () => {
		const command = buildVideoFramePreviewCommand({
			options: previewOptions(),
		});
		expect(command.sourceTime).toBe(37 / 30);
		expect(command.args).toContain(String(37 / 30 - 0.5));
		const filter = command.args[command.args.indexOf("-vf") + 1];
		expect(filter).toContain("force_original_aspect_ratio=increase");
		expect(filter).toContain("deshake=rx=32:ry=32:edge=mirror");
		expect(filter).toContain("unsharp=5:5:0.4");
		expect(filter).toContain("trim=start=0.5:duration=");
	});

	it("skips preroll for spatial-only enhancement", () => {
		const command = buildVideoFramePreviewCommand({
			options: previewOptions({
				overrides: {
					sourceTime: 0.4,
					enhancements: {
						stabilization: 0,
						denoise: 0,
						clarity: 50,
						upscale: 1,
						relight: 0,
						beauty: 0,
					},
				},
			}),
		});
		expect(command.args[command.args.indexOf("-ss") + 1]).toBe("0.4");
		expect(command.args[command.args.indexOf("-vf") + 1]).toContain(
			"trim=start=0:duration="
		);
	});

	it("rejects unsafe dimensions and missing sources", () => {
		expect(() =>
			buildVideoFramePreviewCommand({
				options: previewOptions({ overrides: { width: 0 } }),
			})
		).toThrow(/width/);
		expect(() =>
			buildVideoFramePreviewCommand({
				options: previewOptions({
					overrides: { sourcePath: path.join(tempDir, "missing.mp4") },
				}),
			})
		).toThrow(/not found/);
	});
});
