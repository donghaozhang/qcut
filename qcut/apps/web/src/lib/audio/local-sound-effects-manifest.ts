import { z } from "zod";
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
const MAX_REFERENCE_AUDIO_BYTES = 50 * 1024 * 1024;
const MAX_REFERENCE_AUDIO_DURATION_SECONDS = 30 * 60;

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

const localSoundEffectReferenceSchema = z
	.object({
		id: z.string().regex(RESOURCE_ID_PATTERN),
		numericId: z.number().int().safe().negative(),
		title: z.string().trim().min(1).max(160),
		fileName: z
			.string()
			.trim()
			.regex(/^[a-f0-9]{32}\.mp3$/),
		filePath: localAudioPathSchema,
		mimeType: z.literal("audio/mpeg"),
		byteSize: z.number().int().positive().max(MAX_REFERENCE_AUDIO_BYTES),
		duration: z.number().positive().max(MAX_REFERENCE_AUDIO_DURATION_SECONDS),
		contentMd5: z.string().regex(MD5_PATTERN),
		contentSha256: z.string().regex(SHA256_PATTERN),
		resourceId: z.string().regex(RESOURCE_ID_PATTERN),
		batch: z.enum(["01", "02"]),
		mappingStrategy: z.enum([
			"metadata-md5",
			"isolated-card-download-probe",
			"isolated-card-download",
		]),
		categoryIds: z.array(z.string().regex(CATEGORY_ID_PATTERN)).min(1).max(20),
	})
	.strict()
	.superRefine((reference, context) => {
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
	});

const localSoundEffectsLabManifestSchema = z
	.object({
		schemaVersion: z.literal(1),
		catalogId: z.string().regex(/^jianying-sfx-reference-\d{4}-\d{2}-\d{2}$/),
		generatedAt: z.string().datetime(),
		provenance: z
			.object({
				sourceApp: z.literal("Jianying Pro"),
				purpose: z.literal("internal-reference"),
				redistribution: z.literal("prohibited"),
			})
			.strict(),
		categories: z.array(localSoundEffectsCategorySchema).min(1).max(100),
		items: z.array(localSoundEffectReferenceSchema).min(1).max(2_000),
	})
	.strict()
	.superRefine((manifest, context) => {
		const categoryIds = new Set<string>();
		const categoryLabels = new Set<string>();
		for (const [index, category] of manifest.categories.entries()) {
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
		const filePaths = new Set<string>();
		const contentMd5s = new Set<string>();
		const contentSha256s = new Set<string>();
		for (const [index, item] of manifest.items.entries()) {
			if (numericIds.has(item.numericId)) {
				context.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["items", index, "numericId"],
					message: `Duplicate numeric id: ${item.numericId}`,
				});
			}
			numericIds.add(item.numericId);
			const duplicateChecks = [
				{ seen: itemIds, value: item.id, field: "id", label: "resource id" },
				{
					seen: filePaths,
					value: item.filePath,
					field: "filePath",
					label: "file path",
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
			for (const { seen, value, field, label } of duplicateChecks) {
				if (seen.has(value)) {
					context.addIssue({
						code: z.ZodIssueCode.custom,
						path: ["items", index, field],
						message: `Duplicate ${label}: ${value}`,
					});
				}
				seen.add(value);
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
	});

export type LocalSoundEffectsLabManifest = z.infer<
	typeof localSoundEffectsLabManifestSchema
>;
export type LocalSoundEffectReference = z.infer<
	typeof localSoundEffectReferenceSchema
>;
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

export function parseLocalSoundEffectsLabManifest({
	jsonText,
}: {
	jsonText: string;
}): LocalSoundEffectsLabManifest {
	let candidate: unknown;
	try {
		candidate = JSON.parse(jsonText);
	} catch {
		throw new Error("Invalid Sound Effects Lab manifest: malformed JSON");
	}
	const result = localSoundEffectsLabManifestSchema.safeParse(candidate);
	if (!result.success) {
		throw new Error(
			`Invalid Sound Effects Lab manifest: ${formatManifestIssues({
				error: result.error,
			})}`
		);
	}
	return result.data;
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
