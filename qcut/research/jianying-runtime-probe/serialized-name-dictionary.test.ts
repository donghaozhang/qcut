import { describe, expect, test } from "bun:test";

import { djb2NameHash } from "./serialized-container";
import {
	collectSerializedHashes,
	findDjb2Names,
} from "./serialized-name-dictionary";
import type { SerializedValue } from "./serialized-value";

describe("findDjb2Names", () => {
	test("recovers only requested null-delimited printable strings", () => {
		const bytes = new TextEncoder().encode("noise\0name\0XShader\0ignored\0");
		const matches = findDjb2Names({
			bytes,
			targetHashes: new Set([
				djb2NameHash({ name: "name" }),
				djb2NameHash({ name: "XShader" }),
			]),
		});

		expect(matches).toEqual(
			new Map([
				[djb2NameHash({ name: "name" }), ["name"]],
				[djb2NameHash({ name: "XShader" }), ["XShader"]],
			])
		);
	});

	test("rejects invalid name-length bounds", () => {
		expect(() =>
			findDjb2Names({
				bytes: new Uint8Array(),
				targetHashes: new Set(),
				minimumNameBytes: 4,
				maximumNameBytes: 3,
			})
		).toThrow("invalid printable-name length range");
	});
});

describe("collectSerializedHashes", () => {
	test("walks object fields and collection children", () => {
		const leaf: SerializedValue = {
			typeHash: 3,
			typeNames: [],
			wireTag: 0,
			byteLength: 8,
			kind: "string",
			value: "",
		};
		const value: SerializedValue = {
			typeHash: 1,
			typeNames: [],
			wireTag: 2,
			byteLength: 24,
			kind: "object",
			fields: [
				{
					nameHash: 2,
					names: [],
					byteLength: leaf.byteLength,
					value: leaf,
				},
			],
		};

		expect(collectSerializedHashes({ values: [value] })).toEqual(
			new Set([1, 2, 3])
		);
	});
});
