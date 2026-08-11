/**
 * Filter lab: score QCut's filter recipes against the Jianying LUTs that are
 * already cached locally, so recipe tuning has a measured target.
 *
 * Reads only what Jianying downloaded during normal use. Nothing is fetched
 * from their servers and no LUT is copied into QCut — the reference exists to
 * score our own recipes.
 *
 * @module electron/native-pipeline/cli/cli-handlers-filter-lab
 */

import type {
	resolveJianyingFilterCategories,
	resolveJianyingFilterTitles,
} from "../../jianying-filter-metadata.js";
import {
	compareCubes,
	frameColours,
	gridColours,
	listJianyingLuts,
	type FilterLabCube,
	type JianyingLutEntry,
	type ScoreColours,
} from "../filters/filter-lab-lut.js";
import { loadQcutFilterCubes } from "../filters/filter-lab-qcut.js";
import type { CLIResult } from "./cli-runner/types.js";

function summariseLut(entry: JianyingLutEntry) {
	return {
		lutId: entry.lutId,
		resourceId: entry.resourceId,
		version: entry.version,
		file: entry.fileName,
		role: entry.role,
		size: entry.cube.size,
		kind: entry.chroma < 0.01 ? "monochrome" : "colour",
	};
}

type LutListRow = ReturnType<typeof summariseLut> & {
	/** Jianying's own display name, when the local metadata DB still has it. */
	title?: string;
	/** Filter-panel categories (e.g. 夏日/影视级), when resolvable locally. */
	categories?: string[];
};

/** Injectable metadata readers so tests never touch the real cache. */
export interface FilterLabListDeps {
	listLuts: typeof listJianyingLuts;
	resolveCategories: typeof resolveJianyingFilterCategories;
	resolveTitles: typeof resolveJianyingFilterTitles;
}

interface LutMetadataLookup {
	titleFor: (entry: JianyingLutEntry) => string | undefined;
	categoriesFor: (entry: JianyingLutEntry) => string[] | undefined;
}

const NO_METADATA: LutMetadataLookup = {
	titleFor: () => undefined,
	categoriesFor: () => undefined,
};

/**
 * Runs inside `bun -e`. Bun has no `node:sqlite` (which the metadata module
 * imports), and runtime `Bun.plugin` module shims are ignored inside the CLI's
 * own entrypoint graph — but they DO apply to modules a `-e` script imports
 * dynamically. So the child registers a `bun:sqlite`-backed shim covering the
 * DatabaseSync surface the metadata module uses, imports it, and prints one
 * `{lutId, title, categories}` row per reference as JSON.
 */
const BUN_METADATA_CHILD_SCRIPT = `
Bun.plugin({
	name: "filter-lab-node-sqlite-shim",
	setup(build) {
		build.module("node:sqlite", () => {
			const { Database } = require("bun:sqlite");
			class DatabaseSync {
				constructor(path, options) {
					this.database = new Database(path, {
						readonly: Boolean(options && options.readOnly),
					});
				}
				prepare(sql) {
					return this.database.prepare(sql);
				}
				close() {
					this.database.close();
				}
			}
			return { exports: { DatabaseSync }, loader: "object" };
		});
	},
});
const input = JSON.parse(process.env.QCUT_FILTER_LAB_METADATA_INPUT || "{}");
const metadata = await import(input.modulePath);
const [catalog, titles] = await Promise.all([
	metadata.resolveJianyingFilterCategories({ references: input.references }),
	metadata.resolveJianyingFilterTitles({ references: input.references }),
]);
const rows = input.references.map((reference) => ({
	lutId: reference.lutId,
	title: metadata.findJianyingFilterTitle({ reference, titles }),
	categories: metadata.findJianyingFilterCategories({ reference, catalog }),
}));
console.log(JSON.stringify(rows));
`;

