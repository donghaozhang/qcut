const SFNT_HEADER_BYTES = 12;
const SFNT_TABLE_RECORD_BYTES = 16;
const SFNT_CHECKSUM_MAGIC = 0xb1b0afba;
const SUPPORTED_VHEA_VERSION = 0x0001_0000;
const HEAD_CHECKSUM_ADJUSTMENT_OFFSET = 8;
const REMOVABLE_VERTICAL_TABLES = new Set(["vhea", "vmtx"]);

interface SfntTableRecord {
	tag: string;
	bytes: Buffer;
}

function paddedLength({ length }: { length: number }) {
	return Math.ceil(length / 4) * 4;
}

function readSfntTableRecords({ bytes }: { bytes: Buffer }) {
	if (bytes.length < SFNT_HEADER_BYTES) return null;
	const tableCount = bytes.readUInt16BE(4);
	const directoryEnd = SFNT_HEADER_BYTES + tableCount * SFNT_TABLE_RECORD_BYTES;
	if (directoryEnd > bytes.length) return null;

	const records: SfntTableRecord[] = [];
	for (let index = 0; index < tableCount; index += 1) {
		const recordOffset = SFNT_HEADER_BYTES + index * SFNT_TABLE_RECORD_BYTES;
		const tag = bytes.toString("ascii", recordOffset, recordOffset + 4);
		const tableOffset = bytes.readUInt32BE(recordOffset + 8);
		const tableLength = bytes.readUInt32BE(recordOffset + 12);
		if (
			tableOffset < directoryEnd ||
			tableOffset + tableLength > bytes.length
		) {
			return null;
		}
		records.push({
			tag,
			bytes: Buffer.from(
				bytes.subarray(tableOffset, tableOffset + tableLength)
			),
		});
	}
	return records;
}

function hasUnsupportedVerticalHeader({
	records,
}: {
	records: SfntTableRecord[];
}) {
	const verticalHeader = records.find(({ tag }) => tag === "vhea");
	return Boolean(
		verticalHeader &&
			verticalHeader.bytes.length >= 4 &&
			verticalHeader.bytes.readUInt32BE(0) !== SUPPORTED_VHEA_VERSION
	);
}

function calculateSfntSearchFields({ tableCount }: { tableCount: number }) {
	const maximumPowerOfTwo = 2 ** Math.floor(Math.log2(tableCount));
	const searchRange = maximumPowerOfTwo * SFNT_TABLE_RECORD_BYTES;
	return {
		searchRange,
		entrySelector: Math.log2(maximumPowerOfTwo),
		rangeShift: tableCount * SFNT_TABLE_RECORD_BYTES - searchRange,
	};
}

function calculateSfntChecksum({ bytes }: { bytes: Buffer }) {
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

function rebuildSfnt({
	sourceBytes,
	records,
}: {
	sourceBytes: Buffer;
	records: SfntTableRecord[];
}) {
	const head = records.find(({ tag }) => tag === "head");
	if (!head || head.bytes.length < HEAD_CHECKSUM_ADJUSTMENT_OFFSET + 4) {
		throw new Error("Cannot repair a font without a valid head table");
	}
	head.bytes.writeUInt32BE(0, HEAD_CHECKSUM_ADJUSTMENT_OFFSET);

	const tableCount = records.length;
	const dataOffset = SFNT_HEADER_BYTES + tableCount * SFNT_TABLE_RECORD_BYTES;
	const outputLength =
		dataOffset +
		records.reduce(
			(total, record) => total + paddedLength({ length: record.bytes.length }),
			0
		);
	const output = Buffer.alloc(outputLength);
	sourceBytes.copy(output, 0, 0, 4);
	output.writeUInt16BE(tableCount, 4);
	const { entrySelector, rangeShift, searchRange } = calculateSfntSearchFields({
		tableCount,
	});
	output.writeUInt16BE(searchRange, 6);
	output.writeUInt16BE(entrySelector, 8);
	output.writeUInt16BE(rangeShift, 10);

	let nextTableOffset = dataOffset;
	let headOutputOffset = 0;
	for (let index = 0; index < records.length; index += 1) {
		const record = records[index];
		const recordOffset = SFNT_HEADER_BYTES + index * SFNT_TABLE_RECORD_BYTES;
		output.write(record.tag, recordOffset, 4, "ascii");
		output.writeUInt32BE(
			calculateSfntChecksum({ bytes: record.bytes }),
			recordOffset + 4
		);
		output.writeUInt32BE(nextTableOffset, recordOffset + 8);
		output.writeUInt32BE(record.bytes.length, recordOffset + 12);
		record.bytes.copy(output, nextTableOffset);
		if (record.tag === "head") headOutputOffset = nextTableOffset;
		nextTableOffset += paddedLength({ length: record.bytes.length });
	}

	const checksumAdjustment =
		(SFNT_CHECKSUM_MAGIC - calculateSfntChecksum({ bytes: output })) >>> 0;
	output.writeUInt32BE(
		checksumAdjustment,
		headOutputOffset + HEAD_CHECKSUM_ADJUSTMENT_OFFSET
	);
	return output;
}

export function makeJianyingFontBrowserCompatible({
	bytes,
}: {
	bytes: Buffer;
}) {
	const records = readSfntTableRecords({ bytes });
	if (!(records && hasUnsupportedVerticalHeader({ records }))) return bytes;
	const browserCompatibleRecords = records.filter(
		({ tag }) => !REMOVABLE_VERTICAL_TABLES.has(tag)
	);
	return rebuildSfnt({ sourceBytes: bytes, records: browserCompatibleRecords });
}
