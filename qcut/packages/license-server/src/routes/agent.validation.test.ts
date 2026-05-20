import { describe, expect, it } from "vitest";

import {
	buildApp,
	CODEX_AGENT_COMMAND,
	getDefaultAgentUserId,
	jsonHeaders,
	mockInsertChain,
	validateAgentJobBody,
	validateCommand,
} from "./agent.test-utils";

describe("validateCommand", () => {
	it("accepts qcut commands that the worker can tokenize", () => {
		expect(
			validateCommand({
				command:
					"qcut gen image -t qcut-chat-agent-blue-square -m flux_dev --json",
			})
		).toBe("");
	});

	it("rejects empty commands", () => {
		expect(validateCommand({ command: "" })).toBe("command_required");
	});

	it("rejects non-qcut commands", () => {
		expect(validateCommand({ command: "curl https://example.com" })).toBe(
			"command_must_start_with_qcut_or_codex_exec"
		);
	});

	it("accepts the fixed codex exec stdin command", () => {
		expect(validateCommand({ command: CODEX_AGENT_COMMAND })).toBe("");
	});

	it("requires a prompt for codex exec jobs", () => {
		expect(
			validateAgentJobBody({
				command: CODEX_AGENT_COMMAND,
				args: {},
			})
		).toBe("codex_prompt_required");
	});

	it("rejects shell metacharacters", () => {
		expect(
			validateCommand({ command: "qcut system doctor --json; curl bad" })
		).toBe("command_contains_unsafe_token");
	});

	it("creates a queued codex job with prompt args", async () => {
		const { values } = mockInsertChain();

		const res = await buildApp().request("/api/agent/jobs", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({
				command: CODEX_AGENT_COMMAND,
				args: { codexPrompt: "Summarize the project status." },
			}),
		});

		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.job.command).toBe(CODEX_AGENT_COMMAND);
		expect(body.job.args).toEqual({
			codexPrompt: "Summarize the project status.",
		});
		expect(values).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				command: CODEX_AGENT_COMMAND,
				args: { codexPrompt: "Summarize the project status." },
			})
		);
	});
});

describe("agent default user auth", () => {
	it("uses QCUT_AGENT_DEFAULT_USER_ID when no bearer token is supplied", async () => {
		process.env.MOCK_MODE = "false";
		process.env.QCUT_AGENT_DEFAULT_USER_ID = "default-agent-user";
		const { values } = mockInsertChain();

		const res = await buildApp().request("/api/agent/jobs", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({
				command: CODEX_AGENT_COMMAND,
				args: { codexPrompt: "Summarize the sandbox status." },
			}),
		});

		expect(getDefaultAgentUserId()).toBe("default-agent-user");
		expect(res.status).toBe(201);
		expect(values).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				userId: "default-agent-user",
				command: CODEX_AGENT_COMMAND,
			})
		);
	});
});
