import { describe, it, expect, beforeEach } from "vitest";
import {
	novelResultToScriptData,
	resetIdCounter,
} from "../novel-to-script";
import type { NovelParseResult } from "../novel-parser";

function makeResult(overrides: Partial<NovelParseResult> = {}): NovelParseResult {
	return {
		characters: [
			{ name: "Zhang San", introduction: "A brave warrior", gender: "male", age: "30" },
			{ name: "Li Si", introduction: "A cunning merchant" },
		],
		locations: [
			{ name: "Tavern", description: "A dusty old tavern", time: "night", atmosphere: "tense" },
			{ name: "Market", description: "Bustling market square" },
		],
		clips: [
			{
				id: "clip_1",
				startText: "start",
				endText: "end",
				content: "clip content",
				summary: "summary",
				characters: ["Zhang San"],
				location: "Tavern",
				matchLevel: "L1",
				matchConfidence: 1,
			},
		],
		screenplays: [
			{
				clipId: "clip_1",
				success: true,
				sceneCount: 1,
				screenplay: {
					scenes: [
						{
							location: "Tavern",
							time: "night",
							action: "Zhang San pushes open the door.",
							dialogue: [
								{ character: "Zhang San", line: "Anyone here?", direction: "shouting" },
								{ character: "Li Si", line: "Over here, old friend." },
							],
						},
					],
				},
			},
		],
		summary: {
			characterCount: 2,
			locationCount: 2,
			clipCount: 1,
			screenplaySuccessCount: 1,
			screenplayFailedCount: 0,
			totalScenes: 1,
		},
		...overrides,
	};
}

describe("novelResultToScriptData", () => {
	beforeEach(() => {
		resetIdCounter();
	});

	it("converts a full result to ScriptData", () => {
		const result = makeResult();
		const data = novelResultToScriptData(result, "Test Novel");

		expect(data.title).toBe("Test Novel");
		expect(data.language).toBe("en");
		expect(data.characters).toHaveLength(2);
		expect(data.characters[0].name).toBe("Zhang San");
		expect(data.characters[0].gender).toBe("male");
		expect(data.characters[0].age).toBe("30");
		expect(data.characters[0].appearance).toBe(undefined);
		expect(data.characters[0].personality).toBe("A brave warrior");

		expect(data.scenes).toHaveLength(2);
		expect(data.scenes[0].location).toBe("Tavern");
		expect(data.scenes[0].time).toBe("night");
		expect(data.scenes[0].atmosphere).toBe("tense");
		expect(data.scenes[1].location).toBe("Market");

		expect(data.episodes).toHaveLength(1);
		expect(data.episodes[0].sceneIds).toHaveLength(2);

		// 1 action + 2 dialogue = 3 paragraphs
		expect(data.storyParagraphs).toHaveLength(3);
		expect(data.storyParagraphs[0].text).toBe("Zhang San pushes open the door.");
		expect(data.storyParagraphs[1].text).toBe("Zhang San (shouting): Anyone here?");
		expect(data.storyParagraphs[2].text).toBe("Li Si: Over here, old friend.");
	});

	it("skips failed screenplays gracefully", () => {
		const result = makeResult({
			screenplays: [
				{ clipId: "clip_1", success: false, sceneCount: 0, error: "LLM failed" },
			],
		});
		const data = novelResultToScriptData(result);

		expect(data.characters).toHaveLength(2);
		expect(data.scenes).toHaveLength(2);
		expect(data.storyParagraphs).toHaveLength(0);
	});

	it("handles empty result", () => {
		const result = makeResult({
			characters: [],
			locations: [],
			clips: [],
			screenplays: [],
			summary: {
				characterCount: 0,
				locationCount: 0,
				clipCount: 0,
				screenplaySuccessCount: 0,
				screenplayFailedCount: 0,
				totalScenes: 0,
			},
		});
		const data = novelResultToScriptData(result);

		expect(data.characters).toHaveLength(0);
		expect(data.scenes).toHaveLength(0);
		expect(data.storyParagraphs).toHaveLength(0);
		expect(data.episodes).toHaveLength(1);
		expect(data.episodes[0].sceneIds).toHaveLength(0);
	});

	it("deduplicates locations from screenplays and extractions", () => {
		const result = makeResult();
		// Tavern appears in both locations[] and screenplay scenes
		const data = novelResultToScriptData(result);

		const tavernScenes = data.scenes.filter((s) => s.location === "Tavern");
		expect(tavernScenes).toHaveLength(1);
	});

	it("creates scenes for screenplay locations not in extraction", () => {
		const result = makeResult({
			locations: [], // No pre-extracted locations
		});
		const data = novelResultToScriptData(result);

		// Tavern should be created from the screenplay scene
		expect(data.scenes).toHaveLength(1);
		expect(data.scenes[0].location).toBe("Tavern");
	});

	it("detects Chinese language from character names", () => {
		const result = makeResult({
			characters: [{ name: "\u5F20\u4E09", introduction: "\u52C7\u58EB" }],
		});
		const data = novelResultToScriptData(result);
		expect(data.language).toBe("zh");
	});
});
