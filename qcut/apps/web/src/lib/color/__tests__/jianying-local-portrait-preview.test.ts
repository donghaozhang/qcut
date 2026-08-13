import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_MEDIA_COLOR_SETTINGS } from "../color-properties";
import {
	blendJianyingLocalPortrait,
	canRenderJianyingLocalPortrait,
	renderJianyingLocalPortraitPreview,
} from "../jianying-local-portrait-preview";

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
	settings.lut = {
		enabled: true,
		presetId: "custom",
		name: "Olympus",
		intensity: 100,
		skinProtection: 0,
		cube: {
			size: 2,
			domainMin: [0, 0, 0],
			domainMax: [1, 1, 1],
			values: new Array(24).fill(0),
		},
		dual: {
			skinCube: {
				size: 2,
				domainMin: [0, 0, 0],
				domainMax: [1, 1, 1],
				values: new Array(24).fill(1),
			},
			maskKind: "skin-segmentation-v1",
			resourceId: "7361792068475325735",
		},
	};
	return settings;
}

describe("Jianying local portrait preview", () => {
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

	it("requires the spatial provider identity and otherwise stays on fallback", () => {
		const settings = localSettings();
		expect(canRenderJianyingLocalPortrait({ settings })).toBe(true);
		settings.hsl.enabled = true;
		expect(canRenderJianyingLocalPortrait({ settings })).toBe(false);
	});

	it("blends native pixels through intensity and the QCut grade mask", () => {
		const source = imageData({ data: [10, 20, 30, 255, 50, 60, 70, 128] });
		const output = blendJianyingLocalPortrait({
			source,
			rendered: new Uint8Array([110, 120, 130, 255, 150, 160, 170, 255]),
			intensity: 50,
			maskData: new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 0]),
		});
		expect(Array.from(output.data)).toEqual([60, 70, 80, 255, 50, 60, 70, 128]);
	});

	it("sends the exact frame to Electron and returns its binary render", async () => {
		const renderLocalPortrait = vi.fn(async () => ({
			provider: "jianying-local-effect-v1" as const,
			resourceId: "7361792068475325735",
			width: 1,
			height: 1,
			rgba: new Uint8Array([90, 80, 70, 255]),
			mask: {
				width: 224,
				height: 128,
				bytes: new Uint8Array(224 * 128),
				orientation: "bottom-left" as const,
			},
		}));
		Object.defineProperty(window, "electronAPI", {
			configurable: true,
			value: { jianyingFilterLab: { renderLocalPortrait } },
		});
		const source = imageData({ data: [10, 20, 30, 255] });
		const output = await renderJianyingLocalPortraitPreview({
			source,
			settings: localSettings(),
			sourceKey: "video:portrait",
			timestampSeconds: 1.25,
		});
		expect(renderLocalPortrait).toHaveBeenCalledWith({
			resourceId: "7361792068475325735",
			width: 1,
			height: 1,
			sourceKey: "video:portrait",
			timestampSeconds: 1.25,
			rgba: expect.any(Uint8Array),
		});
		expect(Array.from(output?.data ?? [])).toEqual([90, 80, 70, 255]);
	});
});
