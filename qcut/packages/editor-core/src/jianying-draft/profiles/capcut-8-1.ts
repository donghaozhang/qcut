/**
 * CapCut desktop 8.1 plaintext profile (JYI-003).
 *
 * Core video/audio import is production-backed by a CapCut 8.1.1
 * open/save/reopen and QCut import/reload receipt. Writeback and richer
 * feature subsets remain closed until they earn independent receipts.
 *
 * @module @qcut/editor-core/jianying-draft/profiles/capcut-8-1
 */

import {
	CAPCUT_8_1_APP_ID,
	CAPCUT_8_1_APP_SOURCE,
	CAPCUT_8_1_APP_VERSION,
	CAPCUT_8_1_NEW_VERSION,
	CAPCUT_8_1_PROFILE_ID,
	CAPCUT_8_1_SAVED_NEW_VERSION,
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
	newVersions: [CAPCUT_8_1_NEW_VERSION, CAPCUT_8_1_SAVED_NEW_VERSION],
	contentFileNames: ["draft_info.json"],
	topLevelKeys: CAPCUT_8_1_TOP_LEVEL_KEYS,
	timeUnit: "microseconds",
	unknownFieldPolicy: "preserve-owned",
	envelopeAllowlist: [
		{
			id: "capcut-8.1-root-content",
			relativePath: "draft_info.json",
			evidence: "real-app-file-access",
		},
	],
	capabilities: {
		inspect: "candidate",
		import: "stable",
		sameProfileWriteback: "none",
		crossProfileExport: "candidate",
		realAppVerified: false,
	},
	verificationEvidence: "capcut-8.1.1-core-media-import-2026-08-04",
	production: true,
};
