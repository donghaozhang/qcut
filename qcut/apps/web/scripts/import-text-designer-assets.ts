import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
	TextAssetGeneratedEntry,
	TextAssetGeneratedFile,
} from "./verify-text-asset-cdn-manifest";
import { readGeneratedManifest } from "./verify-text-asset-cdn-manifest";

export type TextDesignerAssetPackEntry = {
	assetId: string;
	qcutPackage: string;
	source: string;
	thumbnail: string;
};

export type TextDesignerAssetPackManifest = {
	assets: TextDesignerAssetPackEntry[];
	schemaVersion: 1;
};

export type TextDesignerAssetImportOptions = {
	dryRun: boolean;
	generatedManifestPath: string;
	packDir: string;
	packManifestPath: string;
	publicDir: string;
};

export type TextDesignerAssetImportRole = "thumbnail" | "source" | "package";

export type TextDesignerAssetImportPlanItem = {
	assetId: string;
	byteSize: number;
	checksumSha256: string;
	mimeType: string;
	role: TextDesignerAssetImportRole;
	sourcePath: string;
	targetPath: string;
	targetUrl: string;
};

export type TextDesignerAssetImportPlan = {
	items: TextDesignerAssetImportPlanItem[];
	updatedManifest: Record<string, TextAssetGeneratedEntry>;
};

export type TextDesignerAssetImportSummary = {
	copiedFiles: number;
	dryRun: boolean;
	totalAssets: number;
	totalBytes: number;
	totalFiles: number;
};

type DesignerAssetRoleSource = {
	role: TextDesignerAssetImportRole;
	sourcePath: string;
	targetFile: TextAssetGeneratedFile | undefined;
};

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_GENERATED_MANIFEST_PATH = join(
	SCRIPT_DIR,
	"../src/lib/text/text-asset-generated-manifest.json"
);
const DEFAULT_PUBLIC_DIR = join(SCRIPT_DIR, "../public");
const DESIGNER_MANIFEST_FILE = "manifest.json";

export function parseTextDesignerAssetImportArgs({
	argv,
}: {
	argv: string[];
}): TextDesignerAssetImportOptions {
	const options: TextDesignerAssetImportOptions = {
		dryRun: false,
		generatedManifestPath: DEFAULT_GENERATED_MANIFEST_PATH,
		packDir: "",
		packManifestPath: "",
		publicDir: DEFAULT_PUBLIC_DIR,
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--dry-run") {
			options.dryRun = true;
			continue;
		}
		if (arg === "--generated-manifest") {
			options.generatedManifestPath = requireValue({ argv, index, name: arg });
			index += 1;
			continue;
		}
		if (arg === "--pack-dir") {
			options.packDir = requireValue({ argv, index, name: arg });
			index += 1;
			continue;
		}
		if (arg === "--pack-manifest") {
			options.packManifestPath = requireValue({ argv, index, name: arg });
			index += 1;
			continue;
		}
		if (arg === "--public-dir") {
			options.publicDir = requireValue({ argv, index, name: arg });
			index += 1;
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}
	if (!options.packDir) {
		throw new Error("Missing designer asset pack directory. Pass --pack-dir.");
	}
	if (!options.packManifestPath) {
		options.packManifestPath = join(options.packDir, DESIGNER_MANIFEST_FILE);
	}
	return options;
}

export async function readDesignerAssetPackManifest({
	manifestPath,
}: {
	manifestPath: string;
}): Promise<TextDesignerAssetPackManifest> {
	const parsed = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
	return assertDesignerAssetPackManifest({ value: parsed });
}

