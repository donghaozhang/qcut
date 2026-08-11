import { describe, expect, test } from "bun:test";

import { djb2NameHash } from "./serialized-container";
import {
	isNonDefaultIntermediate,
	parseRenderTextureFile,
} from "./scan-render-textures";

const MAGIC = new TextEncoder().encode("%SerializedFormat%@\n");

function uint32({ value }: { value: number }) {
	const bytes = new Uint8Array(4);
	new DataView(bytes.buffer).setUint32(0, value, true);
	return [...bytes];
}

function int64({ value }: { value: number }) {
	const bytes = new Uint8Array(8);
	new DataView(bytes.buffer).setBigInt64(0, BigInt(value), true);
	return [...bytes];
}

function float64({ value }: { value: number }) {
	const bytes = new Uint8Array(8);
	new DataView(bytes.buffer).setFloat64(0, value, true);
	return [...bytes];
}

function encodedValue({
	type,
	wireTag,
	payload,
}: {
	type: string;
	wireTag: number;
	payload: number[];
}) {
	return [
		...uint32({ value: djb2NameHash({ name: type }) }),
		...uint32({ value: wireTag }),
		...payload,
	];
}

function field({ name, value }: { name: string; value: number[] }) {
	return [
		...uint32({ value: djb2NameHash({ name }) }),
		...uint32({ value: value.length }),
		...value,
	];
}

function makeRenderTexture({
	pecentX,
	pecentY,
	internalFormat = 43,
	colorFormat = 43,
}: {
	pecentX: number;
	pecentY: number;
	internalFormat?: number;
	colorFormat?: number;
}) {
	const fields = [
		field({
			name: "width",
			value: encodedValue({
				type: "Int64",
				wireTag: 3,
				payload: int64({ value: 0 }),
			}),
		}),
		field({
			name: "height",
			value: encodedValue({
				type: "Int64",
				wireTag: 3,
				payload: int64({ value: 0 }),
			}),
		}),
		field({
			name: "internalFormat",
			value: encodedValue({
				type: "InternalFormat",
				wireTag: 1,
				payload: uint32({ value: internalFormat }),
			}),
		}),
		field({
			name: "colorFormat",
			value: encodedValue({
				type: "PixelFormat",
				wireTag: 1,
				payload: uint32({ value: colorFormat }),
			}),
		}),
		field({
			name: "dataType",
			value: encodedValue({
				type: "DataType",
				wireTag: 1,
				payload: uint32({ value: 1 }),
			}),
		}),
		field({
			name: "pecentX",
			value: encodedValue({
				type: "Double",
				wireTag: 5,
				payload: float64({ value: pecentX }),
			}),
		}),
		field({
			name: "pecentY",
			value: encodedValue({
				type: "Double",
				wireTag: 5,
				payload: float64({ value: pecentY }),
			}),
		}),
	];
	const payload = encodedValue({
		type: "ScreenRenderTexture",
		wireTag: 2,
		payload: [...uint32({ value: fields.length }), ...fields.flat()],
	});
	const bytes = new Uint8Array(76 + payload.length);
	bytes.set(MAGIC, 0);
	const view = new DataView(bytes.buffer);
	view.setUint32(20, 2, true);
	view.setUint32(24, 1, true);
	view.setUint32(64, 1, true);
	view.setUint32(68, djb2NameHash({ name: "ScreenRenderTexture" }), true);
	view.setUint32(72, payload.length, true);
	bytes.set(payload, 76);
	return bytes;
}

describe("scan render textures", () => {
	test("parses a full-size default intermediate", () => {
		const [summary] = parseRenderTextureFile({
			bytes: makeRenderTexture({ pecentX: 1, pecentY: 1 }),
			file: "/cache/full.rt",
		});
		expect(summary).toMatchObject({
			file: "/cache/full.rt",
			type: "ScreenRenderTexture",
			internalFormat: 43,
			colorFormat: 43,
			dataType: 1,
			pecentX: 1,
			pecentY: 1,
		});
		expect(summary && isNonDefaultIntermediate({ summary })).toBe(false);
	});

	test("selects scale and format variants independently", () => {
		const [scaled] = parseRenderTextureFile({
			bytes: makeRenderTexture({ pecentX: 0.5, pecentY: 0.5 }),
			file: "/cache/scaled.rt",
		});
		const [formatted] = parseRenderTextureFile({
			bytes: makeRenderTexture({
				pecentX: 1,
				pecentY: 1,
				internalFormat: 77,
				colorFormat: 77,
			}),
			file: "/cache/formatted.rt",
		});
		expect(scaled && isNonDefaultIntermediate({ summary: scaled })).toBe(true);
		expect(formatted && isNonDefaultIntermediate({ summary: formatted })).toBe(
			true
		);
	});
});
