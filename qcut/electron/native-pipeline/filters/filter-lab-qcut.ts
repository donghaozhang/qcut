/**
 * Loads QCut's own filter cubes for the filter lab.
 *
 * The recipes live in the web app and are baked to JSON by
 * scripts/generate-filter-lab-cubes.ts, because Electron cannot import the web
 * modules directly — they resolve types through the `@/` alias.
 *
 * @module electron/native-pipeline/filters/filter-lab-qcut
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FilterLabCube } from "./filter-lab-lut.js";

export interface QcutFilterCube {
	id: string;
	name: string;
	category: string;
	cube: FilterLabCube;
}

interface GeneratedEntry {
	id: string;
	name: string;
	category: string;
	size: number;
	values: number[];
}

let cached: QcutFilterCube[] | null = null;

/** Baked cubes for every registered QCut filter preset. */
export async function loadQcutFilterCubes(): Promise<QcutFilterCube[]> {
	if (cached) return cached;
	const path = join(__dirname, "filter-lab-cubes.generated.json");
	let raw: string;
	try {
		raw = await readFile(path, "utf8");
	} catch {
		// The bake is gitignored because it is large and reproducible.
		throw new Error(
			"Filter lab cubes are not baked yet. Run: bun run scripts/generate-filter-lab-cubes.ts"
		);
	}
	const entries = JSON.parse(raw) as GeneratedEntry[];
	cached = entries.map((entry) => ({
		id: entry.id,
		name: entry.name,
		category: entry.category,
		cube: { size: entry.size, values: Float64Array.from(entry.values) },
	}));
	return cached;
}
