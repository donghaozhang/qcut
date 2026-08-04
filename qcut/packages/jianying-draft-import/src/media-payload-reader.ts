import { createHash } from "node:crypto";
import { constants, type BigIntStats } from "node:fs";
import { open } from "node:fs/promises";
import { pipeline } from "node:stream/promises";

export const MAX_MEDIA_PAYLOAD_CHUNK_BYTES = 4 * 1024 * 1024;

export interface MediaPayloadFileIdentity {
	device: string;
	inode: string;
	size: string;
	mtimeNanoseconds: string;
}

export type MediaPayloadReadErrorCode = "payload-too-large" | "source-changed";

export class MediaPayloadReadError extends Error {
	readonly code: MediaPayloadReadErrorCode;

	constructor({
		code,
		message,
	}: {
		code: MediaPayloadReadErrorCode;
		message: string;
	}) {
		super(message);
		this.name = "MediaPayloadReadError";
		this.code = code;
	}
}

export function toMediaPayloadFileIdentity({
	metadata,
}: {
	metadata: BigIntStats;
}): MediaPayloadFileIdentity {
	return {
		device: metadata.dev.toString(),
		inode: metadata.ino.toString(),
		size: metadata.size.toString(),
		mtimeNanoseconds: metadata.mtimeNs.toString(),
	};
}

export function mediaPayloadFileIdentitiesEqual({
	after,
	before,
}: {
	after: MediaPayloadFileIdentity;
	before: MediaPayloadFileIdentity;
}): boolean {
	return (
		after.device === before.device &&
		after.inode === before.inode &&
		after.size === before.size &&
		after.mtimeNanoseconds === before.mtimeNanoseconds
	);
}

function sourceChanged({
	message,
}: {
	message: string;
}): MediaPayloadReadError {
	return new MediaPayloadReadError({ code: "source-changed", message });
}

async function fillBuffer({
	bufferOffset = 0,
	bytes,
	fileOffset = 0,
	handle,
}: {
	bufferOffset?: number;
	bytes: Buffer;
	fileOffset?: number;
	handle: Awaited<ReturnType<typeof open>>;
}): Promise<void> {
	if (bufferOffset >= bytes.length) return;
	const { bytesRead } = await handle.read(
		bytes,
		bufferOffset,
		bytes.length - bufferOffset,
		fileOffset + bufferOffset
	);
	if (bytesRead === 0) {
		throw sourceChanged({ message: "resolved media changed while reading" });
	}
	return fillBuffer({
		bufferOffset: bufferOffset + bytesRead,
		bytes,
		fileOffset,
		handle,
	});
}

function hasValidEvidence({
	expectedByteLength,
	expectedSha256,
}: {
	expectedByteLength: number;
	expectedSha256: string;
}): boolean {
	return (
		Number.isSafeInteger(expectedByteLength) &&
		expectedByteLength >= 0 &&
		/^[a-f0-9]{64}$/u.test(expectedSha256)
	);
}

async function openVerifiedSource({
	absolutePath,
	expectedByteLength,
	expectedIdentity,
}: {
	absolutePath: string;
	expectedByteLength: number;
	expectedIdentity?: MediaPayloadFileIdentity;
}): Promise<{
	handle: Awaited<ReturnType<typeof open>>;
	identity: MediaPayloadFileIdentity;
}> {
	const noFollowFlag = constants.O_NOFOLLOW ?? 0;
	let handle: Awaited<ReturnType<typeof open>>;
	try {
		handle = await open(absolutePath, constants.O_RDONLY | noFollowFlag);
	} catch {
		throw sourceChanged({ message: "resolved media is no longer readable" });
	}
	try {
		const metadata = await handle.stat({ bigint: true });
		const identity = toMediaPayloadFileIdentity({ metadata });
		if (
			!metadata.isFile() ||
			metadata.size !== BigInt(expectedByteLength) ||
			(expectedIdentity !== undefined &&
				!mediaPayloadFileIdentitiesEqual({
					after: identity,
					before: expectedIdentity,
				}))
		) {
			throw sourceChanged({ message: "resolved media identity changed" });
		}
		return { handle, identity };
	} catch (error) {
		await handle.close().catch(() => undefined);
		if (error instanceof MediaPayloadReadError) throw error;
		throw sourceChanged({ message: "resolved media identity changed" });
	}
}

