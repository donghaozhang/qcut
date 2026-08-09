export interface JsonObject {
	[key: string]: unknown;
}

export function objectValue({ value }: { value: unknown }): JsonObject | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return null;
	}
	return value as JsonObject;
}

export function parseJsonObject({ value }: { value: string }): JsonObject {
	try {
		return objectValue({ value: JSON.parse(value) }) ?? {};
	} catch {
		return {};
	}
}

export function stringValue({ value }: { value: unknown }): string {
	return typeof value === "string" ? value : "";
}

export function nullableStringValue({ value }: { value: unknown }): string | null {
	const resolved = stringValue({ value });
	return resolved || null;
}

export function numberValue({ value }: { value: unknown }): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function booleanValue({ value }: { value: unknown }): boolean | null {
	return typeof value === "boolean" ? value : null;
}

export function objectArray({ value }: { value: unknown }): JsonObject[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((entry) => {
		const object = objectValue({ value: entry });
		return object ? [object] : [];
	});
}

export function stringArray({ value }: { value: unknown }): string[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((entry) =>
		typeof entry === "string" || typeof entry === "number"
			? [String(entry)]
			: []
	);
}

export function parseStringArray({ value }: { value: string | null }): string[] {
	if (!value) return [];
	try {
		return stringArray({ value: JSON.parse(value) });
	} catch {
		return [];
	}
}
