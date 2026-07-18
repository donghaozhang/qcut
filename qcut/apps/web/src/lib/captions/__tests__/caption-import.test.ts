import { describe, expect, it } from "vitest";
import { importedCaptionElements, parseSubtitleFile } from "../caption-import";

const SRT_SAMPLE = `1
00:00:01,000 --> 00:00:03,500
Hello world

2
00:00:04,000 --> 00:00:06,000
Second line
with a wrap
`;

const VTT_SAMPLE = `WEBVTT

NOTE This is a comment

intro
00:01.000 --> 00:03.000 align:middle position:50%
<b>Styled</b> cue

00:00:04.000 --> 00:00:05.000
Plain cue
`;

describe("parseSubtitleFile", () => {
	it("parses SRT blocks with indexes and multi-line text", () => {
		const segments = parseSubtitleFile({ content: SRT_SAMPLE });

		expect(segments).toHaveLength(2);
		expect(segments[0]).toMatchObject({
			start: 1,
			end: 3.5,
			text: "Hello world",
		});
		expect(segments[1].text).toBe("Second line\nwith a wrap");
	});

	it("parses WebVTT with headers, notes, identifiers, and cue settings", () => {
		const segments = parseSubtitleFile({ content: VTT_SAMPLE });

		expect(segments).toHaveLength(2);
		expect(segments[0]).toMatchObject({ start: 1, end: 3, text: "Styled cue" });
		expect(segments[1]).toMatchObject({ start: 4, end: 5, text: "Plain cue" });
	});

	it("ignores malformed cues instead of throwing", () => {
		const segments = parseSubtitleFile({
			content: "garbage\n00:00:02,000 --> 00:00:01,000\nbackwards\n",
		});
		expect(segments).toHaveLength(0);
	});
});

describe("importedCaptionElements", () => {
	it("marks elements as imported with cue timing", () => {
		const elements = importedCaptionElements({
			segments: parseSubtitleFile({ content: SRT_SAMPLE }),
			language: "en",
		});

		expect(elements).toHaveLength(2);
		expect(elements[0]).toMatchObject({
			type: "captions",
			source: "imported",
			startTime: 1,
			duration: 2.5,
			language: "en",
		});
	});
});
