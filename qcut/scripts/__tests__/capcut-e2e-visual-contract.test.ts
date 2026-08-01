import { describe, expect, it } from "vitest";
import { compareTransparentSticker } from "../capcut-e2e/visual-alpha.js";
import {
	deriveOverallVisualStatus,
	type VisualFileEvidence,
	type VisualOracleManifest,
	validateVisualOracleManifest,
} from "../capcut-e2e/visual-contract.js";
import { buildDissolveFramePlan } from "../capcut-e2e/visual-frame-plan.js";
import {
	compareLutMaskProbes,
	LUT_MASK_PROBES,
} from "../capcut-e2e/visual-lut-mask.js";
import { CAPCUT_E2E_FIXTURE_SPEC } from "../capcut-e2e/spec.js";

function fileEvidence({ path }: { path: string }): VisualFileEvidence {
	return { bytes: 100, path, sha256: "a".repeat(64) };
}

function manifest(): VisualOracleManifest {
	const framePlan = buildDissolveFramePlan({
		fps: 30,
		intervalEvidence: null,
		intervalReason: "No numbered export is available.",
		intervalSource: "expected-seam-candidate",
		intervalStatus: "unverified",
		transitionDurationMicroseconds: 466_666,
		transitionFrameCount: 14,
		transitionStartFrameIndex: 83,
	});
	return {
		capturesDirectory: "/captures",
		createdAt: "2026-08-01T00:00:00.000Z",
		dissolve: {
			framePlan,
			mixSpace: "encoded-rgb-0-255-linear-weight",
			rmseThreshold: 8,
			samples: framePlan.samples.map((sample, index) => ({
				capture: {
					exists: false,
					path: `/captures/dissolve/${index}.png`,
				},
				comparison: null,
				expected: fileEvidence({ path: `/expected/dissolve/${index}.png` }),
				frameOffset: sample.frameOffset,
				id: `p${index}`,
				nominalProgress: sample.nominalProgress,
				realizedProgress: sample.realizedProgress,
				status: "unverified",
				timelineFrameIndex: sample.timelineFrameIndex,
				timelineFrameNumber: sample.timelineFrameNumber,
				transitionFrameNumber: sample.transitionFrameNumber,
			})),
			sourceFrameCalibration: {
				...CAPCUT_E2E_FIXTURE_SPEC.sourceFrameCalibration,
				evidence: {
					clipARoiSha256: "b".repeat(64),
					clipBRoiSha256: "c".repeat(64),
					ordinalStripSha256: ["d".repeat(64), "e".repeat(64)],
				},
				fixtureSchemaVersion: 2,
				reason: "Fixture v2 has locked source frame ordinals.",
				status: "verified",
			},
			status: "unverified",
		},
		lutMask: {
			capture: { exists: false, path: "/captures/lut-mask.png" },
			comparison: null,
			expected: fileEvidence({ path: "/expected/lut-mask.png" }),
			status: "unverified",
		},
		overallStatus: "unverified",
		runId: "visual-run",
		schemaVersion: 2,
		source: {
			bundleManifest: fileEvidence({ path: "/run/bundle-manifest.json" }),
			fixtureManifest: fileEvidence({ path: "/run/manifest.json" }),
			frameA: fileEvidence({ path: "/run/frame-a.png" }),
			frameB: fileEvidence({ path: "/run/frame-b.png" }),
		},
		sticker: {
			comparison: null,
			reopenedAsset: {
				exists: false,
				path: "/captures/sticker/reopened-icon.png",
			},
			source: fileEvidence({ path: "/assets/icon.png" }),
			status: "unverified",
		},
		toolchain: {
			ffmpeg: {
				banner: "ffmpeg version 8.1.2",
				path: "/tools/ffmpeg",
				version: "8.1.2",
			},
			ffprobe: {
				banner: "ffprobe version 8.1.2",
				path: "/tools/ffprobe",
				version: "8.1.2",
			},
		},
	};
}

function validLutMaskComparison() {
	const geometry = {
		height: CAPCUT_E2E_FIXTURE_SPEC.height,
		width: CAPCUT_E2E_FIXTURE_SPEC.width,
	};
	const expected = new Uint8Array(geometry.width * geometry.height * 4);
	for (const definition of LUT_MASK_PROBES) {
		const x = Math.round(definition.x * (geometry.width - 1));
		const y = Math.round(definition.y * (geometry.height - 1));
		const offset = (y * geometry.width + x) * 4;
		expected.set(
			definition.region === "inside" ? [200, 150, 100, 255] : [30, 20, 10, 0],
			offset
		);
	}
	return compareLutMaskProbes({
		candidateGeometry: geometry,
		candidatePixels: expected.slice(),
		expectedGeometry: geometry,
		expectedPixels: expected,
	});
}

