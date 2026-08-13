/**
 * Jianying Professional macOS 11.3 beta 4 plaintext subdraft profile.
 *
 * Inspect/import are production-verified for the core single-video compound
 * subset. Parent ownership remains opaque, so every write operation stays off.
 */

import {
	createJianying113PlaintextSubdraftProfile,
	JIANYING_11_3_APP_ID,
	JIANYING_11_3_APP_SOURCE,
	JIANYING_11_3_NEW_VERSION,
	JIANYING_11_3_SCHEMA_VERSION,
	JIANYING_11_3_TOP_LEVEL_KEYS,
} from "./jianying-11-3-shared.js";

export const JIANYING_11_3_BETA4_PROFILE_ID =
	"jianying-macos-11.3.0-beta4-plaintext-subdraft";
export const JIANYING_11_3_BETA4_APP_ID = JIANYING_11_3_APP_ID;
export const JIANYING_11_3_BETA4_APP_SOURCE = JIANYING_11_3_APP_SOURCE;
export const JIANYING_11_3_BETA4_APP_VERSION = "11.3.0-beta4" as const;
export const JIANYING_11_3_BETA4_SCHEMA_VERSION = JIANYING_11_3_SCHEMA_VERSION;
export const JIANYING_11_3_BETA4_NEW_VERSION = JIANYING_11_3_NEW_VERSION;
export const JIANYING_11_3_BETA4_TOP_LEVEL_KEYS = JIANYING_11_3_TOP_LEVEL_KEYS;

export const JIANYING_11_3_BETA4_PROFILE =
	createJianying113PlaintextSubdraftProfile({
		appVersion: JIANYING_11_3_BETA4_APP_VERSION,
		operationLevel: "stable",
		profileId: JIANYING_11_3_BETA4_PROFILE_ID,
		production: true,
		verificationEvidence:
			"jianying-macos-11.3.0-beta4-core-video-import-2026-08-13",
	});
