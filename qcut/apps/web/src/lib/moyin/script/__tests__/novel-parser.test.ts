import { describe, it, expect, vi } from "vitest";
import {
	parseNovel,
	analyzeCharacters,
	analyzeLocations,
	splitNovelIntoClips,
	convertClipToScreenplay,
	detectLanguage,
	type NovelClip,
} from "../novel-parser";
import type { LLMAdapter } from "../script-parser";

// ─── Mock LLM ───────────────────────────────────────────────────────

/**
 * Create a mock LLM adapter that returns predefined responses
 * based on the user prompt content.
 */
function createMockLLM(responses: Record<string, string>): LLMAdapter {
	return vi.fn(async (_system: string, user: string): Promise<string> => {
		for (const [keyword, response] of Object.entries(responses)) {
			if (user.includes(keyword)) return response;
		}
		return '{"error": "No mock response matched"}';
	});
}

// ─── Sample Data ────────────────────────────────────────────────────

const SAMPLE_ZH_NOVEL =
	"\u5F20\u4E09\u63A8\u5F00\u9152\u9986\u7684\u95E8\uFF0C\u5411\u91CC\u9762\u671B\u53BB\u3002\u674E\u56DB\u5750\u5728\u89D2\u843D\uFF0C\u4ED6\u653E\u4E0B\u4E86\u9152\u676F\u3002\u5F20\u4E09\u8D70\u8FC7\u53BB\u8BF4\uFF1A\u201C\u597D\u4E45\u4E0D\u89C1\u3002\u201D\u674E\u56DB\u7B11\u4E86\u7B11\uFF1A\u201C\u662F\u554A\uFF0C\u5750\u5427\u3002\u201D";
// "张三推开酒馆的门，向里面望去。李四坐在角落，他放下了酒杯。张三走过去说："好久不见。"李四笑了笑："是啊，坐吧。""

const SAMPLE_EN_NOVEL =
	'John pushed open the tavern door and looked inside. Mary sat in the corner with her wine glass. John walked over and said, "Long time no see." Mary smiled warmly, "Indeed, have a seat."';

const MOCK_CHARACTERS_ZH = JSON.stringify({
	characters: [
		{
			name: "\u5F20\u4E09",
			introduction: "\u4E3B\u89D2\uFF0C\u5E74\u8F7B\u7537\u5B50",
			visualTraits: "\u9AD8\u5927\u5065\u58EE",
			gender: "\u7537",
			age: "25",
		},
		{
			name: "\u674E\u56DB",
			introduction: "\u5F20\u4E09\u7684\u8001\u53CB",
			visualTraits: "\u4E2D\u7B49\u8EAB\u6750",
			gender: "\u7537",
			age: "28",
		},
	],
});

const MOCK_LOCATIONS_ZH = JSON.stringify({
	locations: [
		{
			name: "\u9152\u9986",
			description: "\u6628\u65E5\u8001\u53CB\u91CD\u9022\u7684\u5730\u65B9",
			time: "night",
			atmosphere: "\u6E29\u99A8",
		},
	],
});

const MOCK_CLIPS_ZH = JSON.stringify([
	{
		start: "\u5F20\u4E09\u63A8\u5F00\u9152\u9986\u7684\u95E8",
		end: "\u4ED6\u653E\u4E0B\u4E86\u9152\u676F\u3002",
		summary:
			"\u5F20\u4E09\u8FDB\u5165\u9152\u9986\uFF0C\u770B\u5230\u674E\u56DB",
		characters: ["\u5F20\u4E09", "\u674E\u56DB"],
		location: "\u9152\u9986",
	},
	{
		start: "\u5F20\u4E09\u8D70\u8FC7\u53BB\u8BF4",
		end: "\u201C\u662F\u554A\uFF0C\u5750\u5427\u3002\u201D",
		summary: "\u4E24\u4EBA\u91CD\u9022\u5BF9\u8BDD",
		characters: ["\u5F20\u4E09", "\u674E\u56DB"],
		location: "\u9152\u9986",
	},
]);

