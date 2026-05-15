import { Hono, type Context, type Next } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { agentArtifacts, agentEvents, agentJobs } from "@qcut/db/schema";
import { db } from "../db/drizzle";
import { getSupabase } from "../db/supabase";
import { authMiddleware } from "../middleware/auth";

const agentRoutes = new Hono();

const MAX_COMMAND_LENGTH = 2000;
const MAX_CODEX_PROMPT_LENGTH = 12_000;
const MAX_TEXT_ARTIFACT_BYTES = 256_000;
const SAFE_COMMAND_TOKEN = /^[A-Za-z0-9_\-./:=,@+]+$/;
const CODEX_AGENT_COMMAND = "codex exec --skip-git-repo-check --json -";
const TEXT_ARTIFACT_KINDS = new Set(["json", "log"]);
const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
	".gif": "image/gif",
	".jpeg": "image/jpeg",
	".jpg": "image/jpeg",
	".json": "application/json",
	".log": "text/plain; charset=utf-8",
	".m4a": "audio/mp4",
	".mov": "video/quicktime",
	".mp3": "audio/mpeg",
	".mp4": "video/mp4",
	".ogg": "audio/ogg",
	".png": "image/png",
	".srt": "text/plain; charset=utf-8",
	".tar": "application/x-tar",
	".txt": "text/plain; charset=utf-8",
	".wav": "audio/wav",
	".webm": "video/webm",
	".webp": "image/webp",
};

interface CreateAgentJobBody {
	command?: string;
	args?: Record<string, unknown>;
}

agentRoutes.use("/*", agentAuthMiddleware);

async function agentAuthMiddleware(c: Context, next: Next) {
	const defaultUserId = getDefaultAgentUserId();
	const authHeader = c.req.header("Authorization") || "";
	if (authHeader.length === 0 && defaultUserId.length > 0) {
		c.set("userId", defaultUserId);
		await next();
		return;
	}
	return authMiddleware(c, next);
}

function getDefaultAgentUserId(): string {
	const value = process.env.QCUT_AGENT_DEFAULT_USER_ID;
	return typeof value === "string" ? value.trim() : "";
}

agentRoutes.post("/jobs", async (c) => {
	try {
		return await createAgentJob(c);
	} catch (error) {
		return c.json(
			{
				error:
					error instanceof Error
						? `Failed to create agent job: ${error.message}`
						: "Failed to create agent job",
			},
			500
		);
	}
});

agentRoutes.get("/jobs", async (c) => {
	const userId = c.get("userId") as string;
	const jobs = await db
		.select()
		.from(agentJobs)
		.where(eq(agentJobs.userId, userId))
		.orderBy(desc(agentJobs.createdAt))
		.limit(20);

	return c.json({ jobs: jobs.map(serializeAgentJob) });
});

agentRoutes.get("/jobs/:jobId/artifacts/:artifactId/text", async (c) => {
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
});

agentRoutes.get("/jobs/:jobId/artifacts/:artifactId/download", async (c) => {
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
});

agentRoutes.get("/jobs/:jobId", async (c) => {
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
});

