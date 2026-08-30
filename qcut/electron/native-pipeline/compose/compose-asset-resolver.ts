import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { resolveStickerLabRootOverride } from "../cli/sticker-lab-root.js";
import {
	discoverLocalReferences,
	readLocalReference,
	resolveDefaultLocalReferenceRoot,
} from "../stickers/local-reference-catalog/index.js";
import { TRANSITION_LAB_RECIPES } from "../transitions/transition-lab-catalog.js";
import type {
	ComposeAssetReference,
	ComposePatch,
	ComposePatchOperation,
	ComposeValidationIssue,
} from "./compose-protocol.js";

export type ComposeAssetStatus =
	| "cached"
	| "downloadable"
	| "cloud-only"
	| "missing"
	| "unsupported";

export interface ComposeAssetEvidence {
	backend: string;
	cacheStatus: string;
	/** Cached is never reported as verified; a digest is the strongest claim. */
	verification: "unverified" | "digest-only";
	detail?: string;
}

/** Portable per-asset record: QCut-side identity and digest only, no paths. */
export interface ResolvedComposeAssetReport {
	operationId: string;
	provider: ComposeAssetReference["provider"];
	assetType: ComposeAssetReference["assetType"];
	assetId: string;
	status: ComposeAssetStatus;
	sha256?: string;
	bytes?: number;
	evidence: ComposeAssetEvidence;
}

export interface ComposeAssetResolverDependencies {
	findStickerLabItem: (input: {
		batchId: string;
		stickerId: string;
	}) => Promise<{ found: boolean; byteSize?: number }>;
	readStickerLabItem: (input: {
		batchId: string;
		stickerId: string;
	}) => Promise<{
		bytes: Uint8Array;
		fileName: string;
		checksumSha256: string;
	}>;
}

const STICKER_LAB_PREFIX = "sticker-lab:";
const EDITOR_TRANSITION_PRESETS = new Set([
	"crossfade",
	"dissolve",
	"whip-pan-right",
]);
const TRANSITION_LAB_RECIPE_IDS = new Set(
	TRANSITION_LAB_RECIPES.map(({ id }) => id)
);

async function defaultFindStickerLabItem({
	batchId,
	stickerId,
}: {
	batchId: string;
	stickerId: string;
}): Promise<{ found: boolean; byteSize?: number }> {
	const discovery = await discoverLocalReferences({
		rootPath: resolveStickerLabRootOverride({}),
	});
	for (const catalog of discovery.catalogs) {
		if (catalog.batchId !== batchId) continue;
		for (const category of catalog.categories) {
			for (const item of category.items) {
				if (item.id === stickerId) {
					return { found: true };
				}
			}
		}
	}
	return { found: false };
}

async function defaultReadStickerLabItem({
	batchId,
	stickerId,
}: {
	batchId: string;
	stickerId: string;
}): Promise<{ bytes: Uint8Array; fileName: string; checksumSha256: string }> {
	const result = await readLocalReference({
		rootPath:
			resolveStickerLabRootOverride({}) ?? resolveDefaultLocalReferenceRoot(),
		batchId,
		stickerId,
	});
	return {
		bytes: result.bytes,
		fileName: result.fileName,
		checksumSha256: result.checksumSha256,
	};
}

const DEFAULT_DEPENDENCIES: ComposeAssetResolverDependencies = {
	findStickerLabItem: defaultFindStickerLabItem,
	readStickerLabItem: defaultReadStickerLabItem,
};

function localFileDigest({ path }: { path: string }): {
	sha256: string;
	bytes: number;
} {
	const data = readFileSync(path);
	return {
		sha256: createHash("sha256").update(data).digest("hex"),
		bytes: statSync(path).size,
	};
}

function parseStickerLabAssetId({ assetId }: { assetId: string }): {
	batchId: string;
	stickerId: string;
} | null {
	if (!assetId.startsWith(STICKER_LAB_PREFIX)) return null;
	const [batchId, stickerId, ...rest] = assetId
		.slice(STICKER_LAB_PREFIX.length)
		.split(":");
	if (!batchId || !stickerId || rest.length > 0) return null;
	return { batchId, stickerId };
}

