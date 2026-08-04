/**
 * Draft profile registration (JYI-003). Importing this module registers
 * the known profiles exactly once.
 * @module @qcut/editor-core/jianying-draft/profiles
 */

import { CAPCUT_8_1_DRAFT_PROFILE } from "./capcut-8-1.js";
import { PLAINTEXT_5_9_PROFILE } from "./plaintext-5-9.js";
import { getDraftProfile, registerDraftProfile } from "./registry.js";

for (const contract of [PLAINTEXT_5_9_PROFILE, CAPCUT_8_1_DRAFT_PROFILE]) {
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
