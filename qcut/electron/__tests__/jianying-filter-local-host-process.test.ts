// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	encodeJianyingFilterHostRenderCommand,
	jianyingFilterHostProcessTestUtils,
} from "../jianying-filter-local-runtime/host-process.js";

describe("Jianying filter local host protocol", () => {
	it("encodes one deterministic render command", () => {
		expect(
			encodeJianyingFilterHostRenderCommand({
				requestId: "42",
				timestampSeconds: 1.25,
				inputPath: "/tmp/input.ppm",
				outputPath: "/tmp/output.ppm",
				maskPath: "/tmp/mask.pgm",
			})
		).toBe("render\t42\t1.25\t/tmp/input.ppm\t/tmp/output.ppm\t/tmp/mask.pgm");
	});

	it("uses a sentinel when a render does not need a mask", () => {
		expect(
			encodeJianyingFilterHostRenderCommand({
				requestId: "1",
				timestampSeconds: 0,
				inputPath: "/tmp/input.ppm",
				outputPath: "/tmp/output.ppm",
			})
		).toMatch(/\t-$/);
	});

	it("rejects control characters and invalid timestamps", () => {
		expect(() =>
			encodeJianyingFilterHostRenderCommand({
				requestId: "1\n2",
				timestampSeconds: 0,
				inputPath: "/tmp/input.ppm",
				outputPath: "/tmp/output.ppm",
			})
		).toThrow("control characters");
		expect(() =>
			encodeJianyingFilterHostRenderCommand({
				requestId: "1",
				timestampSeconds: Number.NaN,
				inputPath: "/tmp/input.ppm",
				outputPath: "/tmp/output.ppm",
			})
		).toThrow("non-negative finite");
	});

	it("bounds native stderr retained for diagnostics", () => {
		const tail = jianyingFilterHostProcessTestUtils.appendStderrTail({
			current: "first",
			chunk: "x".repeat(20_000),
		});
		expect(tail).toHaveLength(16 * 1024);
		expect(tail).not.toContain("first");
	});
});
