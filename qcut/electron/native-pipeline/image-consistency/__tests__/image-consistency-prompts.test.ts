import { describe, expect, it } from "vitest";
import { getImageConsistencyPromptSet } from "../image-consistency-prompts.js";

describe("getImageConsistencyPromptSet", () => {
	it("returns a zh prompt with general dimensions and imageIndex output", () => {
		const set = getImageConsistencyPromptSet({ language: "zh" });
		expect(set.language).toBe("zh");
		expect(set.ruleApplied).toBe(false);
		expect(set.system).toContain("imageIndex");
		expect(set.system).toContain("prop/material");
		expect(set.system).toContain("exact index");
		expect(set.system).toContain("不要改成当前批次内从 0 开始");
		// general check dimensions are always present, even with no rule
		expect(set.system).toContain("人物比例");
		expect(set.system).toContain("场景/背景一致性");
		expect(set.system).not.toContain("<<<RULE");
	});

	it("returns an en prompt with general dimensions for language=en", () => {
		const set = getImageConsistencyPromptSet({ language: "en" });
		expect(set.language).toBe("en");
		expect(set.system).toContain("CANDIDATE");
		expect(set.system).toContain("Suggested categories");
		expect(set.system).toContain("Character proportions");
		expect(set.system).toContain("Scene/background consistency");
		expect(set.system).toContain("exact index shown in the CANDIDATE label");
		expect(set.system).toContain("do not renumber images from 0");
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
