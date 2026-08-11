// @vitest-environment node
import { describe, expect, it } from "vitest";
import { makeJianyingFontBrowserCompatible } from "../jianying-font-browser-compatibility.js";

const SFNT_HEADER_BYTES = 12;
const SFNT_TABLE_RECORD_BYTES = 16;
const SFNT_CHECKSUM_MAGIC = 0xb1b0afba;

function calculateChecksum({ bytes }: { bytes: Buffer }) {
	let checksum = 0;
	for (let offset = 0; offset < bytes.length; offset += 4) {
		let word = 0;
		for (let byteIndex = 0; byteIndex < 4; byteIndex += 1) {
			word = (word << 8) | (bytes[offset + byteIndex] ?? 0);
		}
		checksum = (checksum + (word >>> 0)) >>> 0;
	}
	return checksum;
}

function createTestSfnt({ vheaVersion }: { vheaVersion: number }) {
	const tables = [
		{ tag: "head", bytes: Buffer.alloc(12) },
		{ tag: "name", bytes: Buffer.from("name") },
		{ tag: "vhea", bytes: Buffer.alloc(4) },
		{ tag: "vmtx", bytes: Buffer.from("vmtx") },
	];
	tables[2].bytes.writeUInt32BE(vheaVersion);
	const dataOffset =
		SFNT_HEADER_BYTES + tables.length * SFNT_TABLE_RECORD_BYTES;
	const output = Buffer.alloc(
		dataOffset + tables.reduce((total, table) => total + table.bytes.length, 0)
	);
	output.writeUInt32BE(0x0001_0000, 0);
	output.writeUInt16BE(tables.length, 4);
	let nextOffset = dataOffset;
	for (let index = 0; index < tables.length; index += 1) {
		const table = tables[index];
		const recordOffset = SFNT_HEADER_BYTES + index * SFNT_TABLE_RECORD_BYTES;
		output.write(table.tag, recordOffset, 4, "ascii");
		output.writeUInt32BE(nextOffset, recordOffset + 8);
		output.writeUInt32BE(table.bytes.length, recordOffset + 12);
		table.bytes.copy(output, nextOffset);
		nextOffset += table.bytes.length;
	}
	return output;
}

function readTableTags({ bytes }: { bytes: Buffer }) {
	const tableCount = bytes.readUInt16BE(4);
	return Array.from({ length: tableCount }, (_, index) => {
		const offset = SFNT_HEADER_BYTES + index * SFNT_TABLE_RECORD_BYTES;
		return bytes.toString("ascii", offset, offset + 4);
	});
}

describe("Jianying browser font compatibility", () => {
	it("leaves standards-compliant vertical metrics untouched", () => {
		const bytes = createTestSfnt({ vheaVersion: 0x0001_0000 });

		expect(makeJianyingFontBrowserCompatible({ bytes })).toBe(bytes);
	});

	it("removes unsupported vertical metrics and rebuilds checksums", () => {
		const bytes = createTestSfnt({ vheaVersion: 0x0001_0001 });

		const compatible = makeJianyingFontBrowserCompatible({ bytes });

		expect(compatible).not.toBe(bytes);
		expect(readTableTags({ bytes: compatible })).toEqual(["head", "name"]);
		expect(calculateChecksum({ bytes: compatible })).toBe(SFNT_CHECKSUM_MAGIC);
	});
});
