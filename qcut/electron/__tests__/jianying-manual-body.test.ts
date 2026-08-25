// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	JIANYING_PORTRAIT_PACKAGE_IDENTITIES,
	JIANYING_PORTRAIT_RUNTIME_PACKAGE_ORDER,
} from "../jianying-portrait-adjustment-runtime/catalog.js";
import { buildJianyingManualBodyFeatureParameters } from "../jianying-portrait-adjustment-runtime/manual-body.js";
import { parseJianyingPortraitRenderRequest } from "../jianying-portrait-adjustment-runtime/request.js";
import { buildJianyingPortraitRenderStages } from "../jianying-portrait-adjustment-runtime/stages.js";

const manualBody = {
	stretch: { intensity: 50, upper: 0.72, bottom: 0.18 },
	slim: {
		intensity: -35,
		x: 0.48,
		y: 0.52,
		width: 0.31,
		height: 0.42,
		rotation: 17,
	},
	zoom: { intensity: 40, x: 0.55, y: 0.62, radius: 0.16 },
};

describe("Jianying manual body", () => {
	it("round-trips strict timeline geometry", () => {
		const parsed = parseJianyingPortraitRenderRequest({
			request: {
				width: 2,
				height: 1,
				rgba: new Uint8Array(8),
				adjustments: { enabled: true, values: {}, manualBody },
			},
		});

		expect(parsed.adjustments.manualBody).toEqual(manualBody);
	});

	it("maps UI percentages and canvas geometry to package parameter names", () => {
		expect(
			JSON.parse(
				buildJianyingManualBodyFeatureParameters({
					manualBody,
					tool: "stretch",
				})
			)
		).toEqual({
			effects_adjust_intensity: 0.5,
			upper: 0.72,
			bottom: 0.18,
		});
		expect(
			JSON.parse(
				buildJianyingManualBodyFeatureParameters({
					manualBody,
					tool: "slim",
				})
			)
		).toEqual({
			effects_adjust_intensity: -0.35,
			x: 0.48,
			y: 0.52,
			width: 0.31,
			height: 0.42,
			rotation: 17,
		});
		expect(
			JSON.parse(
				buildJianyingManualBodyFeatureParameters({
					manualBody,
					tool: "zoom",
				})
			)
		).toEqual({
			effects_adjust_intensity: 0.4,
			x: 0.55,
			y: 0.62,
			r: 0.16,
		});
	});

	it("builds one ordered native grid stage per active tool", () => {
		const packages = JIANYING_PORTRAIT_RUNTIME_PACKAGE_ORDER.map(
			(runtimePackage) => ({
				runtimePackage,
				group: JIANYING_PORTRAIT_PACKAGE_IDENTITIES[runtimePackage].group,
				packagePath: `/private/${runtimePackage}`,
				source: "qcut-private" as const,
			})
		);
		const stages = buildJianyingPortraitRenderStages({
			request: {
				width: 2,
				height: 1,
				rgba: new Uint8Array(8),
				adjustments: { enabled: true, values: {}, manualBody },
			},
			packages,
			makeupCards: [],
		});

		expect(stages.map(({ id }) => id)).toEqual([
			"manual-body:stretch",
			"manual-body:slim",
			"manual-body:zoom",
		]);
		expect(stages.map(({ packagePath }) => packagePath)).toEqual([
			"/private/manual-stretch",
			"/private/manual-slim",
			"/private/manual-zoom",
		]);
	});

	it("rejects crossed lines and out-of-range handles", () => {
		const request = (value: unknown) => ({
			width: 2,
			height: 1,
			rgba: new Uint8Array(8),
			adjustments: { enabled: true, values: {}, manualBody: value },
		});
		expect(() =>
			parseJianyingPortraitRenderRequest({
				request: request({
					stretch: { intensity: 20, upper: 0.3, bottom: 0.4 },
				}),
			})
		).toThrow("上下线距离过小");
		expect(() =>
			parseJianyingPortraitRenderRequest({
				request: request({
					zoom: { intensity: 20, x: 1.2, y: 0.5, radius: 0.2 },
				}),
			})
		).toThrow("zoom.x");
	});
});
