import { z } from "zod";
import {
	getPrivateStickerCatalogDefinition,
	MAX_PRIVATE_STICKER_CATALOG_BYTES,
	type PrivateStickerCatalogId,
} from "@qcut/editor-core/sticker-lab";
import {
	readLocalStickerFile,
	type LocalStickerFileReader,
} from "./local-sticker-file-reader";
import { readRemoteStickerManifestResponse } from "./remote-sticker-manifest-reader";
import {
	ABSOLUTE_LOCAL_PATH_PATTERN,
	GIT_OID_PATTERN,
	hasDotPathSegment,
	MAX_PRIVATE_REFERENCE_CATEGORY_BYTES,
	MAX_REMOTE_ASSET_BYTES,
	MAX_REMOTE_CATALOG_BYTES,
	MAX_REMOTE_CATEGORY_BYTES,
	PRIVATE_REFERENCE_OBJECT_KEY_PATTERN,
	SHA256_PATTERN,
	SOURCE_ASSET_ID_PATTERN,
	STICKER_ID_PATTERN,
	SUPABASE_OBJECT_KEY_PATTERN,
	validateUniqueManifestEntries,
} from "./sticker-manifest-validation";

const repositoryPathSchema = z
	.string()
	.trim()
	.min(1)
	.max(300)
	.refine((filePath) => !ABSOLUTE_LOCAL_PATH_PATTERN.test(filePath), {
		message: "repository path must be relative",
	})
	.refine((filePath) => !hasDotPathSegment({ filePath }), {
		message: "repository path must not contain dot path segments",
	});

const localStickerSourceKindSchema = z.enum([
	"static-image",
	"atlas-animation",
	"png-sequence",
	"direct-gif",
	"preview-gif",
	"alpha-video",
	"composite",
	"engine-effect",
]);

const staticPlaybackSchema = z
	.object({
		kind: z.literal("static"),
	})
	.strict();

const animatedPlaybackSchema = z
	.object({
		kind: z.literal("animated"),
		frameCount: z.number().int().min(2),
		frameRate: z.number().positive().optional(),
		cycleDuration: z.number().positive(),
		loop: z.boolean(),
	})
	.strict();

const playbackSchema = z.discriminatedUnion("kind", [
	staticPlaybackSchema,
	animatedPlaybackSchema,
]);

const commonStickerReferenceShape = {
	id: z.string().trim().regex(STICKER_ID_PATTERN),
	displayName: z.string().trim().min(1).max(120),
	fileName: z
		.string()
		.trim()
		.min(1)
		.max(180)
		.refine((fileName) => !/[\\/]/.test(fileName), {
			message: "fileName must not contain path separators",
		}),
	sourceKind: localStickerSourceKindSchema,
	playback: playbackSchema,
} as const;

interface ReferencePlaybackCandidate {
	mimeType: string;
	playback: LocalStickerPlayback;
	sourceKind: LocalStickerSourceKind;
}

function validateReferencePlayback({
	context,
	reference,
}: {
	context: z.RefinementCtx;
	reference: ReferencePlaybackCandidate;
}): void {
	if (
		reference.sourceKind === "static-image" &&
		reference.playback.kind !== "static"
	) {
		context.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["playback", "kind"],
			message: "static-image references require static playback",
		});
	}
	if (
		[
			"atlas-animation",
			"png-sequence",
			"direct-gif",
			"preview-gif",
			"alpha-video",
		].includes(reference.sourceKind) &&
		reference.playback.kind !== "animated"
	) {
		context.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["playback", "kind"],
			message: `${reference.sourceKind} references require animated playback`,
		});
	}
	if (
		["direct-gif", "preview-gif"].includes(reference.sourceKind) &&
		reference.mimeType !== "image/gif"
	) {
		context.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["mimeType"],
			message: `${reference.sourceKind} references require image/gif`,
		});
	}
	if (
		reference.playback.kind === "animated" &&
		reference.mimeType === "image/jpeg"
	) {
		context.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["mimeType"],
			message: "animated references cannot use image/jpeg",
		});
	}
}