function report({
	operationId,
	reference,
	status,
	evidence,
	sha256,
	bytes,
}: {
	operationId: string;
	reference: ComposeAssetReference;
	status: ComposeAssetStatus;
	evidence: ComposeAssetEvidence;
	sha256?: string;
	bytes?: number;
}): ResolvedComposeAssetReport {
	return {
		operationId,
		provider: reference.provider,
		assetType: reference.assetType,
		assetId: reference.assetId,
		status,
		...(sha256 ? { sha256 } : {}),
		...(bytes !== undefined ? { bytes } : {}),
		evidence,
	};
}

export async function resolveComposeAssetReference({
	operationId,
	reference,
	dependencies = DEFAULT_DEPENDENCIES,
}: {
	operationId: string;
	reference: ComposeAssetReference;
	dependencies?: ComposeAssetResolverDependencies;
}): Promise<ResolvedComposeAssetReport> {
	if (reference.localPath && existsSync(reference.localPath)) {
		const digest = localFileDigest({ path: reference.localPath });
		return report({
			operationId,
			reference,
			status: "cached",
			sha256: digest.sha256,
			bytes: digest.bytes,
			evidence: {
				backend: "local-file",
				cacheStatus: "local-file",
				verification: "digest-only",
			},
		});
	}
	switch (reference.assetType) {
		case "sticker": {
			const labReference = parseStickerLabAssetId({
				assetId: reference.assetId,
			});
			if (labReference) {
				const item = await dependencies.findStickerLabItem(labReference);
				if (!item.found) {
					return report({
						operationId,
						reference,
						status: "missing",
						evidence: {
							backend: "sticker-lab",
							cacheStatus: "none",
							verification: "unverified",
							detail: "The Sticker Lab batch/item is not cached locally.",
						},
					});
				}
				return report({
					operationId,
					reference,
					status: "cached",
					bytes: item.byteSize,
					evidence: {
						backend: "sticker-lab",
						cacheStatus: "local-reference",
						verification: "unverified",
					},
				});
			}
			if (reference.assetId.includes(":")) {
				return report({
					operationId,
					reference,
					status: "downloadable",
					evidence: {
						backend: "iconify",
						cacheStatus: "none",
						verification: "unverified",
						detail: "Fetched and rasterized on apply.",
					},
				});
			}
			return report({
				operationId,
				reference,
				status: "missing",
				evidence: {
					backend: "local-file",
					cacheStatus: "none",
					verification: "unverified",
					detail: "No localPath and no recognized sticker identity.",
				},
			});
		}
		case "sound-effect":
			if (reference.provider === "qcut") {
				return report({
					operationId,
					reference,
					status: "cloud-only",
					evidence: {
						backend: "sound-effects-lab",
						cacheStatus: "none",
						verification: "unverified",
						detail:
							"Needs the private Sound Effects Lab manifest and an allowlisted sign-in.",
					},
				});
			}
			return report({
				operationId,
				reference,
				status: "missing",
				evidence: {
					backend: "local-file",
					cacheStatus: "none",
					verification: "unverified",
					detail: "Sound effects need a localPath until a download path lands.",
				},
			});
		case "transition": {
			if (EDITOR_TRANSITION_PRESETS.has(reference.assetId)) {
				return report({
					operationId,
					reference,
					status: "cached",
					evidence: {
						backend: "editor-preset",
						cacheStatus: "builtin",
						verification: "unverified",
					},
				});
			}
			if (TRANSITION_LAB_RECIPE_IDS.has(reference.assetId)) {
				return report({
					operationId,
					reference,
					status: "cached",
					evidence: {
						backend: "transition-lab",
						cacheStatus: "builtin-recipe",
						verification: "unverified",
					},
				});
			}
			return report({
				operationId,
				reference,
				status: "unsupported",
				evidence: {
					backend: "editor-preset",
					cacheStatus: "none",
					verification: "unverified",
					detail: `Unknown transition preset: ${reference.assetId}`,
				},
			});
		}
		case "generated-media":
			return report({
				operationId,
				reference,
				status: "cloud-only",
				evidence: {
					backend: reference.provider,
					cacheStatus: "none",
					verification: "unverified",
					detail: "Generated media resolves through a cloud job artifact.",
				},
			});
		default:
			return report({
				operationId,
				reference,
				status: "unsupported",
				evidence: {
					backend: "text-lab",
					cacheStatus: "none",
					verification: "unverified",
					detail: `No resolver for ${reference.assetType} assets yet; text applies as plain content.`,
				},
			});
	}
}

