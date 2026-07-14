export const ASSET_MANIFEST_SCHEMA_VERSION = 1 as const;

export const ASSET_KINDS = [
	"sticker",
	"text-template",
	"caption-style",
	"filter",
	"transition",
	"sound-effect",
	"music",
	"template",
] as const;

export type AssetKind = (typeof ASSET_KINDS)[number];

export const ASSET_FILE_ROLES = [
	"thumbnail",
	"preview",
	"source",
	"lut",
	"font",
	"waveform",
	"package",
] as const;

export type AssetFileRole = (typeof ASSET_FILE_ROLES)[number];
export type AssetDelivery = "bundled" | "remote" | "generated";
export type AssetCommercialUse = "allowed" | "restricted" | "unknown";

export interface AssetManifestFile {
	role: AssetFileRole;
	url: string;
	mimeType?: string;
	byteSize?: number;
	checksumSha256?: string;
}

export interface AssetLicense {
	name: string;
	spdxId?: string;
	commercialUse: AssetCommercialUse;
	attributionRequired: boolean;
	attributionText?: string;
	sourceUrl?: string;
}

export interface AssetManifestEntry<TMetadata = unknown> {
	schemaVersion: typeof ASSET_MANIFEST_SCHEMA_VERSION;
	id: string;
	kind: AssetKind;
	version: number;
	name: string;
	localizedNames?: Readonly<Record<string, string>>;
	category: string;
	tags: readonly string[];
	delivery: AssetDelivery;
	files: readonly AssetManifestFile[];
	license: AssetLicense;
	metadata?: TMetadata;
}

export interface AssetManifestPack {
	schemaVersion: typeof ASSET_MANIFEST_SCHEMA_VERSION;
	id: string;
	version: number;
	assets: readonly AssetManifestEntry[];
}

export type AssetDownloadStatus =
	| "not-required"
	| "not-downloaded"
	| "queued"
	| "downloading"
	| "downloaded"
	| "failed";

export type AssetCacheStatus =
	| "unavailable"
	| "uncached"
	| "caching"
	| "cached"
	| "stale"
	| "failed";

export interface AssetRuntimeState {
	assetKey: string;
	favorite: boolean;
	downloadStatus: AssetDownloadStatus;
	cacheStatus: AssetCacheStatus;
	progress: number;
	cacheKey?: string;
	error?: string;
}

export type AssetManifestValidationCode =
	| "invalid-schema-version"
	| "invalid-pack-id"
	| "invalid-pack-version"
	| "invalid-asset-id"
	| "invalid-asset-kind"
	| "invalid-asset-version"
	| "invalid-asset-name"
	| "invalid-category"
	| "invalid-tag"
	| "duplicate-tag"
	| "invalid-file-role"
	| "invalid-file-url"
	| "invalid-file-byte-size"
	| "invalid-file-checksum"
	| "duplicate-file"
	| "invalid-license-name"
	| "missing-attribution"
	| "duplicate-asset-version";

export interface AssetManifestValidationIssue {
	code: AssetManifestValidationCode;
	path: string;
	message: string;
}

export interface AssetManifestValidationResult {
	valid: boolean;
	issues: readonly AssetManifestValidationIssue[];
}

export interface AssetCatalog {
	assets: readonly AssetManifestEntry[];
	latestByIdentity: ReadonlyMap<string, AssetManifestEntry>;
	versionsByIdentity: ReadonlyMap<string, readonly AssetManifestEntry[]>;
}

export interface AssetCatalogQuery {
	kinds?: readonly AssetKind[];
	categories?: readonly string[];
	tags?: readonly string[];
	commercialOnly?: boolean;
	search?: string;
}

const ASSET_KIND_SET = new Set<string>(ASSET_KINDS);
const ASSET_FILE_ROLE_SET = new Set<string>(ASSET_FILE_ROLES);
const SHA_256_PATTERN = /^[a-f\d]{64}$/i;

