// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	encodeJianyingFilterHostRenderCommand,
	jianyingFilterHostProcessTestUtils,
} from "../jianying-filter-local-runtime/host-process.js";

describe("Jianying filter local host protocol", () => {
	const hostOptions = {
		bridgePath: "/private/bridge",
		effectLibraryPath: "/private/effect",
		modelDirectory: "/private/models",
		packagePath: "/private/package",
		bootstrapInputPath: "/tmp/input.ppm",
		bootstrapOutputPath: "/tmp/output.ppm",
		frameworkDirectory: "/private/frameworks",
	};

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

	it("appends an optional face evidence path without changing legacy commands", () => {
		expect(
			encodeJianyingFilterHostRenderCommand({
				requestId: "7",
				timestampSeconds: 2,
				inputPath: "/tmp/input.ppm",
				outputPath: "/tmp/output.ppm",
				maskPath: "/tmp/mask.pgm",
				facePath: "/tmp/face.json",
			})
		).toBe(
			"render\t7\t2\t/tmp/input.ppm\t/tmp/output.ppm\t/tmp/mask.pgm\t/tmp/face.json"
		);
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
				timestampSeconds: 0,
				inputPath: "/tmp/input.ppm",
				outputPath: "/tmp/output.ppm",
				facePath: "/tmp/face\n.json",
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

	it("enables the engine GL coordinate round trip only for face regions", () => {
		const faceRegion = jianyingFilterHostProcessTestUtils.buildHostArguments({
			...hostOptions,
			captureMask: false,
			useEngineGlContext: true,
			flipAlgorithmInputY: true,
			flipProcessInputY: true,
		});
		expect(faceRegion).toEqual(
			expect.arrayContaining([
				"--engine-gl-context",
				"--flip-algorithm-input-y",
				"--flip-process-input-y",
			])
		);
		expect(faceRegion).not.toContain("--inspect-skin-result");

		const portrait = jianyingFilterHostProcessTestUtils.buildHostArguments({
			...hostOptions,
		});
		expect(portrait).toContain("--inspect-skin-result");
		expect(portrait).not.toContain("--engine-gl-context");
		expect(portrait).not.toContain("--flip-algorithm-input-y");
		expect(portrait).not.toContain("--flip-process-input-y");
	});
});
