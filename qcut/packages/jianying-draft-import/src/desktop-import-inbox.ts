import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
	chmod,
	lstat,
	mkdir,
	open,
	readdir,
	rename,
	rm,
	rmdir,
	unlink,
} from "node:fs/promises";
import { basename, isAbsolute, join } from "node:path";
import {
	parseQCutImportBundleV1,
	type QCutImportBundleV1,
} from "@qcut/editor-core/draft-interop";
import type {
	DraftImportCommitDto,
	DraftImportMediaPayloadDto,
} from "./import-session.js";
import { verifyQCutImportBundleDigest } from "./qcut-import-bundle-builder.js";

const INBOX_ENTRY_SCHEMA_VERSION = 1 as const;
const MANIFEST_FILE_NAME = "manifest.v1.json";
const MAX_MANIFEST_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_MEDIA_BYTES = 512 * 1024 * 1024;
const SAFE_ENTRY_ID = /^[A-Za-z0-9_-]{1,128}$/u;

interface InboxMediaDescriptorV1 {
	resourceId: string;
	fileName: string;
	mimeType: string;
	storageName: string;
	byteLength: number;
	sha256: string;
}

interface InboxManifestV1 {
	schemaVersion: typeof INBOX_ENTRY_SCHEMA_VERSION;
	entryId: string;
	createdAtUnixMilliseconds: number;
	bundle: QCutImportBundleV1;
	media: InboxMediaDescriptorV1[];
}

export interface DesktopImportInboxEntrySummary {
	entryId: string;
	createdAtUnixMilliseconds: number;
	projectName: string;
	bundleDigest: string;
	mediaCount: number;
	/**
	 * Set when the entry exists but cannot be validated (partial write,
	 * corruption). It is listed — never silently hidden — so the user can
	 * delete it; reading or publishing it stays impossible.
	 */
	unreadable?: true;
}

export class DesktopImportInboxMalformedError extends Error {
	constructor() {
		super("Desktop import inbox entry is malformed.");
		this.name = "DesktopImportInboxMalformedError";
	}
}

export class DesktopImportInboxUnavailableError extends Error {
	constructor() {
		super("Desktop import inbox is unavailable.");
		this.name = "DesktopImportInboxUnavailableError";
	}
}

function assertSafeEntryId({ entryId }: { entryId: string }): void {
	if (!SAFE_ENTRY_ID.test(entryId)) {
		throw new DesktopImportInboxMalformedError();
	}
}

async function ensurePrivateDirectory({
	directory,
}: {
	directory: string;
}): Promise<void> {
	if (!isAbsolute(directory) || directory.includes("\0")) {
		throw new DesktopImportInboxUnavailableError();
	}
	await mkdir(directory, { recursive: true, mode: 0o700 });
	const metadata = await lstat(directory);
	if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
		throw new DesktopImportInboxUnavailableError();
	}
	await chmod(directory, 0o700);
}

function hasCanonicalBase64Shape({ value }: { value: string }): boolean {
	if (value.length === 0 || value.length % 4 !== 0) {
		return false;
	}
	let contentLength = value.length;
	while (contentLength > 0 && value.charCodeAt(contentLength - 1) === 61) {
		contentLength -= 1;
	}
	if (value.length - contentLength > 2) {
		return false;
	}
	for (let index = 0; index < contentLength; index += 1) {
		const code = value.charCodeAt(index);
		const isBase64Character =
			(code >= 48 && code <= 57) ||
			(code >= 65 && code <= 90) ||
			(code >= 97 && code <= 122) ||
			code === 43 ||
			code === 47;
		if (!isBase64Character) {
			return false;
		}
	}
	return true;
}

function decodeBase64({ value }: { value: string }): Buffer {
	if (
		value.length > Math.ceil((MAX_TOTAL_MEDIA_BYTES * 4) / 3) + 4 ||
		!hasCanonicalBase64Shape({ value })
	) {
		throw new DesktopImportInboxMalformedError();
	}
	const bytes = Buffer.from(value, "base64");
	if (bytes.toString("base64") !== value) {
		throw new DesktopImportInboxMalformedError();
	}
	return bytes;
}

