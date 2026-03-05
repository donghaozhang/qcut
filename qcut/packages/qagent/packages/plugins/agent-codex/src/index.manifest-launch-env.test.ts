import { describe, it, expect } from "vitest";
import { makeLaunchConfig } from "./index.test-harness";
import { create, manifest, default as defaultExport } from "./index.js";

describe("plugin manifest & exports", () => {
	it("has correct manifest", () => {
		expect(manifest).toEqual({
			name: "codex",
			slot: "agent",
			description: "Agent plugin: OpenAI Codex CLI",
			version: "0.1.0",
		});
	});

	it("create() returns agent with correct name and processName", () => {
		const agent = create();
		expect(agent.name).toBe("codex");
		expect(agent.processName).toBe("codex");
	});

	it("default export is a valid PluginModule", () => {
		expect(defaultExport.manifest).toBe(manifest);
		expect(typeof defaultExport.create).toBe("function");
	});
});

describe("getLaunchCommand", () => {
	const agent = create();

	it("generates base command", () => {
		expect(agent.getLaunchCommand(makeLaunchConfig())).toBe("codex");
	});

	it("includes --dangerously-bypass-approvals-and-sandbox when permissions=skip", () => {
		const cmd = agent.getLaunchCommand(
			makeLaunchConfig({ permissions: "skip" }),
		);
		expect(cmd).toContain("--dangerously-bypass-approvals-and-sandbox");
	});

	it("includes --model with shell-escaped value", () => {
		const cmd = agent.getLaunchCommand(makeLaunchConfig({ model: "gpt-4o" }));
		expect(cmd).toContain("--model 'gpt-4o'");
	});

	it("appends shell-escaped prompt with -- separator", () => {
		const cmd = agent.getLaunchCommand(makeLaunchConfig({ prompt: "Fix it" }));
		expect(cmd).toContain("-- 'Fix it'");
	});

	it("combines all options", () => {
		const cmd = agent.getLaunchCommand(
			makeLaunchConfig({ permissions: "skip", model: "o3", prompt: "Go" }),
		);
		expect(cmd).toBe(
			"codex --dangerously-bypass-approvals-and-sandbox --model 'o3' -- 'Go'",
		);
	});

	it("escapes single quotes in prompt (POSIX shell escaping)", () => {
		const cmd = agent.getLaunchCommand(
			makeLaunchConfig({ prompt: "it's broken" }),
		);
		expect(cmd).toContain("-- 'it'\\''s broken'");
	});

	it("escapes dangerous characters in prompt", () => {
		const cmd = agent.getLaunchCommand(
			makeLaunchConfig({ prompt: "$(rm -rf /); `evil`; $HOME" }),
		);
		expect(cmd).toContain("-- '$(rm -rf /); `evil`; $HOME'");
	});

	it("includes -c model_instructions_file when systemPromptFile is set", () => {
		const cmd = agent.getLaunchCommand(
			makeLaunchConfig({ systemPromptFile: "/tmp/prompt.md" }),
		);
		expect(cmd).toContain("-c model_instructions_file='/tmp/prompt.md'");
	});

	it("prefers systemPromptFile over systemPrompt", () => {
		const cmd = agent.getLaunchCommand(
			makeLaunchConfig({
				systemPromptFile: "/tmp/prompt.md",
				systemPrompt: "Ignored",
			}),
		);
		expect(cmd).toContain("model_instructions_file='/tmp/prompt.md'");
		expect(cmd).not.toContain("'Ignored'");
	});

	it("includes -c developer_instructions when systemPrompt is set", () => {
		const cmd = agent.getLaunchCommand(
			makeLaunchConfig({ systemPrompt: "Be helpful" }),
		);
		expect(cmd).toContain("-c developer_instructions='Be helpful'");
	});

	it("omits optional flags when not provided", () => {
		const cmd = agent.getLaunchCommand(makeLaunchConfig());
		expect(cmd).not.toContain("--dangerously-bypass-approvals-and-sandbox");
		expect(cmd).not.toContain("--model");
		expect(cmd).not.toContain("-c");
	});
});

describe("getEnvironment", () => {
	const agent = create();

	it("sets QAGENT_SESSION_ID but not QAGENT_PROJECT_ID (caller's responsibility)", () => {
		const env = agent.getEnvironment(makeLaunchConfig());
		expect(env.QAGENT_SESSION_ID).toBe("sess-1");
		expect(env.QAGENT_PROJECT_ID).toBeUndefined();
	});

	it("sets QAGENT_ISSUE_ID when provided", () => {
		const env = agent.getEnvironment(makeLaunchConfig({ issueId: "GH-42" }));
		expect(env.QAGENT_ISSUE_ID).toBe("GH-42");
	});

	it("omits QAGENT_ISSUE_ID when not provided", () => {
		const env = agent.getEnvironment(makeLaunchConfig());
		expect(env.QAGENT_ISSUE_ID).toBeUndefined();
	});

	it("prepends ~/.qagent/bin to PATH for shell wrappers", () => {
		const env = agent.getEnvironment(makeLaunchConfig());
		expect(env.PATH).toMatch(/^.*\/\.qagent\/bin:/);
	});

	it("PATH starts with the qagent bin dir specifically", () => {
		const env = agent.getEnvironment(makeLaunchConfig());
		expect(env.PATH?.startsWith("/mock/home/.qagent/bin:")).toBe(true);
	});

	it("falls back to /usr/bin:/bin when process.env.PATH is undefined", () => {
		const originalPath = process.env.PATH;
		delete process.env.PATH;
		try {
			const env = agent.getEnvironment(makeLaunchConfig());
			expect(env.PATH).toContain("/usr/bin:/bin");
		} finally {
			process.env.PATH = originalPath;
		}
	});
});
