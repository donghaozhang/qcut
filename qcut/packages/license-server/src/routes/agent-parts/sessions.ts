import type { Context } from "hono";
import { and, desc, eq, gt } from "drizzle-orm";

import { agentSessions } from "@qcut/db/schema";

import { db } from "../../db/drizzle";
import { AGENT_SESSION_TTL_MS, getAgentImageTag } from "./constants";
import { getActiveOwnedAgentSession } from "./data-access";
import { serializeAgentSession } from "./serializers";
import { normalizeOptionalId } from "./validation";

export async function createOrReuseAgentSession(c: Context) {
	const userId = c.get("userId") as string;
	const now = new Date();
	const [session] = await db
		.select()
		.from(agentSessions)
		.where(
			and(
				eq(agentSessions.userId, userId),
				eq(agentSessions.status, "active"),
				gt(agentSessions.expiresAt, now)
			)
		)
		.orderBy(desc(agentSessions.lastActiveAt))
		.limit(1);
	if (session) {
		return c.json({ session: serializeAgentSession(session) });
	}

	const sessionId = crypto.randomUUID();
	const imageTag = getAgentImageTag();
	const expiresAt = new Date(now.getTime() + AGENT_SESSION_TTL_MS);
	await db.insert(agentSessions).values({
		id: sessionId,
		userId,
		status: "active",
		provider: "daytona",
		providerSessionId: null,
		imageTag,
		startedAt: now,
		lastActiveAt: now,
		expiresAt,
	});

	return c.json(
		{
			session: {
				id: sessionId,
				userId,
				status: "active",
				provider: "daytona",
				providerSessionId: null,
				imageTag,
				startedAt: now.toISOString(),
				lastActiveAt: now.toISOString(),
				expiresAt: expiresAt.toISOString(),
				endedAt: null,
				endReason: null,
				runnerId: null,
			},
		},
		201
	);
}

export async function endAgentSession(c: Context) {
	const userId = c.get("userId") as string;
	const sessionId = normalizeOptionalId({ value: c.req.param("sessionId") });
	if (!sessionId) {
		return c.json({ error: "agent_session_id_required" }, 400);
	}

	const [session] = await db
		.select()
		.from(agentSessions)
		.where(
			and(eq(agentSessions.id, sessionId), eq(agentSessions.userId, userId))
		)
		.limit(1);
	if (!session) {
		return c.json({ error: "agent_session_not_found" }, 404);
	}

	const now = new Date();
	await db
		.update(agentSessions)
		.set({
			status: "stopping",
			endReason: "user_kill",
			lastActiveAt: now,
		})
		.where(
			and(eq(agentSessions.id, sessionId), eq(agentSessions.userId, userId))
		);

	return c.json({
		session: serializeAgentSession({
			...session,
			status: "stopping",
			endReason: "user_kill",
			lastActiveAt: now,
		}),
	});
}

export async function getRequestAgentSession({
	c,
	userId,
}: {
	c: Context;
	userId: string;
}): Promise<typeof agentSessions.$inferSelect | null> {
	const sessionId = normalizeOptionalId({ value: c.req.param("sessionId") });
	if (!sessionId) {
		return null;
	}
	return getActiveOwnedAgentSession({
		sessionId,
		userId,
		now: new Date(),
	});
}
