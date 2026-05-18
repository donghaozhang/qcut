import { describe, expect, it } from "vitest";

import { buildCodexStartupCommand } from "./pty-session";

describe("buildCodexStartupCommand", () => {
	it("starts Codex with bypassed approvals and QCut skill guidance", () => {
		const command = buildCodexStartupCommand({
			sessionId: "agent-session-1",
			provider: "daytona",
			expiresAt: "2026-05-16T09:00:00.000Z",
		});

		expect(command).toContain("/usr/local/bin/qcut-entrypoint /bin/true");
		expect(command).toContain("--dangerously-bypass-approvals-and-sandbox");
		expect(command).not.toContain("-a never");
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
		expect(command).toContain("export NPM_CONFIG_PREFIX=/tmp/qcut-tools/npm-global");
		expect(command).toContain("export NPM_CONFIG_CACHE=/tmp/qcut-tools/npm-cache");
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
