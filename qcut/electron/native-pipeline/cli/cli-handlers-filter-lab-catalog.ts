/**
 * `qcut filter-lab catalog`: dump the full known-filter catalog (FLP-001).
 *
 * Unlike `filter-lab list` (locally cached LUT files only), this exports
 * every card the local metadata caches know about, including the
 * stratification fields the IPC summary drops (requirements / sdkModel /
 * effectId), plus deterministic stratified sampling for batch parity runs.
 *
 * Output is catalog metadata only — ids, titles, categories, version
 * hashes, capability tags, verification status. Never LUT pixels, shader
 * source, or package contents.
 *
 * @module electron/native-pipeline/cli/cli-handlers-filter-lab-catalog
 */

import type {
	JianyingFilterCatalogCard,
	JianyingFilterCatalogExport,
} from "../../jianying-filter-catalog-export.js";
import {
	strataKeyFor,
	stratifiedSample,
} from "../filters/filter-lab-sampling.js";
import type { CLIResult } from "./cli-runner/types.js";

const DEFAULT_STRATIFY_FIELDS = ["implementation"];
const SAMPLEABLE_FIELDS = new Set([
	"implementation",
	"requirements",
	"cacheStatus",
	"sdkModel",
	"verification",
	"multiPassKind",
	"tiledRendererKind",
	"available",
]);

/**
 * Runs inside `bun -e`. Same node:sqlite shim as the filter-lab list
 * fallback: bun lacks node:sqlite, but a `Bun.plugin` module shim applies
 * to modules a `-e` script imports dynamically. The child imports the
 * compiled catalog-export module and prints the full export as JSON.
 */
const BUN_CATALOG_CHILD_SCRIPT = `
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
const input = JSON.parse(process.env.QCUT_FILTER_LAB_CATALOG_INPUT || "{}");
const exporter = await import(input.modulePath);
const catalog = await exporter.exportJianyingFilterCatalog();
console.log(JSON.stringify(catalog));
`;

async function exportCatalogViaBunChild(): Promise<JianyingFilterCatalogExport> {
	const { execFile } = await import("node:child_process");
	const { promisify } = await import("node:util");
	const { join } = await import("node:path");
	const input = {
		modulePath: join(
			__dirname,
			"..",
			"..",
			"jianying-filter-catalog-export.js"
		),
	};
	const { stdout } = await promisify(execFile)(
		process.execPath,
		["-e", BUN_CATALOG_CHILD_SCRIPT],
		{
			env: {
				...process.env,
				QCUT_FILTER_LAB_CATALOG_INPUT: JSON.stringify(input),
			},
			timeout: 60_000,
			maxBuffer: 32 * 1024 * 1024,
		}
	);
	return JSON.parse(stdout) as JianyingFilterCatalogExport;
}

/**
 * Loads the catalog exporter. The export module's chain reaches
 * node:sqlite, so the import uses a variable specifier (bun pre-resolves
 * literal dynamic imports while parsing the CLI entry graph) with the bun
 * child-process shim as fallback.
 */
export async function exportCatalogDefault(): Promise<JianyingFilterCatalogExport> {
	try {
		const specifier = "../../jianying-filter-catalog-export.js";
		const exporter = (await import(
			specifier
		)) as typeof import("../../jianying-filter-catalog-export.js");
		return await exporter.exportJianyingFilterCatalog();
	} catch (error) {
		// In-process import only fails under bun (no node:sqlite there).
		if (!(globalThis as { Bun?: unknown }).Bun) throw error;
		return exportCatalogViaBunChild();
	}
}

export interface FilterLabCatalogOptions {
	json?: boolean;
	/** Deterministic stratified sample of this many cards. */
	sample?: number;
	/** Seed for the sample; same seed + same catalog = same cards. */
	seed?: number;
	/** Comma-separated card fields to stratify by (default: implementation). */
	stratify?: string;
}

export interface FilterLabCatalogDeps {
	exportCatalog: () => Promise<JianyingFilterCatalogExport>;
}

function parseStratifyFields(stratify: string | undefined): {
	fields?: string[];
	error?: string;
} {
	if (!stratify) return { fields: DEFAULT_STRATIFY_FIELDS };
	const fields = stratify
		.split(",")
		.map((field) => field.trim())
		.filter(Boolean);
	if (fields.length === 0) return { fields: DEFAULT_STRATIFY_FIELDS };
	const unknown = fields.filter((field) => !SAMPLEABLE_FIELDS.has(field));
	if (unknown.length > 0) {
		return {
			error: `Unknown stratify field(s): ${unknown.join(", ")}. Supported: ${[...SAMPLEABLE_FIELDS].sort().join(", ")}.`,
		};
	}
	return { fields };
}

export async function handleFilterLabCatalog(
	{ sample, seed = 1, stratify }: FilterLabCatalogOptions = {},
	deps: Partial<FilterLabCatalogDeps> = {}
): Promise<CLIResult> {
	const { fields, error } = parseStratifyFields(stratify);
	if (error || !fields) return { success: false, error };
	if (sample !== undefined && (!Number.isSafeInteger(sample) || sample <= 0)) {
		return {
			success: false,
			error: "--sample must be a positive integer.",
		};
	}
	if (!Number.isSafeInteger(seed)) {
		return { success: false, error: "--seed must be an integer." };
	}

	const exportCatalog = deps.exportCatalog ?? exportCatalogDefault;
	const catalog = await exportCatalog();
	if (catalog.cards.length === 0) {
		return {
			success: false,
			error:
				"The local Jianying metadata caches know no filter cards. Open the filter panel in Jianying once so its caches populate.",
		};
	}

	if (sample === undefined) {
		return {
			success: true,
			data: { count: catalog.count, cards: catalog.cards },
		};
	}

	const result = stratifiedSample<JianyingFilterCatalogCard>({
		cards: catalog.cards,
		size: sample,
		seed,
		strataOf: (card) =>
			strataKeyFor({
				card: card as unknown as Record<string, unknown>,
				fields,
			}),
		idOf: (card) => card.resourceId,
	});
	return {
		success: true,
		data: {
			count: catalog.count,
			sample: {
				size: result.cards.length,
				seed,
				stratify: fields,
				strata: result.strata,
			},
			cards: result.cards,
		},
	};
}
