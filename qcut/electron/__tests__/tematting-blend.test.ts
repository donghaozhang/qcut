import { describe, expect, it } from "vitest";
import {
	buildTemattingOutputMetadata,
	buildTemattingTransparentBlendFilter,
	TEMATTING_COMPATIBLE_BLEND,
	TEMATTING_NATIVE_METAL_BLEND,
} from "../jianying-person-cutout/tematting-blend.js";

describe("TEMattingBlendEffectV2-compatible output", () => {
	it("keeps the GRU alpha as the transparent blend mask", () => {
		expect(buildTemattingTransparentBlendFilter()).toBe(
			"[0:v:0][1:v:0]alphamerge,format=yuva420p[cutout]"
		);
		expect(buildTemattingTransparentBlendFilter()).not.toContain("premultiply");
	});

	it("marks outputs with the exact model and blend implementation", () => {
		expect(TEMATTING_COMPATIBLE_BLEND).toBe(
			"TEMattingBlendEffectV2-compatible"
		);
		expect(
			buildTemattingOutputMetadata({
				implementation: TEMATTING_COMPATIBLE_BLEND,
			})
		).toEqual([
			"-metadata:s:v:0",
			"qcut_matting_blend=TEMattingBlendEffectV2-compatible",
			"-metadata:s:v:0",
			"qcut_matting_model=tt_matting_video_gru_v1.0",
			"-metadata:s:v:0",
			"qcut_matting_route=portrait-gru",
		]);
	});

	it("records native Metal output without changing the model identity", () => {
		expect(
			buildTemattingOutputMetadata({
				implementation: TEMATTING_NATIVE_METAL_BLEND,
			})
		).toEqual([
			"-metadata:s:v:0",
			"qcut_matting_blend=TEMattingBlendEffectV2-native-metal",
			"-metadata:s:v:0",
			"qcut_matting_model=tt_matting_video_gru_v1.0",
			"-metadata:s:v:0",
			"qcut_matting_route=portrait-gru",
		]);
	});

	it("records the saliency graph identity without exposing it in the UI", () => {
		expect(
			buildTemattingOutputMetadata({
				implementation: TEMATTING_COMPATIBLE_BLEND,
				modelName: "saliency_script_for_cc_v1.2",
				modelRoute: "saliency-script",
			})
		).toEqual([
			"-metadata:s:v:0",
			"qcut_matting_blend=TEMattingBlendEffectV2-compatible",
			"-metadata:s:v:0",
			"qcut_matting_model=saliency_script_for_cc_v1.2",
			"-metadata:s:v:0",
			"qcut_matting_route=saliency-script",
		]);
	});
});
