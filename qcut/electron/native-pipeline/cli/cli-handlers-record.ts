/**
 * CLI Record Handler — one-shot `qcut record` command.
 *
 * Spawns a headless QCut recorder process, triggers a recording via HTTP,
 * waits for the requested duration (or an external abort), then stops the
 * recording and tears down the child process. Works whether QCut is open
 * or not — the launcher always spawns its own ephemeral instance.
 *
 * Phase 1 of the dual-mode CLI recording plan
 * ([docs/task/recordly/22-cli-standalone-phase1-record-command.md]).
 *
 * @module electron/native-pipeline/cli/cli-handlers-record
 */

import { setTimeout as delay } from "node:timers/promises";
import type { ChildProcess } from "node:child_process";
import type {
	CLIRunOptions,
	CLIResult,
	ProgressFn,
} from "./cli-runner/types.js";
import {
	launchHeadlessRecorder,
	type LaunchOptions,
} from "./headless-launcher.js";

/**
 * Minimal HTTP response shape returned by the utility HTTP server for the
 * screen-recording endpoints. We type only the fields we use.
 */
interface StartResponse {
	sessionId?: string;
	filePath?: string;
	sourceId?: string;
	sourceName?: string;
	mimeType?: string | null;
}

interface StopResponse {
	success?: boolean;
	filePath?: string | null;
	bytesWritten?: number;
	durationMs?: number;
	discarded?: boolean;
}

export interface HandleRecordDeps {
	/**
	 * Override the HTTP layer for tests. Defaults to `globalThis.fetch`.
	 * Signature matches the global fetch so injection is painless.
	 */
	fetchImpl?: typeof fetch;
	/** Override the spawn layer for tests. Passed through to the launcher. */
	launchImpl?: (opts: LaunchOptions) => Promise<{
		child: ChildProcess;
		port: number;
	}>;
}

/** Request helper that wraps fetch with JSON body + error mapping. */
async function postJson<T>(
	fetchImpl: typeof fetch,
	url: string,
	body: Record<string, unknown>,
	signal?: AbortSignal
): Promise<T> {
	const res = await fetchImpl(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
		signal,
	});
	const text = await res.text();
	let parsed: unknown;
	try {
		parsed = text ? JSON.parse(text) : {};
	} catch {
		throw new Error(`Invalid JSON from ${url}: ${text.slice(0, 200)}`);
	}
	if (!res.ok) {
		const errMessage =
			(parsed as { error?: string })?.error ?? `HTTP ${res.status}`;
		throw new Error(`POST ${url} failed: ${errMessage}`);
	}
	// Endpoints return either the raw result or an envelope `{ success, data }`.
	const envelope = parsed as {
		success?: boolean;
		data?: T;
		error?: string;
	};
	if (envelope && typeof envelope === "object" && "data" in envelope) {
		if (envelope.success === false) {
			throw new Error(envelope.error ?? `${url} returned success=false`);
		}
		return envelope.data as T;
	}
	return parsed as T;
}

/**
 * Resolve `--record-duration` (seconds, preferred) or fall back to the
 * legacy `--duration "Ns"` string syntax used elsewhere in the CLI.
 */
function resolveRecordDurationSeconds(
	options: CLIRunOptions
): number | undefined {
	if (typeof options.recordDuration === "number" && options.recordDuration > 0) {
		return options.recordDuration;
	}
	if (options.duration) {
		const match = String(options.duration).match(/^(\d+(?:\.\d+)?)\s*s?$/);
		if (match) {
			const seconds = Number.parseFloat(match[1]);
			if (Number.isFinite(seconds) && seconds > 0) return seconds;
		}
	}
	return undefined;
}

/**
 * One-shot record command: launch headless → start → wait → stop → exit.
 */
export async function handleRecord(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	signal: AbortSignal,
	deps: HandleRecordDeps = {}
): Promise<CLIResult> {
	const startTime = Date.now();
	const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
	const launchImpl = deps.launchImpl ?? launchHeadlessRecorder;

	const durationSeconds = resolveRecordDurationSeconds(options);

	onProgress({
		stage: "launching",
		percent: 0,
		message: "Launching headless recorder...",
	});

	let launched: { child: ChildProcess; port: number };
	try {
		launched = await launchImpl({
			timeoutMs: 15_000,
			onOutput: (line) => {
				onProgress({ stage: "launching", percent: 0, message: line });
			},
		});
	} catch (err) {
		return {
			success: false,
			error: `Failed to launch headless recorder: ${
				err instanceof Error ? err.message : String(err)
			}`,
			duration: (Date.now() - startTime) / 1000,
		};
	}

	const { child, port } = launched;
	const base = `http://127.0.0.1:${port}`;
	let finalOutputPath: string | undefined;
	let result: CLIResult;

	try {
		onProgress({
			stage: "recording",
			percent: 0,
			message: "Starting recording...",
		});

		const startBody: Record<string, unknown> = {};
		const sourceId = options.sourceId ?? options.source;
		if (sourceId) startBody.sourceId = sourceId;
		if (options.output) {
			// Path.basename to avoid handing arbitrary paths to the renderer —
			// the renderer owns the output-directory policy.
			startBody.fileName = options.output.split(/[\\/]/).pop();
		}

		const startRes = await postJson<StartResponse>(
			fetchImpl,
			`${base}/api/claude/screen-recording/start`,
			startBody,
			signal
		);

		onProgress({
			stage: "recording",
			percent: 10,
			message: durationSeconds
				? `Recording for ${durationSeconds}s...`
				: "Recording until stopped (Ctrl-C)...",
		});

		if (durationSeconds) {
			await delay(durationSeconds * 1000, undefined, { signal });
		} else {
			// Wait indefinitely for the caller to abort the signal.
			await new Promise<void>((resolve, reject) => {
				if (signal.aborted) {
					resolve();
					return;
				}
				signal.addEventListener(
					"abort",
					() => {
						resolve();
					},
					{ once: true }
				);
				child.once("exit", () => {
					reject(new Error("Headless recorder exited before stop signal"));
				});
			});
		}

		onProgress({
			stage: "stopping",
			percent: 90,
			message: "Stopping recording...",
		});

		const stopRes = await postJson<StopResponse>(
			fetchImpl,
			`${base}/api/claude/screen-recording/stop`,
			{ discard: false },
			// Don't abort the stop request even if the parent signal tripped —
			// we still need the file to flush.
			undefined
		);

		finalOutputPath = stopRes.filePath ?? undefined;

		onProgress({
			stage: "complete",
			percent: 100,
			message: "Recording complete",
		});

		result = {
			success: Boolean(stopRes.success ?? true),
			outputPath: finalOutputPath,
			duration: (Date.now() - startTime) / 1000,
			data: {
				sessionId: startRes.sessionId,
				sourceId: startRes.sourceId,
				sourceName: startRes.sourceName,
				mimeType: startRes.mimeType ?? null,
				bytesWritten: stopRes.bytesWritten ?? 0,
				discarded: stopRes.discarded ?? false,
			},
		};
	} catch (err) {
		// Best-effort stop on error so we don't leak a running MediaRecorder.
		try {
			await postJson<StopResponse>(
				fetchImpl,
				`${base}/api/claude/screen-recording/force-stop`,
				{},
				undefined
			);
		} catch {
			/* swallow — child teardown below will kill the process */
		}
		result = {
			success: false,
			error: err instanceof Error ? err.message : String(err),
			duration: (Date.now() - startTime) / 1000,
		};
	} finally {
		try {
			if (!child.killed) child.kill("SIGTERM");
		} catch {
			/* ignore */
		}
	}

	return result;
}
