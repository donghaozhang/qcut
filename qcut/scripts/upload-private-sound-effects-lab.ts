import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const localItemSchema = z
	.object({
		fileName: z.string().regex(/^[a-f0-9]{32}\.mp3$/),
		filePath: z.string().trim().min(1),
		byteSize: z.number().int().positive(),
		contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
	})
	.passthrough();

const localManifestSchema = z
	.object({
		schemaVersion: z.literal(1),
		catalogId: z.string().regex(/^jianying-sfx-reference-\d{4}-\d{2}-\d{2}$/),
		items: z.array(localItemSchema).min(1),
	})
	.passthrough();

const privateItemSchema = z
	.object({
		fileName: z.string().regex(/^[a-f0-9]{32}\.mp3$/),
		byteSize: z.number().int().positive(),
		contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
		asset: z
			.object({
				kind: z.literal("supabase-storage"),
				objectKey: z
					.string()
					.regex(/^jianying\/\d{4}-\d{2}-\d{2}\/assets\/[a-f0-9]{32}\.mp3$/),
				byteSize: z.number().int().positive(),
				checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
			})
			.strict(),
	})
	.passthrough();

const privateManifestSchema = z
	.object({
		schemaVersion: z.literal(2),
		catalogId: z.string().regex(/^jianying-sfx-reference-\d{4}-\d{2}-\d{2}$/),
		items: z.array(privateItemSchema).min(1),
	})
	.passthrough();

interface CliOptions {
	bucket: string;
	concurrency: number;
	localManifestPath: string;
	privateManifestPath: string;
}

interface UploadEntry {
	byteSize: number;
	contentType: "audio/mpeg";
	filePath: string;
	objectKey: string;
}

function argumentValue({
	args,
	name,
}: {
	args: readonly string[];
	name: string;
}): string | undefined {
	const index = args.indexOf(name);
	if (index < 0) return undefined;
	return args.at(index + 1);
}

export function parseCliOptions({
	args,
}: {
	args: readonly string[];
}): CliOptions {
	const localManifestPath = argumentValue({ args, name: "--local-manifest" });
	const privateManifestPath = argumentValue({
		args,
		name: "--private-manifest",
	});
	if (!localManifestPath || !privateManifestPath) {
		throw new Error(
			"Usage: bun scripts/upload-private-sound-effects-lab.ts --local-manifest <local.json> --private-manifest <private.json> [--bucket sound-effects-lab] [--concurrency 8]"
		);
	}
	const concurrency = Number(
		argumentValue({ args, name: "--concurrency" }) ?? "8"
	);
	if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) {
		throw new Error("--concurrency must be an integer between 1 and 32");
	}
	return {
		bucket: argumentValue({ args, name: "--bucket" }) ?? "sound-effects-lab",
		concurrency,
		localManifestPath: resolve(localManifestPath),
		privateManifestPath: resolve(privateManifestPath),
	};
}

export function buildUploadEntries({
	localManifest,
	privateManifest,
}: {
	localManifest: z.infer<typeof localManifestSchema>;
	privateManifest: z.infer<typeof privateManifestSchema>;
}): UploadEntry[] {
	if (localManifest.catalogId !== privateManifest.catalogId) {
		throw new Error("Local and private manifests use different catalog IDs");
	}
	if (localManifest.items.length !== privateManifest.items.length) {
		throw new Error(
			"Local and private manifests contain different item counts"
		);
	}
	const localItemsByFileName = new Map(
		localManifest.items.map((item) => [item.fileName, item])
	);
	return privateManifest.items.map((privateItem) => {
		const localItem = localItemsByFileName.get(privateItem.fileName);
		if (!localItem) {
			throw new Error(`Missing local source for ${privateItem.fileName}`);
		}
		if (
			localItem.byteSize !== privateItem.byteSize ||
			localItem.byteSize !== privateItem.asset.byteSize ||
			localItem.contentSha256 !== privateItem.contentSha256 ||
			localItem.contentSha256 !== privateItem.asset.checksumSha256
		) {
			throw new Error(
				`Manifest integrity mismatch for ${privateItem.fileName}`
			);
		}
		if (statSync(localItem.filePath).size !== localItem.byteSize) {
			throw new Error(`Local file size mismatch for ${privateItem.fileName}`);
		}
		const contentSha256 = createHash("sha256")
			.update(readFileSync(localItem.filePath))
			.digest("hex");
		if (contentSha256 !== localItem.contentSha256) {
			throw new Error(
				`Local file SHA-256 mismatch for ${privateItem.fileName}`
			);
		}
		return {
			byteSize: localItem.byteSize,
			contentType: "audio/mpeg",
			filePath: localItem.filePath,
			objectKey: privateItem.asset.objectKey,
		};
	});
}

