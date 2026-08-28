import { z } from "zod";
import { readRemoteManifestResponse } from "@/lib/assets/remote-manifest-reader";
import {
	ABSOLUTE_LOCAL_PATH_PATTERN,
	hasDotPathSegment,
} from "@/lib/files/local-file-path";
import {
	readLocalSoundEffectsFile,
	type LocalSoundEffectsFileReader,
} from "./local-sound-effects-file-reader";

const CATEGORY_ID_PATTERN = /^jianying-[a-f0-9]{12}$/;
const RESOURCE_ID_PATTERN = /^\d{16,20}$/;
const MD5_PATTERN = /^[a-f0-9]{32}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const CATALOG_ID_PATTERN =
	/^(?:jianying-sfx-reference|qcut-sfx-library)-\d{4}-\d{2}-\d{2}$/;
const PRIVATE_AUDIO_OBJECT_KEY_PATTERN =
	/^(?:jianying|qcut)\/\d{4}-\d{2}-\d{2}\/assets\/[a-f0-9]{32}\.mp3$/;
const MAX_REFERENCE_AUDIO_BYTES = 50 * 1024 * 1024;
const MAX_REFERENCE_AUDIO_DURATION_SECONDS = 30 * 60;
// The catalog runs about 860 bytes per item, so the original 1 MiB ceiling
// would have started rejecting the manifest at roughly 1,219 references — and
// the rejection is silent (use-local-sound-effects-lab.ts swallows private
// manifest errors to stay fail-closed), so it would have shown up as the lab
// entry vanishing rather than as an error. 4 MiB leaves room for ~4,800.
const MAX_REMOTE_MANIFEST_BYTES = 4 * 1024 * 1024;

export class SoundEffectsLabManifestHttpError extends Error {
	readonly status: number;

	constructor({
		manifestUrl,
		status,
	}: { manifestUrl: string; status: number }) {
		super(
			`Unable to fetch Sound Effects Lab manifest (${status}): ${manifestUrl}`
		);
		this.name = "SoundEffectsLabManifestHttpError";
		this.status = status;
	}
}

const localAudioPathSchema = z
	.string()
	.trim()
	.min(1)
	.max(1_024)
	.refine((filePath) => ABSOLUTE_LOCAL_PATH_PATTERN.test(filePath), {
		message: "filePath must be absolute",
	})
	.refine((filePath) => !hasDotPathSegment({ filePath }), {
		message: "filePath must not contain dot path segments",
	});

const localSoundEffectsCategorySchema = z
	.object({
		id: z.string().regex(CATEGORY_ID_PATTERN),
		label: z.string().trim().min(1).max(80),
	})
	.strict();

const jianyingAuthorSchema = z
	.object({
		name: z.string().trim().min(1).max(160),
		source: z.string().trim().min(1).max(160).optional(),
	})
	.strict();

const jianyingAccessSchema = z
	.object({
		isVip: z.boolean().nullable(),
		paidType: z.string().trim().min(1).max(80).optional(),
		businessScope: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
	})
	.strict();

const jianyingCopyrightSchema = z
	.object({
		text: z.string().trim().min(1).max(320).optional(),
		artist: z.string().trim().min(1).max(160).optional(),
	})
	.strict();

const soundEffectSourceSchema = z.discriminatedUnion("provider", [
	z
		.object({
			provider: z.literal("jianying-reference"),
			redistribution: z.literal("prohibited"),
			publishSource: z.string().trim().min(1).max(160).optional(),
			author: jianyingAuthorSchema.optional(),
			access: jianyingAccessSchema.optional(),
			copyright: jianyingCopyrightSchema.optional(),
			status: z.number().int().nullable().optional(),
		})
		.strict(),
	z
		.object({
			provider: z.literal("freesound"),
			sourceId: z.string().regex(/^\d+$/),
			creator: z.string().trim().min(1).max(160),
			sourceUrl: z.string().trim().url().max(512),
			license: z.literal("CC0-1.0"),
			licenseUrl: z.literal(
				"https://creativecommons.org/publicdomain/zero/1.0/"
			),
			redistribution: z.literal("allowed"),
		})
		.strict(),
]);

