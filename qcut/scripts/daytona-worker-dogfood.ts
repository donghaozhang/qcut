#!/usr/bin/env bun
/**
 * Dogfood the production-shaped Daytona agent-worker path.
 *
 * This script inserts one `agent_jobs` row, starts the worker with
 * DAYTONA_API_KEY set, waits for a terminal job status, and prints the
 * job + artifact evidence. It intentionally leaves the job row in place
 * so the run can be audited later.
 *
 * Required env:
 *   DAYTONA_API_KEY
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   QCUT_DOGFOOD_USER_ID
 *
 * Optional env:
 *   QCUT_IMAGE_TAG=ghcr.io/quriosity-agent/qcut-cli:v0
 *   QCUT_DOGFOOD_COMMAND="qcut system doctor --json --skip-health"
 *   QCUT_DOGFOOD_TIMEOUT_MS=600000
 */

import { randomUUID } from "node:crypto";

const REQUIRED_ENV = [
	"DAYTONA_API_KEY",
	"SUPABASE_URL",
	"SUPABASE_SERVICE_ROLE_KEY",
	"QCUT_DOGFOOD_USER_ID",
] as const;

type RequiredEnv = (typeof REQUIRED_ENV)[number];
type TerminalStatus = "succeeded" | "failed" | "cancelled";

interface DogfoodEnv {
	DAYTONA_API_KEY: string;
	SUPABASE_URL: string;
	SUPABASE_SERVICE_ROLE_KEY: string;
	QCUT_DOGFOOD_USER_ID: string;
	QCUT_IMAGE_TAG: string;
	QCUT_DOGFOOD_COMMAND: string;
	QCUT_DOGFOOD_TIMEOUT_MS: number;
}

interface AgentJobRow {
	id: string;
	user_id: string;
	status: "queued" | "running" | TerminalStatus;
	command: string;
	created_at: string;
	claimed_at: string | null;
	finished_at: string | null;
	exit_code: number | null;
	error: string | null;
	runner_id: string | null;
}

interface AgentArtifactRow {
	id: string;
	kind: string;
	storage_path: string;
	bytes: number | null;
	created_at: string;
}

function getEnv(): DogfoodEnv {
	const missing: RequiredEnv[] = [];
	for (const key of REQUIRED_ENV) {
		if (!process.env[key]) missing.push(key);
	}
	if (missing.length > 0) {
		throw new Error(`Missing required env: ${missing.join(", ")}`);
	}

	return {
		DAYTONA_API_KEY: process.env.DAYTONA_API_KEY as string,
		SUPABASE_URL: process.env.SUPABASE_URL as string,
		SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY as string,
		QCUT_DOGFOOD_USER_ID: process.env.QCUT_DOGFOOD_USER_ID as string,
		QCUT_IMAGE_TAG:
			process.env.QCUT_IMAGE_TAG ?? "ghcr.io/quriosity-agent/qcut-cli:v0",
		QCUT_DOGFOOD_COMMAND:
			process.env.QCUT_DOGFOOD_COMMAND ??
			"qcut system doctor --json --skip-health",
		QCUT_DOGFOOD_TIMEOUT_MS: Number(
			process.env.QCUT_DOGFOOD_TIMEOUT_MS ?? "600000"
		),
	};
}

function buildHeaders({ env }: { env: DogfoodEnv }): HeadersInit {
	return {
		apikey: env.SUPABASE_SERVICE_ROLE_KEY,
		Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
		"Content-Type": "application/json",
	};
}

function restUrl({
	env,
	path,
	query,
}: {
	env: DogfoodEnv;
	path: string;
	query?: string;
}): string {
	const base = env.SUPABASE_URL.replace(/\/$/, "");
	return `${base}/rest/v1/${path}${query ? `?${query}` : ""}`;
}

async function restJson<T>({
	env,
	path,
	query,
	init,
}: {
	env: DogfoodEnv;
	path: string;
	query?: string;
	init?: RequestInit;
}): Promise<T> {
	const response = await fetch(restUrl({ env, path, query }), {
		...init,
		headers: {
			...buildHeaders({ env }),
			...(init?.headers ?? {}),
		},
	});
	const text = await response.text();
	if (!response.ok) {
		throw new Error(`Supabase REST ${path} failed ${response.status}: ${text}`);
	}
	if (!text) return undefined as T;
	return JSON.parse(text) as T;
}

