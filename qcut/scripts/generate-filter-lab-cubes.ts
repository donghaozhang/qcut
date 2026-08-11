/**
 * Bakes every registered QCut filter preset into a cube the native filter lab
 * can score against reference LUTs. Electron cannot import the web recipe
 * modules directly because they resolve types through the `@/` alias.
 *
 * Run after changing any filter recipe:
 *   bun run scripts/generate-filter-lab-cubes.ts
 */

import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildFilterCube } from "../apps/web/src/lib/filters/filter-lut";
import { FILTER_PRESETS } from "../apps/web/src/lib/filters/filter-registry";

// 9^3 is plenty for scoring: recipes are smooth polynomial transforms, and the
// comparison resamples onto its own grid anyway. 17^3 made the baked file 21MB.
const CUBE_SIZE = 9;

const entries = FILTER_PRESETS.map((preset) => {
	const cube = buildFilterCube({ preset, size: CUBE_SIZE });
	return {
		id: preset.id,
		name: preset.name,
		category: preset.category,
		size: cube.size,
		// Round to keep the baked file readable and stable across runs; the lab
		// scores in 0-255 levels, so six decimals is far below what it can see.
		values: cube.values.map((value) => Number(value.toFixed(5))),
	};
});

const json = `${JSON.stringify(entries)}\n`;
const repoRoot = join(import.meta.dir, "..");
const fileName = "filter-lab-cubes.generated.json";

const outputPath = join(
	repoRoot,
	"electron",
	"native-pipeline",
	"filters",
	fileName
);
writeFileSync(outputPath, json, "utf8");
console.log(`Generated ${entries.length} filter lab cubes at ${outputPath}`);

// The compiled CLI reads the bake next to its own __dirname, so mirror it into
// dist/electron when a build exists (tsc only emits .ts files, never this JSON).
const distDir = join(
	repoRoot,
	"dist",
	"electron",
	"native-pipeline",
	"filters"
);
if (existsSync(distDir)) {
	const distPath = join(distDir, fileName);
	writeFileSync(distPath, json, "utf8");
	console.log(`Copied filter lab cubes to ${distPath}`);
}
