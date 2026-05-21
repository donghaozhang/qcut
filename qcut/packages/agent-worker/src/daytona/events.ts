import type { SupabaseClient } from "@supabase/supabase-js";

import type { AgentJob } from "@qcut/db";

import { insertAgentEvents } from "../stream-events.js";

export async function recordAgentEvent({
	supabase,
	job,
	kind,
	payload,
}: {
	supabase: SupabaseClient;
	job: AgentJob;
	kind: string;
	payload: Record<string, unknown>;
}): Promise<void> {
	await insertAgentEvents({
		supabase,
		rows: [
			{
				job_id: job.id,
				user_id: job.userId,
				kind,
				payload,
				created_at: new Date().toISOString(),
			},
		],
	});
}
