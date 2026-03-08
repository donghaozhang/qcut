import { existsSync, mkdirSync } from "node:fs";

export function ensureDir({ path }: { path: string }): void {
	if (!existsSync(path)) {
		mkdirSync(path, { recursive: true });
	}
}

export function slugify({ value }: { value: string }): string {
	const normalized = value
		.toLowerCase()
		.replace(/[`"'“”‘’]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return normalized || "shot-plan";
}

export function parseNumberList({ value }: { value?: string }): number[] {
	if (!value?.trim()) {
		return [];
	}
	const unique = new Set<number>();
	for (const item of value.split(",")) {
		const parsed = Number(item.trim());
		if (Number.isInteger(parsed) && parsed > 0) {
			unique.add(parsed);
		}
	}
	return [...unique].sort((a, b) => a - b);
}
