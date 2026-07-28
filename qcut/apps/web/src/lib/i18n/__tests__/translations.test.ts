import { describe, expect, it } from "vitest";
import { translate } from "../index";
import {
	SUPPORTED_LOCALES,
	TRANSLATIONS,
	type TranslationKey,
} from "../translations";

describe("interface translations", () => {
	it("keeps every locale on the same key set", () => {
		const referenceKeys = Object.keys(TRANSLATIONS.en).sort();
		for (const locale of SUPPORTED_LOCALES) {
			expect(Object.keys(TRANSLATIONS[locale]).sort()).toEqual(referenceKeys);
		}
	});

	it("interpolates values in both languages", () => {
		const key = "timeline.toast.audioAligned" satisfies TranslationKey;
		expect(translate({ locale: "zh", key, values: { confidence: 96 } })).toBe(
			"音频已对齐（置信度 96%）"
		);
		expect(translate({ locale: "en", key, values: { confidence: 96 } })).toBe(
			"Audio aligned (96% confidence)"
		);

		const trackingKey =
			"stickerProperties.tracking.create" satisfies TranslationKey;
		expect(
			translate({
				locale: "zh",
				key: trackingKey,
				values: { name: "采访视频" },
			})
		).toBe("在采访视频上创建跟踪");
		expect(
			translate({
				locale: "en",
				key: trackingKey,
				values: { name: "Interview" },
			})
		).toBe("Track on Interview");
	});

	it("keeps localized English feature copy free of Chinese characters", () => {
		const localizedPrefixes = [
			"textLibrary.",
			"audioLibrary.",
			"audioProperties.",
			"textProperties.",
			"review.",
			"taskCenter.",
			"librarySync.",
		];
		for (const [key, value] of Object.entries(TRANSLATIONS.en)) {
			if (!localizedPrefixes.some((prefix) => key.startsWith(prefix))) continue;
			expect(value).not.toMatch(/[\u3400-\u9fff]/);
		}
	});
});