function validateMediaPayload({
	payload,
	index,
	knownResourceIds,
}: {
	payload: DraftImportMediaPayloadDto;
	index: number;
	knownResourceIds: ReadonlySet<string>;
}): { descriptor: InboxMediaDescriptorV1; bytes: Buffer } {
	if (
		!knownResourceIds.has(payload.resourceId) ||
		payload.fileName.length === 0 ||
		payload.fileName.length > 1024 ||
		basename(payload.fileName) !== payload.fileName ||
		payload.mimeType.length === 0 ||
		payload.mimeType.length > 256
	) {
		throw new DesktopImportInboxMalformedError();
	}
	const bytes = decodeBase64({ value: payload.bytesBase64 });
	return {
		descriptor: {
			resourceId: payload.resourceId,
			fileName: payload.fileName,
			mimeType: payload.mimeType,
			storageName: `media-${index}.bin`,
			byteLength: bytes.length,
			sha256: createHash("sha256").update(bytes).digest("hex"),
		},
		bytes,
	};
}

function validateCommit({
	commit,
}: {
	commit: DraftImportCommitDto;
}): Array<{ descriptor: InboxMediaDescriptorV1; bytes: Buffer }> {
	const parsed = parseQCutImportBundleV1(
		JSON.parse(JSON.stringify(commit.bundle)) as unknown
	);
	if (!parsed.ok || !verifyQCutImportBundleDigest({ bundle: parsed.bundle })) {
		throw new DesktopImportInboxMalformedError();
	}
	const knownResourceIds = new Set(
		parsed.bundle.resourceStaging.map(({ resourceId }) => resourceId)
	);
	const seenResourceIds = new Set<string>();
	let totalBytes = 0;
	return commit.mediaPayloads.map((payload, index) => {
		if (seenResourceIds.has(payload.resourceId)) {
			throw new DesktopImportInboxMalformedError();
		}
		seenResourceIds.add(payload.resourceId);
		const validated = validateMediaPayload({
			payload,
			index,
			knownResourceIds,
		});
		totalBytes += validated.bytes.length;
		if (totalBytes > MAX_TOTAL_MEDIA_BYTES) {
			throw new DesktopImportInboxMalformedError();
		}
		return validated;
	});
}

async function writePrivateFile({
	filePath,
	bytes,
}: {
	filePath: string;
	bytes: string | Buffer;
}): Promise<void> {
	const handle = await open(filePath, "wx", 0o600);
	try {
		await handle.writeFile(bytes);
		await handle.sync();
	} finally {
		await handle.close();
	}
}

export async function enqueueDesktopImport({
	inboxDirectory,
	commit,
	entryId = randomUUID(),
	nowUnixMilliseconds = Date.now(),
}: {
	inboxDirectory: string;
	commit: DraftImportCommitDto;
	entryId?: string;
	nowUnixMilliseconds?: number;
}): Promise<DesktopImportInboxEntrySummary> {
	assertSafeEntryId({ entryId });
	if (!Number.isSafeInteger(nowUnixMilliseconds) || nowUnixMilliseconds < 0) {
		throw new DesktopImportInboxMalformedError();
	}
	const media = validateCommit({ commit });
	await ensurePrivateDirectory({ directory: inboxDirectory });
	const temporaryDirectory = join(
		inboxDirectory,
		`.${entryId}.${randomUUID()}.tmp`
	);
	const entryDirectory = join(inboxDirectory, entryId);
	try {
		await mkdir(temporaryDirectory, { mode: 0o700 });
		await Promise.all(
			media.map(({ descriptor, bytes }) =>
				writePrivateFile({
					filePath: join(temporaryDirectory, descriptor.storageName),
					bytes,
				})
			)
		);
		const manifest: InboxManifestV1 = {
			schemaVersion: INBOX_ENTRY_SCHEMA_VERSION,
			entryId,
			createdAtUnixMilliseconds: nowUnixMilliseconds,
			bundle: commit.bundle,
			media: media.map(({ descriptor }) => descriptor),
		};
		const serialized = JSON.stringify(manifest);
		if (Buffer.byteLength(serialized, "utf8") > MAX_MANIFEST_BYTES) {
			throw new DesktopImportInboxMalformedError();
		}
		await writePrivateFile({
			filePath: join(temporaryDirectory, MANIFEST_FILE_NAME),
			bytes: serialized,
		});
		await rename(temporaryDirectory, entryDirectory);
	} catch (error) {
		await rm(temporaryDirectory, { recursive: true, force: true }).catch(
			() => undefined
		);
		if (
			["EEXIST", "ENOTEMPTY"].includes(
				(error as NodeJS.ErrnoException).code ?? ""
			)
		) {
			throw new DesktopImportInboxMalformedError();
		}
		throw error;
	}
	return {
		entryId,
		createdAtUnixMilliseconds: nowUnixMilliseconds,
		projectName: commit.bundle.document.project.name,
		bundleDigest: commit.bundle.bundleDigest,
		mediaCount: media.length,
	};
}