function encodedObjectKey({ objectKey }: { objectKey: string }): string {
	return objectKey.split("/").map(encodeURIComponent).join("/");
}

async function uploadObject({
	apiKey,
	body,
	bucket,
	contentType,
	objectKey,
	supabaseUrl,
}: {
	apiKey: string;
	body: Blob;
	bucket: string;
	contentType: string;
	objectKey: string;
	supabaseUrl: string;
}): Promise<void> {
	const response = await fetch(
		`${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/${encodeURIComponent(
			bucket
		)}/${encodedObjectKey({ objectKey })}`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				apikey: apiKey,
				"Content-Type": contentType,
				"x-upsert": "true",
			},
			body,
		}
	);
	if (!response.ok) {
		throw new Error(`Upload failed (${response.status}) for ${objectKey}`);
	}
}

async function uploadEntries({
	apiKey,
	bucket,
	concurrency,
	entries,
	supabaseUrl,
}: {
	apiKey: string;
	bucket: string;
	concurrency: number;
	entries: UploadEntry[];
	supabaseUrl: string;
}): Promise<void> {
	let nextIndex = 0;
	let completed = 0;
	const uploadNext = async (): Promise<void> => {
		const index = nextIndex;
		nextIndex += 1;
		const entry = entries[index];
		if (!entry) return;
		await uploadObject({
			apiKey,
			body: Bun.file(entry.filePath),
			bucket,
			contentType: entry.contentType,
			objectKey: entry.objectKey,
			supabaseUrl,
		});
		completed += 1;
		if (completed % 25 === 0 || completed === entries.length) {
			process.stdout.write(`Uploaded ${completed}/${entries.length}\n`);
		}
		return uploadNext();
	};
	await Promise.all(
		Array.from({ length: Math.min(concurrency, entries.length) }, uploadNext)
	);
}

export async function run({ options }: { options: CliOptions }): Promise<void> {
	const supabaseUrl = process.env.SUPABASE_URL?.trim();
	const apiKey = process.env.SUPABASE_SERVICE_KEY?.trim();
	if (!supabaseUrl || !apiKey) {
		throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY are required");
	}
	const localText = readFileSync(options.localManifestPath, "utf8");
	const privateText = readFileSync(options.privateManifestPath, "utf8");
	if (privateText.includes('"filePath"')) {
		throw new Error("Private manifest must not contain local file paths");
	}
	const localManifest = localManifestSchema.parse(JSON.parse(localText));
	const privateManifest = privateManifestSchema.parse(JSON.parse(privateText));
	const entries = buildUploadEntries({ localManifest, privateManifest });
	await uploadEntries({
		apiKey,
		bucket: options.bucket,
		concurrency: options.concurrency,
		entries,
		supabaseUrl,
	});
	const catalogDate = privateManifest.catalogId.slice(-10);
	const manifestObjectKey = `jianying/${catalogDate}/manifest.json`;
	await uploadObject({
		apiKey,
		body: new Blob([privateText], { type: "application/json" }),
		bucket: options.bucket,
		contentType: "application/json",
		objectKey: manifestObjectKey,
		supabaseUrl,
	});
	process.stdout.write(
		`${JSON.stringify(
			{
				status: "ok",
				bucket: options.bucket,
				manifestObjectKey,
				items: entries.length,
			},
			null,
			2
		)}\n`
	);
}

if (import.meta.main) {
	await run({ options: parseCliOptions({ args: process.argv.slice(2) }) });
}