const commonReferenceShape = {
	id: z.string().regex(RESOURCE_ID_PATTERN),
	numericId: z.number().int().safe().negative(),
	title: z.string().trim().min(1).max(160),
	fileName: z
		.string()
		.trim()
		.regex(/^[a-f0-9]{32}\.mp3$/),
	mimeType: z.literal("audio/mpeg"),
	byteSize: z.number().int().positive().max(MAX_REFERENCE_AUDIO_BYTES),
	duration: z.number().positive().max(MAX_REFERENCE_AUDIO_DURATION_SECONDS),
	contentMd5: z.string().regex(MD5_PATTERN),
	contentSha256: z.string().regex(SHA256_PATTERN),
	resourceId: z.string().regex(RESOURCE_ID_PATTERN),
	// A two-digit batch label, not an enum: this schema and the builder's copy
	// in scripts/build-local-sound-effects-lab-manifest.ts both had to be
	// widened for every new batch, and forgetting THIS one fails closed — the
	// manifest is rejected and the lab entry silently disappears with no error
	// surfaced (see use-local-sound-effects-lab.ts).
	batch: z.string().regex(/^\d{2}$/),
	mappingStrategy: z.enum([
		"metadata-md5",
		"isolated-card-download-probe",
		"isolated-card-download",
		"freesound-cc0",
	]),
	source: soundEffectSourceSchema.optional(),
	categoryIds: z.array(z.string().regex(CATEGORY_ID_PATTERN)).min(1).max(20),
} as const;

interface ReferenceCandidate {
	categoryIds: string[];
	contentMd5: string;
	fileName: string;
	id: string;
	mappingStrategy:
		| "metadata-md5"
		| "isolated-card-download-probe"
		| "isolated-card-download"
		| "freesound-cc0";
	resourceId: string;
	source?: z.infer<typeof soundEffectSourceSchema>;
}

function validateReference({
	context,
	reference,
}: {
	context: z.RefinementCtx;
	reference: ReferenceCandidate;
}): void {
	if (reference.id !== reference.resourceId) {
		context.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["id"],
			message: "id must match resourceId",
		});
	}
	if (!reference.fileName.startsWith(reference.contentMd5)) {
		context.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["fileName"],
			message: "fileName must use the content MD5",
		});
	}
	if (new Set(reference.categoryIds).size !== reference.categoryIds.length) {
		context.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["categoryIds"],
			message: "categoryIds must be unique",
		});
	}
	const isFreesoundMapping = reference.mappingStrategy === "freesound-cc0";
	const isFreesoundSource = reference.source?.provider === "freesound";
	if (isFreesoundMapping !== isFreesoundSource) {
		context.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["source"],
			message: "freesound-cc0 mappings require Freesound source metadata",
		});
	}
}

const localSoundEffectReferenceSchema = z
	.object({
		...commonReferenceShape,
		filePath: localAudioPathSchema,
	})
	.strict()
	.superRefine((reference, context) => {
		validateReference({ context, reference });
	});

const privateSoundEffectAssetSchema = z
	.object({
		kind: z.literal("supabase-storage"),
		objectKey: z.string().regex(PRIVATE_AUDIO_OBJECT_KEY_PATTERN),
		byteSize: z.number().int().positive().max(MAX_REFERENCE_AUDIO_BYTES),
		checksumSha256: z.string().regex(SHA256_PATTERN),
	})
	.strict();

const privateSoundEffectReferenceSchema = z
	.object({
		...commonReferenceShape,
		asset: privateSoundEffectAssetSchema,
	})
	.strict()
	.superRefine((reference, context) => {
		validateReference({ context, reference });
		if (!reference.asset.objectKey.endsWith(`/${reference.fileName}`)) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["asset", "objectKey"],
				message: "objectKey must end with fileName",
			});
		}
		if (reference.asset.byteSize !== reference.byteSize) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["asset", "byteSize"],
				message: "asset byteSize must match reference byteSize",
			});
		}
		if (reference.asset.checksumSha256 !== reference.contentSha256) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["asset", "checksumSha256"],
				message: "asset checksum must match reference SHA-256",
			});
		}
	});

const provenanceSchema = z.union([
	z
		.object({
			sourceApp: z.literal("Jianying Pro"),
			purpose: z.literal("internal-reference"),
			redistribution: z.literal("prohibited"),
		})
		.strict(),
	z
		.object({
			sourceApp: z.literal("QCut"),
			purpose: z.literal("mixed-private-library"),
			redistribution: z.literal("per-item-license"),
		})
		.strict(),
]);

const commonManifestShape = {
	catalogId: z.string().regex(CATALOG_ID_PATTERN),
	generatedAt: z.string().datetime(),
	provenance: provenanceSchema,
	categories: z.array(localSoundEffectsCategorySchema).min(1).max(100),
} as const;