async function assertHandleIdentity({
	expectedIdentity,
	handle,
}: {
	expectedIdentity: MediaPayloadFileIdentity;
	handle: Awaited<ReturnType<typeof open>>;
}): Promise<void> {
	const metadata = await handle.stat({ bigint: true });
	const actualIdentity = toMediaPayloadFileIdentity({ metadata });
	if (
		!metadata.isFile() ||
		!mediaPayloadFileIdentitiesEqual({
			after: actualIdentity,
			before: expectedIdentity,
		})
	) {
		throw sourceChanged({ message: "resolved media changed while reading" });
	}
}

export async function verifyMediaPayloadSource({
	absolutePath,
	expectedByteLength,
	expectedIdentity,
	expectedSha256,
}: {
	absolutePath: string;
	expectedByteLength: number;
	expectedIdentity?: MediaPayloadFileIdentity;
	expectedSha256: string;
}): Promise<MediaPayloadFileIdentity> {
	if (!hasValidEvidence({ expectedByteLength, expectedSha256 })) {
		throw sourceChanged({ message: "resolved media evidence is invalid" });
	}
	const opened = await openVerifiedSource({
		absolutePath,
		expectedByteLength,
		...(expectedIdentity === undefined ? {} : { expectedIdentity }),
	});
	try {
		const hash = createHash("sha256");
		await pipeline(opened.handle.createReadStream({ autoClose: false }), hash);
		await assertHandleIdentity({
			expectedIdentity: opened.identity,
			handle: opened.handle,
		});
		if (hash.digest("hex") !== expectedSha256) {
			throw sourceChanged({ message: "resolved media digest changed" });
		}
		return opened.identity;
	} catch (error) {
		if (error instanceof MediaPayloadReadError) throw error;
		throw sourceChanged({ message: "resolved media changed while reading" });
	} finally {
		await opened.handle.close().catch(() => undefined);
	}
}

export async function readVerifiedMediaPayloadChunk({
	absolutePath,
	expectedByteLength,
	expectedIdentity,
	maxBytes,
	offset,
}: {
	absolutePath: string;
	expectedByteLength: number;
	expectedIdentity: MediaPayloadFileIdentity;
	maxBytes: number;
	offset: number;
}): Promise<Buffer> {
	if (
		!Number.isSafeInteger(expectedByteLength) ||
		expectedByteLength < 0 ||
		!Number.isSafeInteger(offset) ||
		offset < 0 ||
		offset > expectedByteLength ||
		!Number.isSafeInteger(maxBytes) ||
		maxBytes < 1 ||
		maxBytes > MAX_MEDIA_PAYLOAD_CHUNK_BYTES
	) {
		throw sourceChanged({ message: "media chunk request is invalid" });
	}
	const opened = await openVerifiedSource({
		absolutePath,
		expectedByteLength,
		expectedIdentity,
	});
	try {
		const byteLength = Math.min(maxBytes, expectedByteLength - offset);
		const bytes = Buffer.alloc(byteLength);
		await fillBuffer({ bytes, fileOffset: offset, handle: opened.handle });
		await assertHandleIdentity({
			expectedIdentity,
			handle: opened.handle,
		});
		return bytes;
	} catch (error) {
		if (error instanceof MediaPayloadReadError) throw error;
		throw sourceChanged({ message: "resolved media changed while reading" });
	} finally {
		await opened.handle.close().catch(() => undefined);
	}
}

export async function readVerifiedMediaPayload({
	absolutePath,
	expectedByteLength,
	expectedSha256,
	remainingBudget,
}: {
	absolutePath: string;
	expectedByteLength: number;
	expectedSha256: string;
	remainingBudget: number;
}): Promise<Buffer> {
	if (
		!hasValidEvidence({ expectedByteLength, expectedSha256 }) ||
		!Number.isSafeInteger(remainingBudget) ||
		remainingBudget < 0
	) {
		throw sourceChanged({ message: "resolved media evidence is invalid" });
	}

	const opened = await openVerifiedSource({
		absolutePath,
		expectedByteLength,
	});

	try {
		if (expectedByteLength > remainingBudget) {
			throw new MediaPayloadReadError({
				code: "payload-too-large",
				message: "media payloads exceed the transport budget",
			});
		}

		const bytes = Buffer.alloc(expectedByteLength);
		await fillBuffer({ bytes, handle: opened.handle });

		await assertHandleIdentity({
			expectedIdentity: opened.identity,
			handle: opened.handle,
		});
		const actualSha256 = createHash("sha256").update(bytes).digest("hex");
		if (actualSha256 !== expectedSha256) {
			throw sourceChanged({ message: "resolved media digest changed" });
		}
		return bytes;
	} catch (error) {
		if (error instanceof MediaPayloadReadError) throw error;
		throw sourceChanged({ message: "resolved media changed while reading" });
	} finally {
		await opened.handle.close().catch(() => undefined);
	}
}
