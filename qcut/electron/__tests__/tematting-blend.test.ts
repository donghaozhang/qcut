import { describe, expect, it } from "vitest";
import {
	buildTemattingOutputMetadata,
	buildTemattingTransparentBlendFilter,
	resolveTemattingOutputBlendImplementation,
	resolveTemattingOutputProvenance,
	TEMATTING_COMPATIBLE_BLEND,
	TEMATTING_NATIVE_METAL_CANARY,
	TEMATTING_VENDOR_V2_EXACT_BLEND,
} from "../jianying-person-cutout/tematting-blend.js";
import {
	GRU_VISION_PERSON_CUTOUT_PIPELINE,
	JIANYING_BACH_VIDEO_OBJECT_PERSON_CUTOUT_PIPELINE,
	JIANYING_BACH_VIDEO_OBJECT_REFINED_PERSON_CUTOUT_PIPELINE,
	VIDEO_OBJECT_PERSON_CUTOUT_PIPELINE,
} from "../jianying-person-cutout/pipeline-descriptor.js";

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

	it("records Metal as a canary while keeping output provenance compatible", () => {
		expect(
			buildTemattingOutputMetadata({
				implementation: TEMATTING_NATIVE_METAL_CANARY,
			})
		).toEqual([
			"-metadata:s:v:0",
			"qcut_matting_blend=TEMattingBlendEffectV2-compatible",
			"-metadata:s:v:0",
			"qcut_matting_model=tt_matting_video_gru_v1.0",
			"-metadata:s:v:0",
			"qcut_matting_route=portrait-gru",
			"-metadata:s:v:0",
			"qcut_matting_native_canary=passed",
		]);
	});

	it("separates completed output provenance from the canary attempt", () => {
		expect(
			resolveTemattingOutputProvenance({
				completedImplementation: TEMATTING_NATIVE_METAL_CANARY,
				preferredImplementation: TEMATTING_NATIVE_METAL_CANARY,
			})
		).toEqual({
			blendImplementation: TEMATTING_COMPATIBLE_BLEND,
			nativeMetalCanary: "passed",
		});
		expect(
			resolveTemattingOutputProvenance({
				completedImplementation: TEMATTING_COMPATIBLE_BLEND,
				preferredImplementation: TEMATTING_NATIVE_METAL_CANARY,
			})
		).toEqual({
			blendImplementation: TEMATTING_COMPATIBLE_BLEND,
			nativeMetalCanary: "failed-fallback",
		});
		expect(
			buildTemattingOutputMetadata({
				implementation: TEMATTING_COMPATIBLE_BLEND,
				nativeMetalCanary: "failed-fallback",
			})
		).toContain("qcut_matting_native_canary=failed-fallback");
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

	it("records the actual QCut pipeline without claiming full Jianying hosting", () => {
		expect(
			buildTemattingOutputMetadata({
				implementation: TEMATTING_COMPATIBLE_BLEND,
				pipelineDescriptor: GRU_VISION_PERSON_CUTOUT_PIPELINE,
			})
		).toEqual(
			expect.arrayContaining([
				"qcut_matting_provider=qcut-local-person-matting-v1",
				"qcut_matting_pipeline=qcut-gru-vision-fusion-v1",
				"qcut_matting_refinement=qcut-portrait-temporal-border-refinement-v1",
			])
		);
	});

	it("reports vendor V2 only for the exact Bach output", () => {
		expect(
			resolveTemattingOutputBlendImplementation({
				pipelineDescriptor: JIANYING_BACH_VIDEO_OBJECT_PERSON_CUTOUT_PIPELINE,
			})
		).toBe(TEMATTING_VENDOR_V2_EXACT_BLEND);
		for (const pipelineDescriptor of [
			JIANYING_BACH_VIDEO_OBJECT_REFINED_PERSON_CUTOUT_PIPELINE,
			VIDEO_OBJECT_PERSON_CUTOUT_PIPELINE,
			GRU_VISION_PERSON_CUTOUT_PIPELINE,
		]) {
			expect(
				resolveTemattingOutputBlendImplementation({ pipelineDescriptor })
			).toBe(TEMATTING_COMPATIBLE_BLEND);
		}
		expect(
			buildTemattingOutputMetadata({
				implementation: TEMATTING_COMPATIBLE_BLEND,
				pipelineDescriptor: JIANYING_BACH_VIDEO_OBJECT_PERSON_CUTOUT_PIPELINE,
			})
		).toContain("qcut_matting_blend=TEMattingBlendEffectV2-vendor-exact");
		expect(
			resolveTemattingOutputProvenance({
				completedImplementation: TEMATTING_COMPATIBLE_BLEND,
				pipelineDescriptor: JIANYING_BACH_VIDEO_OBJECT_PERSON_CUTOUT_PIPELINE,
				preferredImplementation: TEMATTING_COMPATIBLE_BLEND,
			})
		).toEqual({
			blendImplementation: TEMATTING_VENDOR_V2_EXACT_BLEND,
			nativeMetalCanary: "not-run",
		});
	});
});
