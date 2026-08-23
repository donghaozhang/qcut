import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderJianyingPortraitAdjustmentPreview } from "../jianying-portrait-adjustment-preview";

function imageData({ data }: { data: number[] }): ImageData {
	return {
		width: data.length / 4,
		height: 1,
		data: new Uint8ClampedArray(data),
		colorSpace: "srgb",
	} as ImageData;
}

describe("Jianying portrait adjustment preview", () => {
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

	it("sends exact pixels, source identity, time, and non-destructive settings", async () => {
		const render = vi.fn(async () => ({
			provider: "jianying-local-swing-v1" as const,
			width: 1,
			height: 1,
			rgba: new Uint8Array([90, 80, 70, 255]),
			activeGroups: ["face" as const],
		}));
		Object.defineProperty(window, "electronAPI", {
			configurable: true,
			value: { jianyingPortraitAdjustment: { render } },
		});
		const adjustments = {
			enabled: true,
			values: { face_adjust_TotalFace: 75 },
		} as const;
		const result = await renderJianyingPortraitAdjustmentPreview({
			source: imageData({ data: [10, 20, 30, 255] }),
			adjustments,
			sourceKey: "video:portrait",
			timestampSeconds: 1.25,
		});
		expect(render).toHaveBeenCalledWith({
			width: 1,
			height: 1,
			rgba: expect.any(Uint8Array),
			adjustments,
			sourceKey: "video:portrait",
			timestampSeconds: 1.25,
		});
		expect(Array.from(result?.data ?? [])).toEqual([90, 80, 70, 255]);
	});

	it("does not call Electron for neutral settings", async () => {
		const render = vi.fn();
		Object.defineProperty(window, "electronAPI", {
			configurable: true,
			value: { jianyingPortraitAdjustment: { render } },
		});
		const source = imageData({ data: [10, 20, 30, 255] });
		const result = await renderJianyingPortraitAdjustmentPreview({
			source,
			adjustments: { enabled: true, values: {} },
		});
		expect(result).toBe(source);
		expect(render).not.toHaveBeenCalled();
	});
});