function assetsForOperation({
	operation,
}: {
	operation: ComposePatchOperation;
}): ComposeAssetReference[] {
	switch (operation.kind) {
		case "add-sticker":
		case "add-sound-effect":
			return [operation.asset];
		case "add-text-overlay":
			return operation.asset ? [operation.asset] : [];
		case "upsert-transition":
			return [
				operation.asset ?? {
					provider: "local",
					assetType: "transition",
					assetId: operation.presetId,
				},
			];
		default:
			return [];
	}
}

function issueForReport({
	resolved,
	index,
}: {
	resolved: ResolvedComposeAssetReport;
	index: number;
}): ComposeValidationIssue | null {
	const path = `operations.${index}.asset`;
	if (resolved.status === "missing") {
		return {
			severity: "error",
			code: "invalid-asset-reference",
			path,
			operationId: resolved.operationId,
			message: `Asset ${resolved.assetId} (${resolved.assetType}) is not available: ${resolved.evidence.detail ?? "missing"}`,
			fixHint: "Provide a localPath or cache the asset before applying.",
		};
	}
	if (
		resolved.status === "unsupported" &&
		resolved.assetType === "transition"
	) {
		return {
			severity: "error",
			code: "invalid-asset-reference",
			path,
			operationId: resolved.operationId,
			message:
				resolved.evidence.detail ??
				`Unsupported transition ${resolved.assetId}`,
		};
	}
	if (resolved.status === "unsupported" || resolved.status === "cloud-only") {
		return {
			severity: "warning",
			code: "invalid-asset-reference",
			path,
			operationId: resolved.operationId,
			message: `Asset ${resolved.assetId} (${resolved.assetType}) will not be applied: ${resolved.evidence.detail ?? resolved.status}`,
		};
	}
	return null;
}

export async function resolveComposePatchAssets({
	patch,
	dependencies = DEFAULT_DEPENDENCIES,
}: {
	patch: ComposePatch;
	dependencies?: ComposeAssetResolverDependencies;
}): Promise<{
	reports: ResolvedComposeAssetReport[];
	issues: ComposeValidationIssue[];
}> {
	const reports: ResolvedComposeAssetReport[] = [];
	const issues: ComposeValidationIssue[] = [];
	for (const [index, operation] of patch.operations.entries()) {
		for (const reference of assetsForOperation({ operation })) {
			const resolved = await resolveComposeAssetReference({
				operationId: operation.id,
				reference,
				dependencies,
			});
			reports.push(resolved);
			const issue = issueForReport({ resolved, index });
			if (issue) issues.push(issue);
		}
	}
	return { reports, issues };
}

function safeScratchName({ value }: { value: string }): string {
	return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Returns a copy of the patch whose cached Sticker Lab assets carry a
 * materialized localPath, so the manifest converter can import them. Content
 * only ever lands in the caller's scratch directory, never in the repository
 * or in portable evidence.
 */
export async function materializeComposePatchAssets({
	patch,
	scratchDirectory,
	dependencies = DEFAULT_DEPENDENCIES,
}: {
	patch: ComposePatch;
	scratchDirectory: string;
	dependencies?: ComposeAssetResolverDependencies;
}): Promise<ComposePatch> {
	const operations: ComposePatchOperation[] = [];
	for (const operation of patch.operations) {
		if (
			operation.kind !== "add-sticker" ||
			operation.asset.localPath ||
			!parseStickerLabAssetId({ assetId: operation.asset.assetId })
		) {
			operations.push(operation);
			continue;
		}
		const labReference = parseStickerLabAssetId({
			assetId: operation.asset.assetId,
		});
		if (!labReference) {
			operations.push(operation);
			continue;
		}
		const item = await dependencies.readStickerLabItem(labReference);
		await mkdir(scratchDirectory, { recursive: true });
		const extension = extname(item.fileName) || ".png";
		const localPath = join(
			scratchDirectory,
			`${safeScratchName({ value: operation.asset.assetId })}${extension}`
		);
		await writeFile(localPath, item.bytes);
		operations.push({
			...operation,
			asset: { ...operation.asset, localPath },
		});
	}
	return { ...patch, operations };
}
