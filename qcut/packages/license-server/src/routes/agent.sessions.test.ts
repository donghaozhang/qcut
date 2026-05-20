import { describe, expect, it } from "vitest";

import {
	buildApp,
	db,
	jsonHeaders,
	makeAgentSession,
	mockInsertChain,
	mockSelectRowsOnce,
	mockUpdateChain,
} from "./agent.test-utils";

describe("POST /api/agent/sessions", () => {
	it("creates an active Daytona session when none can be reused", async () => {
		mockSelectRowsOnce({ rows: [] });
		const { values } = mockInsertChain();

		const res = await buildApp().request("/api/agent/sessions", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({}),
		});

		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.session.status).toBe("active");
		expect(body.session.provider).toBe("daytona");
		expect(values).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: "mock-user-001",
				status: "active",
				provider: "daytona",
			})
		);
	});

	it("reuses the newest active session", async () => {
		mockSelectRowsOnce({ rows: [makeAgentSession()] });

		const res = await buildApp().request("/api/agent/sessions", {
			method: "POST",
			headers: jsonHeaders(),
			body: JSON.stringify({}),
		});

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.session.id).toBe("agent-session-1");
		expect(db.insert).not.toHaveBeenCalled();
	});
});

describe("POST /api/agent/sessions/:sessionId/end", () => {
	it("marks the owned session as stopping for worker cleanup", async () => {
		mockSelectRowsOnce({ rows: [makeAgentSession()] });
		const { set } = mockUpdateChain();

		const res = await buildApp().request(
			"/api/agent/sessions/agent-session-1/end",
			{
				method: "POST",
				headers: jsonHeaders(),
				body: JSON.stringify({}),
			}
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.session.status).toBe("stopping");
		expect(set).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "stopping",
				endReason: "user_kill",
			})
		);
	});

	it("returns 404 when ending a session owned by another user", async () => {
		mockSelectRowsOnce({ rows: [] });
		const { set } = mockUpdateChain();

		const res = await buildApp().request(
			"/api/agent/sessions/other-user-session/end",
			{
				method: "POST",
				headers: jsonHeaders(),
				body: JSON.stringify({}),
			}
		);

		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ error: "agent_session_not_found" });
		expect(set).not.toHaveBeenCalled();
	});
});
