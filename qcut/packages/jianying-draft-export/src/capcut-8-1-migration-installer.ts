import { constants, createReadStream, createWriteStream } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import {
	lstat,
	mkdir,
	open,
	realpath,
	rename,
	rm,
	type FileHandle,
	unlink,
} from "node:fs/promises";
import {
	basename,
	dirname,
	extname,
	isAbsolute,
	join,
	posix,
	relative,
	resolve,
	sep,
	win32,
} from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type {
	CapCut81MigrationInstallResult,
	InstallTrustedCapCut81MigrationBundleOptions,
	VerifiedCapCut81MigrationBundle,
} from "./capcut-8-1-migration-installer-types.js";
import { verifyCapCut81MigrationBundle } from "./capcut-8-1-migration-bundle-reader.js";
import {
	CAPCUT_8_1_INSTALL_LIMITS,
	mapWithConcurrency,
} from "./capcut-8-1-migration-installer-limits.js";
import { getCapCut81AbsolutePathApi } from "./capcut-8-1-migration-validation.js";

const CAPCUT_DEFAULT_ADJUST_TOKEN = "##_capcut_default_adjust_bundle_##";
const CAPCUT_OFFICIAL_BUNDLE_IDENTIFIER = "com.lemon.lvoverseas";
const CAPCUT_SUPPORTED_VERSION_PATTERN = /^8\.1\.(0|[1-9][0-9]*)$/;
const DRAFT_PLACEHOLDER_PREFIX = "##_draftpath_placeholder_";
const DRAFT_STORE_DIRECTORY_NAME = "com.lveditor.draft";
const LOCK_FILE_NAME = ".qcut-capcut-migration-install.lock";

interface TargetStoreState {
	existingEntries: Record<string, unknown>[];
	originalRootBytes: Buffer;
	rootFileIdentity: RegularFileIdentity;
	rootMetaInfo: Record<string, unknown>;
	rootMetaInfoPath: string;
}

interface RegularFileIdentity {
	changedAtMilliseconds: number;
	device: number;
	inode: number;
	modifiedAtMilliseconds: number;
	sha256: string;
	size: number;
}

interface VerifiedCapCutAppPaths {
	capCutAppPath: string;
	defaultAdjustBundlePath: string;
}

interface CapCutBundleMetadata {
	bundleIdentifier: string;
	bundleVersion: string;
	shortVersion: string;
}

interface CapCut81MigrationInstallerTestingHooks {
	afterDraftPublished?: () => Promise<void>;
	beforeDraftCopy?: () => Promise<void>;
	beforeDraftFileCopy?: ({
		relativePath,
		sourcePath,
	}: {
		relativePath: string;
		sourcePath: string;
	}) => Promise<void>;
}

interface InstallForMacOptions
	extends InstallTrustedCapCut81MigrationBundleOptions {
	testingHooks?: CapCut81MigrationInstallerTestingHooks;
}

interface CapCut81MigrationInstallLock {
	device: string;
	handle: FileHandle;
	inode: string;
	lockPath: string;
	nonce: string;
}

function getNodeErrorCode({ value }: { value: unknown }): string | undefined {
	if (!(value instanceof Error) || !("code" in value)) return undefined;
	const code = (value as { code?: unknown }).code;
	return typeof code === "string" ? code : undefined;
}

async function describeExistingInstallLock({
	lockPath,
}: {
	lockPath: string;
}): Promise<string> {
	try {
		const bytes = await readRegularFile({
			filePath: lockPath,
			label: "existing CapCut migration install lock",
			maximumBytes: CAPCUT_8_1_INSTALL_LIMITS.completeMarkerBytes,
		});
		const parsed = JSON.parse(bytes.toString("utf8")) as unknown;
		if (!isRecord({ value: parsed })) return "";
		const record = parsed as Record<string, unknown>;
		const details = [
			typeof record.pid === "number" ? `PID ${record.pid}` : null,
			typeof record.startedAt === "string"
				? `started ${record.startedAt}`
				: null,
			typeof record.stagingDirectory === "string"
				? `staging ${record.stagingDirectory}`
				: null,
		].filter((detail): detail is string => detail !== null);
		return details.length > 0 ? ` (${details.join(", ")})` : "";
	} catch {
		return "";
	}
}

async function acquireInstallLock({
	draftId,
	lockPath,
	nonce,
	stagingDirectory,
}: {
	draftId: string;
	lockPath: string;
	nonce: string;
	stagingDirectory: string;
}): Promise<CapCut81MigrationInstallLock> {
	let handle: FileHandle;
	try {
		handle = await open(lockPath, "wx", 0o600);
	} catch (error) {
		if (getNodeErrorCode({ value: error }) !== "EEXIST") throw error;
		const details = await describeExistingInstallLock({ lockPath });
		throw new Error(
			`A CapCut migration install lock already exists at ${lockPath}${details}. ` +
				"Quit QCut and CapCut, confirm the recorded process is no longer running, " +
				"then inspect and remove only this lock and its referenced orphan staging or unregistered draft directory before retrying."
		);
	}
	try {
		await handle.writeFile(
			JSON.stringify({
				draftId,
				nonce,
				pid: process.pid,
				stagingDirectory,
				startedAt: new Date().toISOString(),
			})
		);
		await handle.sync();
		const identity = await handle.stat({ bigint: true });
		return {
			device: identity.dev.toString(),
			handle,
			inode: identity.ino.toString(),
			lockPath,
			nonce,
		};
	} catch (error) {
		await handle.close().catch(() => undefined);
		await unlink(lockPath).catch(() => undefined);
		throw error;
	}
}

