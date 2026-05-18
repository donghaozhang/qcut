import { Hono, type Context, type Next } from "hono";
import { and, desc, eq, gt } from "drizzle-orm";
import { Daytona, Image } from "@daytona/sdk";
import { SignJWT } from "jose";
import {
	agentArtifacts,
	agentEvents,
	agentJobs,
	agentSessions,
	agentSecrets,
} from "@qcut/db/schema";
import { db } from "../db/drizzle";
import { getSupabase } from "../db/supabase";
import { authMiddleware } from "../middleware/auth";
import { downloadDaytonaFileBytes } from "../services/daytona-download";

const agentRoutes = new Hono();

const MAX_COMMAND_LENGTH = 2000;
const MAX_CODEX_PROMPT_LENGTH = 12_000;
const MAX_AGENT_SOURCE_LENGTH = 120;
const MAX_TEXT_ARTIFACT_BYTES = 256_000;
const MAX_TERMINAL_ARTIFACTS = 80;
const MAX_SESSION_UPLOAD_BYTES = 25 * 1024 * 1024;
const AGENT_SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const AGENT_SESSION_SANDBOX_AUTO_STOP_MINUTES = 120;
const DAYTONA_CREATE_REQUEST_TIMEOUT_MS = 45_000;
const AGENT_TERMINAL_RETRY_AFTER_MS = 3_000;
const TERMINAL_INPUT_DIR = "/tmp/qcut-input";
const TERMINAL_OUTPUT_DIR = "/tmp/qcut-output";
const SAFE_COMMAND_TOKEN = /^[A-Za-z0-9_\-./:=,@+]+$/;
const CODEX_AGENT_COMMAND = "codex exec --skip-git-repo-check --json -";
const DEFAULT_DAYTONA_IMAGE =
	"ghcr.io/quriosity-agent/qcut-cli@sha256:48aa813162bf7a4b20d38ec694ccc0e1ffc9b61dcdc8c9e1447749d77b500923";
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
	sessionId?: string;
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

agentRoutes.post("/sessions", async (c) => {
	try {
		return await createOrReuseAgentSession(c);
	} catch (error) {
		return c.json(
			{
				error:
					error instanceof Error
						? `Failed to create agent session: ${error.message}`
						: "Failed to create agent session",
			},
			500
		);
	}
});

agentRoutes.post("/sessions/:sessionId/end", async (c) => {
	try {
		return await endAgentSession(c);
	} catch (error) {
		return c.json(
			{
				error:
					error instanceof Error
						? `Failed to end agent session: ${error.message}`
						: "Failed to end agent session",
			},
			500
		);
	}
});

agentRoutes.post("/sessions/:sessionId/pty-token", async (c) => {
	try {
		return await createAgentPtyToken(c);
	} catch (error) {
		return c.json(
			{
				error:
					error instanceof Error
						? `Failed to create agent terminal: ${error.message}`
						: "Failed to create agent terminal",
			},
			500
		);
	}
});

agentRoutes.get("/sessions/:sessionId/artifacts", async (c) => {
	try {
		return await listAgentSessionArtifacts(c);
	} catch (error) {
		return c.json(
			{
				error:
					error instanceof Error
						? `Failed to list session artifacts: ${error.message}`
						: "Failed to list session artifacts",
			},
			500
		);
	}
});

agentRoutes.get("/sessions/:sessionId/files", async (c) => {
	try {
		return await listAgentSessionFiles(c);
	} catch (error) {
		return c.json(
			{
				error:
					error instanceof Error
						? `Failed to list session files: ${error.message}`
						: "Failed to list session files",
			},
			500
		);
	}
});

agentRoutes.post("/sessions/:sessionId/files", async (c) => {
	try {
		return await uploadAgentSessionFiles(c);
	} catch (error) {
		return c.json(
			{
				error:
					error instanceof Error
						? `Failed to upload session file: ${error.message}`
						: "Failed to upload session file",
			},
			500
		);
	}
});

agentRoutes.get("/sessions/:sessionId/files/download", async (c) => {
	try {
		return await downloadAgentSessionFilesystemPath(c);
	} catch (error) {
		return c.json(
			{
				error:
					error instanceof Error
						? `Failed to download session file: ${error.message}`
						: "Failed to download session file",
			},
			500
		);
	}
});

