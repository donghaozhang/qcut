import { describe, expect, it } from "vitest";
import { createTrack } from "@qcut/editor-core";
import {
	buildAppliedTemplateTimeline,
	migrateTemplateInstanceInTracks,
	reflowTemplateInstanceInTracks,
	replaceTemplateSlotInTracks,
} from "../timeline-template-application";
import { getTimelineTemplate } from "../template-registry";

const mediaItems = [
	{ id: "video-a", name: "Opening.mov", type: "video" as const, duration: 8 },
	{ id: "video-b", name: "B-roll.mov", type: "video" as const, duration: 8 },
	{
		id: "video-c",
		name: "Replacement.mov",
		type: "video" as const,
		duration: 8,
	},
];

function buildCreatorStory() {
	const template = getTimelineTemplate({ templateId: "creator-story" });
	if (!template) throw new Error("Missing creator story template");
	const result = buildAppliedTemplateTimeline({
		tracks: [createTrack("media")],
		template,
		instanceId: "instance-1",
		instanceStartTime: 12,
		aspectRatio: "9:16",
		mediaItems,
		values: {
			hero: { kind: "media", mediaId: "video-a" },
			broll: { kind: "media", mediaId: "video-b" },
			headline: { kind: "text", text: "Opening line" },
			secondary: { kind: "text", text: "Follow-up line" },
		},
	});
	return { result, template };
}

describe("timeline template application", () => {
	it("creates bound media and text elements in one instance", () => {
		const { result } = buildCreatorStory();
		const createdElements = result.tracks
			.flatMap((track) => track.elements)
			.filter(
				(element) => element.templateBinding?.instanceId === "instance-1"
			);

		expect(result.canvas).toEqual({ width: 1080, height: 1920 });
		expect(createdElements).toHaveLength(4);
		expect(createdElements.map((element) => element.startTime)).toEqual([
			12.35, 17.2, 12, 17,
		]);
		expect(
			createdElements.every(
				(element) => element.templateBinding?.aspectRatio === "9:16"
			)
		).toBe(true);
	});

	it("replaces a media slot without changing template timing", () => {
		const { result, template } = buildCreatorStory();
		const replaced = replaceTemplateSlotInTracks({
			tracks: result.tracks,
			template,
			instanceId: "instance-1",
			slotId: "hero",
			value: { kind: "media", mediaId: "video-c" },
			mediaItems,
		});
		const hero = replaced.tracks
			.flatMap((track) => track.elements)
			.find((element) => element.templateBinding?.slotId === "hero");

		expect(replaced.replacedCount).toBe(1);
		expect(hero).toMatchObject({
			type: "media",
			mediaId: "video-c",
			name: "Replacement.mov",
			startTime: 12,
			duration: 5,
		});
	});

	it("reflows an existing instance to another supported ratio", () => {
		const { result, template } = buildCreatorStory();
		const reflowed = reflowTemplateInstanceInTracks({
			tracks: result.tracks,
			template,
			instanceId: "instance-1",
			aspectRatio: "16:9",
		});
		const headline = reflowed.tracks
			.flatMap((track) => track.elements)
			.find((element) => element.templateBinding?.slotId === "headline");

		expect(reflowed.canvas).toEqual({ width: 1920, height: 1080 });
		expect(reflowed.updatedCount).toBe(4);
		expect(headline).toMatchObject({
			type: "text",
			y: -22,
			width: 1120,
			startTime: 12.35,
		});
		expect(headline?.templateBinding?.aspectRatio).toBe("16:9");
	});

	it("migrates legacy slot bindings to the current template version", () => {
		const { result, template } = buildCreatorStory();
		const legacyTracks = result.tracks.map((track) => ({
			...track,
			elements: track.elements.map((element) => {
				const binding = element.templateBinding;
				if (!binding || element.type !== "text") return element;
				return {
					...element,
					templateBinding: {
						...binding,
						templateVersion: "1.0.0",
						slotId: binding.slotId === "headline" ? "title" : "body",
					},
				};
			}),
		}));

		const migrated = migrateTemplateInstanceInTracks({
			tracks: legacyTracks,
			template,
			instanceId: "instance-1",
		});
		const migratedTextSlots = migrated.tracks
			.flatMap((track) => track.elements)
			.filter((element) => element.type === "text")
			.map((element) => element.templateBinding?.slotId);

		expect(migrated.migratedCount).toBe(2);
		expect(migratedTextSlots).toEqual(["headline", "secondary"]);
	});

	it("rejects missing or incompatible media slot values", () => {
		const template = getTimelineTemplate({ templateId: "creator-story" });
		if (!template) throw new Error("Missing creator story template");
		expect(() =>
			buildAppliedTemplateTimeline({
				tracks: [],
				template,
				mediaItems: [
					{ id: "audio", name: "Audio.wav", type: "audio", duration: 10 },
				],
				values: {
					hero: { kind: "media", mediaId: "audio" },
					broll: { kind: "media", mediaId: "missing" },
					headline: { kind: "text", text: "Headline" },
					secondary: { kind: "text", text: "Secondary" },
				},
			})
		).toThrow("does not accept audio");
	});
});
