/**
 * Text-to-Video Model Order & Aliases
 */

import {
	validateAliasMapTargetsExist,
	validateModelOrderInvariant,
} from "../model-config-validation";
import { T2V_MODELS, type T2VModelId } from "./models";

/**
 * Priority order for displaying T2V models in the UI.
 * Models are ordered by quality/capability (highest first) to guide user selection.
 */
export const T2V_MODEL_ORDER: readonly T2VModelId[] = [
	// Badged picks — always on top
	"sora2_text_to_video_pro", // ⭐ Recommended
	"ltxv2_fast_t2v", // ⚡ Fast
	"wan_26_t2v", // 💰 Budget
	"kling_v3_standard_t2v", // 🎼 Cinematic
	// Everything else
	"kling_v3_pro_t2v",
	"kling_v26_pro_t2v",
	"veo31_text_to_video",
	"ltx23_pro_t2v",
	"ltx23_fast_t2v",
	"ltxv2_pro_t2v",
	"hailuo23_pro_t2v",
	"veo31_fast_text_to_video",
	"veo31_lite_text_to_video",
	"seedance_pro",
	"sora2_text_to_video",
	"hailuo23_standard_t2v",
	"kling_v2_5_turbo",
	"kling_v2_5_turbo_standard",
	"seedance",
	"vidu_q3_t2v",
	"wan_25_preview",
	// GMI Cloud
	"gmi_veo31_lite_t2v",
	"gmi_skyreels_v4_t2v",
	"gmi_kling_v3_t2v",
	"gmi_kling_v3_omni_t2v",
	// Runway
	"runway_gen45_t2v",
	"runway_gen4_turbo_t2v",
] as const;

/**
 * Maps legacy/alternative AI model IDs to canonical T2VModelIds.
 *
 * Maintains backward compatibility by ensuring models with varying IDs
 * across different parts of the codebase still resolve to the correct
 * capability definitions when computing combined settings.
 */
export const T2V_MODEL_ID_ALIASES: Record<string, T2VModelId> = {
	// Short aliases for convenience
	veo31_fast: "veo31_fast_text_to_video",
	veo31: "veo31_text_to_video",
	veo31_lite: "veo31_lite_text_to_video",
	hailuo_v2: "hailuo23_standard_t2v",
	hailuo: "hailuo23_standard_t2v",
	hailuo_pro: "hailuo23_pro_t2v",
	seedance_t2v: "seedance",
	seedance_pro: "seedance_pro",
	kling1_6_pro: "kling_v2_5_turbo",
	kling_v2: "kling_v2_5_turbo",
	kling1_6_standard: "kling_v2_5_turbo_standard",
	kling_v26_pro: "kling_v26_pro_t2v",
	runway: "runway_gen45_t2v",
	runway_gen45: "runway_gen45_t2v",
	runway_gen4_turbo: "runway_gen4_turbo_t2v",
};

validateModelOrderInvariant({
	category: "T2V",
	models: T2V_MODELS,
	order: T2V_MODEL_ORDER,
});

validateAliasMapTargetsExist({
	category: "T2V",
	models: T2V_MODELS,
	aliases: T2V_MODEL_ID_ALIASES,
});
