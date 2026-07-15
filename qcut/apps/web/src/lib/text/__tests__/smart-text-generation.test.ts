import type { PersistedTranscription } from "@qcut/editor-core";
import { describe, expect, it } from "vitest";
import type {
	CaptionElement,
	MarkdownElement,
	TextElement,
	TimelineTrack,
} from "@/types/timeline";
import {
	collectSmartTextSegments,
	generateSmartTextSuggestions,
	isSmartTextCategory,
} from "../smart-text-generation";

function baseElement({
	id,
	name,
	startTime,
}: {
	id: string;
	name: string;
	startTime: number;
}) {
	return {
		id,
		name,
		duration: 4,
		startTime,
		trimStart: 0,
		trimEnd: 4,
	};
}

function textElement({
	content,
	id = "text-1",
	startTime = 0,
}: {
	content: string;
	id?: string;
	startTime?: number;
}): TextElement {
	return {
		...baseElement({ id, name: id, startTime }),
		type: "text",
		content,
		fontSize: 48,
		fontFamily: "Inter",
		color: "#ffffff",
		backgroundColor: "transparent",
		textAlign: "center",
		fontWeight: "bold",
		fontStyle: "normal",
		textDecoration: "none",
		x: 50,
		y: 50,
		rotation: 0,
		opacity: 1,
	};
}

function captionElement({
	id = "caption-1",
	startTime = 0,
	text,
}: {
	id?: string;
	startTime?: number;
	text: string;
}): CaptionElement {
	return {
		...baseElement({ id, name: id, startTime }),
		type: "captions",
		text,
		language: "zh",
		source: "manual",
	};
}

function markdownElement({
	id = "markdown-1",
	markdownContent,
	startTime = 0,
}: {
	id?: string;
	markdownContent: string;
	startTime?: number;
}): MarkdownElement {
	return {
		...baseElement({ id, name: id, startTime }),
		type: "markdown",
		markdownContent,
		theme: "transparent",
		fontSize: 36,
		fontFamily: "Inter",
		padding: 16,
		backgroundColor: "transparent",
		textColor: "#ffffff",
		scrollMode: "static",
		scrollSpeed: 0,
		x: 0,
		y: 0,
		width: 100,
		height: 100,
		rotation: 0,
		opacity: 1,
	};
}

function track({
	elements,
}: {
	elements: TimelineTrack["elements"];
}): TimelineTrack {
	return {
		id: "track-1",
		name: "Text",
		type: "text",
		elements,
	};
}

function transcription({
	segments,
	text = "核心方法提升效率",
}: {
	segments: PersistedTranscription["segments"];
	text?: string;
}): PersistedTranscription {
	return {
		version: 1,
		mediaId: "media-1",
		mediaName: "clip.mp4",
		language: "zh",
		duration: 60,
		provider: "test",
		createdAt: 100,
		text,
		words: [],
		segments,
	};
}

describe("smart text generation", () => {
	it("recognizes smart text template categories", () => {
		expect(isSmartTextCategory({ categoryId: "summary" })).toBe(true);
		expect(isSmartTextCategory({ categoryId: "key-point" })).toBe(true);
		expect(isSmartTextCategory({ categoryId: "basic" })).toBe(false);
	});

	it("collects normalized timeline and transcription segments", () => {
		const segments = collectSmartTextSegments({
			tracks: [
				track({
					elements: [
						captionElement({
							text: "  核心 方法 提升 效率  ",
							startTime: 1,
						}),
						markdownElement({
							markdownContent: "## 关键步骤\n[查看方案](https://example.com)",
							startTime: 8,
						}),
					],
				}),
			],
			transcriptions: [
				transcription({
					segments: [
						{ text: "核心 方法 提升 效率", start: 1, end: 4 },
						{ text: "风险需要提前说明", start: 12, end: 16 },
					],
				}),
			],
		});

		expect(segments.map((segment) => segment.text)).toEqual([
			"核心 方法 提升 效率",
			"关键步骤 查看方案",
			"风险需要提前说明",
		]);
		expect(segments.map((segment) => segment.source)).toEqual([
			"caption",
			"markdown",
			"transcription",
		]);
	});

	it("generates ranked suggestions for smart text categories", () => {
		const tracks = [
			track({
				elements: [
					textElement({
						content: "其实这个核心方法能提升 30% 效率",
						startTime: 2,
					}),
					captionElement({
						text: "风险需要提前说明",
						startTime: 8,
					}),
					textElement({
						content: "普通开场白",
						id: "text-2",
						startTime: 14,
					}),
				],
			}),
		];
		const transcriptions = [
			transcription({
				segments: [{ text: "关键步骤先搭好结构", start: 20, end: 24 }],
			}),
		];

		const keyPointContents = generateSmartTextSuggestions({
			categoryId: "key-point",
			tracks,
			transcriptions,
			maxSuggestions: 3,
		}).map((suggestion) => suggestion.content);

		expect(keyPointContents[0]).toBe("重点：核心方法能提升 30% 效率");
		expect(keyPointContents).toContain("重点：关键步骤先搭好结构");
		expect(
			generateSmartTextSuggestions({
				categoryId: "chapter",
				tracks,
				transcriptions,
				maxSuggestions: 2,
			})[0]?.content
		).toMatch(/^第 1 章：/);
		expect(
			generateSmartTextSuggestions({
				categoryId: "summary",
				tracks,
				transcriptions,
				maxSuggestions: 1,
			})[0]?.content
		).toContain("核心：");
		expect(
			generateSmartTextSuggestions({
				categoryId: "rewrite",
				tracks,
				transcriptions,
				maxSuggestions: 1,
			})[0]?.content
		).toMatch(/^先看结论：/);
	});
});
