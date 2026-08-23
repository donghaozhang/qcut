import {
	requireExactKeys,
	requireRecord,
	requireSha256,
	requireString,
} from "./strict-json-validation.js";

const STICKER_LAB_BATCH_ID_PATTERN =
	/^jianying-\d{4}-\d{2}-\d{2}(?:-batch-[1-9]\d*)?(?:-v[1-9]\d*)?$/;

export interface StickerLabMediaMetadata {
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

/** Strictly validate the durable, path-free Sticker Lab provenance contract. */
export function parseStickerLabMediaMetadata({
	candidate,
	label,
}: {
	candidate: unknown;
	label: string;
}): StickerLabMediaMetadata {
	const record = requireRecord({ label, value: candidate });
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
		label,
		record,
	});
	const batchId = requireString({
		label: `${label} batchId`,
		maximumLength: 96,
		value: record.batchId,
	});
	if (!STICKER_LAB_BATCH_ID_PATTERN.test(batchId)) {
		throw new Error(`${label} batchId is invalid.`);
	}
	const itemId = requireString({
		label: `${label} itemId`,
		maximumLength: 32,
		value: record.itemId,
	});
	if (!/^\d+$/.test(itemId)) {
		throw new Error(`${label} itemId must be numeric.`);
	}
	return {
		animatedSticker: requireBoolean({
			label: `${label} animatedSticker`,
			value: record.animatedSticker,
		}),
		batchId,
		checksumSha256: requireSha256({
			label: `${label} checksumSha256`,
			value: record.checksumSha256,
		}),
		itemId,
		redistribution: requireLiteral({
			expected: "prohibited",
			label: `${label} redistribution`,
			value: record.redistribution,
		}),
		referenceOnly: requireLiteral({
			expected: true,
			label: `${label} referenceOnly`,
			value: record.referenceOnly,
		}),
		source: requireLiteral({
			expected: "sticker-lab",
			label: `${label} source`,
			value: record.source,
		}),
		usage: requireLiteral({
			expected: "internal-reference-only",
			label: `${label} usage`,
			value: record.usage,
		}),
	};
}
