import { describe, expect, test } from "bun:test";

import { stringifyParityReport } from "./parity-report-json";

describe("stringifyParityReport", () => {
	test("preserves non-finite metric meaning instead of writing null", () => {
		const parsed = JSON.parse(
			stringifyParityReport({
				value: {
					perfectPsnr: Number.POSITIVE_INFINITY,
					invalidMetric: Number.NaN,
					nested: [Number.NEGATIVE_INFINITY, 1],
				},
			})
		);

		expect(parsed).toEqual({
			perfectPsnr: "Infinity",
			invalidMetric: "NaN",
			nested: ["-Infinity", 1],
		});
	});
});