async function readBoundedFile({
	filePath,
	maxBytes,
}: {
	filePath: string;
	maxBytes: number;
}): Promise<Buffer> {
	const handle = await open(
		filePath,
		constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)
	);
	try {
		const metadata = await handle.stat();
		if (
			!metadata.isFile() ||
			metadata.nlink !== 1 ||
			metadata.size > maxBytes
		) {
			throw new DesktopImportInboxMalformedError();
		}
		return await handle.readFile();
	} finally {
		await handle.close().catch(() => undefined);
	}
}

function parseManifest({
	value,
	entryId,
}: {
	value: unknown;
	entryId: string;
}) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new DesktopImportInboxMalformedError();
	}
	const record = value as Record<string, unknown>;
	if (
		Object.keys(record).length !== 5 ||
		record.schemaVersion !== INBOX_ENTRY_SCHEMA_VERSION ||
		record.entryId !== entryId ||
		!Number.isSafeInteger(record.createdAtUnixMilliseconds) ||
		!Array.isArray(record.media)
	) {
		throw new DesktopImportInboxMalformedError();
	}
	const parsedBundle = parseQCutImportBundleV1(record.bundle);
	if (
		!parsedBundle.ok ||
		!verifyQCutImportBundleDigest({ bundle: parsedBundle.bundle })
	) {
		throw new DesktopImportInboxMalformedError();
	}
	const media = record.media.map((value) => {
		if (typeof value !== "object" || value === null || Array.isArray(value)) {
			throw new DesktopImportInboxMalformedError();
		}
		const descriptor = value as Record<string, unknown>;
		if (
			Object.keys(descriptor).length !== 6 ||
			typeof descriptor.resourceId !== "string" ||
			typeof descriptor.fileName !== "string" ||
			typeof descriptor.mimeType !== "string" ||
			typeof descriptor.storageName !== "string" ||
			!/^media-[0-9]+\.bin$/u.test(descriptor.storageName) ||
			!Number.isSafeInteger(descriptor.byteLength) ||
			(descriptor.byteLength as number) < 0 ||
			(descriptor.byteLength as number) > MAX_TOTAL_MEDIA_BYTES ||
			typeof descriptor.sha256 !== "string" ||
			!/^[a-f0-9]{64}$/u.test(descriptor.sha256) ||
			basename(descriptor.fileName) !== descriptor.fileName ||
			descriptor.fileName.length === 0 ||
			descriptor.fileName.length > 1024 ||
			descriptor.mimeType.length === 0 ||
			descriptor.mimeType.length > 256
		) {
			throw new DesktopImportInboxMalformedError();
		}
		return descriptor as unknown as InboxMediaDescriptorV1;
	});
	const storageNames = new Set(media.map(({ storageName }) => storageName));
	const resourceIds = new Set(media.map(({ resourceId }) => resourceId));
	const totalBytes = media.reduce(
		(total, { byteLength }) => total + byteLength,
		0
	);
	if (
		storageNames.size !== media.length ||
		resourceIds.size !== media.length ||
		totalBytes > MAX_TOTAL_MEDIA_BYTES
	) {
		throw new DesktopImportInboxMalformedError();
	}
	return {
		schemaVersion: INBOX_ENTRY_SCHEMA_VERSION,
		entryId,
		createdAtUnixMilliseconds: record.createdAtUnixMilliseconds as number,
		bundle: parsedBundle.bundle,
		media,
	};
}

