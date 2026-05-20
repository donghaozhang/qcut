import { Daytona } from "@daytona/sdk";
import { SignJWT } from "jose";
import { and, eq } from "drizzle-orm";
import type { Context } from "hono";

import { agentEvents, agentSessions } from "@qcut/db/schema";

import { db } from "../../db/drizzle";
import {
	AGENT_TERMINAL_RETRY_AFTER_MS,
	getAgentImageTag,
	getDaytonaApiKey,
	getRelayHost,
	getRelaySigningSecret,
} from "./constants";
import {
	getOrCreateAgentTerminalSandbox,
	isAgentTerminalSandboxFailed,
	isAgentTerminalSandboxStarted,
} from "./daytona";
import { getActiveOwnedAgentSession } from "./data-access";
import { serializeAgentSession, serializeDate } from "./serializers";
import { normalizeOptionalId } from "./validation";

export async function createAgentPtyToken(c: Context) {
	const userId = c.get("userId") as string;
	const sessionId = normalizeOptionalId({ value: c.req.param("sessionId") });
	if (!sessionId) {
		return c.json({ error: "agent_session_id_required" }, 400);
	}

	const relaySecret = getRelaySigningSecret();
	if (!relaySecret) {
		return c.json({ error: "agent_terminal_misconfigured: relay_secret" }, 500);
	}

	const apiKey = getDaytonaApiKey();
	if (!apiKey) {
		return c.json({ error: "agent_terminal_misconfigured: daytona" }, 500);
	}

	const session = await getActiveOwnedAgentSession({
		sessionId,
		userId,
		now: new Date(),
	});
	if (!session) {
		return c.json({ error: "agent_session_not_found" }, 404);
	}

	const daytona = new Daytona({ apiKey });
	const sandbox = await getOrCreateAgentTerminalSandbox({
		daytona,
		session,
		userId,
	});
	const now = new Date();
	const latestSession = {
		...session,
		providerSessionId: sandbox.id,
		imageTag: getAgentImageTag(),
		lastActiveAt: now,
	};
	await db
		.update(agentSessions)
		.set({
			providerSessionId: sandbox.id,
			imageTag: getAgentImageTag(),
			lastActiveAt: now,
		})
		.where(
			and(eq(agentSessions.id, session.id), eq(agentSessions.userId, userId))
		);

	if (isAgentTerminalSandboxFailed({ sandbox })) {
		return c.json(
			{
				error: "agent_terminal_sandbox_failed",
				status: sandbox.state,
				reason: sandbox.errorReason || "",
			},
			502
		);
	}

	if (!isAgentTerminalSandboxStarted({ sandbox })) {
		await db.insert(agentEvents).values({
			jobId: null,
			userId,
			kind: "agent_terminal_starting",
			payload: {
				sessionId: session.id,
				sandboxId: sandbox.id,
				provider: "daytona",
				status: sandbox.state || "unknown",
			},
			createdAt: now,
		});
		return c.json(
			{
				session: serializeAgentSession(latestSession),
				status: "starting",
				retry_after_ms: AGENT_TERMINAL_RETRY_AFTER_MS,
			},
			202
		);
	}

	await db.insert(agentEvents).values({
		jobId: null,
		userId,
		kind: "agent_terminal_ready",
		payload: {
			sessionId: session.id,
			sandboxId: sandbox.id,
			provider: "daytona",
		},
		createdAt: now,
	});

	const wsToken = await new SignJWT({
		session_id: session.id,
		session_kind: "agent",
	})
		.setProtectedHeader({ alg: "HS256" })
		.setExpirationTime("5m")
		.sign(new TextEncoder().encode(relaySecret));
	const expiresAt = serializeDate({ value: session.expiresAt });

	return c.json({
		session: serializeAgentSession(latestSession),
		ws_url: `wss://${getRelayHost()}/pty?token=${wsToken}`,
		expires_at: expiresAt,
	});
}
