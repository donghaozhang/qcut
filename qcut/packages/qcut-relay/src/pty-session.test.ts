import { describe, expect, it, vi } from "vitest";

import {
	buildDaytonaPtyId,
	buildCodexStartupCommand,
	parsePtyClientControlMessage,
} from "./pty-session";

describe("parsePtyClientControlMessage", () => {
	it("keeps numeric keypresses as terminal input", () => {
		expect(parsePtyClientControlMessage({ data: "1" })).toBeNull();
		expect(parsePtyClientControlMessage({ data: "12345" })).toBeNull();
	});

	it("keeps ordinary text and JSON primitives as terminal input", () => {
		expect(parsePtyClientControlMessage({ data: "a" })).toBeNull();
		expect(parsePtyClientControlMessage({ data: "true" })).toBeNull();
		expect(parsePtyClientControlMessage({ data: "null" })).toBeNull();
		expect(parsePtyClientControlMessage({ data: '"quoted"' })).toBeNull();
	});

	it("skips JSON parsing for messages that cannot be object controls", () => {
		const parseSpy = vi.spyOn(JSON, "parse");

		expect(parsePtyClientControlMessage({ data: "1" })).toBeNull();
		expect(parsePtyClientControlMessage({ data: "[1,2]" })).toBeNull();
		expect(parsePtyClientControlMessage({ data: " resize" })).toBeNull();

		expect(parseSpy).not.toHaveBeenCalled();
		parseSpy.mockRestore();
	});

	it("parses resize control messages", () => {
		expect(
			parsePtyClientControlMessage({
				data: JSON.stringify({ kind: "resize", cols: 120, rows: 40 }),
			})
		).toEqual({ kind: "resize", cols: 120, rows: 40 });
	});

	it("ignores malformed resize control messages", () => {
		expect(
			parsePtyClientControlMessage({
				data: JSON.stringify({ kind: "resize", cols: "120", rows: 40 }),
			})
		).toBeNull();
		expect(
			parsePtyClientControlMessage({
				data: JSON.stringify({ kind: "input", text: "1" }),
			})
		).toBeNull();
	});
});

describe("buildDaytonaPtyId", () => {
	it("adds a nonce so stale Daytona PTYs do not block reconnects", () => {
		expect(
			buildDaytonaPtyId({
				sessionId: "53183dac-8d01-47ee-bfa1-5c6766d2dee7",
				nonce: "abc12345",
			})
		).toBe("qcut-agent-53183dac-8d0-abc12345");
	});

	it("removes unsafe characters from the session prefix", () => {
		expect(
			buildDaytonaPtyId({
				sessionId: "session../with spaces",
				nonce: "safe",
			})
		).toBe("qcut-agent-sessionwiths-safe");
	});
});

describe("buildCodexStartupCommand", () => {
	it("starts Codex with bypassed approvals and QCut skill guidance", () => {
		const command = buildCodexStartupCommand({
			sessionId: "agent-session-1",
			provider: "daytona",
			expiresAt: "2026-05-16T09:00:00.000Z",
			});

			expect(command).toContain("/usr/local/bin/qcut-entrypoint /bin/true");
			expect(command).toContain("--dangerously-bypass-approvals-and-sandbox");
			expect(command).toContain("Codex exited. QCut shell fallback is ready");
			expect(command).toContain("exec /bin/bash -l");
			expect(command).not.toContain("-a never");
			expect(command).not.toContain("exec codex");
			expect(command).toContain("-C /home/qcut/qcut");
			expect(command).toContain("stty echo");
		expect(command).toContain('[projects."/home/qcut/qcut"]');
		expect(command).toContain('trust_level = "trusted"');
		expect(command).toContain("/home/qcut/qcut/AGENTS.md");
		expect(command).toContain("## QCut Website Chat Agent Defaults");
		expect(command).toContain(
			"/home/qcut/qcut/.claude/skills/native-cli/SKILL.md"
		);
		expect(command).toContain("export QCUT_OUTPUT_DIR=/tmp/qcut-output");
		expect(command).toContain(
			"export NPM_CONFIG_PREFIX=/tmp/qcut-tools/npm-global"
		);
		expect(command).toContain(
			"export NPM_CONFIG_CACHE=/tmp/qcut-tools/npm-cache"
		);
		expect(command).toContain("/tmp/qcut-tools/bin/qcut");
		expect(command).toContain('--output-dir "$QCUT_OUTPUT_DIR"');
		expect(command).toContain(
			"export PATH=/tmp/qcut-tools/bin:/tmp/qcut-tools/npm-global/bin:$PATH"
		);
		expect(command).toContain(
			"npm install -g @openai/codex >/tmp/qcut-tools/codex-bootstrap.log 2>&1 || true"
		);
		expect(command).toContain("/tmp/qcut-output");
		expect(command).not.toContain("/tmp/qcut-codex-boot.md");
	});
});
