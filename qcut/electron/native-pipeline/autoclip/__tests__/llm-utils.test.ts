import { describe, it, expect } from "vitest";
import { parseJsonResponse, extractChatContent } from "../llm-utils";

describe("parseJsonResponse", () => {
	it("parses clean JSON array", () => {
		const result = parseJsonResponse('[{"a": 1}, {"a": 2}]');
		expect(result).toEqual([{ a: 1 }, { a: 2 }]);
	});

	it("parses clean JSON object", () => {
		const result = parseJsonResponse('{"key": "value"}');
		expect(result).toEqual({ key: "value" });
	});

	it("extracts JSON from markdown code block", () => {
		const input = 'Here is the result:\n```json\n[{"a": 1}]\n```\nDone.';
		expect(parseJsonResponse(input)).toEqual([{ a: 1 }]);
	});

	it("extracts JSON from markdown without json label", () => {
		const input = '```\n[{"a": 1}]\n```';
		expect(parseJsonResponse(input)).toEqual([{ a: 1 }]);
	});

	it("handles leading non-JSON text", () => {
		const input = 'Sure, here is the analysis:\n[{"a": 1}]';
		expect(parseJsonResponse(input)).toEqual([{ a: 1 }]);
	});

	it("fixes missing commas between objects", () => {
		const input = '[{"a": 1}\n{"a": 2}]';
		expect(parseJsonResponse(input)).toEqual([{ a: 1 }, { a: 2 }]);
	});

	it("fixes trailing commas", () => {
		const input = '[{"a": 1,}]';
		expect(parseJsonResponse(input)).toEqual([{ a: 1 }]);
	});

	it("fixes Chinese quotes", () => {
		const input = "[{\u201ckey\u201d: \u201cvalue\u201d}]";
		expect(parseJsonResponse(input)).toEqual([{ key: "value" }]);
	});

	it("handles BOM", () => {
		const input = '\uFEFF[{"a": 1}]';
		expect(parseJsonResponse(input)).toEqual([{ a: 1 }]);
	});

	it("throws on completely invalid input", () => {
		expect(() => parseJsonResponse("not json at all")).toThrow();
	});
});

describe("extractChatContent", () => {
	it("extracts content from OpenRouter response", () => {
		const data = {
			choices: [
				{
					message: {
						content: "Hello world",
					},
				},
			],
		};
		expect(extractChatContent(data)).toBe("Hello world");
	});

	it("throws on invalid response shape", () => {
		expect(() => extractChatContent(null)).toThrow();
		expect(() => extractChatContent({})).toThrow();
		expect(() => extractChatContent({ choices: [] })).toThrow();
	});
});
