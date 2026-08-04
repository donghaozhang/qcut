import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, rename, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import {
	parseQCutImportBundleV1,
	type QCutImportBundleV1,
} from "@qcut/editor-core/draft-interop";
import {
	assertSafeEntryId,
	DesktopImportInboxMalformedError,
	ensurePrivateDirectory,
	type InboxManifestV1,
	type InboxMediaDescriptorV1,
	INBOX_ENTRY_SCHEMA_VERSION,
	MANIFEST_FILE_NAME,
	MAX_MANIFEST_BYTES,
	readDesktopImportManifest,
	writePrivateFile,
	type DesktopImportInboxEntrySummary,
} from "./desktop-import-inbox.js";
import type { DraftImportGrantedCommitDto } from "./import-session.js";
import {
	MAX_IMPORT_MEDIA_BYTES,
	MEDIA_PAYLOAD_GRANT_SCHEMA_VERSION,
	type MediaPayloadChunkDto,
	type MediaPayloadGrantDto,
	MediaPayloadGrantStore,
} from "./media-payload-grant-store.js";
import { MAX_MEDIA_PAYLOAD_CHUNK_BYTES } from "./media-payload-reader.js";
import { verifyQCutImportBundleDigest } from "./qcut-import-bundle-builder.js";

const SAFE_GRANT_TOKEN = /^[A-Za-z0-9_-]{32,128}$/u;
const MAX_CONCURRENT_INBOX_MEDIA_WRITES = 2;
const MAX_CONCURRENT_INBOX_MEDIA_GRANTS = 4;

export type MediaPayloadChunkReader = (options: {
	input: unknown;
}) => Promise<MediaPayloadChunkDto>;

interface ValidatedGrantedCommit {
	bundle: QCutImportBundleV1;
	grants: MediaPayloadGrantDto[];
}

function validateGrant({
	grant,
	knownResolvedResources,
}: {
	grant: MediaPayloadGrantDto;
	knownResolvedResources: ReadonlyMap<
		string,
		{ byteLength: number; sha256: string }
	>;
}): void {
	const expected = knownResolvedResources.get(grant.resourceId);
	if (
		Object.keys(grant).length !== 8 ||
		grant.schemaVersion !== MEDIA_PAYLOAD_GRANT_SCHEMA_VERSION ||
		!SAFE_GRANT_TOKEN.test(grant.grantToken) ||
		typeof grant.resourceId !== "string" ||
		grant.resourceId.length === 0 ||
		grant.resourceId.length > 1024 ||
		typeof grant.fileName !== "string" ||
		grant.fileName.length === 0 ||
		grant.fileName.length > 1024 ||
		basename(grant.fileName) !== grant.fileName ||
		typeof grant.mimeType !== "string" ||
		grant.mimeType.length === 0 ||
		grant.mimeType.length > 256 ||
		!Number.isSafeInteger(grant.byteLength) ||
		grant.byteLength < 0 ||
		grant.byteLength > MAX_IMPORT_MEDIA_BYTES ||
		!/^[a-f0-9]{64}$/u.test(grant.sha256) ||
		!Number.isSafeInteger(grant.expiresAtUnixMilliseconds) ||
		grant.expiresAtUnixMilliseconds < 0 ||
		expected === undefined ||
		expected.byteLength !== grant.byteLength ||
		expected.sha256 !== grant.sha256
	) {
		throw new DesktopImportInboxMalformedError();
	}
}

function validateGrantedCommit({
	commit,
}: {
	commit: DraftImportGrantedCommitDto;
}): ValidatedGrantedCommit {
	const parsed = parseQCutImportBundleV1(commit.bundle);
	if (!parsed.ok || !verifyQCutImportBundleDigest({ bundle: parsed.bundle })) {
		throw new DesktopImportInboxMalformedError();
	}
	const knownResolvedResources = new Map<
		string,
		{
			byteLength: number;
			sha256: string;
		}
	>();
	for (const staging of parsed.bundle.resourceStaging) {
		if (
			staging.status === "resolved" &&
			staging.byteLength !== undefined &&
			staging.sha256 !== undefined
		) {
			knownResolvedResources.set(staging.resourceId, {
				byteLength: staging.byteLength,
				sha256: staging.sha256,
			});
		}
	}
	const resourceIds = new Set<string>();
	const grantTokens = new Set<string>();
	let totalBytes = 0;
	for (const grant of commit.mediaGrants) {
		validateGrant({ grant, knownResolvedResources });
		if (
			resourceIds.has(grant.resourceId) ||
			grantTokens.has(grant.grantToken)
		) {
			throw new DesktopImportInboxMalformedError();
		}
		resourceIds.add(grant.resourceId);
		grantTokens.add(grant.grantToken);
		totalBytes += grant.byteLength;
		if (
			!Number.isSafeInteger(totalBytes) ||
			totalBytes > MAX_IMPORT_MEDIA_BYTES
		) {
			throw new DesktopImportInboxMalformedError();
		}
	}
	if (
		resourceIds.size !== knownResolvedResources.size ||
		[...knownResolvedResources.keys()].some(
			(resourceId) => !resourceIds.has(resourceId)
		)
	) {
		throw new DesktopImportInboxMalformedError();
	}
	return { bundle: parsed.bundle, grants: [...commit.mediaGrants] };
}