type ReferenceWithLocation =
	| z.infer<typeof localSoundEffectReferenceSchema>
	| z.infer<typeof privateSoundEffectReferenceSchema>;

function validateManifestEntries({
	categories,
	context,
	items,
}: {
	categories: z.infer<typeof localSoundEffectsCategorySchema>[];
	context: z.RefinementCtx;
	items: ReferenceWithLocation[];
}): void {
	const categoryIds = new Set<string>();
	const categoryLabels = new Set<string>();
	for (const [index, category] of categories.entries()) {
		if (categoryIds.has(category.id)) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["categories", index, "id"],
				message: `Duplicate category id: ${category.id}`,
			});
		}
		if (categoryLabels.has(category.label)) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["categories", index, "label"],
				message: `Duplicate category label: ${category.label}`,
			});
		}
		categoryIds.add(category.id);
		categoryLabels.add(category.label);
	}

	const itemIds = new Set<string>();
	const numericIds = new Set<number>();
	const storageLocations = new Map<string, string>();
	const contentMd5s = new Map<string, string>();
	const contentSha256s = new Map<string, string>();
	for (const [index, item] of items.entries()) {
		if (itemIds.has(item.id)) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["items", index, "id"],
				message: `Duplicate resource id: ${item.id}`,
			});
		}
		itemIds.add(item.id);
		if (numericIds.has(item.numericId)) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["items", index, "numericId"],
				message: `Duplicate numeric id: ${item.numericId}`,
			});
		}
		numericIds.add(item.numericId);
		const storageLocation =
			"filePath" in item ? item.filePath : item.asset.objectKey;
		// Distinct catalog cards may share bytes, but not conflicting integrity or rights.
		const contentSignature = JSON.stringify([
			item.contentMd5,
			item.contentSha256,
			item.byteSize,
			item.mimeType,
			item.source?.provider ?? "jianying-reference",
			item.source?.redistribution ?? "prohibited",
		]);
		const sharedContentChecks = [
			{
				seen: storageLocations,
				value: storageLocation,
				field: "filePath" in item ? "filePath" : "asset.objectKey",
				label: "storage location",
			},
			{
				seen: contentMd5s,
				value: item.contentMd5,
				field: "contentMd5",
				label: "MD5",
			},
			{
				seen: contentSha256s,
				value: item.contentSha256,
				field: "contentSha256",
				label: "SHA-256",
			},
		];
		for (const { seen, value, field, label } of sharedContentChecks) {
			const previousSignature = seen.get(value);
			if (previousSignature && previousSignature !== contentSignature) {
				context.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["items", index, field],
					message: `Conflicting shared ${label}: ${value}`,
				});
			}
			seen.set(value, contentSignature);
		}
		for (const categoryId of item.categoryIds) {
			if (categoryIds.has(categoryId)) continue;
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["items", index, "categoryIds"],
				message: `Unknown category id: ${categoryId}`,
			});
		}
	}
}

const localSoundEffectsLabManifestSchema = z
	.object({
		schemaVersion: z.literal(1),
		...commonManifestShape,
		items: z.array(localSoundEffectReferenceSchema).min(1).max(4_000),
	})
	.strict()
	.superRefine((manifest, context) => {
		validateManifestEntries({
			categories: manifest.categories,
			context,
			items: manifest.items,
		});
	});

const privateSoundEffectsLabManifestSchema = z
	.object({
		schemaVersion: z.literal(2),
		...commonManifestShape,
		items: z.array(privateSoundEffectReferenceSchema).min(1).max(4_000),
	})
	.strict()
	.superRefine((manifest, context) => {
		validateManifestEntries({
			categories: manifest.categories,
			context,
			items: manifest.items,
		});
		const catalogDate = manifest.catalogId.slice(-10);
		for (const [index, item] of manifest.items.entries()) {
			const [objectNamespace, objectDate] = item.asset.objectKey.split("/");
			const expectedNamespace =
				item.source?.provider === "freesound" ? "qcut" : "jianying";
			if (objectNamespace !== expectedNamespace) {
				context.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["items", index, "asset", "objectKey"],
					message: "Object key namespace must match item source",
				});
			}
			if (objectDate && objectDate > catalogDate) {
				context.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["items", index, "asset", "objectKey"],
					message: `Object key date cannot be newer than catalog ${catalogDate}`,
				});
			}
		}
	});

export type LocalSoundEffectsLabManifest = z.infer<
	typeof localSoundEffectsLabManifestSchema