/** Metadata lookup via a bun child process; only reachable under bun. */
async function loadListMetadataViaBunChild({
	luts,
}: {
	luts: JianyingLutEntry[];
}): Promise<LutMetadataLookup> {
	const { execFile } = await import("node:child_process");
	const { promisify } = await import("node:util");
	const { join } = await import("node:path");
	const references = luts.map((entry) => ({
		lutId: entry.lutId,
		resourceId: entry.resourceId,
		version: entry.version,
		fileName: entry.fileName,
		filePath: entry.filePath,
		role: entry.role,
		size: entry.size,
	}));
	const input = {
		modulePath: join(__dirname, "..", "..", "jianying-filter-metadata.js"),
		references,
	};
	const { stdout } = await promisify(execFile)(
		process.execPath,
		["-e", BUN_METADATA_CHILD_SCRIPT],
		{
			env: {
				...process.env,
				QCUT_FILTER_LAB_METADATA_INPUT: JSON.stringify(input),
			},
			timeout: 15_000,
		}
	);
	const rows = JSON.parse(stdout) as {
		lutId: string;
		title?: string;
		categories?: string[];
	}[];
	const byLutId = new Map(rows.map((row) => [row.lutId, row]));
	return {
		titleFor: (entry) => byLutId.get(entry.lutId)?.title,
		categoriesFor: (entry) => byLutId.get(entry.lutId)?.categories,
	};
}

/**
 * Reads titles/categories from the local Jianying metadata DBs. Metadata is
 * best-effort decoration, so every failure — missing cache DBs, a runtime
 * without `node:sqlite`, a failed child process — degrades to plain LUT rows
 * instead of an error.
 */
async function loadListMetadata({
	luts,
	deps,
}: {
	luts: JianyingLutEntry[];
	deps: Partial<FilterLabListDeps>;
}): Promise<LutMetadataLookup> {
	try {
		// Dynamic import via a variable specifier: a static import (or a literal
		// dynamic one, which bun pre-resolves while parsing the CLI entry graph)
		// of the node:sqlite-backed metadata module would break every pipeline
		// command under bun, not just this one.
		const specifier = "../../jianying-filter-metadata.js";
		const metadata = (await import(
			specifier
		)) as typeof import("../../jianying-filter-metadata.js");
		const resolveCategories =
			deps.resolveCategories ?? metadata.resolveJianyingFilterCategories;
		const resolveTitles =
			deps.resolveTitles ?? metadata.resolveJianyingFilterTitles;
		const [catalog, titles] = await Promise.all([
			resolveCategories({ references: luts }),
			resolveTitles({ references: luts }),
		]);
		return {
			titleFor: (entry) =>
				metadata.findJianyingFilterTitle({ reference: entry, titles }),
			categoriesFor: (entry) =>
				metadata.findJianyingFilterCategories({ reference: entry, catalog }),
		};
	} catch {
		// In-process import only fails under bun (no node:sqlite there).
		if (!(globalThis as { Bun?: unknown }).Bun) return NO_METADATA;
		try {
			return await loadListMetadataViaBunChild({ luts });
		} catch {
			return NO_METADATA;
		}
	}
}

function printLutRows(rows: LutListRow[]) {
	console.log(`\nCached Jianying LUTs (${rows.length}):\n`);
	for (const row of rows) {
		const label = [row.title, row.categories?.join("/")]
			.filter(Boolean)
			.join(" · ");
		console.log(`  ${row.lutId}`);
		console.log(
			`      size=${row.size} role=${row.role} ${row.kind}${label ? `  ${label}` : ""}`
		);
	}
}

export async function handleFilterLabList(
	{ json = true }: { json?: boolean } = {},
	deps: Partial<FilterLabListDeps> = {}
): Promise<CLIResult> {
	const listLuts = deps.listLuts ?? listJianyingLuts;
	const luts = await listLuts();
	if (luts.length === 0) {
		return {
			success: false,
			error:
				"No Jianying LUTs are cached locally. Apply filters in Jianying first — the lab only reads what it has already downloaded.",
		};
	}
	const metadata = await loadListMetadata({ luts, deps });
	const rows: LutListRow[] = luts.map((entry) => {
		const title = metadata.titleFor(entry);
		const categories = metadata.categoriesFor(entry);
		return {
			...summariseLut(entry),
			...(title ? { title } : {}),
			...(categories ? { categories } : {}),
		};
	});
	if (!json) printLutRows(rows);
	return {
		success: true,
		data: {
			count: rows.length,
			luts: rows,
		},
	};
}

interface ScoredMatch {
	presetId: string;
	presetName: string;
	rmse: number;
	maxDelta: number;
}