async function readInboxEntry({
	inboxDirectory,
	entryId,
}: {
	inboxDirectory: string;
	entryId: string;
}): Promise<{ manifest: InboxManifestV1; commit: DraftImportCommitDto }> {
	assertSafeEntryId({ entryId });
	const entryDirectory = join(inboxDirectory, entryId);
	const entryMetadata = await lstat(entryDirectory);
	if (!entryMetadata.isDirectory() || entryMetadata.isSymbolicLink()) {
		throw new DesktopImportInboxMalformedError();
	}
	const manifestBytes = await readBoundedFile({
		filePath: join(entryDirectory, MANIFEST_FILE_NAME),
		maxBytes: MAX_MANIFEST_BYTES,
	});
	let manifestValue: unknown;
	try {
		manifestValue = JSON.parse(manifestBytes.toString("utf8"));
	} catch {
		throw new DesktopImportInboxMalformedError();
	}
	const manifest = parseManifest({ value: manifestValue, entryId });
	const mediaPayloads = await Promise.all(
		manifest.media.map(async (descriptor) => {
			const bytes = await readBoundedFile({
				filePath: join(entryDirectory, descriptor.storageName),
				maxBytes: descriptor.byteLength,
			});
			if (
				bytes.length !== descriptor.byteLength ||
				createHash("sha256").update(bytes).digest("hex") !== descriptor.sha256
			) {
				throw new DesktopImportInboxMalformedError();
			}
			return {
				resourceId: descriptor.resourceId,
				fileName: descriptor.fileName,
				mimeType: descriptor.mimeType,
				bytesBase64: bytes.toString("base64"),
			};
		})
	);
	const commit = { bundle: manifest.bundle, mediaPayloads };
	validateCommit({ commit });
	return { manifest, commit };
}

export async function readDesktopImport({
	inboxDirectory,
	entryId,
}: {
	inboxDirectory: string;
	entryId: string;
}): Promise<DraftImportCommitDto> {
	return (await readInboxEntry({ inboxDirectory, entryId })).commit;
}

export async function listDesktopImports({
	inboxDirectory,
}: {
	inboxDirectory: string;
}): Promise<DesktopImportInboxEntrySummary[]> {
	await ensurePrivateDirectory({ directory: inboxDirectory });
	const entries = await readdir(inboxDirectory, { withFileTypes: true });
	const visibleEntries = entries.filter(
		(entry) => entry.isDirectory() && SAFE_ENTRY_ID.test(entry.name)
	);
	const summaries = await Promise.all(
		visibleEntries.map(
			async (entry): Promise<DesktopImportInboxEntrySummary> => {
				try {
					const { commit, manifest } = await readInboxEntry({
						inboxDirectory,
						entryId: entry.name,
					});
					return {
						entryId: entry.name,
						createdAtUnixMilliseconds: manifest.createdAtUnixMilliseconds,
						projectName: commit.bundle.document.project.name,
						bundleDigest: commit.bundle.bundleDigest,
						mediaCount: commit.mediaPayloads.length,
					};
				} catch {
					// One corrupt entry must not hide its siblings — surface it
					// as unreadable instead of failing the whole listing.
					return {
						entryId: entry.name,
						createdAtUnixMilliseconds: 0,
						projectName: "",
						bundleDigest: "",
						mediaCount: 0,
						unreadable: true,
					};
				}
			}
		)
	);
	return summaries.sort(
		(left, right) =>
			left.createdAtUnixMilliseconds - right.createdAtUnixMilliseconds
	);
}

export async function deleteDesktopImport({
	inboxDirectory,
	entryId,
}: {
	inboxDirectory: string;
	entryId: string;
}): Promise<void> {
	assertSafeEntryId({ entryId });
	const entryDirectory = join(inboxDirectory, entryId);
	const metadata = await lstat(entryDirectory);
	if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
		throw new DesktopImportInboxMalformedError();
	}
	const entries = await readdir(entryDirectory, { withFileTypes: true });
	for (const entry of entries) {
		if (!entry.isFile()) {
			throw new DesktopImportInboxMalformedError();
		}
	}
	await Promise.all(
		entries.map((entry) => unlink(join(entryDirectory, entry.name)))
	);
	await rmdir(entryDirectory);
}
