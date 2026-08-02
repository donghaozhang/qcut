#!/usr/bin/env bun

import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import {
	catalogRecordForOutput,
	findTransitionCategories,
	findTransitionRecords,
	resolveTransitionDatabasePaths,
	transitionInventory,
} from "./transition-catalog";
import {
	matchingDraftTransitions,
	scanDraftTransitions,
} from "./draft-transitions";
import {
	classifyTransitionPackage,
	resolveTransitionPackages,
} from "./transition-package";
import {
	buildTransitionParityReport,
	compareParityManifest,
} from "./transition-parity";

const DEFAULT_CACHE_ROOT = path.join(
	os.homedir(),
	"Movies/JianyingPro/User Data/Cache"
);
const DEFAULT_PROJECT_ROOT = path.join(
	os.homedir(),
	"Movies/JianyingPro/User Data/Projects/com.lveditor.draft"
);
const DEFAULT_CONTAINER_CACHE_ROOT = path.join(
	os.homedir(),
	"Library/Containers/com.lemon.lvpro/Data/Movies/JianyingPro/User Data/Cache"
);

function printJson({ value }: { value: unknown }) {
	console.log(JSON.stringify(value, null, 2));
}

function requireDatabases({
	cacheRoot,
	databasePaths,
}: {
	cacheRoot: string;
	databasePaths: string[];
}) {
	if (databasePaths.length === 0) {
		throw new Error(`No Jianying resource databases found under ${cacheRoot}`);
	}
}

function uniqueStrings({ values }: { values: string[] }) {
	return [...new Set(values.filter(Boolean))];
}

function knownMirrorCacheRoots({ cacheRoot }: { cacheRoot: string }) {
	if (
		path.resolve(cacheRoot) === path.resolve(DEFAULT_CACHE_ROOT) &&
		existsSync(DEFAULT_CONTAINER_CACHE_ROOT)
	) {
		return [DEFAULT_CONTAINER_CACHE_ROOT];
	}
	return [];
}

function identityWarnings({
	catalogEffectIds,
	draftEffectIds,
	resourceIds,
}: {
	catalogEffectIds: string[];
	draftEffectIds: string[];
	resourceIds: string[];
}) {
	const warnings: string[] = [];
	if (
		catalogEffectIds.length > 0 &&
		draftEffectIds.length > 0 &&
		!draftEffectIds.some((id) => catalogEffectIds.includes(id))
	) {
		warnings.push(
			"Catalog effect IDs do not match draft effect IDs; preserve both fields with resource ID and MD5"
		);
	}
	if (resourceIds.length > 1) {
		warnings.push("The title resolves to multiple resource IDs");
	}
	return warnings;
}

function durationEvidence({
	catalogDurations,
	draftDurations,
	packageDurations,
}: {
	catalogDurations: number[];
	draftDurations: number[];
	packageDurations: number[];
}) {
	return {
		catalogDefaultSeconds: uniqueStrings({
			values: catalogDurations.map((duration) => String(duration)),
		}).map(Number),
		draftAppliedMicroseconds: [...new Set(draftDurations)],
		packageDefaultSeconds: uniqueStrings({
			values: packageDurations.map((duration) => String(duration)),
		}).map(Number),
	};
}

function ambiguityReasons({
	catalogVersionCount,
	resourceIds,
	draftOwnershipStates,
	packageState,
}: {
	catalogVersionCount: number;
	resourceIds: string[];
	draftOwnershipStates: string[];
	packageState: "found" | "missing" | "ambiguous";
}) {
	const reasons: string[] = [];
	if (resourceIds.length > 1) reasons.push("multiple catalog resource IDs share the title");
	if (catalogVersionCount > resourceIds.length && catalogVersionCount > 1) {
		reasons.push("multiple cached catalog versions match the title");
	}
	if (draftOwnershipStates.some((state) => state !== "owned")) {
		reasons.push("one or more draft transitions do not have exactly one owner segment");
	}
	if (packageState === "ambiguous") reasons.push("multiple local effect packages match");
	return reasons;
}

