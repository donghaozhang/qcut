import { describe, expect, it } from "vitest";
import { buildCompositionPlan } from "../timeline/composition-plan.js";
import type {
	MediaElement,
	TextElement,
	TimelineElement,
	TimelineTrack,
} from "../types/timeline.js";

function createTextElement({
	id,
	startTime = 0,
	duration = 5,
	hidden = false,
}: {
	id: string;
	startTime?: number;
	duration?: number;
	hidden?: boolean;
}): TextElement {
	return {
		id,
		name: id,
		type: "text",
		content: id,
		startTime,
		duration,
		trimStart: 0,
		trimEnd: 0,
		hidden,
		fontSize: 24,
		fontFamily: "Arial",
		color: "#ffffff",
		backgroundColor: "transparent",
		textAlign: "center",
		fontWeight: "normal",
		fontStyle: "normal",
		textDecoration: "none",
		x: 0,
		y: 0,
		rotation: 0,
		opacity: 1,
	};
}

function createMediaElement({
	id,
	startTime,
	duration,
}: {
	id: string;
	startTime: number;
	duration: number;
}): MediaElement {
	return {
		id,
		name: id,
		type: "media",
		mediaId: `${id}-media`,
		startTime,
		duration,
		trimStart: 0,
		trimEnd: 0,
	};
}

function createTrack({
	id,
	order,
	type = "text",
	elements,
	hidden = false,
}: {
	id: string;
	order: number;
	type?: TimelineTrack["type"];
	elements: TimelineElement[];
	hidden?: boolean;
}): TimelineTrack {
	return { id, name: id, type, order, elements, hidden };
}

describe("buildCompositionPlan", () => {
	it("can force transition partner elements active outside their normal range", () => {
		const outgoing = createMediaElement({
			id: "outgoing",
			startTime: 0,
			duration: 2,
		});
		const incoming = createMediaElement({
			id: "incoming",
			startTime: 2,
			duration: 2,
		});
		const track = createTrack({
			id: "media-track",
			order: 0,
			type: "media",
			elements: [outgoing, incoming],
		});

		const plan = buildCompositionPlan({
			tracks: [track],
			currentTime: 1.8,
			forceActiveElementIds: new Set(["incoming"]),
		});

		expect(plan.visualLayers.map(({ element: item }) => item.id)).toEqual([
			"outgoing",
			"incoming",
		]);
	});

	it("draws the incoming transition clip above the outgoing clip regardless of storage order", () => {
		const outgoing = createMediaElement({
			id: "outgoing",
			startTime: 0,
			duration: 2,
		});
		const incoming = createMediaElement({
			id: "incoming",
			startTime: 2,
			duration: 2,
		});
		const track = createTrack({
			id: "media-track",
			order: 0,
			type: "media",
			elements: [incoming, outgoing],
		});

		const plan = buildCompositionPlan({
			tracks: [track],
			currentTime: 1.8,
			forceActiveElementIds: new Set(["incoming"]),
		});

		expect(
			plan.visualLayers.map(({ element: item, elementOrder }) => ({
				id: item.id,
				elementOrder,
			}))
		).toEqual([
			{ id: "outgoing", elementOrder: 1 },
			{ id: "incoming", elementOrder: 0 },
		]);
	});

	it("draws lower UI tracks first and top tracks last", () => {
		const top = createTrack({
			id: "top",
			order: 0,
			elements: [createTextElement({ id: "top-element" })],
		});
		const bottom = createTrack({
			id: "bottom",
			order: 1,
			elements: [createTextElement({ id: "bottom-element" })],
		});

		const plan = buildCompositionPlan({
			tracks: [top, bottom],
			currentTime: 1,
		});

		expect(plan.tracks.map((track) => track.id)).toEqual(["top", "bottom"]);
		expect(plan.visualLayers.map((layer) => layer.element.id)).toEqual([
			"bottom-element",
			"top-element",
		]);
		expect(plan.visualLayers.map((layer) => layer.drawOrder)).toEqual([0, 1]);
	});

	it("filters inactive, hidden element, and hidden track layers", () => {
		const track = createTrack({
			id: "visible",
			order: 0,
			elements: [
				createTextElement({ id: "active", startTime: 1, duration: 3 }),
				createTextElement({ id: "inactive", startTime: 5, duration: 2 }),
				createTextElement({ id: "hidden", hidden: true }),
			],
		});
		const hiddenTrack = createTrack({
			id: "hidden-track",
			order: 1,
			hidden: true,
			elements: [createTextElement({ id: "hidden-track-element" })],
		});

		const plan = buildCompositionPlan({
			tracks: [track, hiddenTrack],
			currentTime: 2,
		});

		expect(plan.visualLayers.map((layer) => layer.element.id)).toEqual([
			"active",
		]);
	});

	it("keeps audio elements out of the visual stack", () => {
		const audioElement = {
			...createTextElement({ id: "audio" }),
			type: "media" as const,
			mediaId: "audio-media",
		};
		const audioTrack = createTrack({
			id: "audio-track",
			order: 0,
			type: "audio",
			elements: [audioElement],
		});

		const plan = buildCompositionPlan({ tracks: [audioTrack], currentTime: 1 });

		expect(plan.visualLayers).toHaveLength(0);
		expect(plan.audioElements.map(({ element }) => element.id)).toEqual([
			"audio",
		]);
	});

	it("accepts a timing resolver for speed-aware media duration", () => {
		const element = createTextElement({ id: "speed-aware", duration: 10 });
		const track = createTrack({ id: "track", order: 0, elements: [element] });

		const plan = buildCompositionPlan({
			tracks: [track],
			currentTime: 3,
			getElementDuration: () => 2,
		});

		expect(plan.visualLayers).toHaveLength(0);
	});
});