function bestMatches({
	reference,
	presets,
	limit,
	colours,
}: {
	reference: FilterLabCube;
	presets: { id: string; name: string; cube: FilterLabCube }[];
	limit: number;
	colours: ScoreColours;
}): ScoredMatch[] {
	const scored = presets.map((preset) => {
		const distance = compareCubes({
			left: reference,
			right: preset.cube,
			colours,
		});
		return {
			presetId: preset.id,
			presetName: preset.name,
			rmse: Number(distance.rmse.toFixed(3)),
			maxDelta: Number(distance.maxDelta.toFixed(3)),
		};
	});
	scored.sort((left, right) => left.rmse - right.rmse);
	return scored.slice(0, limit);
}

async function resolveColours({
	sample,
}: {
	sample?: string;
}): Promise<{ colours: ScoreColours; basis: string }> {
	if (sample) {
		return {
			colours: await frameColours({ videoOrImage: sample }),
			basis: `frame:${sample}`,
		};
	}
	return { colours: gridColours({}), basis: "uniform-grid" };
}

/** Scores one cached Jianying LUT against every QCut preset. */
export async function handleFilterLabCompare({
	resourceId,
	lutId,
	limit = 5,
	sample,
}: {
	resourceId?: string;
	lutId?: string;
	limit?: number;
	sample?: string;
}): Promise<CLIResult> {
	if (!(resourceId || lutId)) {
		return {
			success: false,
			error: "filter-lab compare requires --lut-id or --resource-id",
		};
	}
	const luts = await listJianyingLuts();
	const resourceMatches = resourceId
		? luts.filter((lut) => lut.resourceId === resourceId)
		: [];
	if (!lutId && resourceMatches.length > 1) {
		return {
			success: false,
			error: `Resource ${resourceId} has multiple cached LUTs. Choose one exact --lut-id from 'filter-lab list'.`,
			data: { lutIds: resourceMatches.map((entry) => entry.lutId) },
		};
	}
	const entry = lutId
		? luts.find((lut) => lut.lutId === lutId)
		: resourceMatches[0];
	if (!entry) {
		return {
			success: false,
			error: `No cached Jianying LUT for ${lutId ?? resourceId}. Run 'filter-lab list' to see what is available.`,
		};
	}
	const presets = await loadQcutFilterCubes();
	const { colours, basis } = await resolveColours({ sample });
	return {
		success: true,
		data: {
			reference: summariseLut(entry),
			scoredOver: basis,
			closest: bestMatches({ reference: entry.cube, presets, limit, colours }),
		},
	};
}

/**
 * Scores every cached LUT and reports where QCut's library is furthest from
 * the reference — the gap map that recipe work should be aimed at.
 */
export async function handleFilterLabMatch({
	worst = 10,
	sample,
}: {
	worst?: number;
	sample?: string;
}): Promise<CLIResult> {
	const luts = await listJianyingLuts();
	if (luts.length === 0) {
		return {
			success: false,
			error:
				"No Jianying LUTs are cached locally. Apply filters in Jianying first — the lab only reads what it has already downloaded.",
		};
	}
	const presets = await loadQcutFilterCubes();
	const { colours, basis } = await resolveColours({ sample });

	const rows = luts.map((entry) => {
		const [best] = bestMatches({
			reference: entry.cube,
			presets,
			limit: 1,
			colours,
		});
		return {
			// lutId disambiguates resources that cache several LUT versions and
			// feeds straight into `filter-lab compare --lut-id`.
			lutId: entry.lutId,
			resourceId: entry.resourceId,
			size: entry.cube.size,
			closestPreset: best?.presetId ?? "",
			closestName: best?.presetName ?? "",
			rmse: best?.rmse ?? Number.POSITIVE_INFINITY,
		};
	});
	rows.sort((left, right) => right.rmse - left.rmse);

	const scores = rows.map((row) => row.rmse).sort((a, b) => a - b);
	const median = scores[Math.floor(scores.length / 2)] ?? 0;
	return {
		success: true,
		data: {
			scoredOver: basis,
			referenceCount: rows.length,
			presetCount: presets.length,
			medianRmse: Number(median.toFixed(3)),
			within5Levels: scores.filter((value) => value < 5).length,
			within10Levels: scores.filter((value) => value < 10).length,
			worstMatches: rows.slice(0, worst),
		},
	};
}
