/**
 * CapCut desktop 8.1 plaintext profile (JYI-003).
 *
 * First production candidate for import. Levels stay at `candidate` until
 * each supported subset earns a real-app receipt; writeback opens per
 * verified feature subset, never wholesale.
 *
 * @module @qcut/editor-core/jianying-draft/profiles/capcut-8-1
 */

import {
	CAPCUT_8_1_APP_ID,
	CAPCUT_8_1_APP_SOURCE,
	CAPCUT_8_1_APP_VERSION,
	CAPCUT_8_1_NEW_VERSION,
	CAPCUT_8_1_PROFILE_ID,
	CAPCUT_8_1_SCHEMA_VERSION,
	CAPCUT_8_1_TOP_LEVEL_KEYS,
} from "../capcut-8-1-profile.js";
import type { DraftProfileContract } from "./registry.js";

export const CAPCUT_8_1_DRAFT_PROFILE: DraftProfileContract = {
	profileId: CAPCUT_8_1_PROFILE_ID,
	product: "capcut",
	platforms: ["macos", "windows"],
	appId: CAPCUT_8_1_APP_ID,
	appSource: CAPCUT_8_1_APP_SOURCE,
	appVersions: [CAPCUT_8_1_APP_VERSION],
	schemaVersion: CAPCUT_8_1_SCHEMA_VERSION,
	newVersion: CAPCUT_8_1_NEW_VERSION,
	contentFileNames: ["draft_info.json"],
	topLevelKeys: CAPCUT_8_1_TOP_LEVEL_KEYS,
	timeUnit: "microseconds",
	unknownFieldPolicy: "preserve-owned",
	capabilities: {
		inspect: "candidate",
		import: "candidate",
		sameProfileWriteback: "none",
		crossProfileExport: "candidate",
		realAppVerified: false,
	},
	verificationEvidence: "capcut-8-1-migration-bundle-fixtures",
	production: false,
};
