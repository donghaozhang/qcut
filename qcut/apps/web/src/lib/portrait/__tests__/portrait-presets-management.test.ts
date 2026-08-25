import { describe, expect, it } from "vitest";
import {
	createPortraitPreset,
	isPortraitPresetThumbnail,
	overwritePortraitPreset,
	parsePortraitPresetExport,
	PORTRAIT_PRESET_EXPORT_VERSION,
	renamePortraitPreset,
	serializePortraitPresets,
} from "../portrait-presets";

const adjustments = {
	enabled: true,
	values: { face_adjust_Smooth: 40 },
};
const thumbnail = "data:image/png;base64,iVBORw0KGgo=";

function preset(name = "原名") {
	return createPortraitPreset({ adjustments, name, scope: "face" as const });
}

describe("portrait preset management", () => {
	it("renames a preset and ignores blank names", () => {
		const original = preset();
		expect(
			renamePortraitPreset({
				presets: [original],
				id: original.id,
				name: "  新名  ",
			})[0].name
		).toBe("新名");
		expect(
			renamePortraitPreset({ presets: [original], id: original.id, name: "  " })
		).toEqual([original]);
	});

	it("overwrites values while keeping identity", () => {
		const original = preset();
		const [updated] = overwritePortraitPreset({
			presets: [original],
			id: original.id,
			adjustments: { enabled: true, values: { face_adjust_Smooth: 90 } },
		});
		expect(updated.id).toBe(original.id);
		expect(updated.name).toBe(original.name);
		expect(updated.createdAt).toBe(original.createdAt);
		expect(updated.values).toEqual({ face_adjust_Smooth: 90 });
	});

	it("keeps the previous thumbnail when the overwrite supplies none", () => {
		const original = createPortraitPreset({
			adjustments,
			name: "带图",
			scope: "face",
			thumbnailDataUrl: thumbnail,
		});
		const [updated] = overwritePortraitPreset({
			presets: [original],
			id: original.id,
			adjustments,
		});
		expect(updated.thumbnailDataUrl).toBe(thumbnail);
	});

	it("bounds thumbnails to small image data URLs", () => {
		expect(isPortraitPresetThumbnail(thumbnail)).toBe(true);
		expect(isPortraitPresetThumbnail("https://example.com/a.png")).toBe(false);
		expect(
			isPortraitPresetThumbnail("data:text/html;base64,PHNjcmlwdD4=")
		).toBe(false);
		expect(
			isPortraitPresetThumbnail(`data:image/png;base64,${"A".repeat(70_000)}`)
		).toBe(false);
	});

	it("round-trips an export and regenerates ids", () => {
		const original = preset("导出用");
		const parsed = parsePortraitPresetExport({
			value: JSON.parse(serializePortraitPresets({ presets: [original] })),
		});
		expect(parsed).toHaveLength(1);
		expect(parsed[0].name).toBe("导出用");
		expect(parsed[0].values).toEqual(original.values);
		// A fresh id keeps an import from silently replacing an existing preset.
		expect(parsed[0].id).not.toBe(original.id);
	});

	it("rejects files that are not supported preset exports", () => {
		expect(() => parsePortraitPresetExport({ value: null })).toThrow(
			"格式无效"
		);
		expect(() =>
			parsePortraitPresetExport({ value: { kind: "something-else" } })
		).toThrow("不是 QCut");
		expect(() =>
			parsePortraitPresetExport({
				value: { kind: "qcut-portrait-presets", version: 999, presets: [] },
			})
		).toThrow("版本不受支持");
		expect(() =>
			parsePortraitPresetExport({
				value: {
					kind: "qcut-portrait-presets",
					version: PORTRAIT_PRESET_EXPORT_VERSION,
					presets: [{ bogus: true }],
				},
			})
		).toThrow("没有可用的预设");
	});
});
