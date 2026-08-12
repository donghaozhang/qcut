// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	checkBuildManifest,
	checkTrackedPaths,
} from "../check-filter-provenance";

describe("checkTrackedPaths", () => {
	it("passes legitimate interop source and research docs", () => {
		expect(
			checkTrackedPaths([
				"electron/jianying-draft-export-handler.ts",
				"electron/jianying-filter-metadata.ts",
				"apps/web/src/lib/filters/jianying-parity/film-presets.ts",
				"docs/task/jianying-filter-runtime-research/current-coverage.zh.md",
				"research/jianying-runtime-probe/filter-probe.mm",
				"resources/bin/README.md",
			])
		).toEqual([]);
	});

	it("flags a tracked private framework binary", () => {
		const violations = checkTrackedPaths([
			"electron/resources/libcccreator.dylib",
		]);
		expect(violations).toHaveLength(1);
		expect(violations[0]?.rule).toBe("no-private-framework-binary");
	});

	it("flags tracked segmentation model files in any location", () => {
		const violations = checkTrackedPaths([
			"resources/models/tt_skin_seg_v5.1.model",
			"apps/web/public/skin.mlmodelc/coremldata.bin",
			"electron/native-pipeline/weights/portrait.bytenn",
		]);
		expect(violations.map((violation) => violation.rule)).toEqual([
			"no-segmentation-model-file",
			"no-segmentation-model-file",
			"no-segmentation-model-file",
		]);
	});

	it("flags effect-package payloads and cache databases", () => {
		const violations = checkTrackedPaths([
			"fixtures/artistEffect/filter-id/v1/AmazingFeature/image/filter.png",
			"fixtures/ressdk/rp.db",
		]);
		expect(violations.map((violation) => violation.rule)).toEqual([
			"no-effect-package-payload",
			"no-effect-package-payload",
		]);
	});

	it("flags a tracked copy of the private runtime", () => {
		const violations = checkTrackedPaths([
			".local/jianying-runtime/Frameworks/libx.dylib",
		]);
		expect(
			violations.some(
				(violation) => violation.rule === "no-private-runtime-copy"
			)
		).toBe(true);
	});

	it("does not flag source files that merely mention model names", () => {
		// String mentions live inside files; only tracked file PATHS count.
		expect(
			checkTrackedPaths([
				"electron/jianying-text-runtime/runtime-discovery.ts",
				"docs/task/jianying-filter-runtime-research/model-input-boundary.zh.md",
			])
		).toEqual([]);
	});
});

describe("checkBuildManifest", () => {
	it("passes the current shape of QCut's build manifest", () => {
		expect(
			checkBuildManifest({
				files: [
					"package.json",
					{ from: "dist/electron", to: "electron" },
					"apps/web/dist/**/*",
					"!**/docs/**/*",
				],
				extraResources: [
					{ from: "resources/default-skills", to: "default-skills" },
					{ from: "electron/resources/ffmpeg", to: "ffmpeg" },
				],
			})
		).toEqual([]);
	});

	it("flags packing the research tree", () => {
		const violations = checkBuildManifest({
			extraResources: [
				{ from: "research/jianying-runtime-probe", to: "probe" },
			],
		});
		expect(violations).toHaveLength(1);
		expect(violations[0]?.rule).toBe("no-research-in-build");
	});

	it("flags packing a private local runtime", () => {
		const violations = checkBuildManifest({
			files: [".local/jianying-runtime/**/*"],
		});
		expect(violations).toHaveLength(1);
		expect(violations[0]?.rule).toBe("no-private-runtime-in-build");
	});

	it("ignores exclusion entries", () => {
		expect(checkBuildManifest({ files: ["!research/**/*"] })).toEqual([]);
	});
});