function validateChunk({
	chunk,
	expectedGrantToken,
	expectedOffset,
	expectedPayloadBytes,
	maxBytes,
}: {
	chunk: MediaPayloadChunkDto;
	expectedGrantToken: string;
	expectedOffset: number;
	expectedPayloadBytes: number;
	maxBytes: number;
}): Uint8Array {
	const bytes = chunk.bytes;
	const expectedEof =
		expectedOffset + bytes.byteLength === expectedPayloadBytes;
	if (
		chunk.schemaVersion !== MEDIA_PAYLOAD_GRANT_SCHEMA_VERSION ||
		chunk.grantToken !== expectedGrantToken ||
		chunk.offset !== expectedOffset ||
		!(bytes instanceof Uint8Array) ||
		bytes.byteLength > maxBytes ||
		expectedOffset + bytes.byteLength > expectedPayloadBytes ||
		(bytes.byteLength === 0 && expectedOffset < expectedPayloadBytes) ||
		chunk.eof !== expectedEof
	) {
		throw new DesktopImportInboxMalformedError();
	}
	return bytes;
}

async function writeAll({
	bufferOffset = 0,
	bytes,
	fileOffset,
	handle,
}: {
	bufferOffset?: number;
	bytes: Uint8Array;
	fileOffset: number;
	handle: Awaited<ReturnType<typeof open>>;
}): Promise<void> {
	if (bufferOffset >= bytes.byteLength) return;
	const { bytesWritten } = await handle.write(
		bytes,
		bufferOffset,
		bytes.byteLength - bufferOffset,
		fileOffset + bufferOffset
	);
	if (bytesWritten === 0) throw new DesktopImportInboxMalformedError();
	return writeAll({
		bufferOffset: bufferOffset + bytesWritten,
		bytes,
		fileOffset,
		handle,
	});
}

async function writeGrantFile({
	filePath,
	grant,
	readChunk,
}: {
	filePath: string;
	grant: MediaPayloadGrantDto;
	readChunk: MediaPayloadChunkReader;
}): Promise<void> {
	const handle = await open(filePath, "wx", 0o600);
	const hash = createHash("sha256");
	const copyNext = async ({ offset }: { offset: number }): Promise<void> => {
		const remaining = grant.byteLength - offset;
		const maxBytes = Math.min(
			MAX_MEDIA_PAYLOAD_CHUNK_BYTES,
			Math.max(1, remaining)
		);
		const chunk = await readChunk({
			input: { grantToken: grant.grantToken, offset, maxBytes },
		});
		const bytes = validateChunk({
			chunk,
			expectedGrantToken: grant.grantToken,
			expectedOffset: offset,
			expectedPayloadBytes: grant.byteLength,
			maxBytes,
		});
		if (bytes.byteLength === 0) return;
		hash.update(bytes);
		await writeAll({ bytes, fileOffset: offset, handle });
		if (chunk.eof) return;
		return copyNext({ offset: offset + bytes.byteLength });
	};
	try {
		await copyNext({ offset: 0 });
		if (hash.digest("hex") !== grant.sha256) {
			throw new DesktopImportInboxMalformedError();
		}
		await handle.sync();
	} finally {
		await handle.close().catch(() => undefined);
	}
}

