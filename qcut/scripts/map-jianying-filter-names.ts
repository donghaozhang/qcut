/**
 * Resolves which reference LUT each QCut parity preset is meant to replicate.
 *
 * Parity presets carry the filter's Chinese name in `localizedName`, but the
 * local LUT cache is keyed only by numeric resource id — its own `name` field
 * is an internal build stamp. Without a mapping, fitting a preset to its
 * "nearest" reference would happily make it reproduce the wrong filter with
 * high precision, and the aggregate error would improve while the presets got
 * less correct.
 *
 * The editor's own resource catalogue closes that gap: cached listing
 * responses carry title/id pairs, so a preset's localizedName resolves to a
 * resource id by exact name. Only names and ids are read; no imagery, no LUT
 * data, and nothing is copied into QCut.
 *
 * Output is written outside the repo — it is derived from another app's local
 * cache and exists to drive the fit, not to be redistributed.
 *
 * Usage: bun run scripts/map-jianying-filter-names.ts [--out <path>]
 */

import { Database } from "bun:sqlite";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { listJianyingLuts } from "../electron/native-pipeline/filters/filter-lab-lut";

const CATALOGUE_ROOT = join(
	homedir(),
	"Movies",
	"JianyingPro",
	"User Data",
	"Cache",
	"ressdk_db"
);
const PARITY_DIR = join(
	import.meta.dir,
	"..",
	"apps",
	"web",
	"src",
	"lib",
	"filters",
	"jianying-parity"
);

/** Walks a decoded listing response collecting {resource id -> title}. */
function collectTitles({
	node,
	into,
}: {
	node: unknown;
	into: Map<string, string>;
}): void {
	if (Array.isArray(node)) {
		for (const child of node) collectTitles({ node: child, into });
		return;
	}
	if (typeof node !== "object" || node === null) return;
	const record = node as Record<string, unknown>;
	const title = record.title ?? record.name;
	const id = record.effect_id ?? record.id ?? record.resource_id;
	// Resource ids are 19-digit snowflakes; anything shorter is a category or
	// index and would produce a bogus pairing.
	if (
		typeof title === "string" &&
		title.length > 0 &&
		(typeof id === "string" || typeof id === "number") &&
		/^\d{17,}$/.test(String(id))
	) {
		into.set(String(id), title);
	}
	for (const value of Object.values(record))
		collectTitles({ node: value, into });
}

function catalogueTitles(): Map<string, string> {
	const titles = new Map<string, string>();
	let databases: string[];
	try {
		databases = readdirSync(CATALOGUE_ROOT);
	} catch {
		throw new Error(
			`No local resource catalogue at ${CATALOGUE_ROOT} — open the editor once so it caches its filter list.`
		);
	}
	for (const entry of databases) {
		const path = join(CATALOGUE_ROOT, entry, "rp.db");
		let database: Database;
		try {
			database = new Database(path, { readonly: true });
		} catch {
			continue;
		}
		try {
			const rows = database
				.query<{ response_body: string }, []>(
					"SELECT response_body FROM http_cache WHERE url LIKE '%_filter_%'"
				)
				.all();
			for (const row of rows) {
				try {
					collectTitles({ node: JSON.parse(row.response_body), into: titles });
				} catch {
					/* a partially written cache row */
				}
			}
		} catch {
			/* schema differs in this catalogue */
		} finally {
			database.close();
		}
	}
	return titles;
}

/** Reads preset id and localizedName straight from the parity sources. */
function parityPresets(): { presetId: string; localizedName: string }[] {
	const out: { presetId: string; localizedName: string }[] = [];
	for (const file of readdirSync(PARITY_DIR)) {
		if (!file.endsWith("-presets.ts") && !file.endsWith("-recipes.ts"))
			continue;
		const source = readFileSync(join(PARITY_DIR, file), "utf8");
		const pattern =
			/id:\s*"(jy-[a-z0-9-]+)"[\s\S]{0,400}?localizedName:\s*"([^"]+)"/g;
		for (const match of source.matchAll(pattern)) {
			out.push({ presetId: match[1], localizedName: match[2] });
		}
	}
	return out;
}

async function main() {
	const outIndex = process.argv.indexOf("--out");
	const outPath =
		outIndex >= 0
			? process.argv[outIndex + 1]
			: join("/tmp", "qcut-filter-name-map.json");

	const titles = catalogueTitles();
	const cached = new Set(
		(await listJianyingLuts()).map((entry) => entry.resourceId)
	);

	// A title can repeat across categories — "黑金" exists as both a filter and
	// an effect. Resolve to a cached LUT when one carries the name, since that
	// is the only candidate the fit can actually use.
	const byName = new Map<string, string>();
	for (const [id, title] of titles) {
		const claimed = byName.get(title);
		if (claimed && (cached.has(claimed) || !cached.has(id))) continue;
		byName.set(title, id);
	}
	const presets = parityPresets();

	const mapped: {
		presetId: string;
		localizedName: string;
		resourceId: string;
	}[] = [];
	const unmatched: string[] = [];
	for (const preset of presets) {
		const resourceId = byName.get(preset.localizedName);
		if (resourceId && cached.has(resourceId)) {
			mapped.push({ ...preset, resourceId });
		} else {
			unmatched.push(preset.localizedName);
		}
	}

	writeFileSync(outPath, `${JSON.stringify(mapped, null, "\t")}\n`, "utf8");
	console.log(
		JSON.stringify(
			{
				catalogueTitles: titles.size,
				cachedReferences: cached.size,
				parityPresets: presets.length,
				mapped: mapped.length,
				unmatched,
				output: outPath,
			},
			null,
			2
		)
	);
}

await main();
