import { describe, expect, test } from "bun:test";

import { djb2NameHash } from "./serialized-container";
import {
	createSerializedNameResolver,
	parseSerializedValue,
} from "./serialized-value";

function uint16(value: number) {
	const bytes = new Uint8Array(2);
	new DataView(bytes.buffer).setUint16(0, value, true);
	return [...bytes];
}

function uint32(value: number) {
	const bytes = new Uint8Array(4);
	new DataView(bytes.buffer).setUint32(0, value, true);
	return [...bytes];
}

function float32(value: number) {
	const bytes = new Uint8Array(4);
	new DataView(bytes.buffer).setFloat32(0, value, true);
	return [...bytes];
}

function float64(value: number) {
	const bytes = new Uint8Array(8);
	new DataView(bytes.buffer).setFloat64(0, value, true);
	return [...bytes];
}

function value({
	name,
	wireTag,
	payload,
}: {
	name: string;
	wireTag: number;
	payload: number[];
}) {
	return [...uint32(djb2NameHash({ name })), ...uint32(wireTag), ...payload];
}

function stringValue(text: string) {
	const encoded = [...new TextEncoder().encode(text)];
	return value({
		name: "String",
		wireTag: 0,
		payload: [...uint32(encoded.length), ...encoded],
	});
}

function field({
	name,
	encodedValue,
}: {
	name: string;
	encodedValue: number[];
}) {
	return [
		...uint32(djb2NameHash({ name })),
		...uint32(encodedValue.length),
		...encodedValue,
	];
}

function versionOneField({
	name,
	encodedValue,
}: {
	name: string;
	encodedValue: number[];
}) {
	return [...uint32(djb2NameHash({ name })), ...encodedValue];
}

describe("parseSerializedValue", () => {
	test("decodes objects, vectors, maps, references, and primitive values", () => {
		const references = value({
			name: "Vector",
			wireTag: 34,
			payload: [
				...uint32(3),
				...value({ name: "LocalRef", wireTag: 32, payload: uint32(2) }),
				...value({ name: "LocalRef", wireTag: 32, payload: uint32(3) }),
				...value({
					name: "ExternalRef",
					wireTag: 33,
					payload: [
						...uint32(1),
						...uint32(djb2NameHash({ name: "ImageAtlas" })),
						...uint32(2),
						...uint32(16),
						...new TextEncoder().encode("atlas/main.asset"),
						...uint32(9),
					],
				}),
			],
		});
		const properties = value({
			name: "Map",
			wireTag: 35,
			payload: [
				...uint32(2),
				...uint16(6),
				...new TextEncoder().encode("weight"),
				...value({ name: "Double", wireTag: 5, payload: float64(1.25) }),
				...uint16(4),
				...new TextEncoder().encode("axis"),
				...value({
					name: "Vector3f",
					wireTag: 7,
					payload: [...float32(1), ...float32(2), ...float32(3)],
				}),
			],
		});
		const encoded = value({
			name: "SyntheticObject",
			wireTag: 2,
			payload: [
				...uint32(3),
				...field({ name: "name", encodedValue: stringValue("fixture") }),
				...field({ name: "references", encodedValue: references }),
				...field({ name: "properties", encodedValue: properties }),
			],
		});

		const parsed = parseSerializedValue({
			bytes: Uint8Array.from(encoded),
			resolveNames: createSerializedNameResolver({
				names: ["SyntheticObject", "references"],
			}),
		});

		expect(parsed.kind).toBe("object");
		if (parsed.kind !== "object") {
			throw new Error("expected object");
		}
		expect(parsed.typeNames).toEqual(["SyntheticObject"]);
		expect(parsed.fields[0]?.names).toEqual(["name"]);
		expect(parsed.fields[0]?.value).toMatchObject({
			kind: "string",
			value: "fixture",
		});
		expect(parsed.fields[1]?.value).toMatchObject({
			kind: "vector",
			values: [
				{ kind: "local-ref", localId: 2 },
				{ kind: "local-ref", localId: 3 },
				{
					kind: "external-ref",
					version: 1,
					targetTypeNames: ["ImageAtlas"],
					targetWireTag: 2,
					uri: "atlas/main.asset",
					localId: 9,
				},
			],
		});
		expect(parsed.fields[2]?.value).toMatchObject({
			kind: "map",
			entries: [
				{ key: "weight", value: { kind: "double", value: 1.25 } },
				{ key: "axis", value: { kind: "float-vector", value: [1, 2, 3] } },
			],
		});
	});

	test("keeps unknown field values bounded and opaque", () => {
		const unknown = value({ name: "Mystery", wireTag: 99, payload: [1, 2, 3] });
		const encoded = value({
			name: "SyntheticObject",
			wireTag: 2,
			payload: [
				...uint32(1),
				...field({ name: "unknown", encodedValue: unknown }),
			],
		});

		const parsed = parseSerializedValue({ bytes: Uint8Array.from(encoded) });

		expect(parsed).toMatchObject({
			kind: "object",
			fields: [
				{
					value: {
						kind: "opaque",
						wireTag: 99,
						payloadByteLength: 3,
						hexPreview: "010203",
					},
				},
			],
		});
	});

	test("decodes version 1 objects whose fields have no declared lengths", () => {
		const encoded = value({
			name: "SyntheticObject",
			wireTag: 2,
			payload: [
				...uint32(2),
				...versionOneField({
					name: "name",
					encodedValue: stringValue("legacy"),
				}),
				...versionOneField({
					name: "enabled",
					encodedValue: value({ name: "Bool", wireTag: 4, payload: [1] }),
				}),
			],
		});

		const parsed = parseSerializedValue({
			bytes: Uint8Array.from(encoded),
			formatVersion: 1,
			resolveNames: createSerializedNameResolver({
				names: ["SyntheticObject", "enabled"],
			}),
		});

		expect(parsed).toMatchObject({
			kind: "object",
			fields: [
				{ names: ["name"], value: { kind: "string", value: "legacy" } },
				{ names: ["enabled"], value: { kind: "bool", value: true } },
			],
		});
	});

	test("decodes the recovered StringVector wire representation", () => {
		const encoded = value({
			name: "StringVector",
			wireTag: 31,
			payload: [
				...uint32(2),
				...uint32(7),
				...new TextEncoder().encode("USE_SEG"),
				...uint32(8),
				...new TextEncoder().encode("BROWTHIN"),
			],
		});

		expect(
			parseSerializedValue({ bytes: Uint8Array.from(encoded) })
		).toMatchObject({
			kind: "string-vector",
			value: ["USE_SEG", "BROWTHIN"],
		});
	});

	test("rejects unknown collection values whose boundary cannot be recovered", () => {
		const encoded = value({
			name: "Vector",
			wireTag: 34,
			payload: [
				...uint32(1),
				...value({ name: "Mystery", wireTag: 99, payload: [1, 2, 3] }),
			],
		});

		expect(() =>
			parseSerializedValue({ bytes: Uint8Array.from(encoded) })
		).toThrow("unsupported wire tag 99 cannot be skipped inside a collection");
	});
});
