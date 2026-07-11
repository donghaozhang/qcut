import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildColorManagementFilters } from "../ffmpeg/color-management-filter";
import { DEFAULT_VIDEO_COLOR_SETTINGS } from "../ffmpeg/color-settings";

const ffmpegPath = path.resolve(
	__dirname,
	"../resources/ffmpeg/darwin-arm64/ffmpeg"
);

describe.skipIf(!fs.existsSync(ffmpegPath))(
	"Native color management filters",
	() => {
		it("renders every supported input transfer and output gamut", () => {
			const cases = [
				{ input: "srgb", output: "srgb" },
				{ input: "rec709", output: "rec709" },
				{ input: "display-p3", output: "display-p3" },
				{ input: "rec2020", output: "rec2020" },
				{ input: "logc3", output: "rec709" },
				{ input: "slog3", output: "rec709" },
				{ input: "vlog", output: "rec709" },
				{ input: "hlg", output: "hlg" },
				{ input: "pq", output: "pq" },
			] as const;

			for (const item of cases) {
				const color = structuredClone(DEFAULT_VIDEO_COLOR_SETTINGS);
				color.management = {
					enabled: true,
					inputSpace: item.input,
					workingSpace: "acescg",
					outputSpace: item.output,
					toneMapping: "aces",
					peakNits: 1_000,
				};
				const filters = buildColorManagementFilters({ color });
				const result = spawnSync(
					ffmpegPath,
					[
						"-hide_banner",
						"-v",
						"error",
						"-f",
						"lavfi",
						"-i",
						"testsrc2=s=64x64:d=0.1:r=10",
						"-vf",
						[...filters.input, ...filters.output].join(","),
						"-frames:v",
						"1",
						"-f",
						"null",
						"-",
					],
					{ encoding: "utf8", timeout: 30_000 }
				);
				expect(
					result.status,
					`${item.input} -> ${item.output}: ${result.stderr}`
				).toBe(0);
			}
		});

		it("normalizes HDR transfers by the configured peak luminance", () => {
			const color = structuredClone(DEFAULT_VIDEO_COLOR_SETTINGS);
			color.management = {
				enabled: true,
				inputSpace: "pq",
				workingSpace: "rec709-linear",
				outputSpace: "pq",
				toneMapping: "none",
				peakNits: 1_000,
			};
			const filters = buildColorManagementFilters({ color });
			expect(filters.input.join(",")).toContain("*10");
			expect(filters.output.join(",")).toContain("/10");
		});
	}
);
