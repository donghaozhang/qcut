/**
 * Unified JSON output helpers for the QCut CLI.
 *
 * All CLI commands should use these helpers when --json is passed
 * to ensure a consistent envelope shape across every command.
 *
 * @module electron/native-pipeline/cli/json-output
 */

import type { CLIResult } from "./cli-runner/types.js";

export const SCHEMA_VERSION = "1";

export interface JsonOkEnvelope {
	status: "ok";
	command_id?: string;
	duration_ms?: number;
	data: unknown;
}

export interface JsonErrorEnvelope {
	status: "error";
	command_id?: string;
	duration_ms?: number;
	error: string;
	code: string;
	data?: Record<string, unknown>;
}

export interface JsonPendingEnvelope {
	status: "pending";
	jobId: string;
}

export type JsonEnvelope =
	| JsonOkEnvelope
	| JsonErrorEnvelope
	| JsonPendingEnvelope;

/** Print a successful JSON result to stdout. */
export function jsonOk(
	data: unknown,
	commandId?: string,
	durationMs?: number
): void {
	const envelope: JsonOkEnvelope = { status: "ok", data };
	if (commandId) envelope.command_id = commandId;
	if (durationMs !== undefined) envelope.duration_ms = durationMs;
	console.log(JSON.stringify(envelope, null, 2));
}

/** Print a JSON error to stdout with optional partial-result data. */
export function jsonError(
	msg: string,
	code: string,
	data?: Record<string, unknown>,
	commandId?: string,
	durationMs?: number
): void {
	const envelope: JsonErrorEnvelope = { status: "error", error: msg, code };
	if (commandId) envelope.command_id = commandId;
	if (durationMs !== undefined) envelope.duration_ms = durationMs;
	if (data && Object.keys(data).length > 0) {
		envelope.data = data;
	}
	console.log(JSON.stringify(envelope, null, 2));
}

/** Print a pending/async job JSON result to stdout. */
export function jsonPending(jobId: string): void {
	const envelope: JsonPendingEnvelope = { status: "pending", jobId };
	console.log(JSON.stringify(envelope, null, 2));
}

/** Options for enriching JSON output with correlation and timing metadata. */
export interface JsonResultMeta {
	command_id?: string;
	duration_ms?: number;
	[key: string]: unknown;
}

/** Shared helper to emit a CLIResult as a JSON envelope. */
export function emitJsonResult(
	command: string,
	result: CLIResult,
	extra?: JsonResultMeta
): void {
	if (result.success) {
		const { success: _, ...rest } = result;
		jsonOk(
			{ schema_version: SCHEMA_VERSION, command, ...rest, ...extra },
			extra?.command_id,
			extra?.duration_ms
		);
	} else {
		const { success: _, error, ...rest } = result;
		jsonError(
			error || "Unknown error",
			`${command}:failed`,
			rest as Record<string, unknown>,
			extra?.command_id,
			extra?.duration_ms
		);
	}
}