agentRoutes.get(
	"/sessions/:sessionId/files/:folder/:filename/download",
	async (c) => {
		try {
			return await downloadAgentSessionFile(c);
		} catch (error) {
			return c.json(
				{
					error:
						error instanceof Error
							? `Failed to download session file: ${error.message}`
							: "Failed to download session file",
				},
				500
			);
		}
	}
);

agentRoutes.get(
	"/sessions/:sessionId/artifacts/:filename/download",
	async (c) => {
		try {
			return await downloadAgentSessionArtifact(c);
		} catch (error) {
			return c.json(
				{
					error:
						error instanceof Error
							? `Failed to download session artifact: ${error.message}`
							: "Failed to download session artifact",
				},
				500
			);
		}
	}
);

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

async function createOrReuseAgentSession(c: Context) {
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

async function endAgentSession(c: Context) {
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

type DaytonaClient = InstanceType<typeof Daytona>;
type DaytonaSandbox = Awaited<ReturnType<DaytonaClient["create"]>>;
type AgentTerminalSandboxSnapshot = Pick<DaytonaSandbox, "id"> & {
	state?: string;
	errorReason?: string;
};
type DaytonaSandboxCreateApi = {
	createSandbox: (
		body: Record<string, unknown>,
		organizationId?: unknown,
		options?: { timeout?: number }
	) => Promise<{ data: AgentTerminalSandboxSnapshot }>;
};
type DaytonaCreateOnlyClient = {
	sandboxApi: DaytonaSandboxCreateApi;
	target?: string;
};

async function createAgentPtyToken(c: Context) {
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

async function listAgentSessionArtifacts(c: Context) {
	const userId = c.get("userId") as string;
	const session = await getRequestAgentSession({ c, userId });
	if (!session) {
		return c.json({ error: "agent_session_not_found" }, 404);
	}
	if (!session.providerSessionId) {
		return c.json({ artifacts: [] });
	}

	const sandbox = await getDaytonaSandboxForSession({ session });
	let files: Array<{ isDir?: boolean; name?: string; size?: number }>;
	try {
		files = await sandbox.fs.listFiles(TERMINAL_OUTPUT_DIR);
	} catch {
		files = [];
	}
	const fileArtifacts = parseTerminalArtifactFiles({ files });
	const terminalArtifacts =
		fileArtifacts.length > 0
			? fileArtifacts
			: await listTerminalArtifactsViaShell({ sandbox });
	const artifacts = terminalArtifacts
		.slice(0, MAX_TERMINAL_ARTIFACTS)
		.map((artifact) =>
			serializeTerminalArtifact({
				sessionId: session.id,
				artifact,
			})
		);

	return c.json({ artifacts });
}

async function listAgentSessionFiles(c: Context) {
	const userId = c.get("userId") as string;
	const session = await getRequestAgentSession({ c, userId });
	if (!session) {
		return c.json({ error: "agent_session_not_found" }, 404);
	}
	if (!session.providerSessionId) {
		const path = normalizeSandboxPath({ value: c.req.query("path") });
		if (c.req.query("path") !== undefined && !path) {
			return c.json({ error: "session_file_path_invalid" }, 400);
		}
		return c.json({
			path: path ?? null,
			parentPath: path ? getSandboxParentPath({ path }) : null,
			files: [],
		});
	}

	const sandbox = await getDaytonaSandboxForSession({ session });
	const requestedPath = c.req.query("path");
	if (requestedPath !== undefined) {
		const path = normalizeSandboxPath({ value: requestedPath });
		if (!path) {
			return c.json({ error: "session_file_path_invalid" }, 400);
		}
		const files = await listSandboxFilesForPath({ sandbox, path });
		return c.json({
			path,
			parentPath: getSandboxParentPath({ path }),
			files: files
				.slice(0, MAX_TERMINAL_ARTIFACTS)
				.map((file) => serializeSandboxFile({ sessionId: session.id, file })),
		});
	}

	const [inputFiles, outputFiles] = await Promise.all([
		listTerminalFilesForDir({
			sandbox,
			dir: TERMINAL_INPUT_DIR,
			folder: "input",
		}),
		listTerminalFilesForDir({
			sandbox,
			dir: TERMINAL_OUTPUT_DIR,
			folder: "output",
		}),
	]);

	return c.json({
		files: [...inputFiles, ...outputFiles]
			.slice(0, MAX_TERMINAL_ARTIFACTS)
			.map((file) => serializeSessionFile({ sessionId: session.id, file })),
	});
}

async function uploadAgentSessionFiles(c: Context) {
	const userId = c.get("userId") as string;
	const session = await getRequestAgentSession({ c, userId });
	if (!session) {
		return c.json({ error: "agent_session_not_found" }, 404);
	}
	if (!session.providerSessionId) {
		return c.json({ error: "agent_session_sandbox_not_ready" }, 409);
	}

	const requestedPath = c.req.query("path");
	const uploadDir =
		requestedPath === undefined
			? TERMINAL_INPUT_DIR
			: normalizeSandboxPath({ value: requestedPath });
	if (!uploadDir) {
		return c.json({ error: "session_file_path_invalid" }, 400);
	}
	const body = await c.req.parseBody({ all: true });
	const uploads = extractUploadFiles({ body });
	if (uploads.length === 0) {
		return c.json({ error: "upload_file_required" }, 400);
	}

	const sandbox = await getDaytonaSandboxForSession({ session });
	if (uploadDir !== "/") {
		await sandbox.fs.createFolder(uploadDir, "755").catch(() => {});
	}

	const uploaded: Array<{ filename: string; bytes: number }> = [];
	for (const file of uploads) {
		const filename = normalizeUploadedFilename({ value: file.name });
		if (!filename) {
			return c.json({ error: "upload_filename_invalid" }, 400);
		}
		if (file.size > MAX_SESSION_UPLOAD_BYTES) {
			return c.json({ error: "upload_file_too_large" }, 413);
		}
		await sandbox.fs.uploadFile(
			file as unknown as Buffer,
			joinSandboxPath({ dir: uploadDir, filename }),
			10 * 60
		);
		uploaded.push({ filename, bytes: file.size });
	}

	return c.json(
		{
			files: uploaded.map((file) => {
				if (requestedPath !== undefined) {
					return serializeSandboxFile({
						sessionId: session.id,
						file: {
							...file,
							isDir: false,
							path: joinSandboxPath({
								dir: uploadDir,
								filename: file.filename,
							}),
							parentPath: uploadDir,
						},
					});
				}
				return serializeSessionFile({
					sessionId: session.id,
					file: {
						...file,
						folder: "input",
						dir: TERMINAL_INPUT_DIR,
					},
				});
			}),
		},
		201
	);
}

async function downloadAgentSessionArtifact(c: Context) {
	const userId = c.get("userId") as string;
	const session = await getRequestAgentSession({ c, userId });
	if (!session) {
		return c.json({ error: "agent_session_not_found" }, 404);
	}
	if (!session.providerSessionId) {
		return c.json({ error: "agent_session_sandbox_not_ready" }, 409);
	}

	const filename = normalizeTerminalArtifactFilename({
		value: c.req.param("filename"),
	});
	if (!filename) {
		return c.json({ error: "artifact_filename_invalid" }, 400);
	}

	const sandbox = await getDaytonaSandboxForSession({ session });
	const remotePath = `${TERMINAL_OUTPUT_DIR}/${filename}`;
	const fileBytes = await downloadDaytonaFileBytes({
		sandbox,
		remotePath,
		timeoutSeconds: 10 * 60,
	});
	const headers: Record<string, string> = {
		"Content-Disposition": `attachment; filename="${escapeContentDispositionFilename({ filename })}"`,
		"Content-Type": getContentTypeByFilename({ filename }),
		"Content-Length": String(fileBytes.byteLength),
	};

	return c.body(fileBytes, 200, headers);
}

async function downloadAgentSessionFilesystemPath(c: Context) {
	const userId = c.get("userId") as string;
	const session = await getRequestAgentSession({ c, userId });
	if (!session) {
		return c.json({ error: "agent_session_not_found" }, 404);
	}
	if (!session.providerSessionId) {
		return c.json({ error: "agent_session_sandbox_not_ready" }, 409);
	}

	const path = normalizeSandboxPath({ value: c.req.query("path") });
	if (!path || path === "/") {
		return c.json({ error: "session_file_path_invalid" }, 400);
	}

	const filename = getSandboxPathBasename({ path });
	if (!filename) {
		return c.json({ error: "session_file_filename_invalid" }, 400);
	}

	const sandbox = await getDaytonaSandboxForSession({ session });
	const fileBytes = await downloadDaytonaFileBytes({
		sandbox,
		remotePath: path,
		timeoutSeconds: 10 * 60,
	});
	const headers: Record<string, string> = {
		"Content-Disposition": `attachment; filename="${escapeContentDispositionFilename({ filename })}"`,
		"Content-Type": getContentTypeByFilename({ filename }),
		"Content-Length": String(fileBytes.byteLength),
	};

	return c.body(fileBytes, 200, headers);
}

async function downloadAgentSessionFile(c: Context) {
	const userId = c.get("userId") as string;
	const session = await getRequestAgentSession({ c, userId });
	if (!session) {
		return c.json({ error: "agent_session_not_found" }, 404);
	}
	if (!session.providerSessionId) {
		return c.json({ error: "agent_session_sandbox_not_ready" }, 409);
	}

	const folder = normalizeSessionFileFolder({ value: c.req.param("folder") });
	if (!folder) {
		return c.json({ error: "session_file_folder_invalid" }, 400);
	}

	const filename = normalizeTerminalArtifactFilename({
		value: c.req.param("filename"),
	});
	if (!filename) {
		return c.json({ error: "session_file_filename_invalid" }, 400);
	}

	const dir = folder === "input" ? TERMINAL_INPUT_DIR : TERMINAL_OUTPUT_DIR;
	const sandbox = await getDaytonaSandboxForSession({ session });
	const fileBytes = await downloadDaytonaFileBytes({
		sandbox,
		remotePath: `${dir}/${filename}`,
		timeoutSeconds: 10 * 60,
	});
	const headers: Record<string, string> = {
		"Content-Disposition": `attachment; filename="${escapeContentDispositionFilename({ filename })}"`,
		"Content-Type": getContentTypeByFilename({ filename }),
		"Content-Length": String(fileBytes.byteLength),
	};

	return c.body(fileBytes, 200, headers);
}

async function getRequestAgentSession({
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

async function getDaytonaSandboxForSession({
	session,
}: {
	session: typeof agentSessions.$inferSelect;
}): Promise<DaytonaSandbox> {
	if (!session.providerSessionId) {
		throw new Error("agent_session_sandbox_not_ready");
	}
	const apiKey = getDaytonaApiKey();
	if (!apiKey) {
		throw new Error("agent_terminal_misconfigured: daytona");
	}
	const daytona = new Daytona({ apiKey });
	return daytona.get(session.providerSessionId);
}

async function getOrCreateAgentTerminalSandbox({
	daytona,
	session,
	userId,
}: {
	daytona: DaytonaClient;
	session: typeof agentSessions.$inferSelect;
	userId: string;
}): Promise<AgentTerminalSandboxSnapshot> {
	if (session.providerSessionId) {
		try {
			return await daytona.get(session.providerSessionId);
		} catch (error) {
			await db.insert(agentEvents).values({
				jobId: null,
				userId,
				kind: "agent_terminal_sandbox_replaced",
				payload: {
					sessionId: session.id,
					sandboxId: session.providerSessionId,
					error: error instanceof Error ? error.message : String(error),
				},
				createdAt: new Date(),
			});
		}
	}

	return createAgentTerminalSandbox({ daytona, userId });
}

async function createAgentTerminalSandbox({
	daytona,
	userId,
}: {
	daytona: DaytonaClient;
	userId: string;
}): Promise<AgentTerminalSandboxSnapshot> {
	const envVars = await buildAgentTerminalEnv({ userId });
	const imageTag = getAgentImageTag();
	const createClient = daytona as unknown as DaytonaCreateOnlyClient;
	const response = await createClient.sandboxApi.createSandbox(
		{
			buildInfo: { dockerfileContent: Image.base(imageTag).dockerfile },
			env: envVars,
			labels: { "code-toolbox-language": "python" },
			target: createClient.target,
			cpu: 2,
			memory: 4,
			autoStopInterval: AGENT_SESSION_SANDBOX_AUTO_STOP_MINUTES,
			autoDeleteInterval: 0,
		},
		undefined,
		{ timeout: DAYTONA_CREATE_REQUEST_TIMEOUT_MS }
	);
	if (!response.data?.id) {
		throw new Error("agent_terminal_sandbox_create_invalid_response");
	}
	return response.data;
}

function isAgentTerminalSandboxStarted({
	sandbox,
}: {
	sandbox: AgentTerminalSandboxSnapshot;
}): boolean {
	return sandbox.state === "started";
}

function isAgentTerminalSandboxFailed({
	sandbox,
}: {
	sandbox: AgentTerminalSandboxSnapshot;
}): boolean {
	return ["build_failed", "destroyed", "error"].includes(sandbox.state || "");
}

async function buildAgentTerminalEnv({
	userId,
}: {
	userId: string;
}): Promise<Record<string, string>> {
	const secrets = await db
		.select({ key: agentSecrets.key, value: agentSecrets.value })
		.from(agentSecrets)
		.where(eq(agentSecrets.userId, userId));
	const envVars: Record<string, string> = { QCUT_SESSION_ROLE: "agent" };
	for (const secret of secrets) envVars[secret.key] = secret.value;
	return envVars;
}

function getDaytonaApiKey(): string {
	const value = process.env.DAYTONA_API_KEY;
	return typeof value === "string" ? value.trim() : "";
}

function getRelaySigningSecret(): string {
	const value = process.env.RELAY_SIGNING_SECRET;
	return typeof value === "string" ? value.trim() : "";
}

function getRelayHost(): string {
	const value = process.env.RELAY_HOST;
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: "qcut-relay.zdhpeter.workers.dev";
}

async function getActiveOwnedAgentSession({
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

function getAgentJobSource({
	args,
}: {
	args?: Record<string, unknown>;
}): string {
	const source = args?.source;
	if (typeof source !== "string") {
		return "website_chat_agent";
	}
	const trimmed = source.trim();
	if (trimmed.length === 0) {
		return "website_chat_agent";
	}
	return trimmed.slice(0, MAX_AGENT_SOURCE_LENGTH);
}

function getAgentImageTag(): string {
	const value = process.env.QCUT_IMAGE_TAG;
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: DEFAULT_DAYTONA_IMAGE;
}

function normalizeOptionalId({ value }: { value: unknown }): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
}

function normalizeTerminalArtifactFilename({
	value,
}: {
	value: unknown;
}): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const trimmed = value.trim();
	if (
		trimmed.length === 0 ||
		trimmed.length > 255 ||
		trimmed === "." ||
		trimmed === ".." ||
		trimmed.includes("/") ||
		trimmed.includes("\\") ||
		trimmed.includes("\0")
	) {
		return null;
	}
	return trimmed;
}

function normalizeUploadedFilename({
	value,
}: {
	value: unknown;
}): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const base = value.split(/[\\/]/).pop() ?? "";
	const trimmed = base.trim();
	if (!normalizeTerminalArtifactFilename({ value: trimmed })) {
		return null;
	}
	return trimmed;
}

function normalizeSandboxPath({ value }: { value: unknown }): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const trimmed = value.trim();
	if (
		trimmed.length === 0 ||
		!trimmed.startsWith("/") ||
		trimmed.includes("\\") ||
		trimmed.includes("\0")
	) {
		return null;
	}
	const segments = trimmed.split("/").filter((segment) => segment.length > 0);
	if (segments.some((segment) => segment === "." || segment === "..")) {
		return null;
	}
	return `/${segments.join("/")}`;
}

function getSandboxParentPath({ path }: { path: string }): string | null {
	if (path === "/") {
		return null;
	}
	const segments = path.split("/").filter((segment) => segment.length > 0);
	if (segments.length <= 1) {
		return "/";
	}
	return `/${segments.slice(0, -1).join("/")}`;
}

function getSandboxPathBasename({ path }: { path: string }): string | null {
	const segments = path.split("/").filter((segment) => segment.length > 0);
	const basename = segments[segments.length - 1] || "";
	return normalizeTerminalArtifactFilename({ value: basename });
}

function joinSandboxPath({
	dir,
	filename,
}: {
	dir: string;
	filename: string;
}): string {
	return dir === "/" ? `/${filename}` : `${dir}/${filename}`;
}

function normalizeSessionFileFolder({
	value,
}: {
	value: unknown;
}): "input" | "output" | null {
	if (value === "input" || value === "output") {
		return value;
	}
	return null;
}

function isUploadFile(value: unknown): value is File {
	return Boolean(
		value &&
			typeof value === "object" &&
			typeof (value as File).name === "string" &&
			typeof (value as File).size === "number" &&
			typeof (value as File).arrayBuffer === "function"
	);
}

function extractUploadFiles({
	body,
}: {
	body: Record<string, unknown>;
}): File[] {
	const values = [body.file, body.files].flat();
	return values.filter(isUploadFile);
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

function parseTerminalArtifactList({
	stdout,
}: {
	stdout: string;
}): Array<{ filename: string; bytes: number }> {
	return stdout
		.split("\n")
		.map((line) => line.trimEnd())
		.filter((line) => line.length > 0)
		.flatMap((line) => {
			const [filename, rawBytes] = line.split("\t");
			const safeFilename = normalizeTerminalArtifactFilename({
				value: filename,
			});
			if (!safeFilename) {
				return [];
			}
			const bytes = Number(rawBytes);
			return [
				{
					filename: safeFilename,
					bytes: Number.isFinite(bytes) && bytes >= 0 ? bytes : 0,
				},
			];
		});
}

function parseTerminalArtifactFiles({
	files,
}: {
	files: Array<{ isDir?: boolean; name?: string; size?: number }>;
}): Array<{ filename: string; bytes: number }> {
	return files
		.filter((file) => !file.isDir)
		.flatMap((file) => {
			const safeFilename = normalizeTerminalArtifactFilename({
				value: file.name,
			});
			if (!safeFilename) {
				return [];
			}
			const bytes = Number(file.size);
			return [
				{
					filename: safeFilename,
					bytes: Number.isFinite(bytes) && bytes >= 0 ? bytes : 0,
				},
			];
		})
		.sort((left, right) => left.filename.localeCompare(right.filename));
}

async function listTerminalArtifactsViaShell({
	sandbox,
}: {
	sandbox: DaytonaSandbox;
}): Promise<Array<{ filename: string; bytes: number }>> {
	const result = await sandbox.process.executeCommand(
		buildTerminalArtifactListCommand(),
		"/home/qcut/qcut",
		undefined,
		30
	);
	const stdout = typeof result.result === "string" ? result.result : "";
	return parseTerminalArtifactList({ stdout });
}

async function listTerminalFilesForDir({
	sandbox,
	dir,
	folder,
}: {
	sandbox: DaytonaSandbox;
	dir: string;
	folder: "input" | "output";
}): Promise<
	Array<{
		filename: string;
		bytes: number;
		folder: "input" | "output";
		dir: string;
	}>
> {
	let files: Array<{ isDir?: boolean; name?: string; size?: number }>;
	try {
		files = await sandbox.fs.listFiles(dir);
	} catch {
		files = [];
	}
	return parseTerminalArtifactFiles({ files }).map((file) => ({
		...file,
		folder,
		dir,
	}));
}

async function listSandboxFilesForPath({
	sandbox,
	path,
}: {
	sandbox: DaytonaSandbox;
	path: string;
}): Promise<
	Array<{
		filename: string;
		bytes: number;
		isDir: boolean;
		path: string;
		parentPath: string;
	}>
> {
	let files: Array<{ isDir?: boolean; name?: string; size?: number }>;
	try {
		files = await sandbox.fs.listFiles(path);
	} catch {
		files = [];
	}
	return files
		.flatMap((file) => {
			const filename = normalizeTerminalArtifactFilename({
				value: file.name,
			});
			if (!filename) {
				return [];
			}
			const bytes = Number(file.size);
			return [
				{
					filename,
					bytes: Number.isFinite(bytes) && bytes >= 0 ? bytes : 0,
					isDir: Boolean(file.isDir),
					path: joinSandboxPath({ dir: path, filename }),
					parentPath: path,
				},
			];
		})
		.sort((left, right) => {
			if (left.isDir !== right.isDir) {
				return left.isDir ? -1 : 1;
			}
			return left.filename.localeCompare(right.filename);
		});
}

function buildTerminalArtifactListCommand(): string {
	const script = [
		`if [ -d ${TERMINAL_OUTPUT_DIR} ]; then`,
		`for file in ${TERMINAL_OUTPUT_DIR}/*; do`,
		'[ -f "$file" ] || continue',
		"filename=${file##*/}",
		'bytes=$(wc -c < "$file" | tr -d " ")',
		'printf "%s\\t%s\\n" "$filename" "$bytes"',
		"done | sort",
		"fi",
	].join("\n");
	return `sh -lc ${shellSingleQuote({ value: script })}`;
}

function shellSingleQuote({ value }: { value: string }): string {
	return `'${value.replace(/'/g, "'\"'\"'")}'`;
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

function getContentTypeByFilename({ filename }: { filename: string }): string {
	const normalized = filename.toLowerCase();
	const dot = normalized.lastIndexOf(".");
	if (dot >= 0) {
		return (
			CONTENT_TYPE_BY_EXTENSION[normalized.slice(dot)] ||
			"application/octet-stream"
		);
	}
	return "application/octet-stream";
}

function serializeAgentJob(job: typeof agentJobs.$inferSelect) {
	return {
		id: job.id,
		userId: job.userId,
		sessionId: job.sessionId,
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

function serializeAgentSession(session: typeof agentSessions.$inferSelect) {
	return {
		id: session.id,
		userId: session.userId,
		status: session.status,
		provider: session.provider,
		providerSessionId: session.providerSessionId,
		imageTag: session.imageTag,
		startedAt: serializeDate({ value: session.startedAt }),
		lastActiveAt: serializeDate({ value: session.lastActiveAt }),
		expiresAt: serializeDate({ value: session.expiresAt }),
		endedAt: serializeDate({ value: session.endedAt }),
		endReason: session.endReason,
		runnerId: session.runnerId,
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

function serializeTerminalArtifact({
	sessionId,
	artifact,
}: {
	sessionId: string;
	artifact: { filename: string; bytes: number };
}) {
	return {
		id: artifact.filename,
		sessionId,
		jobId: null,
		userId: null,
		kind: classifyArtifactKind({ filename: artifact.filename }),
		storagePath: `${TERMINAL_OUTPUT_DIR}/${artifact.filename}`,
		bytes: artifact.bytes,
		meta: { filename: artifact.filename, source: "terminal" },
		createdAt: null,
	};
}

function serializeSessionFile({
	sessionId,
	file,
}: {
	sessionId: string;
	file: {
		filename: string;
		bytes: number;
		folder: "input" | "output";
		dir: string;
	};
}) {
	return {
		id: `${file.folder}/${file.filename}`,
		sessionId,
		jobId: null,
		userId: null,
		kind: classifyArtifactKind({ filename: file.filename }),
		storagePath: `${file.dir}/${file.filename}`,
		bytes: file.bytes,
		meta: {
			filename: file.filename,
			folder: file.folder,
			source: file.folder === "input" ? "upload" : "terminal",
		},
		createdAt: null,
	};
}

function serializeSandboxFile({
	sessionId,
	file,
}: {
	sessionId: string;
	file: {
		filename: string;
		bytes: number;
		isDir: boolean;
		path: string;
		parentPath: string;
	};
}) {
	return {
		id: file.path,
		sessionId,
		jobId: null,
		userId: null,
		kind: file.isDir
			? "folder"
			: classifyArtifactKind({ filename: file.filename }),
		storagePath: file.path,
		bytes: file.isDir ? 0 : file.bytes,
		meta: {
			filename: file.filename,
			path: file.path,
			parentPath: file.parentPath,
			isDir: file.isDir,
			folder: "filesystem",
			source: "sandbox_fs",
		},
		createdAt: null,
	};
}

function classifyArtifactKind({
	filename,
}: {
	filename: string;
}): "image" | "video" | "audio" | "json" | "log" {
	const dot = filename.lastIndexOf(".");
	const ext = dot >= 0 ? filename.toLowerCase().slice(dot) : "";
	if ([".gif", ".jpeg", ".jpg", ".png", ".webp"].includes(ext)) {
		return "image";
	}
	if ([".mov", ".mp4", ".webm"].includes(ext)) {
		return "video";
	}
	if ([".m4a", ".mp3", ".ogg", ".wav"].includes(ext)) {
		return "audio";
	}
	if (ext === ".json") {
		return "json";
	}
	return "log";
}

export {
	CODEX_AGENT_COMMAND,
	agentRoutes,
	buildTerminalArtifactListCommand,
	getDefaultAgentUserId,
	normalizeUploadedFilename,
	parseTerminalArtifactFiles,
	parseTerminalArtifactList,
	validateAgentJobBody,
	validateCommand,
};
