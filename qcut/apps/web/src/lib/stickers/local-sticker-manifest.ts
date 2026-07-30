import { z } from "zod";
import {
	readLocalStickerFile,
	type LocalStickerFileReader,
} from "./local-sticker-file-reader";

const LOCAL_STICKER_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ABSOLUTE_LOCAL_PATH_PATTERN = /^(?:\/|[a-zA-Z]:[\\/]|\\\\)/;

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

const localStickerReferenceSchema = z
	.object({
		id: z.string().trim().regex(LOCAL_STICKER_ID_PATTERN),
		displayName: z.string().trim().min(1).max(120),
		fileName: z
			.string()
			.trim()
			.min(1)
			.max(180)
			.refine((fileName) => !/[\\/]/.test(fileName), {
				message: "fileName must not contain path separators",
			}),
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
		sourceKind: localStickerSourceKindSchema,
		playback: z.discriminatedUnion("kind", [
			staticPlaybackSchema,
			animatedPlaybackSchema,
		]),
	})
	.strict()
	.superRefine((reference, context) => {
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
	});

const localStickerCategorySchema = z
	.object({
		id: z.string().trim().regex(LOCAL_STICKER_ID_PATTERN),
		label: z.string().trim().min(1).max(80),
		sourcePanel: z.string().trim().min(1).max(160),
		items: z.array(localStickerReferenceSchema).min(1),
	})
	.strict();

const localStickerManifestV1Schema = z
	.object({
		version: z.literal(1),
		categories: z.array(localStickerCategorySchema).min(1),
	})
	.strict()
	.superRefine((manifest, context) => {
		const categoryIds = new Set<string>();
		const itemIds = new Set<string>();
		const filePaths = new Set<string>();

		for (const [categoryIndex, category] of manifest.categories.entries()) {
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

				if (filePaths.has(item.filePath)) {
					context.addIssue({
						code: z.ZodIssueCode.custom,
						path: ["categories", categoryIndex, "items", itemIndex, "filePath"],
						message: `Duplicate sticker path: ${item.filePath}`,
					});
				}
				filePaths.add(item.filePath);
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
export type LocalStickerCategory = z.infer<typeof localStickerCategorySchema>;
export type LocalStickerCatalog = z.infer<typeof localStickerManifestV1Schema>;

function formatManifestIssues({ error }: { error: z.ZodError }): string {
	return error.issues
		.map((issue) => {
			const path = issue.path.length ? issue.path.join(".") : "manifest";
			return `${path}: ${issue.message}`;
		})
		.join("; ");
}

export function parseLocalStickerManifest({
	jsonText,
}: {
	jsonText: string;
}): LocalStickerCatalog {
	let candidate: unknown;
	try {
		candidate = JSON.parse(jsonText);
	} catch {
		throw new Error("Invalid local sticker manifest: malformed JSON");
	}

	const result = localStickerManifestV1Schema.safeParse(candidate);
	if (!result.success) {
		throw new Error(
			`Invalid local sticker manifest: ${formatManifestIssues({
				error: result.error,
			})}`
		);
	}
	return result.data;
}

export async function loadLocalStickerManifest({
	manifestPath,
	readFile = readLocalStickerFile,
}: {
	manifestPath: string;
	readFile?: LocalStickerFileReader;
}): Promise<LocalStickerCatalog> {
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
		throw new Error("Invalid local sticker manifest: expected UTF-8 JSON");
	}
	return parseLocalStickerManifest({ jsonText });
}
