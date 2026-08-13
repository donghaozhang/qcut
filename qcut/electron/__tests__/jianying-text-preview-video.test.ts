import { describe, expect, it } from "vitest";
import { jianyingTextPreviewVideoTestUtils } from "../jianying-text-runtime/preview-video.js";

function metadata({
	codec = "vp9",
	width = 640,
	height = 360,
	frameRate = "12/1",
	alphaMode = "1",
	duration = "2.000000",
}: {
	codec?: string;
	width?: number;
	height?: number;
	frameRate?: string;
	alphaMode?: string;
	duration?: string;
} = {}) {
	return {
		streams: [
			{
				codec_name: codec,
				width,
				height,
				avg_frame_rate: frameRate,
				tags: { alpha_mode: alphaMode },
			},
		],
		format: { duration },
	};
}

function matches({ value }: { value: ReturnType<typeof metadata> }) {
	return jianyingTextPreviewVideoTestUtils.previewMetadataMatches({
		metadata: value,
		frameCount: 24,
		fps: 12,
		width: 640,
		height: 360,
	});
}

describe("Jianying text preview video metadata", () => {
	it("accepts a complete alpha VP9 preview", () => {
		expect(matches({ value: metadata() })).toBe(true);
	});

	it.each([
		metadata({ codec: "h264" }),
		metadata({ width: 320 }),
		metadata({ frameRate: "24/1" }),
		metadata({ alphaMode: "0" }),
		metadata({ duration: "1.000000" }),
	])("rejects metadata that cannot represent the cached sequence", (value) => {
		expect(matches({ value })).toBe(false);
	});
});
