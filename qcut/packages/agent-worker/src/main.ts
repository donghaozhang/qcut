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
 *
 * The worker keeps a Realtime subscription to agent_jobs INSERTs as a
 * wake-up hint, and falls back to polling so a network blip doesn't
 * strand a queued row. Claims are atomic (claim_one_agent_job RPC).
 *
 * @module @qcut/agent-worker/main
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import type { AgentJob } from "@qcut/db";

import { claimOneJob } from "./claim.js";
import { runContainer } from "./run-container.js";
import { streamEvents } from "./stream-events.js";
import { uploadArtifacts } from "./upload-artifacts.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const IDLE_POLL_MS = Number(process.env.IDLE_POLL_MS ?? "5000");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
	console.error(
		"[agent-worker] missing env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are required",
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

async function executeJob(job: AgentJob): Promise<void> {
	try {
		const result = await runContainer(supabase, job);
		await streamEvents(supabase, job, result.stderr);
		await uploadArtifacts(supabase, job, result.outputDir);

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
		console.log(`[agent-worker] ${job.id} → ${status} (exit ${result.exitCode})`);
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
	}
}

const channel = supabase
	.channel("agent-jobs")
	.on(
		"postgres_changes",
		{ event: "INSERT", schema: "public", table: "agent_jobs" },
		() => {
			void tryDrain();
		},
	)
	.subscribe((status) => {
		if (status === "SUBSCRIBED") {
			console.log(`[agent-worker ${RUNNER_ID}] subscribed to agent_jobs INSERT`);
		}
	});

const idleTimer = setInterval(() => void tryDrain(), IDLE_POLL_MS);

async function shutdown(sig: string): Promise<void> {
	console.log(`[agent-worker ${RUNNER_ID}] ${sig}, draining…`);
	clearInterval(idleTimer);
	await channel.unsubscribe();
	process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

// Kick once on startup so a row queued before subscription gets picked up.
void tryDrain();