function inspectTransition({
	title,
	cacheRoot,
	databasePaths,
	draftRoots,
}: {
	title: string;
	cacheRoot: string;
	databasePaths: string[];
	draftRoots: string[];
}) {
	requireDatabases({ cacheRoot, databasePaths });
	const categories = findTransitionCategories({ databasePaths });
	const catalogRecords = findTransitionRecords({ databasePaths, title });
	const draftScan = scanDraftTransitions({ rootPaths: draftRoots });
	const catalogResourceIds = uniqueStrings({
		values: catalogRecords.map((record) => record.resourceId),
	});
	const draftMatches = matchingDraftTransitions({
		evidence: draftScan.evidence,
		title,
	}).filter(
		(entry) =>
			catalogResourceIds.length === 0 ||
			catalogResourceIds.includes(entry.material.resourceId) ||
			entry.material.name === title
	);
	const resourceIds = uniqueStrings({
		values: [
			...catalogResourceIds,
			...draftMatches.map((entry) => entry.material.resourceId),
		],
	});
	const catalogEffectIds = uniqueStrings({
		values: catalogRecords.map((record) => record.catalogEffectId),
	});
	const draftEffectIds = uniqueStrings({
		values: draftMatches.map((entry) => entry.material.draftEffectId),
	});
	const metadataMd5s = uniqueStrings({
		values: catalogRecords.map((record) => record.metadataMd5),
	});
	const packageResolution = resolveTransitionPackages({
		cacheRoot,
		cacheRoots: knownMirrorCacheRoots({ cacheRoot }),
		packagePaths: draftMatches.map((entry) => entry.material.packagePath),
		metadataMd5: metadataMd5s.length === 1 ? metadataMd5s[0] : undefined,
		resourceIds,
		draftEffectIds,
		catalogEffectIds,
	});
	const warnings = identityWarnings({
		catalogEffectIds,
		draftEffectIds,
		resourceIds,
	});
	const ambiguities = ambiguityReasons({
		catalogVersionCount: catalogRecords.length,
		resourceIds,
		draftOwnershipStates: draftMatches.map((entry) => entry.ownershipState),
		packageState: packageResolution.state,
	});
	return {
		report: {
			query: { title },
			databasePaths,
			catalog: {
				matchCount: catalogRecords.length,
				matches: catalogRecords.map((record) =>
					catalogRecordForOutput({ record, categories })
				),
			},
			drafts: {
				rootPaths: draftScan.rootPaths,
				scannedFiles: draftScan.scannedFiles,
				parsedFiles: draftScan.parsedFiles,
				skippedFiles: draftScan.skippedFiles,
				matchCount: draftMatches.length,
				matches: draftMatches,
			},
			packages: packageResolution,
			crossChecks: {
				identity: {
					resourceIds,
					catalogEffectIds,
					draftEffectIds,
					metadataMd5s,
					warnings,
				},
				duration: durationEvidence({
					catalogDurations: catalogRecords.flatMap((record) =>
						record.defaultDurationSeconds === null
							? []
							: [record.defaultDurationSeconds]
					),
					draftDurations: draftMatches.map(
						(entry) => entry.material.durationMicroseconds
					),
					packageDurations: packageResolution.packages.flatMap((entry) =>
						entry.transitionDefaults.durationSeconds === null
							? []
							: [entry.transitionDefaults.durationSeconds]
					),
				}),
				ambiguities,
			},
		},
		catalogRecords,
		draftMatches,
		packageResolution,
		ambiguities,
	};
}

function usage() {
	return `Usage:
  inspect-transition.ts categories [--cache-root PATH] [--database PATH]
  inspect-transition.ts inventory [--cache-root PATH] [--database PATH]
  inspect-transition.ts inspect --title NAME [--project-root PATH] [--draft PATH]
  inspect-transition.ts scan-drafts [--project-root PATH] [--draft PATH]
  inspect-transition.ts classify-package --path PATH
  inspect-transition.ts parity-report --title NAME [--manifest PATH] [--formula TEXT]

Parity image decoding accepts --ffmpeg-path PATH or FFMPEG_PATH.`;
}

