import {
	getDraftProfile,
	JIANYING_11_3_NEW_VERSION,
	JIANYING_11_3_PROFILE_IDS,
	JIANYING_11_3_SCHEMA_VERSION,
	JIANYING_11_3_TOP_LEVEL_KEYS,
	type Jianying113ProfileId,
} from "@qcut/editor-core/jianying-draft";

function readRecord({
	value,
}: {
	value: unknown;
}): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

export interface Jianying113ContentIdentity {
	documentId: string;
	profileId: Jianying113ProfileId;
}

export function readJianying113ContentIdentity({
	contentBytes,
	profileId,
}: {
	contentBytes: Uint8Array;
	profileId: string;
}): Jianying113ContentIdentity {
	const exactProfileId = JIANYING_11_3_PROFILE_IDS.find(
		(candidate) => candidate === profileId
	);
	if (exactProfileId === undefined) {
		throw new Error("Jianying content has an unsupported 11.3 profile id.");
	}
	let parsed: unknown;
	try {
		const text = new TextDecoder("utf-8", { fatal: true }).decode(contentBytes);
		parsed = JSON.parse(text);
	} catch {
		throw new Error("Jianying content must be valid UTF-8 JSON.");
	}
	const parsedRecord = readRecord({ value: parsed });
	if (parsedRecord === undefined) {
		throw new Error("Jianying content must be a JSON object.");
	}
	const profile = getDraftProfile({ profileId: exactProfileId });
	const platform = readRecord({ value: parsedRecord.last_modified_platform });
	const topLevelKeys = Object.keys(parsedRecord).sort();
	const expectedKeys = [...JIANYING_11_3_TOP_LEVEL_KEYS].sort();
	if (
		profile === null ||
		parsedRecord.version !== JIANYING_11_3_SCHEMA_VERSION ||
		parsedRecord.new_version !== JIANYING_11_3_NEW_VERSION ||
		typeof parsedRecord.id !== "string" ||
		parsedRecord.id.length === 0 ||
		platform?.app_id !== profile.appId ||
		platform.app_source !== profile.appSource ||
		typeof platform.app_version !== "string" ||
		!profile.appVersions.includes(platform.app_version) ||
		JSON.stringify(topLevelKeys) !== JSON.stringify(expectedKeys)
	) {
		throw new Error(
			"Jianying content does not match the requested exact 11.3 profile."
		);
	}
	return { documentId: parsedRecord.id, profileId: exactProfileId };
}

export function requireJianying113ContentProfile({
	contentBytes,
	profileId,
}: {
	contentBytes: Uint8Array;
	profileId: string;
}): Jianying113ProfileId {
	return readJianying113ContentIdentity({ contentBytes, profileId }).profileId;
}