const localStickerReferenceSchema = z
	.object({
		...commonStickerReferenceShape,
		filePath: z
			.string()
			.trim()
			.min(1)
			.refine((filePath) => ABSOLUTE_LOCAL_PATH_PATTERN.test(filePath), {
				message: "filePath must be absolute",
			})
			.refine((filePath) => !hasDotPathSegment({ filePath }), {
				message: "filePath must not contain dot path segments",
			}),
		mimeType: z.enum(["image/png", "image/gif", "image/webp", "image/jpeg"]),
	})
	.strict()
	.superRefine((reference, context) => {
		validateReferencePlayback({ context, reference });
	});

const supabaseStickerAssetSchema = z
	.object({
		kind: z.literal("supabase-storage"),
		objectKey: z.string().regex(SUPABASE_OBJECT_KEY_PATTERN),
		byteSize: z.number().int().positive().max(MAX_REMOTE_ASSET_BYTES),
		checksumSha256: z.string().regex(SHA256_PATTERN),
	})
	.strict();

const remoteStickerSourceAssetSchema = z
	.object({
		collection: z.string().trim().regex(STICKER_ID_PATTERN),
		id: z.string().trim().regex(SOURCE_ASSET_ID_PATTERN),
		path: repositoryPathSchema,
		checksumSha256: z.string().regex(SHA256_PATTERN),
	})
	.strict();

const remoteStickerReferenceSchema = z
	.object({
		...commonStickerReferenceShape,
		mimeType: z.enum(["image/png", "image/gif"]),
		sourceAsset: remoteStickerSourceAssetSchema,
		asset: supabaseStickerAssetSchema,
	})
	.strict()
	.superRefine((reference, context) => {
		validateReferencePlayback({ context, reference });

		const expectedExtension =
			reference.mimeType === "image/gif" ? ".gif" : ".png";
		if (!reference.asset.objectKey.endsWith(expectedExtension)) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["asset", "objectKey"],
				message: `${reference.mimeType} assets require ${expectedExtension} object keys`,
			});
		}
		if (!reference.fileName.toLocaleLowerCase().endsWith(expectedExtension)) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["fileName"],
				message: `${reference.mimeType} assets require ${expectedExtension} file names`,
			});
		}
	});

/**
 * Reference item in the allow-list-only harvested catalogue. Unlike the public
 * catalogue there is no repo source asset to point at — the artwork was
 * captured from a third-party app for internal parity study, so only the
 * remote object and its integrity data exist.
 */
const privateStickerReferenceSchema = z
	.object({
		...commonStickerReferenceShape,
		mimeType: z.enum(["image/png", "image/gif"]),
		asset: z
			.object({
				kind: z.literal("supabase-storage"),
				objectKey: z.string().regex(PRIVATE_REFERENCE_OBJECT_KEY_PATTERN),
				byteSize: z.number().int().positive().max(MAX_REMOTE_ASSET_BYTES),
				checksumSha256: z.string().regex(SHA256_PATTERN),
			})
			.strict(),
	})
	.strict()
	.superRefine((reference, context) => {
		validateReferencePlayback({ context, reference });

		const expectedExtension =
			reference.mimeType === "image/gif" ? ".gif" : ".png";
		if (!reference.asset.objectKey.endsWith(expectedExtension)) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["asset", "objectKey"],
				message: `${reference.mimeType} assets require ${expectedExtension} object keys`,
			});
		}
		if (!reference.fileName.toLocaleLowerCase().endsWith(expectedExtension)) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["fileName"],
				message: `${reference.mimeType} assets require ${expectedExtension} file names`,
			});
		}
	});

const commonCategoryShape = {
	id: z.string().trim().regex(STICKER_ID_PATTERN),
	label: z.string().trim().min(1).max(80),
	sourcePanel: z.string().trim().min(1).max(160),
} as const;

const localStickerCategorySchema = z
	.object({
		...commonCategoryShape,
		items: z.array(localStickerReferenceSchema).min(1),
	})
	.strict();

const remoteStickerCategorySchema = z
	.object({
		...commonCategoryShape,
		items: z.array(remoteStickerReferenceSchema).min(1).max(100),
	})
	.strict();

