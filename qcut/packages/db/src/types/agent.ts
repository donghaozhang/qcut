/**
 * TS shapes for the agent_* tables (PR 03).
 *
 * These mirror the Supabase migration at
 * supabase/migrations/20260514000000_agent_tables.sql. Keep both
 * in sync — the migration is the source of truth.
 *
 * @module @qcut/db/types/agent
 */

export type AgentJobStatus =
	| "queued"
	| "running"
	| "succeeded"
	| "failed"
	| "cancelled";

export interface AgentJob {
	id: string;
	workspace_id: string;
	status: AgentJobStatus;
	command: string;
	args: Record<string, unknown>;
	created_at: string;
	claimed_at: string | null;
	finished_at: string | null;
	exit_code: number | null;
	error: string | null;
	runner_id: string | null;
}

/** Stream of structured events emitted while a job runs. */
export type AgentEventKind =
	| "cli_progress"
	| "cli_stderr"
	| "doctor_probe"
	| "spawn_started"
	| "spawn_probe_ok"
	| "pty_attached"
	| "motd_sent"
	| "sandbox_io"
	| "proxy_request"
	| (string & { _brand?: "open-enum" }); // open for forward-compat

export interface AgentEvent {
	id: number;
	job_id: string | null;
	workspace_id: string | null;
	kind: AgentEventKind;
	payload: Record<string, unknown>;
	created_at: string;
}

export type AgentArtifactKind = "image" | "video" | "audio" | "json" | "log";

export interface AgentArtifact {
	id: string;
	job_id: string;
	workspace_id: string;
	kind: AgentArtifactKind;
	storage_path: string;
	bytes: number | null;
	meta: Record<string, unknown>;
	created_at: string;
}

export interface AgentSecret {
	id: string;
	workspace_id: string;
	key: string;
	value: string; // plaintext for v0; pgsodium-managed in a future migration
	created_at: string;
	updated_at: string;
}