async function runCli() {
	const { values, positionals } = parseArgs({
		args: Bun.argv.slice(2),
		options: {
			title: { type: "string" },
			"cache-root": { type: "string" },
			"project-root": { type: "string" },
			database: { type: "string", multiple: true },
			draft: { type: "string", multiple: true },
			path: { type: "string" },
			"resource-id": { type: "string", multiple: true },
			"draft-effect-id": { type: "string", multiple: true },
			"catalog-effect-id": { type: "string", multiple: true },
			"metadata-md5": { type: "string" },
			manifest: { type: "string" },
			formula: { type: "string" },
			"ffmpeg-path": { type: "string" },
			help: { type: "boolean", short: "h" },
		},
		allowPositionals: true,
		strict: true,
	});
	if (values.help) {
		console.log(usage());
		return;
	}
	const command = positionals[0] ?? "inspect";
	const cacheRoot = path.resolve(values["cache-root"] ?? DEFAULT_CACHE_ROOT);
	const projectRoot = path.resolve(values["project-root"] ?? DEFAULT_PROJECT_ROOT);
	const databasePaths = resolveTransitionDatabasePaths({
		cacheRoot,
		explicitPaths: values.database ?? [],
	});
	const draftRoots = (values.draft ?? [projectRoot]).map((entry) =>
		path.resolve(entry)
	);
	if (command === "categories") {
		requireDatabases({ cacheRoot, databasePaths });
		printJson({
			value: {
				databasePaths,
				categories: findTransitionCategories({ databasePaths }),
			},
		});
		return;
	}
	if (command === "inventory") {
		requireDatabases({ cacheRoot, databasePaths });
		const categories = findTransitionCategories({ databasePaths });
		const records = findTransitionRecords({ databasePaths });
		printJson({
			value: {
				databasePaths,
				...transitionInventory({ records, categories }),
			},
		});
		return;
	}
	if (command === "scan-drafts") {
		printJson({ value: scanDraftTransitions({ rootPaths: draftRoots }) });
		return;
	}
	if (command === "classify-package") {
		if (values.path) {
			if (!existsSync(values.path)) {
				throw new Error(`Transition package path does not exist: ${values.path}`);
			}
			printJson({
				value: classifyTransitionPackage({ packagePath: values.path }),
			});
			return;
		}
		const resolution = resolveTransitionPackages({
			cacheRoot,
			cacheRoots: knownMirrorCacheRoots({ cacheRoot }),
			metadataMd5: values["metadata-md5"],
			resourceIds: values["resource-id"] ?? [],
			draftEffectIds: values["draft-effect-id"] ?? [],
			catalogEffectIds: values["catalog-effect-id"] ?? [],
		});
		printJson({ value: resolution });
		if (resolution.state === "missing") process.exitCode = 2;
		return;
	}
	if (command !== "inspect" && command !== "parity-report") {
		throw new Error(`Unknown command: ${command}\n${usage()}`);
	}
	let capture = values.manifest
		? await compareParityManifest({
				manifestPath: values.manifest,
				ffmpegPath: values["ffmpeg-path"],
			})
		: null;
	const title = values.title ?? positionals[1] ?? capture?.transitionTitle;
	if (!title) throw new Error(`${command} requires --title or a positional title`);
	const inspection = inspectTransition({
		title,
		cacheRoot,
		databasePaths,
		draftRoots,
	});
	if (command === "inspect") {
		printJson({ value: inspection.report });
		if (inspection.catalogRecords.length === 0) process.exitCode = 2;
		return;
	}
	if (capture?.transitionTitle && capture.transitionTitle !== title) {
		capture = {
			...capture,
			issues: [
				...capture.issues,
				`Manifest title ${capture.transitionTitle} does not match query title ${title}`,
			],
			complete: false,
		};
	}
	printJson({
		value: buildTransitionParityReport({
			transitionTitle: title,
			catalogVersionCount: inspection.catalogRecords.length,
			draftInstanceCount: inspection.draftMatches.length,
			packageCount: inspection.packageResolution.packages.length,
			packageFamilies: uniqueStrings({
				values: inspection.packageResolution.packages.flatMap(
					(entry) => entry.families
				),
			}),
			formula: values.formula,
			ambiguities: inspection.ambiguities,
			capture,
		}),
	});
}

if (import.meta.main) {
	runCli().catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	});
}
