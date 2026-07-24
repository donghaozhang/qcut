import { describe, expect, it } from "vitest";
import {
	buildScriptBeats,
	detectScriptLanguage,
	extractEditorialKeywords,
	narrationInternals,
} from "../narration.js";

describe("editorial narration beats", () => {
	it("keeps labelled Chinese beats continuous across the target duration", () => {
		const beats = buildScriptBeats({
			script:
				"YARRA: 雅拉河穿过墨尔本市中心。\nTRAM: 有轨电车连接熟悉的街道。\nDUSK: 黄昏时城市亮起灯光。",
			duration: 43,
		});

		expect(beats.map((beat) => beat.id)).toEqual(["YARRA", "TRAM", "DUSK"]);
		expect(beats[0].start).toBe(0);
		expect(beats[2].end).toBe(43);
		expect(beats[1].start).toBe(beats[0].end);
		expect(beats[2].start).toBe(beats[1].end);
		expect(beats[0].keywords).toContain("river");
		expect(beats[1].keywords).toContain("tram");
		expect(detectScriptLanguage({ script: beats[0].text })).toBe("zh");
	});

	it("uses word timestamps instead of forcing Chinese and English timing", () => {
		const chinese = buildScriptBeats({
			script: "YARRA: 雅拉河。\nTRAM: 墨尔本电车。",
			duration: 12,
			words: [
				{ text: "雅拉河", start: 0.2, end: 2.2 },
				{ text: "墨尔本", start: 3.4, end: 7.2 },
				{ text: "电车", start: 7.2, end: 9.8 },
			],
		});
		const english = buildScriptBeats({
			script: "YARRA: The Yarra River.\nTRAM: Melbourne trams.",
			duration: 14,
			words: [
				{ text: "The", start: 0.1, end: 0.4 },
				{ text: "Yarra", start: 0.4, end: 1.1 },
				{ text: "River", start: 1.1, end: 1.8 },
				{ text: "Melbourne", start: 4.1, end: 5.1 },
				{ text: "trams", start: 5.1, end: 6.2 },
			],
		});

		expect(chinese[0].end).not.toBe(english[0].end);
		expect(chinese[1].end).toBe(12);
		expect(english[1].end).toBe(14);
	});

	it("joins wrapped prose lines and emits estimated word positions without STT", () => {
		const beats = buildScriptBeats({
			script:
				"Melbourne breathes between the sea breeze and the glow of its\nstreets.\n\nThe Yarra carries the skyline.",
			duration: 10,
		});

		expect(beats).toHaveLength(2);
		expect(beats[0].text).toContain("its streets.");
		expect(beats[0].words.length).toBeGreaterThan(0);
		expect(beats[0].words.every((word) => word.estimated)).toBe(true);
	});

	it("parses SRT positions and expands editorial concept aliases", () => {
		const words = narrationInternals.parseSrtWords({
			value:
				"1\n00:00:01,000 --> 00:00:03,000\nYarra River\n\n2\n00:00:04,000 --> 00:00:05,000\ntram\n",
		});

		expect(words).toHaveLength(3);
		expect(words[0]).toMatchObject({ text: "Yarra", start: 1, end: 2 });
		expect(extractEditorialKeywords({ text: "Tram at dusk" })).toEqual(
			expect.arrayContaining(["tram", "dusk", "电车", "黄昏"])
		);
	});
});
