import type { ChunkedFileSource } from "@/lib/storage/chunked-file-source";

interface ImportMediaPayloadBase {
	resourceId: string;
	fileName: string;
	mimeType: string;
}

export interface ImportBufferedMediaPayload extends ImportMediaPayloadBase {
	transport?: "buffered";
	bytes: Uint8Array;
}

export interface ImportChunkedMediaPayload
	extends ImportMediaPayloadBase,
		ChunkedFileSource {
	transport: "chunked";
	sha256: string;
}

export type ImportMediaPayload =
	| ImportBufferedMediaPayload
	| ImportChunkedMediaPayload;

export function getImportMediaPayloadByteLength({
	payload,
}: {
	payload: ImportMediaPayload;
}): number {
	return payload.transport === "chunked"
		? payload.byteLength
		: payload.bytes.byteLength;
}
