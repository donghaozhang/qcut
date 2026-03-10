import { describe, it, expect } from "vitest";
import {
	parseSrtContent,
	parseVttContent,
	chunkByInterval,
	timeToSeconds,
	secondsToSrtTime,
	srtTimeToFfmpeg,
} from "../srt-parser";

describe("timeToSeconds", () => {
	it("parses HH:MM:SS,mmm format", () => {
		expect(timeToSeconds("00:00:00,000")).toBe(0);
		expect(timeToSeconds("00:01:30,500")).toBe(90.5);
		expect(timeToSeconds("01:00:00,000")).toBe(3600);
		expect(timeToSeconds("02:30:45,123")).toBeCloseTo(9045.123);
	});

	it("parses HH:MM:SS.mmm format (VTT style)", () => {
		expect(timeToSeconds("00:01:30.500")).toBe(90.5);
	});

	it("throws on invalid format", () => {
		expect(() => timeToSeconds("invalid")).toThrow();
	});
});

describe("secondsToSrtTime", () => {
	it("converts seconds to SRT timecode", () => {
		expect(secondsToSrtTime(0)).toBe("00:00:00,000");
		expect(secondsToSrtTime(90.5)).toBe("00:01:30,500");
		expect(secondsToSrtTime(3600)).toBe("01:00:00,000");
	});

	it("round-trips with timeToSeconds", () => {
		const times = ["00:00:00,000", "00:05:30,250", "01:23:45,678"];
		for (const t of times) {
			expect(secondsToSrtTime(timeToSeconds(t))).toBe(t);
		}
	});
});

describe("srtTimeToFfmpeg", () => {
	it("converts comma to dot", () => {
		expect(srtTimeToFfmpeg("00:01:30,500")).toBe("00:01:30.500");
	});
});

describe("parseSrtContent", () => {
	it("parses standard SRT", () => {
		const srt = `1
00:00:01,000 --> 00:00:04,000
Hello world

2
00:00:05,000 --> 00:00:08,000
Second line

3
00:00:09,000 --> 00:00:12,000
Third line
`;
		const entries = parseSrtContent(srt);
		expect(entries).toHaveLength(3);
		expect(entries[0].index).toBe(1);
		expect(entries[0].startTime).toBe("00:00:01,000");
		expect(entries[0].endTime).toBe("00:00:04,000");
		expect(entries[0].text).toBe("Hello world");
		expect(entries[0].startSeconds).toBe(1);
		expect(entries[0].endSeconds).toBe(4);
	});

	it("handles multi-line subtitle text", () => {
		const srt = `1
00:00:01,000 --> 00:00:04,000
Line one
Line two
`;
		const entries = parseSrtContent(srt);
		expect(entries).toHaveLength(1);
		expect(entries[0].text).toBe("Line one Line two");
	});

	it("strips HTML tags", () => {
		const srt = `1
00:00:01,000 --> 00:00:04,000
<b>Bold</b> and <i>italic</i>
`;
		const entries = parseSrtContent(srt);
		expect(entries[0].text).toBe("Bold and italic");
	});

	it("handles BOM", () => {
		const srt = `\uFEFF1
00:00:01,000 --> 00:00:04,000
Hello
`;
		const entries = parseSrtContent(srt);
		expect(entries).toHaveLength(1);
	});

	it("returns empty for empty input", () => {
		expect(parseSrtContent("")).toEqual([]);
		expect(parseSrtContent("  \n  ")).toEqual([]);
	});

	it("skips malformed entries", () => {
		const srt = `1
00:00:01,000 --> 00:00:04,000
Good entry

not a number
00:00:05,000 --> 00:00:08,000
Bad index

3
bad timestamp line
Some text
`;
		const entries = parseSrtContent(srt);
		expect(entries).toHaveLength(1);
		expect(entries[0].text).toBe("Good entry");
	});
});

describe("parseVttContent", () => {
	it("parses standard VTT", () => {
		const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
Hello world

00:00:05.000 --> 00:00:08.000
Second line
`;
		const entries = parseVttContent(vtt);
		expect(entries).toHaveLength(2);
		expect(entries[0].startTime).toBe("00:00:01,000");
		expect(entries[0].text).toBe("Hello world");
	});

	it("handles cue identifiers", () => {
		const vtt = `WEBVTT

cue-1
00:00:01.000 --> 00:00:04.000
Hello world
`;
		const entries = parseVttContent(vtt);
		expect(entries).toHaveLength(1);
		expect(entries[0].text).toBe("Hello world");
	});

	it("returns empty for invalid VTT", () => {
		expect(parseVttContent("not a vtt file")).toEqual([]);
	});
});

describe("chunkByInterval", () => {
	function makeEntries(count: number, intervalSec: number) {
		return Array.from({ length: count }, (_, i) => ({
			index: i + 1,
			startTime: `00:${String(Math.floor((i * intervalSec) / 60)).padStart(2, "0")}:${String((i * intervalSec) % 60).padStart(2, "0")},000`,
			endTime: `00:${String(Math.floor(((i + 1) * intervalSec - 1) / 60)).padStart(2, "0")}:${String(((i + 1) * intervalSec - 1) % 60).padStart(2, "0")},000`,
			text: `Entry ${i + 1}`,
			startSeconds: i * intervalSec,
			endSeconds: (i + 1) * intervalSec - 1,
		}));
	}

	it("returns single chunk for short content", () => {
		const entries = makeEntries(5, 60); // 5 min total
		const chunks = chunkByInterval(entries, 30);
		expect(chunks).toHaveLength(1);
		expect(chunks[0].chunkIndex).toBe(0);
		expect(chunks[0].entries).toHaveLength(5);
	});

	it("splits at ~30-minute intervals", () => {
		const entries = makeEntries(90, 60); // 90 min total, 1 entry/min
		const chunks = chunkByInterval(entries, 30);
		expect(chunks.length).toBeGreaterThanOrEqual(2);
		expect(chunks.length).toBeLessThanOrEqual(4);
	});

	it("returns empty for empty input", () => {
		expect(chunkByInterval([], 30)).toEqual([]);
	});

	it("preserves all entries across chunks", () => {
		const entries = makeEntries(60, 60);
		const chunks = chunkByInterval(entries, 30);
		const totalEntries = chunks.reduce((sum, c) => sum + c.entries.length, 0);
		expect(totalEntries).toBe(60);
	});

	it("concatenates text in each chunk", () => {
		const entries = makeEntries(3, 60);
		const chunks = chunkByInterval(entries, 30);
		expect(chunks[0].text).toBe("Entry 1 Entry 2 Entry 3");
	});
});