function isPositiveInteger({ value }: { value: number }): boolean {
	return Number.isInteger(value) && value > 0;
}

function isNonEmptyString({ value }: { value: string }): boolean {
	return value.trim().length > 0;
}

function addIssue({
	issues,
	code,
	path,
	message,
}: {
	issues: AssetManifestValidationIssue[];
	code: AssetManifestValidationCode;
	path: string;
	message: string;
}): void {
	issues.push({ code, path, message });
}

function validateAssetFile({
	file,
	path,
	issues,
}: {
	file: AssetManifestFile;
	path: string;
	issues: AssetManifestValidationIssue[];
}): void {
	if (!ASSET_FILE_ROLE_SET.has(file.role)) {
		addIssue({
			issues,
			code: "invalid-file-role",
			path: `${path}.role`,
			message: `Unsupported asset file role: ${file.role}`,
		});
	}
	if (!isNonEmptyString({ value: file.url })) {
		addIssue({
			issues,
			code: "invalid-file-url",
			path: `${path}.url`,
			message: "Asset file URL cannot be empty",
		});
	}
	if (
		file.byteSize !== undefined &&
		(!Number.isInteger(file.byteSize) || file.byteSize < 0)
	) {
		addIssue({
			issues,
			code: "invalid-file-byte-size",
			path: `${path}.byteSize`,
			message: "Asset file byte size must be a non-negative integer",
		});
	}
	if (
		file.checksumSha256 !== undefined &&
		!SHA_256_PATTERN.test(file.checksumSha256)
	) {
		addIssue({
			issues,
			code: "invalid-file-checksum",
			path: `${path}.checksumSha256`,
			message: "Asset file checksum must be a 64-character SHA-256 hex value",
		});
	}
}

function validateAssetLicense({
	license,
	path,
	issues,
}: {
	license: AssetLicense;
	path: string;
	issues: AssetManifestValidationIssue[];
}): void {
	if (!isNonEmptyString({ value: license.name })) {
		addIssue({
			issues,
			code: "invalid-license-name",
			path: `${path}.name`,
			message: "Asset license name cannot be empty",
		});
	}
	if (
		license.attributionRequired &&
		!isNonEmptyString({ value: license.attributionText ?? "" })
	) {
		addIssue({
			issues,
			code: "missing-attribution",
			path: `${path}.attributionText`,
			message: "Attribution text is required for this license",
		});
	}
}

function validateAssetEntry({
	asset,
	path,
	issues,
}: {
	asset: AssetManifestEntry;
	path: string;
	issues: AssetManifestValidationIssue[];
}): void {
	if (asset.schemaVersion !== ASSET_MANIFEST_SCHEMA_VERSION) {
		addIssue({
			issues,
			code: "invalid-schema-version",
			path: `${path}.schemaVersion`,
			message: `Unsupported asset schema version: ${asset.schemaVersion}`,
		});
	}
	if (!isNonEmptyString({ value: asset.id })) {
		addIssue({
			issues,
			code: "invalid-asset-id",
			path: `${path}.id`,
			message: "Asset ID cannot be empty",
		});
	}
	if (!ASSET_KIND_SET.has(asset.kind)) {
		addIssue({
			issues,
			code: "invalid-asset-kind",
			path: `${path}.kind`,
			message: `Unsupported asset kind: ${asset.kind}`,
		});
	}
	if (!isPositiveInteger({ value: asset.version })) {
		addIssue({
			issues,
			code: "invalid-asset-version",
			path: `${path}.version`,
			message: "Asset version must be a positive integer",
		});
	}
	if (!isNonEmptyString({ value: asset.name })) {
		addIssue({
			issues,
			code: "invalid-asset-name",
			path: `${path}.name`,
			message: "Asset name cannot be empty",
		});
	}
	if (!isNonEmptyString({ value: asset.category })) {
		addIssue({
			issues,
			code: "invalid-category",
			path: `${path}.category`,
			message: "Asset category cannot be empty",
		});
	}

	const normalizedTags = new Set<string>();
	for (const [tagIndex, tag] of asset.tags.entries()) {
		const normalizedTag = tag.trim().toLocaleLowerCase();
		if (normalizedTag.length === 0) {
			addIssue({
				issues,
				code: "invalid-tag",
				path: `${path}.tags[${tagIndex}]`,
				message: "Asset tags cannot be empty",
			});
			continue;
		}
		if (normalizedTags.has(normalizedTag)) {
			addIssue({
				issues,
				code: "duplicate-tag",
				path: `${path}.tags[${tagIndex}]`,
				message: `Duplicate asset tag: ${tag}`,
			});
		}
		normalizedTags.add(normalizedTag);
	}

	const fileKeys = new Set<string>();
	for (const [fileIndex, file] of asset.files.entries()) {
		const filePath = `${path}.files[${fileIndex}]`;
		validateAssetFile({ file, path: filePath, issues });
		const fileKey = `${file.role}:${file.url}`;
		if (fileKeys.has(fileKey)) {
			addIssue({
				issues,
				code: "duplicate-file",
				path: filePath,
				message: `Duplicate asset file: ${fileKey}`,
			});
		}
		fileKeys.add(fileKey);
	}

	validateAssetLicense({
		license: asset.license,
		path: `${path}.license`,
		issues,
	});
}