export async function buildTextDesignerAssetImportPlan({
	generatedManifest,
	packDir,
	packManifest,
	publicDir,
}: {
	generatedManifest: Record<string, TextAssetGeneratedEntry>;
	packDir: string;
	packManifest: TextDesignerAssetPackManifest;
	publicDir: string;
}): Promise<TextDesignerAssetImportPlan> {
	assertUniqueAssetIds({ packManifest });
	const resolvedPackDir = resolve(packDir);
	const itemGroups = await Promise.all(
		packManifest.assets.map(async (asset) => {
			const targetEntry = generatedManifest[asset.assetId];
			if (!targetEntry) {
				throw new Error(`Unknown text asset id: ${asset.assetId}`);
			}
			const roleSources = designerAssetRoleSources({
				asset,
				targetEntry,
			});
			return Promise.all(
				roleSources.map((roleSource) =>
					buildPlanItem({
						assetId: asset.assetId,
						publicDir,
						resolvedPackDir,
						roleSource,
						targetEntry,
					})
				)
			);
		})
	);
	const items = itemGroups.flat();
	return {
		items,
		updatedManifest: applyPlanToManifest({
			generatedManifest,
			items,
		}),
	};
}

export async function applyTextDesignerAssetImportPlan({
	dryRun,
	generatedManifestPath,
	plan,
}: {
	dryRun: boolean;
	generatedManifestPath: string;
	plan: TextDesignerAssetImportPlan;
}): Promise<TextDesignerAssetImportSummary> {
	if (!dryRun) {
		await Promise.all(
			plan.items.map(async (item) => {
				await mkdir(dirname(item.targetPath), { recursive: true });
				await copyFile(item.sourcePath, item.targetPath);
			})
		);
		await writeFile(
			generatedManifestPath,
			`${JSON.stringify(plan.updatedManifest, null, "\t")}\n`,
			"utf8"
		);
	}
	const totalBytes = plan.items.reduce(
		(total, item) => total + item.byteSize,
		0
	);
	const importedAssetIds = new Set(plan.items.map((item) => item.assetId));
	return {
		copiedFiles: dryRun ? 0 : plan.items.length,
		dryRun,
		totalAssets: importedAssetIds.size,
		totalBytes,
		totalFiles: plan.items.length,
	};
}

function designerAssetRoleSources({
	asset,
	targetEntry,
}: {
	asset: TextDesignerAssetPackEntry;
	targetEntry: TextAssetGeneratedEntry;
}): DesignerAssetRoleSource[] {
	return [
		{
			role: "thumbnail",
			sourcePath: asset.thumbnail,
			targetFile: targetEntry.thumbnail,
		},
		{
			role: "source",
			sourcePath: asset.source,
			targetFile: targetEntry.source,
		},
		{
			role: "package",
			sourcePath: asset.qcutPackage,
			targetFile: targetEntry.qcutPackage,
		},
	];
}

async function buildPlanItem({
	assetId,
	publicDir,
	resolvedPackDir,
	roleSource,
	targetEntry,
}: {
	assetId: string;
	publicDir: string;
	resolvedPackDir: string;
	roleSource: DesignerAssetRoleSource;
	targetEntry: TextAssetGeneratedEntry;
}): Promise<TextDesignerAssetImportPlanItem> {
	if (!roleSource.targetFile) {
		throw new Error(`Asset ${assetId} is missing ${roleSource.role} metadata`);
	}
	const sourcePath = resolveDesignerSourcePath({
		resolvedPackDir,
		sourcePath: roleSource.sourcePath,
	});
	const bytes = await readFile(sourcePath);
	validateDesignerAssetFile({
		assetId,
		bytes,
		role: roleSource.role,
		sourcePath,
		targetEntry,
	});
	return {
		assetId,
		byteSize: bytes.byteLength,
		checksumSha256: hashBytes({ bytes }),
		mimeType: roleSource.targetFile.mimeType,
		role: roleSource.role,
		sourcePath,
		targetPath: join(publicDir, roleSource.targetFile.url.replace(/^\/+/, "")),
		targetUrl: roleSource.targetFile.url,
	};
}

