import { describe, expect, it } from "vitest";
import { calculateVideoObjectGraphSize } from "../jianying-person-cutout/video-object-runtime.js";

describe("video-object graph sizing", () => {
	it("matches Jianying's 512-pixel portrait and landscape graph inputs", () => {
		expect(calculateVideoObjectGraphSize({ height: 640, width: 360 })).toEqual({
			height: 512,
			width: 288,
		});
		expect(
			calculateVideoObjectGraphSize({ height: 1080, width: 1920 })
		).toEqual({
			height: 288,
			width: 512,
		});
	});

	it("keeps odd aspect ratios on even texture dimensions", () => {
		expect(calculateVideoObjectGraphSize({ height: 333, width: 1000 })).toEqual(
			{
				height: 170,
				width: 512,
			}
		);
	});

	it("rejects invalid source dimensions", () => {
		expect(() =>
			calculateVideoObjectGraphSize({ height: 0, width: 1920 })
		).toThrow("视频尺寸无效");
	});
});
