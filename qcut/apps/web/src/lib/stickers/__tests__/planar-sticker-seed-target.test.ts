import { describe, expect, it } from "vitest";
import { resolvePlanarSourceDisplaySize } from "../planar-sticker-seed-target";

describe("planar sticker seed target", () => {
	it("resolves one source display size for seeding and analysis", () => {
		expect(
			resolvePlanarSourceDisplaySize({
				sourceElement: { height: 720, width: 1280 },
				sourceMedia: {},
			})
		).toEqual({ height: 720, width: 1280 });
		expect(
			resolvePlanarSourceDisplaySize({
				sourceElement: { height: 720, width: 1280 },
				sourceMedia: { height: 2160, width: 3840 },
			})
		).toEqual({ height: 2160, width: 3840 });
		expect(
			resolvePlanarSourceDisplaySize({
				sourceElement: {},
				sourceMedia: {},
			})
		).toEqual({ height: 1080, width: 1920 });
	});
});
