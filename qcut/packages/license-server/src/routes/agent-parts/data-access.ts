import { and, eq, gt } from "drizzle-orm";

import { agentArtifacts, agentJobs, agentSessions } from "@qcut/db/schema";

import { db } from "../../db/drizzle";

export async function getOwnedAgentJob({
	jobId,
	userId,
}: {
	jobId: string;
	userId: string;
}): Promise<typeof agentJobs.$inferSelect | null> {
	const [job] = await db
		.select()
		.from(agentJobs)
		.where(and(eq(agentJobs.id, jobId), eq(agentJobs.userId, userId)))
		.limit(1);
	return job || null;
}

export async function getOwnedAgentArtifact({
	artifactId,
	jobId,
	userId,
}: {
	artifactId: string;
	jobId: string;
	userId: string;
}): Promise<typeof agentArtifacts.$inferSelect | null> {
	const [artifact] = await db
		.select()
		.from(agentArtifacts)
		.where(
			and(
				eq(agentArtifacts.id, artifactId),
				eq(agentArtifacts.jobId, jobId),
				eq(agentArtifacts.userId, userId)
			)
		)
		.limit(1);
	return artifact || null;
}

export async function getActiveOwnedAgentSession({
	sessionId,
	userId,
	now,
}: {
	sessionId: string;
	userId: string;
	now: Date;
}): Promise<typeof agentSessions.$inferSelect | null> {
	const [session] = await db
		.select()
		.from(agentSessions)
		.where(
			and(
				eq(agentSessions.id, sessionId),
				eq(agentSessions.userId, userId),
				eq(agentSessions.status, "active"),
				gt(agentSessions.expiresAt, now)
			)
		)
		.limit(1);
	return session || null;
}
