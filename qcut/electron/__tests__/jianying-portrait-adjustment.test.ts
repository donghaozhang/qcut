// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	buildJianyingPortraitFeatureParameters,
	JIANYING_PORTRAIT_ADJUSTMENT_CATALOG,
	JIANYING_PORTRAIT_PACKAGE_IDENTITIES,
	JIANYING_PORTRAIT_RUNTIME_PACKAGE_ORDER,
	jianyingPortraitControlsForGroup,
	jianyingPortraitControlsForRuntimePackage,
} from "../jianying-portrait-adjustment-runtime/catalog.js";
import { encodeJianyingPortraitHostRenderCommand } from "../jianying-portrait-adjustment-runtime/host-process.js";
import { JIANYING_PORTRAIT_MAKEUP_CARDS } from "../jianying-portrait-adjustment-runtime/makeup-catalog.js";
import { parseJianyingPortraitRenderRequest } from "../jianying-portrait-adjustment-runtime/request.js";
import { buildJianyingPortraitRenderStages } from "../jianying-portrait-adjustment-runtime/stages.js";

describe("Jianying portrait adjustment contract", () => {
	it("covers base, advanced feature, skin, detail, and body controls", () => {
		expect(JIANYING_PORTRAIT_ADJUSTMENT_CATALOG).toHaveLength(74);
		expect(jianyingPortraitControlsForGroup({ group: "face" })).toHaveLength(
			64
		);
		expect(jianyingPortraitControlsForGroup({ group: "body" })).toHaveLength(
			10
		);
		expect(
			jianyingPortraitControlsForRuntimePackage({ runtimePackage: "features" })
		).toHaveLength(37);
		expect(
			jianyingPortraitControlsForRuntimePackage({
				runtimePackage: "eye-details",
			})
		).toHaveLength(3);
		expect(
			new Set(JIANYING_PORTRAIT_ADJUSTMENT_CATALOG.map(({ key }) => key)).size
		).toBe(74);
	});

	it("uses dedicated package parameter shapes and selected face IDs", () => {
		expect(
			JSON.parse(
				buildJianyingPortraitFeatureParameters({
					runtimePackage: "smooth",
					values: { face_adjust_Smooth: 65 },
				})
			)
		).toEqual({ intensity: 0.65 });
		expect(
			JSON.parse(
				buildJianyingPortraitFeatureParameters({
					runtimePackage: "teeth",
					values: { face_adjust_WhiteTeeth: 70 },
					targetFaceId: 2,
				})
			)
		).toEqual({ face_adjust: [{ id: 2, intensity: 0.7 }] });
		// 美白包出厂默认强度为 1.0，标量分支必须总是显式携带 intensity，
		// 否则未调参的帧会以满强度渲染。
		expect(
			JSON.parse(
				buildJianyingPortraitFeatureParameters({
					runtimePackage: "whiten",
					values: {},
				})
			)
		).toEqual({ intensity: 0 });
		expect(
			JSON.parse(
				buildJianyingPortraitFeatureParameters({
					runtimePackage: "whiten",
					values: { face_adjust_Whiten: 40 },
				})
			)
		).toEqual({ intensity: 0.4 });
		expect(
			JSON.parse(
				buildJianyingPortraitFeatureParameters({
					runtimePackage: "clarity",
					values: { face_adjust_Clarity: 85 },
				})
			)
		).toEqual({ intensity: 0.85 });
	});

	it("sends every group parameter and maps UI percent to SDK intensity", () => {
		const parameters = JSON.parse(
			buildJianyingPortraitFeatureParameters({
				runtimePackage: "face",
				values: {
					face_adjust_TotalFace: 80,
					face_adjust_EyeSpacing: -25,
				},
			})
		) as Record<string, Array<{ id: number; intensity: number }>>;
		expect(Object.keys(parameters)).toHaveLength(18);
		expect(parameters.face_adjust_TotalFace).toEqual([
			{ id: -1, intensity: 0.8 },
		]);
		expect(parameters.face_adjust_EyeSpacing).toEqual([
			{ id: -1, intensity: -0.25 },
		]);
		expect(parameters.face_adjust_Nose).toEqual([{ id: -1, intensity: 0 }]);
	});

	it("validates frame bytes and exact per-control ranges", () => {
		const parsed = parseJianyingPortraitRenderRequest({
			request: {
				width: 2,
				height: 1,
				rgba: new Uint8Array(8),
				adjustments: {
					enabled: true,
					values: { face_adjust_CutFace: -50 },
				},
				sourceKey: "image:portrait",
				timestampSeconds: 1.25,
			},
		});
		expect(parsed.adjustments.values.face_adjust_CutFace).toBe(-50);
		expect(() =>
			parseJianyingPortraitRenderRequest({
				request: {
					width: 2,
					height: 1,
					rgba: new Uint8Array(8),
					adjustments: {
						enabled: true,
						values: { face_adjust_CutFace: 51 },
					},
				},
			})
		).toThrow("超出范围");
		expect(() =>
			parseJianyingPortraitRenderRequest({
				request: {
					width: 2,
					height: 1,
					rgba: new Uint8Array(4),
					adjustments: { enabled: true, values: {} },
				},
			})
		).toThrow("尺寸不匹配");
	});

	it("validates face targeting and category-bound makeup cards", () => {
		const parsed = parseJianyingPortraitRenderRequest({
			request: {
				width: 2,
				height: 1,
				rgba: new Uint8Array(8),
				adjustments: {
					enabled: true,
					values: {},
					faceTarget: { mode: "single", faceId: 1 },
					makeup: {
						lip: { cardId: "lip-soft-pink", intensity: 75 },
					},
				},
			},
		});
		expect(parsed.adjustments.faceTarget).toEqual({
			mode: "single",
			faceId: 1,
		});
		expect(parsed.adjustments.makeup?.lip).toEqual({
			cardId: "lip-soft-pink",
			intensity: 75,
		});
		expect(() =>
			parseJianyingPortraitRenderRequest({
				request: {
					width: 2,
					height: 1,
					rgba: new Uint8Array(8),
					adjustments: {
						enabled: true,
						values: {},
						makeup: {
							lip: { cardId: "contacts-natural", intensity: 75 },
						},
					},
				},
			})
		).toThrow("不受支持");
	});

	it("builds ordered static, standalone, and dynamic makeup stages", () => {
		const packages = JIANYING_PORTRAIT_RUNTIME_PACKAGE_ORDER.map(
			(runtimePackage) => ({
				runtimePackage,
				group: JIANYING_PORTRAIT_PACKAGE_IDENTITIES[runtimePackage].group,
				packagePath: `/runtime/${runtimePackage}`,
				source: "qcut-private" as const,
			})
		);
		const makeupCards = JIANYING_PORTRAIT_MAKEUP_CARDS.map((card) => ({
			card,
			packagePath: `/cards/${card.id}`,
			source: "qcut-private" as const,
		}));
		const stages = buildJianyingPortraitRenderStages({
			request: {
				width: 2,
				height: 1,
				rgba: new Uint8Array(8),
				adjustments: {
					enabled: true,
					values: {
						face_adjust_Smooth: 60,
						face_adjust_TotalFace: 50,
						body_adjust_SlimWaist: 40,
					},
					faceTarget: { mode: "single", faceId: 1 },
					makeup: {
						look: { cardId: "look-oxygen", intensity: 70 },
						lip: { cardId: "lip-soft-pink", intensity: 80 },
						contacts: { cardId: "contacts-natural", intensity: 90 },
					},
				},
			},
			packages,
			makeupCards,
		});
		expect(stages.map(({ id }) => id)).toEqual([
			"package:smooth",
			"package:face",
			"makeup-card:look-oxygen",
			"makeup-dynamic:contacts-natural,lip-soft-pink",
			"package:body",
		]);
		expect(JSON.parse(stages[2]?.featureParameters ?? "{}")).toEqual({
			face_adjust_whole: [{ id: 1, intensity: 0.7, disable_part: [] }],
		});
		expect(
			JSON.parse(stages[3]?.featureParameters ?? "{}")
				.face_adjust_lip_yunranColorRHF
		).toEqual([{ id: 1, intensity: 0.8, path: "/cards/lip-soft-pink" }]);
	});

	it("encodes dynamic feature parameters in the persistent host protocol", () => {
		expect(
			encodeJianyingPortraitHostRenderCommand({
				requestId: "frame-1",
				timestampSeconds: 2.5,
				inputPath: "/tmp/input.rgba",
				outputPath: "/tmp/output.rgba",
				featureParameters:
					'{"face_adjust_TotalFace":[{"id":-1,"intensity":1}]}',
			})
		).toBe(
			'render\tframe-1\t2.5\t/tmp/input.rgba\t/tmp/output.rgba\t{"face_adjust_TotalFace":[{"id":-1,"intensity":1}]}'
		);
	});
});
