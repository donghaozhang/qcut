import { describe, expect, it } from "vitest";
import { buildSmartPackagingPlan } from "../templates/index.js";

describe("buildSmartPackagingPlan", () => {
	it("builds deterministic actions from captions, beats, and touching shots", () => {
		const plan = buildSmartPackagingPlan({
			captions: [
				{ id: "c1", text: "Did you know?", startTime: 0.4, duration: 1.8 },
				{
					id: "c2",
					text: "This changes everything!",
					startTime: 3,
					duration: 2,
				},
				{ id: "c3", text: "More detail here", startTime: 6.5, duration: 2 },
			],
			beats: [
				{ timestamp: 0.5, strength: 0.9, downbeat: true },
				{ timestamp: 1, strength: 0.4 },
				{ timestamp: 3, strength: 0.8 },
				{ timestamp: 6, strength: 0.9, downbeat: true },
			],
			shots: [
				{
					id: "s1",
					trackId: "track",
					elementId: "m1",
					startTime: 0,
					endTime: 3,
				},
				{
					id: "s2",
					trackId: "track",
					elementId: "m2",
					startTime: 3,
					endTime: 6,
				},
				{
					id: "s3",
					trackId: "track",
					elementId: "m3",
					startTime: 6,
					endTime: 9,
				},
			],
		});

		expect(plan.sourceCounts).toEqual({ captions: 3, beats: 4, shots: 3 });
		expect(
			plan.actions.filter((action) => action.kind === "text")
		).toHaveLength(3);
		expect(
			plan.actions.filter((action) => action.kind === "transition")
		).toHaveLength(2);
		expect(
			plan.actions.filter((action) => action.kind === "zoom")
		).toHaveLength(3);
		expect(
			plan.actions.find((action) => action.kind === "transition")
		).toMatchObject({
			fromElementId: "m1",
			toElementId: "m2",
			startTime: 3,
			presetId: "dissolve",
		});
		expect(plan.warnings).toEqual([]);
	});

	it("spaces accent actions and honors limits", () => {
		const plan = buildSmartPackagingPlan({
			captions: [],
			beats: Array.from({ length: 20 }, (_, index) => ({
				timestamp: index * 0.25,
				strength: 1,
			})),
			shots: [],
			options: {
				addText: false,
				addZooms: false,
				addTransitions: false,
				maxStickers: 2,
				maxSoundEffects: 3,
			},
		});

		expect(
			plan.actions.filter((action) => action.kind === "sticker")
		).toHaveLength(2);
		expect(
			plan.actions.filter((action) => action.kind === "sound-effect")
		).toHaveLength(3);
	});

	it("keeps ineligible shots for zooms while excluding their transition pairs", () => {
		const plan = buildSmartPackagingPlan({
			captions: [],
			beats: [],
			shots: [
				{
					id: "video",
					trackId: "track",
					elementId: "video-element",
					startTime: 0,
					endTime: 2,
					transitionEligible: true,
				},
				{
					id: "image",
					trackId: "track",
					elementId: "image-element",
					startTime: 2,
					endTime: 4,
					transitionEligible: false,
				},
			],
			options: {
				addText: false,
				addStickers: false,
				addSoundEffects: false,
			},
		});

		expect(plan.sourceCounts.shots).toBe(2);
		expect(
			plan.actions.filter((action) => action.kind === "zoom")
		).toHaveLength(2);
		expect(
			plan.actions.filter((action) => action.kind === "transition")
		).toEqual([]);
	});

	it("uses caption starts when no beat analysis exists", () => {
		const plan = buildSmartPackagingPlan({
			captions: [
				{ id: "c1", text: "First useful line", startTime: 1, duration: 2 },
				{ id: "c2", text: "Second useful line", startTime: 4, duration: 2 },
			],
			beats: [],
			shots: [],
			options: { addZooms: false, addTransitions: false },
		});

		expect(
			plan.actions
				.filter((action) => action.kind === "sticker")
				.map((action) => action.startTime)
		).toEqual([1, 4]);
	});

	it("reports missing source data without producing invalid actions", () => {
		const plan = buildSmartPackagingPlan({
			captions: [{ id: "bad", text: "", startTime: Number.NaN, duration: -1 }],
			beats: [{ timestamp: Number.NaN }],
			shots: [
				{
					id: "bad-shot",
					trackId: "track",
					elementId: "media",
					startTime: 2,
					endTime: 1,
				},
			],
		});

		expect(plan.actions).toEqual([]);
		expect(plan.warnings).toHaveLength(5);
	});
});