export function assetManifestIdentity({
	kind,
	id,
}: {
	kind: AssetKind;
	id: string;
}): string {
	return `${kind}:${id}`;
}

export function assetManifestVersionKey({
	kind,
	id,
	version,
}: {
	kind: AssetKind;
	id: string;
	version: number;
}): string {
	return `${assetManifestIdentity({ kind, id })}@${version}`;
}

export function validateAssetManifestPack({
	manifest,
}: {
	manifest: AssetManifestPack;
}): AssetManifestValidationResult {
	const issues: AssetManifestValidationIssue[] = [];
	if (manifest.schemaVersion !== ASSET_MANIFEST_SCHEMA_VERSION) {
		addIssue({
			issues,
			code: "invalid-schema-version",
			path: "schemaVersion",
			message: `Unsupported manifest schema version: ${manifest.schemaVersion}`,
		});
	}
	if (!isNonEmptyString({ value: manifest.id })) {
		addIssue({
			issues,
			code: "invalid-pack-id",
			path: "id",
			message: "Manifest pack ID cannot be empty",
		});
	}
	if (!isPositiveInteger({ value: manifest.version })) {
		addIssue({
			issues,
			code: "invalid-pack-version",
			path: "version",
			message: "Manifest pack version must be a positive integer",
		});
	}

	const versionKeys = new Set<string>();
	for (const [assetIndex, asset] of manifest.assets.entries()) {
		const path = `assets[${assetIndex}]`;
		validateAssetEntry({ asset, path, issues });
		const versionKey = assetManifestVersionKey({
			kind: asset.kind,
			id: asset.id,
			version: asset.version,
		});
		if (versionKeys.has(versionKey)) {
			addIssue({
				issues,
				code: "duplicate-asset-version",
				path,
				message: `Duplicate asset version: ${versionKey}`,
			});
		}
		versionKeys.add(versionKey);
	}

	return { valid: issues.length === 0, issues };
}

