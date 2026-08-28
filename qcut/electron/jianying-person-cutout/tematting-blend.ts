import type { PersonCutoutModelRoute } from "./mask-cache.js";

export const TEMATTING_NATIVE_METAL_BLEND =
	"TEMattingBlendEffectV2-native-metal";
export const TEMATTING_COMPATIBLE_BLEND = "TEMattingBlendEffectV2-compatible";

export type TemattingBlendImplementation =
	| typeof TEMATTING_NATIVE_METAL_BLEND
	| typeof TEMATTING_COMPATIBLE_BLEND;

export function buildTemattingTransparentBlendFilter() {
	return "[0:v:0][1:v:0]alphamerge,format=yuva420p[cutout]";
}

export function buildTemattingOutputMetadata({
	implementation,
	modelName = "tt_matting_video_gru_v1.0",
	modelRoute = "portrait-gru",
}: {
	implementation: TemattingBlendImplementation;
	modelName?: string;
	modelRoute?: PersonCutoutModelRoute;
}) {
	return [
		"-metadata:s:v:0",
		`qcut_matting_blend=${implementation}`,
		"-metadata:s:v:0",
		`qcut_matting_model=${modelName}`,
		"-metadata:s:v:0",
		`qcut_matting_route=${modelRoute}`,
	];
}
