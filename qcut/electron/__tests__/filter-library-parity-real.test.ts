import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_MEDIA_COLOR_SETTINGS } from "../../apps/web/src/lib/color/color-properties";
import { transformColorPixel } from "../../apps/web/src/lib/color/color-pixel-processor";
import { FILTER_PRESETS } from "../../apps/web/src/lib/filters/filter-registry";
import { resolveColorFilterSettings } from "../../apps/web/src/lib/filters/filter-resolver";
import { buildAdjustmentFilter } from "../ffmpeg-video-transform";
import type { VideoVisual } from "../ffmpeg/types";

const ffmpegPath = resolve(
	__dirname,
	"../resources/ffmpeg/darwin-arm64/ffmpeg"
);

function renderRgbSamples({
	input,
	filter,
}: {
	input: Buffer;
	filter?: string;
}): Buffer {
	const args = [
		"-hide_banner",
		"-loglevel",
		"error",
		"-f",
		"rawvideo",
		"-pixel_format",
		"rgb24",
		"-video_size",
		"3x1",
		"-framerate",
		"1",
		"-i",
		"pipe:0",
	];
	if (filter) args.push("-vf", filter);
	args.push("-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1");
	const result = spawnSync(ffmpegPath, args, { input, maxBuffer: 1024 * 1024 });
	if (result.status !== 0) {
		throw new Error(result.stderr.toString());
	}
	return result.stdout;
}

describe.skipIf(!existsSync(ffmpegPath))(
	"filter library browser/native parity",
	// Real ffmpeg renders regularly exceed the 5s default testTimeout on CI runners.
	{ timeout: 60_000 },
	() => {
		const input = Buffer.from([38, 82, 146, 196, 112, 58, 222, 205, 178]);
		let baseline: Buffer;

		beforeAll(() => {
			baseline = renderRgbSamples({ input });
		});

		it.each(
			FILTER_PRESETS
		)("keeps $id within six channel levels across renderers", (preset) => {
			const resolved = resolveColorFilterSettings({
				settings: {
					...structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS),
					filter: {
						presetId: preset.id,
						presetVersion: preset.version,
						intensity: preset.defaultIntensity,
					},
				},
			});
			const color = {
				...resolved,
				basic: {
					...resolved.basic,
					grain: 0,
					sharpness: 0,
					vignette: 0,
				},
			};
			const visual = {
				adjustments: {
					brightness: 0,
					contrast: 0,
					saturation: 0,
					temperature: 0,
					tint: 0,
					sharpness: 0,
					fade: 0,
					vignette: 0,
				},
				color,
				keyframeFps: 30,
			} as VideoVisual;
			const native = renderRgbSamples({
				input,
				filter: buildAdjustmentFilter(visual),
			});

			for (let pixel = 0; pixel < 3; pixel += 1) {
				const offset = pixel * 3;
				const browser = transformColorPixel({
					color: {
						r: baseline[offset] / 255,
						g: baseline[offset + 1] / 255,
						b: baseline[offset + 2] / 255,
					},
					settings: color,
				});
				const expected = [browser.r, browser.g, browser.b].map((channel) =>
					Math.round(channel * 255)
				);
				for (let channel = 0; channel < 3; channel += 1) {
					expect(
						Math.abs(native[offset + channel] - expected[channel]),
						`${preset.id} pixel ${pixel} channel ${channel}`
					).toBeLessThanOrEqual(6);
				}
			}
		});
	}
);
