import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, vi } from "vitest";

import type { AgentJob } from "@qcut/db";

import {
	buildDaytonaCommand,
	buildDaytonaEnv,
	cleanupDaytonaAgentSessions,
	runOnDaytona,
} from "./run-on-daytona";

export {
	buildDaytonaCommand,
	buildDaytonaEnv,
	cleanupDaytonaAgentSessions,
	runOnDaytona,
};

const originalDaytonaApiKey = process.env.DAYTONA_API_KEY;

export const CODEX_AGENT_COMMAND = "codex exec --skip-git-repo-check --json -";
export const EXPECTED_QCUT_DOCTOR_DAYTONA_COMMAND = [
	"mkdir -p /tmp/qcut-output",
	"set +e",
	"/usr/local/bin/qcut-entrypoint qcut system doctor --json --skip-health -o /tmp/qcut-output > /tmp/qcut-output/qcut-stdout.txt 2> /tmp/qcut-output/qcut-stderr.txt",
	"exit_code=$?",
	"printf '{\"exitCode\":%s}\\n' \"$exit_code\" > /tmp/qcut-output/qcut-exit.json",
	'[ "$exit_code" -eq 0 ]',
].join("; ");
export const EXPECTED_QCUT_IMAGE_DAYTONA_COMMAND = [
	"mkdir -p /tmp/qcut-output",
	"set +e",
	"/usr/local/bin/qcut-entrypoint qcut gen image -t icon,logo -m flux_dev --json -o /tmp/qcut-output > /tmp/qcut-output/qcut-stdout.txt 2> /tmp/qcut-output/qcut-stderr.txt",
	"exit_code=$?",
	"printf '{\"exitCode\":%s}\\n' \"$exit_code\" > /tmp/qcut-output/qcut-exit.json",
	'[ "$exit_code" -eq 0 ]',
].join("; ");

afterEach(() => {
	process.env.DAYTONA_API_KEY = originalDaytonaApiKey;
	vi.restoreAllMocks();
});

export function makeJob(overrides: Partial<AgentJob> = {}): AgentJob {
	return {
		id: "job-1",
		userId: "user-1",
		sessionId: null,
		status: "running",
		command: "qcut system doctor --json --skip-health",
		args: {},
		createdAt: new Date("2026-05-14T00:00:00.000Z"),
		claimedAt: new Date("2026-05-14T00:00:01.000Z"),
		finishedAt: null,
		exitCode: null,
		error: null,
		runnerId: "runner-1",
		...overrides,
	};
}

export function makeSupabase({
	secrets = [{ key: "OPENAI_API_KEY", value: "sk-test" }],
	agentSessions = [],
}: {
	secrets?: Array<{ key: string; value: string }>;
	agentSessions?: Array<Record<string, unknown>>;
} = {}): {
	client: SupabaseClient;
	insertedEvents: unknown[];
	sessionUpdates: Array<Record<string, unknown>>;
} {
	const insertedEvents: unknown[] = [];
	const sessionUpdates: Array<Record<string, unknown>> = [];
	const client = {
		from(table: string) {
			if (table === "agent_secrets") {
				return {
					select() {
						return {
							eq() {
								return Promise.resolve({ data: secrets, error: null });
							},
						};
					},
				};
			}
			if (table === "agent_sessions") {
				return {
					select() {
						const filters: Record<string, unknown> = {};
						const chain = {
							eq(column: string, value: unknown) {
								filters[column] = value;
								return chain;
							},
							maybeSingle() {
								const row = agentSessions.find((session) =>
									Object.entries(filters).every(
										([column, value]) => session[column] === value
									)
								);
								return Promise.resolve({ data: row ?? null, error: null });
							},
							in() {
								return chain;
							},
							or() {
								return chain;
							},
							limit() {
								return Promise.resolve({
									data: agentSessions,
									error: null,
								});
							},
						};
						return chain;
					},
					update(values: Record<string, unknown>) {
						sessionUpdates.push(values);
						return {
							eq() {
								return {
									eq() {
										return Promise.resolve({ data: null, error: null });
									},
								};
							},
						};
					},
				};
			}

			return {
				insert(row: unknown) {
					insertedEvents.push(row);
					return Promise.resolve({ data: null, error: null });
				},
			};
		},
	} as unknown as SupabaseClient;

	return { client, insertedEvents, sessionUpdates };
}

export function flattenInsertedEvents({
	insertedEvents,
}: {
	insertedEvents: unknown[];
}): Array<{ kind?: unknown; payload?: unknown }> {
	const rows: Array<{ kind?: unknown; payload?: unknown }> = [];
	for (const entry of insertedEvents) {
		if (Array.isArray(entry)) {
			for (const row of entry) {
				rows.push(row as { kind?: unknown; payload?: unknown });
			}
			continue;
		}
		rows.push(entry as { kind?: unknown; payload?: unknown });
	}
	return rows;
}
