import { describe, expect, it } from "vitest";
import {
	mediaTicksToSeconds,
	mediaTimeToTicks,
} from "../sticker-lab/runtime-media-time.js";

describe("Sticker Lab runtime media time", () => {
	it("round-trips representable fixed-point frame boundaries", () => {
		const tickValues = [
			0n,
			1n,
			-1n,
			999_999_999_999_999n,
			-999_999_999_999_999n,
			1_000_000_000_000_000n,
			-1_000_000_000_000_000n,
			1_860_000_000_000_000n,
			-1_860_000_000_000_000n,
		];

		for (const ticks of tickValues) {
			expect(
				mediaTimeToTicks({ seconds: mediaTicksToSeconds({ ticks }) })
			).toBe(ticks);
		}
	});

	it("preserves scientific-notation inputs within number range", () => {
		for (const seconds of [
			1e-15,
			-1e-15,
			1e20,
			-1e20,
			Number.MAX_VALUE,
			-Number.MAX_VALUE,
		]) {
			const ticks = mediaTimeToTicks({ seconds });
			expect(mediaTicksToSeconds({ ticks })).toBe(seconds);
		}
	});

	it("floors sub-tick values toward negative infinity", () => {
		expect(mediaTimeToTicks({ seconds: Number.MIN_VALUE })).toBe(0n);
		expect(mediaTimeToTicks({ seconds: -Number.MIN_VALUE })).toBe(-1n);
	});
});
