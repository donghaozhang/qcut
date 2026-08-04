/**
 * Synthetic plaintext 5.9 profile (JYI-003).
 *
 * This is the baseline the existing exporter writes. It is fixture-only:
 * every capability level says so, and it can never become a production
 * import target without real JianYing 5.9 receipts (JYR-004).
 *
 * @module @qcut/editor-core/jianying-draft/profiles/plaintext-5-9
 */

import {
	JIANYING_PLAINTEXT_APP_VERSION,
	JIANYING_PLAINTEXT_SCHEMA_VERSION,
} from "../constants.js";
import type { DraftProfileContract } from "./registry.js";

export const PLAINTEXT_5_9_PROFILE_ID = "jianying-synthetic-plaintext-5.9";
export const PLAINTEXT_5_9_APP_ID = 3704 as const;
export const PLAINTEXT_5_9_APP_SOURCE = "lv" as const;
export const PLAINTEXT_5_9_NEW_VERSION = "110.0.0" as const;

/** Top-level keys of JianyingDraftContent, the 5.9 baseline shape. */
export const PLAINTEXT_5_9_TOP_LEVEL_KEYS = [
	"canvas_config",
	"color_space",
	"config",
	"cover",
	"create_time",
	"duration",
	"extra_info",
	"fps",
	"free_render_index_mode_on",
	"group_container",
	"id",
	"keyframe_graph_list",
	"keyframes",
	"last_modified_platform",
	"materials",
	"mutable_config",
	"name",
	"new_version",
	"platform",
	"relationships",
	"render_index_track_mode_on",
	"retouch_cover",
	"source",
	"static_cover_image_path",
	"time_marks",
	"tracks",
	"update_time",
	"version",
] as const;

export const PLAINTEXT_5_9_PROFILE: DraftProfileContract = {
	profileId: PLAINTEXT_5_9_PROFILE_ID,
	product: "jianying",
	platforms: ["macos", "windows"],
	appId: PLAINTEXT_5_9_APP_ID,
	appSource: PLAINTEXT_5_9_APP_SOURCE,
	appVersions: [JIANYING_PLAINTEXT_APP_VERSION],
	schemaVersion: JIANYING_PLAINTEXT_SCHEMA_VERSION,
	newVersion: PLAINTEXT_5_9_NEW_VERSION,
	contentFileNames: ["draft_info.json", "draft_content.json"],
	topLevelKeys: PLAINTEXT_5_9_TOP_LEVEL_KEYS,
	timeUnit: "microseconds",
	unknownFieldPolicy: "preserve-owned",
	capabilities: {
		inspect: "fixture",
		import: "fixture",
		sameProfileWriteback: "fixture",
		crossProfileExport: "candidate",
		realAppVerified: false,
	},
	verificationEvidence: "synthetic-plaintext-5.9-reference",
	production: false,
};
