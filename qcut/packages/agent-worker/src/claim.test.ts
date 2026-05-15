import { describe, expect, it } from "vitest";

import { normalizeAgentJob } from "./claim";

describe("normalizeAgentJob", () => {
	it("maps Supabase RPC snake_case rows to AgentJob camelCase fields", () => {
		const job = normalizeAgentJob({
			row: {
				id: "job-1",
				user_id: "user-1",
				status: "running",
				command: "qcut system doctor --json --skip-health",
				args: { dryRun: true },
				created_at: "2026-05-15T00:00:00.000Z",
				claimed_at: "2026-05-15T00:00:01.000Z",
				finished_at: null,
				exit_code: null,
				error: null,
				runner_id: "runner-1",
			},
		});

		expect(job).toMatchObject({
			id: "job-1",
			userId: "user-1",
			status: "running",
			command: "qcut system doctor --json --skip-health",
			args: { dryRun: true },
			claimedAt: new Date("2026-05-15T00:00:01.000Z"),
			finishedAt: null,
			exitCode: null,
			error: null,
			runnerId: "runner-1",
		});
	});

	it("keeps existing camelCase jobs unchanged", () => {
		const createdAt = new Date("2026-05-15T00:00:00.000Z");
		const job = normalizeAgentJob({
			row: {
				id: "job-1",
				userId: "user-1",
				status: "queued",
				command: "qcut system doctor --json --skip-health",
				args: {},
				createdAt,
				claimedAt: null,
				finishedAt: null,
				exitCode: null,
				error: null,
				runnerId: null,
			},
		});

		expect(job?.userId).toBe("user-1");
		expect(job?.createdAt).toBe(createdAt);
	});
});