async function getOwnedAgentJob({
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

async function getOwnedAgentArtifact({
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

async function createAgentJob(c: Context) {
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

	const jobId = crypto.randomUUID();
	const createdAt = new Date();

	await db.insert(agentJobs).values({
		id: jobId,
		userId,
		status: "queued",
		command,
		args: body.args ?? {},
		createdAt,
	});
	await db.insert(agentEvents).values({
		jobId,
		userId,
		kind: "job_submitted",
		payload: { source: "website_chat_agent" },
		createdAt,
	});

	return c.json(
		{
			job: {
				id: jobId,
				userId,
				status: "queued",
				command,
				args: body.args ?? {},
				createdAt: createdAt.toISOString(),
			},
		},
		201
	);
}

async function parseCreateAgentJobBody({
	c,
}: {
	c: Context;
}): Promise<CreateAgentJobBody> {
	try {
		const body = (await c.req.json()) as CreateAgentJobBody;
		return typeof body === "object" && body !== null ? body : {};
	} catch {
		return {};
	}
}

function validateCommand({ command }: { command: string }): string {
	if (command.length === 0) {
		return "command_required";
	}
	if (command.length > MAX_COMMAND_LENGTH) {
		return "command_too_long";
	}
	if (!command.startsWith("qcut ") && command !== CODEX_AGENT_COMMAND) {
		return "command_must_start_with_qcut_or_codex_exec";
	}

	const tokens = command.split(/\s+/).filter(Boolean);
	for (const token of tokens) {
		if (!SAFE_COMMAND_TOKEN.test(token)) {
			return "command_contains_unsafe_token";
		}
	}

	return "";
}

function validateAgentJobBody({
	command,
	args,
}: {
	command: string;
	args?: Record<string, unknown>;
}): string {
	const commandError = validateCommand({ command });
	if (commandError) {
		return commandError;
	}
	if (command !== CODEX_AGENT_COMMAND) {
		return "";
	}

	const prompt =
		args && typeof args.codexPrompt === "string" ? args.codexPrompt.trim() : "";
	if (prompt.length === 0) {
		return "codex_prompt_required";
	}
	if (prompt.length > MAX_CODEX_PROMPT_LENGTH) {
		return "codex_prompt_too_long";
	}
	return "";
}

function serializeDate({
	value,
}: {
	value: Date | string | null;
}): string | null {
	if (!value) {
		return null;
	}
	if (value instanceof Date) {
		return value.toISOString();
	}
	return value;
}

function getArtifactFilename({
	artifact,
}: {
	artifact: typeof agentArtifacts.$inferSelect;
}): string {
	const meta = artifact.meta;
	if (
		meta &&
		typeof meta === "object" &&
		"filename" in meta &&
		typeof meta.filename === "string" &&
		meta.filename.trim().length > 0
	) {
		return meta.filename.trim();
	}
	const parts = artifact.storagePath.split("/");
	return parts[parts.length - 1] || "qcut-artifact";
}

function escapeContentDispositionFilename({
	filename,
}: {
	filename: string;
}): string {
	return filename.replace(/["\r\n\\]/g, "_");
}

function getArtifactContentType({
	artifact,
	blob,
}: {
	artifact: typeof agentArtifacts.$inferSelect;
	blob: Blob;
}): string {
	const filename = getArtifactFilename({ artifact }).toLowerCase();
	const dot = filename.lastIndexOf(".");
	if (dot >= 0) {
		const contentType = CONTENT_TYPE_BY_EXTENSION[filename.slice(dot)];
		if (contentType) {
			return contentType;
		}
	}
	if (blob.type.length > 0) {
		return blob.type;
	}
	return "application/octet-stream";
}

function serializeAgentJob(job: typeof agentJobs.$inferSelect) {
	return {
		id: job.id,
		userId: job.userId,
		status: job.status,
		command: job.command,
		args: job.args,
		createdAt: serializeDate({ value: job.createdAt }),
		claimedAt: serializeDate({ value: job.claimedAt }),
		finishedAt: serializeDate({ value: job.finishedAt }),
		exitCode: job.exitCode,
		error: job.error,
		runnerId: job.runnerId,
	};
}

function serializeAgentEvent(event: typeof agentEvents.$inferSelect) {
	return {
		id: event.id,
		jobId: event.jobId,
		userId: event.userId,
		kind: event.kind,
		payload: event.payload,
		createdAt: serializeDate({ value: event.createdAt }),
	};
}

function serializeAgentArtifact(artifact: typeof agentArtifacts.$inferSelect) {
	return {
		id: artifact.id,
		jobId: artifact.jobId,
		userId: artifact.userId,
		kind: artifact.kind,
		storagePath: artifact.storagePath,
		bytes: artifact.bytes,
		meta: artifact.meta,
		createdAt: serializeDate({ value: artifact.createdAt }),
	};
}

export {
	CODEX_AGENT_COMMAND,
	agentRoutes,
	getDefaultAgentUserId,
	validateAgentJobBody,
	validateCommand,
};
