import { describe, expect, it } from "vitest";
import {
	collectTimelineEffectsByTarget,
	getEffectRenderWindow,
	getTimelineEffectsAtTime,
	type EffectElement,
	type EffectInstance,
	type MediaElement,
	type TimelineTrack,
} from "../index";

function effect({
	id,
	enabled = true,
}: {
	id: string;
	enabled?: boolean;
}): EffectInstance {
	return {
		id,
		name: id,
		effectType: "brightness",
		parameters: { brightness: 10 },
		duration: 0,
		enabled,
	};
}

function mediaElement({
	id = "clip",
	startTime = 10,
	duration = 8,
	effects,
}: {
	id?: string;
	startTime?: number;
	duration?: number;
	effects?: EffectInstance[];
} = {}): MediaElement {
	return {
		id,
		type: "media",
		name: id,
		mediaId: `media-${id}`,
		startTime,
		duration,
		trimStart: 0,
		trimEnd: 0,
		effects,
	};
}

function effectElement({
	id,
	targetElementId = "clip",
	startTime,
	duration,
	enabled = true,
}: {
	id: string;
	targetElementId?: string;
	startTime: number;
	duration: number;
	enabled?: boolean;
}): EffectElement {
	return {
		id: `element-${id}`,
		type: "effect",
		name: id,
		targetElementId,
		startTime,
		duration,
		trimStart: 0,
		trimEnd: 0,
		effect: effect({ id, enabled }),
	};
}

function track({
	id,
	type,
	order,
	elements,
	hidden,
}: Pick<TimelineTrack, "id" | "type" | "elements"> &
	Partial<Pick<TimelineTrack, "order" | "hidden">>): TimelineTrack {
	return { id, name: id, type, order, elements, hidden };
}

describe("timeline effect elements", () => {
	it("combines legacy and independent ranges in visual layer order", () => {
		const target = mediaElement({ effects: [effect({ id: "legacy" })] });
		const effects = collectTimelineEffectsByTarget({
			tracks: [
				track({
					id: "top",
					type: "effect",
					order: 0,
					elements: [effectElement({ id: "top", startTime: 12, duration: 4 })],
				}),
				track({
					id: "bottom",
					type: "effect",
					order: 1,
					elements: [
						effectElement({ id: "bottom", startTime: 9, duration: 3 }),
					],
				}),
				track({
					id: "media",
					type: "media",
					order: 2,
					elements: [target],
				}),
			],
		}).get(target.id);

		expect(effects?.map((item) => item.id)).toEqual([
			"legacy",
			"bottom",
			"top",
		]);
		expect(effects?.[1]?.timelineRange).toEqual({
			startTime: 10,
			duration: 2,
		});
		expect(effects?.[2]?.timelineRange).toEqual({
			startTime: 12,
			duration: 4,
		});
	});

	it("ignores hidden, orphaned, and non-overlapping elements", () => {
		const target = mediaElement();
		const effects = collectTimelineEffectsByTarget({
			tracks: [
				track({ id: "media", type: "media", elements: [target] }),
				track({
					id: "hidden",
					type: "effect",
					hidden: true,
					elements: [
						effectElement({ id: "hidden", startTime: 10, duration: 2 }),
					],
				}),
				track({
					id: "effects",
					type: "effect",
					elements: [
						effectElement({
							id: "orphan",
							targetElementId: "missing",
							startTime: 10,
							duration: 2,
						}),
						effectElement({ id: "late", startTime: 20, duration: 2 }),
					],
				}),
			],
		});

		expect(effects.get(target.id)).toBeUndefined();
	});

	it("uses an end-exclusive boundary and ignores disabled effects", () => {
		const target = mediaElement();
		const tracks = [
			track({ id: "media", type: "media", elements: [target] }),
			track({
				id: "effects",
				type: "effect",
				elements: [
					effectElement({ id: "active", startTime: 12, duration: 2 }),
					effectElement({
						id: "disabled",
						startTime: 12,
						duration: 2,
						enabled: false,
					}),
				],
			}),
		];

		expect(
			getTimelineEffectsAtTime({ tracks, currentTime: 13 })
				.get(target.id)
				?.map((item) => item.id)
		).toEqual(["active"]);
		expect(
			getTimelineEffectsAtTime({ tracks, currentTime: 14 }).get(target.id)
		).toBeUndefined();
	});

	it("converts a global range to clip-local output time", () => {
		const target = mediaElement({ startTime: 10, duration: 8 });
		const scheduled = {
			...effect({ id: "scheduled" }),
			timelineRange: { startTime: 12.5, duration: 3 },
		};
		expect(getEffectRenderWindow({ effect: scheduled, target })).toEqual({
			startSeconds: 2.5,
			endSeconds: 5.5,
		});
		expect(
			getEffectRenderWindow({ effect: effect({ id: "legacy" }), target })
		).toBeUndefined();
	});
});
