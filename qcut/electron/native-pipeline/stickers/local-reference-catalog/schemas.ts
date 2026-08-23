import { z } from "zod";
import { MAX_LOCAL_REFERENCE_ASSET_BYTES } from "./filesystem.js";

const RESOURCE_ID_PATTERN = /^\d+$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const URL_SCHEME_PATTERN = /(?:https?|s3|gs|file):\/\//i;
const URL_FIELD_PATTERN = /(?:^|[_-])(?:url|uri)(?:$|[_-])/i;

const sourceKindSchema = z.enum([
	"static-image",
	"atlas-animation",
	"png-sequence",
	"direct-gif",
	"preview-gif",
	"alpha-video",
	"composite",
	"engine-effect",
]);

const staticPlaybackSchema = z.object({ kind: z.literal("static") }).strict();
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

const fileNameSchema = z
	.string()
	.trim()
	.min(1)
	.max(180)
	.refine((fileName) => !/[\\/]/.test(fileName), {
		message: "fileName must not contain path separators",
	});

const localItemSchema = z
	.object({
		id: z.string().regex(RESOURCE_ID_PATTERN),
		displayName: z.string().trim().min(1).max(120),
		fileName: fileNameSchema,
		filePath: z.string().min(1),
		mimeType: z.enum(["image/gif", "image/png"]),
		sourceKind: sourceKindSchema,
		playback: playbackSchema,
	})
	.strict();

const localCategorySchema = z
	.object({
		id: z.string().regex(RESOURCE_ID_PATTERN),
		label: z.string().trim().min(1).max(80),
		sourcePanel: z.string().trim().min(1).max(160),
		items: z.array(localItemSchema).min(1).max(100),
	})
	.strict();

const localManifestSchema = z
	.object({
		version: z.literal(1),
		referenceOnly: z.literal(true).optional(),
		generatedAt: z.string().min(1).optional(),
		categories: z.array(localCategorySchema).min(1).max(100),
	})
	.strict();

const reportSuccessFields = {
	categoryId: z.string().regex(RESOURCE_ID_PATTERN),
	category: z.string().trim().min(1).max(80),
	endpointRow: z.number().int().nonnegative().nullable(),
	position: z.number().int().nonnegative(),
	id: z.string().regex(RESOURCE_ID_PATTERN),
	title: z.string().trim().min(1).max(120),
	sourceKind: sourceKindSchema,
	mimeType: z.enum(["image/gif", "image/png"]),
	filePath: z.string().min(1),
	codec: z.enum(["gif", "png"]),
	width: z.number().int().positive(),
	height: z.number().int().positive(),
	frameCount: z.number().int().positive(),
	frameRate: z.number().positive().nullable(),
	durationSeconds: z.number().positive().nullable(),
	byteSize: z.number().int().positive().max(MAX_LOCAL_REFERENCE_ASSET_BYTES),
	sha256: z.string().regex(SHA256_PATTERN),
};

const reportSuccessSchema = z.object(reportSuccessFields).strict();
const legacyReportSuccessSchema = z
	.object({
		...reportSuccessFields,
		nonEmpty: z.literal(true),
		reusedExistingFile: z.boolean(),
	})
	.strict();

const legacyReportSchema = z
	.object({
		version: z.literal(1),
		referenceOnly: z.literal(true).optional(),
		success: z.array(legacyReportSuccessSchema).min(1),
	})
	.passthrough();

const currentReportSchema = z
	.object({
		version: z.literal(2),
		referenceOnly: z.literal(true),
		success: z.array(reportSuccessSchema).min(1),
	})
	.passthrough();

const reportSchema = z.discriminatedUnion("version", [
	legacyReportSchema,
	currentReportSchema,
]);

export type LocalReferenceManifest = z.infer<typeof localManifestSchema>;
export type LocalReferenceManifestCategory = z.infer<
	typeof localCategorySchema
>;
export type LocalReferenceManifestItem = z.infer<typeof localItemSchema>;
export type LocalReferenceReport = z.infer<typeof reportSchema>;
export type LocalReferenceReportItem = z.infer<typeof reportSuccessSchema>;

function assertNoUrls({
	path = "root",
	value,
}: {
	path?: string;
	value: unknown;
}): void {
	if (typeof value === "string") {
		if (URL_SCHEME_PATTERN.test(value)) {
			throw new Error(`URL-bearing input is forbidden at ${path}`);
		}
		return;
	}
	if (Array.isArray(value)) {
		for (const [index, item] of value.entries()) {
			assertNoUrls({ path: `${path}.${index}`, value: item });
		}
		return;
	}
	if (typeof value !== "object" || value === null) return;
	for (const [key, item] of Object.entries(value)) {
		if (
			URL_FIELD_PATTERN.test(key) ||
			key.toLocaleLowerCase().endsWith("url")
		) {
			throw new Error(`URL field is forbidden at ${path}.${key}`);
		}
		assertNoUrls({ path: `${path}.${key}`, value: item });
	}
}

function formatSchemaError({ error }: { error: z.ZodError }): string {
	return error.issues
		.map(({ message, path }) => `${path.join(".") || "root"}: ${message}`)
		.join("; ");
}

export function parseLocalReferenceManifest({
	candidate,
}: {
	candidate: unknown;
}): LocalReferenceManifest {
	assertNoUrls({ value: candidate });
	const result = localManifestSchema.safeParse(candidate);
	if (!result.success) {
		throw new Error(
			`Invalid local sticker manifest: ${formatSchemaError({ error: result.error })}`
		);
	}
	return result.data;
}

export function parseLocalReferenceReport({
	candidate,
}: {
	candidate: unknown;
}): LocalReferenceReport {
	assertNoUrls({ value: candidate });
	const result = reportSchema.safeParse(candidate);
	if (!result.success) {
		throw new Error(
			`Invalid local sticker report: ${formatSchemaError({ error: result.error })}`
		);
	}
	return result.data;
}
