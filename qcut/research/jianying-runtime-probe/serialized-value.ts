import { djb2NameHash } from "./serialized-container";

const VALUE_HEADER_BYTES = 8;
const PREVIEW_BYTES = 64;

export type SerializedNameResolver = (hash: number) => string[];

type SerializedValueBase = {
	typeHash: number;
	typeNames: string[];
	wireTag: number;
	byteLength: number;
};

export type SerializedField = {
	nameHash: number;
	names: string[];
	byteLength: number;
	value: SerializedValue;
};

type SerializedValuePayload =
	| { kind: "string"; value: string }
	| { kind: "int32"; value: number }
	| { kind: "int64"; value: string }
	| { kind: "bool"; value: boolean }
	| { kind: "double"; value: number }
	| { kind: "float-vector"; value: number[] }
	| { kind: "string-vector"; value: string[] }
	| { kind: "guid"; value: string }
	| { kind: "local-ref"; localId: number }
	| {
			kind: "external-ref";
			version: number;
			targetTypeHash: number;
			targetTypeNames: string[];
			targetWireTag: number;
			uri: string;
			localId: number;
	  }
	| { kind: "vector"; values: SerializedValue[] }
	| {
			kind: "map";
			entries: Array<{ key: string; value: SerializedValue }>;
	  }
	| { kind: "object"; fields: SerializedField[] }
	| {
			kind: "opaque";
			payloadByteLength: number;
			hexPreview: string;
			previewTruncated: boolean;
	  };

export type SerializedValue = SerializedValueBase & SerializedValuePayload;

const BUILT_IN_NAMES = [
	"AnimSeq",
	"Bool",
	"Double",
	"ExternalRef",
	"Guid",
	"ImageAtlas",
	"ImageFrame",
	"Int64",
	"KeywordProgramProfile",
	"LocalRef",
	"Map",
	"Rect",
	"RotateType",
	"Shader",
	"String",
	"StringVector",
	"Vector",
	"Vector2f",
	"Vector3f",
	"Vector4f",
	"XShader",
	"assetfilename",
	"assettype",
	"atlases",
	"cache",
	"fps",
	"frames",
	"guid",
	"indexAction",
	"innerRect",
	"keywordSets",
	"lazyload",
	"macros",
	"memoryLimit",
	"name",
	"outerRect",
	"passes",
	"preload",
	"preloadCount",
	"properties",
	"renderQueue",
	"rotate",
	"shaderSnippets",
	"sourcePath",
	"stagets",
	"targetApis",
	"trimed",
	"type",
	"uri",
] as const;

const BUILT_IN_DICTIONARY = new Map<number, string[]>();
for (const name of BUILT_IN_NAMES) {
	const hash = djb2NameHash({ name });
	const names = BUILT_IN_DICTIONARY.get(hash) ?? [];
	names.push(name);
	BUILT_IN_DICTIONARY.set(hash, names);
}

function emptyResolver() {
	return [];
}

export function createSerializedNameResolver({
	names = [],
}: {
	names?: Iterable<string>;
} = {}): SerializedNameResolver {
	const dictionary = new Map<number, Set<string>>();
	for (const [hash, builtInNames] of BUILT_IN_DICTIONARY) {
		dictionary.set(hash, new Set(builtInNames));
	}
	for (const name of names) {
		const hash = djb2NameHash({ name });
		const candidates = dictionary.get(hash) ?? new Set<string>();
		candidates.add(name);
		dictionary.set(hash, candidates);
	}

	return (hash) => [...(dictionary.get(hash) ?? [])].sort();
}

function assertRange({
	bytes,
	offset,
	byteLength,
	limit,
	label,
}: {
	bytes: Uint8Array;
	offset: number;
	byteLength: number;
	limit: number;
	label: string;
}) {
	if (
		!Number.isSafeInteger(offset) ||
		!Number.isSafeInteger(byteLength) ||
		offset < 0 ||
		byteLength < 0 ||
		offset + byteLength > limit ||
		limit > bytes.byteLength
	) {
		throw new Error(`${label} exceeds the serialized value bounds`);
	}
}