>;
export type PrivateSoundEffectsLabManifest = z.infer<
	typeof privateSoundEffectsLabManifestSchema
>;
export type SoundEffectsLabManifest =
	| LocalSoundEffectsLabManifest
	| PrivateSoundEffectsLabManifest;
export type LocalSoundEffectReference = z.infer<
	typeof localSoundEffectReferenceSchema
>;
export type PrivateSoundEffectReference = z.infer<
	typeof privateSoundEffectReferenceSchema
>;
export type SoundEffectsLabReference =
	| LocalSoundEffectReference
	| PrivateSoundEffectReference;
export type LocalSoundEffectsCategory = z.infer<
	typeof localSoundEffectsCategorySchema
>;

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
}): SoundEffectsLabManifest {
	const schemaVersion =
		typeof candidate === "object" &&
		candidate !== null &&
		"schemaVersion" in candidate
			? candidate.schemaVersion
			: undefined;
	const schema =
		schemaVersion === 2
			? privateSoundEffectsLabManifestSchema
			: localSoundEffectsLabManifestSchema;
	const result = schema.safeParse(candidate);
	if (!result.success) {
		throw new Error(
			`Invalid Sound Effects Lab manifest: ${formatManifestIssues({
				error: result.error,
			})}`
		);
	}
	return result.data;
}

function parseManifestJson({ jsonText }: { jsonText: string }): unknown {
	try {
		return JSON.parse(jsonText);
	} catch {
		throw new Error("Invalid Sound Effects Lab manifest: malformed JSON");
	}
}

export function parseLocalSoundEffectsLabManifest({
	jsonText,
}: {
	jsonText: string;
}): LocalSoundEffectsLabManifest {
	const manifest = parseManifestCandidate({
		candidate: parseManifestJson({ jsonText }),
	});
	if (manifest.schemaVersion !== 1) {
		throw new Error(
			"Local Sound Effects Lab manifests must use schemaVersion 1"
		);
	}
	return manifest;
}

export function parsePrivateSoundEffectsLabManifest({
	jsonText,
}: {
	jsonText: string;
}): PrivateSoundEffectsLabManifest {
	const manifest = parseManifestCandidate({
		candidate: parseManifestJson({ jsonText }),
	});
	if (manifest.schemaVersion !== 2) {
		throw new Error(
			"Private Sound Effects Lab manifests must use schemaVersion 2"
		);
	}
	return manifest;
}

export async function loadLocalSoundEffectsLabManifest({
	manifestPath,
	readFile = readLocalSoundEffectsFile,
}: {
	manifestPath: string;
	readFile?: LocalSoundEffectsFileReader;
}): Promise<LocalSoundEffectsLabManifest> {
	if (
		!ABSOLUTE_LOCAL_PATH_PATTERN.test(manifestPath) ||
		hasDotPathSegment({ filePath: manifestPath })
	) {
		throw new Error(
			"Unable to read Sound Effects Lab manifest: path must be absolute without dot segments"
		);
	}
	const bytes = await readFile({ filePath: manifestPath });
	if (!bytes?.byteLength) {
		throw new Error(
			`Unable to read Sound Effects Lab manifest: ${manifestPath}`
		);
	}

	let jsonText: string;
	try {
		jsonText = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		throw new Error("Invalid Sound Effects Lab manifest: expected UTF-8 JSON");
	}
	return parseLocalSoundEffectsLabManifest({ jsonText });
}

export async function loadPrivateSoundEffectsLabManifest({
	fetchImpl = fetch,
	manifestUrl,
	signal,
}: {
	fetchImpl?: typeof fetch;
	manifestUrl: string;
	signal?: AbortSignal;
}): Promise<PrivateSoundEffectsLabManifest> {
	const response = await fetchImpl(manifestUrl, { signal });
	if (!response.ok) {
		throw new SoundEffectsLabManifestHttpError({
			manifestUrl,
			status: response.status,
		});
	}
	const bytes = await readRemoteManifestResponse({
		manifestUrl,
		maxBytes: MAX_REMOTE_MANIFEST_BYTES,
		response,
		resourceName: "Sound Effects Lab manifest",
	});
	if (!bytes.byteLength) {
		throw new Error(
			`Unable to fetch Sound Effects Lab manifest: ${manifestUrl}`
		);
	}

	let jsonText: string;
	try {
		jsonText = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		throw new Error("Invalid Sound Effects Lab manifest: expected UTF-8 JSON");
	}
	return parsePrivateSoundEffectsLabManifest({ jsonText });
}
