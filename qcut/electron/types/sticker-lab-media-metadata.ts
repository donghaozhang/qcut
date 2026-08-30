import {
	parseStickerRuntimeDescriptor,
	type StickerRuntimeDescriptor,
} from "../native-pipeline/stickers/local-reference-catalog/schemas.js";
import {
	requireAllowedKeys,
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

export interface StickerLabRuntimeMediaMetadata
	extends StickerLabMediaMetadata {
	stickerRuntime: StickerRuntimeDescriptor;
	stickerRuntimeResources?: Record<string, string>;
}

export interface StickerLabRuntimeResourceMediaMetadata
	extends Omit<StickerLabMediaMetadata, "animatedSticker" | "source"> {
	source: "sticker-runtime-resource";
	stickerAssetId: string;
	stickerAssetVersion: 1;
	stickerRuntimeResourceName: string;
	stickerRuntimeSourceUrl: string;
}

export type StickerLabRestrictedMediaMetadata =
	| StickerLabMediaMetadata
	| StickerLabRuntimeMediaMetadata
	| StickerLabRuntimeResourceMediaMetadata;

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

function hasOwn({
	key,
	record,
}: {
	key: string;
	record: Record<string, unknown>;
}): boolean {
	return Object.getOwnPropertyDescriptor(record, key) !== undefined;
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

function stickerLabProvenanceCandidate({
	record,
}: {
	record: Record<string, unknown>;
}): Record<string, unknown> {
	return {
		animatedSticker: record.animatedSticker,
		batchId: record.batchId,
		checksumSha256: record.checksumSha256,
		itemId: record.itemId,
		redistribution: record.redistribution,
		referenceOnly: record.referenceOnly,
		source: record.source,
		usage: record.usage,
	};
}

function requireRuntimeResourceMap({
	descriptor,
	label,
	value,
}: {
	descriptor: StickerRuntimeDescriptor;
	label: string;
	value: unknown;
}): Record<string, string> {
	const record = requireRecord({ label, value });
	const entries = Object.entries(record);
	if (entries.length > 100) {
		throw new Error(`${label} must contain at most 100 resources.`);
	}
	const resourceMap: Record<string, string> = {};
	for (const [name, mediaIdValue] of entries) {
		if (!/^asset_\d{4}$/.test(name)) {
			throw new Error(`${label} contains an invalid resource name.`);
		}
		resourceMap[name] = requireString({
			label: `${label} ${name}`,
			maximumLength: 512,
			value: mediaIdValue,
		});
	}

	const sourceNames = new Set<string>();
	const addSource = ({ source }: { source: string | undefined }): void => {
		if (!source || source === "$primary") return;
		if (!source.startsWith("$resource:")) {
			throw new Error(`${label} descriptor source is not project-normalized.`);
		}
		const resourceName = source.slice("$resource:".length);
		if (!hasOwn({ key: resourceName, record: resourceMap })) {
			throw new Error(
				`${label} is missing descriptor resource ${resourceName}.`
			);
		}
		sourceNames.add(resourceName);
	};

	switch (descriptor.kind) {
		case "direct-gif":
			break;
		case "atlas-animation":
			addSource({ source: descriptor.atlasSource });
			break;
		case "png-sequence":
			for (const frame of descriptor.frames)
				addSource({ source: frame.source });
			break;
		case "alpha-video":
			addSource({ source: descriptor.source });
			if (descriptor.layout.kind === "separate-mask") {
				addSource({ source: descriptor.layout.maskSource });
			}
			break;
		default: {
			const unsupported: never = descriptor;
			throw new Error(
				`${label} descriptor is unsupported: ${String(unsupported)}`
			);
		}
	}
	if (
		sourceNames.size !== entries.length ||
		entries.some(([name]) => !sourceNames.has(name))
	) {
		throw new Error(`${label} contains an unused runtime resource.`);
	}
	return resourceMap;
}

function parseStickerLabRuntimeMediaMetadata({
	label,
	record,
}: {
	label: string;
	record: Record<string, unknown>;
}): StickerLabRuntimeMediaMetadata {
	requireAllowedKeys({
		allowedKeys: [
			"source",
			"animatedSticker",
			"referenceOnly",
			"usage",
			"redistribution",
			"batchId",
			"itemId",
			"checksumSha256",
			"stickerRuntime",
			"stickerRuntimeResources",
		],
		label,
		record,
		requiredKeys: [
			"source",
			"animatedSticker",
			"referenceOnly",
			"usage",
			"redistribution",
			"batchId",
			"itemId",
			"checksumSha256",
			"stickerRuntime",
		],
	});
	const provenance = parseStickerLabMediaMetadata({
		candidate: stickerLabProvenanceCandidate({ record }),
		label,
	});
	if (!provenance.animatedSticker) {
		throw new Error(`${label} animatedSticker must equal true.`);
	}
	const stickerRuntime = parseStickerRuntimeDescriptor({
		candidate: record.stickerRuntime,
		label: `${label} stickerRuntime`,
	});
	const stickerRuntimeResources = requireRuntimeResourceMap({
		descriptor: stickerRuntime,
		label: `${label} stickerRuntimeResources`,
		value: record.stickerRuntimeResources ?? {},
	});
	return {
		...provenance,
		stickerRuntime,
		...(Object.keys(stickerRuntimeResources).length > 0
			? { stickerRuntimeResources }
			: {}),
	};
}

function requireRuntimeSourceUrl({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): string {
	const sourceUrl = requireString({ label, maximumLength: 300, value });
	if (
		sourceUrl.trim() !== sourceUrl ||
		sourceUrl.startsWith("$") ||
		sourceUrl.startsWith("/") ||
		sourceUrl.includes("\\") ||
		/^[a-z][a-z0-9+.-]*:/i.test(sourceUrl) ||
		sourceUrl.split("/").some((segment) => segment === "." || segment === "..")
	) {
		throw new Error(`${label} must be a private relative resource name.`);
	}
	return sourceUrl;
}

function parseStickerLabRuntimeResourceMediaMetadata({
	label,
	record,
}: {
	label: string;
	record: Record<string, unknown>;
}): StickerLabRuntimeResourceMediaMetadata {
	requireExactKeys({
		keys: [
			"source",
			"referenceOnly",
			"usage",
			"redistribution",
			"batchId",
			"itemId",
			"checksumSha256",
			"stickerAssetId",
			"stickerAssetVersion",
			"stickerRuntimeResourceName",
			"stickerRuntimeSourceUrl",
		],
		label,
		record,
	});
	const provenance = parseStickerLabMediaMetadata({
		candidate: {
			...stickerLabProvenanceCandidate({ record }),
			animatedSticker: true,
			source: "sticker-lab",
		},
		label,
	});
	const expectedAssetId = `sticker-lab:${provenance.batchId}:${provenance.itemId}`;
	const stickerAssetId = requireString({
		label: `${label} stickerAssetId`,
		maximumLength: 160,
		value: record.stickerAssetId,
	});
	if (stickerAssetId !== expectedAssetId) {
		throw new Error(`${label} stickerAssetId does not match its provenance.`);
	}
	if (record.stickerAssetVersion !== 1) {
		throw new Error(`${label} stickerAssetVersion must equal 1.`);
	}
	const stickerRuntimeResourceName = requireString({
		label: `${label} stickerRuntimeResourceName`,
		maximumLength: 14,
		value: record.stickerRuntimeResourceName,
	});
	if (!/^asset_\d{4}$/.test(stickerRuntimeResourceName)) {
		throw new Error(`${label} stickerRuntimeResourceName is invalid.`);
	}
	return {
		batchId: provenance.batchId,
		checksumSha256: provenance.checksumSha256,
		itemId: provenance.itemId,
		redistribution: provenance.redistribution,
		referenceOnly: provenance.referenceOnly,
		source: "sticker-runtime-resource",
		stickerAssetId,
		stickerAssetVersion: 1,
		stickerRuntimeResourceName,
		stickerRuntimeSourceUrl: requireRuntimeSourceUrl({
			label: `${label} stickerRuntimeSourceUrl`,
			value: record.stickerRuntimeSourceUrl,
		}),
		usage: provenance.usage,
	};
}

/** Strictly validate primary and auxiliary private Sticker Lab media metadata. */
export function parseStickerLabRestrictedMediaMetadata({
	candidate,
	label,
}: {
	candidate: unknown;
	label: string;
}): StickerLabRestrictedMediaMetadata {
	const record = requireRecord({ label, value: candidate });
	if (record.source === "sticker-runtime-resource") {
		return parseStickerLabRuntimeResourceMediaMetadata({ label, record });
	}
	if (
		hasOwn({ key: "stickerRuntime", record }) ||
		hasOwn({ key: "stickerRuntimeResources", record })
	) {
		return parseStickerLabRuntimeMediaMetadata({ label, record });
	}
	return parseStickerLabMediaMetadata({ candidate, label });
}
