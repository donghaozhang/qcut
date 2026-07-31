import { describe, expect, it } from "vitest";
import {
	buildJianyingDraft,
	validateJianyingDraftContent,
} from "../jianying-draft/index.js";
import type {
	QCutDraftExportSnapshotV1,
	JianyingDraftContent,
} from "../jianying-draft/types.js";
import type {
	CaptionElement,
	TextElement,
	TimelineTrack,
} from "../types/timeline.js";

function createTextElement({
	id = "text-1",
}: {
	id?: string;
} = {}): TextElement {
	return {
		backgroundColor: "transparent",
		color: "#ffffff",
		content: "A剪🎬",
		duration: 3,
		fontFamily: "Arial",
		fontSize: 64,
		fontStyle: "normal",
		fontWeight: "normal",
		id,
		name: id,
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

function createCaptionElement({
	id = "caption-1",
}: {
	id?: string;
} = {}): CaptionElement {
	return {
		duration: 2,
		id,
		language: "zh-CN",
		name: id,
		source: "manual",
		startTime: 0,
		text: "字幕🎬",
		trimEnd: 0,
		trimStart: 0,
		type: "captions",
	};
}

function createTrack({
	element,
	id,
	type,
}: {
	element: CaptionElement | TextElement;
	id: string;
	type: "captions" | "text";
}): TimelineTrack {
	return {
		elements: [element],
		id,
		name: id,
		order: 0,
		type,
	};
}

function createSnapshot({
	tracks,
}: {
	tracks: TimelineTrack[];
}): QCutDraftExportSnapshotV1 {
	return {
		media: [],
		project: {
			backgroundColor: "#00000000",
			backgroundType: "color",
			fps: 30,
			height: 1080,
			id: "project-text",
			name: "Text Interop",
			sceneId: "scene-text",
			width: 1920,
		},
		schemaVersion: 1,
		timelineDurationByElementId: {},
		tracks,
	};
}

function parseTextContent({ content }: { content: string }): {
	styles: Array<{
		bold: boolean;
		fill: {
			content: { solid: { alpha: number; color: number[] } };
		};
		italic: boolean;
		range: number[];
		shadows: unknown[];
		size: number;
		strokes: unknown[];
		underline: boolean;
	}>;
	text: string;
} {
	return JSON.parse(content) as ReturnType<typeof parseTextContent>;
}

describe("JianYing text and caption mapping", () => {
	it("maps native text timing, transform, UTF-16 code-unit range, and basic decoration", () => {
		const element: TextElement = {
			...createTextElement(),
			backgroundColor: "rgba(0, 0, 0, 0.5)",
			backgroundOpacity: 0.8,
			color: "#336699cc",
			fontStyle: "italic",
			fontWeight: "bold",
			opacity: 0.75,
			rotation: 12,
			shadowColor: "#112233",
			shadowOffsetX: 3,
			shadowOffsetY: 4,
			shadowOpacity: 0.6,
			startTime: 1.25,
			strokeColor: "#ff0000",
			strokeOpacity: 0.5,
			strokeWidth: 4,
			textAlign: "right",
			textDecoration: "underline",
			trimEnd: 0.25,
			trimStart: 0.25,
			width: 960,
			x: 96,
			y: 54,
		};
		const result = buildJianyingDraft({
			draftOutputDirectory: "/exports/text",
			snapshot: createSnapshot({
				tracks: [createTrack({ element, id: "text-track", type: "text" })],
			}),
			targetPlatform: "macos",
		});

		expect(result.canWrite).toBe(true);
		expect(result.content.tracks[0]?.type).toBe("text");
		expect(result.content.tracks[0]?.segments[0]).toMatchObject({
			clip: {
				alpha: 1,
				rotation: 12,
				transform: { x: 0.1, y: -0.1 },
			},
			source_timerange: { duration: 2_500_000, start: 0 },
			target_timerange: { duration: 2_500_000, start: 1_250_000 },
		});
		const material = result.content.materials.texts[0];
		expect(material).toMatchObject({
			alignment: 2,
			background_alpha: 0.4,
			check_flag: 63,
			font_size: 8,
			force_apply_line_max_width: true,
			global_alpha: 0.75,
			line_max_width: 0.5,
			text_color: "#336699",
			type: "text",
		});
		const content = parseTextContent({ content: material?.content ?? "" });
		expect(content.text).toBe("A剪🎬");
		expect(content.styles[0]).toMatchObject({
			bold: true,
			fill: { content: { solid: { alpha: 0.8 } } },
			italic: true,
			range: [0, 4],
			size: 8,
			underline: true,
		});
		expect(content.styles[0]?.strokes).toHaveLength(1);
		expect(content.styles[0]?.shadows).toHaveLength(1);
	});

	it("emits QCut captions as auto-wrapping subtitle materials", () => {
		const element = createCaptionElement();
		const result = buildJianyingDraft({
			draftOutputDirectory: "/exports/captions",
			snapshot: createSnapshot({
				tracks: [
					createTrack({
						element,
						id: "caption-track",
						type: "captions",
					}),
				],
			}),
			targetPlatform: "windows",
		});

		expect(result.canWrite).toBe(true);
		expect(result.content.tracks[0]?.type).toBe("text");
		expect(result.content.tracks[0]?.segments[0]?.clip).toMatchObject({
			transform: { x: 0, y: -0.8 },
		});
		const material = result.content.materials.texts[0];
		expect(material).toMatchObject({
			alignment: 1,
			font_size: 6,
			force_apply_line_max_width: false,
			line_max_width: 0.82,
			type: "subtitle",
		});
		expect(
			parseTextContent({ content: material?.content ?? "" })
		).toMatchObject({
			styles: [{ range: [0, 4] }],
			text: "字幕🎬",
		});
	});

	it("blocks every lossy advanced text feature", () => {
		const element: TextElement = {
			...createTextElement(),
			animationType: "fade",
			blendMode: "screen",
			curve: 20,
			glowOpacity: 0.8,
			keyframes: {
				opacity: [{ easing: "linear", frame: 0, id: "key-1", value: 0 }],
			},
			trackingTargetId: "subject-1",
		};
		const result = buildJianyingDraft({
			draftOutputDirectory: "/exports/text-warning",
			snapshot: createSnapshot({
				tracks: [createTrack({ element, id: "text-track", type: "text" })],
			}),
			targetPlatform: "macos",
		});

		expect(result.canWrite).toBe(false);
		expect(result.content.materials.texts).toEqual([]);
		expect(
			result.issues
				.filter(({ severity }) => severity === "error")
				.map(({ code }) => code)
		).toEqual([
			"UNSUPPORTED_TEXT_ANIMATION",
			"UNSUPPORTED_TEXT_KEYFRAMES",
			"UNSUPPORTED_TEXT_CURVE",
			"UNSUPPORTED_TEXT_GLOW",
			"UNSUPPORTED_TEXT_TRACKING",
			"UNSUPPORTED_TEXT_BLEND_MODE",
		]);
	});

	it("blocks caption word timing, karaoke, and animation", () => {
		const element: CaptionElement = {
			...createCaptionElement(),
			style: {
				animationType: "slide-up",
				karaokeMode: "word-highlight",
			} as CaptionElement["style"],
			words: [{ end: 0.5, id: "word-1", start: 0, text: "字幕", type: "word" }],
		};
		const result = buildJianyingDraft({
			draftOutputDirectory: "/exports/caption-warning",
			snapshot: createSnapshot({
				tracks: [
					createTrack({
						element,
						id: "caption-track",
						type: "captions",
					}),
				],
			}),
			targetPlatform: "macos",
		});

		expect(result.canWrite).toBe(false);
		expect(result.content.materials.texts).toEqual([]);
		expect(
			result.issues
				.filter(({ severity }) => severity === "error")
				.map(({ code }) => code)
		).toEqual([
			"UNSUPPORTED_CAPTION_ANIMATION",
			"UNSUPPORTED_CAPTION_WORD_TIMING",
			"UNSUPPORTED_CAPTION_KARAOKE",
		]);
	});

	it("blocks invalid text before mapping and keeps the draft structurally valid", () => {
		const element: TextElement = {
			...createTextElement(),
			color: "not-a-color",
			content: " ",
			fontSize: Number.NaN,
		};
		const result = buildJianyingDraft({
			draftOutputDirectory: "/exports/invalid-text",
			snapshot: createSnapshot({
				tracks: [createTrack({ element, id: "text-track", type: "text" })],
			}),
			targetPlatform: "macos",
		});

		expect(result.canWrite).toBe(false);
		expect(result.content.materials.texts).toEqual([]);
		expect(result.content.tracks).toEqual([]);
		expect(result.issues.map(({ code }) => code)).toEqual([
			"EMPTY_TEXT_CONTENT",
			"INVALID_TEXT_VALUE",
			"INVALID_TEXT_COLOR",
		]);
	});

	it("rejects text materials referenced by a non-text track", () => {
		const result = buildJianyingDraft({
			draftOutputDirectory: "/exports/type-check",
			snapshot: createSnapshot({
				tracks: [
					createTrack({
						element: createTextElement(),
						id: "text-track",
						type: "text",
					}),
				],
			}),
			targetPlatform: "macos",
		});
		const content: JianyingDraftContent = {
			...result.content,
			tracks: [{ ...result.content.tracks[0], type: "video" }],
		};

		expect(validateJianyingDraftContent({ content })).toContainEqual(
			expect.objectContaining({
				code: "TRACK_MATERIAL_TYPE_MISMATCH",
				trackId: result.content.tracks[0]?.id,
			})
		);
	});
});
