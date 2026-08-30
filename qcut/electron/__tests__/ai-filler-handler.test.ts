import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	analyzeFillersWithPriority,
	analyzeWithPatternMatch,
	buildFilterPrompt,
	parseFilterResponse,
} from "../ai-filler-handler";
import { getDecryptedApiKeys } from "../api-key-handler";
import {
	isProxyAvailable,
	proxyRequest,
} from "../native-pipeline/infra/proxy-client";

vi.mock("../api-key-handler", () => ({
	getDecryptedApiKeys: vi.fn(),
}));

vi.mock("../native-pipeline/infra/proxy-client", () => ({
	isProxyAvailable: vi.fn(),
	proxyRequest: vi.fn(),
}));

const getDecryptedApiKeysMock = vi.mocked(getDecryptedApiKeys);
const isProxyAvailableMock = vi.mocked(isProxyAvailable);
const proxyRequestMock = vi.mocked(proxyRequest);

describe("ai-filler-handler helpers", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		isProxyAvailableMock.mockResolvedValue(false);
	});

	it("pattern fallback marks filler words and long silence spacing", () => {
		const result = analyzeWithPatternMatch({
			words: [
				{ id: "word-0", text: "um", start: 0, end: 0.2, type: "word" },
				{ id: "space-1", text: " ", start: 0.2, end: 2.0, type: "spacing" },
				{ id: "word-2", text: "hello", start: 2.0, end: 2.4, type: "word" },
			],
		});

		expect(result.provider).toBe("pattern");
		expect(result.filteredWordIds.map((item) => item.id)).toContain("word-0");
		expect(result.filteredWordIds.map((item) => item.id)).toContain("space-1");
	});

	it("pattern fallback does not remove meaningful words by default", () => {
		const result = analyzeWithPatternMatch({
			words: [
				{ id: "word-0", text: "I", start: 0, end: 0.2, type: "word" },
				{ id: "word-1", text: "like", start: 0.21, end: 0.5, type: "word" },
				{ id: "word-2", text: "cats", start: 0.51, end: 1.0, type: "word" },
			],
		});

		expect(result.filteredWordIds).toEqual([]);
	});

	it("pattern fallback marks common Chinese speech fillers", () => {
		const result = analyzeWithPatternMatch({
			words: [
				{ id: "word-0", text: "嗯", start: 0, end: 0.2, type: "word" },
				{ id: "word-1", text: "那个", start: 0.21, end: 0.45, type: "word" },
				{ id: "word-2", text: "就是", start: 0.46, end: 0.7, type: "word" },
				{ id: "word-3", text: "重点", start: 0.71, end: 1.0, type: "word" },
			],
		});

		expect(result.provider).toBe("pattern");
		expect(result.filteredWordIds.map((item) => item.id)).toEqual([
			"word-0",
			"word-1",
			"word-2",
		]);
	});

	it("buildFilterPrompt includes sentences and word list sections", () => {
		const prompt = buildFilterPrompt({
			words: [
				{ id: "word-0", text: "hello", start: 0, end: 0.2, type: "word" },
				{ id: "space-1", text: " ", start: 0.2, end: 0.9, type: "spacing" },
				{ id: "word-2", text: "world", start: 0.9, end: 1.2, type: "word" },
			],
			languageCode: "eng",
		});

		expect(prompt).toContain("Language: eng");
		expect(prompt).toContain("## Sentences");
		expect(prompt).toContain("## Words");
		expect(prompt).toContain("word-0|hello|0.00-0.20");
	});

	it("parseFilterResponse handles valid JSON", () => {
		const parsed = parseFilterResponse({
			rawText:
				'[{"id":"word-1","reason":"filler word","scope":"word"},{"id":"word-2","reason":"repeat","scope":"sentence"}]',
		});

		expect(parsed).toHaveLength(2);
		expect(parsed[0]).toEqual({
			id: "word-1",
			reason: "filler word",
			scope: "word",
		});
		expect(parsed[1].scope).toBe("sentence");
	});

	it("parseFilterResponse returns empty list on malformed text", () => {
		const parsed = parseFilterResponse({
			rawText: "not json at all",
		});

		expect(parsed).toEqual([]);
	});

	it("falls back to pattern provider when no API keys are available", async () => {
		getDecryptedApiKeysMock.mockResolvedValue({
			falApiKey: "",
			freesoundApiKey: "",
			geminiApiKey: "",
			openRouterApiKey: "",
			anthropicApiKey: "",
		});

		const result = await analyzeFillersWithPriority({
			request: {
				languageCode: "eng",
				words: [{ id: "word-0", text: "um", start: 0, end: 0.2, type: "word" }],
			},
		});

		expect(result.provider).toBe("pattern");
		expect(result.filteredWordIds.map((item) => item.id)).toEqual(["word-0"]);
	});

	it("uses QCut proxy OpenRouter before local keys when available", async () => {
		isProxyAvailableMock.mockResolvedValue(true);
		proxyRequestMock.mockResolvedValue({
			ok: true,
			status: 200,
			data: {
				choices: [
					{
						message: {
							content:
								'[{"id":"word-0","reason":"speech filler","scope":"word"}]',
						},
					},
				],
			},
		});

		const result = await analyzeFillersWithPriority({
			request: {
				languageCode: "zh",
				words: [{ id: "word-0", text: "嗯", start: 0, end: 0.2, type: "word" }],
			},
		});

		expect(result.provider).toBe("openrouter");
		expect(result.filteredWordIds).toEqual([
			{ id: "word-0", reason: "speech filler", scope: "word" },
		]);
		expect(getDecryptedApiKeysMock).not.toHaveBeenCalled();
		expect(proxyRequestMock).toHaveBeenCalledWith(
			expect.objectContaining({
				provider: "openrouter",
				endpoint: "https://openrouter.ai/api/v1/chat/completions",
				method: "POST",
				timeoutMs: 30_000,
			})
		);
	});

	it("falls back to QCut proxy Gemini when OpenRouter proxy fails", async () => {
		isProxyAvailableMock.mockResolvedValue(true);
		proxyRequestMock
			.mockResolvedValueOnce({
				ok: false,
				status: 503,
				data: { error: "API key not configured for provider: openrouter" },
			})
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: {
					candidates: [
						{
							content: {
								parts: [
									{
										text: '[{"id":"word-0","reason":"speech filler","scope":"word"}]',
									},
								],
							},
						},
					],
				},
			});

		const result = await analyzeFillersWithPriority({
			request: {
				languageCode: "zh",
				words: [{ id: "word-0", text: "嗯", start: 0, end: 0.2, type: "word" }],
			},
		});

		expect(result.provider).toBe("gemini");
		expect(result.filteredWordIds).toEqual([
			{ id: "word-0", reason: "speech filler", scope: "word" },
		]);
		expect(getDecryptedApiKeysMock).not.toHaveBeenCalled();
		expect(proxyRequestMock).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				provider: "openrouter",
				endpoint: "https://openrouter.ai/api/v1/chat/completions",
			})
		);
		expect(proxyRequestMock).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				provider: "gemini",
				endpoint:
					"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent",
			})
		);
	});

	it("falls back to pattern when every QCut proxy LLM chunk fails", async () => {
		isProxyAvailableMock.mockResolvedValue(true);
		proxyRequestMock
			.mockResolvedValueOnce({
				ok: false,
				status: 503,
				data: { error: "API key not configured for provider: openrouter" },
			})
			.mockResolvedValueOnce({
				ok: false,
				status: 503,
				data: { error: "API key not configured for provider: gemini" },
			});
		getDecryptedApiKeysMock.mockResolvedValue({
			falApiKey: "",
			freesoundApiKey: "",
			geminiApiKey: "",
			openRouterApiKey: "",
			anthropicApiKey: "",
		});

		const result = await analyzeFillersWithPriority({
			request: {
				languageCode: "eng",
				words: [
					{ id: "word-0", text: "um", start: 0, end: 0.2, type: "word" },
					{ id: "word-1", text: "today", start: 0.3, end: 0.6, type: "word" },
				],
			},
		});

		expect(result.provider).toBe("pattern");
		expect(result.filteredWordIds).toEqual([
			{ id: "word-0", reason: "common filler word", scope: "word" },
		]);
		expect(getDecryptedApiKeysMock).toHaveBeenCalled();
	});
});