function validateDesignerAssetFile({
	assetId,
	bytes,
	role,
	sourcePath,
	targetEntry,
}: {
	assetId: string;
	bytes: Buffer;
	role: TextDesignerAssetImportRole;
	sourcePath: string;
	targetEntry: TextAssetGeneratedEntry;
}): void {
	if (role === "thumbnail") {
		if (bytes.byteLength === 0) {
			throw new Error(`Designer thumbnail is empty: ${assetId}`);
		}
		if (!sourcePath.toLocaleLowerCase().endsWith(".webp")) {
			throw new Error(`Designer thumbnail must be a .webp file: ${assetId}`);
		}
		return;
	}
	const payload = parseDesignerJsonAsset({ assetId, bytes, role });
	assertDesignerAssetIdentity({
		assetId,
		payload,
		role,
		targetEntry,
	});
	if (role === "source") {
		return;
	}
	if (payload.kind !== "qcut-text-template-package") {
		throw new Error(
			`Designer package must use qcut-text-template-package: ${assetId}`
		);
	}
	if (payload.cacheKey !== targetEntry.cacheKey) {
		throw new Error(
			`Designer package cacheKey mismatch for ${assetId}: expected ${targetEntry.cacheKey}`
		);
	}
	const source = isRecord(payload.source) ? payload.source : null;
	if (!source) {
		throw new Error(`Designer package source is missing: ${assetId}`);
	}
	assertDesignerAssetIdentity({
		assetId,
		payload: source,
		role: "source",
		targetEntry,
	});
}

function parseDesignerJsonAsset({
	assetId,
	bytes,
	role,
}: {
	assetId: string;
	bytes: Buffer;
	role: TextDesignerAssetImportRole;
}): Record<string, unknown> {
	try {
		const parsed = JSON.parse(bytes.toString("utf8")) as unknown;
		if (!isRecord(parsed)) {
			throw new Error("root must be an object");
		}
		return parsed;
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new Error(`Invalid designer ${role} JSON for ${assetId}: ${detail}`);
	}
}

function assertDesignerAssetIdentity({
	assetId,
	payload,
	role,
	targetEntry,
}: {
	assetId: string;
	payload: Record<string, unknown>;
	role: "source" | "package";
	targetEntry: TextAssetGeneratedEntry;
}): void {
	const mismatches = [
		identityMismatch({
			actual: payload.assetId,
			expected: targetEntry.assetId,
			field: "assetId",
		}),
		identityMismatch({
			actual: payload.packageId,
			expected: targetEntry.packageId,
			field: "packageId",
		}),
		identityMismatch({
			actual: payload.version,
			expected: targetEntry.version,
			field: "version",
		}),
	].filter((mismatch): mismatch is string => Boolean(mismatch));
	if (mismatches.length > 0) {
		throw new Error(
			`Designer ${role} identity mismatch for ${assetId}: ${mismatches.join(", ")}`
		);
	}
}

function identityMismatch({
	actual,
	expected,
	field,
}: {
	actual: unknown;
	expected: number | string;
	field: string;
}): string | null {
	return actual === expected ? null : `${field} expected ${expected}`;
}

function applyPlanToManifest({
	generatedManifest,
	items,
}: {
	generatedManifest: Record<string, TextAssetGeneratedEntry>;
	items: readonly TextDesignerAssetImportPlanItem[];
}): Record<string, TextAssetGeneratedEntry> {
	const updatedManifest = structuredClone(generatedManifest);
	const importedAssetIds = new Set<string>();
	for (const item of items) {
		const entry = updatedManifest[item.assetId];
		if (!entry) throw new Error(`Unknown text asset id: ${item.assetId}`);
		importedAssetIds.add(item.assetId);
		const updatedFile: TextAssetGeneratedFile = {
			byteSize: item.byteSize,
			checksumSha256: item.checksumSha256,
			mimeType: item.mimeType,
			url: item.targetUrl,
		};
		if (item.role === "thumbnail") {
			entry.thumbnail = updatedFile;
			continue;
		}
		if (item.role === "source") {
			entry.source = updatedFile;
			continue;
		}
		entry.qcutPackage = updatedFile;
	}
	for (const assetId of importedAssetIds) {
		const entry = updatedManifest[assetId];
		if (!entry) throw new Error(`Unknown text asset id: ${assetId}`);
		entry.provenance = {
			source: "designer-imported",
			pipeline: "designer-pack-v1",
		};
	}
	return updatedManifest;
}