async function insertJob({ env, jobId }: { env: DogfoodEnv; jobId: string }) {
	const now = new Date().toISOString();
	const rows = await restJson<AgentJobRow[]>({
		env,
		path: "agent_jobs",
		init: {
			method: "POST",
			headers: { Prefer: "return=representation" },
			body: JSON.stringify({
				id: jobId,
				user_id: env.QCUT_DOGFOOD_USER_ID,
				status: "queued",
				command: env.QCUT_DOGFOOD_COMMAND,
				args: {},
				created_at: now,
			}),
		},
	});
	return rows[0];
}

async function fetchJob({
	env,
	jobId,
}: {
	env: DogfoodEnv;
	jobId: string;
}): Promise<AgentJobRow> {
	const rows = await restJson<AgentJobRow[]>({
		env,
		path: "agent_jobs",
		query: `id=eq.${jobId}&select=*`,
	});
	const job = rows[0];
	if (!job) throw new Error(`Job ${jobId} disappeared`);
	return job;
}

async function fetchArtifacts({
	env,
	jobId,
}: {
	env: DogfoodEnv;
	jobId: string;
}): Promise<AgentArtifactRow[]> {
	return restJson<AgentArtifactRow[]>({
		env,
		path: "agent_artifacts",
		query: `job_id=eq.${jobId}&select=id,kind,storage_path,bytes,created_at&order=created_at.asc`,
	});
}

async function countSecrets({ env }: { env: DogfoodEnv }): Promise<number> {
	const rows = await restJson<Array<{ key: string }>>({
		env,
		path: "agent_secrets",
		query: `user_id=eq.${env.QCUT_DOGFOOD_USER_ID}&select=key`,
	});
	return rows.length;
}

function isTerminalStatus({
	status,
}: {
	status: AgentJobRow["status"];
}): status is TerminalStatus {
	return (
		status === "succeeded" || status === "failed" || status === "cancelled"
	);
}

function sleep({ ms }: { ms: number }): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollJob({
	env,
	jobId,
	deadline,
}: {
	env: DogfoodEnv;
	jobId: string;
	deadline: number;
}): Promise<AgentJobRow> {
	const job = await fetchJob({ env, jobId });
	console.log(
		`[dogfood] job ${job.id} status=${job.status} exit=${job.exit_code ?? ""}`
	);
	if (isTerminalStatus({ status: job.status })) return job;
	if (Date.now() > deadline) {
		throw new Error(`Timed out waiting for job ${jobId}`);
	}
	await sleep({ ms: 5000 });
	return pollJob({ env, jobId, deadline });
}

function startWorker({ env }: { env: DogfoodEnv }): Bun.Subprocess {
	return Bun.spawn(["bun", "--cwd", "packages/agent-worker", "start"], {
		env: {
			...process.env,
			DAYTONA_API_KEY: env.DAYTONA_API_KEY,
			QCUT_IMAGE_TAG: env.QCUT_IMAGE_TAG,
			SUPABASE_URL: env.SUPABASE_URL,
			SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
			IDLE_POLL_MS: "2000",
		},
		stdout: "inherit",
		stderr: "inherit",
	});
}

async function stopWorker({ worker }: { worker: Bun.Subprocess }) {
	worker.kill("SIGTERM");
	await worker.exited.catch(() => undefined);
}

const env = getEnv();
const jobId = `dogfood-${randomUUID()}`;

console.log(`[dogfood] image=${env.QCUT_IMAGE_TAG}`);
console.log(`[dogfood] user=${env.QCUT_DOGFOOD_USER_ID}`);
console.log(`[dogfood] command=${env.QCUT_DOGFOOD_COMMAND}`);

const secretCount = await countSecrets({ env });
console.log(`[dogfood] agent_secrets count=${secretCount}`);
if (secretCount === 0) {
	console.warn(
		"[dogfood] no agent_secrets found; doctor may still pass, but provider-backed commands will fail"
	);
}

const job = await insertJob({ env, jobId });
console.log(`[dogfood] queued job=${job.id}`);

const worker = startWorker({ env });
try {
	const finalJob = await pollJob({
		env,
		jobId,
		deadline: Date.now() + env.QCUT_DOGFOOD_TIMEOUT_MS,
	});
	const artifacts = await fetchArtifacts({ env, jobId });
	console.log("[dogfood] final job:");
	console.log(JSON.stringify(finalJob, null, 2));
	console.log("[dogfood] artifacts:");
	console.log(JSON.stringify(artifacts, null, 2));
	if (finalJob.status !== "succeeded") {
		process.exitCode = 1;
	}
} finally {
	await stopWorker({ worker });
}
