import { describe, expect, it } from "vitest";

import {
	buildApp,
	CODEX_AGENT_COMMAND,
	jsonHeaders,
	makeAgentSession,
	mockInsertChain,
	mockSelectRowsOnce,
	mockUpdateChain,
} from "./agent.test-utils";

describe("POST /api/agent/jobs", () => {
	it("creates a queued job for the authenticated user", async () => {
		const { values } = mockInsertChain();

		const res = await buildApp().request("/api/agent/jobs", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({
				command: "qcut system doctor --json --skip-health",
			}),
		});

		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.job.status).toBe("queued");
		expect(body.job.command).toBe("qcut system doctor --json --skip-health");
		expect(values).toHaveBeenCalledTimes(2);
		expect(values).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				userId: "mock-user-001",
				status: "queued",
				command: "qcut system doctor --json --skip-health",
			})
		);
		expect(values).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				userId: "mock-user-001",
				kind: "job_submitted",
			})
		);
	});

	it("records the submitted job source when provided", async () => {
		const { values } = mockInsertChain();

		const res = await buildApp().request("/api/agent/jobs", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({
				command: "qcut system doctor --json --skip-health",
				args: { source: "codex_cli_e2e_probe" },
			}),
		});

		expect(res.status).toBe(201);
		expect(values).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				kind: "job_submitted",
				payload: { source: "codex_cli_e2e_probe" },
			})
		);
	});

	it("creates a queued job attached to an active session", async () => {
		mockSelectRowsOnce({ rows: [makeAgentSession()] });
		const { values } = mockInsertChain();
		const { set } = mockUpdateChain();

		const res = await buildApp().request("/api/agent/jobs", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({
				command: CODEX_AGENT_COMMAND,
				sessionId: "agent-session-1",
				args: { codexPrompt: "Continue the chat." },
			}),
		});

		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.job.sessionId).toBe("agent-session-1");
		expect(values).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				sessionId: "agent-session-1",
				command: CODEX_AGENT_COMMAND,
			})
		);
		expect(values).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				payload: {
					source: "website_chat_agent",
					sessionId: "agent-session-1",
				},
			})
		);
		expect(set).toHaveBeenCalledWith(
			expect.objectContaining({ lastActiveAt: expect.any(Date) })
		);
	});

	it("rejects a job attached to a missing session", async () => {
		mockSelectRowsOnce({ rows: [] });
		const { values } = mockInsertChain();

		const res = await buildApp().request("/api/agent/jobs", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({
				command: CODEX_AGENT_COMMAND,
				sessionId: "missing-session",
				args: { codexPrompt: "Continue the chat." },
			}),
		});

		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ error: "agent_session_not_found" });
		expect(values).not.toHaveBeenCalled();
	});

	it("rejects a job attached to a session owned by another user", async () => {
		mockSelectRowsOnce({ rows: [] });
		const { values } = mockInsertChain();

		const res = await buildApp().request("/api/agent/jobs", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({
				command: CODEX_AGENT_COMMAND,
				sessionId: "other-user-session",
				args: { codexPrompt: "Continue the chat." },
			}),
		});

		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ error: "agent_session_not_found" });
		expect(values).not.toHaveBeenCalled();
	});

	it("rejects unsafe commands before inserting rows", async () => {
		const { values } = mockInsertChain();

		const res = await buildApp().request("/api/agent/jobs", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({
				command: "qcut system doctor --json && curl bad",
			}),
		});

		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({
			error: "command_contains_unsafe_token",
		});
		expect(values).not.toHaveBeenCalled();
	});
});
