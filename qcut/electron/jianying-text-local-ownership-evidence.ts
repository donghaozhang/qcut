import { readdir } from "node:fs/promises";
import path from "node:path";
import { mapWithConcurrency } from "./lib/map-with-concurrency.js";
import {
	asJianyingRecord,
	detectJianyingTextPackageKind,
	JIANYING_TEXT_PACKAGE_HASH_PATTERN,
	JIANYING_TEXT_RESOURCE_ID_PATTERN,
	readBoundedJianyingTextJson,
} from "./jianying-text-package-metadata.js";
import type { JianyingTextRuntimeDependencyRole } from "./jianying-text-runtime-contract.js";
import { collectJianyingScriptResourceReferences } from "./jianying-text-runtime/script-resource-policy.js";

const MAXIMUM_PACKAGE_COUNT = 5000;
const MAXIMUM_DRAFT_METADATA_FILES = 2000;
const MAXIMUM_DRAFT_METADATA_NODES = 100_000;
const SCAN_CONCURRENCY = 8;

interface JianyingPackageCandidate {
	packagePath: string;
	resourceId: string;
	version: string;
}

export interface JianyingProjectWordArtEvidence {
	resourceId: string;
	title?: string;
}

export function jianyingProjectStoreRootForPackageRoot({
	packageRoot,
}: {
	packageRoot: string;
}) {
	return path.resolve(
		packageRoot,
		"..",
		"..",
		"Projects",
		"com.lveditor.draft"
	);
}

async function listPackageCandidates({ packageRoot }: { packageRoot: string }) {
	const resourceDirectories = await readdir(packageRoot, {
		withFileTypes: true,
	}).catch(() => []);
	const candidatesByResource = await Promise.all(
		resourceDirectories.flatMap((resourceDirectory) => {
			if (
				!resourceDirectory.isDirectory() ||
				!JIANYING_TEXT_RESOURCE_ID_PATTERN.test(resourceDirectory.name)
			) {
				return [];
			}
			const resourceId = resourceDirectory.name;
			const resourcePath = path.join(packageRoot, resourceId);
			return [
				readdir(resourcePath, { withFileTypes: true })
					.then((versionDirectories) =>
						versionDirectories.flatMap((versionDirectory) => {
							if (
								!versionDirectory.isDirectory() ||
								!JIANYING_TEXT_PACKAGE_HASH_PATTERN.test(versionDirectory.name)
							) {
								return [];
							}
							return [
								{
									packagePath: path.join(resourcePath, versionDirectory.name),
									resourceId,
									version: versionDirectory.name.toLowerCase(),
								},
							];
						})
					)
					.catch(() => []),
			];
		})
	);
	return candidatesByResource
		.flat()
		.sort((left, right) =>
			`${left.resourceId}/${left.version}`.localeCompare(
				`${right.resourceId}/${right.version}`
			)
		)
		.slice(0, MAXIMUM_PACKAGE_COUNT);
}

async function inspectScriptPackageDependencies({
	candidate,
	resourceIds,
}: {
	candidate: JianyingPackageCandidate;
	resourceIds: ReadonlySet<string>;
}) {
	try {
		const config = await readBoundedJianyingTextJson({
			filePath: path.join(candidate.packagePath, "config.json"),
		});
		if (detectJianyingTextPackageKind({ config }) !== "ScriptInfoSticker") {
			return [];
		}
		const content = await readBoundedJianyingTextJson({
			filePath: path.join(candidate.packagePath, "content.json"),
		});
		return collectJianyingScriptResourceReferences({ value: content }).filter(
			({ resourceId }) =>
				resourceId !== candidate.resourceId && resourceIds.has(resourceId)
		);
	} catch {
		return [];
	}
}

export async function collectJianyingScriptComponentRoles({
	packageRoot,
	resourceIds,
}: {
	packageRoot: string;
	resourceIds: ReadonlySet<string>;
}) {
	if (resourceIds.size === 0) {
		return new Map<string, JianyingTextRuntimeDependencyRole[]>();
	}
	const candidates = await listPackageCandidates({ packageRoot });
	const referencesByPackage = await mapWithConcurrency({
		items: candidates,
		limit: SCAN_CONCURRENCY,
		task: ({ item }) =>
			inspectScriptPackageDependencies({
				candidate: item,
				resourceIds,
			}),
	});
	const mutableRoles = new Map<
		string,
		Set<JianyingTextRuntimeDependencyRole>
	>();
	for (const reference of referencesByPackage.flat()) {
		const roles = mutableRoles.get(reference.resourceId) ?? new Set();
		roles.add(reference.role);
		mutableRoles.set(reference.resourceId, roles);
	}
	return new Map(
		[...mutableRoles].map(([resourceId, roles]) => [
			resourceId,
			[...roles].sort(),
		])
	);
}

function collectProjectWordArtRecords({
	resourceIds,
	value,
}: {
	resourceIds: ReadonlySet<string>;
	value: unknown;
}) {
	const evidence = new Map<string, JianyingProjectWordArtEvidence>();
	const pending: unknown[] = [value];
	let inspectedNodeCount = 0;
	while (
		pending.length > 0 &&
		inspectedNodeCount < MAXIMUM_DRAFT_METADATA_NODES
	) {
		const current = pending.pop();
		inspectedNodeCount += 1;
		if (Array.isArray(current)) {
			pending.push(...current);
			continue;
		}
		const record = asJianyingRecord(current);
		if (!record) continue;
		const resourceId = record.materialId;
		if (
			record.materialCategory === "text" &&
			record.materialSubcategory === "text_special_effect" &&
			typeof resourceId === "string" &&
			resourceIds.has(resourceId)
		) {
			const title =
				typeof record.materialName === "string" && record.materialName.trim()
					? record.materialName.trim()
					: undefined;
			evidence.set(resourceId, {
				resourceId,
				...(title ? { title } : {}),
			});
		}
		pending.push(...Object.values(record));
	}
	return evidence;
}

async function listDraftMetadataFiles({
	projectRoot,
}: {
	projectRoot: string;
}) {
	const relativePaths = await readdir(projectRoot, { recursive: true }).catch(
		() => []
	);
	return relativePaths
		.filter((relativePath) => path.basename(relativePath) === "key_value.json")
		.sort()
		.slice(0, MAXIMUM_DRAFT_METADATA_FILES)
		.map((relativePath) => path.join(projectRoot, relativePath));
}

export async function collectJianyingProjectWordArtEvidence({
	projectRoot,
	resourceIds,
}: {
	projectRoot: string;
	resourceIds: ReadonlySet<string>;
}) {
	if (resourceIds.size === 0) {
		return new Map<string, JianyingProjectWordArtEvidence>();
	}
	const metadataFiles = await listDraftMetadataFiles({ projectRoot });
	const evidenceByFile = await mapWithConcurrency({
		items: metadataFiles,
		limit: SCAN_CONCURRENCY,
		task: async ({ item: filePath }) => {
			try {
				return collectProjectWordArtRecords({
					resourceIds,
					value: await readBoundedJianyingTextJson({ filePath }),
				});
			} catch {
				return new Map<string, JianyingProjectWordArtEvidence>();
			}
		},
	});
	const evidence = new Map<string, JianyingProjectWordArtEvidence>();
	for (const fileEvidence of evidenceByFile) {
		for (const [resourceId, item] of fileEvidence) {
			const current = evidence.get(resourceId);
			evidence.set(resourceId, current?.title ? current : item);
		}
	}
	return evidence;
}
