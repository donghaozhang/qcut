/**
 * Codex conversation normalization into shared JsonlEntry shape.
 */

import { type JsonlEntry, toRecord } from "./claude-jsonl-core";

/**
 * Normalize Codex JSONL entries to the same JsonlEntry format as Claude Code.
 * Maps codex types (response_item/message, event_msg/user_message, etc.)
 * to our unified format (user, assistant, tool_use, tool_result).
 */
export function normalizeCodexEntries(raw: JsonlEntry[]): JsonlEntry[] {
	const entries: JsonlEntry[] = [];
	const toolNameByCallId = new Map<string, string>();
	for (const entry of raw) {
		const topType = (entry as Record<string, unknown>).type as string;
		const payload = (entry as Record<string, unknown>).payload as
			| Record<string, unknown>
			| undefined;
		if (!payload) continue;
		const payloadType = payload.type as string | undefined;

		if (topType === "event_msg" && payloadType === "user_message") {
			entries.push({
				type: "user",
				message: {
					role: "user",
					content: (payload.message as string) ?? "",
				},
			});
		} else if (topType === "response_item" && payloadType === "message") {
			const role = payload.role as string;
			if (role === "assistant") {
				const content = payload.content as unknown[];
				const text =
					content
						?.map((c) => {
							if (typeof c === "object" && c !== null && "text" in c) {
								return (c as { text: string }).text;
							}
							return "";
						})
						.filter(Boolean)
						.join("") ?? "";
				if (text) {
					entries.push({
						type: "assistant",
						message: { role: "assistant", content: text },
					});
				}
			} else if (role === "user") {
				const content = payload.content as unknown[];
				const text =
					content
						?.map((c) => {
							if (typeof c === "object" && c !== null && "text" in c) {
								return (c as { text: string }).text;
							}
							return "";
						})
						.filter(Boolean)
						.join("") ?? "";
				if (text && text.length < 2000) {
					entries.push({
						type: "user",
						message: { role: "user", content: text },
					});
				}
			}
		} else if (
			topType === "response_item" &&
			(payloadType === "function_call" || payloadType === "custom_tool_call")
		) {
			const toolName = (payload.name as string) ?? "unknown";
			const toolDetail =
				payloadType === "function_call"
					? extractFunctionCallToolDetail({ payload })
					: extractCustomToolCallDetail({ payload });
			const callId =
				typeof payload.call_id === "string" ? payload.call_id : null;
			if (callId) {
				toolNameByCallId.set(callId, toolName);
			}
			entries.push({
				type: "tool_use",
				toolName,
				toolDetail,
			});
		} else if (
			topType === "response_item" &&
			(payloadType === "function_call_output" ||
				payloadType === "custom_tool_call_output")
		) {
			const callId =
				typeof payload.call_id === "string" ? payload.call_id : null;
			const outputToolName = callId
				? toolNameByCallId.get(callId) ?? undefined
				: undefined;
			const { toolResult, toolResultError } = extractToolResultSummary({
				payload,
			});
			entries.push({
				type: "tool_result",
				toolName: outputToolName,
				toolResult,
				toolResultError,
			});
		}
	}
	return entries;
}

/** Extract detail summary for function-call tools. */
function extractFunctionCallToolDetail({
	payload,
}: {
	payload: Record<string, unknown>;
}): string | undefined {
	try {
		const args = JSON.parse(
			(payload.arguments as string) ?? "{}",
		) as Record<string, unknown>;
		if (args.cmd) return String(args.cmd);
		if (args.file_path) return String(args.file_path);
		if (args.pattern) return String(args.pattern);
		if (args.query) return String(args.query);
		return compactValue({ value: args });
	} catch {
		return undefined;
	}
}

/** Extract detail summary for custom-tool calls. */
function extractCustomToolCallDetail({
	payload,
}: {
	payload: Record<string, unknown>;
}): string | undefined {
	try {
		const input = payload.input;
		return compactValue({ value: input });
	} catch {
		return undefined;
	}
}

/** Extract a compact result summary and error flag from tool output. */
function extractToolResultSummary({
	payload,
}: {
	payload: Record<string, unknown>;
}): { toolResult?: string; toolResultError: boolean } {
	try {
		let toolResultError = false;
		const status = typeof payload.status === "string" ? payload.status : null;
		if (
			status === "failed" ||
			status === "errored" ||
			status === "error" ||
			status === "denied"
		) {
			toolResultError = true;
		}

		const outputValue = parseMaybeJson({ value: payload.output });
		const outputRecord = toRecord({ value: outputValue });

		let detail: string | undefined;
		if (outputRecord !== null) {
			const outputText = outputRecord.output;
			const errorText = outputRecord.error;
			if (typeof outputText === "string") {
				detail = outputText;
			} else if (typeof errorText === "string") {
				detail = errorText;
				toolResultError = true;
			} else {
				detail = compactValue({ value: outputRecord });
			}

			const metadata = toRecord({ value: outputRecord.metadata });
			const exitCodeValue = metadata?.exit_code;
			const exitCode =
				typeof exitCodeValue === "number" ? exitCodeValue : null;
			if (exitCode !== null) {
				if (exitCode !== 0) toolResultError = true;
				const exitPrefix = `[exit ${exitCode}]`;
				detail = detail ? `${exitPrefix} ${detail}` : exitPrefix;
			}
		} else if (typeof outputValue === "string") {
			detail = outputValue;
		} else {
			detail = compactValue({ value: outputValue });
		}

		return {
			toolResult: detail,
			toolResultError,
		};
	} catch {
		return { toolResultError: true };
	}
}

/** Parse maybe-JSON string values. */
function parseMaybeJson({ value }: { value: unknown }): unknown {
	try {
		if (typeof value !== "string") return value;
		const trimmed = value.trim();
		if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
		return JSON.parse(trimmed) as unknown;
	} catch {
		return value;
	}
}

/** Compact arbitrary values into one-line snippets. */
function compactValue({ value }: { value: unknown }): string | undefined {
	try {
		if (value === null || value === undefined) return undefined;
		if (typeof value === "string") return compactText({ text: value });
		return compactText({ text: JSON.stringify(value) });
	} catch {
		return undefined;
	}
}

/** Compact text with max length. */
function compactText({ text }: { text: string }): string | undefined {
	try {
		const singleLine = text.replace(/\s+/g, " ").trim();
		if (!singleLine) return undefined;
		const maxLength = 220;
		if (singleLine.length <= maxLength) return singleLine;
		return `${singleLine.slice(0, maxLength - 1)}…`;
	} catch {
		return undefined;
	}
}
