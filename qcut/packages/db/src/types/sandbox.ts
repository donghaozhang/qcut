/**
 * TS shapes for sandbox_sessions (PR 06). Mirrors
 * supabase/migrations/20260514000100_sandbox_sessions.sql.
 *
 * @module @qcut/db/types/sandbox
 */

export type SandboxStatus = "spawning" | "active" | "stopping" | "ended";
export type SandboxProvider = "e2b" | "daytona";
export type SandboxEndReason =
	| "disconnect"
	| "idle_timeout"
	| "ttl"
	| "error"
	| "user_kill";
export type SandboxResourceClass = "standard" | "large";

export interface SandboxSession {
	id: string;
	workspace_id: string;
	user_id: string;
	status: SandboxStatus;
	provider: SandboxProvider;
	provider_session_id: string;
	image_tag: string;
	started_at: string;
	last_input_at: string | null;
	ended_at: string | null;
	end_reason: SandboxEndReason | null;
	exit_code: number | null;
	resource_class: SandboxResourceClass;
	expires_at: string;
}
