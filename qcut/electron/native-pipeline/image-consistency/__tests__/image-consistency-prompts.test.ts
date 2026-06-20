import { describe, expect, it } from "vitest";
import { getImageConsistencyPromptSet } from "../image-consistency-prompts.js";

describe("getImageConsistencyPromptSet", () => {
	it("returns a zh prompt with suggested categories and imageIndex output", () => {
		const set = getImageConsistencyPromptSet({ language: "zh" });
		expect(set.language).toBe("zh");
		expect(set.ruleApplied).toBe(false);
		expect(set.system).toContain("imageIndex");
		expect(set.system).toContain("prop/material");
		expect(set.system).not.toContain("<<<RULE");
	});

	it("returns an en prompt for language=en", () => {
		const set = getImageConsistencyPromptSet({ language: "en" });
		expect(set.language).toBe("en");
		expect(set.system).toContain("CANDIDATE");
		expect(set.system).toContain("Suggested categories");
	});

	it("injects rule text wrapped in delimiters and flags ruleApplied", () => {
		const set = getImageConsistencyPromptSet({
			language: "zh",
			rule: "红纸飞机必须保留纸张纤维纹理",
		});
		expect(set.ruleApplied).toBe(true);
		expect(set.system).toContain("<<<RULE");
		expect(set.system).toContain("红纸飞机必须保留纸张纤维纹理");
		expect(set.system).toContain("RULE>>>");
	});

	it("treats blank rule as no rule", () => {
		const set = getImageConsistencyPromptSet({ language: "en", rule: "   " });
		expect(set.ruleApplied).toBe(false);
		expect(set.system).not.toContain("<<<RULE");
	});
});
