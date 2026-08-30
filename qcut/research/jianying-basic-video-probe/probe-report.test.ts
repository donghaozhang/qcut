import { describe, expect, test } from "bun:test";

import { classifyProbeLevel } from "./probe-report";

const presentArtifact = {
	root: "models" as const,
	relativePath: "model.bin",
	required: true,
	absolutePath: "/private/model.bin",
	exists: true,
};

const presentSymbol = {
	library: "runtime.dylib",
	demangledName: "Runtime::create()",
	found: true,
};

describe("classifyProbeLevel", () => {
	test("does not promote static evidence to runtime success", () => {
		expect(
			classifyProbeLevel({
				artifacts: [presentArtifact],
				symbols: [presentSymbol],
				native: {
					attempted: false,
					status: "not-attempted",
					detail: "",
				},
			})
		).toBe("discovered");
	});

	test("reports a parsed model separately from processed input", () => {
		expect(
			classifyProbeLevel({
				artifacts: [presentArtifact],
				symbols: [presentSymbol],
				native: {
					attempted: true,
					status: "model-loaded",
					detail: "parsed",
				},
			})
		).toBe("model-loaded");
	});

	test("fails closed when a required model is absent", () => {
		expect(
			classifyProbeLevel({
				artifacts: [{ ...presentArtifact, exists: false }],
				symbols: [presentSymbol],
				native: {
					attempted: true,
					status: "constructed",
					detail: "factory returned an object",
				},
			})
		).toBe("unavailable");
	});
});