export function buildAssetCatalog({
	manifests,
}: {
	manifests: readonly AssetManifestPack[];
}): AssetCatalog {
	const assets: AssetManifestEntry[] = [];
	const versionKeys = new Set<string>();

	for (const manifest of manifests) {
		const validation = validateAssetManifestPack({ manifest });
		if (!validation.valid) {
			const details = validation.issues
				.map((issue) => `${issue.path}: ${issue.message}`)
				.join("; ");
			throw new Error(`Invalid asset manifest '${manifest.id}': ${details}`);
		}
		for (const asset of manifest.assets) {
			const versionKey = assetManifestVersionKey({
				kind: asset.kind,
				id: asset.id,
				version: asset.version,
			});
			if (versionKeys.has(versionKey)) {
				throw new Error(
					`Duplicate asset version across manifests: ${versionKey}`
				);
			}
			versionKeys.add(versionKey);
			assets.push(asset);
		}
	}

	const mutableVersionsByIdentity = new Map<string, AssetManifestEntry[]>();
	for (const asset of assets) {
		const identity = assetManifestIdentity({ kind: asset.kind, id: asset.id });
		const versions = mutableVersionsByIdentity.get(identity) ?? [];
		versions.push(asset);
		mutableVersionsByIdentity.set(identity, versions);
	}

	const latestByIdentity = new Map<string, AssetManifestEntry>();
	const versionsByIdentity = new Map<string, readonly AssetManifestEntry[]>();
	for (const [identity, versions] of mutableVersionsByIdentity) {
		const sortedVersions = [...versions].sort(
			(left, right) => right.version - left.version
		);
		versionsByIdentity.set(identity, sortedVersions);
		latestByIdentity.set(identity, sortedVersions[0]);
	}

	return {
		assets,
		latestByIdentity,
		versionsByIdentity,
	};
}

export function resolveAssetManifestEntry({
	catalog,
	kind,
	id,
	version,
}: {
	catalog: AssetCatalog;
	kind: AssetKind;
	id: string;
	version?: number;
}): AssetManifestEntry | undefined {
	const identity = assetManifestIdentity({ kind, id });
	if (version === undefined) return catalog.latestByIdentity.get(identity);
	return catalog.versionsByIdentity
		.get(identity)
		?.find((asset) => asset.version === version);
}

export function queryAssetCatalog({
	catalog,
	query,
}: {
	catalog: AssetCatalog;
	query: AssetCatalogQuery;
}): AssetManifestEntry[] {
	const kinds = query.kinds ? new Set(query.kinds) : undefined;
	const categories = query.categories
		? new Set(query.categories.map((category) => category.toLocaleLowerCase()))
		: undefined;
	const requiredTags = query.tags?.map((tag) => tag.toLocaleLowerCase()) ?? [];
	const search = query.search?.trim().toLocaleLowerCase();

	return [...catalog.latestByIdentity.values()].filter((asset) => {
		if (kinds && !kinds.has(asset.kind)) return false;
		if (categories && !categories.has(asset.category.toLocaleLowerCase())) {
			return false;
		}
		if (query.commercialOnly && asset.license.commercialUse !== "allowed") {
			return false;
		}
		const normalizedTags = asset.tags.map((tag) => tag.toLocaleLowerCase());
		if (!requiredTags.every((tag) => normalizedTags.includes(tag)))
			return false;
		if (!search) return true;
		const searchableText = [
			asset.name,
			asset.category,
			...Object.values(asset.localizedNames ?? {}),
			...asset.tags,
		]
			.join(" ")
			.toLocaleLowerCase();
		return searchableText.includes(search);
	});
}

export function getAssetManifestFile({
	asset,
	role,
}: {
	asset: AssetManifestEntry;
	role: AssetFileRole;
}): AssetManifestFile | undefined {
	return asset.files.find((file) => file.role === role);
}

export function createInitialAssetRuntimeState({
	asset,
}: {
	asset: AssetManifestEntry;
}): AssetRuntimeState {
	const requiresDownload = asset.delivery === "remote";
	const hasCacheableFile = asset.files.length > 0;
	return {
		assetKey: assetManifestVersionKey({
			kind: asset.kind,
			id: asset.id,
			version: asset.version,
		}),
		favorite: false,
		downloadStatus: requiresDownload ? "not-downloaded" : "not-required",
		cacheStatus: hasCacheableFile
			? requiresDownload
				? "uncached"
				: "cached"
			: "unavailable",
		progress: requiresDownload ? 0 : 1,
	};
}
