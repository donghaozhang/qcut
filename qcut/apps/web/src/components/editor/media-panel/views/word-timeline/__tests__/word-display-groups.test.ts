import { describe, expect, it } from "vitest";
import { WORD_FILTER_STATE, type WordItem } from "@/types/word-timeline";
import {
	buildWordDisplayGroups,
	getDisplayGroupWordIds,
} from "../word-display-groups";

function word({
	end,
	filterState = WORD_FILTER_STATE.NONE,
	id,
	start,
	text,
}: {
	end: number;
	filterState?: WordItem["filterState"];
	id: string;
	start: number;
	text: string;
}): WordItem {
	return {
		id,
		text,
		start,
		end,
		type: "word",
		filterState,
	};
}

describe("buildWordDisplayGroups", () => {
	it("groups adjacent Chinese word tokens into readable phrases", () => {
		const groups = buildWordDisplayGroups({
			words: [
				word({ id: "w0", text: "光", start: 0, end: 0.1 }),
				word({ id: "w1", text: "影", start: 0.12, end: 0.2 }),
				word({ id: "w2", text: "是", start: 0.22, end: 0.3 }),
				word({ id: "w3", text: "艺", start: 0.32, end: 0.4 }),
				word({ id: "w4", text: "术", start: 0.42, end: 0.5 }),
				word({ id: "w5", text: "。", start: 0.52, end: 0.55 }),
			],
		});

		expect(groups).toHaveLength(1);
		expect(groups[0]).toMatchObject({
			id: "w0",
			text: "光影是艺术。",
			start: 0,
			end: 0.55,
			filterState: WORD_FILTER_STATE.NONE,
			wordIds: ["w0", "w1", "w2", "w3", "w4", "w5"],
		});
	});

	it("keeps English words separate and does not cross filter states", () => {
		const groups = buildWordDisplayGroups({
			words: [
				word({ id: "w0", text: "Uh", start: 0, end: 0.1 }),
				word({ id: "w1", text: "今", start: 0.2, end: 0.3 }),
				word({
					id: "w2",
					text: "天",
					start: 0.32,
					end: 0.42,
					filterState: WORD_FILTER_STATE.AI,
				}),
				word({ id: "w3", text: "开", start: 0.44, end: 0.54 }),
				word({ id: "w4", text: "始", start: 0.56, end: 0.66 }),
			],
		});

		expect(groups.map((group) => group.text)).toEqual([
			"Uh",
			"今",
			"天",
			"开始",
		]);
		expect(groups.map((group) => group.filterState)).toEqual([
			WORD_FILTER_STATE.NONE,
			WORD_FILTER_STATE.NONE,
			WORD_FILTER_STATE.AI,
			WORD_FILTER_STATE.NONE,
		]);
		expect(getDisplayGroupWordIds({ word: groups[3] })).toEqual(["w3", "w4"]);
	});

	it("splits long Chinese runs into bounded chunks", () => {
		const groups = buildWordDisplayGroups({
			maxCjkChars: 4,
			words: Array.from("智能口播字幕体验").map((text, index) =>
				word({
					id: `w${index}`,
					text,
					start: index * 0.1,
					end: index * 0.1 + 0.08,
				})
			),
		});

		expect(groups.map((group) => group.text)).toEqual(["智能口播", "字幕体验"]);
	});
});