function resolveDesignerSourcePath({
	resolvedPackDir,
	sourcePath,
}: {
	resolvedPackDir: string;
	sourcePath: string;
}): string {
	const resolvedPath = resolve(resolvedPackDir, sourcePath);
	const relativePath = relative(resolvedPackDir, resolvedPath);
	if (relativePath.startsWith("..") || relativePath === "") {
		throw new Error(
			`Designer asset path escapes pack directory: ${sourcePath}`
		);
	}
	return resolvedPath;
}

function assertDesignerAssetPackManifest({
	value,
}: {
	value: unknown;
}): TextDesignerAssetPackManifest {
	if (!isRecord(value) || value.schemaVersion !== 1) {
		throw new Error("Designer asset manifest must use schemaVersion 1");
	}
	if (!Array.isArray(value.assets)) {
		throw new Error("Designer asset manifest requires an assets array");
	}
	return {
		assets: value.assets.map((asset, index) =>
			assertDesignerAssetPackEntry({ asset, index })
		),
		schemaVersion: 1,
	};
}

function assertDesignerAssetPackEntry({
	asset,
	index,
}: {
	asset: unknown;
	index: number;
}): TextDesignerAssetPackEntry {
	if (!isRecord(asset)) {
		throw new Error(`Designer asset entry ${index} must be an object`);
	}
	return {
		assetId: requiredString({ field: "assetId", index, value: asset.assetId }),
		qcutPackage: requiredString({
			field: "qcutPackage",
			index,
			value: asset.qcutPackage,
		}),
		source: requiredString({ field: "source", index, value: asset.source }),
		thumbnail: requiredString({
			field: "thumbnail",
			index,
			value: asset.thumbnail,
		}),
	};
}

function assertUniqueAssetIds({
	packManifest,
}: {
	packManifest: TextDesignerAssetPackManifest;
}): void {
	const seen = new Set<string>();
	for (const asset of packManifest.assets) {
		if (seen.has(asset.assetId)) {
			throw new Error(`Duplicate designer asset id: ${asset.assetId}`);
		}
		seen.add(asset.assetId);
	}
}

function requiredString({
	field,
	index,
	value,
}: {
	field: string;
	index: number;
	value: unknown;
}): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`Designer asset entry ${index} requires ${field}`);
	}
	return value;
}

function hashBytes({ bytes }: { bytes: Buffer }): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireValue({
	argv,
	index,
	name,
}: {
	argv: string[];
	index: number;
	name: string;
}): string {
	const value = argv[index + 1];
	if (!value) throw new Error(`${name} requires a value`);
	return value;
}

async function main(): Promise<void> {
	const options = parseTextDesignerAssetImportArgs({
		argv: process.argv.slice(2),
	});
	const [generatedManifest, packManifest] = await Promise.all([
		readGeneratedManifest({ manifestPath: options.generatedManifestPath }),
		readDesignerAssetPackManifest({ manifestPath: options.packManifestPath }),
	]);
	const plan = await buildTextDesignerAssetImportPlan({
		generatedManifest,
		packDir: options.packDir,
		packManifest,
		publicDir: options.publicDir,
	});
	const summary = await applyTextDesignerAssetImportPlan({
		dryRun: options.dryRun,
		generatedManifestPath: options.generatedManifestPath,
		plan,
	});
	console.log(JSON.stringify({ ok: true, ...summary }, null, "\t"));
}

if (import.meta.main) {
	await main();
}
