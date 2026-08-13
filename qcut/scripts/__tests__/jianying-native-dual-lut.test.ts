import { describe, expect, it } from "vitest";
import { parseBuildUiMaskArgs } from "../jianying-filter-parity/build-dual-lut-ui-mask-manifest";
import { parseNativeDualLutArgs } from "../jianying-filter-parity/run-native-dual-lut";
import {
	maskStatistics,
	measureByteSequenceChange,
} from "../jianying-filter-parity/dual-lut-evidence";
import {
	algorithmGraphSha256,
	resizeMaskHalfPixel,
} from "../jianying-filter-parity/dual-lut-ui-mask";
import { inferDualLutMaskFrame } from "../jianying-filter-parity/dual-lut-mask-inference";
import { measureSequenceMotion } from "../jianying-filter-parity/real-video-sequence";

describe("Jianying native dual-LUT batch", () => {
	it("parses explicit evidence paths", () => {
		expect(
			parseNativeDualLutArgs({
				argv: [
					"--video",
					"/tmp/input.mov",
					"--run-dir",
					"/tmp/run",
					"--ui-mask-manifest",
					"/tmp/masks.json",
				],
			})
		).toEqual({
			frameCount: 70,
			motionStartFrame: 60,
			videoPath: "/tmp/input.mov",
			runDirectory: "/tmp/run",
			uiMaskManifestPath: "/tmp/masks.json",
		});
	});

	it("selects a strict subset of dual-LUT cards", () => {
		expect(
			parseNativeDualLutArgs({
				argv: [
					"--video",
					"/tmp/input.mov",
					"--run-dir",
					"/tmp/run",
					"--resource-ids",
					"7361792068475325735,7127671508264078599",
				],
			})
		).toMatchObject({
			resourceIds: ["7361792068475325735", "7127671508264078599"],
		});
		expect(() =>
			parseNativeDualLutArgs({
				argv: [
					"--video",
					"/tmp/input.mov",
					"--run-dir",
					"/tmp/run",
					"--resource-ids",
					"unknown",
				],
			})
		).toThrow("Unknown dual-LUT resource IDs");
	});

	it("allows unverified UI masks only when explicitly requested", () => {
		expect(
			parseNativeDualLutArgs({
				argv: [
					"--video",
					"/tmp/input.mov",
					"--run-dir",
					"/tmp/run",
					"--allow-unverified-ui-mask",
				],
			})
		).toMatchObject({ allowUnverifiedUiMask: true });
	});

	it("keeps direct and inferred UI mask timelines explicit", () => {
		expect(
			parseBuildUiMaskArgs({
				argv: [
					"--source-video",
					"/tmp/source.mkv",
					"--resource-id",
					"7361792068475325735",
					"--direct-ui-mask",
					"/tmp/direct.gray",
					"--output-dir",
					"/tmp/direct",
				],
			})
		).toMatchObject({
			directUiMask: "/tmp/direct.gray",
			frameCount: 70,
			measurementStartFrame: 60,
		});
		expect(() =>
			parseBuildUiMaskArgs({
				argv: [
					"--source-video",
					"/tmp/source.mkv",
					"--resource-id",
					"7127671508264078599",
					"--filtered-video",
					"/tmp/filtered.mov",
					"--output-dir",
					"/tmp/inferred",
				],
			})
		).toThrow("Inferred UI masks require all calibration paths");
	});

	it("measures temporal mask changes", () => {
		expect(
			measureByteSequenceChange({
				frames: [
					new Uint8Array([0, 10]),
					new Uint8Array([0, 10]),
					new Uint8Array([4, 14]),
				],
			})
		).toMatchObject({
			adjacentMae: [0, 4],
			changedPairCount: 1,
			meanAdjacentMae: 2,
		});
	});

	it("measures mask occupancy and edge energy", () => {
		expect(
			maskStatistics({
				bytes: new Uint8Array([0, 0, 255, 255]),
				width: 2,
				height: 2,
			})
		).toEqual({ mean: 127.5, nonZeroRatio: 0.5, edgeMean: 127.5 });
	});

	it("rejects static sequences as person-movement evidence", () => {
		const staticFrame = new Uint8Array([0, 0, 0, 255]);
		expect(
			measureSequenceMotion({ frames: [staticFrame, staticFrame] })
		).toMatchObject({ movingPairCount: 0, meanAdjacentRgbMae: 0 });
		expect(
			measureSequenceMotion({
				frames: [staticFrame, new Uint8Array([12, 6, 3, 255])],
			})
		).toMatchObject({ movingPairCount: 1, meanAdjacentRgbMae: 7 });
	});

	it("hashes algorithm graphs independent of JSON key order", () => {
		expect(
			algorithmGraphSha256({ graph: { name: "skin", nodes: [{ y: 2, x: 1 }] } })
		).toBe(
			algorithmGraphSha256({ graph: { nodes: [{ x: 1, y: 2 }], name: "skin" } })
		);
	});

	it("resizes native masks using half-pixel bilinear sampling", () => {
		expect(
			Array.from(
				resizeMaskHalfPixel({
					mask: {
						width: 2,
						height: 2,
						bytes: new Uint8Array([0, 0, 255, 255]),
					},
					width: 1,
					height: 1,
				})
			)
		).toEqual([128]);
	});

	it("infers UI mask only where dual LUT colours are distinguishable", () => {
		const inferred = inferDualLutMaskFrame({
			background: new Uint8Array([10, 20, 30, 255, 40, 50, 60, 255]),
			skin: new Uint8Array([30, 40, 50, 255, 44, 54, 64, 255]),
			filtered: new Uint8Array([20, 30, 40, 255, 42, 52, 62, 255]),
		});
		expect(Array.from(inferred.mask)).toEqual([127, 0]);
		expect(inferred.confidenceCoverage).toBe(0.5);
	});
});
