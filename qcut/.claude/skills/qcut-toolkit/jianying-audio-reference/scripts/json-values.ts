export interface JsonObject {
	[key: string]: unknown;
}

export function jsonObjectValue({ value }: { value: unknown }): JsonObject | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
	return value as JsonObject;
}

export function parseJsonObject({ value }: { value: string }): JsonObject {
	try {
		return jsonObjectValue({ value: JSON.parse(value) }) ?? {};
	} catch {
		return {};
	}
}

export function stringValue({ value }: { value: unknown }): string {
	return typeof value === "string" ? value : "";
}
