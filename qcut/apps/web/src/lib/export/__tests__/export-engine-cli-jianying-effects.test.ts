import { describe, expect, it } from "vitest";
import type { TimelineTrack } from "@/types/timeline";
import { collectJianyingEffectRequests } from "../export-engine-cli-jianying-effects";

function trackWithEffects({
	effects,
	startTime = 0,
	duration = 5,
}: {
	effects: unknown[];
	startTime?: number;
	duration?: number;
}) {
	return [
		{
			id: "track-1",
			name: "Track",
			type: "media",
			muted: false,
			elements: [
				{
					id: "element-1",
					type: "media",
					mediaId: "media-1",
					name: "clip",
					startTime,
					duration,
					trimStart: 0,
					trimEnd: 0,
					effects,
				},
			],
		},
	] as unknown as TimelineTrack[];
}

describe("collectJianyingEffectRequests", () => {
	it("ignores effects rendered by QCut's own stages", () => {
		const tracks = trackWithEffects({
			effects: [
				{
					id: "a",
					presetId: "dynamic-camera-shake",
					name: "Shake",
					effectType: "motion",
					parameters: {},
					duration: 1,
					enabled: true,
				},
			],
		});

		expect(collectJianyingEffectRequests({ tracks })).toEqual([]);
	});

	it("offsets a clip-local range by the clip's timeline position", () => {
		const tracks = trackWithEffects({
			startTime: 4,
			effects: [
				{
					id: "a",
					presetId: "jy-effect-7399495765409746216",
					name: "抖动",
					effectType: "motion",
					parameters: {},
					duration: 3,
					enabled: true,
					engine: "jianying-local",
					packageHash: "42112d384ec900b128be844abd220835",
					timelineRange: { startTime: 1.5, duration: 2 },
				},
			],
		});

		expect(collectJianyingEffectRequests({ tracks })).toEqual([
			{
				effectId: "jy-effect-7399495765409746216",
				packageHash: "42112d384ec900b128be844abd220835",
				startSeconds: 5.5,
				durationSeconds: 2,
			},
		]);
	});

	it("skips disabled effects and those missing a package", () => {
		const tracks = trackWithEffects({
			effects: [
				{
					id: "a",
					presetId: "jy-effect-1",
					name: "off",
					effectType: "motion",
					parameters: {},
					duration: 1,
					enabled: false,
					engine: "jianying-local",
					packageHash: "hash",
				},
				{
					id: "b",
					presetId: "jy-effect-2",
					name: "no package",
					effectType: "motion",
					parameters: {},
					duration: 1,
					enabled: true,
					engine: "jianying-local",
				},
			],
		});

		expect(collectJianyingEffectRequests({ tracks })).toEqual([]);
	});
});
