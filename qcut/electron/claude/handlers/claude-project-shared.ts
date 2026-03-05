export function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isErrnoNoEntry(error: unknown): boolean {
	if (!isRecord(error)) return false;
	return error.code === "ENOENT";
}

export function getStringValue({
	value,
	fallback,
}: {
	value: unknown;
	fallback: string;
}): string {
	return typeof value === "string" && value.trim().length > 0
		? value
		: fallback;
}

export function parsePositiveNumber({
	value,
}: {
	value: unknown;
}): number | null {
	try {
		if (typeof value === "number" && Number.isFinite(value) && value > 0) {
			return value;
		}
		if (typeof value === "string" && value.trim().length > 0) {
			const parsed = Number(value);
			if (Number.isFinite(parsed) && parsed > 0) {
				return parsed;
			}
		}
		return null;
	} catch {
		return null;
	}
}
