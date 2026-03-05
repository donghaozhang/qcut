import { describe, expect, it } from "vitest";
import {
	toDashboardTokenUsage,
	toDisplayTokenUsage,
	formatTokenCountCompact,
	formatTokenCountFull,
	formatUsd,
} from "../token-usage";

describe("toDashboardTokenUsage", () => {
	it("builds total tokens and cost", () => {
		expect(
			toDashboardTokenUsage({
				usage: {
					inputTokens: 1200,
					outputTokens: 300,
					estimatedCostUsd: 0.02,
				},
			})
		).toEqual({
			inputTokens: 1200,
			outputTokens: 300,
			totalTokens: 1500,
			estimatedCostUsd: 0.02,
		});
	});

	it("returns null for missing usage", () => {
		expect(toDashboardTokenUsage({ usage: null })).toBeNull();
	});

	it("sanitizes invalid values", () => {
		expect(
			toDashboardTokenUsage({
				usage: {
					inputTokens: Number.NaN,
					outputTokens: -20,
					estimatedCostUsd: Number.POSITIVE_INFINITY,
				},
			})
		).toEqual({
			inputTokens: 0,
			outputTokens: 0,
			totalTokens: 0,
			estimatedCostUsd: 0,
		});
	});

	it("returns zero fallback for missing display usage", () => {
		expect(toDisplayTokenUsage({ usage: null })).toEqual({
			inputTokens: 0,
			outputTokens: 0,
			totalTokens: 0,
			estimatedCostUsd: 0,
		});
	});
});

describe("token usage formatting", () => {
	it("formats compact and full token counts", () => {
		expect(formatTokenCountCompact({ tokens: 1500 })).toMatch(/1\.5/i);
		expect(formatTokenCountFull({ tokens: 1500 })).toBe("1,500");
	});

	it("formats usd values", () => {
		expect(formatUsd({ usd: 12.3 })).toBe("$12.30");
		expect(formatUsd({ usd: 0.1234 })).toBe("$0.1234");
	});
});
