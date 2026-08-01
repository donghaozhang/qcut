import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { z } from "zod";

const sourceResourceSchema = z
	.object({
		batch: z.enum(["01", "02"]),
		title: z.string().trim().min(1).max(160),
		resourceId: z.string().regex(/^\d{16,20}$/),
		contentMd5: z.string().regex(/^[a-f0-9]{32}$/),
		fileName: z.string().regex(/^[a-f0-9]{32}\.mp3$/),
		localPath: z.string().trim().min(1),
		mappingStrategy: z.enum([
			"metadata-md5",
			"isolated-card-download-probe",
			"isolated-card-download",
		]),
		categories: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
	})
	.strict();

const sourceMapSchema = z
	.object({
		schemaVersion: z.literal(1),
		generatedAt: z.string().datetime(),
		summary: z.record(z.string(), z.number()),
		resources: z.array(sourceResourceSchema).min(1).max(2_000),
	})
	.strict();

interface CliOptions {
	catalogDate: string;
	ffprobePath: string;
	inputPath: string;
	outputPath: string;
	remoteOutputPath?: string;
}

interface FfprobeOutput {
	format?: { duration?: string };
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
	const inputPath = argumentValue({ args, name: "--input" });
	const outputPath = argumentValue({ args, name: "--output" });
	const remoteOutputPath = argumentValue({ args, name: "--remote-output" });
	if (!inputPath || !outputPath) {
		throw new Error(
			"Usage: bun scripts/build-local-sound-effects-lab-manifest.ts --input <combined-map.json> --output <local-manifest.json> [--remote-output <private-manifest.json>] [--catalog-date YYYY-MM-DD] [--ffprobe /path/to/ffprobe]"
		);
	}
	const catalogDate =
		argumentValue({ args, name: "--catalog-date" }) ??
		new Date().toISOString().slice(0, 10);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(catalogDate)) {
		throw new Error("--catalog-date must use YYYY-MM-DD");
	}
	return {
		catalogDate,
		ffprobePath:
			argumentValue({ args, name: "--ffprobe" }) ??
			process.env.FFPROBE_PATH ??
			"ffprobe",
		inputPath: resolve(inputPath),
		outputPath: resolve(outputPath),
		remoteOutputPath: remoteOutputPath ? resolve(remoteOutputPath) : undefined,
	};
}

function hashBytes({
	algorithm,
	bytes,
}: {
	algorithm: "md5" | "sha256";
	bytes: Buffer;
}): string {
	return createHash(algorithm).update(bytes).digest("hex");
}

function categoryId({ label }: { label: string }): string {
	return `jianying-${createHash("sha256").update(label).digest("hex").slice(0, 12)}`;
}

function probeDuration({
	ffprobePath,
	filePath,
}: {
	ffprobePath: string;
	filePath: string;
}): number {
	const result = Bun.spawnSync({
		cmd: [
			ffprobePath,
			"-v",
			"error",
			"-show_entries",
			"format=duration",
			"-of",
			"json",
			filePath,
		],
		stderr: "pipe",
		stdout: "pipe",
	});
	if (result.exitCode !== 0) {
		throw new Error(
			`ffprobe failed for ${filePath}: ${result.stderr.toString().trim()}`
		);
	}
	const parsed = JSON.parse(result.stdout.toString()) as FfprobeOutput;
	const duration = Number(parsed.format?.duration);
	if (!Number.isFinite(duration) || duration <= 0) {
		throw new Error(`ffprobe returned an invalid duration for ${filePath}`);
	}
	return Number(duration.toFixed(6));
}

