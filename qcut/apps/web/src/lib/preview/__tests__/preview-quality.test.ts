import { describe, expect, it } from "vitest";
import {
	PREVIEW_QUALITY_OPTIONS,
	getPreviewQualityOption,
} from "../preview-quality";

describe("preview quality options", () => {
	it("matches Jianying-style tiers with proxy dimensions", () => {
		expect(PREVIEW_QUALITY_OPTIONS.map((option) => option.value)).toEqual([
			"original",
			"clear",
			"smooth",
			"low",
		]);
		expect(getPreviewQualityOption({ quality: "original" }).forceProxy).toBe(
			false
		);
		expect(getPreviewQualityOption({ quality: "clear" }).maxDimension).toBe(
			1280
		);
		expect(getPreviewQualityOption({ quality: "smooth" }).maxDimension).toBe(
			854
		);
		expect(getPreviewQualityOption({ quality: "low" }).maxDimension).toBe(480);
	});
});
