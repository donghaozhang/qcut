/**
 * Jianying Professional macOS 11.3 beta 2 plaintext subdraft profile.
 *
 * This candidate is intentionally read-only until controlled minimal drafts
 * complete the open/save/reopen receipt matrix. It must not be promoted from
 * one observed project or reused as a CapCut compatibility profile.
 *
 * @module @qcut/editor-core/jianying-draft/profiles/jianying-11-3-beta2
 */

import {
	createJianying113PlaintextSubdraftProfile,
	JIANYING_11_3_APP_ID,
	JIANYING_11_3_APP_SOURCE,
	JIANYING_11_3_NEW_VERSION,
	JIANYING_11_3_SCHEMA_VERSION,
	JIANYING_11_3_TOP_LEVEL_KEYS,
} from "./jianying-11-3-shared.js";

export const JIANYING_11_3_BETA2_PROFILE_ID =
	"jianying-macos-11.3.0-beta2-plaintext-subdraft";
export const JIANYING_11_3_BETA2_APP_ID = JIANYING_11_3_APP_ID;
export const JIANYING_11_3_BETA2_APP_SOURCE = JIANYING_11_3_APP_SOURCE;
export const JIANYING_11_3_BETA2_APP_VERSION = "11.3.0-beta2" as const;
export const JIANYING_11_3_BETA2_SCHEMA_VERSION = JIANYING_11_3_SCHEMA_VERSION;
export const JIANYING_11_3_BETA2_NEW_VERSION = JIANYING_11_3_NEW_VERSION;
export const JIANYING_11_3_BETA2_TOP_LEVEL_KEYS = JIANYING_11_3_TOP_LEVEL_KEYS;

export const JIANYING_11_3_BETA2_PROFILE =
	createJianying113PlaintextSubdraftProfile({
		appVersion: JIANYING_11_3_BETA2_APP_VERSION,
		operationLevel: "candidate",
		profileId: JIANYING_11_3_BETA2_PROFILE_ID,
		production: false,
		verificationEvidence:
			"jianying-macos-11.3.0-beta2-plaintext-subdraft-2026-08-13",
	});