const MOCK_SCREENPLAY_ZH = JSON.stringify({
	scenes: [
		{
			location: "\u9152\u9986",
			time: "night",
			action: "\u5F20\u4E09\u63A8\u95E8\u800C\u5165",
			dialogue: [
				{
					character: "\u5F20\u4E09",
					line: "\u597D\u4E45\u4E0D\u89C1\u3002",
					direction: "\u5FAE\u7B11",
				},
			],
		},
	],
});

const MOCK_CHARACTERS_EN = JSON.stringify({
	characters: [
		{
			name: "John",
			introduction: "The protagonist, a young man",
			visualTraits: "Tall and athletic",
			gender: "male",
			age: "25",
		},
		{
			name: "Mary",
			introduction: "John's old friend",
			visualTraits: "Medium build, warm eyes",
			gender: "female",
			age: "24",
		},
	],
});

const MOCK_LOCATIONS_EN = JSON.stringify({
	locations: [
		{
			name: "Tavern",
			description: "A cozy place for old friends to reunite",
			time: "night",
			atmosphere: "Warm and inviting",
		},
	],
});

const MOCK_CLIPS_EN = JSON.stringify([
	{
		start: "John pushed open the tavern door",
		end: "with her wine glass.",
		summary: "John enters the tavern and sees Mary",
		characters: ["John", "Mary"],
		location: "Tavern",
	},
	{
		start: "John walked over and said,",
		end: '"Indeed, have a seat."',
		summary: "The two friends reunite",
		characters: ["John", "Mary"],
		location: "Tavern",
	},
]);

const MOCK_SCREENPLAY_EN = JSON.stringify({
	scenes: [
		{
			location: "Tavern",
			time: "night",
			action: "John enters the tavern",
			dialogue: [
				{
					character: "John",
					line: "Long time no see.",
					direction: "smiling",
				},
			],
		},
	],
});

// ─── Tests ──────────────────────────────────────────────────────────

describe("detectLanguage", () => {
	it("detects Chinese", () => {
		expect(detectLanguage(SAMPLE_ZH_NOVEL)).toBe("zh");
	});

	it("detects English", () => {
		expect(detectLanguage(SAMPLE_EN_NOVEL)).toBe("en");
	});
});

describe("analyzeCharacters", () => {
	it("extracts characters from Chinese text", async () => {
		const callLLM = createMockLLM({
			"\u5F20\u4E09\u63A8\u5F00\u9152\u9986": MOCK_CHARACTERS_ZH,
		});

		const chars = await analyzeCharacters(SAMPLE_ZH_NOVEL, [], callLLM, "zh");

		expect(chars).toHaveLength(2);
		expect(chars[0].name).toBe("\u5F20\u4E09");
		expect(chars[1].name).toBe("\u674E\u56DB");
		expect(callLLM).toHaveBeenCalledOnce();
	});

	it("passes existing characters to prompt", async () => {
		const callLLM = createMockLLM({
			"\u5F20\u4E09\u63A8\u5F00\u9152\u9986": MOCK_CHARACTERS_ZH,
		});

		await analyzeCharacters(SAMPLE_ZH_NOVEL, ["\u5F20\u4E09"], callLLM, "zh");

		const calledWith = (callLLM as ReturnType<typeof vi.fn>).mock
			.calls[0][1] as string;
		expect(calledWith).toContain("\u5F20\u4E09");
	});
});

describe("analyzeLocations", () => {
	it("extracts locations from Chinese text", async () => {
		const callLLM = createMockLLM({
			"\u5F20\u4E09\u63A8\u5F00\u9152\u9986": MOCK_LOCATIONS_ZH,
		});

		const locs = await analyzeLocations(SAMPLE_ZH_NOVEL, [], callLLM, "zh");

		expect(locs).toHaveLength(1);
		expect(locs[0].name).toBe("\u9152\u9986");
	});
});

