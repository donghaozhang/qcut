import { describe, expect, it } from "vitest";
import type { AgentMessage } from "@mariozechner/pi-agent-core";

const { compressEditingContext } = await import("../context-compression.js");

// Helper to create a simple user message
function userMsg(text: string): AgentMessage {
	return { role: "user", content: text } as AgentMessage;
}

// Helper to create a tool result message
function toolResultMsg(text: string): AgentMessage {
	return {
		role: "toolResult",
		toolCallId: "tc-1",
		content: [{ type: "text", text }],
	} as unknown as AgentMessage;
}

describe("context-compression", () => {
	describe("message truncation", () => {
		it("returns messages unchanged when under limit", async () => {
			const messages = Array.from({ length: 10 }, (_, i) =>
				userMsg(`message ${i}`)
			);

			const result = await compressEditingContext(messages);
			expect(result).toBe(messages); // Same reference — no copy
		});

		it("returns messages unchanged at exactly 40", async () => {
			const messages = Array.from({ length: 40 }, (_, i) =>
				userMsg(`msg ${i}`)
			);

			const result = await compressEditingContext(messages);
			expect(result).toBe(messages);
		});

		it("trims to last 40 messages when over limit", async () => {
			const messages = Array.from({ length: 60 }, (_, i) =>
				userMsg(`msg ${i}`)
			);

			const result = await compressEditingContext(messages);
			expect(result).toHaveLength(40);

			// Should keep messages 20-59
			const firstContent = (result[0] as any).content;
			expect(firstContent).toBe("msg 20");
		});
	});

	describe("tool result compression", () => {
		it("does not compress short tool results", async () => {
			const messages: AgentMessage[] = [
				...Array.from({ length: 39 }, (_, i) => userMsg(`msg ${i}`)),
				toolResultMsg('{"success": true}'),
				// Need >40 total to trigger compression
				...Array.from({ length: 5 }, (_, i) => userMsg(`extra ${i}`)),
			];

			const result = await compressEditingContext(messages);
			// Find tool result in the trimmed set
			const toolResult = result.find((m) => (m as any).role === "toolResult");
			if (toolResult) {
				const text = (toolResult as any).content[0].text;
				expect(text).toBe('{"success": true}');
			}
		});

		it("compresses long JSON tool results to status+summary", async () => {
			const longJson = JSON.stringify({
				success: true,
				summary: "Generated 3 clips",
				data: {
					clips: Array.from({ length: 100 }, (_, i) => ({
						id: i,
						name: `clip-${i}`,
					})),
				},
			});
			expect(longJson.length).toBeGreaterThan(500);

			const messages: AgentMessage[] = [
				...Array.from({ length: 41 }, (_, i) => userMsg(`msg ${i}`)),
				toolResultMsg(longJson),
				userMsg("final"),
			];

			const result = await compressEditingContext(messages);
			const toolResult = result.find((m) => (m as any).role === "toolResult");
			expect(toolResult).toBeDefined();

			const parsed = JSON.parse((toolResult as any).content[0].text);
			expect(parsed.status).toBe("success");
			expect(parsed.summary).toBe("Generated 3 clips");
			// The large data array should be gone
			expect(parsed.data).toBeUndefined();
		});

		it("extracts error from failed JSON results", async () => {
			const errorJson = JSON.stringify({
				success: false,
				error: "API key not configured",
				stack: "x".repeat(600),
			});

			const messages: AgentMessage[] = [
				...Array.from({ length: 41 }, (_, i) => userMsg(`msg ${i}`)),
				toolResultMsg(errorJson),
				userMsg("final"),
			];

			const result = await compressEditingContext(messages);
			const toolResult = result.find((m) => (m as any).role === "toolResult");
			const parsed = JSON.parse((toolResult as any).content[0].text);

			expect(parsed.status).toBe("error");
			expect(parsed.summary).toBe("API key not configured");
		});

		it("truncates long non-JSON tool results", async () => {
			const longText = "A".repeat(1000);

			const messages: AgentMessage[] = [
				...Array.from({ length: 41 }, (_, i) => userMsg(`msg ${i}`)),
				toolResultMsg(longText),
				userMsg("final"),
			];

			const result = await compressEditingContext(messages);
			const toolResult = result.find((m) => (m as any).role === "toolResult");
			const text = (toolResult as any).content[0].text;

			expect(text.length).toBeLessThan(1000);
			expect(text).toContain("... [truncated]");
			expect(text.startsWith("AAAA")).toBe(true);
		});

		it("preserves non-tool messages during compression", async () => {
			const messages: AgentMessage[] = [
				...Array.from({ length: 42 }, (_, i) => userMsg(`msg ${i}`)),
			];

			const result = await compressEditingContext(messages);
			expect(result).toHaveLength(40);
			for (const msg of result) {
				expect((msg as any).role).toBe("user");
			}
		});
	});

	describe("state injection via tool results", () => {
		it("keeps recent state-snapshot results intact when short", async () => {
			const stateResult = JSON.stringify({
				success: true,
				data: { timeline: { tracks: 2, clips: 5 } },
			});

			// Under 500 chars — should not be compressed
			expect(stateResult.length).toBeLessThan(500);

			const messages: AgentMessage[] = [
				...Array.from({ length: 41 }, (_, i) => userMsg(`msg ${i}`)),
				toolResultMsg(stateResult),
				userMsg("final"),
			];

			const result = await compressEditingContext(messages);
			const toolResult = result.find((m) => (m as any).role === "toolResult");
			const text = (toolResult as any).content[0].text;

			// Short results are returned unchanged
			expect(text).toBe(stateResult);
		});
	});
});
