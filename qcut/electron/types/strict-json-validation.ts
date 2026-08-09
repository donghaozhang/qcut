export function requireRecord({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	return value as Record<string, unknown>;
}

export function requireExactKeys({
	keys,
	label,
	record,
}: {
	keys: readonly string[];
	label: string;
	record: Record<string, unknown>;
}): void {
	const expected = new Set(keys);
	for (const key of Object.keys(record)) {
		if (!expected.has(key)) {
			throw new Error(`${label} contains unsupported field '${key}'.`);
		}
	}
	for (const key of keys) {
		if (!(key in record)) {
			throw new Error(`${label} is missing field '${key}'.`);
		}
	}
}

export function requireAllowedKeys({
	allowedKeys,
	label,
	record,
	requiredKeys,
}: {
	allowedKeys: readonly string[];
	label: string;
	record: Record<string, unknown>;
	requiredKeys: readonly string[];
}): void {
	const allowed = new Set(allowedKeys);
	for (const key of Object.keys(record)) {
		if (!allowed.has(key)) {
			throw new Error(`${label} contains unsupported field '${key}'.`);
		}
	}
	for (const key of requiredKeys) {
		if (!(key in record)) {
			throw new Error(`${label} is missing field '${key}'.`);
		}
	}
}

export function requireString({
	label,
	maximumLength = 512,
	value,
}: {
	label: string;
	maximumLength?: number;
	value: unknown;
}): string {
	if (
		typeof value !== "string" ||
		value.length === 0 ||
		value.length > maximumLength ||
		value.includes("\0")
	) {
		throw new Error(`${label} must be a bounded non-empty string.`);
	}
	return value;
}

export function requireSha256({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): string {
	const digest = requireString({ label, maximumLength: 64, value });
	if (!/^[a-f0-9]{64}$/.test(digest)) {
		throw new Error(`${label} must be a lowercase SHA-256 digest.`);
	}
	return digest;
}
