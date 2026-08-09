import { describe, expect, test } from "bun:test";

import { parseAuslContainer } from "./ausl-container";

function makeAusl({ decodedByteLength }: { decodedByteLength: number }) {
	const ciphertextByteLength = Math.ceil(decodedByteLength / 16) * 16;
	const bytes = new Uint8Array(12 + ciphertextByteLength);
	bytes.set(new TextEncoder().encode("ASLE"));
	const view = new DataView(bytes.buffer);
	view.setUint32(8, decodedByteLength, true);
	bytes.fill(0xa5, 12);
	return bytes;
}

describe("parseAuslContainer", () => {
	test("parses the recovered 12-byte header and block-aligned payload", () => {
		const container = parseAuslContainer({
			bytes: makeAusl({ decodedByteLength: 17 }),
		});

		expect(container.reserved).toBe(0);
		expect(container.decodedByteLength).toBe(17);
		expect(container.ciphertextByteLength).toBe(32);
		expect(container.paddingByteLength).toBe(15);
		expect(container.ciphertext.byteLength).toBe(32);
	});

	test("rejects payloads that do not fill complete 16-byte blocks", () => {
		const source = makeAusl({ decodedByteLength: 17 });
		const bytes = source.subarray(0, source.byteLength - 1);

		expect(() => parseAuslContainer({ bytes })).toThrow(
			"AUSL block coverage mismatch"
		);
	});

	test("rejects unrelated files", () => {
		const bytes = makeAusl({ decodedByteLength: 16 });
		bytes[0] = 0;

		expect(() => parseAuslContainer({ bytes })).toThrow("invalid ASLE magic");
	});
});
