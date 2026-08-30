import { describe, expect, test } from "bun:test";

import { confidenceFor } from "./probe";

const requiredPathEvidence = {
	kind: "path" as const,
	label: "required model",
	path: "/private/model.onnx",
	required: true,
	found: true,
};

const optionalPathEvidence = {
	kind: "path" as const,
	label: "optional cache",
	path: "/private/cache",
	required: false,
	found: false,
};

const textEvidence = {
	kind: "localized-text" as const,
	label: "server disclosure",
	pattern: "回传至服务器",
	found: true,
	excerpt: "回传至服务器",
};

const symbolEvidence = {
	kind: "symbol" as const,
	label: "draft client",
	library: "libvideoeditor.dylib",
	pattern: "TextClient",
	found: true,
};

describe("confidenceFor", () => {
	test("does not pass when a required local path is absent", () => {
		expect(
			confidenceFor({
				evidence: [
					{
						...requiredPathEvidence,
						found: false,
					},
					textEvidence,
					symbolEvidence,
				],
			})
		).toBe("unavailable");
	});

	test("allows missing optional user caches", () => {
		expect(
			confidenceFor({
				evidence: [requiredPathEvidence, optionalPathEvidence, textEvidence],
			})
		).toBe("strong");
	});

	test("confirms when all evidence classes are present", () => {
		expect(
			confidenceFor({
				evidence: [requiredPathEvidence, textEvidence, symbolEvidence],
			})
		).toBe("confirmed");
	});
});
