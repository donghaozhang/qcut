/**
 * Batch parity scoring for the Filter Lab (FLP-004):
 *
 * - `qcut filter-lab verify-batch --manifest runs.json` verifies every
 *   entry of a researcher-authored manifest through the same pipeline as
 *   `filter-lab verify`, accumulating history in the v2 store. One bad
 *   entry never aborts the batch.
 * - `qcut filter-lab coverage` joins the verification store against the
 *   full card catalog into a stratified coverage report.
 *
 * Manifests reference frames in EXTERNAL evidence directories; only ids,
 * hashes and metrics ever reach the store or this command's output.
 *
 * @module electron/native-pipeline/cli/cli-handlers-filter-lab-batch
 */

import { readFile } from "node:fs/promises";
import {
	readJianyingFilterVerificationRecords,
	saveJianyingFilterVerification,
} from "../../jianying-filter-verification-store.js";
import type { JianyingFilterCatalogExport } from "../../jianying-filter-catalog-export.js";
import {
	buildFilterLabCoverageReport,
	type FilterLabCoverageRecord,
} from "../filters/filter-lab-coverage.js";
import { strataKeyFor } from "../filters/filter-lab-sampling.js";
import {
	verifyFilterLabParity,
	type FilterLabVerificationInput,
	type FilterLabVerificationReport,
} from "../filters/filter-lab-verification.js";
import { exportCatalogDefault } from "./cli-handlers-filter-lab-catalog.js";
import type { CLIResult } from "./cli-runner/types.js";

export interface FilterLabBatchEntry {
	resourceId: string;
	filterVersion: string;
	referenceFrame: string;
	candidateFrame: string;
	referenceMask?: string;
	candidateMask?: string;
	referenceVideo?: string;
	candidateVideo?: string;
}

interface FilterLabBatchManifest {
	entries: FilterLabBatchEntry[];
}

export interface FilterLabBatchDeps {
	readManifest: (path: string) => Promise<string>;
	verify: ({
		input,
	}: {
		input: FilterLabVerificationInput;
	}) => Promise<FilterLabVerificationReport>;
	save: typeof saveJianyingFilterVerification;
}

const DEFAULT_BATCH_DEPS: FilterLabBatchDeps = {
	readManifest: (path) => readFile(path, "utf8"),
	verify: verifyFilterLabParity,
	save: saveJianyingFilterVerification,
};

function parseManifest(text: string): FilterLabBatchManifest {
	const parsed = JSON.parse(text) as unknown;
	const entries = (parsed as { entries?: unknown })?.entries;
	if (!Array.isArray(entries) || entries.length === 0) {
		throw new Error(
			'A verify-batch manifest is {"entries": [...]} with at least one entry.'
		);
	}
	for (const [index, entry] of entries.entries()) {
		const candidate = entry as Partial<FilterLabBatchEntry>;
		if (
			!(
				candidate.resourceId &&
				candidate.filterVersion &&
				candidate.referenceFrame &&
				candidate.candidateFrame
			)
		) {
			throw new Error(
				`Manifest entry ${index} needs resourceId, filterVersion, referenceFrame, and candidateFrame.`
			);
		}
	}
	return { entries: entries as FilterLabBatchEntry[] };
}

