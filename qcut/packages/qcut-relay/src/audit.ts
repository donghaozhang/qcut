/**
 * REST-API writes to Supabase for relay-side audit + termination.
 *
 * The relay can't host a `@supabase/supabase-js` client cleanly (CF
 * Workers + the Realtime websocket inside the SDK don't play well),
 * so we drop down to raw REST. Same `agent_events` table the
 * worker / Edge Function write to.
 *
 * @module @qcut/relay/audit
 */

import type { Env } from "./index.js";

const REST_TIMEOUT_MS = 5_000;

async function rest(
	env: Env,
	method: "POST" | "PATCH",
	pathAndQuery: string,
	body: unknown
): Promise<void> {
	// Audit/state writes are best-effort: a transient network blip on the
	// Supabase side should NOT cascade into a 5xx on the user's WebSocket
	// or kill an in-flight session. Time-bound and swallow.
	const ctl = new AbortController();
	const timer = setTimeout(() => ctl.abort(), REST_TIMEOUT_MS);
	try {
		const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
			method,
			headers: {
				apikey: env.SUPABASE_SERVICE_ROLE_KEY,
				Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
				"Content-Type": "application/json",
				Prefer: "return=minimal",
			},
			body: JSON.stringify(body),
			signal: ctl.signal,
		});
		if (!r.ok) {
			console.error(
				`[qcut-relay] supabase ${method} ${pathAndQuery} →`,
				r.status
			);
		}
	} catch (err) {
		console.error(
			`[qcut-relay] supabase ${method} ${pathAndQuery} threw:`,
			err instanceof Error ? err.message : String(err)
		);
	} finally {
		clearTimeout(timer);
	}
}

export async function auditEvent(
	env: Env,
	session_id: string,
	kind: string,
	payload: Record<string, unknown>
): Promise<void> {
	// user_id is filled by the spawn route; the relay only knows
	// session_id, so we store that in payload and let queries join
	// back to the user via sandbox_sessions.
	await rest(env, "POST", "agent_events", {
		user_id: null,
		kind,
		payload: { session_id, ...payload },
		created_at: new Date().toISOString(),
	});
}

export async function markEnded(
	env: Env,
	session_id: string,
	reason: "disconnect" | "idle_timeout" | "ttl" | "error" | "user_kill",
	exit_code?: number
): Promise<void> {
	await rest(env, "PATCH", `sandbox_sessions?id=eq.${session_id}`, {
		status: "ended",
		ended_at: new Date().toISOString(),
		end_reason: reason,
		exit_code: exit_code ?? null,
	});
}

export async function fetchSession(
	env: Env,
	session_id: string
): Promise<{
	id: string;
	status: string;
	provider_session_id: string;
	expires_at: string;
} | null> {
	// Contract: nullable return. Network / JSON parse failures must NOT
	// reject — callers (e.g. pty-session) read the null to translate into
	// a 410 "session_not_active" response.
	const ctl = new AbortController();
	const timer = setTimeout(() => ctl.abort(), REST_TIMEOUT_MS);
	try {
		const r = await fetch(
			`${env.SUPABASE_URL}/rest/v1/sandbox_sessions?id=eq.${session_id}&select=id,status,provider_session_id,expires_at`,
			{
				headers: {
					apikey: env.SUPABASE_SERVICE_ROLE_KEY,
					Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
				},
				signal: ctl.signal,
			}
		);
		if (!r.ok) return null;
		const rows = (await r.json()) as Array<{
			id: string;
			status: string;
			provider_session_id: string;
			expires_at: string;
		}>;
		return rows[0] ?? null;
	} catch (err) {
		console.error(
			`[qcut-relay] fetchSession(${session_id}) threw:`,
			err instanceof Error ? err.message : String(err)
		);
		return null;
	} finally {
		clearTimeout(timer);
	}
}
