import { describe, expect, test } from "bun:test";

import {
	collectMaterialCounts,
	confidenceFor,
	parseIniValues,
	sanitizeStorageUri,
} from "./probe";

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

describe("parseIniValues", () => {
	test("keeps key/value pairs and ignores section headers", () => {
		expect(
			parseIniValues({
				text: [
					"[General]",
					"authorized=false",
					"packagingStyle=1",
					"; ignored",
					"[Other]",
					"clearCurrentSubtitles=true",
				].join("\n"),
			})
		).toEqual({
			authorized: "false",
			clearCurrentSubtitles: "true",
			packagingStyle: "1",
		});
	});
});

describe("sanitizeStorageUri", () => {
	test("redacts object storage keys while preserving bucket type", () => {
		expect(
			sanitizeStorageUri({
				value: "tos-cn-v-0000c2242/private/object/key",
			})
		).toBe("tos-cn-v-0000c2242/[redacted]");
	});

	test("redacts signed urls while preserving host", () => {
		expect(
			sanitizeStorageUri({
				value:
					"https://lf26-faceu-file-sign.bytecdn.com/private?Signature=secret",
			})
		).toBe("https://lf26-faceu-file-sign.bytecdn.com/[redacted]");
	});
});

describe("collectMaterialCounts", () => {
	test("counts only string material fields", () => {
		expect(
			collectMaterialCounts({
				key: "type",
				materials: [
					{ type: "text_templates" },
					{ type: "sound_effects" },
					{ type: "text_templates" },
					{ type: 3 },
					null,
				],
			})
		).toEqual([
			{ name: "sound_effects", count: 1 },
			{ name: "text_templates", count: 2 },
		]);
	});
});
