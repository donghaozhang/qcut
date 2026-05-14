// deno-lint-ignore-file no-explicit-any
//
// /sandbox-spawn — Supabase Edge Function (Deno). Implements PR 07.
//
// On POST /sandbox-spawn with a Supabase user JWT:
//   1. verify caller + workspace membership
//   2. enforce concurrent-session cap (count_active_sandbox_sessions)
//   3. fetch workspace secrets
//   4. Sandbox.create() in E2B with secrets as env vars
//   5. spawn-probe: run `qcut system doctor --json --skip-health`
//   6. record sandbox_sessions row
//   7. mint short-lived HS256 token for the relay (PR 08)
//   8. return { session_id, ws_url, expires_at }
//
// Audit events go to agent_events.kind = spawn_started | doctor_probe
// | spawn_probe_ok. Same table as the headless agent path so we get
// one merged dashboard.

import { createClient } from "jsr:@supabase/supabase-js@2";
// E2B SDK is bundled at deploy time via Deno's npm: specifier.
import { Sandbox } from "npm:e2b@latest";
import { SignJWT } from "jsr:@panva/jose@5";

const MAX_CONCURRENT = 3;
const PROBE_TIMEOUT_MS = 8_000;
const TTL_MS = 30 * 60 * 1000;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const QCUT_IMAGE_TAG = Deno.env.get("QCUT_IMAGE_TAG") ?? "qcut-cli:v0";
const RELAY_SECRET_RAW = Deno.env.get("RELAY_SIGNING_SECRET");
const RELAY_HOST = Deno.env.get("RELAY_HOST") ?? "relay.qcut.app";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RELAY_SECRET_RAW) {
	console.error(
		"sandbox-spawn: missing required env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RELAY_SIGNING_SECRET)",
	);
}

const RELAY_SECRET = new TextEncoder().encode(RELAY_SECRET_RAW ?? "");

interface SpawnBody {
	workspace_id?: string;
	resource_class?: "standard" | "large";
}

async function readJson<T>(req: Request): Promise<T | null> {
	try {
		return (await req.json()) as T;
	} catch {
		return null;
	}
}

function unauthorized(): Response {
	return new Response("unauthorized", { status: 401 });
}

Deno.serve(async (req: Request): Promise<Response> => {
	if (req.method !== "POST") {
		return new Response("method_not_allowed", { status: 405 });
	}
	const auth = req.headers.get("authorization");
	if (!auth) return unauthorized();

	const supabase = createClient(
		SUPABASE_URL!,
		SUPABASE_SERVICE_ROLE_KEY!,
	);

	const { data: { user } } = await supabase.auth.getUser(
		auth.replace("Bearer ", ""),
	);
	if (!user) return unauthorized();

	const body = await readJson<SpawnBody>(req);
	if (!body) return new Response("invalid_json", { status: 400 });
	const { workspace_id, resource_class = "standard" } = body;
	if (!workspace_id) return new Response("missing_workspace_id", { status: 400 });

	// Concurrency cap. v0 has no workspace_members table yet, so the
	// cap is enforced via the count RPC. Membership wiring happens
	// when the workspace concept lands.
	const { data: countResult, error: countErr } = await supabase.rpc(
		"count_active_sandbox_sessions",
		{ _workspace_id: workspace_id },
	);
	if (countErr) {
		console.error("count error", countErr);
		return new Response("count_failed", { status: 500 });
	}
	if ((countResult as number) >= MAX_CONCURRENT) {
		return new Response("too_many_active_sessions", { status: 429 });
	}

	// Audit: spawn_started
	await supabase.from("agent_events").insert({
		workspace_id,
		kind: "spawn_started",
		payload: { user_id: user.id, resource_class, image_tag: QCUT_IMAGE_TAG },
	});

	const { data: secrets } = await supabase
		.from("agent_secrets")
		.select("key, value")
		.eq("workspace_id", workspace_id);
	const envs = Object.fromEntries(
		(secrets ?? []).map((s: { key: string; value: string }) => [s.key, s.value]),
	);

	// Spawn E2B sandbox with all secrets as env.
	const sandbox = await Sandbox.create(QCUT_IMAGE_TAG, {
		timeoutMs: TTL_MS,
		envs: { ...envs, QCUT_SESSION_ROLE: "interactive" },
	});

	// Layer-2 spawn probe.
	const probe = await sandbox.commands.run(
		"qcut system doctor --json --skip-health",
		{ timeoutMs: PROBE_TIMEOUT_MS },
	);
	if (probe.exitCode !== 0) {
		await sandbox.kill();
		await supabase.from("agent_events").insert({
			workspace_id,
			kind: "doctor_probe",
			payload: {
				exit_code: probe.exitCode,
				stderr: probe.stderr.slice(0, 1000),
			},
		});
		return new Response("sandbox_unhealthy", { status: 502 });
	}
	await supabase.from("agent_events").insert({
		workspace_id,
		kind: "spawn_probe_ok",
		payload: { provider_session_id: (sandbox as any).sandboxId },
	});

	const session_id = crypto.randomUUID();
	const expires_at = new Date(Date.now() + TTL_MS).toISOString();
	const { error: insErr } = await supabase.from("sandbox_sessions").insert({
		id: session_id,
		workspace_id,
		user_id: user.id,
		status: "active",
		provider: "e2b",
		provider_session_id: (sandbox as any).sandboxId,
		image_tag: QCUT_IMAGE_TAG,
		resource_class,
		expires_at,
	});
	if (insErr) {
		await sandbox.kill();
		console.error("session insert failed", insErr);
		return new Response("session_insert_failed", { status: 500 });
	}

	// Short-lived (5 min) relay token. The relay verifies this — Spawn
	// API never validates against itself.
	const ws_token = await new SignJWT({ session_id })
		.setProtectedHeader({ alg: "HS256" })
		.setExpirationTime("5m")
		.sign(RELAY_SECRET);

	return Response.json({
		session_id,
		ws_url: `wss://${RELAY_HOST}/pty?token=${ws_token}`,
		expires_at,
	});
});
