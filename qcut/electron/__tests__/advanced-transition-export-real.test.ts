import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TRANSITION_PARITY_CASES } from "../../apps/web/src/components/editor/media-panel/views/transitions/transition-parity-ten";
import { prepareFFmpegFilterScript } from "../ffmpeg/filter-complex-script";
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
	direction = "left",
	maskShape,
	tuning = { intensity: 1.1, frequency: 1.3, tint: "#ffd6a1" },
}: {
	type: VideoTransition["type"];
	direction?: VideoTransition["direction"];
	maskShape?: VideoTransition["maskShape"];
	tuning?: VideoTransition["tuning"];
}): VideoTransition {
	return {
		id: `real-${type}`,
		trackId: "track",
		fromElementId: "from",
		toElementId: "to",
		presetId: type,
		type,
		direction,
		easing: "easeInOut",
		duration: 0.4,
		maskShape,
		tuning,
	};
}

const ffmpegPath = resolveFFmpegPath();

function buildTransitionArgs({ value }: { value: VideoTransition }): string[] {
	const { expression } = buildXfadeTransitionFilter({ transition: value });
	const filterGraph =
		"[0:v][1:v]xfade=transition=custom:duration=0.4:offset=0.2:" +
		`expr='${expression}',format=yuv420p[out]`;
	return [
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
	];
}

function renderTransition({ value }: { value: VideoTransition }) {
	if (!ffmpegPath) throw new Error("FFmpeg unavailable");
	return spawnSync(ffmpegPath, buildTransitionArgs({ value }), {
		encoding: "utf8",
		timeout: 15_000,
	});
}

function renderTransitionWithFilterScript({
	value,
}: {
	value: VideoTransition;
}) {
	if (!ffmpegPath) throw new Error("FFmpeg unavailable");
	const prepared = prepareFFmpegFilterScript({
		executablePath: ffmpegPath,
		args: buildTransitionArgs({ value }),
		commandLengthThreshold: 1,
	});
	try {
		return spawnSync(ffmpegPath, prepared.args, {
			encoding: "utf8",
			timeout: 15_000,
		});
	} finally {
		prepared.cleanup();
	}
}

function renderSolidTransitionFrame({
	value,
	frameIndex,
}: {
	value: VideoTransition;
	frameIndex: number;
}) {
	if (!ffmpegPath) throw new Error("FFmpeg unavailable");
	const { expression } = buildXfadeTransitionFilter({ transition: value });
	const filterGraph =
		"[0:v][1:v]xfade=transition=custom:duration=0.4:offset=0.2:" +
		`expr='${expression}',format=rgb24,select='eq(n,${frameIndex})'[out]`;
	return spawnSync(
		ffmpegPath,
		[
			"-v",
			"error",
			"-f",
			"lavfi",
			"-i",
			"color=c=red:s=100x10:r=10:d=0.8",
			"-f",
			"lavfi",
			"-i",
			"color=c=blue:s=100x10:r=10:d=0.8",
			"-filter_complex",
			filterGraph,
			"-map",
			"[out]",
			"-frames:v",
			"1",
			"-f",
			"rawvideo",
			"-pix_fmt",
			"rgb24",
			"-",
		],
		{ encoding: null, timeout: 15_000 }
	);
}

describe.skipIf(!ffmpegPath)(
	"advanced transition real FFmpeg exports",
	{ timeout: 30_000 },
	() => {
		it.each(ADVANCED_TRANSITION_TYPES)("renders %s", (type) => {
			const result = renderTransition({ value: transition({ type }) });

			expect(result.status, result.stderr).toBe(0);
		});

		it("renders a transition through filter_complex_script", () => {
			const result = renderTransitionWithFilterScript({
				value: transition({ type: "page-flip" }),
			});

			expect(result.status, result.stderr).toBe(0);
		});

		it("keeps page-flip endpoint pixels unmodified", () => {
			const value = transition({
				type: "page-flip",
				direction: "left",
				tuning: { intensity: 0.7 },
			});
			const first = renderSolidTransitionFrame({ value, frameIndex: 2 });
			const last = renderSolidTransitionFrame({ value, frameIndex: 6 });

			expect(first.status, first.stderr.toString()).toBe(0);
			expect(last.status, last.stderr.toString()).toBe(0);
			expect(first.stdout).toHaveLength(100 * 10 * 3);
			expect(last.stdout).toHaveLength(100 * 10 * 3);
			for (let offset = 0; offset < first.stdout.length; offset += 3) {
				expect(first.stdout[offset]).toBeGreaterThanOrEqual(253);
				expect(first.stdout[offset + 1]).toBeLessThanOrEqual(1);
				expect(first.stdout[offset + 2]).toBeLessThanOrEqual(1);
				expect(last.stdout[offset]).toBeLessThanOrEqual(1);
				expect(last.stdout[offset + 1]).toBeLessThanOrEqual(1);
				expect(last.stdout[offset + 2]).toBeGreaterThanOrEqual(254);
			}
		});

		it.each(TRANSITION_PARITY_CASES)("renders exact-ten $jianyingName", ({
			qcutPresetId,
			expectedConfig,
		}) => {
			const result = renderTransition({
				value: {
					...transition({
						type: expectedConfig.type,
						direction: expectedConfig.direction,
						maskShape: expectedConfig.maskShape,
						tuning: expectedConfig.tuning,
					}),
					id: `real-${qcutPresetId}`,
					presetId: qcutPresetId,
				},
			});

			expect(result.status, result.stderr).toBe(0);
		});
	}
);
