import type { HyperframesComposition } from "./types";

const STORAGE_KEY = "qcut:hyperframes-library:v1";

function isComposition(value: unknown): value is HyperframesComposition {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Partial<HyperframesComposition>;
	return (
		typeof candidate.id === "string" &&
		typeof candidate.name === "string" &&
		typeof candidate.sourcePath === "string" &&
		typeof candidate.projectPath === "string" &&
		typeof candidate.duration === "number" &&
		typeof candidate.width === "number" &&
		typeof candidate.height === "number" &&
		typeof candidate.fps === "number" &&
		Array.isArray(candidate.variables) &&
		Boolean(
			candidate.defaultVariableValues &&
				typeof candidate.defaultVariableValues === "object"
		) &&
		Array.isArray(candidate.warnings)
	);
}

export function loadHyperframesLibrary(): HyperframesComposition[] {
	if (typeof localStorage === "undefined") return [];
	try {
		const parsed: unknown = JSON.parse(
			localStorage.getItem(STORAGE_KEY) ?? "[]"
		);
		return Array.isArray(parsed) ? parsed.filter(isComposition) : [];
	} catch {
		return [];
	}
}

export function saveHyperframesLibrary({
	compositions,
}: {
	compositions: HyperframesComposition[];
}): void {
	if (typeof localStorage === "undefined") return;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(compositions));
}
