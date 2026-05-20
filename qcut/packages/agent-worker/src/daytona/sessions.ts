import { Daytona } from "@daytona/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AgentJob } from "@qcut/db";

import {
	AGENT_SESSION_CLEANUP_LIMIT,
	DAYTONA_CREATE_TIMEOUT_SECONDS,
	DEFAULT_AGENT_SESSION_IDLE_MS,
	IMAGE_TAG,
	SESSION_SANDBOX_AUTO_STOP_MINUTES,
} from "./constants.js";
import { recordAgentEvent } from "./events.js";
import type {
	AgentSessionRow,
	CleanupDaytonaAgentSessionsParams,
	DaytonaClient,
	DaytonaClientCtor,
	DaytonaSandbox,
	PreparedSandbox,
} from "./types.js";

function getJobSessionId({ job }: { job: AgentJob }): string | null {
	const value = job.sessionId;
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: null;
}

function getAgentSessionIdleMs(): number {
	const parsed = Number(process.env.AGENT_SESSION_IDLE_MS);
	return Number.isFinite(parsed) && parsed > 0
		? parsed
		: DEFAULT_AGENT_SESSION_IDLE_MS;
}

async function fetchAgentSession({
	supabase,
	job,
	sessionId,
}: {
	supabase: SupabaseClient;
	job: AgentJob;
	sessionId: string;
}): Promise<AgentSessionRow> {
	const { data, error } = await supabase
		.from("agent_sessions")
		.select(
			"id, user_id, status, provider_session_id, image_tag, last_active_at, expires_at, end_reason"
		)
		.eq("id", sessionId)
		.eq("user_id", job.userId)
		.maybeSingle();
	if (error) {
		throw new Error(`agent_sessions fetch failed: ${error.message}`);
	}
	if (!data) {
		throw new Error(`agent session ${sessionId} was not found`);
	}
	const row = data as AgentSessionRow;
	if (row.status !== "active") {
		throw new Error(`agent session ${sessionId} is ${row.status}`);
	}
	if (Date.parse(row.expires_at) <= Date.now()) {
		throw new Error(`agent session ${sessionId} expired`);
	}
	return row;
}

export async function updateAgentSession({
	supabase,
	sessionId,
	userId,
	values,
}: {
	supabase: SupabaseClient;
	sessionId: string;
	userId: string;
	values: Record<string, unknown>;
}): Promise<void> {
	const { error } = await supabase
		.from("agent_sessions")
		.update(values)
		.eq("id", sessionId)
		.eq("user_id", userId);
	if (error) {
		throw new Error(`agent_sessions update failed: ${error.message}`);
	}
}

async function createDaytonaSandbox({
	daytona,
	envVars,
	imageTag,
	autoStopInterval,
}: {
	daytona: DaytonaClient;
	envVars: Record<string, string>;
	imageTag: string;
	autoStopInterval: number;
}): Promise<DaytonaSandbox> {
	return daytona.create(
		{
			image: imageTag,
			envVars,
			resources: { cpu: 2, memory: 4 },
			ephemeral: true,
			autoStopInterval,
		},
		{ timeout: DAYTONA_CREATE_TIMEOUT_SECONDS }
	);
}

async function getReusableSandbox({
	daytona,
	session,
}: {
	daytona: DaytonaClient;
	session: AgentSessionRow;
}): Promise<DaytonaSandbox | null> {
	if (!session.provider_session_id) {
		return null;
	}
	try {
		return await daytona.get(session.provider_session_id);
	} catch (error) {
		console.warn(
			`[agent-worker] Daytona session ${session.id} sandbox ${session.provider_session_id} is unavailable; creating a replacement:`,
			error
		);
		return null;
	}
}

