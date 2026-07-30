import { z } from "zod";
import {
	readLocalStickerFile,
	type LocalStickerFileReader,
} from "./local-sticker-file-reader";

const STICKER_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ABSOLUTE_LOCAL_PATH_PATTERN = /^(?:\/|[a-zA-Z]:[\\/]|\\\\)/;
const SUPABASE_OBJECT_KEY_PATTERN =
	/^jianying\/[a-z0-9-]+\/assets\/[a-z0-9-]+\.(gif|png)$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MAX_REMOTE_MANIFEST_BYTES = 1024 * 1024;

function hasDotPathSegment({ filePath }: { filePath: string }): boolean {
	return filePath
		.split(/[\\/]/)
		.some((segment) => segment === "." || segment === "..");
}

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
		byteSize: z.number().int().positive(),
		checksumSha256: z.string().regex(SHA256_PATTERN),
	})
	.strict();

const remoteStickerReferenceSchema = z
	.object({
		...commonStickerReferenceShape,
		mimeType: z.enum(["image/png", "image/gif"]),
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
		items: z.array(remoteStickerReferenceSchema).min(1),
	})
	.strict();

function validateUniqueManifestEntries({
	categories,
	context,
}: {
	categories: readonly {
		id: string;
		items: readonly {
			id: string;
			filePath?: string;
			asset?: { objectKey: string };
		}[];
	}[];
	context: z.RefinementCtx;
}): void {
	const categoryIds = new Set<string>();
	const itemIds = new Set<string>();
	const resourceIdentities = new Set<string>();

	for (const [categoryIndex, category] of categories.entries()) {
		if (categoryIds.has(category.id)) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["categories", categoryIndex, "id"],
				message: `Duplicate category id: ${category.id}`,
			});
		}
		categoryIds.add(category.id);

		for (const [itemIndex, item] of category.items.entries()) {
			if (itemIds.has(item.id)) {
				context.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["categories", categoryIndex, "items", itemIndex, "id"],
					message: `Duplicate sticker id: ${item.id}`,
				});
			}
			itemIds.add(item.id);

			const resourceIdentity = item.filePath ?? item.asset?.objectKey;
			if (!resourceIdentity) continue;
			if (resourceIdentities.has(resourceIdentity)) {
				const resourceField = item.filePath ? "filePath" : "asset.objectKey";
				context.addIssue({
					code: z.ZodIssueCode.custom,
					path: [
						"categories",
						categoryIndex,
						"items",
						itemIndex,
						...resourceField.split("."),
					],
					message: item.filePath
						? `Duplicate sticker path: ${resourceIdentity}`
						: `Duplicate sticker object key: ${resourceIdentity}`,
				});
			}
			resourceIdentities.add(resourceIdentity);
		}
	}
}

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
		categories: z.array(remoteStickerCategorySchema).min(1),
	})
	.strict()
	.superRefine((manifest, context) => {
		validateUniqueManifestEntries({
			categories: manifest.categories,
			context,
		});
		const storageCatalogId = manifest.catalogId.replace(/^jianying-/, "");
		const catalogObjectPrefix = `jianying/${storageCatalogId}/assets/`;
		for (const [categoryIndex, category] of manifest.categories.entries()) {
			for (const [itemIndex, item] of category.items.entries()) {
				if (item.asset.objectKey.startsWith(catalogObjectPrefix)) continue;
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
export type StickerLabReference =
	| LocalStickerReference
	| RemoteStickerReference;
export type LocalStickerCategory = z.infer<typeof localStickerCategorySchema>;
export type RemoteStickerCategory = z.infer<typeof remoteStickerCategorySchema>;
export type LocalStickerCatalog = z.infer<typeof localStickerManifestV1Schema>;
export type RemoteStickerCatalog = z.infer<typeof stickerLabManifestV2Schema>;
export type StickerLabCatalog = LocalStickerCatalog | RemoteStickerCatalog;

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
	const schema =
		version === 2 ? stickerLabManifestV2Schema : localStickerManifestV1Schema;
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

export async function loadRemoteStickerManifest({
	fetchImpl = fetch,
	manifestUrl,
	signal,
}: {
	fetchImpl?: typeof fetch;
	manifestUrl: string;
	signal?: AbortSignal;
}): Promise<RemoteStickerCatalog> {
	const response = await fetchImpl(manifestUrl, { signal });
	if (!response.ok) {
		throw new Error(
			`Unable to fetch sticker lab manifest (${response.status}): ${manifestUrl}`
		);
	}
	const contentLength = Number.parseInt(
		response.headers.get("content-length") ?? "",
		10
	);
	if (
		Number.isFinite(contentLength) &&
		contentLength > MAX_REMOTE_MANIFEST_BYTES
	) {
		throw new Error("Sticker lab manifest exceeds 1048576 bytes");
	}
	const bytes = new Uint8Array(await response.arrayBuffer());
	if (!bytes.byteLength) {
		throw new Error(`Unable to fetch sticker lab manifest: ${manifestUrl}`);
	}
	if (bytes.byteLength > MAX_REMOTE_MANIFEST_BYTES) {
		throw new Error("Sticker lab manifest exceeds 1048576 bytes");
	}

	let jsonText: string;
	try {
		jsonText = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		throw new Error("Invalid sticker lab manifest: expected UTF-8 JSON");
	}
	const catalog = parseLocalStickerManifest({ jsonText });
	if (catalog.version !== 2) {
		throw new Error("Remote sticker lab manifests must use version 2");
	}
	return catalog;
}