async function releaseInstallLock({
	lock,
}: {
	lock: CapCut81MigrationInstallLock;
}): Promise<void> {
	await lock.handle.close();
	try {
		const current = await lstat(lock.lockPath, { bigint: true });
		if (
			current.dev.toString() !== lock.device ||
			current.ino.toString() !== lock.inode
		) {
			return;
		}
		await unlink(lock.lockPath);
	} catch (error) {
		if (getNodeErrorCode({ value: error }) !== "ENOENT") throw error;
	}
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

function decodeXmlText({ value }: { value: string }): string {
	const decoded = value
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&quot;", '"')
		.replaceAll("&apos;", "'")
		.replaceAll("&amp;", "&");
	if (/&[^;]+;/.test(decoded)) {
		throw new Error("CapCut Info.plist contains an unsupported XML entity.");
	}
	return decoded;
}

function readPlistString({ key, text }: { key: string; text: string }): string {
	const match = new RegExp(
		`<key>\\s*${key}\\s*</key>\\s*<string>([^<]*)</string>`
	).exec(text);
	if (!match?.[1]) {
		throw new Error(`CapCut Info.plist is missing ${key}.`);
	}
	return decodeXmlText({ value: match[1] });
}

function parseCapCutBundleMetadata({
	infoPlistText,
}: {
	infoPlistText: string;
}): CapCutBundleMetadata {
	if (
		!infoPlistText.trimStart().startsWith("<?xml") ||
		!infoPlistText.includes("<plist")
	) {
		throw new Error("CapCut Info.plist must use the verified XML format.");
	}
	return {
		bundleIdentifier: readPlistString({
			key: "CFBundleIdentifier",
			text: infoPlistText,
		}),
		bundleVersion: readPlistString({
			key: "CFBundleVersion",
			text: infoPlistText,
		}),
		shortVersion: readPlistString({
			key: "CFBundleShortVersionString",
			text: infoPlistText,
		}),
	};
}

function isSameOrDescendant({
	candidatePath,
	parentPath,
}: {
	candidatePath: string;
	parentPath: string;
}): boolean {
	const relativePath = relative(parentPath, candidatePath);
	return (
		relativePath === "" ||
		(relativePath !== ".." &&
			!relativePath.startsWith(`..${sep}`) &&
			!isAbsolute(relativePath))
	);
}

function getNoFollowFlag(): number {
	return typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
}

async function requireCanonicalDirectory({
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

async function readRegularFile({
	filePath,
	label,
	maximumBytes,
}: {
	filePath: string;
	label: string;
	maximumBytes: number;
}): Promise<Buffer> {
	return (await readRegularFileSnapshot({ filePath, label, maximumBytes }))
		.bytes;
}

async function readRegularFileSnapshot({
	filePath,
	label,
	maximumBytes,
}: {
	filePath: string;
	label: string;
	maximumBytes: number;
}): Promise<{ bytes: Buffer; identity: RegularFileIdentity }> {
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
			throw new Error(`${label} changed while being read.`);
		}
		const bytes = await handle.readFile();
		const after = await handle.stat();
		if (
			opened.dev !== after.dev ||
			opened.ino !== after.ino ||
			opened.size !== after.size ||
			opened.mtimeMs !== after.mtimeMs
		) {
			throw new Error(`${label} changed while being read.`);
		}
		return {
			bytes,
			identity: {
				changedAtMilliseconds: after.ctimeMs,
				device: after.dev,
				inode: after.ino,
				modifiedAtMilliseconds: after.mtimeMs,
				sha256: createHash("sha256").update(bytes).digest("hex"),
				size: after.size,
			},
		};
	} finally {
		await handle.close();
	}
}

async function copyRegularFileNoFollow({
	destinationPath,
	expectedFile,
	onSourceOpened,
	sourceRootDirectory,
	sourcePath,
}: {
	destinationPath: string;
	expectedFile: VerifiedCapCut81MigrationBundle["draftFiles"][number];
	onSourceOpened?: () => Promise<void>;
	sourceRootDirectory: string;
	sourcePath: string;
}): Promise<void> {
	const canonicalParent = await realpath(dirname(sourcePath));
	if (
		canonicalParent !== dirname(sourcePath) ||
		!isSameOrDescendant({
			candidatePath: canonicalParent,
			parentPath: sourceRootDirectory,
		})
	) {
		throw new Error(`Migration source parent is unsafe: ${sourcePath}`);
	}
	const before = await lstat(sourcePath, { bigint: true });
	if (
		!before.isFile() ||
		before.isSymbolicLink() ||
		before.size !== BigInt(expectedFile.bytes) ||
		before.ctimeNs.toString() !== expectedFile.changedAtNanoseconds ||
		before.dev.toString() !== expectedFile.deviceIdentity ||
		before.ino.toString() !== expectedFile.inodeIdentity ||
		before.mtimeNs.toString() !== expectedFile.modifiedAtNanoseconds
	) {
		throw new Error(`Migration source changed before copying: ${sourcePath}`);
	}
	const sourceHandle = await open(
		sourcePath,
		constants.O_RDONLY | getNoFollowFlag()
	);
	try {
		await onSourceOpened?.();
		const hash = createHash("sha256");
		let copiedBytes = 0;
		const hashStream = new Transform({
			transform(chunk: Buffer, _encoding, callback) {
				copiedBytes += chunk.length;
				hash.update(chunk);
				callback(null, chunk);
			},
		});
		await pipeline(
			createReadStream(sourcePath, {
				autoClose: false,
				fd: sourceHandle.fd,
			}),
			hashStream,
			createWriteStream(destinationPath, { flags: "wx", mode: 0o600 })
		);
		if (
			copiedBytes !== expectedFile.bytes ||
			hash.digest("hex") !== expectedFile.sha256
		) {
			throw new Error(
				`Migration source content changed while copying: ${sourcePath}`
			);
		}
		const opened = await sourceHandle.stat({ bigint: true });
		if (
			before.dev !== opened.dev ||
			before.ino !== opened.ino ||
			before.size !== opened.size ||
			before.ctimeNs !== opened.ctimeNs ||
			before.mtimeNs !== opened.mtimeNs
		) {
			throw new Error(`Migration source changed while copying: ${sourcePath}`);
		}
	} finally {
		await sourceHandle.close();
	}
	const destinationHandle = await open(destinationPath, "r");
	try {
		await destinationHandle.sync();
	} finally {
		await destinationHandle.close();
	}
	const after = await lstat(sourcePath, { bigint: true });
	if (
		after.isSymbolicLink() ||
		before.dev !== after.dev ||
		before.ino !== after.ino ||
		before.size !== after.size ||
		before.ctimeNs !== after.ctimeNs ||
		before.mtimeNs !== after.mtimeNs
	) {
		throw new Error(`Migration source changed while copying: ${sourcePath}`);
	}
}

async function copyVerifiedDraftTree({
	bundle,
	destinationDirectory,
	testingHooks,
}: {
	bundle: VerifiedCapCut81MigrationBundle;
	destinationDirectory: string;
	testingHooks: CapCut81MigrationInstallerTestingHooks;
}): Promise<void> {
	const sourceMetadata = await lstat(bundle.sourceDraftDirectory);
	if (!sourceMetadata.isDirectory() || sourceMetadata.isSymbolicLink()) {
		throw new Error(
			`Migration source is not a safe directory: ${bundle.sourceDraftDirectory}`
		);
	}
	await mkdir(destinationDirectory, { mode: 0o700 });
	await mapWithConcurrency({
		concurrency: CAPCUT_8_1_INSTALL_LIMITS.concurrentFileOperations,
		items: bundle.draftDirectories,
		mapper: async (relativePath) => {
			const sourcePath = join(
				bundle.sourceDraftDirectory,
				...relativePath.split("/")
			);
			const [metadata, canonicalPath] = await Promise.all([
				lstat(sourcePath),
				realpath(sourcePath),
			]);
			if (
				!metadata.isDirectory() ||
				metadata.isSymbolicLink() ||
				canonicalPath !== sourcePath
			) {
				throw new Error(
					`Migration source is not a safe directory: ${sourcePath}`
				);
			}
			await mkdir(join(destinationDirectory, ...relativePath.split("/")), {
				mode: 0o700,
				recursive: true,
			});
		},
	});
	await mapWithConcurrency({
		concurrency: CAPCUT_8_1_INSTALL_LIMITS.concurrentFileOperations,
		items: bundle.draftFiles,
		mapper: (file) => {
			const beforeDraftFileCopy = testingHooks.beforeDraftFileCopy;
			const sourcePath = join(
				bundle.sourceDraftDirectory,
				...file.relativePath.split("/")
			);
			return copyRegularFileNoFollow({
				destinationPath: join(
					destinationDirectory,
					...file.relativePath.split("/")
				),
				expectedFile: file,
				onSourceOpened: beforeDraftFileCopy
					? () =>
							beforeDraftFileCopy({
								relativePath: file.relativePath,
								sourcePath,
							})
					: undefined,
				sourcePath,
				sourceRootDirectory: bundle.sourceDraftDirectory,
			});
		},
	});
}

async function syncDirectory({
	directory,
}: {
	directory: string;
}): Promise<void> {
	const handle = await open(directory, "r");
	try {
		await handle.sync();
	} finally {
		await handle.close();
	}
}

async function writeAtomicFile({
	bytes,
	filePath,
}: {
	bytes: Buffer;
	filePath: string;
}): Promise<void> {
	const temporaryPath = join(
		dirname(filePath),
		`.${basename(filePath)}.${randomUUID()}.tmp`
	);
	const handle = await open(temporaryPath, "wx", 0o600);
	try {
		await handle.writeFile(bytes);
		await handle.sync();
	} finally {
		await handle.close();
	}
	try {
		await rename(temporaryPath, filePath);
	} catch (error) {
		await rm(temporaryPath, { force: true });
		throw error;
	}
}

function transformJsonStrings({
	transform,
	value,
}: {
	transform: (text: string) => string;
	value: unknown;
}): unknown {
	if (typeof value === "string") return transform(value);
	if (Array.isArray(value)) {
		return value.map((item) =>
			transformJsonStrings({ transform, value: item })
		);
	}
	if (!isRecord({ value })) return value;
	const record = value as Record<string, unknown>;
	return Object.fromEntries(
		Object.entries(record).map(([key, item]) => [
			key,
			transformJsonStrings({ transform, value: item }),
		])
	);
}

function rebindScaffoldValue({
	sourceDraftStoreDirectory,
	targetDraftStoreDirectory,
	value,
}: {
	sourceDraftStoreDirectory: string;
	targetDraftStoreDirectory: string;
	value: unknown;
}): unknown {
	const sourcePathApi = getCapCut81AbsolutePathApi({
		finalBundleRootPath: sourceDraftStoreDirectory,
	});
	return transformJsonStrings({
		transform: (text) => {
			const usesKnownAbsoluteConvention = sourcePathApi.isAbsolute(text);
			if (!usesKnownAbsoluteConvention) {
				if (posix.isAbsolute(text) || win32.isAbsolute(text)) {
					throw new Error(
						"Scaffold contains an absolute path with a foreign convention."
					);
				}
				return text;
			}
			const relativePath = sourcePathApi.relative(
				sourceDraftStoreDirectory,
				text
			);
			const isInsideStoredDraftStore =
				relativePath.length === 0 ||
				(!sourcePathApi.isAbsolute(relativePath) &&
					relativePath !== ".." &&
					!relativePath.startsWith(`..${sourcePathApi.sep}`));
			if (!isInsideStoredDraftStore) {
				throw new Error(
					"Scaffold contains an absolute path outside its stored draft root."
				);
			}
			if (relativePath.length === 0) return targetDraftStoreDirectory;
			return join(
				targetDraftStoreDirectory,
				...relativePath.split(sourcePathApi.sep)
			);
		},
		value,
	});
}

function rebindContent({
	contentText,
	defaultAdjustBundlePath,
	placeholderId,
	targetDraftDirectory,
}: {
	contentText: string;
	defaultAdjustBundlePath: string;
	placeholderId: string;
	targetDraftDirectory: string;
}): string {
	const expectedDraftToken = `${DRAFT_PLACEHOLDER_PREFIX}${placeholderId}_##`;
	const placeholderTokenPattern = /##_draftpath_placeholder_[^#]*_##/g;
	const content = JSON.parse(contentText) as unknown;
	const rebindKnownPath = ({ text }: { text: string }): string => {
		const tokens = text.match(placeholderTokenPattern) ?? [];
		if (tokens.some((token) => token !== expectedDraftToken)) {
			throw new Error("CapCut content contains a foreign draft path token.");
		}
		if (
			tokens.length > 1 ||
			(tokens.length === 1 && !text.startsWith(expectedDraftToken))
		) {
			throw new Error("CapCut content contains a misplaced draft path token.");
		}
		const defaultAdjustTokenCount =
			text.split(CAPCUT_DEFAULT_ADJUST_TOKEN).length - 1;
		if (
			defaultAdjustTokenCount > 1 ||
			(defaultAdjustTokenCount === 1 &&
				!text.includes(`;${CAPCUT_DEFAULT_ADJUST_TOKEN}`))
		) {
			throw new Error(
				"CapCut content contains a misplaced adjustment-bundle token."
			);
		}
		const replaced = text
			.replaceAll(expectedDraftToken, targetDraftDirectory)
			.replaceAll(CAPCUT_DEFAULT_ADJUST_TOKEN, defaultAdjustBundlePath);
		if (replaced.includes("##_")) {
			throw new Error("CapCut content contains an unresolved path token.");
		}
		return replaced;
	};
	const visit = ({ value }: { value: unknown }): unknown => {
		if (Array.isArray(value)) {
			return value.map((item) => visit({ value: item }));
		}
		if (!isRecord({ value })) return value;
		const record = value as Record<string, unknown>;
		return Object.fromEntries(
			Object.entries(record).map(([key, item]) => {
				const isKnownPathField = key === "path" || key === "lumi_hub_path";
				if (isKnownPathField && typeof item === "string") {
					return [key, rebindKnownPath({ text: item })];
				}
				return [key, visit({ value: item })];
			})
		);
	};
	return JSON.stringify(visit({ value: content }));
}

function toStagingPath({
	bundleRelativePath,
	bundle,
	stagingDirectory,
}: {
	bundleRelativePath: string;
	bundle: VerifiedCapCut81MigrationBundle;
	stagingDirectory: string;
}): string {
	const prefix = `${DRAFT_STORE_DIRECTORY_NAME}/${bundle.draftFolderName}/`;
	if (!bundleRelativePath.startsWith(prefix)) {
		throw new Error(
			`Bundle path escaped its draft folder: ${bundleRelativePath}`
		);
	}
	return join(
		stagingDirectory,
		...bundleRelativePath.slice(prefix.length).split("/")
	);
}

async function rebindContentMirrors({
	bundle,
	defaultAdjustBundlePath,
	stagingDirectory,
	targetDraftDirectory,
}: {
	bundle: VerifiedCapCut81MigrationBundle;
	defaultAdjustBundlePath: string;
	stagingDirectory: string;
	targetDraftDirectory: string;
}): Promise<{ paths: string[]; sha256: string }> {
	const contentText = rebindContent({
		contentText: bundle.contentText,
		defaultAdjustBundlePath,
		placeholderId: bundle.manifest.ids.placeholderId,
		targetDraftDirectory,
	});
	const bytes = Buffer.from(contentText, "utf8");
	const paths = bundle.contentRelativePaths.map((bundleRelativePath) =>
		toStagingPath({ bundle, bundleRelativePath, stagingDirectory })
	);
	await mapWithConcurrency({
		concurrency: CAPCUT_8_1_INSTALL_LIMITS.concurrentFileOperations,
		items: paths,
		mapper: (filePath) => writeAtomicFile({ bytes, filePath }),
	});
	return {
		paths,
		sha256: createHash("sha256").update(bytes).digest("hex"),
	};
}

async function rebindScaffoldFiles({
	bundle,
	stagingDirectory,
	targetDraftStoreDirectory,
}: {
	bundle: VerifiedCapCut81MigrationBundle;
	stagingDirectory: string;
	targetDraftStoreDirectory: string;
}): Promise<void> {
	const draftScaffoldPaths = bundle.manifest.scaffoldFiles.filter(
		(relativePath) =>
			relativePath !== `${DRAFT_STORE_DIRECTORY_NAME}/root_meta_info.json`
	);
	await mapWithConcurrency({
		concurrency: CAPCUT_8_1_INSTALL_LIMITS.concurrentFileOperations,
		items: draftScaffoldPaths,
		mapper: async (bundleRelativePath) => {
			const filePath = toStagingPath({
				bundle,
				bundleRelativePath,
				stagingDirectory,
			});
			const extension = extname(bundleRelativePath);
			const isJsonLike =
				extension === ".json" || bundleRelativePath.endsWith(".json.bak");
			if (!isJsonLike) return;
			const bytes = await readRegularFile({
				filePath,
				label: `staged scaffold ${bundleRelativePath}`,
				maximumBytes: CAPCUT_8_1_INSTALL_LIMITS.metadataBytes,
			});
			if (bytes.length === 0) return;
			const value = JSON.parse(bytes.toString("utf8")) as unknown;
			const rebound = rebindScaffoldValue({
				sourceDraftStoreDirectory: bundle.storedDraftStoreDirectory,
				targetDraftStoreDirectory,
				value,
			});
			await writeAtomicFile({
				bytes: Buffer.from(JSON.stringify(rebound), "utf8"),
				filePath,
			});
		},
	});
}

async function validateCapCutApp({
	capCutAppPath,
}: {
	capCutAppPath: string;
}): Promise<VerifiedCapCutAppPaths> {
	if (extname(capCutAppPath).toLowerCase() !== ".app") {
		throw new Error("CapCut application path must point to a .app bundle.");
	}
	const canonicalAppPath = await requireCanonicalDirectory({
		directory: capCutAppPath,
		label: "CapCut application bundle",
	});
	const infoPlistBytes = await readRegularFile({
		filePath: join(canonicalAppPath, "Contents", "Info.plist"),
		label: "CapCut Info.plist",
		maximumBytes: CAPCUT_8_1_INSTALL_LIMITS.metadataBytes,
	});
	const bundleMetadata = parseCapCutBundleMetadata({
		infoPlistText: infoPlistBytes.toString("utf8"),
	});
	if (bundleMetadata.bundleIdentifier !== CAPCUT_OFFICIAL_BUNDLE_IDENTIFIER) {
		throw new Error("Application bundle is not the official CapCut macOS app.");
	}
	if (
		!CAPCUT_SUPPORTED_VERSION_PATTERN.test(bundleMetadata.shortVersion) ||
		!CAPCUT_SUPPORTED_VERSION_PATTERN.test(bundleMetadata.bundleVersion)
	) {
		throw new Error(
			"CapCut migration install requires an 8.1.x application bundle."
		);
	}
	const defaultAdjustBundlePath = join(
		canonicalAppPath,
		"Contents",
		"Resources",
		"DefaultAdjustBundle",
		"merge_all_adjust_color"
	);
	const canonicalAdjustBundlePath = await requireCanonicalDirectory({
		directory: defaultAdjustBundlePath,
		label: "CapCut default adjustment bundle",
	});
	if (
		!isSameOrDescendant({
			candidatePath: canonicalAdjustBundlePath,
			parentPath: canonicalAppPath,
		})
	) {
		throw new Error("CapCut adjustment bundle escaped the application.");
	}
	return {
		capCutAppPath: canonicalAppPath,
		defaultAdjustBundlePath: canonicalAdjustBundlePath,
	};
}

async function readTargetStoreState({
	targetDraftStoreDirectory,
}: {
	targetDraftStoreDirectory: string;
}): Promise<TargetStoreState> {
	const rootMetaInfoPath = join(
		targetDraftStoreDirectory,
		"root_meta_info.json"
	);
	const rootSnapshot = await readRegularFileSnapshot({
		filePath: rootMetaInfoPath,
		label: "target root_meta_info.json",
		maximumBytes: CAPCUT_8_1_INSTALL_LIMITS.metadataBytes,
	});
	const originalRootBytes = rootSnapshot.bytes;
	let parsed: unknown;
	try {
		parsed = JSON.parse(originalRootBytes.toString("utf8"));
	} catch {
		throw new Error("Target root_meta_info.json is not valid JSON.");
	}
	const rootMetaInfo = requireRecord({
		label: "target root_meta_info.json",
		value: parsed,
	});
	const entries = rootMetaInfo.all_draft_store;
	if (!Array.isArray(entries)) {
		throw new Error("Target root metadata has no all_draft_store array.");
	}
	if (entries.length >= CAPCUT_8_1_INSTALL_LIMITS.targetDraftCount) {
		throw new Error("Target root metadata exceeds the draft-count limit.");
	}
	const existingEntries = entries.map((entry, index) =>
		requireRecord({
			label: `target root draft entry ${index}`,
			value: entry,
		})
	);
	if (
		rootMetaInfo.root_path !== targetDraftStoreDirectory ||
		rootMetaInfo.draft_ids !== existingEntries.length
	) {
		throw new Error(
			"Target root metadata is inconsistent with its draft store."
		);
	}
	return {
		existingEntries,
		originalRootBytes,
		rootFileIdentity: rootSnapshot.identity,
		rootMetaInfo,
		rootMetaInfoPath,
	};
}

async function assertTargetRootMetadataUnchanged({
	targetState,
}: {
	targetState: TargetStoreState;
}): Promise<void> {
	const current = await readRegularFileSnapshot({
		filePath: targetState.rootMetaInfoPath,
		label: "target root_meta_info.json",
		maximumBytes: CAPCUT_8_1_INSTALL_LIMITS.metadataBytes,
	});
	const expected = targetState.rootFileIdentity;
	const actual = current.identity;
	if (
		actual.changedAtMilliseconds !== expected.changedAtMilliseconds ||
		actual.device !== expected.device ||
		actual.inode !== expected.inode ||
		actual.modifiedAtMilliseconds !== expected.modifiedAtMilliseconds ||
		actual.sha256 !== expected.sha256 ||
		actual.size !== expected.size
	) {
		throw new Error(
			"Target root metadata changed during the CapCut migration install."
		);
	}
}

function assertNoDuplicateDraft({
	bundle,
	existingEntries,
	targetDraftDirectory,
}: {
	bundle: VerifiedCapCut81MigrationBundle;
	existingEntries: readonly Record<string, unknown>[];
	targetDraftDirectory: string;
}): void {
	const duplicate = existingEntries.find((entry) => {
		const folderPath = entry.draft_fold_path;
		return (
			entry.draft_id === bundle.manifest.ids.draftId ||
			folderPath === targetDraftDirectory ||
			(typeof folderPath === "string" &&
				basename(folderPath) === bundle.draftFolderName)
		);
	});
	if (duplicate) {
		throw new Error(
			`Target draft store already contains draft ${bundle.manifest.ids.draftId} or folder ${bundle.draftFolderName}.`
		);
	}
}

function buildInstalledRootEntry({
	bundle,
	targetDraftDirectory,
	targetDraftStoreDirectory,
}: {
	bundle: VerifiedCapCut81MigrationBundle;
	targetDraftDirectory: string;
	targetDraftStoreDirectory: string;
}): Record<string, unknown> {
	const rebound = rebindScaffoldValue({
		sourceDraftStoreDirectory: bundle.storedDraftStoreDirectory,
		targetDraftStoreDirectory,
		value: bundle.sourceRootEntry,
	});
	const entry = requireRecord({
		label: "installed root draft entry",
		value: rebound,
	});
	if (
		entry.draft_id !== bundle.manifest.ids.draftId ||
		entry.draft_fold_path !== targetDraftDirectory ||
		entry.draft_json_file !== join(targetDraftDirectory, "draft_info.json") ||
		entry.draft_root_path !== targetDraftStoreDirectory
	) {
		throw new Error("Installed draft entry path rebinding is inconsistent.");
	}
	return entry;
}

async function createRootMetadataBackup({
	originalRootBytes,
	targetDraftStoreDirectory,
}: {
	originalRootBytes: Buffer;
	targetDraftStoreDirectory: string;
}): Promise<string> {
	const backupDirectory = join(
		dirname(targetDraftStoreDirectory),
		".qcut-capcut-root-backups"
	);
	await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
	const backupPath = join(
		backupDirectory,
		`root_meta_info.${Date.now()}.${randomUUID()}.json`
	);
	const handle = await open(backupPath, "wx", 0o600);
	try {
		await handle.writeFile(originalRootBytes);
		await handle.sync();
	} finally {
		await handle.close();
	}
	await syncDirectory({ directory: backupDirectory });
	return backupPath;
}

async function installVerifiedBundle({
	assertTargetAppClosed,
	bundle,
	capCutAppPath,
	defaultAdjustBundlePath,
	targetDraftStoreDirectory,
	testingHooks = {},
}: {
	assertTargetAppClosed: InstallTrustedCapCut81MigrationBundleOptions["assertTargetAppClosed"];
	bundle: VerifiedCapCut81MigrationBundle;
	capCutAppPath: string;
	defaultAdjustBundlePath: string;
	targetDraftStoreDirectory: string;
	testingHooks?: CapCut81MigrationInstallerTestingHooks;
}): Promise<CapCut81MigrationInstallResult> {
	const targetDraftDirectory = join(
		targetDraftStoreDirectory,
		bundle.draftFolderName
	);
	const lockPath = join(targetDraftStoreDirectory, LOCK_FILE_NAME);
	const installNonce = randomUUID();
	const stagingDirectory = join(
		targetDraftStoreDirectory,
		`.qcut-install-${bundle.manifest.ids.draftId}-${installNonce}.staging`
	);
	const installLock = await acquireInstallLock({
		draftId: bundle.manifest.ids.draftId,
		lockPath,
		nonce: installNonce,
		stagingDirectory,
	});
	let finalDirectoryPublished = false;
	let rootMetadataPublished = false;
	let targetState: TargetStoreState | undefined;
	try {
		targetState = await readTargetStoreState({ targetDraftStoreDirectory });
		assertNoDuplicateDraft({
			bundle,
			existingEntries: targetState.existingEntries,
			targetDraftDirectory,
		});
		try {
			await lstat(targetDraftDirectory);
			throw new Error(
				`Target draft folder already exists: ${targetDraftDirectory}`
			);
		} catch (error) {
			if (getNodeErrorCode({ value: error }) !== "ENOENT") throw error;
		}
		await testingHooks.beforeDraftCopy?.();
		await copyVerifiedDraftTree({
			bundle,
			destinationDirectory: stagingDirectory,
			testingHooks,
		});
		const [{ paths: stagedContentPaths, sha256 }] = await Promise.all([
			rebindContentMirrors({
				bundle,
				defaultAdjustBundlePath,
				stagingDirectory,
				targetDraftDirectory,
			}),
			rebindScaffoldFiles({
				bundle,
				stagingDirectory,
				targetDraftStoreDirectory,
			}),
		]);
		await mapWithConcurrency({
			concurrency: CAPCUT_8_1_INSTALL_LIMITS.concurrentFileOperations,
			items: bundle.draftDirectories,
			mapper: (relativePath) =>
				syncDirectory({
					directory: join(stagingDirectory, ...relativePath.split("/")),
				}),
		});
		await syncDirectory({ directory: stagingDirectory });
		await assertTargetAppClosed({
			capCutAppPath,
			targetDraftStoreDirectory,
		});
		await assertTargetRootMetadataUnchanged({ targetState });
		const rootMetaInfoBackupPath = await createRootMetadataBackup({
			originalRootBytes: targetState.originalRootBytes,
			targetDraftStoreDirectory,
		});
		const installedEntry = buildInstalledRootEntry({
			bundle,
			targetDraftDirectory,
			targetDraftStoreDirectory,
		});
		const installedRootMetaInfo = {
			...targetState.rootMetaInfo,
			all_draft_store: [...targetState.existingEntries, installedEntry],
			draft_ids: targetState.existingEntries.length + 1,
			root_path: targetDraftStoreDirectory,
		};
		try {
			await lstat(targetDraftDirectory);
			throw new Error(
				`Target draft folder appeared during install: ${targetDraftDirectory}`
			);
		} catch (error) {
			if (getNodeErrorCode({ value: error }) !== "ENOENT") throw error;
		}
		await assertTargetAppClosed({
			capCutAppPath,
			targetDraftStoreDirectory,
		});
		await assertTargetRootMetadataUnchanged({ targetState });
		await rename(stagingDirectory, targetDraftDirectory);
		finalDirectoryPublished = true;
		await syncDirectory({ directory: targetDraftStoreDirectory });
		await testingHooks.afterDraftPublished?.();
		await assertTargetAppClosed({
			capCutAppPath,
			targetDraftStoreDirectory,
		});
		await assertTargetRootMetadataUnchanged({ targetState });
		await writeAtomicFile({
			bytes: Buffer.from(JSON.stringify(installedRootMetaInfo), "utf8"),
			filePath: targetState.rootMetaInfoPath,
		});
		rootMetadataPublished = true;
		await syncDirectory({ directory: targetDraftStoreDirectory });
		const contentMirrorPaths = stagedContentPaths.map((stagedPath) =>
			join(targetDraftDirectory, relative(stagingDirectory, stagedPath))
		);
		return {
			contentMirrorPaths,
			draftDirectory: targetDraftDirectory,
			draftFolderName: bundle.draftFolderName,
			draftId: bundle.manifest.ids.draftId,
			installedContentSha256: sha256,
			rootMetaInfoBackupPath,
			rootMetaInfoPath: targetState.rootMetaInfoPath,
			targetDraftStoreDirectory,
			timelineId: bundle.manifest.ids.timelineId,
		};
	} catch (error) {
		let rollbackError: unknown;
		if (rootMetadataPublished && targetState) {
			try {
				await writeAtomicFile({
					bytes: targetState.originalRootBytes,
					filePath: targetState.rootMetaInfoPath,
				});
				await syncDirectory({ directory: targetDraftStoreDirectory });
			} catch (failure) {
				rollbackError = failure;
			}
		}
		if (finalDirectoryPublished && rollbackError === undefined) {
			await rm(targetDraftDirectory, { force: true, recursive: true }).catch(
				() => undefined
			);
		}
		await rm(stagingDirectory, { force: true, recursive: true }).catch(
			() => undefined
		);
		if (rollbackError !== undefined) {
			throw new AggregateError(
				[error, rollbackError],
				"CapCut migration failed and root metadata rollback also failed."
			);
		}
		throw error;
	} finally {
		await releaseInstallLock({ lock: installLock });
	}
}

async function installForMac({
	assertTargetAppClosed,
	capCutAppPath,
	outputDirectory,
	targetDraftStoreDirectory,
	testingHooks,
}: InstallForMacOptions): Promise<CapCut81MigrationInstallResult> {
	const [bundle, canonicalTargetStore, capCutAppPaths] = await Promise.all([
		verifyCapCut81MigrationBundle({ outputDirectory }),
		requireCanonicalDirectory({
			directory: targetDraftStoreDirectory,
			label: "Target CapCut draft store",
		}),
		validateCapCutApp({ capCutAppPath }),
	]);
	if (basename(canonicalTargetStore) !== DRAFT_STORE_DIRECTORY_NAME) {
		throw new Error(
			`Target CapCut draft store must be named ${DRAFT_STORE_DIRECTORY_NAME}.`
		);
	}
	if (
		canonicalTargetStore.includes("##_") ||
		canonicalTargetStore.includes(";") ||
		capCutAppPaths.defaultAdjustBundlePath.includes("##_") ||
		capCutAppPaths.defaultAdjustBundlePath.includes(";")
	) {
		throw new Error(
			"CapCut install paths contain unsupported token delimiters."
		);
	}
	if (
		isSameOrDescendant({
			candidatePath: bundle.outputDirectory,
			parentPath: canonicalTargetStore,
		}) ||
		isSameOrDescendant({
			candidatePath: canonicalTargetStore,
			parentPath: bundle.outputDirectory,
		})
	) {
		throw new Error(
			"Migration bundle and target draft store must not overlap."
		);
	}
	await assertTargetAppClosed({
		capCutAppPath: capCutAppPaths.capCutAppPath,
		targetDraftStoreDirectory: canonicalTargetStore,
	});
	return installVerifiedBundle({
		assertTargetAppClosed,
		bundle,
		capCutAppPath: capCutAppPaths.capCutAppPath,
		defaultAdjustBundlePath: capCutAppPaths.defaultAdjustBundlePath,
		targetDraftStoreDirectory: canonicalTargetStore,
		...(testingHooks ? { testingHooks } : {}),
	});
}

export async function installTrustedCapCut81MigrationBundle({
	assertTargetAppClosed,
	capCutAppPath,
	outputDirectory,
	targetDraftStoreDirectory,
}: InstallTrustedCapCut81MigrationBundleOptions): Promise<CapCut81MigrationInstallResult> {
	if (process.platform !== "darwin") {
		throw new Error("CapCut 8.1 migration install is supported only on macOS.");
	}
	return installForMac({
		assertTargetAppClosed,
		capCutAppPath,
		outputDirectory,
		targetDraftStoreDirectory,
	});
}

export const capCut81MigrationInstallerTesting = Object.freeze({
	installForMac,
});

export type {
	CapCut81MigrationInstallResult,
	CapCut81TargetAppGuardContext,
	InstallTrustedCapCut81MigrationBundleOptions,
} from "./capcut-8-1-migration-installer-types.js";
