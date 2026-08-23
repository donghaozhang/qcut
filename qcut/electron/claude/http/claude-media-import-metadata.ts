import {
	requireExactKeys,
	requireRecord,
	requireSha256,
	requireString,
} from "../../types/strict-json-validation.js";

const STICKER_LAB_BATCH_ID_PATTERN =
	/^jianying-\d{4}-\d{2}-\d{2}(?:-batch-[1-9]\d*)?(?:-v[1-9]\d*)?$/;

export interface StickerLabMediaImportMetadata {
	animatedSticker: boolean;
	batchId: string;
	checksumSha256: string;
	itemId: string;
	redistribution: "prohibited";
	referenceOnly: true;
	source: "sticker-lab";
	usage: "internal-reference-only";
}

function requireLiteral<TValue extends string | boolean>({
	expected,
	label,
	value,
}: {
	expected: TValue;
	label: string;
	value: unknown;
}): TValue {
	if (value !== expected) {
		throw new Error(`${label} must equal ${String(expected)}.`);
	}
	return expected;
}

function requireBoolean({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): boolean {
	if (typeof value !== "boolean") {
		throw new Error(`${label} must be a boolean.`);
	}
	return value;
}

export function parseStickerLabMediaImportMetadata({
	candidate,
}: {
	candidate: unknown;
}): StickerLabMediaImportMetadata | undefined {
	if (candidate === undefined) return;
	const record = requireRecord({
		label: "Media import metadata",
		value: candidate,
	});
	requireExactKeys({
		keys: [
			"source",
			"animatedSticker",
			"referenceOnly",
			"usage",
			"redistribution",
			"batchId",
			"itemId",
			"checksumSha256",
		],
		label: "Media import metadata",
		record,
	});
	const batchId = requireString({
		label: "Media import metadata batchId",
		maximumLength: 96,
		value: record.batchId,
	});
	if (!STICKER_LAB_BATCH_ID_PATTERN.test(batchId)) {
		throw new Error("Media import metadata batchId is invalid.");
	}
	const itemId = requireString({
		label: "Media import metadata itemId",
		maximumLength: 32,
		value: record.itemId,
	});
	if (!/^\d+$/.test(itemId)) {
		throw new Error("Media import metadata itemId must be numeric.");
	}
	return {
		animatedSticker: requireBoolean({
			label: "Media import metadata animatedSticker",
			value: record.animatedSticker,
		}),
		batchId,
		checksumSha256: requireSha256({
			label: "Media import metadata checksumSha256",
			value: record.checksumSha256,
		}),
		itemId,
		redistribution: requireLiteral({
			expected: "prohibited",
			label: "Media import metadata redistribution",
			value: record.redistribution,
		}),
		referenceOnly: requireLiteral({
			expected: true,
			label: "Media import metadata referenceOnly",
			value: record.referenceOnly,
		}),
		source: requireLiteral({
			expected: "sticker-lab",
			label: "Media import metadata source",
			value: record.source,
		}),
		usage: requireLiteral({
			expected: "internal-reference-only",
			label: "Media import metadata usage",
			value: record.usage,
		}),
	};
}
