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
	data: unknown;
}

export interface JsonErrorEnvelope {
	status: "error";
	error: string;
	code: string;
	data?: Record<string, unknown>;
}

export interface JsonPendingEnvelope {
	status: "pending";
	jobId: string;
}

export type JsonEnvelope = JsonOkEnvelope | JsonErrorEnvelope | JsonPendingEnvelope;

/** Print a successful JSON result to stdout. */
export function jsonOk(data: unknown): void {
	const envelope: JsonOkEnvelope = { status: "ok", data };
	console.log(JSON.stringify(envelope, null, 2));
}

/** Print a JSON error to stdout with optional partial-result data. */
export function jsonError(msg: string, code: string, data?: Record<string, unknown>): void {
	const envelope: JsonErrorEnvelope = { status: "error", error: msg, code };
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

/** Shared helper to emit a CLIResult as a JSON envelope. */
export function emitJsonResult(command: string, result: CLIResult, extra?: Record<string, unknown>): void {
	if (result.success) {
		const { success: _, ...rest } = result;
		jsonOk({ schema_version: SCHEMA_VERSION, command, ...rest, ...extra });
	} else {
		const { success: _, error, ...rest } = result;
		jsonError(error || "Unknown error", `${command}:failed`, rest as Record<string, unknown>);
	}
}
