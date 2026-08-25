// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	JIANYING_PORTRAIT_PACKAGE_IDENTITIES,
	JIANYING_PORTRAIT_RUNTIME_PACKAGE_ORDER,
} from "../jianying-portrait-adjustment-runtime/catalog.js";
import { encodeJianyingPortraitHostStrokeCommand } from "../jianying-portrait-adjustment-runtime/host-process.js";
import { parseJianyingPortraitRenderRequest } from "../jianying-portrait-adjustment-runtime/request.js";
import { buildJianyingPortraitRenderStages } from "../jianying-portrait-adjustment-runtime/stages.js";

const points = [
	{ x: 0.4, y: 0.3 },
	{ x: 0.45, y: 0.35 },
];

const strokes = [
	{
		id: "smooth-paint",
		tool: "smooth" as const,
		mode: "paint" as const,
		size: 60,
		intensity: 80,
		points,
		faceTrackId: 2,
	},
	{
		id: "acne-erase",
		tool: "acne" as const,
		mode: "erase" as const,
		size: 24,
		intensity: 100,
		points,
	},
];

describe("Jianying manual retouch", () => {
	it("round-trips strict manual brush data", () => {
		const parsed = parseJianyingPortraitRenderRequest({
			request: {
				width: 2,
				height: 1,
				rgba: new Uint8Array(8),
				adjustments: {
					enabled: true,
					values: {},
					manualRetouch: { strokes },
				},
			},
		});

		expect(parsed.adjustments.manualRetouch?.strokes).toEqual(strokes);
	});

	it("accepts the Jianying zero-intensity boundary", () => {
		const zeroIntensityStroke = { ...strokes[0], intensity: 0 };
		const parsed = parseJianyingPortraitRenderRequest({
			request: {
				width: 2,
				height: 1,
				rgba: new Uint8Array(8),
				adjustments: {
					enabled: true,
					values: {},
					manualRetouch: { strokes: [zeroIntensityStroke] },
				},
			},
		});

		expect(parsed.adjustments.manualRetouch?.strokes).toEqual([
			zeroIntensityStroke,
		]);
	});

	it("rejects duplicate IDs, out-of-range coordinates, and oversized paths", () => {
		const requestForStrokes = (manualStrokes: unknown[]) => ({
			width: 2,
			height: 1,
			rgba: new Uint8Array(8),
			adjustments: {
				enabled: true,
				values: {},
				manualRetouch: { strokes: manualStrokes },
			},
		});

		expect(() =>
			parseJianyingPortraitRenderRequest({
				request: requestForStrokes([strokes[0], strokes[0]]),
			})
		).toThrow("笔画参数无效");
		expect(() =>
			parseJianyingPortraitRenderRequest({
				request: requestForStrokes([
					{ ...strokes[0], points: [{ x: -0.1, y: 0.2 }, points[1]] },
				]),
			})
		).toThrow("笔画坐标无效");
		expect(() =>
			parseJianyingPortraitRenderRequest({
				request: requestForStrokes([
					{
						...strokes[0],
						points: Array.from({ length: 513 }, () => points[0]),
					},
				]),
			})
		).toThrow("笔画参数无效");
	});

	it("builds one deterministic native stage per manual tool", () => {
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
				adjustments: {
					enabled: true,
					values: {},
					manualRetouch: { strokes },
				},
			},
			packages,
			makeupCards: [],
		});

		expect(stages.map(({ manualTool }) => manualTool)).toEqual([
			"smooth",
			"acne",
		]);
		expect(stages.map(({ packagePath }) => packagePath)).toEqual([
			"/private/manual-smooth",
			"/private/manual-acne",
		]);
		expect(stages[0]?.manualStrokes).toEqual([strokes[0]]);
		expect(stages[1]?.manualStrokes).toEqual([strokes[1]]);
		expect(
			stages.every(({ id }) => /^manual:(smooth|acne):[a-f0-9]{16}$/.test(id))
		).toBe(true);
	});

	it("encodes and validates the native stroke protocol", () => {
		expect(
			encodeJianyingPortraitHostStrokeCommand({
				requestId: "stroke-1",
				timestampSeconds: 1.25,
				inputPath: "/tmp/input.rgba",
				outputPath: "/tmp/output.rgba",
				featureParameters: '{"brush_mode":0,"brush_size":60}',
				points,
			})
		).toBe(
			'stroke\tstroke-1\t1.25\t/tmp/input.rgba\t/tmp/output.rgba\t{"brush_mode":0,"brush_size":60}\t0.4\t0.3\t0.45\t0.35'
		);
		expect(() =>
			encodeJianyingPortraitHostStrokeCommand({
				requestId: "stroke-2",
				timestampSeconds: 0,
				inputPath: "/tmp/input.rgba",
				outputPath: "/tmp/output.rgba",
				featureParameters: "{}",
				points: [
					{ x: 1.1, y: 0.5 },
					{ x: 0.45, y: 0.35 },
				],
			})
		).toThrow("between zero and one");
		expect(() =>
			encodeJianyingPortraitHostStrokeCommand({
				requestId: "stroke-3",
				timestampSeconds: 0,
				inputPath: "/tmp/input.rgba",
				outputPath: "/tmp/output.rgba",
				featureParameters: "{}",
				points: points.slice(0, 1),
			})
		).toThrow("between 2 and 512");
	});
});
