import { describe, expect, it } from "vitest";
import type { AgentJob } from "@qcut/db";
import { parseStderr } from "./stream-events";

function fakeJob(): AgentJob {
	return {
		id: "j-1",
		workspace_id: "ws-abc",
		status: "running",
		command: "qcut system doctor --json --skip-health",
		args: {},
		created_at: new Date().toISOString(),
		claimed_at: null,
		finished_at: null,
		exit_code: null,
		error: null,
		runner_id: "r-1",
	};
}

describe("parseStderr", () => {
	it("returns one row per non-empty line", () => {
		const stderr = ['{"kind":"cli_progress","percent":10}', '', "plain log line"].join(
			"\n",
		);
		const rows = parseStderr(stderr, fakeJob());
		expect(rows).toHaveLength(2);
	});

	it("uses kind from JSON payload when present", () => {
		const stderr = '{"kind":"doctor_probe","detail":"ok"}';
		const rows = parseStderr(stderr, fakeJob());
		expect(rows[0]?.kind).toBe("doctor_probe");
	});

	it("falls back to cli_stderr when line is not JSON", () => {
		const stderr = "starting up...";
		const rows = parseStderr(stderr, fakeJob());
		expect(rows[0]?.kind).toBe("cli_stderr");
		expect(rows[0]?.payload).toEqual({ message: "starting up..." });
	});

	it("masks secrets in non-JSON lines", () => {
		const stderr = "loaded OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwx1234";
		const rows = parseStderr(stderr, fakeJob());
		const msg = (rows[0]?.payload as { message: string }).message;
		expect(msg).toContain("***");
		expect(msg).not.toContain("sk-abcdefghi");
	});

	it("preserves workspace_id and job_id in every row", () => {
		const stderr = ["a", "b", "c"].join("\n");
		const job = fakeJob();
		const rows = parseStderr(stderr, job);
		for (const r of rows) {
			expect(r.job_id).toBe(job.id);
			expect(r.workspace_id).toBe(job.workspace_id);
		}
	});

	it("returns empty array for empty input", () => {
		expect(parseStderr("", fakeJob())).toEqual([]);
		expect(parseStderr("\n\n\n", fakeJob())).toEqual([]);
	});
});
