#!/usr/bin/env bun
/**
 * Agent worker entry point.
 *
 *   bun run start
 *
 * Required env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional env:
 *   QCUT_IMAGE_TAG   (default: qcut-cli:dev)
 *   DAYTONA_API_KEY  (when present, the run path swaps in run-on-daytona)
 *   IDLE_POLL_MS     (default: 5000)
 *   AGENT_SESSION_CLEANUP_MS (default: 60000)
 *
 * The worker keeps a Realtime subscription to agent_jobs INSERTs as a
 * wake-up hint, and falls back to polling so a network blip doesn't
 * strand a queued row. Claims are atomic (claim_one_agent_job RPC).
 *
 * @module @qcut/agent-worker/main
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";

import type { AgentJob } from "@qcut/db";

import { claimOneJob } from "./claim.js";
import type { ContainerResult } from "./run-container.js";
import { runContainer } from "./run-container.js";
import { streamEvents } from "./stream-events.js";
import { uploadArtifacts } from "./upload-artifacts.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const IDLE_POLL_MS = Number(process.env.IDLE_POLL_MS ?? "5000");
const AGENT_SESSION_CLEANUP_MS = Number(
	process.env.AGENT_SESSION_CLEANUP_MS ?? "60000"
);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
	console.error(
		"[agent-worker] missing env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are required"
	);
	process.exit(2);
}

const RUNNER_ID = randomUUID();
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

console.log(`[agent-worker ${RUNNER_ID}] starting`);

let draining = false;
async function tryDrain(): Promise<void> {
	if (draining) return;
	draining = true;
	try {
		while (true) {
			let job: AgentJob | null;
			try {
				job = await claimOneJob(supabase, RUNNER_ID);
			} catch (err) {
				console.error("[agent-worker] claim error:", err);
				return;
			}
			if (!job) return;
			console.log(`[agent-worker] claimed ${job.id} (${job.command})`);
			await executeJob(job);
		}
	} finally {
		draining = false;
	}
}

/** Lazily import the Daytona path so local-only runs don't need the SDK. */
async function chooseRunner(job: AgentJob): Promise<ContainerResult> {
	if (process.env.DAYTONA_API_KEY) {
		const { runOnDaytona } = await import("./run-on-daytona.js");
		return runOnDaytona({ supabase, job });
	}
	return runContainer(supabase, job);
}

async function cleanupAgentSessions(): Promise<void> {
	if (!process.env.DAYTONA_API_KEY) {
		return;
	}
	try {
		const { cleanupDaytonaAgentSessions } = await import("./run-on-daytona.js");
		const count = await cleanupDaytonaAgentSessions({
			supabase,
			runnerId: RUNNER_ID,
		});
		if (count > 0) {
			console.log(`[agent-worker] cleaned up ${count} agent session(s)`);
		}
	} catch (err) {
		console.error("[agent-worker] agent session cleanup failed:", err);
	}
}

async function executeJob(job: AgentJob): Promise<void> {
	let outputDir: string | undefined;
	try {
		const result = await chooseRunner(job);
		outputDir = result.outputDir;
		if (!result.eventsStreamed) {
			await streamEvents(supabase, job, result.stderr);
		}
		await uploadArtifacts({ supabase, job, dir: result.outputDir });

		const status = result.exitCode === 0 ? "succeeded" : "failed";
		await supabase
			.from("agent_jobs")
			.update({
				status,
				exit_code: result.exitCode,
				finished_at: new Date().toISOString(),
				error:
					result.exitCode === 0 ? null : result.stderr.slice(-2000) || null,
			})
			.eq("id", job.id);
		console.log(
			`[agent-worker] ${job.id} → ${status} (exit ${result.exitCode})`
		);
	} catch (err) {
		console.error(`[agent-worker] job ${job.id} threw:`, err);
		await supabase
			.from("agent_jobs")
			.update({
				status: "failed",
				exit_code: 1,
				finished_at: new Date().toISOString(),
				error: String(err).slice(0, 4000),
			})
			.eq("id", job.id);
	} finally {
		// Per-job tmp dir holds materialized artifacts that have already
		// been uploaded to Storage — leaving them on disk eventually fills
		// the worker host.
		if (outputDir) {
			try {
				await rm(outputDir, { recursive: true, force: true });
			} catch (cleanupErr) {
				console.error(
					`[agent-worker] cleanup ${outputDir} failed:`,
					cleanupErr
				);
			}
		}
	}
}

const channel = supabase
	.channel("agent-jobs")
	.on(
		"postgres_changes",
		{ event: "INSERT", schema: "public", table: "agent_jobs" },
		() => {
			void tryDrain();
		}
	)
	.subscribe((status, err) => {
		// All four supabase-js statuses get surfaced so operators can see
		// the channel state in logs. Polling (idleTimer) keeps the worker
		// drained during a CHANNEL_ERROR / TIMED_OUT outage.
		if (status === "SUBSCRIBED") {
			console.log(
				`[agent-worker ${RUNNER_ID}] subscribed to agent_jobs INSERT`
			);
		} else if (status === "CHANNEL_ERROR") {
			console.error(
				`[agent-worker ${RUNNER_ID}] realtime CHANNEL_ERROR; falling back to ${IDLE_POLL_MS}ms poll:`,
				err
			);
		} else if (status === "TIMED_OUT") {
			console.warn(
				`[agent-worker ${RUNNER_ID}] realtime TIMED_OUT; polling will keep claims flowing`
			);
		} else if (status === "CLOSED") {
			console.warn(`[agent-worker ${RUNNER_ID}] realtime channel CLOSED`);
		}
	});

const idleTimer = setInterval(() => void tryDrain(), IDLE_POLL_MS);
const sessionCleanupTimer = setInterval(
	() => void cleanupAgentSessions(),
	AGENT_SESSION_CLEANUP_MS
);

async function shutdown(sig: string): Promise<void> {
	console.log(`[agent-worker ${RUNNER_ID}] ${sig}, draining…`);
	clearInterval(idleTimer);
	clearInterval(sessionCleanupTimer);
	await channel.unsubscribe();
	process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

// Kick once on startup so a row queued before subscription gets picked up.
void tryDrain();
void cleanupAgentSessions();
