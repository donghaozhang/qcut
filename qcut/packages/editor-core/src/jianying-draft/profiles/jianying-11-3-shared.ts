import type { DraftProfileContract } from "./registry.js";

export const JIANYING_11_3_APP_ID = 3704 as const;
export const JIANYING_11_3_APP_SOURCE = "lv" as const;
export const JIANYING_11_3_SCHEMA_VERSION = 360_000 as const;
export const JIANYING_11_3_NEW_VERSION = "183.0.0" as const;

export const JIANYING_11_3_TOP_LEVEL_KEYS = [
	"canvas_config",
	"color_space",
	"config",
	"cover",
	"create_time",
	"draft_type",
	"duration",
	"extra_info",
	"fps",
	"free_render_index_mode_on",
	"function_assistant_info",
	"group_container",
	"id",
	"is_drop_frame_timecode",
	"keyframe_graph_list",
	"keyframes",
	"last_modified_platform",
	"lyrics_effects",
	"materials",
	"mixed_track_mode_on",
	"mutable_config",
	"name",
	"new_version",
	"path",
	"platform",
	"relationships",
	"render_index_track_mode_on",
	"retouch_cover",
	"smart_ads_info",
	"source",
	"static_cover_image_path",
	"time_marks",
	"tracks",
	"uneven_animation_template_info",
	"update_time",
	"version",
] as const;

export const JIANYING_11_3_PROFILE_IDS = [
	"jianying-macos-11.3.0-beta2-plaintext-subdraft",
	"jianying-macos-11.3.0-beta3-plaintext-subdraft",
] as const;

export type Jianying113ProfileId = (typeof JIANYING_11_3_PROFILE_IDS)[number];

export function isJianying113ProfileId({
	profileId,
}: {
	profileId: string;
}): boolean {
	return JIANYING_11_3_PROFILE_IDS.some((candidate) => candidate === profileId);
}

export function createJianying113PlaintextSubdraftProfile({
	appVersion,
	profileId,
	verificationEvidence,
}: {
	appVersion: string;
	profileId: Jianying113ProfileId;
	verificationEvidence: string;
}): DraftProfileContract {
	return {
		profileId,
		product: "jianying",
		platforms: ["macos"],
		appId: JIANYING_11_3_APP_ID,
		appSource: JIANYING_11_3_APP_SOURCE,
		appVersions: [appVersion],
		schemaVersion: JIANYING_11_3_SCHEMA_VERSION,
		newVersions: [JIANYING_11_3_NEW_VERSION],
		contentFileNames: ["draft_content.json"],
		topLevelKeys: JIANYING_11_3_TOP_LEVEL_KEYS,
		timeUnit: "microseconds",
		unknownFieldPolicy: "preserve-owned",
		envelopeAllowlist: [
			{
				id: "jianying-11.3-subdraft-content",
				relativePath: "draft_content.json",
				evidence: "same-profile-round-trip",
			},
		],
		capabilities: {
			inspect: "candidate",
			import: "candidate",
			sameProfileWriteback: "none",
			crossProfileExport: "none",
			realAppVerified: false,
		},
		verificationEvidence,
		production: false,
	};
}
