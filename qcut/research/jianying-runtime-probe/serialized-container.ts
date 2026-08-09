const SERIALIZED_MAGIC = new TextEncoder().encode("%SerializedFormat%@\n");
const SERIALIZED_HEADER_BYTES = 64;
const SERIALIZED_RECORD_BYTES = 12;

export type SerializedRecord = {
	localId: number;
	typeHash: number;
	byteLength: number;
	payloadOffset: number;
	payload: Uint8Array;
};

export type SerializedContainer = {
	version: 1 | 2;
	additionalDirectoryBytes: number;
	payloadOffset: number;
	records: SerializedRecord[];
};

function assertRange({
	bytes,
	offset,
	byteLength,
	label,
}: {
	bytes: Uint8Array;
	offset: number;
	byteLength: number;
	label: string;
}) {
	if (
		!Number.isSafeInteger(offset) ||
		!Number.isSafeInteger(byteLength) ||
		offset < 0 ||
		byteLength < 0 ||
		offset + byteLength > bytes.byteLength
	) {
		throw new Error(`${label} exceeds the serialized file bounds`);
	}
}

function readUint32({ view, offset }: { view: DataView; offset: number }) {
	return view.getUint32(offset, true);
}

function assertMagic({ bytes }: { bytes: Uint8Array }) {
	assertRange({
		bytes,
		offset: 0,
		byteLength: SERIALIZED_MAGIC.byteLength,
		label: "magic",
	});

	for (let index = 0; index < SERIALIZED_MAGIC.byteLength; index += 1) {
		if (bytes[index] !== SERIALIZED_MAGIC[index]) {
			throw new Error("invalid %SerializedFormat%@ magic");
		}
	}
}

export function parseSerializedContainer({
	bytes,
}: {
	bytes: Uint8Array;
}): SerializedContainer {
	assertMagic({ bytes });
	assertRange({
		bytes,
		offset: 0,
		byteLength: SERIALIZED_HEADER_BYTES,
		label: "header",
	});

	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const version = readUint32({ view, offset: 20 });
	if (version !== 1 && version !== 2) {
		throw new Error(`unsupported serialized format version: ${version}`);
	}

	const recordCount = readUint32({ view, offset: 24 });
	const additionalDirectoryBytes = readUint32({ view, offset: 28 });
	const directoryByteLength = recordCount * SERIALIZED_RECORD_BYTES;
	if (!Number.isSafeInteger(directoryByteLength)) {
		throw new Error("serialized record directory is too large");
	}

	const payloadOffset =
		SERIALIZED_HEADER_BYTES + directoryByteLength + additionalDirectoryBytes;
	assertRange({
		bytes,
		offset: SERIALIZED_HEADER_BYTES,
		byteLength: directoryByteLength + additionalDirectoryBytes,
		label: "record directory",
	});

	const records: SerializedRecord[] = [];
	let currentPayloadOffset = payloadOffset;
	for (let index = 0; index < recordCount; index += 1) {
		const entryOffset =
			SERIALIZED_HEADER_BYTES + index * SERIALIZED_RECORD_BYTES;
		const localId = readUint32({ view, offset: entryOffset });
		const typeHash = readUint32({ view, offset: entryOffset + 4 });
		const byteLength = readUint32({ view, offset: entryOffset + 8 });

		assertRange({
			bytes,
			offset: currentPayloadOffset,
			byteLength,
			label: `record ${index} payload`,
		});

		records.push({
			localId,
			typeHash,
			byteLength,
			payloadOffset: currentPayloadOffset,
			payload: bytes.subarray(
				currentPayloadOffset,
				currentPayloadOffset + byteLength
			),
		});
		currentPayloadOffset += byteLength;
	}

	if (currentPayloadOffset !== bytes.byteLength) {
		throw new Error(
			`serialized payload coverage mismatch: parsed ${currentPayloadOffset} of ${bytes.byteLength} bytes`
		);
	}

	return {
		version: version as 1 | 2,
		additionalDirectoryBytes,
		payloadOffset,
		records,
	};
}

export function djb2NameHash({ name }: { name: string }) {
	let hash = 5381;
	for (const byte of new TextEncoder().encode(name)) {
		hash = (Math.imul(hash, 33) + byte) >>> 0;
	}
	return hash;
}
