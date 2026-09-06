import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_MEDIA_COLOR_SETTINGS } from "../color-properties";
import {
	blendJianyingLocalEffect,
	canRenderJianyingLocalEffect,
	renderJianyingLocalEffectPreview,
} from "../jianying-local-effect-preview";

function imageData({ data }: { data: number[] }): ImageData {
	return {
		width: data.length / 4,
		height: 1,
		data: new Uint8ClampedArray(data),
		colorSpace: "srgb",
	} as ImageData;
}

function localSettings() {
	const settings = structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS);
	settings.multiPass = {
		enabled: true,
		presetId: "jianying:7403664041945681191:test-version",
		name: "清透美食",
		intensity: 60,
		fidelity: "native-local",
		nativeEffect: {
			provider: "jianying-local-effect-v1",
			resourceId: "7403664041945681191",
			version: "test-version",
		},
		passes: [{ kind: "sharpen", amount: 1 }],
	};
	return settings;
}

describe("Jianying local multi-pass preview", () => {
	beforeEach(() => {
		vi.stubGlobal(
			"ImageData",
			class {
				data: Uint8ClampedArray;
				width: number;
				height: number;
				colorSpace = "srgb";

				constructor(data: Uint8ClampedArray, width: number, height: number) {
					this.data = data;
					this.width = width;
					this.height = height;
				}
			}
		);
	});

	it("only selects a verified local-native renderer", () => {
		const settings = localSettings();
		expect(canRenderJianyingLocalEffect({ settings })).toBe(true);
		settings.multiPass = { ...settings.multiPass!, fidelity: "structural" };
		expect(canRenderJianyingLocalEffect({ settings })).toBe(false);
	});

	it("blends native pixels through the QCut grade mask", () => {
		const source = imageData({ data: [10, 20, 30, 255, 50, 60, 70, 128] });
		const output = blendJianyingLocalEffect({
			source,
			rendered: new Uint8Array([110, 120, 130, 255, 150, 160, 170, 255]),
			maskData: new Uint8ClampedArray([0, 0, 0, 128, 0, 0, 0, 0]),
		});
		expect(Array.from(output.data)).toEqual([60, 70, 80, 255, 50, 60, 70, 128]);
	});

	it("sends intensity and frame time to the persistent Electron provider", async () => {
		const renderLocalEffect = vi.fn(async () => ({
			provider: "jianying-local-effect-v1" as const,
			resourceId: "7403664041945681191",
			width: 1,
			height: 1,
			rgba: new Uint8Array([90, 80, 70, 255]),
		}));
		Object.defineProperty(window, "electronAPI", {
			configurable: true,
			value: { jianyingFilterLab: { renderLocalEffect } },
		});
		const source = imageData({ data: [10, 20, 30, 255] });
		const output = await renderJianyingLocalEffectPreview({
			source,
			settings: localSettings(),
			frameSeed: 15,
			sourceKey: "video:effect",
		});
		expect(renderLocalEffect).toHaveBeenCalledWith({
			resourceId: "7403664041945681191",
			width: 1,
			height: 1,
			intensity: 60,
			sourceKey: "video:effect",
			timestampSeconds: 0.5,
			rgba: expect.any(Uint8Array),
		});
		expect(Array.from(output?.data ?? [])).toEqual([90, 80, 70, 255]);
	});

	it.each([
		"qcut-metal-fog-v1",
		"qcut-metal-lut-v1",
	] as const)("routes %s frames only to the new API and preserves alpha", async (provider) => {
		const settings = localSettings();
		settings.multiPass!.nativeEffect!.provider = provider;
		const render = vi.fn(async () => ({
			provider,
			resourceId: "7403664041945681191",
			width: 1,
			height: 1,
			rgba: new Uint8Array([90, 80, 70, 255]),
		}));
		const oldRender = vi.fn();
		Object.defineProperty(window, "electronAPI", {
			configurable: true,
			value: {
				qcutIndependentFilter: { render },
				jianyingFilterLab: { renderLocalEffect: oldRender },
			},
		});
		const output = await renderJianyingLocalEffectPreview({
			source: imageData({ data: [10, 20, 30, 128] }),
			settings,
		});
		expect(render).toHaveBeenCalledWith(
			expect.objectContaining({ version: "test-version", intensity: 60 })
		);
		expect(oldRender).not.toHaveBeenCalled();
		expect(Array.from(output!.data)).toEqual([90, 80, 70, 128]);
	});

	it.each([
		"missing",
		"failure",
		"wrong-provider",
		"wrong-size",
	])("does not silently omit the independent filter: %s", async (mode) => {
		const settings = localSettings();
		settings.multiPass!.nativeEffect!.provider = "qcut-metal-fog-v1";
		const render = vi.fn(async () => {
			if (mode === "failure") throw new Error("Metal failed");
			return {
				provider:
					mode === "wrong-provider"
						? "jianying-local-effect-v1"
						: "qcut-metal-fog-v1",
				resourceId: "7403664041945681191",
				width: mode === "wrong-size" ? 2 : 1,
				height: 1,
				rgba: new Uint8Array(4),
			};
		});
		Object.defineProperty(window, "electronAPI", {
			configurable: true,
			value: mode === "missing" ? {} : { qcutIndependentFilter: { render } },
		});
		await expect(
			renderJianyingLocalEffectPreview({
				source: imageData({ data: [1, 2, 3, 255] }),
				settings,
			})
		).rejects.toThrow();
	});
});