describe("splitNovelIntoClips", () => {
	it("splits Chinese novel into clips with boundary matching", async () => {
		const callLLM = createMockLLM({
			"\u5F20\u4E09\u63A8\u5F00\u9152\u9986": MOCK_CLIPS_ZH,
		});

		const clips = await splitNovelIntoClips(
			SAMPLE_ZH_NOVEL,
			["\u5F20\u4E09", "\u674E\u56DB"],
			["\u9152\u9986"],
			callLLM,
			"zh"
		);

		expect(clips).toHaveLength(2);
		expect(clips[0].id).toBe("clip_1");
		expect(clips[0].matchLevel).toBe("L1");
		expect(clips[0].content).toContain("\u5F20\u4E09\u63A8\u5F00\u9152\u9986");
		expect(clips[1].id).toBe("clip_2");
	});

	it("throws on failed boundary matching", async () => {
		const badClips = JSON.stringify([
			{
				start: "nonexistent start text",
				end: "nonexistent end text",
				summary: "test",
				characters: [],
				location: null,
			},
		]);

		const callLLM = createMockLLM({
			"\u5F20\u4E09\u63A8\u5F00\u9152\u9986": badClips,
		});

		await expect(
			splitNovelIntoClips(
				SAMPLE_ZH_NOVEL,
				[],
				[],
				callLLM,
				"zh",
				1 // max 1 attempt
			)
		).rejects.toThrow("Boundary matching failed");
	});
});

describe("convertClipToScreenplay", () => {
	it("converts a clip to screenplay", async () => {
		const callLLM = createMockLLM({
			"\u5F20\u4E09\u63A8\u5F00\u9152\u9986": MOCK_SCREENPLAY_ZH,
		});

		const clip: NovelClip = {
			id: "clip_1",
			startText: "\u5F20\u4E09\u63A8\u5F00\u9152\u9986\u7684\u95E8",
			endText: "\u4ED6\u653E\u4E0B\u4E86\u9152\u676F\u3002",
			content:
				"\u5F20\u4E09\u63A8\u5F00\u9152\u9986\u7684\u95E8\uFF0C\u5411\u91CC\u9762\u671B\u53BB\u3002",
			summary: "test",
			characters: ["\u5F20\u4E09"],
			location: "\u9152\u9986",
			matchLevel: "L1",
			matchConfidence: 1,
		};

		const result = await convertClipToScreenplay(
			clip,
			["\u5F20\u4E09", "\u674E\u56DB"],
			["\u9152\u9986"],
			callLLM,
			"zh"
		);

		expect(result.success).toBe(true);
		expect(result.clipId).toBe("clip_1");
		expect(result.sceneCount).toBe(1);
		expect(result.screenplay?.scenes[0].location).toBe("\u9152\u9986");
	});

	it("handles LLM failure gracefully", async () => {
		const callLLM = vi.fn(async () => {
			throw new Error("LLM timeout");
		});

		const clip: NovelClip = {
			id: "clip_1",
			startText: "start",
			endText: "end",
			content: "content",
			summary: "test",
			characters: [],
			location: null,
			matchLevel: "L1",
			matchConfidence: 1,
		};

		const result = await convertClipToScreenplay(clip, [], [], callLLM, "en");

		expect(result.success).toBe(false);
		expect(result.error).toContain("LLM timeout");
		expect(result.sceneCount).toBe(0);
	});
});

