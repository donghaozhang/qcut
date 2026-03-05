import { describe, it, expect } from "vitest";
import {
	mockReadFile,
	mockReaddir,
	mockStat,
	makeSession,
} from "./index.test-harness";
import { create } from "./index.js";

describe("getSessionInfo", () => {
	const agent = create();

	it("returns null when no matching rollout exists", async () => {
		mockReaddir.mockResolvedValue([]);
		expect(await agent.getSessionInfo(makeSession())).toBeNull();
	});

	it("returns null even with null workspacePath", async () => {
		expect(
			await agent.getSessionInfo(makeSession({ workspacePath: null })),
		).toBeNull();
	});

	it("extracts token usage from matching codex rollout", async () => {
		mockReaddir.mockImplementation((dir: string) => {
			if (dir.endsWith("/2026/03/05")) {
				return Promise.resolve(["rollout-a.jsonl"]);
			}
			return Promise.resolve([]);
		});
		mockStat.mockResolvedValue({ mtimeMs: 123_456 });
		mockReadFile.mockImplementation((path: string) => {
			if (path.endsWith("rollout-a.jsonl")) {
				return Promise.resolve(
					[
						JSON.stringify({
							type: "session_meta",
							timestamp: "2026-03-05T05:00:00.000Z",
							payload: {
								id: "codex-session-1",
								timestamp: "2026-03-05T05:00:00.000Z",
								cwd: "/workspace/test",
							},
						}),
						JSON.stringify({
							type: "event_msg",
							payload: {
								type: "token_count",
								info: {
									total_token_usage: {
										input_tokens: 1200,
										output_tokens: 300,
										total_tokens: 1500,
									},
								},
							},
						}),
					].join("\n"),
				);
			}
			return Promise.reject(new Error(`Unexpected read: ${path}`));
		});

		const result = await agent.getSessionInfo(
			makeSession({
				createdAt: new Date("2026-03-05T05:00:05.000Z"),
				workspacePath: "/workspace/test",
			}),
		);

		expect(result).toEqual({
			summary: null,
			agentSessionId: "codex-session-1",
			cost: {
				inputTokens: 1200,
				outputTokens: 300,
				estimatedCostUsd: 0,
			},
		});
	});

	it("returns session id without cost when rollout has no token_count", async () => {
		mockReaddir.mockImplementation((dir: string) => {
			if (dir.endsWith("/2026/03/05")) {
				return Promise.resolve(["rollout-b.jsonl"]);
			}
			return Promise.resolve([]);
		});
		mockStat.mockResolvedValue({ mtimeMs: 123_456 });
		mockReadFile.mockImplementation((path: string) => {
			if (path.endsWith("rollout-b.jsonl")) {
				return Promise.resolve(
					JSON.stringify({
						type: "session_meta",
						payload: {
							id: "codex-session-2",
							timestamp: "2026-03-05T05:10:00.000Z",
							cwd: "/workspace/test",
						},
					}),
				);
			}
			return Promise.reject(new Error(`Unexpected read: ${path}`));
		});

		const result = await agent.getSessionInfo(
			makeSession({
				createdAt: new Date("2026-03-05T05:10:00.000Z"),
				workspacePath: "/workspace/test",
			}),
		);

		expect(result).toEqual({
			summary: null,
			agentSessionId: "codex-session-2",
		});
	});
});
