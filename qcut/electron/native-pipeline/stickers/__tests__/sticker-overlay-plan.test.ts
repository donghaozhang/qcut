import { describe, expect, test } from "vitest";
import { parseStickerOverlayPlan } from "../sticker-overlay-plan";

describe("sticker overlay plan", () => {
	test("applies restrained animation and audio defaults", () => {
		const plan = parseStickerOverlayPlan({
			value: {
				stickers: [
					{
						stickerId: "fluent-emoji:warning",
						startTime: 2,
						duration: 1.5,
						x: 40,
						y: 80,
						soundEffect: { source: "pop.ogg" },
					},
				],
			},
		});

		expect(plan.version).toBe(1);
		expect(plan.stickers[0]).toMatchObject({
			width: 240,
			rotation: 0,
			opacity: 1,
			fadeIn: 0.12,
			fadeOut: 0.18,
			soundEffect: {
				volume: 0.18,
				trimStart: 0,
			},
		});
	});

	test("requires one source and keeps fades inside the cue", () => {
		expect(() =>
			parseStickerOverlayPlan({
				value: {
					stickers: [
						{
							startTime: 0,
							duration: 1,
							x: 0,
							y: 0,
						},
					],
				},
			})
		).toThrow("exactly one");
		expect(() =>
			parseStickerOverlayPlan({
				value: {
					stickers: [
						{
							stickerId: "fluent-emoji:warning",
							source: "warning.png",
							startTime: 0,
							duration: 1,
							x: 0,
							y: 0,
						},
					],
				},
			})
		).toThrow("exactly one");
		expect(() =>
			parseStickerOverlayPlan({
				value: {
					stickers: [
						{
							stickerId: "fluent-emoji:warning",
							startTime: 0,
							duration: 0.5,
							x: 0,
							y: 0,
							fadeIn: 0.3,
							fadeOut: 0.3,
						},
					],
				},
			})
		).toThrow("cannot exceed");
	});
});