async function writeGrantedMedia({
	directory,
	grants,
	readChunk,
}: {
	directory: string;
	grants: readonly MediaPayloadGrantDto[];
	readChunk: MediaPayloadChunkReader;
}): Promise<InboxMediaDescriptorV1[]> {
	const descriptors = grants.map((grant, index) => ({
		resourceId: grant.resourceId,
		fileName: grant.fileName,
		mimeType: grant.mimeType,
		storageName: `media-${index}.bin`,
		byteLength: grant.byteLength,
		sha256: grant.sha256,
	}));
	let nextIndex = 0;
	const writeNext = async (): Promise<void> => {
		const index = nextIndex;
		nextIndex += 1;
		if (index >= grants.length) return;
		await writeGrantFile({
			filePath: join(directory, descriptors[index].storageName),
			grant: grants[index],
			readChunk,
		});
		return writeNext();
	};
	const outcomes = await Promise.allSettled(
		Array.from(
			{ length: Math.min(MAX_CONCURRENT_INBOX_MEDIA_WRITES, grants.length) },
			() => writeNext()
		)
	);
	const failure = outcomes.find((outcome) => outcome.status === "rejected");
	if (failure?.status === "rejected") throw failure.reason;
	return descriptors;
}

export async function enqueueDesktopImportFromGrants({
	inboxDirectory,
	commit,
	readChunk,
	entryId = randomUUID(),
	nowUnixMilliseconds = Date.now(),
}: {
	inboxDirectory: string;
	commit: DraftImportGrantedCommitDto;
	readChunk: MediaPayloadChunkReader;
	entryId?: string;
	nowUnixMilliseconds?: number;
}): Promise<DesktopImportInboxEntrySummary> {
	assertSafeEntryId({ entryId });
	if (!Number.isSafeInteger(nowUnixMilliseconds) || nowUnixMilliseconds < 0) {
		throw new DesktopImportInboxMalformedError();
	}
	const validated = validateGrantedCommit({ commit });
	await ensurePrivateDirectory({ directory: inboxDirectory });
	const temporaryDirectory = join(
		inboxDirectory,
		`.${entryId}.${randomUUID()}.tmp`
	);
	const entryDirectory = join(inboxDirectory, entryId);
	try {
		await mkdir(temporaryDirectory, { mode: 0o700 });
		const media = await writeGrantedMedia({
			directory: temporaryDirectory,
			grants: validated.grants,
			readChunk,
		});
		const manifest: InboxManifestV1 = {
			schemaVersion: INBOX_ENTRY_SCHEMA_VERSION,
			entryId,
			createdAtUnixMilliseconds: nowUnixMilliseconds,
			bundle: validated.bundle,
			media,
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
		projectName: validated.bundle.document.project.name,
		bundleDigest: validated.bundle.bundleDigest,
		mediaCount: validated.grants.length,
	};
}

async function grantInboxMedia({
	descriptors,
	entryDirectory,
	grantStore,
}: {
	descriptors: readonly InboxMediaDescriptorV1[];
	entryDirectory: string;
	grantStore: MediaPayloadGrantStore;
}): Promise<MediaPayloadGrantDto[]> {
	const grants = new Array<MediaPayloadGrantDto>(descriptors.length);
	let nextIndex = 0;
	const grantNext = async (): Promise<void> => {
		const index = nextIndex;
		nextIndex += 1;
		if (index >= descriptors.length) return;
		const descriptor = descriptors[index];
		grants[index] = await grantStore.grantSource({
			source: {
				resourceId: descriptor.resourceId,
				fileName: descriptor.fileName,
				mimeType: descriptor.mimeType,
				byteLength: descriptor.byteLength,
				sha256: descriptor.sha256,
				restrictedAbsolutePath: join(entryDirectory, descriptor.storageName),
			},
		});
		return grantNext();
	};
	const outcomes = await Promise.allSettled(
		Array.from(
			{
				length: Math.min(MAX_CONCURRENT_INBOX_MEDIA_GRANTS, descriptors.length),
			},
			() => grantNext()
		)
	);
	const failure = outcomes.find((outcome) => outcome.status === "rejected");
	if (failure?.status === "rejected") {
		grantStore.release({
			input: {
				grantTokens: grants
					.filter((grant) => grant !== undefined)
					.map((grant) => grant.grantToken),
			},
		});
		throw failure.reason;
	}
	return grants;
}

export async function readDesktopImportWithGrants({
	inboxDirectory,
	entryId,
	grantStore,
}: {
	inboxDirectory: string;
	entryId: string;
	grantStore: MediaPayloadGrantStore;
}): Promise<DraftImportGrantedCommitDto> {
	const manifest = await readDesktopImportManifest({ inboxDirectory, entryId });
	const mediaGrants = await grantInboxMedia({
		descriptors: manifest.media,
		entryDirectory: join(inboxDirectory, entryId),
		grantStore,
	});
	return { bundle: manifest.bundle, mediaGrants };
}
