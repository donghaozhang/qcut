import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
	TextAssetGeneratedEntry,
	TextAssetGeneratedFile,
} from "./verify-text-asset-cdn-manifest";
import {
	inferTextAssetCategory,
	parseCommaSeparatedList,
	parseNonNegativeInteger,
	parsePositiveInteger,
	readGeneratedManifest,
	summarizeTextAssetProvenance,
	verifyDesignerAssetCoverage,
	verifyDesignerCategoryCoverage,
} from "./verify-text-asset-cdn-manifest";

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
	allowUnchanged: boolean;
	dryRun: boolean;
	generatedManifestPath: string;
	minDesignerAssets: number;
	minDesignerAssetsPerCategory: number;
	packDir: string;
	packManifestPath: string;
	publicDir: string;
	requiredDesignerCategories: string[];
	writePlanPath?: string;
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
	designerImportedAssets: number;
	designerImportedCategories: number;
	dryRun: boolean;
	totalAssets: number;
	totalBytes: number;
	totalFiles: number;
};

export type TextDesignerAssetImportPlanReport = {
	generatedAt: string;
	items: TextDesignerAssetImportPlanItem[];
	schemaVersion: 1;
	summary: TextDesignerAssetImportSummary;
};

type DesignerAssetRoleSource = {
	expectedPackageFiles?: DesignerAssetPackageFileReferences;
	role: TextDesignerAssetImportRole;
	sourcePath: string;
	targetFile: TextAssetGeneratedFile | undefined;
};

type DesignerAssetPackageFileReferences = {
	source: string;
	thumbnail: string;
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
		allowUnchanged: false,
		dryRun: false,
		generatedManifestPath: DEFAULT_GENERATED_MANIFEST_PATH,
		minDesignerAssets: 0,
		minDesignerAssetsPerCategory: 1,
		packDir: "",
		packManifestPath: "",
		publicDir: DEFAULT_PUBLIC_DIR,
		requiredDesignerCategories: [],
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--allow-unchanged") {
			options.allowUnchanged = true;
			continue;
		}
		if (arg === "--dry-run") {
			options.dryRun = true;
			continue;
		}
		if (arg === "--generated-manifest") {
			options.generatedManifestPath = requireValue({ argv, index, name: arg });
			index += 1;
			continue;
		}
		if (arg === "--min-designer-assets") {
			options.minDesignerAssets = parseNonNegativeInteger({
				name: arg,
				value: requireValue({ argv, index, name: arg }),
			});
			index += 1;
			continue;
		}
		if (arg === "--min-designer-assets-per-category") {
			options.minDesignerAssetsPerCategory = parsePositiveInteger({
				name: arg,
				value: requireValue({ argv, index, name: arg }),
			});
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
		if (arg === "--require-designer-categories") {
			options.requiredDesignerCategories = parseCommaSeparatedList({
				name: arg,
				value: requireValue({ argv, index, name: arg }),
			});
			index += 1;
			continue;
		}
		if (arg === "--write-plan") {
			options.writePlanPath = requireValue({ argv, index, name: arg });
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
	allowUnchanged = false,
	generatedManifest,
	minDesignerAssets = 0,
	minDesignerAssetsPerCategory = 1,
	packDir,
	packManifest,
	publicDir,
	requiredDesignerCategories = [],
}: {
	allowUnchanged?: boolean;
	generatedManifest: Record<string, TextAssetGeneratedEntry>;
	minDesignerAssets?: number;
	minDesignerAssetsPerCategory?: number;
	packDir: string;
	packManifest: TextDesignerAssetPackManifest;
	publicDir: string;
	requiredDesignerCategories?: readonly string[];
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
			const items = await Promise.all(
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
			assertDesignerAssetChanged({
				allowUnchanged,
				assetId: asset.assetId,
				items,
				targetEntry,
			});
			return items;
		})
	);
	const items = itemGroups.flat();
	const updatedManifest = applyPlanToManifest({
		generatedManifest,
		items,
	});
	assertDesignerReadyCoverage({
		generatedManifest: updatedManifest,
		minDesignerAssets,
		minDesignerAssetsPerCategory,
		requiredDesignerCategories,
	});
	return {
		items,
		updatedManifest,
	};
}

