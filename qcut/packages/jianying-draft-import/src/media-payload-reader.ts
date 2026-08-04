import { createHash } from "node:crypto";
import { constants, type BigIntStats } from "node:fs";
import { open } from "node:fs/promises";

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

function sameFileIdentity({
	after,
	before,
}: {
	after: BigIntStats;
	before: BigIntStats;
}): boolean {
	return (
		after.dev === before.dev &&
		after.ino === before.ino &&
		after.size === before.size &&
		after.mtimeNs === before.mtimeNs
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
	bytes,
	handle,
	offset = 0,
}: {
	bytes: Buffer;
	handle: Awaited<ReturnType<typeof open>>;
	offset?: number;
}): Promise<void> {
	if (offset >= bytes.length) return;
	const { bytesRead } = await handle.read(
		bytes,
		offset,
		bytes.length - offset,
		offset
	);
	if (bytesRead === 0) {
		throw sourceChanged({ message: "resolved media changed while reading" });
	}
	return fillBuffer({ bytes, handle, offset: offset + bytesRead });
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
		!Number.isSafeInteger(expectedByteLength) ||
		expectedByteLength < 0 ||
		!Number.isSafeInteger(remainingBudget) ||
		remainingBudget < 0 ||
		!/^[a-f0-9]{64}$/u.test(expectedSha256)
	) {
		throw sourceChanged({ message: "resolved media evidence is invalid" });
	}

	const noFollowFlag = constants.O_NOFOLLOW ?? 0;
	let handle: Awaited<ReturnType<typeof open>>;
	try {
		handle = await open(absolutePath, constants.O_RDONLY | noFollowFlag);
	} catch {
		throw sourceChanged({ message: "resolved media is no longer readable" });
	}

	try {
		const before = await handle.stat({ bigint: true });
		if (!before.isFile() || before.size !== BigInt(expectedByteLength)) {
			throw sourceChanged({ message: "resolved media size changed" });
		}
		if (before.size > BigInt(remainingBudget)) {
			throw new MediaPayloadReadError({
				code: "payload-too-large",
				message: "media payloads exceed the transport budget",
			});
		}

		const bytes = Buffer.alloc(expectedByteLength);
		await fillBuffer({ bytes, handle });

		const after = await handle.stat({ bigint: true });
		if (!sameFileIdentity({ after, before })) {
			throw sourceChanged({ message: "resolved media changed while reading" });
		}
		const actualSha256 = createHash("sha256").update(bytes).digest("hex");
		if (actualSha256 !== expectedSha256) {
			throw sourceChanged({ message: "resolved media digest changed" });
		}
		return bytes;
	} catch (error) {
		if (error instanceof MediaPayloadReadError) throw error;
		throw sourceChanged({ message: "resolved media changed while reading" });
	} finally {
		await handle.close().catch(() => undefined);
	}
}
