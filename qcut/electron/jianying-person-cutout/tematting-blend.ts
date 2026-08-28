import type { PersonCutoutModelRoute } from "./mask-cache.js";
import {
	JIANYING_BACH_VIDEO_OBJECT_PERSON_CUTOUT_PIPELINE,
	type PersonCutoutPipelineDescriptor,
} from "./pipeline-descriptor.js";

export const TEMATTING_COMPATIBLE_BLEND = "TEMattingBlendEffectV2-compatible";
export const TEMATTING_NATIVE_METAL_CANARY =
	"TEMattingBlendEffectV2-native-metal-canary";
export const TEMATTING_VENDOR_V2_EXACT_BLEND =
	"TEMattingBlendEffectV2-vendor-exact";

export type TemattingBlendImplementation =
	| typeof TEMATTING_NATIVE_METAL_CANARY
	| typeof TEMATTING_COMPATIBLE_BLEND;
export type TemattingOutputBlendImplementation =
	| typeof TEMATTING_COMPATIBLE_BLEND
	| typeof TEMATTING_VENDOR_V2_EXACT_BLEND;

export type TemattingNativeMetalCanaryStatus =
	| "failed-fallback"
	| "not-run"
	| "passed";

export function resolveTemattingOutputProvenance({
	completedImplementation,
	pipelineDescriptor,
	preferredImplementation,
}: {
	completedImplementation: TemattingBlendImplementation;
	pipelineDescriptor?: PersonCutoutPipelineDescriptor;
	preferredImplementation: TemattingBlendImplementation;
}) {
	const blendImplementation = resolveTemattingOutputBlendImplementation({
		pipelineDescriptor,
	});
	if (completedImplementation === TEMATTING_NATIVE_METAL_CANARY) {
		return {
			blendImplementation,
			nativeMetalCanary: "passed" as const,
		};
	}
	return {
		blendImplementation,
		nativeMetalCanary:
			preferredImplementation === TEMATTING_NATIVE_METAL_CANARY
				? ("failed-fallback" as const)
				: ("not-run" as const),
	};
}

export function resolveTemattingOutputBlendImplementation({
	pipelineDescriptor,
}: {
	pipelineDescriptor?: PersonCutoutPipelineDescriptor;
}): TemattingOutputBlendImplementation {
	return pipelineDescriptor?.pipelineId ===
		JIANYING_BACH_VIDEO_OBJECT_PERSON_CUTOUT_PIPELINE.pipelineId
		? TEMATTING_VENDOR_V2_EXACT_BLEND
		: TEMATTING_COMPATIBLE_BLEND;
}

export function buildTemattingTransparentBlendFilter() {
	return "[0:v:0][1:v:0]alphamerge,format=yuva420p[cutout]";
}

export function buildTemattingOutputMetadata({
	implementation,
	modelName = "tt_matting_video_gru_v1.0",
	modelRoute = "portrait-gru",
	nativeMetalCanary,
	pipelineDescriptor,
}: {
	implementation: TemattingBlendImplementation;
	modelName?: string;
	modelRoute?: PersonCutoutModelRoute;
	nativeMetalCanary?: TemattingNativeMetalCanaryStatus;
	pipelineDescriptor?: PersonCutoutPipelineDescriptor;
}) {
	const resolvedNativeMetalCanary =
		nativeMetalCanary ??
		(implementation === TEMATTING_NATIVE_METAL_CANARY ? "passed" : "not-run");
	const outputBlendImplementation = resolveTemattingOutputBlendImplementation({
		pipelineDescriptor,
	});
	const metadata = [
		"-metadata:s:v:0",
		`qcut_matting_blend=${outputBlendImplementation}`,
		"-metadata:s:v:0",
		`qcut_matting_model=${modelName}`,
		"-metadata:s:v:0",
		`qcut_matting_route=${modelRoute}`,
	];
	if (resolvedNativeMetalCanary !== "not-run") {
		metadata.push(
			"-metadata:s:v:0",
			`qcut_matting_native_canary=${resolvedNativeMetalCanary}`
		);
	}
	if (!pipelineDescriptor) return metadata;
	return [
		...metadata,
		"-metadata:s:v:0",
		`qcut_matting_provider=${pipelineDescriptor.providerId}`,
		"-metadata:s:v:0",
		`qcut_matting_pipeline=${pipelineDescriptor.pipelineId}`,
		"-metadata:s:v:0",
		`qcut_matting_refinement=${pipelineDescriptor.refinementProvider}`,
	];
}