/** Verifies every manifest entry; failures are reported, never fatal. */
export async function handleFilterLabVerifyBatch(
	{ manifest }: { manifest?: string } = {},
	deps: Partial<FilterLabBatchDeps> = {}
): Promise<CLIResult> {
	if (!manifest) {
		return {
			success: false,
			error: "filter-lab verify-batch requires --manifest <file.json>",
		};
	}
	const { readManifest, verify, save } = { ...DEFAULT_BATCH_DEPS, ...deps };
	let parsed: FilterLabBatchManifest;
	try {
		parsed = parseManifest(await readManifest(manifest));
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}

	const results: Array<
		| {
				resourceId: string;
				filterVersion: string;
				ok: true;
				status: string;
				rgbRmse?: number;
				ssim?: number;
				deltaE?: number;
		  }
		| { resourceId: string; filterVersion: string; ok: false; error: string }
	> = [];
	// Sequential on purpose: each verification decodes frames through
	// FFmpeg; parallel batches thrash the machine without saving wall time.
	for (const entry of parsed.entries) {
		try {
			const report = await verify({
				input: {
					referenceFrame: entry.referenceFrame,
					candidateFrame: entry.candidateFrame,
					...(entry.referenceMask
						? { referenceMask: entry.referenceMask }
						: {}),
					...(entry.candidateMask
						? { candidateMask: entry.candidateMask }
						: {}),
					...(entry.referenceVideo
						? { referenceVideo: entry.referenceVideo }
						: {}),
					...(entry.candidateVideo
						? { candidateVideo: entry.candidateVideo }
						: {}),
				},
			});
			await save({
				record: {
					resourceId: entry.resourceId,
					version: entry.filterVersion,
					...report,
				},
			});
			results.push({
				resourceId: entry.resourceId,
				filterVersion: entry.filterVersion,
				ok: true,
				status: report.status,
				...(report.rgbRmse !== undefined ? { rgbRmse: report.rgbRmse } : {}),
				...(report.ssim !== undefined ? { ssim: report.ssim } : {}),
				...(report.deltaE !== undefined ? { deltaE: report.deltaE } : {}),
			});
		} catch (error) {
			results.push({
				resourceId: entry.resourceId,
				filterVersion: entry.filterVersion,
				ok: false,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	const succeeded = results.filter((result) => result.ok);
	return {
		success: true,
		data: {
			total: results.length,
			succeeded: succeeded.length,
			failed: results.length - succeeded.length,
			statusCounts: succeeded.reduce<Record<string, number>>(
				(counts, result) => {
					if (result.ok) {
						counts[result.status] = (counts[result.status] ?? 0) + 1;
					}
					return counts;
				},
				{}
			),
			results,
		},
	};
}

export interface FilterLabCoverageDeps {
	exportCatalog: () => Promise<JianyingFilterCatalogExport>;
	readRecords: typeof readJianyingFilterVerificationRecords;
}

const COVERAGE_STRATIFY_FIELDS = new Set([
	"implementation",
	"requirements",
	"cacheStatus",
	"sdkModel",
	"multiPassKind",
]);

/** Stratified verified/close/unverified counts over the whole catalog. */
export async function handleFilterLabCoverage(
	{ stratify }: { stratify?: string } = {},
	deps: Partial<FilterLabCoverageDeps> = {}
): Promise<CLIResult> {
	const fields = (stratify ?? "implementation")
		.split(",")
		.map((field) => field.trim())
		.filter(Boolean);
	const supported = [...COVERAGE_STRATIFY_FIELDS].sort().join(", ");
	if (fields.length === 0) {
		return {
			success: false,
			error: `--stratify is empty. Supported: ${supported}.`,
		};
	}
	const unknown = fields.filter(
		(field) => !COVERAGE_STRATIFY_FIELDS.has(field)
	);
	if (unknown.length > 0) {
		return {
			success: false,
			error: `Unknown stratify field(s): ${unknown.join(", ")}. Supported: ${supported}.`,
		};
	}
	const exportCatalog = deps.exportCatalog ?? exportCatalogDefault;
	const readRecords = deps.readRecords ?? readJianyingFilterVerificationRecords;
	const [catalog, records] = await Promise.all([
		exportCatalog(),
		readRecords(),
	]);
	const report = buildFilterLabCoverageReport({
		cards: catalog.cards,
		records: records as FilterLabCoverageRecord[],
		strataOf: (card) =>
			strataKeyFor({
				card: card as unknown as Record<string, unknown>,
				fields,
			}),
	});
	return {
		success: true,
		data: { stratify: fields, ...report },
	};
}
