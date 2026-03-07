import { describe, it, expect } from "vitest";
import { create, manifest } from "../index.js";
import type {
	AgentLaunchConfig,
	RuntimeHandle,
	Session,
} from "@composio/ao-core";

function makeConfig(
	overrides: Partial<AgentLaunchConfig> = {}
): AgentLaunchConfig {
	return {
		sessionId: "test-1",
		projectConfig: {
			name: "test",
			repo: "owner/repo",
			path: "/workspace",
			defaultBranch: "main",
			sessionPrefix: "test",
		},
		...overrides,
	};
}

function makeSession(overrides: Partial<Session> = {}): Session {
	return {
		id: "test-1",
		projectId: "test",
		status: "working",
		activity: null,
		branch: null,
		issueId: null,
		pr: null,
		workspacePath: null,
		runtimeHandle: null,
		agentInfo: null,
		createdAt: new Date(),
		lastActivityAt: new Date(),
		metadata: {},
		...overrides,
	};
}

describe("agent-acp manifest", () => {
	it("has correct slot and name", () => {
		expect(manifest.name).toBe("acp");
		expect(manifest.slot).toBe("agent");
	});
});

describe("agent-acp getLaunchCommand", () => {
	it("uses default command when agentConfig.command is not set", () => {
		const agent = create();
		const cmd = agent.getLaunchCommand(makeConfig());
		expect(cmd).toBe("gemini");
	});

	it("uses custom command from agentConfig.command", () => {
		const agent = create();
		const cmd = agent.getLaunchCommand(
			makeConfig({
				projectConfig: {
					name: "test",
					repo: "owner/repo",
					path: "/workspace",
					defaultBranch: "main",
					sessionPrefix: "test",
					agentConfig: { command: "opencode" },
				},
			})
		);
		expect(cmd).toBe("opencode");
	});

	it("includes --model flag when model is set", () => {
		const agent = create();
		const cmd = agent.getLaunchCommand(makeConfig({ model: "gpt-4o" }));
		expect(cmd).toContain("--model");
		expect(cmd).toContain("gpt-4o");
	});

	it("includes --prompt-file when promptFile is set", () => {
		const agent = create();
		const cmd = agent.getLaunchCommand(
			makeConfig({ promptFile: "/tmp/prompt.md" })
		);
		expect(cmd).toContain("--prompt-file");
		expect(cmd).toContain("/tmp/prompt.md");
	});

	it("does not include prompt arguments (prompts go via ACP)", () => {
		const agent = create();
		const cmd = agent.getLaunchCommand(
			makeConfig({ prompt: "fix the bug" })
		);
		expect(cmd).not.toContain("fix the bug");
	});
});

describe("agent-acp getEnvironment", () => {
	it("sets QAGENT_SESSION_ID", () => {
		const agent = create();
		const env = agent.getEnvironment(
			makeConfig({ sessionId: "sess-42" })
		);
		expect(env.QAGENT_SESSION_ID).toBe("sess-42");
	});

	it("sets QAGENT_ISSUE_ID when issueId provided", () => {
		const agent = create();
		const env = agent.getEnvironment(makeConfig({ issueId: "GH-123" }));
		expect(env.QAGENT_ISSUE_ID).toBe("GH-123");
	});

	it("sets QAGENT_ACP_AUTO_APPROVE when permissions=skip", () => {
		const agent = create();
		const env = agent.getEnvironment(
			makeConfig({ permissions: "skip" })
		);
		expect(env.QAGENT_ACP_AUTO_APPROVE).toBe("true");
	});

	it("does not set auto-approve when permissions=default", () => {
		const agent = create();
		const env = agent.getEnvironment(
			makeConfig({ permissions: "default" })
		);
		expect(env.QAGENT_ACP_AUTO_APPROVE).toBeUndefined();
	});
});

describe("agent-acp detectActivity", () => {
	it("returns idle for empty output", () => {
		const agent = create();
		expect(agent.detectActivity("")).toBe("idle");
		expect(agent.detectActivity("  \n  ")).toBe("idle");
	});

	it("returns idle after prompt completion", () => {
		const agent = create();
		const output = [
			"[prompt] fix the bug",
			"some output",
			"[prompt complete] stopReason=end_turn",
		].join("\n");
		expect(agent.detectActivity(output)).toBe("idle");
	});

	it("returns idle after prompt error", () => {
		const agent = create();
		expect(agent.detectActivity("[prompt error] connection lost")).toBe(
			"idle"
		);
	});

	it("returns idle after process exit", () => {
		const agent = create();
		expect(
			agent.detectActivity("[process exited with code 0]")
		).toBe("idle");
	});

	it("returns active during tool execution", () => {
		const agent = create();
		expect(agent.detectActivity("[tool] Edit (in_progress)")).toBe(
			"active"
		);
		expect(
			agent.detectActivity("[tool_update] call_1: completed")
		).toBe("active");
	});

	it("returns active during prompt", () => {
		const agent = create();
		expect(
			agent.detectActivity("[prompt] refactor the function...")
		).toBe("active");
	});

	it("returns active for generic output", () => {
		const agent = create();
		expect(agent.detectActivity("Working on the task...")).toBe("active");
	});
});

