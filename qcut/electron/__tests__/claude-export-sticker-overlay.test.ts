import { describe, expect, it } from "vitest";
import { buildStickerOverlayPass } from "../claude/handlers/claude-export-handler/sticker-overlay.js";

describe("native export sticker overlays", () => {
	it("loops static sticker inputs with the supported FFmpeg option", () => {
		const pass = buildStickerOverlayPass({
			inputPath: "/tmp/source.mp4",
			outputPath: "/tmp/output.mp4",
			stickerOverlays: [
				{
					mediaId: "sticker-media",
					sourcePath: "/tmp/approved-check.png",
					startTime: 6,
					endTime: 9,
					x: 1477.2,
					y: 151.2,
					width: 194.4,
					height: 194.4,
					opacity: 1,
					rotation: 0,
				},
			],
			codec: "libx264",
			bitrate: "8000k",
		});

		expect(pass.args).toContain("-stream_loop");
		expect(pass.args).not.toContain("-loop");
		expect(pass.args).toEqual(
			expect.arrayContaining([
				"-stream_loop",
				"-1",
				"-t",
				"9",
				"-i",
				"/tmp/approved-check.png",
			])
		);
		expect(pass.filterComplex).toContain(
			"overlay=x=1477.2:y=151.2:enable='between(t,6,9)'"
		);
	});
});
