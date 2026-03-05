import { describe, it, expect, vi } from "vitest";
import type { Agent } from "@composio/ao-core";
import { sessionToDashboard, enrichSessionAgentSummary } from "../serialize";
import { createCoreSession } from "./serialize-test-helpers";

function createMockAgent(
	info: Partial<Awaited<ReturnType<Agent["getSessionInfo"]>>> | null = null,
): Agent {
	return {
		name: "mock",
		processName: "mock",
		getLaunchCommand: vi.fn().mockReturnValue("mock"),
		getEnvironment: vi.fn().mockReturnValue({}),
		detectActivity: vi.fn().mockReturnValue("active"),
		getActivityState: vi.fn().mockResolvedValue({ activity: "active" }),
		getSessionInfo: vi.fn().mockResolvedValue(
			info
				? {
						summary: info.summary ?? null,
						summaryIsFallback: info.summaryIsFallback,
						agentSessionId: info.agentSessionId ?? null,
						cost: info.cost,
					}
				: null,
		),
		sendMessage: vi.fn(),
	};
}

describe("enrichSessionAgentSummary", () => {
	it("should set summary and summaryIsFallback false from agent", async () => {
		const core = createCoreSession();
		const dashboard = sessionToDashboard(core);
		expect(dashboard.summary).toBeNull();

		const agent = createMockAgent({
			summary: "Working on feature X",
			summaryIsFallback: false,
		});

		await enrichSessionAgentSummary(dashboard, core, agent);

		expect(dashboard.summary).toBe("Working on feature X");
		expect(dashboard.summaryIsFallback).toBe(false);
	});

	it("should propagate summaryIsFallback true from agent", async () => {
		const core = createCoreSession();
		const dashboard = sessionToDashboard(core);

		const agent = createMockAgent({
			summary: "You are working on issue #42...",
			summaryIsFallback: true,
		});

		await enrichSessionAgentSummary(dashboard, core, agent);

		expect(dashboard.summary).toBe("You are working on issue #42...");
		expect(dashboard.summaryIsFallback).toBe(true);
	});

	it("should default summaryIsFallback to false when agent omits it", async () => {
		const core = createCoreSession();
		const dashboard = sessionToDashboard(core);

		const agent = createMockAgent({
			summary: "Working on feature X",
		});

		await enrichSessionAgentSummary(dashboard, core, agent);

		expect(dashboard.summary).toBe("Working on feature X");
		expect(dashboard.summaryIsFallback).toBe(false);
	});

	it("should set token usage from agent session info", async () => {
		const core = createCoreSession();
		const dashboard = sessionToDashboard(core);
		expect(dashboard.tokenUsage).toEqual({
			inputTokens: 0,
			outputTokens: 0,
			totalTokens: 0,
			estimatedCostUsd: 0,
		});

		const agent = createMockAgent({
			cost: {
				inputTokens: 2000,
				outputTokens: 750,
				estimatedCostUsd: 0.042,
			},
		});

		await enrichSessionAgentSummary(dashboard, core, agent);

		expect(dashboard.tokenUsage).toEqual({
			inputTokens: 2000,
			outputTokens: 750,
			totalTokens: 2750,
			estimatedCostUsd: 0.042,
		});
	});

	it("should skip enrichment when summary and token usage already exist", async () => {
		const core = createCoreSession({
			agentInfo: {
				summary: "Existing summary",
				summaryIsFallback: false,
				agentSessionId: "abc",
				cost: {
					inputTokens: 1000,
					outputTokens: 500,
					estimatedCostUsd: 0.01,
				},
			},
		});
		const dashboard = sessionToDashboard(core);
		expect(dashboard.summary).toBe("Existing summary");
		expect(dashboard.tokenUsage).toEqual({
			inputTokens: 1000,
			outputTokens: 500,
			totalTokens: 1500,
			estimatedCostUsd: 0.01,
		});

		const agent = createMockAgent({
			summary: "New summary from agent",
			summaryIsFallback: false,
		});

		await enrichSessionAgentSummary(dashboard, core, agent);

		expect(dashboard.summary).toBe("Existing summary");
		expect(agent.getSessionInfo).not.toHaveBeenCalled();
	});

	it("should handle agent.getSessionInfo throwing", async () => {
		const core = createCoreSession();
		const dashboard = sessionToDashboard(core);

		const agent: Agent = {
			...createMockAgent(),
			getSessionInfo: vi.fn().mockRejectedValue(new Error("JSONL corrupted")),
		};

		await enrichSessionAgentSummary(dashboard, core, agent);

		expect(dashboard.summary).toBeNull();
		expect(dashboard.summaryIsFallback).toBe(false);
	});

	it("should not update when agent returns null info", async () => {
		const core = createCoreSession();
		const dashboard = sessionToDashboard(core);
		const agent = createMockAgent(null);

		await enrichSessionAgentSummary(dashboard, core, agent);

		expect(dashboard.summary).toBeNull();
		expect(dashboard.summaryIsFallback).toBe(false);
	});

	it("should not update when agent returns info with null summary", async () => {
		const core = createCoreSession();
		const dashboard = sessionToDashboard(core);
		const agent = createMockAgent({ summary: null });

		await enrichSessionAgentSummary(dashboard, core, agent);

		expect(dashboard.summary).toBeNull();
		expect(dashboard.summaryIsFallback).toBe(false);
	});
});
