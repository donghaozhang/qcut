function jsonSafeValue({ value }: { value: unknown }): unknown {
	if (typeof value === "number" && !Number.isFinite(value)) {
		if (Number.isNaN(value)) return "NaN";
		return value > 0 ? "Infinity" : "-Infinity";
	}
	if (Array.isArray(value)) {
		const normalized: unknown[] = [];
		for (const item of value) {
			normalized.push(jsonSafeValue({ value: item }));
		}
		return normalized;
	}
	if (value && typeof value === "object") {
		const normalized: Record<string, unknown> = {};
		for (const [key, item] of Object.entries(value)) {
			normalized[key] = jsonSafeValue({ value: item });
		}
		return normalized;
	}
	return value;
}

export function stringifyParityReport({ value }: { value: unknown }): string {
	return `${JSON.stringify(jsonSafeValue({ value }), null, 2)}\n`;
}