describe("agent-acp getActivityState", () => {
	it("returns exited when no runtime handle", async () => {
		const agent = create();
		const result = await agent.getActivityState(makeSession());
		expect(result?.state).toBe("exited");
	});

	it("returns exited when process is dead", async () => {
		const agent = create();
		const handle: RuntimeHandle = {
			id: "test-1",
			runtimeName: "acp",
			data: { pid: 99999999 },
		};
		const result = await agent.getActivityState(
			makeSession({ runtimeHandle: handle })
		);
		expect(result?.state).toBe("exited");
	});

	it("returns null when runtime is not acp (no acpState)", async () => {
		const agent = create();
		const handle: RuntimeHandle = {
			id: "test-1",
			runtimeName: "acp",
			data: {
				pid: process.pid, // current process - alive
			},
		};
		const result = await agent.getActivityState(
			makeSession({ runtimeHandle: handle })
		);
		// No acpState → null (unknown)
		expect(result).toBeNull();
	});

	it("returns active when prompt is in progress", async () => {
		const agent = create();
		const handle: RuntimeHandle = {
			id: "test-1",
			runtimeName: "acp",
			data: {
				pid: process.pid,
				acpState: {
					lastUpdateType: "tool_call",
					lastUpdateAt: Date.now(),
					promptInProgress: true,
				},
			},
		};
		const result = await agent.getActivityState(
			makeSession({ runtimeHandle: handle })
		);
		expect(result?.state).toBe("active");
	});

	it("returns ready when prompt just finished", async () => {
		const agent = create();
		const handle: RuntimeHandle = {
			id: "test-1",
			runtimeName: "acp",
			data: {
				pid: process.pid,
				acpState: {
					lastUpdateType: "message",
					lastUpdateAt: Date.now(),
					promptInProgress: false,
				},
			},
		};
		const result = await agent.getActivityState(
			makeSession({ runtimeHandle: handle })
		);
		expect(result?.state).toBe("ready");
	});

	it("returns idle when last update was long ago", async () => {
		const agent = create();
		const handle: RuntimeHandle = {
			id: "test-1",
			runtimeName: "acp",
			data: {
				pid: process.pid,
				acpState: {
					lastUpdateType: "message",
					lastUpdateAt: Date.now() - 600_000, // 10 min ago
					promptInProgress: false,
				},
			},
		};
		const result = await agent.getActivityState(
			makeSession({ runtimeHandle: handle })
		);
		expect(result?.state).toBe("idle");
	});
});

describe("agent-acp isProcessRunning", () => {
	it("returns false for non-existent PID", async () => {
		const agent = create();
		const handle: RuntimeHandle = {
			id: "test-1",
			runtimeName: "acp",
			data: { pid: 99999999 },
		};
		expect(await agent.isProcessRunning(handle)).toBe(false);
	});

	it("returns true for current process PID", async () => {
		const agent = create();
		const handle: RuntimeHandle = {
			id: "test-1",
			runtimeName: "acp",
			data: { pid: process.pid },
		};
		expect(await agent.isProcessRunning(handle)).toBe(true);
	});

	it("returns false for invalid PID", async () => {
		const agent = create();
		const handle: RuntimeHandle = {
			id: "test-1",
			runtimeName: "acp",
			data: { pid: -1 },
		};
		expect(await agent.isProcessRunning(handle)).toBe(false);
	});
});

describe("agent-acp getSessionInfo", () => {
	it("returns null when no runtime handle", async () => {
		const agent = create();
		const result = await agent.getSessionInfo(makeSession());
		expect(result).toBeNull();
	});

	it("returns acpSessionId from handle data", async () => {
		const agent = create();
		const result = await agent.getSessionInfo(
			makeSession({
				runtimeHandle: {
					id: "test-1",
					runtimeName: "acp",
					data: { acpSessionId: "sess_abc123" },
				},
			})
		);
		expect(result?.agentSessionId).toBe("sess_abc123");
		expect(result?.summary).toBeNull();
	});
});
