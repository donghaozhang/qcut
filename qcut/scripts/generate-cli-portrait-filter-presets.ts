import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildFilterCube } from "../apps/web/src/lib/filters/filter-lut";
import { getFilterPresetsByCategory } from "../apps/web/src/lib/filters/filter-registry";

const outputPath = resolve(
	import.meta.dir,
	"../electron/native-pipeline/filters/portrait-filter-presets.generated.json"
);

const presets = getFilterPresetsByCategory({ category: "portrait" }).map(
	(preset) => ({
		id: preset.id,
		version: preset.version,
		name: preset.name,
		localizedName: preset.localizedName,
		defaultIntensity: preset.defaultIntensity,
		skinProtection: preset.skinProtection ?? 0,
		extras: preset.extras ?? {},
		cube: buildFilterCube({ preset }),
	})
);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(presets)}\n`, "utf8");
process.stdout.write(
	`Generated ${presets.length} portrait filters at ${outputPath}\n`
);