const remoteStickerProvenanceSchema = z
	.object({
		creator: z.string().trim().min(1).max(120),
		license: z
			.object({
				name: z.string().trim().min(1).max(120),
				commercialUse: z.enum(["allowed", "restricted", "unknown"]),
				attributionRequired: z.literal(false),
				licenseFile: repositoryPathSchema,
			})
			.strict(),
		sourceCollections: z
			.array(z.string().trim().regex(STICKER_ID_PATTERN))
			.min(1)
			.max(20)
			.refine(
				(collections) => new Set(collections).size === collections.length,
				"Source collections must be unique"
			),
		sourceTreeGitOid: z.string().regex(GIT_OID_PATTERN),
		transformation: z.string().trim().min(1).max(240),
	})
	.strict();

const localStickerManifestV1Schema = z
	.object({
		version: z.literal(1),
		categories: z.array(localStickerCategorySchema).min(1),
	})
	.strict()
	.superRefine((manifest, context) => {
		validateUniqueManifestEntries({
			categories: manifest.categories,
			context,
		});
	});

const stickerLabManifestV2Schema = z
	.object({
		version: z.literal(2),
		catalogId: z.string().trim().regex(STICKER_ID_PATTERN),
		provenance: remoteStickerProvenanceSchema,
		categories: z.array(remoteStickerCategorySchema).min(1).max(100),
	})
	.strict()
	.superRefine((manifest, context) => {
		validateUniqueManifestEntries({
			categories: manifest.categories,
			context,
		});
		const catalogObjectPrefix = `catalogs/${manifest.catalogId}/assets/`;
		let catalogBytes = 0;
		for (const [categoryIndex, category] of manifest.categories.entries()) {
			const categoryBytes = category.items.reduce(
				(totalBytes, item) => totalBytes + item.asset.byteSize,
				0
			);
			catalogBytes += categoryBytes;
			if (categoryBytes > MAX_REMOTE_CATEGORY_BYTES) {
				context.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["categories", categoryIndex, "items"],
					message: `Category assets exceed ${MAX_REMOTE_CATEGORY_BYTES} bytes`,
				});
			}
			for (const [itemIndex, item] of category.items.entries()) {
				const itemPath = ["categories", categoryIndex, "items", itemIndex];
				if (!item.asset.objectKey.startsWith(catalogObjectPrefix)) {
					context.addIssue({
						code: z.ZodIssueCode.custom,
						path: [...itemPath, "asset", "objectKey"],
						message: `Object key must belong to catalog ${manifest.catalogId}`,
					});
				}
				if (
					!manifest.provenance.sourceCollections.includes(
						item.sourceAsset.collection
					)
				) {
					context.addIssue({
						code: z.ZodIssueCode.custom,
						path: [...itemPath, "sourceAsset", "collection"],
						message: `Source collection is not declared in catalog provenance: ${item.sourceAsset.collection}`,
					});
				}
				if (
					!item.sourceAsset.id.startsWith(`${item.sourceAsset.collection}:`)
				) {
					context.addIssue({
						code: z.ZodIssueCode.custom,
						path: [...itemPath, "sourceAsset", "id"],
						message: `Source asset id must use the ${item.sourceAsset.collection}: prefix`,
					});
				}
			}
		}
		if (catalogBytes > MAX_REMOTE_CATALOG_BYTES) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["categories"],
				message: `Catalog assets exceed ${MAX_REMOTE_CATALOG_BYTES} bytes`,
			});
		}
	});

const privateStickerCategorySchema = z
	.object({
		...commonCategoryShape,
		items: z.array(privateStickerReferenceSchema).min(1).max(100),
	})
	.strict();

/**
 * The harvested reference catalogue: version 2 without provenance. The public
 * v2 schema demands provenance, repo source assets, and tight byte budgets —
 * none of which exist for captured third-party artwork. Everything here is
 * still integrity-checked, but the object keys live under the jianying/
 * prefix that the license server only signs for allow-listed users.
 */
