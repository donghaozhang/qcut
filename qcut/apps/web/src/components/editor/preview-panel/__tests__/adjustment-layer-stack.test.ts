import { describe, expect, it } from "vitest";
import type { AdjustmentElement } from "@/types/timeline";
import { DEFAULT_MEDIA_COLOR_SETTINGS } from "@/lib/color/color-properties";
import { resolveAdjustmentPixelPreviewLayer } from "../adjustment-layer-stack";

function createAdjustment({
	color,
}: {
	color: AdjustmentElement["color"];
}): AdjustmentElement {
	return {
		id: "adjustment-1",
		name: "Adjustment",
		type: "adjustment",
		duration: 5,
		startTime: 0,
		trimStart: 0,
		trimEnd: 0,
		color,
	};
}

describe("resolveAdjustmentPixelPreviewLayer", () => {
	it("passes a native-local multi-pass effect into the pixel preview stack", () => {
		const multiPass = {
			enabled: true,
			presetId: "7447126702137904420",
			name: "电影柔光",
			intensity: 100,
			fidelity: "native-local" as const,
			nativeEffect: {
				provider: "jianying-local-effect-v1" as const,
				resourceId: "7447126702137904420",
				version: "9673f80b8e2f5a07f02f9ce1130b784a",
			},
			passes: [],
		};
		const element = createAdjustment({
			color: {
				...DEFAULT_MEDIA_COLOR_SETTINGS,
				basic: {
					...DEFAULT_MEDIA_COLOR_SETTINGS.basic,
					brightness: 25,
				},
				multiPass,
			},
		});

		const layer = resolveAdjustmentPixelPreviewLayer({
			element,
			currentTime: 0,
			fps: 30,
		});

		expect(layer?.settings.multiPass).toEqual(multiPass);
		expect(layer?.settings.basic.brightness).toBe(0);
	});

	it("keeps cube LUT adjustment layers in the pixel preview stack", () => {
		const cube = {
			size: 2,
			domainMin: [0, 0, 0] as [number, number, number],
			domainMax: [1, 1, 1] as [number, number, number],
			values: Array.from({ length: 24 }, () => 0),
		};
		const element = createAdjustment({
			color: {
				...DEFAULT_MEDIA_COLOR_SETTINGS,
				lut: {
					...DEFAULT_MEDIA_COLOR_SETTINGS.lut,
					enabled: true,
					cube,
				},
			},
		});

		const layer = resolveAdjustmentPixelPreviewLayer({
			element,
			currentTime: 0,
			fps: 30,
		});

		expect(layer?.settings.lut.cube).toBe(cube);
	});

	it("omits disabled and CSS-only adjustment layers", () => {
		const disabled = createAdjustment({
			color: {
				...DEFAULT_MEDIA_COLOR_SETTINGS,
				enabled: false,
				multiPass: {
					enabled: true,
					presetId: "soft-glow",
					name: "Soft Glow",
					intensity: 100,
					fidelity: "structural",
					passes: [],
				},
			},
		});
		const cssOnly = createAdjustment({
			color: {
				...DEFAULT_MEDIA_COLOR_SETTINGS,
				basic: {
					...DEFAULT_MEDIA_COLOR_SETTINGS.basic,
					contrast: 20,
				},
			},
		});

		expect(
			resolveAdjustmentPixelPreviewLayer({
				element: disabled,
				currentTime: 0,
				fps: 30,
			})
		).toBeUndefined();
		expect(
			resolveAdjustmentPixelPreviewLayer({
				element: cssOnly,
				currentTime: 0,
				fps: 30,
			})
		).toBeUndefined();
	});
});
