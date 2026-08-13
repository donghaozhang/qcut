/**
 * Draft profile registration (JYI-003). Importing this module registers
 * the known profiles exactly once.
 * @module @qcut/editor-core/jianying-draft/profiles
 */

import { CAPCUT_8_1_DRAFT_PROFILE } from "./capcut-8-1.js";
import { JIANYING_11_3_BETA2_PROFILE } from "./jianying-11-3-beta2.js";
import { PLAINTEXT_5_9_PROFILE } from "./plaintext-5-9.js";
import { getDraftProfile, registerDraftProfile } from "./registry.js";

for (const contract of [
	PLAINTEXT_5_9_PROFILE,
	JIANYING_11_3_BETA2_PROFILE,
	CAPCUT_8_1_DRAFT_PROFILE,
]) {
	if (!getDraftProfile({ profileId: contract.profileId })) {
		registerDraftProfile({ contract });
	}
}

export {
	getDraftProfile,
	isDraftProfileWritable,
	listDraftProfiles,
	registerDraftProfile,
	type DraftProfileCapabilities,
	type DraftProfileContract,
	type ProfileOperationLevel,
} from "./registry.js";

export {
	PLAINTEXT_5_9_APP_ID,
	PLAINTEXT_5_9_APP_SOURCE,
	PLAINTEXT_5_9_NEW_VERSION,
	PLAINTEXT_5_9_PROFILE,
	PLAINTEXT_5_9_PROFILE_ID,
	PLAINTEXT_5_9_TOP_LEVEL_KEYS,
} from "./plaintext-5-9.js";

export { CAPCUT_8_1_DRAFT_PROFILE } from "./capcut-8-1.js";

export {
	JIANYING_11_3_BETA2_APP_ID,
	JIANYING_11_3_BETA2_APP_SOURCE,
	JIANYING_11_3_BETA2_APP_VERSION,
	JIANYING_11_3_BETA2_NEW_VERSION,
	JIANYING_11_3_BETA2_PROFILE,
	JIANYING_11_3_BETA2_PROFILE_ID,
	JIANYING_11_3_BETA2_SCHEMA_VERSION,
	JIANYING_11_3_BETA2_TOP_LEVEL_KEYS,
} from "./jianying-11-3-beta2.js";
