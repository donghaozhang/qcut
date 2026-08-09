import { describe, expect, it } from "vitest";
import { buildJianyingRawDecodeFilter } from "../jianying-transition/video-filters.js";

describe("buildJianyingRawDecodeFilter", () => {
	it("converts to RGBA before resizing to preserve threshold-sensitive colors", () => {
		const filter = buildJianyingRawDecodeFilter({
			fps: 30,
			width: 3840,
			height: 2160,
		});

		expect(filter).toBe(
			"fps=30,format=rgba,scale=3840:2160:force_original_aspect_ratio=decrease:flags=lanczos,pad=3840:2160:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1"
		);
	});
});
