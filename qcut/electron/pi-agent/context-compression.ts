/**
 * Context compression for long video-editing sessions.
 *
 * Implements `transformContext` for pi-agent-core's Agent.
 * Trims old messages and compresses verbose tool results to summaries.
 *
 * @module electron/pi-agent/context-compression
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ToolResultMessage } from "@mariozechner/pi-ai";

const MAX_MESSAGES = 40;
const MAX_TOOL_RESULT_LENGTH = 500;

/**
 * Compress the conversation context before each LLM call.
 *
 * 1. If messages are under the limit, return unchanged.
 * 2. Keep the most recent MAX_MESSAGES messages.
 * 3. Compress old tool results to status + summary.
 */
export async function compressEditingContext(
	messages: AgentMessage[]
): Promise<AgentMessage[]> {
	if (messages.length <= MAX_MESSAGES) return messages;

	const recent = messages.slice(-MAX_MESSAGES);

	return recent.map((msg) => {
		if (!isToolResultMessage(msg)) return msg;

		const compressed = compressToolResult(msg);
		return compressed ?? msg;
	});
}

function isToolResultMessage(msg: AgentMessage): msg is ToolResultMessage {
	return (
		typeof msg === "object" &&
		msg !== null &&
		"role" in msg &&
		(msg as any).role === "toolResult"
	);
}

function compressToolResult(msg: ToolResultMessage): ToolResultMessage | null {
	if (!msg.content) return null;

	const fullText = msg.content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text)
		.join("");

	if (fullText.length <= MAX_TOOL_RESULT_LENGTH) return null;

	// Try to extract just status/summary from JSON results
	try {
		const parsed = JSON.parse(fullText);
		const summary = JSON.stringify({
			status: parsed.status ?? (parsed.success ? "success" : "error"),
			summary: parsed.summary ?? parsed.error ?? "Operation completed",
		});
		return {
			...msg,
			content: [{ type: "text", text: summary }],
		};
	} catch {
		// Not JSON — truncate
		return {
			...msg,
			content: [
				{
					type: "text",
					text: fullText.slice(0, MAX_TOOL_RESULT_LENGTH) + "... [truncated]",
				},
			],
		};
	}
}
