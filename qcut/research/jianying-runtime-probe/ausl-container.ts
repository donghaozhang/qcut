const AUSL_HEADER_BYTES = 12;
const AUSL_BLOCK_BYTES = 16;
const AUSL_MAGIC = new TextEncoder().encode("ASLE");

export type AuslContainer = {
	reserved: number;
	decodedByteLength: number;
	ciphertextByteLength: number;
	paddingByteLength: number;
	ciphertext: Uint8Array;
};

export function parseAuslContainer({
	bytes,
}: {
	bytes: Uint8Array;
}): AuslContainer {
	if (bytes.byteLength < AUSL_HEADER_BYTES) {
		throw new Error("AUSL header is truncated");
	}
	for (let index = 0; index < AUSL_MAGIC.byteLength; index += 1) {
		if (bytes[index] !== AUSL_MAGIC[index]) {
			throw new Error("invalid ASLE magic");
		}
	}

	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const reserved = view.getUint32(4, true);
	const decodedByteLength = view.getUint32(8, true);
	const ciphertext = bytes.subarray(AUSL_HEADER_BYTES);
	const expectedCiphertextByteLength =
		Math.ceil(decodedByteLength / AUSL_BLOCK_BYTES) * AUSL_BLOCK_BYTES;
	if (ciphertext.byteLength !== expectedCiphertextByteLength) {
		throw new Error(
			`AUSL block coverage mismatch: expected ${expectedCiphertextByteLength}, received ${ciphertext.byteLength}`
		);
	}

	return {
		reserved,
		decodedByteLength,
		ciphertextByteLength: ciphertext.byteLength,
		paddingByteLength: ciphertext.byteLength - decodedByteLength,
		ciphertext,
	};
}
