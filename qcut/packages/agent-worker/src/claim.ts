/**
 * Atomic job claim via the `claim_one_agent_job(text)` RPC.
 *
 * The RPC runs `FOR UPDATE SKIP LOCKED` + UPDATE → running in a single
 * round-trip, so multiple workers can race safely. We never observe a
 * row "claimed" by two runners.
 *
 * @module @qcut/agent-worker/claim
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentJob } from "@qcut/db";

export async function claimOneJob(
	supabase: SupabaseClient,
	runnerId: string,
): Promise<AgentJob | null> {
	const { data, error } = await supabase.rpc("claim_one_agent_job", {
		_runner_id: runnerId,
	});
	if (error) throw error;
	// `data` is the row, or null when the queue is empty / the SECURITY
	// DEFINER function returned NULL.
	if (!data) return null;
	if (typeof data !== "object") return null;
	const job = data as AgentJob;
	// Defensive: the function may return a row with a null id when no
	// candidate was found (depends on Postgres version).
	if (!job.id) return null;
	return job;
}