export async function prepareDaytonaSandbox({
	supabase,
	job,
	daytona,
	envVars,
}: {
	supabase: SupabaseClient;
	job: AgentJob;
	daytona: DaytonaClient;
	envVars: Record<string, string>;
}): Promise<PreparedSandbox> {
	const agentSessionId = getJobSessionId({ job });
	if (!agentSessionId) {
		const sandbox = await createDaytonaSandbox({
			daytona,
			envVars,
			imageTag: IMAGE_TAG,
			autoStopInterval: 30,
		});
		await recordAgentEvent({
			supabase,
			job,
			kind: "daytona_sandbox_ready",
			payload: { sandboxId: sandbox.id, image: IMAGE_TAG },
		});
		return {
			sandbox,
			deleteSandboxOnFinish: true,
			agentSessionId: null,
		};
	}

	const agentSession = await fetchAgentSession({
		supabase,
		job,
		sessionId: agentSessionId,
	});
	const reusableSandbox = await getReusableSandbox({
		daytona,
		session: agentSession,
	});
	const sandbox =
		reusableSandbox ??
		(await createDaytonaSandbox({
			daytona,
			envVars,
			imageTag: agentSession.image_tag || IMAGE_TAG,
			autoStopInterval: SESSION_SANDBOX_AUTO_STOP_MINUTES,
		}));
	await updateAgentSession({
		supabase,
		sessionId: agentSession.id,
		userId: job.userId,
		values: {
			provider_session_id: sandbox.id,
			image_tag: IMAGE_TAG,
			last_active_at: new Date().toISOString(),
			runner_id: job.runnerId ?? null,
		},
	});
	await recordAgentEvent({
		supabase,
		job,
		kind: "agent_session_ready",
		payload: {
			sessionId: agentSession.id,
			sandboxId: sandbox.id,
			reused: Boolean(reusableSandbox),
			image: IMAGE_TAG,
		},
	});
	return {
		sandbox,
		deleteSandboxOnFinish: false,
		agentSessionId: agentSession.id,
	};
}

function getSessionEndReason({
	session,
	nowMs,
}: {
	session: AgentSessionRow;
	nowMs: number;
}): "idle_timeout" | "ttl" | "user_kill" {
	if (session.status === "stopping") {
		return "user_kill";
	}
	if (Date.parse(session.expires_at) <= nowMs) {
		return "ttl";
	}
	return "idle_timeout";
}

async function endDaytonaAgentSession({
	supabase,
	daytona,
	session,
	runnerId,
}: {
	supabase: SupabaseClient;
	daytona: DaytonaClient;
	session: AgentSessionRow;
	runnerId: string;
}): Promise<void> {
	const now = new Date();
	const endReason = getSessionEndReason({
		session,
		nowMs: now.getTime(),
	});
	if (session.provider_session_id) {
		try {
			const sandbox = await daytona.get(session.provider_session_id);
			await daytona.delete(sandbox, 60);
		} catch (error) {
			console.warn(
				`[agent-worker] cleanup could not delete Daytona sandbox ${session.provider_session_id}:`,
				error
			);
		}
	}
	await supabase
		.from("agent_sessions")
		.update({
			status: "ended",
			ended_at: now.toISOString(),
			end_reason: endReason,
			runner_id: runnerId,
		})
		.eq("id", session.id);
	await supabase.from("agent_events").insert({
		job_id: null,
		user_id: session.user_id,
		kind: "agent_session_ended",
		payload: {
			sessionId: session.id,
			sandboxId: session.provider_session_id,
			reason: endReason,
		},
		created_at: now.toISOString(),
	});
}

export async function cleanupDaytonaAgentSessions({
	supabase,
	runnerId,
	deps = {},
}: CleanupDaytonaAgentSessionsParams): Promise<number> {
	const apiKey = process.env.DAYTONA_API_KEY;
	if (!apiKey) {
		return 0;
	}
	const DaytonaClient =
		deps.DaytonaClient ?? (Daytona as unknown as DaytonaClientCtor);
	const daytona = new DaytonaClient({ apiKey });
	const now = new Date();
	const idleCutoff = new Date(now.getTime() - getAgentSessionIdleMs());
	const { data, error } = await supabase
		.from("agent_sessions")
		.select(
			"id, user_id, status, provider_session_id, image_tag, last_active_at, expires_at, end_reason"
		)
		.in("status", ["active", "stopping"])
		.or(
			`status.eq.stopping,expires_at.lt.${now.toISOString()},last_active_at.lt.${idleCutoff.toISOString()}`
		)
		.limit(AGENT_SESSION_CLEANUP_LIMIT);
	if (error) {
		throw new Error(`agent_sessions cleanup select failed: ${error.message}`);
	}
	const sessions = (data ?? []) as AgentSessionRow[];
	await Promise.all(
		sessions.map((session) =>
			endDaytonaAgentSession({ supabase, daytona, session, runnerId })
		)
	);
	return sessions.length;
}
