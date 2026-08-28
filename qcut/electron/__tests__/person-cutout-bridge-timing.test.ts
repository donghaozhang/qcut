import { describe, expect, it } from "vitest";
import { parsePersonCutoutBridgeTiming } from "../jianying-person-cutout/bridge-timing.js";

const validTiming = {
	schema: 1,
	frames: 60,
	total_us: 2_010_000,
	wall_us: 2_010_000,
	setup_us: 100_000,
	processing_us: 1_900_000,
	teardown_us: 10_000,
	input_read_us: 20_000,
	rgba_to_bgr_us: 15_000,
	gru_infer_us: 700_000,
	alpha_resize_us: 10_000,
	vision_infer_us: 800_000,
	postprocess_us: 100_000,
	native_validation_us: 25_000,
	native_canary_us: 25_000,
	cache_write_us: 5_000,
	output_flush_us: 1_000,
	native_validation_frames: 1,
	native_canary_frames: 1,
};

describe("person cutout bridge timing", () => {
	it("parses one versioned timing record", () => {
		expect(
			parsePersonCutoutBridgeTiming({
				line: `qcut-person-cutout-timing ${JSON.stringify(validTiming)}`,
			})
		).toEqual({
			alphaResizeMicros: 10_000,
			cacheWriteMicros: 5_000,
			frameCount: 60,
			gruInferenceMicros: 700_000,
			inputReadMicros: 20_000,
			nativeCanaryFrames: 1,
			nativeCanaryMicros: 25_000,
			outputFlushMicros: 1_000,
			postprocessMicros: 100_000,
			processingMicros: 1_900_000,
			rgbaToBgrMicros: 15_000,
			setupMicros: 100_000,
			teardownMicros: 10_000,
			totalMicros: 2_010_000,
			visionInferenceMicros: 800_000,
			wallMicros: 2_010_000,
		});
	});

	it("keeps parsing the version-one timing aliases", () => {
		expect(
			parsePersonCutoutBridgeTiming({
				line: `qcut-person-cutout-timing ${JSON.stringify({
					...validTiming,
					native_canary_frames: undefined,
					native_canary_us: undefined,
					output_flush_us: undefined,
					teardown_us: undefined,
					wall_us: undefined,
				})}`,
			})
		).toMatchObject({
			nativeCanaryFrames: 1,
			nativeCanaryMicros: 25_000,
			outputFlushMicros: 0,
			teardownMicros: 0,
			wallMicros: 2_010_000,
		});
	});

	it("rejects unrelated, malformed, and impossible timing records", () => {
		expect(
			parsePersonCutoutBridgeTiming({ line: "progress frame=1 total=2" })
		).toBeNull();
		expect(
			parsePersonCutoutBridgeTiming({ line: "qcut-person-cutout-timing {" })
		).toBeNull();
		expect(
			parsePersonCutoutBridgeTiming({
				line: `qcut-person-cutout-timing ${JSON.stringify({
					...validTiming,
					processing_us: 2_010_001,
				})}`,
			})
		).toBeNull();
	});
});
