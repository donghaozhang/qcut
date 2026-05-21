import { describe, expect, it } from "vitest";

import {
	buildApp,
	daytonaMocks,
	DEFAULT_PINNED_QCUT_IMAGE,
	jsonHeaders,
	makeAgentSession,
	mockInsertChain,
	mockSelectRowsOnce,
	mockSelectWhereRowsOnce,
	mockUpdateChain,
} from "./agent.test-utils";

describe("POST /api/agent/sessions/:sessionId/pty-token", () => {
	it("uses the pinned default Daytona image when no override is configured", async () => {
		process.env.DAYTONA_API_KEY = "daytona-test";
		process.env.RELAY_SIGNING_SECRET = "relay-secret";
		Reflect.deleteProperty(process.env, "QCUT_IMAGE_TAG");
		mockSelectRowsOnce({ rows: [makeAgentSession()] });
		mockSelectWhereRowsOnce({ rows: [] });
		const { set } = mockUpdateChain();
		mockInsertChain();
		daytonaMocks.createSandbox.mockResolvedValue({
			data: { id: "sandbox-1", state: "starting" },
		});

		const res = await buildApp().request(
			"/api/agent/sessions/agent-session-1/pty-token",
			{
				method: "POST",
				headers: jsonHeaders(),
				body: JSON.stringify({}),
			}
		);

		const body = await res.json();
		expect(res.status, JSON.stringify(body)).toBe(202);
		expect(daytonaMocks.ImageBase).toHaveBeenCalledWith(
			DEFAULT_PINNED_QCUT_IMAGE
		);
		expect(daytonaMocks.createSandbox).toHaveBeenCalledWith(
			expect.objectContaining({
				buildInfo: {
					dockerfileContent: `FROM ${DEFAULT_PINNED_QCUT_IMAGE}\n`,
				},
			}),
			undefined,
			{ timeout: 45_000 }
		);
		expect(set).toHaveBeenCalledWith(
			expect.objectContaining({
				providerSessionId: "sandbox-1",
				imageTag: DEFAULT_PINNED_QCUT_IMAGE,
			})
		);
	});

	it("starts a Daytona sandbox without waiting for the cold image to boot", async () => {
		process.env.DAYTONA_API_KEY = "daytona-test";
		process.env.RELAY_SIGNING_SECRET = "relay-secret";
		process.env.QCUT_IMAGE_TAG = "qcut-cli:new";
		mockSelectRowsOnce({ rows: [makeAgentSession()] });
		mockSelectWhereRowsOnce({
			rows: [{ key: "IMAROUTER_API_KEY", value: "imarouter-test" }],
		});
		const { set } = mockUpdateChain();
		const { values } = mockInsertChain();
		daytonaMocks.createSandbox.mockResolvedValue({
			data: { id: "sandbox-1", state: "starting" },
		});

		const res = await buildApp().request(
			"/api/agent/sessions/agent-session-1/pty-token",
			{
				method: "POST",
				headers: jsonHeaders(),
				body: JSON.stringify({}),
			}
		);

		const body = await res.json();
		expect(res.status, JSON.stringify(body)).toBe(202);
		expect(body.status).toBe("starting");
		expect(body.retry_after_ms).toBe(3000);
		expect(body.session.providerSessionId).toBe("sandbox-1");
		expect(daytonaMocks.create).not.toHaveBeenCalled();
		expect(daytonaMocks.ImageBase).toHaveBeenCalledWith("qcut-cli:new");
		expect(daytonaMocks.createSandbox).toHaveBeenCalledWith(
			expect.objectContaining({
				buildInfo: { dockerfileContent: "FROM qcut-cli:new\n" },
				env: {
					QCUT_SESSION_ROLE: "agent",
					IMAROUTER_API_KEY: "imarouter-test",
				},
				labels: { "code-toolbox-language": "python" },
				cpu: 2,
				memory: 4,
				autoStopInterval: 120,
				autoDeleteInterval: 0,
			}),
			undefined,
			{ timeout: 45_000 }
		);
		expect(set).toHaveBeenCalledWith(
			expect.objectContaining({
				providerSessionId: "sandbox-1",
				imageTag: "qcut-cli:new",
			})
		);
		expect(values).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: "agent_terminal_starting",
				payload: expect.objectContaining({ sandboxId: "sandbox-1" }),
			})
		);
	});

	it("returns a relay websocket token once the Daytona sandbox is started", async () => {
		process.env.DAYTONA_API_KEY = "daytona-test";
		process.env.RELAY_SIGNING_SECRET = "relay-secret";
		mockSelectRowsOnce({
			rows: [makeAgentSession({ providerSessionId: "sandbox-1" })],
		});
		const { set } = mockUpdateChain();
		const { values } = mockInsertChain();
		daytonaMocks.get.mockResolvedValue({ id: "sandbox-1", state: "started" });

		const res = await buildApp().request(
			"/api/agent/sessions/agent-session-1/pty-token",
			{
				method: "POST",
				headers: jsonHeaders(),
				body: JSON.stringify({}),
			}
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.ws_url).toMatch(
			/^wss:\/\/qcut-relay\.zdhpeter\.workers\.dev\/pty\?token=/
		);
		expect(daytonaMocks.get).toHaveBeenCalledWith("sandbox-1");
		expect(daytonaMocks.createSandbox).not.toHaveBeenCalled();
		expect(set).toHaveBeenCalledWith(
			expect.objectContaining({ providerSessionId: "sandbox-1" })
		);
		expect(values).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: "agent_terminal_ready",
				payload: expect.objectContaining({ sandboxId: "sandbox-1" }),
			})
		);
	});
});
