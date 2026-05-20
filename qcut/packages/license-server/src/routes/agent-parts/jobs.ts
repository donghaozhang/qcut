import type { Context } from "hono";
import { and, desc, eq } from "drizzle-orm";

import {
	agentArtifacts,
	agentEvents,
	agentJobs,
	agentSessions,
} from "@qcut/db/schema";

import { db } from "../../db/drizzle";
import { getSupabase } from "../../db/supabase";
import { MAX_TEXT_ARTIFACT_BYTES, TEXT_ARTIFACT_KINDS } from "./constants";
import {
	getActiveOwnedAgentSession,
	getOwnedAgentArtifact,
	getOwnedAgentJob,
} from "./data-access";
import {
	escapeContentDispositionFilename,
	getArtifactContentType,
	getArtifactFilename,
	serializeAgentArtifact,
	serializeAgentEvent,
	serializeAgentJob,
} from "./serializers";
import {
	getAgentJobSource,
	normalizeOptionalId,
	parseCreateAgentJobBody,
	validateAgentJobBody,
} from "./validation";

export async function createAgentJob(c: Context) {
	const userId = c.get("userId") as string;
	const body = await parseCreateAgentJobBody({ c });
	const command = body.command?.trim() ?? "";
	const validationError = validateAgentJobBody({
		command,
		args: body.args,
	});

	if (validationError) {
		return c.json({ error: validationError }, 400);
	}

	const sessionId = normalizeOptionalId({ value: body.sessionId });
	const session =
		sessionId === null
			? null
			: await getActiveOwnedAgentSession({
					sessionId,
					userId,
					now: new Date(),
				});
	if (sessionId && !session) {
		return c.json({ error: "agent_session_not_found" }, 404);
	}

	const jobId = crypto.randomUUID();
	const createdAt = new Date();

	await db.insert(agentJobs).values({
		id: jobId,
		userId,
		sessionId: session?.id ?? null,
		status: "queued",
		command,
		args: body.args ?? {},
		createdAt,
	});
	await db.insert(agentEvents).values({
		jobId,
		userId,
		kind: "job_submitted",
		payload: {
			source: getAgentJobSource({ args: body.args }),
			...(session ? { sessionId: session.id } : {}),
		},
		createdAt,
	});
	if (session) {
		await db
			.update(agentSessions)
			.set({ lastActiveAt: createdAt })
			.where(
				and(eq(agentSessions.id, session.id), eq(agentSessions.userId, userId))
			);
	}

	return c.json(
		{
			job: {
				id: jobId,
				userId,
				sessionId: session?.id ?? null,
				status: "queued",
				command,
				args: body.args ?? {},
				createdAt: createdAt.toISOString(),
			},
		},
		201
	);
}

export async function listAgentJobs(c: Context) {
	const userId = c.get("userId") as string;
	const jobs = await db
		.select()
		.from(agentJobs)
		.where(eq(agentJobs.userId, userId))
		.orderBy(desc(agentJobs.createdAt))
		.limit(20);

	return c.json({ jobs: jobs.map(serializeAgentJob) });
}

export async function getAgentArtifactText(c: Context) {
	const userId = c.get("userId") as string;
	const jobId = c.req.param("jobId");
	const artifactId = c.req.param("artifactId");

	const job = await getOwnedAgentJob({ jobId, userId });
	if (!job) {
		return c.json({ error: "job_not_found" }, 404);
	}

	const artifact = await getOwnedAgentArtifact({ artifactId, jobId, userId });
	if (!artifact) {
		return c.json({ error: "artifact_not_found" }, 404);
	}
	if (!TEXT_ARTIFACT_KINDS.has(artifact.kind)) {
		return c.json({ error: "artifact_not_text" }, 415);
	}
	if (artifact.bytes && artifact.bytes > MAX_TEXT_ARTIFACT_BYTES) {
		return c.json({ error: "artifact_too_large" }, 413);
	}

	const { data, error } = await getSupabase()
		.storage.from("artifacts")
		.download(artifact.storagePath);

	if (error || !data) {
		return c.json({ error: "artifact_download_failed" }, 502);
	}

	return c.text(await data.text(), 200, {
		"Content-Type": "text/plain; charset=utf-8",
	});
}

export async function downloadAgentArtifact(c: Context) {
	const userId = c.get("userId") as string;
	const jobId = c.req.param("jobId");
	const artifactId = c.req.param("artifactId");

	const job = await getOwnedAgentJob({ jobId, userId });
	if (!job) {
		return c.json({ error: "job_not_found" }, 404);
	}

	const artifact = await getOwnedAgentArtifact({ artifactId, jobId, userId });
	if (!artifact) {
		return c.json({ error: "artifact_not_found" }, 404);
	}

	const { data, error } = await getSupabase()
		.storage.from("artifacts")
		.download(artifact.storagePath);

	if (error || !data) {
		return c.json({ error: "artifact_download_failed" }, 502);
	}

	const filename = getArtifactFilename({ artifact });
	const headers: Record<string, string> = {
		"Content-Disposition": `attachment; filename="${escapeContentDispositionFilename({ filename })}"`,
		"Content-Type": getArtifactContentType({ artifact, blob: data }),
	};
	if (artifact.bytes !== null && artifact.bytes !== undefined) {
		headers["Content-Length"] = String(artifact.bytes);
	}

	return c.body(data.stream(), 200, headers);
}

export async function getAgentJobDetail(c: Context) {
	const userId = c.get("userId") as string;
	const jobId = c.req.param("jobId");
	const [job] = await db
		.select()
		.from(agentJobs)
		.where(and(eq(agentJobs.id, jobId), eq(agentJobs.userId, userId)))
		.limit(1);

	if (!job) {
		return c.json({ error: "job_not_found" }, 404);
	}

	const [events, artifacts] = await Promise.all([
		db
			.select()
			.from(agentEvents)
			.where(and(eq(agentEvents.jobId, jobId), eq(agentEvents.userId, userId)))
			.orderBy(desc(agentEvents.createdAt))
			.limit(50),
		db
			.select()
			.from(agentArtifacts)
			.where(
				and(eq(agentArtifacts.jobId, jobId), eq(agentArtifacts.userId, userId))
			)
			.orderBy(desc(agentArtifacts.createdAt)),
	]);

	return c.json({
		job: serializeAgentJob(job),
		events: events.map(serializeAgentEvent),
		artifacts: artifacts.map(serializeAgentArtifact),
	});
}
