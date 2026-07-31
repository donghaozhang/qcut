import {
	assertNoUnknownKeys,
	getArray,
	getBoolean,
	getRecord,
	type JsonValue,
} from "./runtime-json.js";

export function createAllowedKeySet<T extends object>({
	keys,
}: {
	keys: Record<keyof T & string, true>;
}): ReadonlySet<string> {
	return new Set(Object.keys(keys));
}

export function validateEnabledRecord({
	allowed,
	path,
	value,
}: {
	allowed: ReadonlySet<string>;
	path: string;
	value: JsonValue | undefined;
}): { [key: string]: JsonValue } {
	const record = getRecord({ path, value });
	assertNoUnknownKeys({ allowed, path, record });
	getBoolean({ path: `${path}.enabled`, value: record.enabled });
	return record;
}

export function validateRecordOfArrays({
	allowed,
	path,
	value,
}: {
	allowed?: ReadonlySet<string>;
	path: string;
	value: JsonValue | undefined;
}): void {
	if (value === undefined) return;
	const record = getRecord({ path, value });
	if (allowed) {
		assertNoUnknownKeys({ allowed, path, record });
	}
	for (const [key, entries] of Object.entries(record)) {
		getArray({ path: `${path}.${key}`, value: entries });
	}
}
