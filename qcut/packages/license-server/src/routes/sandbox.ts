/**
 * /api/sandbox/* — Hono route for browser-terminal sandbox sessions.
 *
 * POST /api/sandbox/spawn
 *   body: { resource_class?: "standard" | "large" }
 *   header: Authorization: Bearer <session-token>
 *   returns: { session_id, ws_url, expires_at }
 *
 * Phase 2 entry point (replaces the old Deno Edge Function at
 * packages/db/supabase/functions/sandbox-spawn/). Lives here because
 * Better Auth + credit deduction are both license-server concerns.
 *
 * The relay (packages/qcut-relay) verifies the returned token with the
 * same RELAY_SIGNING_SECRET, so this server signs and the relay
 * verifies — gate-keeping split for hot-path speed.
 */

import { Hono, type Context } from "hono";
// `eq` is also used below for the agent_secrets lookup
import { and, eq, inArray } from "@qcut/db";
import { Sandbox } from "e2b";
import { SignJWT } from "jose";

import { agentEvents, agentSecrets, sandboxSessions } from "@qcut/db/schema";
import { db } from "../db/drizzle";
import { authMiddleware } from "../middleware/auth";
import { deductCreditsForUser } from "../services/credit-service";

const sandboxRoutes = new Hono();
sandboxRoutes.use("/*", authMiddleware);

const MAX_CONCURRENT = 3;
const TTL_MS = 30 * 60 * 1000;
// Bumped from 8s to 20s — first-spawn `qcut system doctor` on E2B
// takes ~10s wall clock (envelope dominates; doctor itself is fast).
const PROBE_TIMEOUT_MS = 20_000;

const SPAWN_COST: Record<"standard" | "large", number> = {
	standard: 5,
	large: 10,
};

interface SpawnBody {
	resource_class?: "standard" | "large";
}

sandboxRoutes.post("/spawn", async (c) => {
	try {
		return await spawnHandler(c);
	} catch (err) {
		console.error("[sandbox/spawn] unhandled:", err);
		return c.json(
			{
				error: "unhandled",
				detail: err instanceof Error ? err.message : String(err),
				stack:
					err instanceof Error
						? err.stack?.split("\n").slice(0, 5).join("\n")
						: undefined,
			},
			500
		);
	}
});

