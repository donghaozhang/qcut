import { describe, expect, test } from "bun:test";

import { djb2NameHash, parseSerializedContainer } from "./serialized-container";

const MAGIC = new TextEncoder().encode("%SerializedFormat%@\n");

function writeUint32({
	view,
	offset,
	value,
}: {
	view: DataView;
	offset: number;
	value: number;
}) {
	view.setUint32(offset, value, true);
}

function makeContainer({
	additionalDirectoryBytes = 0,
	records,
}: {
	additionalDirectoryBytes?: number;
	records: Array<{
		localId: number;
		typeHash: number;
		payload: number[];
	}>;
}) {
	const directoryByteLength = records.length * 12;
	const payloadByteLength = records.reduce(
		(total, record) => total + record.payload.length,
		0
	);
	const bytes = new Uint8Array(
		64 + directoryByteLength + additionalDirectoryBytes + payloadByteLength
	);
	bytes.set(MAGIC);
	const view = new DataView(bytes.buffer);
	writeUint32({ view, offset: 20, value: 2 });
	writeUint32({ view, offset: 24, value: records.length });
	writeUint32({ view, offset: 28, value: additionalDirectoryBytes });

	let payloadOffset = 64 + directoryByteLength + additionalDirectoryBytes;
	for (const [index, record] of records.entries()) {
		const entryOffset = 64 + index * 12;
		writeUint32({ view, offset: entryOffset, value: record.localId });
		writeUint32({ view, offset: entryOffset + 4, value: record.typeHash });
		writeUint32({
			view,
			offset: entryOffset + 8,
			value: record.payload.length,
		});
		bytes.set(record.payload, payloadOffset);
		payloadOffset += record.payload.length;
	}

	return bytes;
}

describe("parseSerializedContainer", () => {
	test("parses the recovered header, directory, and contiguous payloads", () => {
		const bytes = makeContainer({
			additionalDirectoryBytes: 4,
			records: [
				{ localId: 1, typeHash: 0x9789c053, payload: [1, 2, 3] },
				{ localId: 2, typeHash: 0x63c02e9d, payload: [4, 5] },
			],
		});

		const container = parseSerializedContainer({ bytes });

		expect(container.version).toBe(2);
		expect(container.additionalDirectoryBytes).toBe(4);
		expect(container.payloadOffset).toBe(92);
		expect(
			container.records.map(
				({ localId, typeHash, byteLength, payloadOffset }) => ({
					localId,
					typeHash,
					byteLength,
					payloadOffset,
				})
			)
		).toEqual([
			{ localId: 1, typeHash: 0x9789c053, byteLength: 3, payloadOffset: 92 },
			{ localId: 2, typeHash: 0x63c02e9d, byteLength: 2, payloadOffset: 95 },
		]);
		expect([...container.records[0].payload]).toEqual([1, 2, 3]);
		expect([...container.records[1].payload]).toEqual([4, 5]);
	});

	test("rejects unsupported versions", () => {
		const bytes = makeContainer({ records: [] });
		new DataView(bytes.buffer).setUint32(20, 3, true);

		expect(() => parseSerializedContainer({ bytes })).toThrow(
			"unsupported serialized format version: 3"
		);
	});

	test("accepts the recovered version 1 directory layout", () => {
		const bytes = makeContainer({
			records: [{ localId: 7, typeHash: 8, payload: [9] }],
		});
		new DataView(bytes.buffer).setUint32(20, 1, true);

		const container = parseSerializedContainer({ bytes });

		expect(container.version).toBe(1);
		expect(container.records[0]?.localId).toBe(7);
	});

	test("rejects truncated record payloads", () => {
		const bytes = makeContainer({
			records: [{ localId: 1, typeHash: 2, payload: [1, 2] }],
		});
		new DataView(bytes.buffer).setUint32(72, 3, true);

		expect(() => parseSerializedContainer({ bytes })).toThrow(
			"record 0 payload exceeds the serialized file bounds"
		);
	});

	test("rejects unclaimed trailing bytes", () => {
		const source = makeContainer({ records: [] });
		const bytes = new Uint8Array(source.byteLength + 1);
		bytes.set(source);

		expect(() => parseSerializedContainer({ bytes })).toThrow(
			"serialized payload coverage mismatch"
		);
	});
});

describe("djb2NameHash", () => {
	test("matches names recovered from the engine RTTI strings", () => {
		expect(djb2NameHash({ name: "name" })).toBe(0x7c9b0c46);
		expect(djb2NameHash({ name: "String" })).toBe(0xd1ee9bdc);
		expect(djb2NameHash({ name: "XShader" })).toBe(0x42f187f4);
	});
});