function assertDesignerReadyCoverage({
	generatedManifest,
	minDesignerAssets,
	minDesignerAssetsPerCategory,
	requiredDesignerCategories,
}: {
	generatedManifest: Record<string, TextAssetGeneratedEntry>;
	minDesignerAssets: number;
	minDesignerAssetsPerCategory: number;
	requiredDesignerCategories: readonly string[];
}): void {
	const provenance = summarizeTextAssetProvenance({ generatedManifest });
	const issues = [
		...verifyDesignerAssetCoverage({ minDesignerAssets, provenance }),
		...verifyDesignerCategoryCoverage({
			generatedManifest,
			minDesignerAssetsPerCategory,
			requiredDesignerCategories,
		}),
	];
	if (issues.length === 0) return;
	throw new Error(
		`Designer asset pack does not satisfy ready coverage: ${issues
			.map((issue) => issue.detail)
			.join("; ")}`
	);
}

function assertDesignerAssetChanged({
	allowUnchanged,
	assetId,
	items,
	targetEntry,
}: {
	allowUnchanged: boolean;
	assetId: string;
	items: readonly TextDesignerAssetImportPlanItem[];
	targetEntry: TextAssetGeneratedEntry;
}): void {
	if (allowUnchanged) return;
	const hasChangedFile = items.some((item) => {
		const currentFile = currentGeneratedFileForRole({
			role: item.role,
			targetEntry,
		});
		return currentFile?.checksumSha256 !== item.checksumSha256;
	});
	if (hasChangedFile) return;
	throw new Error(
		`Designer asset files are unchanged from current generated asset: ${assetId}`
	);
}

function currentGeneratedFileForRole({
	role,
	targetEntry,
}: {
	role: TextDesignerAssetImportRole;
	targetEntry: TextAssetGeneratedEntry;
}): TextAssetGeneratedFile | undefined {
	if (role === "thumbnail") return targetEntry.thumbnail;
	if (role === "source") return targetEntry.source;
	return targetEntry.qcutPackage;
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
	const provenance = summarizeTextAssetProvenance({
		generatedManifest: plan.updatedManifest,
	});
	const designerCategories = new Set<string>();
	for (const entry of Object.values(plan.updatedManifest)) {
		if (entry.provenance?.source !== "designer-imported") continue;
		const category = inferTextAssetCategory({ entry });
		if (category) designerCategories.add(category);
	}
	return {
		copiedFiles: dryRun ? 0 : plan.items.length,
		designerImportedAssets: provenance.designerImported,
		designerImportedCategories: designerCategories.size,
		dryRun,
		totalAssets: importedAssetIds.size,
		totalBytes,
		totalFiles: plan.items.length,
	};
}

