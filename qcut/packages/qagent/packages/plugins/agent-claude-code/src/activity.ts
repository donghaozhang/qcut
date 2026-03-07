/**
 * Terminal output classification for Claude Code activity detection.
 */

import type { ActivityState } from "@composio/ao-core";

/** Classify Claude Code's activity state from terminal output (pure, sync). */
export function classifyTerminalOutput(terminalOutput: string): ActivityState {
	// Empty output — can't determine state
	if (!terminalOutput.trim()) return "idle";

	const lines = terminalOutput.trim().split("\n");
	const lastLine = lines[lines.length - 1]?.trim() ?? "";

	// Check the last line FIRST — if the prompt is visible, the agent is idle
	// regardless of historical output (e.g. "Reading file..." from earlier).
	// The ❯ is Claude Code's prompt character.
	if (/^[❯>$#]\s*$/.test(lastLine)) return "idle";

	// Check the bottom of the buffer for permission prompts BEFORE checking
	// full-buffer active indicators. Historical "Thinking"/"Reading" text in
	// the buffer must not override a current permission prompt at the bottom.
	const tail = lines.slice(-5).join("\n");
	if (/Do you want to proceed\?/i.test(tail)) return "waiting_input";
	if (/\(Y\)es.*\(N\)o/i.test(tail)) return "waiting_input";
	if (/bypass.*permissions/i.test(tail)) return "waiting_input";

	// Everything else is "active" — the agent is processing, waiting for
	// output, or showing content. Specific patterns (e.g. "esc to interrupt",
	// "Thinking", "Reading") all map to "active" so no need to check them
	// individually.
	return "active";
}
