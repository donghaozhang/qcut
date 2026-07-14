import { describe, expect, it } from "vitest";
import type { TextElement } from "@/types/timeline";
import {
	buildTextGroupContentSlots,
	parseTextGroupDraftContents,
	updateTextGroupSlotContents,
	type TextGroupSelection,
} from "../text-properties";

function createTextSelection({
	content,
	id,
	name,
}: {
	content: string;
	id: string;
	name: string;
}): TextGroupSelection {
	const element: TextElement = {
		id,
		type: "text",
		name,
		content,
		fontSize: 64,
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
		duration: 5,
		startTime: 0,
		trimStart: 0,
		trimEnd: 0,
		groupId: "template-group",
	};
	return { element, trackId: `track-${id}` };
}

describe("text group content editing", () => {
	it("builds stable slots for multi-element template replacement", () => {
		const slots = buildTextGroupContentSlots({
			selections: [
				createTextSelection({
					content: "旧标题",
					id: "title",
					name: "Template Title",
				}),
				createTextSelection({
					content: "旧副标题",
					id: "subtitle",
					name: "Template Subhead",
				}),
			],
		});

		expect(slots).toEqual([
			{
				content: "旧标题",
				elementId: "title",
				index: 0,
				name: "Template Title",
			},
			{
				content: "旧副标题",
				elementId: "subtitle",
				index: 1,
				name: "Template Subhead",
			},
		]);
	});

	it("parses quick multiline drafts into fixed replacement slots", () => {
		expect(
			parseTextGroupDraftContents({
				draft: "新标题\n新副标题",
				slotCount: 3,
			})
		).toEqual(["新标题", "新副标题", ""]);
	});

	it("distributes pasted lines from the active slot", () => {
		expect(
			updateTextGroupSlotContents({
				contents: ["标题", "副标题", "角标"],
				startIndex: 1,
				value: "新副标题\n新角标\n忽略这一行",
			})
		).toEqual(["标题", "新副标题", "新角标"]);
	});
});
