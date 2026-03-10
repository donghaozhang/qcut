import { describe, it, expect } from "vitest";
import {
	isMediaElement,
	isTextElement,
	isStickerElement,
	isCaptionElement,
	isRemotionElement,
	isMarkdownElement,
	getRemotionElements,
} from "../timeline/type-guards.js";
import type { TimelineElement, TimelineTrack } from "../types/timeline.js";

const mediaEl: TimelineElement = {
	id: "1",
	name: "Video",
	type: "media",
	mediaId: "m1",
	duration: 10,
	startTime: 0,
	trimStart: 0,
	trimEnd: 0,
};

const textEl: TimelineElement = {
	id: "2",
	name: "Title",
	type: "text",
	content: "Hello",
	fontSize: 24,
	fontFamily: "Arial",
	color: "#fff",
	backgroundColor: "transparent",
	textAlign: "center",
	fontWeight: "normal",
	fontStyle: "normal",
	textDecoration: "none",
	x: 0,
	y: 0,
	rotation: 0,
	opacity: 1,
	duration: 5,
	startTime: 0,
	trimStart: 0,
	trimEnd: 0,
};

const remotionEl: TimelineElement = {
	id: "3",
	name: "Animation",
	type: "remotion",
	componentId: "comp1",
	props: {},
	renderMode: "live",
	duration: 5,
	startTime: 2,
	trimStart: 0,
	trimEnd: 0,
};

describe("type guards", () => {
	it("isMediaElement", () => {
		expect(isMediaElement(mediaEl)).toBe(true);
		expect(isMediaElement(textEl)).toBe(false);
	});

	it("isTextElement", () => {
		expect(isTextElement(textEl)).toBe(true);
		expect(isTextElement(mediaEl)).toBe(false);
	});

	it("isRemotionElement", () => {
		expect(isRemotionElement(remotionEl)).toBe(true);
		expect(isRemotionElement(mediaEl)).toBe(false);
	});
});

describe("getRemotionElements", () => {
	it("collects remotion elements from tracks", () => {
		const tracks: TimelineTrack[] = [
			{ id: "t1", name: "Media", type: "media", elements: [mediaEl] },
			{
				id: "t2",
				name: "Remotion",
				type: "remotion",
				elements: [remotionEl],
			},
		];
		const result = getRemotionElements(tracks);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("3");
	});

	it("returns empty for tracks with no remotion elements", () => {
		const tracks: TimelineTrack[] = [
			{ id: "t1", name: "Media", type: "media", elements: [mediaEl] },
		];
		expect(getRemotionElements(tracks)).toHaveLength(0);
	});
});
