import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { TextDecoder, TextEncoder } from "node:util";
import { z } from "zod";
import {
	MAX_ASSET_BYTES,
	type LocalStickerManifest,
	type PrivateStickerManifest,
	type ReferenceBatchReport,
} from "./types";

const RESOURCE_ID_PATTERN = /^\d+$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MAX_JSON_BYTES = 16 * 1024 * 1024;
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
	.refine((value) => !/[\\/]/.test(value), "fileName contains a separator");

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

const reportSuccessSchema = z
	.object({
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
		byteSize: z.number().int().positive().max(MAX_ASSET_BYTES),
		sha256: z.string().regex(SHA256_PATTERN),
	})
	.strict();
const reportSchema = z
	.object({
		version: z.literal(2),
		referenceOnly: z.literal(true),
		success: z.array(reportSuccessSchema).min(1),
	})
	.passthrough();

const privateAssetSchema = z
	.object({
		kind: z.literal("supabase-storage"),
		objectKey: z.string().min(1),
		byteSize: z.number().int().positive().max(MAX_ASSET_BYTES),
		checksumSha256: z.string().regex(SHA256_PATTERN),
	})
	.strict();
const privateItemSchema = z
	.object({
		id: z.string().regex(RESOURCE_ID_PATTERN),
		displayName: z.string().trim().min(1).max(120),
		fileName: fileNameSchema,
		mimeType: z.enum(["image/gif", "image/png"]),
		sourceKind: sourceKindSchema,
		playback: playbackSchema,
		asset: privateAssetSchema,
	})
	.strict();
const privateCategorySchema = z
	.object({
		id: z.string().regex(RESOURCE_ID_PATTERN),
		label: z.string().trim().min(1).max(80),
		sourcePanel: z.string().trim().min(1).max(160),
		items: z.array(privateItemSchema).min(1).max(100),
	})
	.strict();
const privateManifestSchema = z
	.object({
		version: z.literal(2),
		catalogId: z.string().min(1),
		categories: z.array(privateCategorySchema).min(1).max(100),
	})
	.strict();

export interface JsonFile<T> {
	canonicalPath: string;
	value: T;
}

function formatSchemaError({ error }: { error: z.ZodError }): string {
	return error.issues
		.map(({ message, path }) => `${path.join(".") || "root"}: ${message}`)
		.join("; ");
}

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
			assertNoUrls({ value: item, path: `${path}.${index}` });
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
		assertNoUrls({ value: item, path: `${path}.${key}` });
	}
}

export async function readJsonFile({
	filePath,
}: {
	filePath: string;
}): Promise<JsonFile<unknown>> {
	const requestedPath = resolve(filePath);
	const requestedStats = await lstat(requestedPath);
	if (!requestedStats.isFile() || requestedStats.isSymbolicLink()) {
		throw new Error(
			`JSON input must be a regular non-symlink file: ${requestedPath}`
		);
	}
	if (requestedStats.size > MAX_JSON_BYTES) {
		throw new Error(
			`JSON input exceeds ${MAX_JSON_BYTES} bytes: ${requestedPath}`
		);
	}
	const canonicalPath = await realpath(requestedPath);
	const handle = await open(
		requestedPath,
		constants.O_RDONLY | constants.O_NOFOLLOW
	);
	try {
		const bytes = await handle.readFile();
		let jsonText: string;
		try {
			jsonText = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
		} catch {
			throw new Error(`JSON input is not valid UTF-8: ${requestedPath}`);
		}
		try {
			return { canonicalPath, value: JSON.parse(jsonText) as unknown };
		} catch {
			throw new Error(`JSON input is malformed: ${requestedPath}`);
		}
	} finally {
		await handle.close();
	}
}

export function parseLocalManifest({
	candidate,
}: {
	candidate: unknown;
}): LocalStickerManifest {
	assertNoUrls({ value: candidate });
	const result = localManifestSchema.safeParse(candidate);
	if (!result.success) {
		throw new Error(
			`Invalid local sticker manifest: ${formatSchemaError({ error: result.error })}`
		);
	}
	return result.data;
}

export function parseReferenceBatchReport({
	candidate,
}: {
	candidate: unknown;
}): ReferenceBatchReport {
	assertNoUrls({ value: candidate });
	const result = reportSchema.safeParse(candidate);
	if (!result.success) {
		throw new Error(
			`Invalid sticker batch report: ${formatSchemaError({ error: result.error })}`
		);
	}
	return result.data;
}

export function parsePrivateManifest({
	candidate,
}: {
	candidate: unknown;
}): PrivateStickerManifest {
	assertNoUrls({ value: candidate });
	const result = privateManifestSchema.safeParse(candidate);
	if (!result.success) {
		throw new Error(
			`Invalid existing private manifest: ${formatSchemaError({ error: result.error })}`
		);
	}
	return result.data;
}

export function encodePrivateManifest({
	manifest,
}: {
	manifest: PrivateStickerManifest;
}): Uint8Array {
	return new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`);
}