async function spawnHandler(c: Context) {
	const userId = c.get("userId") as string;
	const imageTag = process.env.QCUT_IMAGE_TAG ?? "qcut-cli:v0";
	const relayHost = process.env.RELAY_HOST ?? "relay.qcut.app";
	const relaySecret = process.env.RELAY_SIGNING_SECRET;
	const e2bKey = process.env.E2B_API_KEY;

	if (!relaySecret) {
		return c.json({ error: "spawn_misconfigured: RELAY_SIGNING_SECRET" }, 500);
	}
	if (!e2bKey) {
		return c.json({ error: "spawn_misconfigured: E2B_API_KEY" }, 500);
	}

	let body: SpawnBody = {};
	try {
		body = (await c.req.json()) as SpawnBody;
	} catch {
		// empty body is fine; defaults apply
	}
	const resourceClass: "standard" | "large" =
		body.resource_class === "large" ? "large" : "standard";

	// Concurrency cap — count this user's active sessions.
	const active = await db
		.select({ id: sandboxSessions.id })
		.from(sandboxSessions)
		.where(
			and(
				eq(sandboxSessions.userId, userId),
				inArray(sandboxSessions.status, ["spawning", "active"])
			)
		);
	if (active.length >= MAX_CONCURRENT) {
		return c.json({ error: "too_many_active_sessions" }, 429);
	}

	// Audit: spawn_started (before billing — we want a record even if
	// downstream fails).
	await db.insert(agentEvents).values({
		userId,
		kind: "spawn_started",
		payload: { resource_class: resourceClass, image_tag: imageTag },
		createdAt: new Date(),
	});

	// Charge first — refund on failure paths.
	const cost = SPAWN_COST[resourceClass];
	const deduction = await deductCreditsForUser({
		userId,
		amount: cost,
		modelKey: `sandbox:${resourceClass}`,
		description: `sandbox spawn (${resourceClass})`,
	});
	if (!deduction.success) {
		return c.json(
			{
				error: "insufficient_credits",
				required: cost,
				available:
					deduction.balance.planCredits + deduction.balance.topUpCredits,
			},
			402
		);
	}

	// Fetch the user's stored provider keys; the entrypoint materializes
	// them into ~/.qcut/.env inside the sandbox. v0 stores plaintext;
	// pgsodium upgrade is a follow-up.
	const secrets = await db
		.select({ key: agentSecrets.key, value: agentSecrets.value })
		.from(agentSecrets)
		.where(eq(agentSecrets.userId, userId));
	const envs: Record<string, string> = {
		QCUT_SESSION_ROLE: "interactive",
	};
	for (const s of secrets) envs[s.key] = s.value;

	// Spawn E2B sandbox.
	let sandbox: Awaited<ReturnType<typeof Sandbox.create>>;
	try {
		sandbox = await Sandbox.create(imageTag, {
			timeoutMs: TTL_MS,
			envs,
			apiKey: e2bKey,
		});
	} catch (err) {
		await db.insert(agentEvents).values({
			userId,
			kind: "doctor_probe",
			payload: {
				stage: "create",
				error: err instanceof Error ? err.message : String(err),
			},
			createdAt: new Date(),
		});
		// TODO: refund credits here — refundCreditsForUser exists; keeping
		// scope tight for v0. Document as known followup.
		return c.json({ error: "sandbox_create_failed" }, 502);
	}

	// Layer-2 spawn probe. We wrap the doctor invocation through the
	// entrypoint script so ~/.qcut/.env gets materialized from the
	// injected env vars first — E2B's commands.run bypasses Dockerfile
	// ENTRYPOINT, so doing this explicitly here is required.
	let probe: Awaited<ReturnType<typeof sandbox.commands.run>>;
	try {
		probe = await sandbox.commands.run(
			"/usr/local/bin/qcut-entrypoint qcut system doctor --json --skip-health",
			{ timeoutMs: PROBE_TIMEOUT_MS }
		);
	} catch (err) {
		await sandbox.kill();
		return c.json(
			{
				error: "probe_threw",
				detail: err instanceof Error ? err.message : String(err),
			},
			502
		);
	}
	if (probe.exitCode !== 0) {
		await sandbox.kill();
		await db.insert(agentEvents).values({
			userId,
			kind: "doctor_probe",
			payload: {
				stage: "probe",
				exit_code: probe.exitCode,
				stderr: probe.stderr.slice(0, 1000),
			},
			createdAt: new Date(),
		});
		return c.json({ error: "sandbox_unhealthy" }, 502);
	}

	// Persist session.
	const sessionId = crypto.randomUUID();
	const expiresAt = new Date(Date.now() + TTL_MS);
	try {
		await db.insert(sandboxSessions).values({
			id: sessionId,
			userId,
			status: "active",
			provider: "e2b",
			providerSessionId: sandbox.sandboxId,
			imageTag,
			startedAt: new Date(),
			resourceClass,
			expiresAt,
		});
		await db.insert(agentEvents).values({
			userId,
			kind: "spawn_probe_ok",
			payload: {
				session_id: sessionId,
				provider_session_id: sandbox.sandboxId,
			},
			createdAt: new Date(),
		});
	} catch (err) {
		await sandbox.kill();
		return c.json(
			{
				error: "persist_failed",
				detail: err instanceof Error ? err.message : String(err),
			},
			500
		);
	}

	// Mint 5-minute HS256 token for the relay.
	let wsToken: string;
	try {
		wsToken = await new SignJWT({ session_id: sessionId })
			.setProtectedHeader({ alg: "HS256" })
			.setExpirationTime("5m")
			.sign(new TextEncoder().encode(relaySecret));
	} catch (err) {
		await sandbox.kill();
		return c.json(
			{
				error: "jwt_sign_failed",
				detail: err instanceof Error ? err.message : String(err),
			},
			500
		);
	}

	return c.json({
		session_id: sessionId,
		ws_url: `wss://${relayHost}/pty?token=${wsToken}`,
		expires_at: expiresAt.toISOString(),
		cost_credits: cost,
		remaining_credits:
			deduction.balance.planCredits + deduction.balance.topUpCredits,
	});
}

export { sandboxRoutes };