export function buildManifest({
	catalogDate,
	ffprobePath,
	source,
}: {
	catalogDate: string;
	ffprobePath: string;
	source: z.infer<typeof sourceMapSchema>;
}) {
	const categoryLabels = Array.from(
		new Set(source.resources.flatMap((resource) => resource.categories))
	);
	const categories = categoryLabels.map((label) => ({
		id: categoryId({ label }),
		label,
	}));
	const categoryIdsByLabel = new Map(
		categories.map((category) => [category.label, category.id])
	);
	if (
		new Set(categories.map((category) => category.id)).size !==
		categories.length
	) {
		throw new Error("Generated category IDs are not unique");
	}

	const items = source.resources.map((resource, index) => {
		if (!isAbsolute(resource.localPath) || !existsSync(resource.localPath)) {
			throw new Error(
				`Missing absolute local audio path: ${resource.localPath}`
			);
		}
		const bytes = readFileSync(resource.localPath);
		const actualMd5 = hashBytes({ algorithm: "md5", bytes });
		if (actualMd5 !== resource.contentMd5) {
			throw new Error(`MD5 mismatch for ${resource.localPath}`);
		}
		const fileStats = statSync(resource.localPath);
		return {
			id: resource.resourceId,
			numericId: -900_000_000 - index,
			title: resource.title,
			fileName: resource.fileName,
			filePath: resource.localPath,
			mimeType: "audio/mpeg" as const,
			byteSize: fileStats.size,
			duration: probeDuration({
				ffprobePath,
				filePath: resource.localPath,
			}),
			contentMd5: actualMd5,
			contentSha256: hashBytes({ algorithm: "sha256", bytes }),
			resourceId: resource.resourceId,
			batch: resource.batch,
			mappingStrategy: resource.mappingStrategy,
			categoryIds: resource.categories.map((label) => {
				const id = categoryIdsByLabel.get(label);
				if (!id) throw new Error(`Missing generated category: ${label}`);
				return id;
			}),
		};
	});

	return {
		schemaVersion: 1 as const,
		catalogId: `jianying-sfx-reference-${catalogDate}`,
		generatedAt: new Date().toISOString(),
		provenance: {
			sourceApp: "Jianying Pro" as const,
			purpose: "internal-reference" as const,
			redistribution: "prohibited" as const,
		},
		categories,
		items,
	};
}

export function buildPrivateManifest({
	catalogDate,
	localManifest,
}: {
	catalogDate: string;
	localManifest: ReturnType<typeof buildManifest>;
}) {
	return {
		schemaVersion: 2 as const,
		catalogId: localManifest.catalogId,
		generatedAt: localManifest.generatedAt,
		provenance: localManifest.provenance,
		categories: localManifest.categories,
		items: localManifest.items.map((item) => ({
			id: item.id,
			numericId: item.numericId,
			title: item.title,
			fileName: item.fileName,
			mimeType: item.mimeType,
			byteSize: item.byteSize,
			duration: item.duration,
			contentMd5: item.contentMd5,
			contentSha256: item.contentSha256,
			resourceId: item.resourceId,
			batch: item.batch,
			mappingStrategy: item.mappingStrategy,
			categoryIds: item.categoryIds,
			asset: {
				kind: "supabase-storage" as const,
				objectKey: `jianying/${catalogDate}/assets/${item.fileName}`,
				byteSize: item.byteSize,
				checksumSha256: item.contentSha256,
			},
		})),
	};
}

export function run({ options }: { options: CliOptions }): void {
	const candidate: unknown = JSON.parse(
		readFileSync(options.inputPath, "utf8")
	);
	const source = sourceMapSchema.parse(candidate);
	const manifest = buildManifest({
		catalogDate: options.catalogDate,
		ffprobePath: options.ffprobePath,
		source,
	});
	mkdirSync(dirname(options.outputPath), { recursive: true });
	writeFileSync(options.outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
	const privateManifest = options.remoteOutputPath
		? buildPrivateManifest({
				catalogDate: options.catalogDate,
				localManifest: manifest,
			})
		: undefined;
	if (options.remoteOutputPath && privateManifest) {
		mkdirSync(dirname(options.remoteOutputPath), { recursive: true });
		writeFileSync(
			options.remoteOutputPath,
			`${JSON.stringify(privateManifest, null, 2)}\n`
		);
	}
	process.stdout.write(
		`${JSON.stringify(
			{
				status: "ok",
				inputPath: options.inputPath,
				outputPath: options.outputPath,
				remoteOutputPath: options.remoteOutputPath,
				categories: manifest.categories.length,
				items: manifest.items.length,
			},
			null,
			2
		)}\n`
	);
}

if (import.meta.main) {
	run({ options: parseCliOptions({ args: process.argv.slice(2) }) });
}
