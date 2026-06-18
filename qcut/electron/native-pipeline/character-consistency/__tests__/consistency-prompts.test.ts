import { describe, expect, it } from "vitest";
import { getConsistencyPromptSet } from "../consistency-prompts.js";

describe("getConsistencyPromptSet", () => {
	it("returns a conservative zh prompt", () => {
		const promptSet = getConsistencyPromptSet({ language: "zh" });

		expect(promptSet.language).toBe("zh");
		expect(promptSet.system).toContain("角色一致性检查员");
		expect(promptSet.system).toContain("proportion/height");
		expect(promptSet.system).toContain("只报告");
		expect(promptSet.system).toContain("JSON 数组");
	});

	it("returns a conservative en prompt", () => {
		const promptSet = getConsistencyPromptSet({ language: "en" });

		expect(promptSet.language).toBe("en");
		expect(promptSet.system).toContain("character-consistency checker");
		expect(promptSet.system).toContain("proportion/height");
		expect(promptSet.system).toContain("Only report");
		expect(promptSet.system).toContain("JSON array");
	});
});