const privateStickerCatalogSchema = z
	.object({
		version: z.literal(2),
		catalogId: z
			.string()
			.trim()
			.regex(STICKER_ID_PATTERN)
			.refine(
				(catalogId): catalogId is PrivateStickerCatalogId =>
					getPrivateStickerCatalogDefinition({ catalogId }) !== null,
				{
					message: "Private reference catalog is not registered",
				}
			),
		categories: z.array(privateStickerCategorySchema).min(1).max(100),
	})
	.strict()
	.superRefine((manifest, context) => {
		validateUniqueManifestEntries({
			categories: manifest.categories,
			context,
		});
		const catalogDefinition = getPrivateStickerCatalogDefinition({
			catalogId: manifest.catalogId,
		});
		if (!catalogDefinition) return;
		const catalogObjectPrefix = catalogDefinition.assetObjectPrefix;
		let catalogBytes = 0;
		for (const [categoryIndex, category] of manifest.categories.entries()) {
			const categoryBytes = category.items.reduce(
				(totalBytes, item) => totalBytes + item.asset.byteSize,
				0
			);
			catalogBytes += categoryBytes;
			if (categoryBytes > MAX_PRIVATE_REFERENCE_CATEGORY_BYTES) {
				context.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["categories", categoryIndex, "items"],
					message: `Category assets exceed ${MAX_PRIVATE_REFERENCE_CATEGORY_BYTES} bytes`,
				});
			}
			for (const [itemIndex, item] of category.items.entries()) {
				if (!item.asset.objectKey.startsWith(catalogObjectPrefix)) {
					context.addIssue({
						code: z.ZodIssueCode.custom,
						path: [
							"categories",
							categoryIndex,
							"items",
							itemIndex,
							"asset",
							"objectKey",
						],
						message: `Object key must belong to catalog ${manifest.catalogId}`,
					});
				}
			}
		}
		if (catalogBytes > MAX_PRIVATE_STICKER_CATALOG_BYTES) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["categories"],
				message: `Catalog assets exceed ${MAX_PRIVATE_STICKER_CATALOG_BYTES} bytes`,
			});
		}
	});

export type LocalStickerSourceKind = z.infer<
	typeof localStickerSourceKindSchema
>;
export type LocalStickerPlayback =
	| z.infer<typeof staticPlaybackSchema>
	| z.infer<typeof animatedPlaybackSchema>;
export type LocalStickerReference = z.infer<typeof localStickerReferenceSchema>;
export type RemoteStickerReference = z.infer<
	typeof remoteStickerReferenceSchema
>;
export type RemoteStickerProvenance = z.infer<
	typeof remoteStickerProvenanceSchema
>;
export type PrivateStickerReference = z.infer<
	typeof privateStickerReferenceSchema
>;
export type StickerLabReference =
	| LocalStickerReference
	| RemoteStickerReference
	| PrivateStickerReference;
export type LocalStickerCategory = z.infer<typeof localStickerCategorySchema>;
export type RemoteStickerCategory = z.infer<typeof remoteStickerCategorySchema>;
export type PrivateStickerCategory = z.infer<
	typeof privateStickerCategorySchema
>;
export type LocalStickerCatalog = z.infer<typeof localStickerManifestV1Schema>;
export type RemoteStickerCatalog = z.infer<typeof stickerLabManifestV2Schema>;
export type PrivateStickerCatalog = z.infer<typeof privateStickerCatalogSchema>;
export type StickerLabCatalog =
	| LocalStickerCatalog
	| RemoteStickerCatalog
	| PrivateStickerCatalog;

export function isPrivateStickerCatalog(
	catalog: StickerLabCatalog
): catalog is PrivateStickerCatalog {
	return catalog.version === 2 && !("provenance" in catalog);
}

export function isRemoteStickerCatalog(
	catalog: StickerLabCatalog
): catalog is RemoteStickerCatalog {
	return catalog.version === 2 && "provenance" in catalog;
}

function formatManifestIssues({ error }: { error: z.ZodError }): string {
	return error.issues
		.map((issue) => {
			const path = issue.path.length ? issue.path.join(".") : "manifest";
			return `${path}: ${issue.message}`;
		})
		.join("; ");
}

