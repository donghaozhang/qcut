import { describe, it, expect } from "vitest";
import { normalizeCodexEntries, type JsonlEntry } from "../claude-jsonl";

describe("normalizeCodexEntries", () => {
	it("maps custom_tool_call to tool_use", () => {
		const raw = [
			{
				type: "response_item",
				payload: {
					type: "custom_tool_call",
					name: "apply_patch",
					input: "*** Begin Patch\n*** End Patch\n",
				},
			},
		] as unknown as JsonlEntry[];

		const normalized = normalizeCodexEntries(raw);
		expect(normalized).toHaveLength(1);
		expect(normalized[0]?.type).toBe("tool_use");
		expect(normalized[0]?.toolName).toBe("apply_patch");
		expect(normalized[0]?.toolDetail).toContain("Begin Patch");
	});

	it("maps custom_tool_call_output to tool_result with exit code summary", () => {
		const raw = [
			{
				type: "response_item",
				payload: {
					type: "custom_tool_call",
					call_id: "call-1",
					name: "apply_patch",
					input: "*** Begin Patch\n*** End Patch\n",
				},
			},
			{
				type: "response_item",
				payload: {
					type: "custom_tool_call_output",
					call_id: "call-1",
					output: JSON.stringify({
						output: "Success. Updated the following files:\nM src/app.ts",
						metadata: { exit_code: 0 },
					}),
				},
			},
		] as unknown as JsonlEntry[];

		const normalized = normalizeCodexEntries(raw);
		expect(normalized).toHaveLength(2);
		expect(normalized[1]?.type).toBe("tool_result");
		expect(normalized[1]?.toolName).toBe("apply_patch");
		expect(normalized[1]?.toolResultError).toBe(false);
		expect(normalized[1]?.toolResult).toContain("[exit 0]");
		expect(normalized[1]?.toolResult).toContain("Updated the following files");
	});

	it("maps standalone custom_tool_call_output when no call context exists", () => {
		const raw = [
			{
				type: "response_item",
				payload: {
					type: "custom_tool_call_output",
					output: JSON.stringify({
						output: "Success. Updated the following files:\nM src/app.ts",
						metadata: { exit_code: 0 },
					}),
				},
			},
		] as unknown as JsonlEntry[];

		const normalized = normalizeCodexEntries(raw);
		expect(normalized).toHaveLength(1);
		expect(normalized[0]?.type).toBe("tool_result");
		expect(normalized[0]?.toolName).toBeUndefined();
		expect(normalized[0]?.toolResultError).toBe(false);
		expect(normalized[0]?.toolResult).toContain("[exit 0]");
		expect(normalized[0]?.toolResult).toContain("Updated the following files");
	});

	it("marks tool_result as error when exit code is non-zero", () => {
		const raw = [
			{
				type: "response_item",
				payload: {
					type: "custom_tool_call_output",
					output: JSON.stringify({
						output: "patch failed",
						metadata: { exit_code: 1 },
					}),
				},
			},
		] as unknown as JsonlEntry[];

		const normalized = normalizeCodexEntries(raw);
		expect(normalized).toHaveLength(1);
		expect(normalized[0]?.type).toBe("tool_result");
		expect(normalized[0]?.toolResultError).toBe(true);
		expect(normalized[0]?.toolResult).toContain("[exit 1]");
	});

	it("keeps function_call and function_call_output mapping", () => {
		const raw = [
			{
				type: "response_item",
				payload: {
					type: "function_call",
					name: "exec_command",
					arguments: JSON.stringify({ cmd: "ls -la" }),
				},
			},
			{
				type: "response_item",
				payload: {
					type: "function_call_output",
					output: "ok",
				},
			},
		] as unknown as JsonlEntry[];

		const normalized = normalizeCodexEntries(raw);
		expect(normalized).toHaveLength(2);
		expect(normalized[0]?.type).toBe("tool_use");
		expect(normalized[0]?.toolName).toBe("exec_command");
		expect(normalized[0]?.toolDetail).toBe("ls -la");
		expect(normalized[1]?.type).toBe("tool_result");
		expect(normalized[1]?.toolResult).toBe("ok");
	});
});