describe("CapCut E2E visual oracle manifest", () => {
	it("accepts explicit unverified state when no Jianying observations exist", () => {
		expect(() =>
			validateVisualOracleManifest({ manifest: manifest() })
		).not.toThrow();
	});

	it("never accepts a comparison or verified status for a missing capture", () => {
		const value = structuredClone(manifest()) as VisualOracleManifest;
		const sample = value.dissolve.samples[0];
		if (!sample) throw new Error("Missing test sample.");
		sample.comparison = {
			actualGeometry: { height: 720, width: 1280 },
			dimensionsMatch: true,
			expectedGeometry: { height: 720, width: 1280 },
			metrics: {
				channelSampleCount: 2_396_160,
				mae: 0,
				max: 0,
				p95: 0,
				pixelCount: 798_720,
				rmse: 0,
			},
			pass: true,
			rmseThreshold: 8,
		};
		sample.status = "verified";
		expect(() => validateVisualOracleManifest({ manifest: value })).toThrow(
			"if and only if its observed file exists"
		);
	});

	it("keeps the dissolve result unverified until the interval is discovered", () => {
		const value = manifest();
		expect(
			deriveOverallVisualStatus({
				statuses: [
					"verified",
					"verified",
					"verified",
					"verified",
					"verified",
					value.dissolve.framePlan.intervalStatus,
					value.dissolve.sourceFrameCalibration.status,
				],
			})
		).toBe("unverified");
	});

	it("rejects an interval promoted without numbered-export evidence", () => {
		const value = structuredClone(manifest()) as VisualOracleManifest;
		value.dissolve.framePlan.intervalStatus = "verified";
		value.dissolve.framePlan.intervalSource = "capture-discovered";
		expect(() => validateVisualOracleManifest({ manifest: value })).toThrow(
			"Verified dissolve intervals are unsupported"
		);
	});

	it("rejects forged fixture pixel-calibration evidence", () => {
		const value = manifest();
		value.dissolve.sourceFrameCalibration.evidence.clipBRoiSha256 =
			value.dissolve.sourceFrameCalibration.evidence.clipARoiSha256;
		expect(() => validateVisualOracleManifest({ manifest: value })).toThrow(
			"source-frame calibration is inconsistent"
		);
	});

	it("rejects a forged sticker visible-RGB pass", () => {
		const value = manifest();
		const pixels = Uint8Array.from([100, 150, 200, 255]);
		const comparison = compareTransparentSticker({
			reopenedAssetGeometry: { height: 1, width: 1 },
			reopenedAssetPixels: pixels,
			sourceGeometry: { height: 1, width: 1 },
			sourcePixels: pixels,
		});
		value.sticker = {
			comparison,
			reopenedAsset: {
				exists: true,
				...fileEvidence({ path: "/captures/sticker/reopened-icon.png" }),
			},
			source: value.sticker.source,
			status: "verified",
		};
		expect(() =>
			validateVisualOracleManifest({ manifest: value })
		).not.toThrow();
		comparison.visibleRgb.metrics.rmse = 9;
		expect(() => validateVisualOracleManifest({ manifest: value })).toThrow(
			"visible pixels RGB metrics are inconsistent"
		);
	});

	it("rejects forged sticker scalar and shape metrics", () => {
		const pixels = Uint8Array.from([100, 150, 200, 255]);
		const comparison = compareTransparentSticker({
			reopenedAssetGeometry: { height: 1, width: 1 },
			reopenedAssetPixels: pixels,
			sourceGeometry: { height: 1, width: 1 },
			sourcePixels: pixels,
		});
		const value = manifest();
		value.sticker = {
			comparison,
			reopenedAsset: {
				exists: true,
				...fileEvidence({ path: "/captures/sticker/reopened-icon.png" }),
			},
			source: value.sticker.source,
			status: "verified",
		};
		comparison.alphaMae = Number.NaN;
		expect(() => validateVisualOracleManifest({ manifest: value })).toThrow(
			"alpha comparison metrics"
		);
		comparison.alphaMae = 0;
		comparison.source.coverageRatio = -1;
		expect(() => validateVisualOracleManifest({ manifest: value })).toThrow(
			"alpha-shape evidence"
		);
	});

	it("rejects empty, reordered, and out-of-range LUT/mask probes", () => {
		const value = manifest();
		const comparison = validLutMaskComparison();
		value.lutMask = {
			capture: {
				exists: true,
				...fileEvidence({ path: "/captures/lut-mask.png" }),
			},
			comparison,
			expected: value.lutMask.expected,
			status: "verified",
		};
		expect(() =>
			validateVisualOracleManifest({ manifest: value })
		).not.toThrow();

		const empty = structuredClone(value) as VisualOracleManifest;
		if (!empty.lutMask.comparison) throw new Error("Missing LUT comparison.");
		empty.lutMask.comparison.probes = [];
		expect(() => validateVisualOracleManifest({ manifest: empty })).toThrow(
			"probe comparison is inconsistent"
		);

		const reordered = structuredClone(value) as VisualOracleManifest;
		if (!reordered.lutMask.comparison) {
			throw new Error("Missing LUT comparison.");
		}
		reordered.lutMask.comparison.probes.reverse();
		expect(() => validateVisualOracleManifest({ manifest: reordered })).toThrow(
			"probe center is inconsistent"
		);

		const invalidRgba = structuredClone(value) as VisualOracleManifest;
		const firstProbe = invalidRgba.lutMask.comparison?.probes[0];
		if (!firstProbe) throw new Error("Missing first LUT probe.");
		firstProbe.candidateRgba = [999, 0, 0, 255];
		expect(() =>
			validateVisualOracleManifest({ manifest: invalidRgba })
		).toThrow("probe center is inconsistent");
	});
});
