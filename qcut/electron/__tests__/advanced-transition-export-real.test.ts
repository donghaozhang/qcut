import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildXfadeTransitionFilter } from "../ffmpeg/transition-filter";
import { getFFmpegPath } from "../ffmpeg/paths";
import type { VideoTransition } from "../ffmpeg/types";

const ADVANCED_TRANSITION_TYPES = [
	"motion-blur",
	"pixelate",
	"water-ripple",
	"particle-dissolve",
	"glass-refraction",
	"page-flip",
	"texture-mask",
	"lens-flare",
] as const satisfies readonly VideoTransition["type"][];

function resolveFFmpegPath(): string | null {
	try {
		const binary = getFFmpegPath();
		return existsSync(binary) ? binary : null;
	} catch {
		return null;
	}
}

function transition({
	type,
}: {
	type: VideoTransition["type"];
}): VideoTransition {
	return {
		id: `real-${type}`,
		trackId: "track",
		fromElementId: "from",
		toElementId: "to",
		presetId: type,
		type,
		direction: "left",
		easing: "easeInOut",
		duration: 0.4,
		tuning: { intensity: 1.1, frequency: 1.3, tint: "#ffd6a1" },
	};
}

const ffmpegPath = resolveFFmpegPath();

describe.skipIf(!ffmpegPath)(
	"advanced transition real FFmpeg exports",
	{ timeout: 30_000 },
	() => {
		it.each(ADVANCED_TRANSITION_TYPES)("renders %s", (type) => {
			if (!ffmpegPath) throw new Error("FFmpeg unavailable");
			const { expression } = buildXfadeTransitionFilter({
				transition: transition({ type }),
			});
			const filterGraph =
				`[0:v][1:v]xfade=transition=custom:duration=0.4:offset=0.2:` +
				`expr='${expression}',format=yuv420p[out]`;
			const result = spawnSync(
				ffmpegPath,
				[
					"-v",
					"error",
					"-f",
					"lavfi",
					"-i",
					"testsrc2=s=96x54:r=10:d=0.8",
					"-f",
					"lavfi",
					"-i",
					"smptebars=s=96x54:r=10:d=0.8",
					"-filter_complex",
					filterGraph,
					"-map",
					"[out]",
					"-f",
					"null",
					"-",
				],
				{ encoding: "utf8", timeout: 15_000 }
			);

			expect(result.status, result.stderr).toBe(0);
		});
	}
);
