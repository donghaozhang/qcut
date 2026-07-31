import { createHash } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { lstat, open, opendir, realpath } from "node:fs/promises";
import { basename, join, posix, resolve } from "node:path";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
	buildCapCut81MigrationScaffold,
	validateCapCut81MigrationScaffold,
} from "./capcut-8-1-migration-scaffold.js";
import { getCapCut81AbsolutePathApi } from "./capcut-8-1-migration-validation.js";
import {
	CAPCUT_8_1_INSTALL_LIMITS,
	mapWithConcurrency,
} from "./capcut-8-1-migration-installer-limits.js";
import type {
	CapCut81MigrationManifest,
	CapCut81MigrationManifestAsset,
	CapCut81MigrationManifestIds,
	VerifiedCapCut81MigrationBundle,
} from "./capcut-8-1-migration-installer-types.js";

const COMPLETE_MARKER_FILE_NAME = "QCUT_EXPORT_COMPLETE.json";
const DRAFT_STORE_DIRECTORY_NAME = "com.lveditor.draft";
const MANIFEST_FILE_NAME = "qcut-capcut-migration-manifest.json";
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface BundleCompleteMarker {
	assetCount: number;
	contentSha256: string;
	manifestFile: typeof MANIFEST_FILE_NAME;
	manifestSha256: string;
	status: "complete";
	timelineMaterialsSize: number;
}

interface ListedDraftTree {
	directories: string[];
	files: Array<VerifiedCapCut81MigrationBundle["draftFiles"][number]>;
	totalBytes: number;
}

interface PendingDraftTreeEntry {
	absolutePath: string;
	depth: number;
	relativePath: string;
}

