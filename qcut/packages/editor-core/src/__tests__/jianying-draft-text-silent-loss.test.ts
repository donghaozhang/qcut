import { describe, expect, it } from "vitest";
import { buildJianyingDraft } from "../jianying-draft/index.js";
import type { QCutDraftExportSnapshotV1 } from "../jianying-draft/types.js";
import type {
	CaptionElement,
	TextElement,
	TimelineTrack,
} from "../types/timeline.js";

function createSnapshot({
	element,
	type,
}: {
	element: CaptionElement | TextElement;
	type: "captions" | "text";
}): QCutDraftExportSnapshotV1 {
	const track: TimelineTrack = {
		elements: [element],
		id: `${type}-track`,
		name: `${type}-track`,
		order: 0,
		type,
	};
	return {
		media: [],
		project: {
			backgroundColor: "#00000000",
			backgroundType: "color",
			fps: 30,
			height: 1080,
			id: "text-silent-loss",
			name: "Text silent loss",
			sceneId: "text-silent-loss-scene",
			width: 1920,
		},
		schemaVersion: 1,
		timelineDurationByElementId: {},
		tracks: [track],
	};
}

function createTextElement(): TextElement {
	return {
		animationDelay: 0.25,
		animationDuration: 1.2,
		animationType: "none",
		backgroundColor: "transparent",
		color: "#ffffff",
		colorLabel: "violet",
		content: "Visible text",
		duration: 3,
		fontFamily: "Arial",
		fontSize: 64,
		fontStyle: "normal",
		fontWeight: "normal",
		height: 180,
		id: "text-1",
		name: "Opening title",
		opacity: 1,
		rotation: 0,
		startTime: 0,
		textAlign: "center",
		textDecoration: "none",
		trimEnd: 0,
		trimStart: 0,
		type: "text",
		x: 0,
		y: 0,
	};
}

function createCaptionElement(): CaptionElement {
	return {
		colorLabel: "blue",
		confidence: 0.91,
		duration: 3,
		height: 180,
		id: "caption-1",
		language: "zh-CN",
		name: "Transcript line 1",
		source: "transcription",
		startTime: 0,
		style: {
			animationDelay: 0.2,
			animationDuration: 1.2,
			animationType: "none",
			backgroundColor: "#000000",
			bgOpacity: 0.8,
			bold: false,
			fontColor: "#ffffff",
			fontFamily: "Arial",
			fontOpacity: 1,
			fontSize: 48,
			italic: false,
			letterSpacing: 0,
			lineSpacing: 1.4,
			outlineColor: "#000000",
			outlineWidth: 2,
			position: { align: "top", x: 50, y: 10 },
			shadowColor: "#000000",
			shadowOffset: { x: 1, y: 1 },
			textAlign: "center",
			underline: false,
		},
		text: "字幕",
		trimEnd: 0,
		trimStart: 0,
		type: "captions",
		width: 960,
		x: 12,
		y: 34,
	};
}

describe("JianYing text and caption silent-loss policy", () => {
	it("blocks text height and warns for dropped organization and inactive animation settings", () => {
		const result = buildJianyingDraft({
			draftOutputDirectory: "/exports/text-silent-loss",
			snapshot: createSnapshot({ element: createTextElement(), type: "text" }),
			targetPlatform: "macos",
		});

		expect(result.canWrite).toBe(false);
		expect(result.content.materials.texts).toEqual([]);
		expect(result.issues).toEqual([
			{
				code: "UNSUPPORTED_TEXT_METADATA",
				elementId: "text-1",
				message:
					"Custom text and caption element names are not represented in the draft.",
				severity: "warning",
				trackId: "text-track",
			},
			{
				code: "UNSUPPORTED_TEXT_METADATA",
				elementId: "text-1",
				message:
					"Text and caption color labels are not represented in the draft.",
				severity: "warning",
				trackId: "text-track",
			},
			{
				code: "UNSUPPORTED_TEXT_GEOMETRY",
				elementId: "text-1",
				message: "Explicit text height needs a verified JianYing mapping.",
				severity: "error",
				trackId: "text-track",
			},
			{
				code: "UNSUPPORTED_TEXT_METADATA",
				elementId: "text-1",
				message:
					"Inactive legacy text animation duration or delay is not preserved.",
				severity: "warning",
				trackId: "text-track",
			},
		]);
	});

	it("blocks caption geometry and alignment while warning for dropped metadata", () => {
		const result = buildJianyingDraft({
			draftOutputDirectory: "/exports/caption-silent-loss",
			snapshot: createSnapshot({
				element: createCaptionElement(),
				type: "captions",
			}),
			targetPlatform: "macos",
		});

		expect(result.canWrite).toBe(false);
		expect(result.content.materials.texts).toEqual([]);
		expect(result.issues).toEqual([
			{
				code: "UNSUPPORTED_TEXT_METADATA",
				elementId: "caption-1",
				message:
					"Custom text and caption element names are not represented in the draft.",
				severity: "warning",
				trackId: "captions-track",
			},
			{
				code: "UNSUPPORTED_TEXT_METADATA",
				elementId: "caption-1",
				message:
					"Text and caption color labels are not represented in the draft.",
				severity: "warning",
				trackId: "captions-track",
			},
			{
				code: "UNSUPPORTED_CAPTION_GEOMETRY",
				elementId: "caption-1",
				message:
					"Explicit caption element position or bounds need a verified JianYing mapping.",
				severity: "error",
				trackId: "captions-track",
			},
			{
				code: "UNSUPPORTED_CAPTION_GEOMETRY",
				elementId: "caption-1",
				message: "Top and center caption alignment are not mapped yet.",
				severity: "error",
				trackId: "captions-track",
			},
			{
				code: "UNSUPPORTED_TEXT_METADATA",
				elementId: "caption-1",
				message:
					"Inactive caption animation duration or delay is not preserved.",
				severity: "warning",
				trackId: "captions-track",
			},
			{
				code: "UNSUPPORTED_CAPTION_METADATA",
				elementId: "caption-1",
				message:
					"Caption language, confidence, and source metadata are not represented in the draft.",
				severity: "warning",
				trackId: "captions-track",
			},
		]);
	});
});