function parseManifestCandidate({
	candidate,
}: {
	candidate: unknown;
}): StickerLabCatalog {
	const version =
		typeof candidate === "object" &&
		candidate !== null &&
		"version" in candidate
			? candidate.version
			: undefined;
	// Version 2 covers two shapes: the public catalogue carries provenance,
	// the allow-list-only harvested reference catalogue does not.
	const schema =
		version === 2
			? typeof candidate === "object" &&
				candidate !== null &&
				"provenance" in candidate
				? stickerLabManifestV2Schema
				: privateStickerCatalogSchema
			: localStickerManifestV1Schema;
	const result = schema.safeParse(candidate);
	if (!result.success) {
		throw new Error(
			`Invalid sticker lab manifest: ${formatManifestIssues({
				error: result.error,
			})}`
		);
	}
	return result.data;
}

export function parseLocalStickerManifest({
	jsonText,
}: {
	jsonText: string;
}): StickerLabCatalog {
	let candidate: unknown;
	try {
		candidate = JSON.parse(jsonText);
	} catch {
		throw new Error("Invalid sticker lab manifest: malformed JSON");
	}
	return parseManifestCandidate({ candidate });
}

export async function loadLocalStickerManifest({
	manifestPath,
	readFile = readLocalStickerFile,
}: {
	manifestPath: string;
	readFile?: LocalStickerFileReader;
}): Promise<StickerLabCatalog> {
	if (
		!ABSOLUTE_LOCAL_PATH_PATTERN.test(manifestPath) ||
		hasDotPathSegment({ filePath: manifestPath })
	) {
		throw new Error(
			"Unable to read local sticker manifest: path must be absolute without dot segments"
		);
	}
	const bytes = await readFile({ filePath: manifestPath });
	if (!bytes?.byteLength) {
		throw new Error(`Unable to read local sticker manifest: ${manifestPath}`);
	}

	let jsonText: string;
	try {
		jsonText = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		throw new Error("Invalid sticker lab manifest: expected UTF-8 JSON");
	}
	return parseLocalStickerManifest({ jsonText });
}

async function fetchStickerManifest({
	fetchImpl,
	manifestUrl,
	signal,
}: {
	fetchImpl: typeof fetch;
	manifestUrl: string;
	signal?: AbortSignal;
}): Promise<StickerLabCatalog> {
	const response = await fetchImpl(manifestUrl, { signal });
	if (!response.ok) {
		throw new Error(
			`Unable to fetch sticker lab manifest (${response.status}): ${manifestUrl}`
		);
	}
	const bytes = await readRemoteStickerManifestResponse({
		manifestUrl,
		response,
	});
	if (!bytes.byteLength) {
		throw new Error(`Unable to fetch sticker lab manifest: ${manifestUrl}`);
	}

	let jsonText: string;
	try {
		jsonText = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		throw new Error("Invalid sticker lab manifest: expected UTF-8 JSON");
	}
	return parseLocalStickerManifest({ jsonText });
}

export async function loadRemoteStickerManifest({
	fetchImpl = fetch,
	manifestUrl,
	signal,
}: {
	fetchImpl?: typeof fetch;
	manifestUrl: string;
	signal?: AbortSignal;
}): Promise<RemoteStickerCatalog> {
	const catalog = await fetchStickerManifest({
		fetchImpl,
		manifestUrl,
		signal,
	});
	if (catalog.version !== 2 || !("provenance" in catalog)) {
		throw new Error(
			"Remote sticker lab manifests must use version 2 with provenance"
		);
	}
	return catalog;
}

export async function loadPrivateStickerManifest({
	expectedCatalogId,
	fetchImpl = fetch,
	manifestUrl,
	signal,
}: {
	expectedCatalogId: PrivateStickerCatalogId;
	fetchImpl?: typeof fetch;
	manifestUrl: string;
	signal?: AbortSignal;
}): Promise<PrivateStickerCatalog> {
	const catalog = await fetchStickerManifest({
		fetchImpl,
		manifestUrl,
		signal,
	});
	if (!isPrivateStickerCatalog(catalog)) {
		throw new Error(
			"Private sticker reference manifests must use version 2 without provenance"
		);
	}
	if (catalog.catalogId !== expectedCatalogId) {
		throw new Error(
			`Private sticker catalog id mismatch: expected ${expectedCatalogId}, received ${catalog.catalogId}`
		);
	}
	return catalog;
}