describe("parseNovel — full pipeline", () => {
	it("runs complete pipeline with Chinese novel", async () => {
		const callLLM = createMockLLM({
			// Step 1 character analysis — unique phrase in character prompt
			"\u63D0\u53D6\u89D2\u8272\u4FE1\u606F": MOCK_CHARACTERS_ZH,
			// Step 1 location analysis — unique phrase in location prompt
			"\u63D0\u53D6\u573A\u666F/\u5730\u70B9\u4FE1\u606F": MOCK_LOCATIONS_ZH,
			// Step 2 clip splitting — unique phrase "切分为多个独立"
			"\u5207\u5206\u4E3A\u591A\u4E2A\u72EC\u7ACB": MOCK_CLIPS_ZH,
			// Step 3 screenplay conversion — unique phrase "转换为标准剧本"
			"\u8F6C\u6362\u4E3A\u6807\u51C6\u5267\u672C": MOCK_SCREENPLAY_ZH,
		});

		const progressSteps: string[] = [];
		const result = await parseNovel({
			text: SAMPLE_ZH_NOVEL,
			language: "zh",
			callLLM,
			onProgress: (step) => {
				if (!progressSteps.includes(step)) progressSteps.push(step);
			},
		});

		expect(result.characters).toHaveLength(2);
		expect(result.locations).toHaveLength(1);
		expect(result.clips).toHaveLength(2);
		expect(result.screenplays).toHaveLength(2);
		expect(result.summary.characterCount).toBe(2);
		expect(result.summary.locationCount).toBe(1);
		expect(result.summary.clipCount).toBe(2);
		expect(result.summary.screenplaySuccessCount).toBe(2);
		expect(result.summary.screenplayFailedCount).toBe(0);

		// Verify progress was reported
		expect(progressSteps).toContain("analyze_characters");
		expect(progressSteps).toContain("split_clips");
		expect(progressSteps).toContain("screenplay_conversion");
	});

	it("runs complete pipeline with English novel", async () => {
		const callLLM = createMockLLM({
			// Step 1 — unique phrases from each prompt template
			"extracting character information": MOCK_CHARACTERS_EN,
			"extracting location information": MOCK_LOCATIONS_EN,
			// Step 2 — unique phrase in clip split prompt
			"Split the following novel text": MOCK_CLIPS_EN,
			// Step 3 — unique phrase in screenplay prompt
			"Convert the following novel clip": MOCK_SCREENPLAY_EN,
		});

		const result = await parseNovel({
			text: SAMPLE_EN_NOVEL,
			language: "en",
			callLLM,
		});

		expect(result.characters).toHaveLength(2);
		expect(result.locations).toHaveLength(1);
		expect(result.clips).toHaveLength(2);
		expect(result.screenplays).toHaveLength(2);
	});

	it("throws on empty text", async () => {
		const callLLM = vi.fn(async () => "{}");

		await expect(parseNovel({ text: "", callLLM })).rejects.toThrow(
			"Novel text is empty"
		);

		await expect(parseNovel({ text: "   ", callLLM })).rejects.toThrow(
			"Novel text is empty"
		);
	});

	it("auto-detects language", async () => {
		const callLLM = createMockLLM({
			"\u63D0\u53D6\u89D2\u8272\u4FE1\u606F": MOCK_CHARACTERS_ZH,
			"\u63D0\u53D6\u573A\u666F/\u5730\u70B9\u4FE1\u606F": MOCK_LOCATIONS_ZH,
			"\u5207\u5206\u4E3A\u591A\u4E2A\u72EC\u7ACB": MOCK_CLIPS_ZH,
			"\u8F6C\u6362\u4E3A\u6807\u51C6\u5267\u672C": MOCK_SCREENPLAY_ZH,
		});

		const result = await parseNovel({
			text: SAMPLE_ZH_NOVEL,
			language: "auto",
			callLLM,
		});

		// Should auto-detect as Chinese and produce results
		expect(result.characters.length).toBeGreaterThan(0);
	});

	it("merges existing characters", async () => {
		const callLLM = createMockLLM({
			"\u63D0\u53D6\u89D2\u8272\u4FE1\u606F": MOCK_CHARACTERS_ZH,
			"\u63D0\u53D6\u573A\u666F/\u5730\u70B9\u4FE1\u606F": MOCK_LOCATIONS_ZH,
			"\u5207\u5206\u4E3A\u591A\u4E2A\u72EC\u7ACB": MOCK_CLIPS_ZH,
			"\u8F6C\u6362\u4E3A\u6807\u51C6\u5267\u672C": MOCK_SCREENPLAY_ZH,
		});

		const result = await parseNovel({
			text: SAMPLE_ZH_NOVEL,
			language: "zh",
			existingCharacters: ["\u738B\u4E94"],
			callLLM,
		});

		// Existing character 王五 should be passed to prompt
		const calledPrompts = (callLLM as ReturnType<typeof vi.fn>).mock.calls.map(
			(c: unknown[]) => c[1] as string
		);
		const characterPrompt = calledPrompts.find((p: string) =>
			p.includes("\u89D2\u8272")
		);
		expect(characterPrompt).toContain("\u738B\u4E94");
	});
});

describe("JSON repair integration", () => {
	it("handles markdown code fences in LLM response", async () => {
		const wrappedResponse = "```json\n" + MOCK_CHARACTERS_ZH + "\n```";
		const callLLM = createMockLLM({
			"\u5F20\u4E09\u63A8\u5F00\u9152\u9986": wrappedResponse,
		});

		const chars = await analyzeCharacters(SAMPLE_ZH_NOVEL, [], callLLM, "zh");
		expect(chars).toHaveLength(2);
	});
});
