// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	decodePgm,
	decodePpm,
	encodePpm,
} from "../jianying-filter-local-runtime/portable-image.js";

describe("Jianying filter portable image bridge", () => {
	it("round-trips RGBA through a binary PPM without treating zero as whitespace", () => {
		const encoded = encodePpm({
			rgba: new Uint8Array([0, 10, 20, 77, 30, 40, 50, 88]),
			width: 2,
			height: 1,
		});
		const decoded = decodePpm({ bytes: encoded });
		expect(decoded).toEqual({
			width: 2,
			height: 1,
			rgba: new Uint8Array([0, 10, 20, 255, 30, 40, 50, 255]),
		});
	});

	it("reads the exact 8-bit CPU skin mask payload", () => {
		const decoded = decodePgm({
			bytes: Buffer.concat([
				Buffer.from("P5\n# skin mask\n2 2\n255\n", "ascii"),
				Buffer.from([0, 64, 128, 255]),
			]),
		});
		expect(decoded).toEqual({
			width: 2,
			height: 2,
			bytes: new Uint8Array([0, 64, 128, 255]),
		});
	});

	it("rejects truncated frames", () => {
		expect(() =>
			decodePpm({ bytes: Buffer.from("P6\n2 1\n255\nabc", "binary") })
		).toThrow("wrong size");
	});
});