function isRecord({ value }: { value: unknown }): boolean {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireRecord({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): Record<string, unknown> {
	if (!isRecord({ value })) {
		throw new Error(`${label} must be a JSON object.`);
	}
	return value as Record<string, unknown>;
}

function requireString({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): string {
	if (typeof value !== "string") {
		throw new Error(`${label} must be a string.`);
	}
	return value;
}

function requireSafeInteger({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): number {
	if (!(Number.isSafeInteger(value) && Number(value) >= 0)) {
		throw new Error(`${label} must be a non-negative safe integer.`);
	}
	return Number(value);
}

function requireStringArray({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): string[] {
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
		throw new Error(`${label} must be an array of strings.`);
	}
	return value as string[];
}

function requireUuid({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): string {
	const uuid = requireString({ label, value });
	if (!UUID_PATTERN.test(uuid)) {
		throw new Error(`${label} must be a UUID.`);
	}
	return uuid;
}

function requireSha256({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): string {
	const sha256 = requireString({ label, value });
	if (!SHA256_PATTERN.test(sha256)) {
		throw new Error(`${label} must be a SHA-256 digest.`);
	}
	return sha256;
}

function assertSafeRelativePath({
	label,
	relativePath,
}: {
	label: string;
	relativePath: string;
}): void {
	const normalized = posix.normalize(relativePath);
	if (
		relativePath.length === 0 ||
		Buffer.byteLength(relativePath, "utf8") >
			CAPCUT_8_1_INSTALL_LIMITS.relativePathBytes ||
		normalized !== relativePath ||
		posix.isAbsolute(relativePath) ||
		relativePath.includes("\\") ||
		relativePath.includes("\0") ||
		relativePath.split("/").includes("..")
	) {
		throw new Error(`${label} is unsafe: ${relativePath}`);
	}
}

function getNodeErrorCode({ value }: { value: unknown }): string | undefined {
	if (!(value instanceof Error) || !("code" in value)) return undefined;
	const code = (value as { code?: unknown }).code;
	return typeof code === "string" ? code : undefined;
}

function assertUniquePaths({
	label,
	paths,
}: {
	label: string;
	paths: readonly string[];
}): void {
	if (new Set(paths).size !== paths.length) {
		throw new Error(`${label} contains duplicate paths.`);
	}
	for (const relativePath of paths) {
		assertSafeRelativePath({ label, relativePath });
	}
}

function assertExactStringArray({
	actual,
	expected,
	label,
}: {
	actual: readonly string[];
	expected: readonly string[];
	label: string;
}): void {
	const mismatchIndex = actual.findIndex(
		(value, index) => value !== expected[index]
	);
	if (actual.length === expected.length && mismatchIndex === -1) return;
	const firstMismatch =
		mismatchIndex >= 0
			? mismatchIndex
			: Math.min(actual.length, expected.length);
	throw new Error(
		`${label} does not match the CapCut 8.1 bundle profile ` +
			`(expected ${expected.length}, received ${actual.length}, first mismatch ${firstMismatch}).`
	);
}

function parseManifestAsset({
	expectedKind,
	label,
	value,
}: {
	expectedKind: "copied" | "generated";
	label: string;
	value: unknown;
}): CapCut81MigrationManifestAsset {
	const record = requireRecord({ label, value });
	const relativePath = requireString({
		label: `${label}.relativePath`,
		value: record.relativePath,
	});
	assertSafeRelativePath({ label: `${label}.relativePath`, relativePath });
	const expectedPattern =
		expectedKind === "generated"
			? /^com\.lveditor\.draft\/[^/]+\/assets\/lut\/[^/\\]+$/
			: /^com\.lveditor\.draft\/[^/]+\/assets\/(audio|image|video)\/[^/\\]+$/;
	if (!expectedPattern.test(relativePath)) {
		throw new Error(`${label}.relativePath has an unexpected asset location.`);
	}
	const bytes = requireSafeInteger({
		label: `${label}.bytes`,
		value: record.bytes,
	});
	if (bytes > CAPCUT_8_1_INSTALL_LIMITS.singleAssetBytes) {
		throw new Error(`${label}.bytes exceeds the single-asset limit.`);
	}
	return {
		bytes,
		relativePath,
		sha256: requireSha256({
			label: `${label}.sha256`,
			value: record.sha256,
		}),
	};
}

function parseManifestAssets({
	expectedKind,
	label,
	value,
}: {
	expectedKind: "copied" | "generated";
	label: string;
	value: unknown;
}): CapCut81MigrationManifestAsset[] {
	if (!Array.isArray(value)) {
		throw new Error(`${label} must be an array.`);
	}
	if (value.length > CAPCUT_8_1_INSTALL_LIMITS.assetCount) {
		throw new Error(`${label} exceeds the asset-count limit.`);
	}
	return value.map((item, index) =>
		parseManifestAsset({
			expectedKind,
			label: `${label}[${index}]`,
			value: item,
		})
	);
}

function parseManifestIds({
	value,
}: {
	value: unknown;
}): CapCut81MigrationManifestIds {
	const record = requireRecord({ label: "manifest.ids", value });
	const ids = {
		draftId: requireUuid({
			label: "manifest.ids.draftId",
			value: record.draftId,
		}),
		placeholderId: requireUuid({
			label: "manifest.ids.placeholderId",
			value: record.placeholderId,
		}),
		projectId: requireUuid({
			label: "manifest.ids.projectId",
			value: record.projectId,
		}),
		timelineId: requireUuid({
			label: "manifest.ids.timelineId",
			value: record.timelineId,
		}),
	};
	if (new Set(Object.values(ids)).size !== Object.values(ids).length) {
		throw new Error("CapCut migration manifest IDs must be distinct.");
	}
	return ids;
}

function parseManifest({
	value,
}: {
	value: unknown;
}): CapCut81MigrationManifest {
	const record = requireRecord({ label: "migration manifest", value });
	if (
		record.schemaVersion !== 1 ||
		record.generator !== "QCut" ||
		record.profile !== "capcut-desktop-8.1-plaintext" ||
		record.storeDirectory !== DRAFT_STORE_DIRECTORY_NAME
	) {
		throw new Error("Migration manifest profile markers are invalid.");
	}
	const content = requireRecord({
		label: "manifest.content",
		value: record.content,
	});
	const manifest: CapCut81MigrationManifest = {
		assets: parseManifestAssets({
			expectedKind: "copied",
			label: "manifest.assets",
			value: record.assets,
		}),
		content: {
			activeMirrors: requireStringArray({
				label: "manifest.content.activeMirrors",
				value: content.activeMirrors,
			}),
			backups: requireStringArray({
				label: "manifest.content.backups",
				value: content.backups,
			}),
			bytes: requireSafeInteger({
				label: "manifest.content.bytes",
				value: content.bytes,
			}),
			sha256: requireSha256({
				label: "manifest.content.sha256",
				value: content.sha256,
			}),
		},
		generatedAssets: parseManifestAssets({
			expectedKind: "generated",
			label: "manifest.generatedAssets",
			value: record.generatedAssets,
		}),
		generator: "QCut",
		ids: parseManifestIds({ value: record.ids }),
		profile: "capcut-desktop-8.1-plaintext",
		scaffoldFiles: requireStringArray({
			label: "manifest.scaffoldFiles",
			value: record.scaffoldFiles,
		}),
		schemaVersion: 1,
		storeDirectory: DRAFT_STORE_DIRECTORY_NAME,
		timelineMaterialsSize: requireSafeInteger({
			label: "manifest.timelineMaterialsSize",
			value: record.timelineMaterialsSize,
		}),
	};
	const assets = [...manifest.assets, ...manifest.generatedAssets];
	if (assets.length > CAPCUT_8_1_INSTALL_LIMITS.assetCount) {
		throw new Error("Migration manifest exceeds the asset-count limit.");
	}
	if (
		manifest.scaffoldFiles.length > CAPCUT_8_1_INSTALL_LIMITS.scaffoldFileCount
	) {
		throw new Error("Migration manifest exceeds the scaffold-file limit.");
	}
	if (manifest.content.bytes > CAPCUT_8_1_INSTALL_LIMITS.contentBytes) {
		throw new Error("Migration content exceeds the supported size.");
	}
	if (
		manifest.timelineMaterialsSize >
		CAPCUT_8_1_INSTALL_LIMITS.timelineMaterialsBytes
	) {
		throw new Error("Migration timeline materials exceed the supported size.");
	}
	const declaredAssetBytes = assets.reduce((sum, asset) => {
		const next = sum + asset.bytes;
		if (!Number.isSafeInteger(next)) {
			throw new Error("Migration asset byte total exceeds safe integers.");
		}
		return next;
	}, 0);
	if (
		declaredAssetBytes + manifest.content.bytes !==
		manifest.timelineMaterialsSize
	) {
		throw new Error("Manifest timeline material size is inconsistent.");
	}
	assertUniquePaths({
		label: "manifest content paths",
		paths: [...manifest.content.activeMirrors, ...manifest.content.backups],
	});
	assertUniquePaths({
		label: "manifest scaffold paths",
		paths: manifest.scaffoldFiles,
	});
	assertUniquePaths({
		label: "manifest asset paths",
		paths: [
			...manifest.assets.map(({ relativePath }) => relativePath),
			...manifest.generatedAssets.map(({ relativePath }) => relativePath),
		],
	});
	return manifest;
}

function parseCompleteMarker({
	value,
}: {
	value: unknown;
}): BundleCompleteMarker {
	const record = requireRecord({ label: "complete marker", value });
	if (
		record.status !== "complete" ||
		record.manifestFile !== MANIFEST_FILE_NAME
	) {
		throw new Error("CapCut migration complete marker is invalid.");
	}
	return {
		assetCount: requireSafeInteger({
			label: "complete marker assetCount",
			value: record.assetCount,
		}),
		contentSha256: requireSha256({
			label: "complete marker contentSha256",
			value: record.contentSha256,
		}),
		manifestFile: MANIFEST_FILE_NAME,
		manifestSha256: requireSha256({
			label: "complete marker manifestSha256",
			value: record.manifestSha256,
		}),
		status: "complete",
		timelineMaterialsSize: requireSafeInteger({
			label: "complete marker timelineMaterialsSize",
			value: record.timelineMaterialsSize,
		}),
	};
}

function getNoFollowFlag(): number {
	return typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
}

async function readRegularFile({
	filePath,
	label,
	maximumBytes,
}: {
	filePath: string;
	label: string;
	maximumBytes: number;
}): Promise<Buffer> {
	const metadata = await lstat(filePath);
	if (!metadata.isFile() || metadata.isSymbolicLink()) {
		throw new Error(`${label} must be a regular file.`);
	}
	if (metadata.size > maximumBytes) {
		throw new Error(`${label} exceeds the supported size.`);
	}
	const handle = await open(filePath, constants.O_RDONLY | getNoFollowFlag());
	try {
		const opened = await handle.stat();
		if (!opened.isFile()) {
			throw new Error(`${label} changed while being verified.`);
		}
		const bytes = await handle.readFile();
		const after = await handle.stat();
		if (
			opened.dev !== after.dev ||
			opened.ino !== after.ino ||
			opened.size !== after.size ||
			opened.mtimeMs !== after.mtimeMs
		) {
			throw new Error(`${label} changed while being verified.`);
		}
		return bytes;
	} finally {
		await handle.close();
	}
}

async function readJsonFile({
	filePath,
	label,
	maximumBytes = CAPCUT_8_1_INSTALL_LIMITS.metadataBytes,
}: {
	filePath: string;
	label: string;
	maximumBytes?: number;
}): Promise<{ bytes: Buffer; value: unknown }> {
	const bytes = await readRegularFile({ filePath, label, maximumBytes });
	try {
		return { bytes, value: JSON.parse(bytes.toString("utf8")) };
	} catch {
		throw new Error(`${label} is not valid JSON.`);
	}
}

function createSha256({ bytes }: { bytes: Buffer }): string {
	return createHash("sha256").update(bytes).digest("hex");
}

async function assertDirectory({
	directory,
	label,
}: {
	directory: string;
	label: string;
}): Promise<string> {
	const metadata = await lstat(directory);
	if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
		throw new Error(`${label} must be a directory, not a symlink.`);
	}
	return realpath(resolve(directory));
}

async function readDirectoryNamesBounded({
	directory,
	label,
}: {
	directory: string;
	label: string;
}): Promise<string[]> {
	const handle = await opendir(directory);
	const names: string[] = [];
	const readNext = async (): Promise<void> => {
		const entry = await handle.read();
		if (!entry) return;
		if (names.length >= CAPCUT_8_1_INSTALL_LIMITS.directoryEntries) {
			throw new Error(`${label} exceeds the per-directory entry limit.`);
		}
		names.push(entry.name);
		await readNext();
	};
	let failure: unknown;
	try {
		await readNext();
	} catch (error) {
		failure = error;
	}
	try {
		await handle.close();
	} catch (error) {
		if (
			failure === undefined &&
			getNodeErrorCode({ value: error }) !== "ERR_DIR_CLOSED"
		) {
			failure = error;
		}
	}
	if (failure !== undefined) throw failure;
	return names.sort();
}

async function listDraftTree({
	directory,
}: {
	directory: string;
}): Promise<ListedDraftTree> {
	const rootNames = await readDirectoryNamesBounded({
		directory,
		label: "Migration draft root",
	});
	const pending: PendingDraftTreeEntry[] = rootNames.map((name) => ({
		absolutePath: join(directory, name),
		depth: 1,
		relativePath: name,
	}));
	const directories: string[] = [];
	const files: ListedDraftTree["files"] = [];
	const maximumTreeEntries =
		CAPCUT_8_1_INSTALL_LIMITS.treeDirectoryCount +
		CAPCUT_8_1_INSTALL_LIMITS.treeFileCount;
	let discoveredEntries = pending.length;
	let nextIndex = 0;
	let totalBytes = 0;
	const visitNext = async (): Promise<void> => {
		const index = nextIndex;
		const entry = pending[index];
		if (!entry) return;
		nextIndex += 1;
		assertSafeRelativePath({
			label: "draft tree path",
			relativePath: entry.relativePath,
		});
		const metadata = await lstat(entry.absolutePath, { bigint: true });
		if (metadata.isSymbolicLink()) {
			throw new Error(
				`Migration draft contains a symlink: ${entry.relativePath}`
			);
		}
		if (metadata.isDirectory()) {
			if (entry.depth > CAPCUT_8_1_INSTALL_LIMITS.directoryDepth) {
				throw new Error("Migration draft exceeds the directory-depth limit.");
			}
			directories.push(entry.relativePath);
			if (directories.length > CAPCUT_8_1_INSTALL_LIMITS.treeDirectoryCount) {
				throw new Error("Migration draft exceeds the directory-count limit.");
			}
			const childNames = await readDirectoryNamesBounded({
				directory: entry.absolutePath,
				label: `Migration directory ${entry.relativePath}`,
			});
			discoveredEntries += childNames.length;
			if (discoveredEntries > maximumTreeEntries) {
				throw new Error("Migration draft exceeds the total-entry limit.");
			}
			pending.push(
				...childNames.map((name) => ({
					absolutePath: join(entry.absolutePath, name),
					depth: entry.depth + 1,
					relativePath: `${entry.relativePath}/${name}`,
				}))
			);
			await visitNext();
			return;
		}
		if (!metadata.isFile()) {
			throw new Error(
				`Migration draft contains a special file: ${entry.relativePath}`
			);
		}
		const fileBytes = Number(metadata.size);
		files.push({
			bytes: fileBytes,
			changedAtMilliseconds: Number(metadata.ctimeMs),
			changedAtNanoseconds: metadata.ctimeNs.toString(),
			device: Number(metadata.dev),
			deviceIdentity: metadata.dev.toString(),
			inode: Number(metadata.ino),
			inodeIdentity: metadata.ino.toString(),
			modifiedAtMilliseconds: Number(metadata.mtimeMs),
			modifiedAtNanoseconds: metadata.mtimeNs.toString(),
			relativePath: entry.relativePath,
			sha256: "",
		});
		if (files.length > CAPCUT_8_1_INSTALL_LIMITS.treeFileCount) {
			throw new Error("Migration draft exceeds the file-count limit.");
		}
		totalBytes += fileBytes;
		if (
			!Number.isSafeInteger(totalBytes) ||
			totalBytes > CAPCUT_8_1_INSTALL_LIMITS.treeTotalBytes
		) {
			throw new Error("Migration draft exceeds the total-byte limit.");
		}
		await visitNext();
	};
	const workerCount = Math.min(
		CAPCUT_8_1_INSTALL_LIMITS.concurrentFileOperations,
		pending.length
	);
	await Promise.all(Array.from({ length: workerCount }, () => visitNext()));
	return {
		directories: directories.sort(),
		files: files.sort((left, right) => {
			if (left.relativePath < right.relativePath) return -1;
			if (left.relativePath > right.relativePath) return 1;
			return 0;
		}),
		totalBytes,
	};
}

function getDraftFolderName({
	manifest,
}: {
	manifest: CapCut81MigrationManifest;
}): string {
	const firstPath = manifest.content.activeMirrors[0];
	const segments = firstPath?.split("/");
	const folder = segments?.[1];
	if (
		!folder ||
		segments?.[0] !== DRAFT_STORE_DIRECTORY_NAME ||
		basename(folder) !== folder ||
		folder === "." ||
		folder === ".."
	) {
		throw new Error("Manifest does not identify one safe draft folder.");
	}
	const allDraftPaths = [
		...manifest.content.activeMirrors,
		...manifest.content.backups,
		...manifest.scaffoldFiles.filter(
			(path) => path !== `${DRAFT_STORE_DIRECTORY_NAME}/root_meta_info.json`
		),
		...manifest.assets.map(({ relativePath }) => relativePath),
		...manifest.generatedAssets.map(({ relativePath }) => relativePath),
	];
	if (
		allDraftPaths.some(
			(path) => !path.startsWith(`${DRAFT_STORE_DIRECTORY_NAME}/${folder}/`)
		)
	) {
		throw new Error("Manifest references more than one draft folder.");
	}
	return folder;
}

function validateContentPaths({
	draftFolderName,
	manifest,
}: {
	draftFolderName: string;
	manifest: CapCut81MigrationManifest;
}): void {
	const prefix = `${DRAFT_STORE_DIRECTORY_NAME}/${draftFolderName}`;
	const timelinePrefix = `${prefix}/Timelines/${manifest.ids.timelineId}`;
	assertExactStringArray({
		actual: manifest.content.activeMirrors,
		expected: [
			`${prefix}/draft_info.json`,
			`${prefix}/template-2.tmp`,
			`${timelinePrefix}/draft_info.json`,
			`${timelinePrefix}/template-2.tmp`,
		],
		label: "Manifest active content mirrors",
	});
	assertExactStringArray({
		actual: manifest.content.backups,
		expected: [
			`${prefix}/draft_info.json.bak`,
			`${timelinePrefix}/draft_info.json.bak`,
		],
		label: "Manifest content backups",
	});
}

function requireRootEntry({
	draftFolderName,
	manifest,
	rootMetaInfo,
}: {
	draftFolderName: string;
	manifest: CapCut81MigrationManifest;
	rootMetaInfo: Record<string, unknown>;
}): {
	entry: Record<string, unknown>;
	storedDraftDirectory: string;
	storedDraftStoreDirectory: string;
} {
	const entries = rootMetaInfo.all_draft_store;
	if (!(Array.isArray(entries) && entries.length === 1)) {
		throw new Error(
			"Bundle root_meta_info.json must contain exactly one draft."
		);
	}
	const entry = requireRecord({
		label: "bundle root draft entry",
		value: entries[0],
	});
	const storedDraftStoreDirectory = requireString({
		label: "bundle root_path",
		value: rootMetaInfo.root_path,
	});
	const pathApi = getCapCut81AbsolutePathApi({
		finalBundleRootPath: storedDraftStoreDirectory,
	});
	const storedDraftDirectory = pathApi.join(
		storedDraftStoreDirectory,
		draftFolderName
	);
	if (
		pathApi.basename(storedDraftStoreDirectory) !==
			DRAFT_STORE_DIRECTORY_NAME ||
		rootMetaInfo.draft_ids !== 1 ||
		entry.draft_id !== manifest.ids.draftId ||
		entry.draft_fold_path !== storedDraftDirectory ||
		entry.draft_root_path !== storedDraftStoreDirectory
	) {
		throw new Error(
			"Bundle root metadata does not match its manifest and folder."
		);
	}
	return {
		entry,
		storedDraftDirectory,
		storedDraftStoreDirectory,
	};
}

async function validateScaffold({
	draftFolderName,
	manifest,
	sourceDraftStoreDirectory,
	sourceRootEntry,
	storedDraftStoreDirectory,
}: {
	draftFolderName: string;
	manifest: CapCut81MigrationManifest;
	sourceDraftStoreDirectory: string;
	sourceRootEntry: Record<string, unknown>;
	storedDraftStoreDirectory: string;
}): Promise<Map<string, string>> {
	const scaffoldEntries = await mapWithConcurrency({
		concurrency: CAPCUT_8_1_INSTALL_LIMITS.concurrentFileOperations,
		items: manifest.scaffoldFiles,
		mapper: async (manifestPath) => {
			const prefix = `${DRAFT_STORE_DIRECTORY_NAME}/`;
			if (!manifestPath.startsWith(prefix)) {
				throw new Error("Manifest scaffold path escaped the draft store.");
			}
			const relativePath = manifestPath.slice(prefix.length);
			const bytes = await readRegularFile({
				filePath: join(sourceDraftStoreDirectory, ...relativePath.split("/")),
				label: `scaffold file ${manifestPath}`,
				maximumBytes: CAPCUT_8_1_INSTALL_LIMITS.metadataBytes,
			});
			return [relativePath, bytes.toString("utf8")] as const;
		},
	});
	const scaffold = new Map(scaffoldEntries);
	const agencyText = scaffold.get(
		`${draftFolderName}/draft_agency_config.json`
	);
	if (agencyText === undefined) {
		throw new Error("Bundle is missing draft_agency_config.json.");
	}
	const agency = requireRecord({
		label: "draft_agency_config.json",
		value: JSON.parse(agencyText),
	});
	const options = {
		canvasHeight: requireSafeInteger({
			label: "draft agency video_resolution",
			value: agency.video_resolution,
		}),
		createdAtMicroseconds: requireSafeInteger({
			label: "root entry tm_draft_create",
			value: sourceRootEntry.tm_draft_create,
		}),
		draftFolderName,
		draftId: manifest.ids.draftId,
		draftName: requireString({
			label: "root entry draft_name",
			value: sourceRootEntry.draft_name,
		}),
		durationMicroseconds: requireSafeInteger({
			label: "root entry tm_duration",
			value: sourceRootEntry.tm_duration,
		}),
		finalBundleRootPath: storedDraftStoreDirectory,
		projectId: manifest.ids.projectId,
		timelineId: manifest.ids.timelineId,
		timelineMaterialsSize: manifest.timelineMaterialsSize,
		updatedAtMicroseconds: requireSafeInteger({
			label: "root entry tm_draft_modified",
			value: sourceRootEntry.tm_draft_modified,
		}),
	};
	const expected = buildCapCut81MigrationScaffold(options);
	assertExactStringArray({
		actual: [...scaffold.keys()],
		expected: [...expected.keys()],
		label: "Manifest scaffold file set",
	});
	if (
		[...expected.entries()].some(
			([relativePath, text]) => scaffold.get(relativePath) !== text
		)
	) {
		throw new Error("Bundle scaffold differs from the CapCut 8.1 profile.");
	}
	validateCapCut81MigrationScaffold({ files: scaffold, options });
	return new Map(
		[...scaffold.entries()]
			.filter(([relativePath]) => relativePath !== "root_meta_info.json")
			.map(([relativePath, text]) => [
				relativePath,
				createSha256({ bytes: Buffer.from(text, "utf8") }),
			])
	);
}

async function validateAssets({
	manifest,
	outputDirectory,
}: {
	manifest: CapCut81MigrationManifest;
	outputDirectory: string;
}): Promise<void> {
	const assets = [...manifest.assets, ...manifest.generatedAssets];
	const results = await mapWithConcurrency({
		concurrency: CAPCUT_8_1_INSTALL_LIMITS.concurrentFileOperations,
		items: assets,
		mapper: async (asset) => {
			const filePath = join(outputDirectory, ...asset.relativePath.split("/"));
			const metadata = await lstat(filePath);
			if (!metadata.isFile() || metadata.isSymbolicLink()) {
				throw new Error(
					`migration asset ${asset.relativePath} must be a regular file.`
				);
			}
			const handle = await open(
				filePath,
				constants.O_RDONLY | getNoFollowFlag()
			);
			try {
				const before = await handle.stat();
				const hash = createHash("sha256");
				let byteCount = 0;
				await pipeline(
					createReadStream(filePath, {
						autoClose: false,
						fd: handle.fd,
					}),
					new Writable({
						write(chunk: Buffer, _encoding, callback) {
							byteCount += chunk.length;
							hash.update(chunk);
							callback();
						},
					})
				);
				const after = await handle.stat();
				if (
					before.dev !== after.dev ||
					before.ino !== after.ino ||
					before.size !== after.size ||
					before.mtimeMs !== after.mtimeMs ||
					byteCount !== asset.bytes ||
					hash.digest("hex") !== asset.sha256
				) {
					throw new Error(
						`Migration asset hash mismatch: ${asset.relativePath}`
					);
				}
				return byteCount;
			} finally {
				await handle.close();
			}
		},
	});
	const expectedSize =
		manifest.content.bytes + results.reduce((sum, bytes) => sum + bytes, 0);
	if (expectedSize !== manifest.timelineMaterialsSize) {
		throw new Error("Manifest timeline material size is inconsistent.");
	}
}

export async function verifyCapCut81MigrationBundle({
	outputDirectory,
}: {
	outputDirectory: string;
}): Promise<VerifiedCapCut81MigrationBundle> {
	const canonicalOutputDirectory = await assertDirectory({
		directory: outputDirectory,
		label: "CapCut migration bundle",
	});
	const rootEntries = await readDirectoryNamesBounded({
		directory: canonicalOutputDirectory,
		label: "Migration bundle root",
	});
	assertExactStringArray({
		actual: rootEntries,
		expected: [
			COMPLETE_MARKER_FILE_NAME,
			DRAFT_STORE_DIRECTORY_NAME,
			MANIFEST_FILE_NAME,
		].sort(),
		label: "Migration bundle root",
	});
	const sourceDraftStoreDirectory = await assertDirectory({
		directory: join(canonicalOutputDirectory, DRAFT_STORE_DIRECTORY_NAME),
		label: "Bundle draft store",
	});
	const [completeFile, manifestFile] = await Promise.all([
		readJsonFile({
			filePath: join(canonicalOutputDirectory, COMPLETE_MARKER_FILE_NAME),
			label: "CapCut migration complete marker",
			maximumBytes: CAPCUT_8_1_INSTALL_LIMITS.completeMarkerBytes,
		}),
		readJsonFile({
			filePath: join(canonicalOutputDirectory, MANIFEST_FILE_NAME),
			label: "CapCut migration manifest",
			maximumBytes: CAPCUT_8_1_INSTALL_LIMITS.manifestBytes,
		}),
	]);
	const complete = parseCompleteMarker({ value: completeFile.value });
	if (createSha256({ bytes: manifestFile.bytes }) !== complete.manifestSha256) {
		throw new Error("CapCut migration manifest hash mismatch.");
	}
	const manifest = parseManifest({ value: manifestFile.value });
	if (
		complete.assetCount !==
			manifest.assets.length + manifest.generatedAssets.length ||
		complete.contentSha256 !== manifest.content.sha256 ||
		complete.timelineMaterialsSize !== manifest.timelineMaterialsSize
	) {
		throw new Error("Complete marker does not match the migration manifest.");
	}
	const draftFolderName = getDraftFolderName({ manifest });
	validateContentPaths({ draftFolderName, manifest });
	const storeEntries = await readDirectoryNamesBounded({
		directory: sourceDraftStoreDirectory,
		label: "Bundle draft store",
	});
	assertExactStringArray({
		actual: storeEntries,
		expected: ["root_meta_info.json", draftFolderName].sort(),
		label: "Bundle draft store",
	});
	const sourceDraftDirectory = await assertDirectory({
		directory: join(sourceDraftStoreDirectory, draftFolderName),
		label: "Bundle draft",
	});
	const contentRelativePaths = [
		...manifest.content.activeMirrors,
		...manifest.content.backups,
	];
	const contentFiles = await mapWithConcurrency({
		concurrency: CAPCUT_8_1_INSTALL_LIMITS.concurrentFileOperations,
		items: contentRelativePaths,
		mapper: (relativePath) =>
			readRegularFile({
				filePath: join(canonicalOutputDirectory, ...relativePath.split("/")),
				label: `content mirror ${relativePath}`,
				maximumBytes: CAPCUT_8_1_INSTALL_LIMITS.contentBytes,
			}),
	});
	const canonicalContent = contentFiles[0];
	if (
		!canonicalContent ||
		contentFiles.some((bytes) => !bytes.equals(canonicalContent)) ||
		canonicalContent.length !== manifest.content.bytes ||
		createSha256({ bytes: canonicalContent }) !== manifest.content.sha256
	) {
		throw new Error(
			"CapCut content mirrors are not identical or fail their hash."
		);
	}
	const contentValue = requireRecord({
		label: "CapCut draft content",
		value: JSON.parse(canonicalContent.toString("utf8")),
	});
	if (contentValue.id !== manifest.ids.timelineId) {
		throw new Error("CapCut content timeline ID does not match the manifest.");
	}
	const rootMetaFile = await readJsonFile({
		filePath: join(sourceDraftStoreDirectory, "root_meta_info.json"),
		label: "bundle root_meta_info.json",
	});
	const rootMetaInfo = requireRecord({
		label: "bundle root_meta_info.json",
		value: rootMetaFile.value,
	});
	const {
		entry: sourceRootEntry,
		storedDraftDirectory,
		storedDraftStoreDirectory,
	} = requireRootEntry({
		draftFolderName,
		manifest,
		rootMetaInfo,
	});
	const [scaffoldHashes] = await Promise.all([
		validateScaffold({
			draftFolderName,
			manifest,
			sourceDraftStoreDirectory,
			sourceRootEntry,
			storedDraftStoreDirectory,
		}),
		validateAssets({ manifest, outputDirectory: canonicalOutputDirectory }),
	]);
	const tree = await listDraftTree({ directory: sourceDraftDirectory });
	const expectedFiles = [
		...contentRelativePaths.map((path) =>
			path.slice(`${DRAFT_STORE_DIRECTORY_NAME}/${draftFolderName}/`.length)
		),
		...manifest.scaffoldFiles
			.filter(
				(path) => path !== `${DRAFT_STORE_DIRECTORY_NAME}/root_meta_info.json`
			)
			.map((path) =>
				path.slice(`${DRAFT_STORE_DIRECTORY_NAME}/${draftFolderName}/`.length)
			),
		...manifest.assets.map((asset) =>
			asset.relativePath.slice(
				`${DRAFT_STORE_DIRECTORY_NAME}/${draftFolderName}/`.length
			)
		),
		...manifest.generatedAssets.map((asset) =>
			asset.relativePath.slice(
				`${DRAFT_STORE_DIRECTORY_NAME}/${draftFolderName}/`.length
			)
		),
	].sort();
	assertExactStringArray({
		actual: tree.files.map(({ relativePath }) => relativePath),
		expected: expectedFiles,
		label: "Migration draft file set",
	});
	const draftPrefix = `${DRAFT_STORE_DIRECTORY_NAME}/${draftFolderName}/`;
	const expectedHashes = new Map<string, string>();
	for (const relativePath of contentRelativePaths) {
		expectedHashes.set(
			relativePath.slice(draftPrefix.length),
			manifest.content.sha256
		);
	}
	for (const asset of [...manifest.assets, ...manifest.generatedAssets]) {
		expectedHashes.set(
			asset.relativePath.slice(draftPrefix.length),
			asset.sha256
		);
	}
	for (const [relativePath, sha256] of scaffoldHashes) {
		expectedHashes.set(
			relativePath.slice(`${draftFolderName}/`.length),
			sha256
		);
	}
	const draftFiles = tree.files.map((file) => {
		const sha256 = expectedHashes.get(file.relativePath);
		if (!sha256) {
			throw new Error(
				`Migration draft file has no verified hash: ${file.relativePath}`
			);
		}
		return { ...file, sha256 };
	});
	return {
		contentRelativePaths,
		contentText: canonicalContent.toString("utf8"),
		draftDirectories: tree.directories,
		draftFiles,
		draftFolderName,
		manifest,
		outputDirectory: canonicalOutputDirectory,
		sourceDraftDirectory,
		sourceDraftStoreDirectory,
		sourceRootEntry,
		storedDraftDirectory,
		storedDraftStoreDirectory,
	};
}
