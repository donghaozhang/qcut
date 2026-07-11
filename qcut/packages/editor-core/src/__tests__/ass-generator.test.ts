import { describe, expect, it } from "vitest";
import { generateASS } from "../captions/ass-generator";
import type { CaptionElement } from "../types/timeline";

function caption({
	karaoke = false,
}: {
	karaoke?: boolean;
} = {}): CaptionElement {
	return {
		id: "caption",
		type: "captions",
		name: "Lyrics",
		startTime: 1,
		duration: 2,
		trimStart: 0,
		trimEnd: 0,
		text: "Hello world",
		language: "en",
		source: "transcription",
		style: karaoke
			? {
					fontFamily: "Arial",
					fontSize: 24,
					fontColor: "#ffffff",
					fontOpacity: 1,
					bold: false,
					italic: false,
					underline: false,
					outlineColor: "#000000",
					outlineWidth: 2,
					shadowColor: "#000000",
					shadowOffset: { x: 0, y: 0 },
					backgroundColor: "#000000",
					bgOpacity: 0,
					position: { align: "bottom", x: 0, y: 30 },
					lineSpacing: 1.2,
					karaokeMode: "karaoke",
					highlightColor: "#22d3ee",
					upcomingColor: "#d4d4d8",
				}
			: undefined,
		words: karaoke
			? [
					{
						id: "hello",
						text: "Hello",
						start: 1,
						end: 1.5,
						type: "word",
					},
					{
						id: "world",
						text: "world",
						start: 1.6,
						end: 2.4,
						type: "word",
					},
				]
			: undefined,
	};
}

describe("generateASS", () => {
	it("writes progressive karaoke tags from caption word timing", () => {
		const ass = generateASS([caption({ karaoke: true })], {
			resolution: { width: 1920, height: 1080 },
		});

		expect(ass).toContain("{\\kf60}Hello");
		expect(ass).toContain("{\\kf140}world");
		expect(ass).toContain("Dialogue:");
	});

	it("keeps ordinary captions as plain text", () => {
		const ass = generateASS([caption()], {
			resolution: { width: 1920, height: 1080 },
		});

		expect(ass).toContain("Hello world");
		expect(ass).not.toContain("\\kf");
	});
});