function readUint16({ view, offset }: { view: DataView; offset: number }) {
	return view.getUint16(offset, true);
}

function readUint32({ view, offset }: { view: DataView; offset: number }) {
	return view.getUint32(offset, true);
}

function formatGuid({ bytes }: { bytes: Uint8Array }) {
	const hex = [...bytes]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function makeBase({
	typeHash,
	wireTag,
	byteLength,
	resolveNames,
}: {
	typeHash: number;
	wireTag: number;
	byteLength: number;
	resolveNames: SerializedNameResolver;
}): SerializedValueBase {
	return {
		typeHash,
		typeNames: resolveNames(typeHash),
		wireTag,
		byteLength,
	};
}

function parseSerializedValueAt({
	bytes,
	offset,
	limit,
	resolveNames,
	allowOpaque,
	formatVersion,
}: {
	bytes: Uint8Array;
	offset: number;
	limit: number;
	resolveNames: SerializedNameResolver;
	allowOpaque: boolean;
	formatVersion: 1 | 2;
}): { value: SerializedValue; nextOffset: number } {
	assertRange({
		bytes,
		offset,
		byteLength: VALUE_HEADER_BYTES,
		limit,
		label: "typed value header",
	});
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const typeHash = readUint32({ view, offset });
	const wireTag = readUint32({ view, offset: offset + 4 });
	const payloadOffset = offset + VALUE_HEADER_BYTES;

	const finish = ({
		nextOffset,
		value,
	}: {
		nextOffset: number;
		value: SerializedValuePayload;
	}) => ({
		nextOffset,
		value: {
			...makeBase({
				typeHash,
				wireTag,
				byteLength: nextOffset - offset,
				resolveNames,
			}),
			...value,
		} as SerializedValue,
	});

	if (wireTag === 0) {
		assertRange({
			bytes,
			offset: payloadOffset,
			byteLength: 4,
			limit,
			label: "string",
		});
		const byteLength = readUint32({ view, offset: payloadOffset });
		const stringOffset = payloadOffset + 4;
		assertRange({
			bytes,
			offset: stringOffset,
			byteLength,
			limit,
			label: "string",
		});
		const nextOffset = stringOffset + byteLength;
		return finish({
			nextOffset,
			value: {
				kind: "string",
				value: new TextDecoder().decode(
					bytes.subarray(stringOffset, nextOffset)
				),
			},
		});
	}

	if (wireTag === 1) {
		assertRange({
			bytes,
			offset: payloadOffset,
			byteLength: 4,
			limit,
			label: "int32",
		});
		return finish({
			nextOffset: payloadOffset + 4,
			value: { kind: "int32", value: view.getInt32(payloadOffset, true) },
		});
	}

	if (wireTag === 2) {
		assertRange({
			bytes,
			offset: payloadOffset,
			byteLength: 4,
			limit,
			label: "object",
		});
		const fieldCount = readUint32({ view, offset: payloadOffset });
		const fields: SerializedField[] = [];
		let cursor = payloadOffset + 4;
		for (let index = 0; index < fieldCount; index += 1) {
			const fieldHeaderBytes = formatVersion === 2 ? 8 : 4;
			assertRange({
				bytes,
				offset: cursor,
				byteLength: fieldHeaderBytes,
				limit,
				label: `object field ${index}`,
			});
			const nameHash = readUint32({ view, offset: cursor });
			const valueOffset = cursor + fieldHeaderBytes;
			const declaredByteLength =
				formatVersion === 2 ? readUint32({ view, offset: cursor + 4 }) : null;
			const fieldLimit =
				declaredByteLength === null ? limit : valueOffset + declaredByteLength;
			if (declaredByteLength !== null) {
				assertRange({
					bytes,
					offset: valueOffset,
					byteLength: declaredByteLength,
					limit,
					label: `object field ${index}`,
				});
			}
			const parsed = parseSerializedValueAt({
				bytes,
				offset: valueOffset,
				limit: fieldLimit,
				resolveNames,
				allowOpaque: formatVersion === 2,
				formatVersion,
			});
			if (declaredByteLength !== null && parsed.nextOffset !== fieldLimit) {
				throw new Error(
					`object field ${index} does not consume its declared length`
				);
			}
			const byteLength = parsed.nextOffset - valueOffset;
			fields.push({
				nameHash,
				names: resolveNames(nameHash),
				byteLength,
				value: parsed.value,
			});
			cursor = parsed.nextOffset;
		}
		return finish({ nextOffset: cursor, value: { kind: "object", fields } });
	}

	if (wireTag === 3) {
		assertRange({
			bytes,
			offset: payloadOffset,
			byteLength: 8,
			limit,
			label: "int64",
		});
		return finish({
			nextOffset: payloadOffset + 8,
			value: {
				kind: "int64",
				value: view.getBigInt64(payloadOffset, true).toString(),
			},
		});
	}

	if (wireTag === 4) {
		assertRange({
			bytes,
			offset: payloadOffset,
			byteLength: 1,
			limit,
			label: "bool",
		});
		return finish({
			nextOffset: payloadOffset + 1,
			value: { kind: "bool", value: bytes[payloadOffset] !== 0 },
		});
	}

	if (wireTag === 5) {
		assertRange({
			bytes,
			offset: payloadOffset,
			byteLength: 8,
			limit,
			label: "double",
		});
		return finish({
			nextOffset: payloadOffset + 8,
			value: { kind: "double", value: view.getFloat64(payloadOffset, true) },
		});
	}

	const floatComponents = new Map([
		[6, 2],
		[7, 3],
		[8, 4],
		[12, 4],
		[13, 4],
	]).get(wireTag);
	if (floatComponents !== undefined) {
		const byteLength = floatComponents * 4;
		assertRange({
			bytes,
			offset: payloadOffset,
			byteLength,
			limit,
			label: "float vector",
		});
		const value: number[] = [];
		for (let index = 0; index < floatComponents; index += 1) {
			value.push(view.getFloat32(payloadOffset + index * 4, true));
		}
		return finish({
			nextOffset: payloadOffset + byteLength,
			value: { kind: "float-vector", value },
		});
	}

	if (wireTag === 31) {
		assertRange({
			bytes,
			offset: payloadOffset,
			byteLength: 4,
			limit,
			label: "string vector",
		});
		const count = readUint32({ view, offset: payloadOffset });
		const value: string[] = [];
		let cursor = payloadOffset + 4;
		for (let index = 0; index < count; index += 1) {
			assertRange({
				bytes,
				offset: cursor,
				byteLength: 4,
				limit,
				label: `string vector item ${index}`,
			});
			const byteLength = readUint32({ view, offset: cursor });
			const stringOffset = cursor + 4;
			assertRange({
				bytes,
				offset: stringOffset,
				byteLength,
				limit,
				label: `string vector item ${index}`,
			});
			cursor = stringOffset + byteLength;
			value.push(
				new TextDecoder().decode(bytes.subarray(stringOffset, cursor))
			);
		}
		return finish({
			nextOffset: cursor,
			value: { kind: "string-vector", value },
		});
	}

	if (wireTag === 32) {
		assertRange({
			bytes,
			offset: payloadOffset,
			byteLength: 4,
			limit,
			label: "local reference",
		});
		return finish({
			nextOffset: payloadOffset + 4,
			value: {
				kind: "local-ref",
				localId: readUint32({ view, offset: payloadOffset }),
			},
		});
	}

	if (wireTag === 33) {
		assertRange({
			bytes,
			offset: payloadOffset,
			byteLength: 16,
			limit,
			label: "external reference",
		});
		const version = readUint32({ view, offset: payloadOffset });
		const targetTypeHash = readUint32({ view, offset: payloadOffset + 4 });
		const targetWireTag = readUint32({ view, offset: payloadOffset + 8 });
		const uriByteLength = readUint32({ view, offset: payloadOffset + 12 });
		const uriOffset = payloadOffset + 16;
		assertRange({
			bytes,
			offset: uriOffset,
			byteLength: uriByteLength + 4,
			limit,
			label: "external reference URI",
		});
		const uriLimit = uriOffset + uriByteLength;
		return finish({
			nextOffset: uriLimit + 4,
			value: {
				kind: "external-ref",
				version,
				targetTypeHash,
				targetTypeNames: resolveNames(targetTypeHash),
				targetWireTag,
				uri: new TextDecoder().decode(bytes.subarray(uriOffset, uriLimit)),
				localId: readUint32({ view, offset: uriLimit }),
			},
		});
	}

	if (wireTag === 34) {
		assertRange({
			bytes,
			offset: payloadOffset,
			byteLength: 4,
			limit,
			label: "vector",
		});
		const count = readUint32({ view, offset: payloadOffset });
		const values: SerializedValue[] = [];
		let cursor = payloadOffset + 4;
		for (let index = 0; index < count; index += 1) {
			const parsed = parseSerializedValueAt({
				bytes,
				offset: cursor,
				limit,
				resolveNames,
				allowOpaque: false,
				formatVersion,
			});
			values.push(parsed.value);
			cursor = parsed.nextOffset;
		}
		return finish({ nextOffset: cursor, value: { kind: "vector", values } });
	}

	if (wireTag === 35) {
		assertRange({
			bytes,
			offset: payloadOffset,
			byteLength: 4,
			limit,
			label: "map",
		});
		const count = readUint32({ view, offset: payloadOffset });
		const entries: Array<{ key: string; value: SerializedValue }> = [];
		let cursor = payloadOffset + 4;
		for (let index = 0; index < count; index += 1) {
			assertRange({
				bytes,
				offset: cursor,
				byteLength: 2,
				limit,
				label: `map key ${index}`,
			});
			const keyByteLength = readUint16({ view, offset: cursor });
			const keyOffset = cursor + 2;
			assertRange({
				bytes,
				offset: keyOffset,
				byteLength: keyByteLength,
				limit,
				label: `map key ${index}`,
			});
			const keyLimit = keyOffset + keyByteLength;
			const key = new TextDecoder().decode(bytes.subarray(keyOffset, keyLimit));
			const parsed = parseSerializedValueAt({
				bytes,
				offset: keyLimit,
				limit,
				resolveNames,
				allowOpaque: false,
				formatVersion,
			});
			entries.push({ key, value: parsed.value });
			cursor = parsed.nextOffset;
		}
		return finish({ nextOffset: cursor, value: { kind: "map", entries } });
	}

	if (wireTag === 36) {
		assertRange({
			bytes,
			offset: payloadOffset,
			byteLength: 16,
			limit,
			label: "guid",
		});
		const nextOffset = payloadOffset + 16;
		return finish({
			nextOffset,
			value: {
				kind: "guid",
				value: formatGuid({ bytes: bytes.subarray(payloadOffset, nextOffset) }),
			},
		});
	}

	if (!allowOpaque) {
		throw new Error(
			`unsupported wire tag ${wireTag} cannot be skipped inside a collection`
		);
	}

	const payloadByteLength = limit - payloadOffset;
	const preview = bytes.subarray(
		payloadOffset,
		Math.min(limit, payloadOffset + PREVIEW_BYTES)
	);
	return finish({
		nextOffset: limit,
		value: {
			kind: "opaque",
			payloadByteLength,
			hexPreview: [...preview]
				.map((byte) => byte.toString(16).padStart(2, "0"))
				.join(""),
			previewTruncated: payloadByteLength > PREVIEW_BYTES,
		},
	});
}

export function parseSerializedValue({
	bytes,
	resolveNames = emptyResolver,
	formatVersion = 2,
}: {
	bytes: Uint8Array;
	resolveNames?: SerializedNameResolver;
	formatVersion?: 1 | 2;
}): SerializedValue {
	const parsed = parseSerializedValueAt({
		bytes,
		offset: 0,
		limit: bytes.byteLength,
		resolveNames,
		allowOpaque: true,
		formatVersion,
	});
	if (parsed.nextOffset !== bytes.byteLength) {
		throw new Error(
			`serialized value coverage mismatch: parsed ${parsed.nextOffset} of ${bytes.byteLength} bytes`
		);
	}
	return parsed.value;
}