export async function writeTextDesignerAssetImportPlanReport({
	path,
	plan,
	summary,
}: {
	path: string;
	plan: TextDesignerAssetImportPlan;
	summary: TextDesignerAssetImportSummary;
}): Promise<TextDesignerAssetImportPlanReport> {
	const report: TextDesignerAssetImportPlanReport = {
		generatedAt: new Date().toISOString(),
		items: plan.items,
		schemaVersion: 1,
		summary,
	};
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(report, null, "\t")}\n`, "utf8");
	return report;
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
			expectedPackageFiles: {
				source: basename(targetEntry.source.url),
				thumbnail: basename(targetEntry.thumbnail.url),
			},
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
		expectedPackageFiles: roleSource.expectedPackageFiles,
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
	expectedPackageFiles,
	role,
	sourcePath,
	targetEntry,
}: {
	assetId: string;
	bytes: Buffer;
	expectedPackageFiles?: DesignerAssetPackageFileReferences;
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
		if (!isWebpBytes({ bytes })) {
			throw new Error(
				`Designer thumbnail must contain a WebP payload: ${assetId}`
			);
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
		assertDesignerTemplatePayload({
			assetId,
			payload,
			role,
		});
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
	assertDesignerPackageFileReferences({
		assetId,
		expectedPackageFiles,
		payload,
	});
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
	assertDesignerTemplatePayload({
		assetId,
		payload: source,
		role: "package source",
	});
}

function assertDesignerTemplatePayload({
	assetId,
	payload,
	role,
}: {
	assetId: string;
	payload: Record<string, unknown>;
	role: string;
}): void {
	const templateError = textTemplatePayloadError({
		label: `${role} template`,
		value: payload.template,
	});
	if (templateError) {
		throw new Error(`Designer ${templateError}: ${assetId}`);
	}
	const templatePackError = textTemplatePackPayloadError({
		label: `${role} templatePack`,
		value: payload.templatePack,
	});
	if (templatePackError) {
		throw new Error(`Designer ${templatePackError}: ${assetId}`);
	}
}

function textTemplatePayloadError({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): string | null {
	const template = isRecord(value) ? value : null;
	if (!template || template.type !== "text") {
		return `${label} must be a text element`;
	}
	const missingFields = ["id", "name", "content"].filter((field) => {
		const fieldValue = template[field];
		return typeof fieldValue !== "string" || fieldValue.length === 0;
	});
	return missingFields.length === 0
		? null
		: `${label} missing text fields: ${missingFields.join(", ")}`;
}

function textTemplatePackPayloadError({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): string | null {
	if (value === undefined) return null;
	const pack = isRecord(value) ? value : null;
	if (!pack) return `${label} must be a JSON object`;
	const missingFields = ["id", "name", "category"].filter((field) => {
		const fieldValue = pack[field];
		return typeof fieldValue !== "string" || fieldValue.length === 0;
	});
	if (missingFields.length > 0) {
		return `${label} missing fields: ${missingFields.join(", ")}`;
	}
	if (!Array.isArray(pack.elements)) {
		return `${label} elements must be an array`;
	}
	for (const [index, element] of pack.elements.entries()) {
		const elementError = textTemplatePayloadError({
			label: `${label} element ${index}`,
			value: element,
		});
		if (elementError) return elementError;
	}
	return textTemplatePackCopySlotsError({
		elementCount: pack.elements.length,
		label,
		value: pack.copySlots,
	});
}

function textTemplatePackCopySlotsError({
	elementCount,
	label,
	value,
}: {
	elementCount: number;
	label: string;
	value: unknown;
}): string | null {
	if (value === undefined) return null;
	if (!Array.isArray(value)) return `${label} copySlots must be an array`;
	for (const [index, slot] of value.entries()) {
		const record = isRecord(slot) ? slot : null;
		if (!record) return `${label} copy slot ${index} must be a JSON object`;
		const missingFields = ["id", "label", "defaultContent"].filter(
			(field) => typeof record[field] !== "string"
		);
		if (missingFields.length > 0) {
			return `${label} copy slot ${index} missing fields: ${missingFields.join(", ")}`;
		}
		const elementIndex = record.elementIndex;
		if (!Number.isInteger(elementIndex)) {
			return `${label} copy slot ${index} elementIndex must be an integer`;
		}
		if (elementIndex < 0 || elementIndex >= elementCount) {
			return `${label} copy slot ${index} elementIndex is out of range`;
		}
	}
	return null;
}

function assertDesignerPackageFileReferences({
	assetId,
	expectedPackageFiles,
	payload,
}: {
	assetId: string;
	expectedPackageFiles?: DesignerAssetPackageFileReferences;
	payload: Record<string, unknown>;
}): void {
	const files = isRecord(payload.files) ? payload.files : null;
	if (!files) {
		throw new Error(`Designer package files are missing: ${assetId}`);
	}
	if (typeof files.source !== "string" || typeof files.thumbnail !== "string") {
		throw new Error(`Designer package files are invalid: ${assetId}`);
	}
	if (!expectedPackageFiles) return;
	const mismatches = [
		identityMismatch({
			actual: files.source,
			expected: expectedPackageFiles.source,
			field: "files.source",
		}),
		identityMismatch({
			actual: files.thumbnail,
			expected: expectedPackageFiles.thumbnail,
			field: "files.thumbnail",
		}),
	].filter((mismatch): mismatch is string => Boolean(mismatch));
	if (mismatches.length === 0) return;
	throw new Error(
		`Designer package file reference mismatch for ${assetId}: ${mismatches.join(", ")}`
	);
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

function isWebpBytes({ bytes }: { bytes: Buffer }): boolean {
	return (
		bytes.byteLength >= 12 &&
		bytes.toString("ascii", 0, 4) === "RIFF" &&
		bytes.toString("ascii", 8, 12) === "WEBP"
	);
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
		allowUnchanged: options.allowUnchanged,
		generatedManifest,
		minDesignerAssets: options.minDesignerAssets,
		minDesignerAssetsPerCategory: options.minDesignerAssetsPerCategory,
		packDir: options.packDir,
		packManifest,
		publicDir: options.publicDir,
		requiredDesignerCategories: options.requiredDesignerCategories,
	});
	const summary = await applyTextDesignerAssetImportPlan({
		dryRun: options.dryRun,
		generatedManifestPath: options.generatedManifestPath,
		plan,
	});
	if (options.writePlanPath) {
		await writeTextDesignerAssetImportPlanReport({
			path: options.writePlanPath,
			plan,
			summary,
		});
	}
	console.log(JSON.stringify({ ok: true, ...summary }, null, "\t"));
}

if (import.meta.main) {
	await main();
}
