/**
 * Unified JSON output helpers for the QCut CLI.
 *
 * All CLI commands should use these helpers when --json is passed
 * to ensure a consistent envelope shape across every command.
 *
 * @module electron/native-pipeline/cli/json-output
 */

export interface JsonOkEnvelope {
	status: "ok";
	data: unknown;
}

export interface JsonErrorEnvelope {
	status: "error";
	error: string;
	code: string;
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

/** Print a JSON error to stdout. */
export function jsonError(msg: string, code: string): void {
	const envelope: JsonErrorEnvelope = { status: "error", error: msg, code };
	console.log(JSON.stringify(envelope, null, 2));
}

/** Print a pending/async job JSON result to stdout. */
export function jsonPending(jobId: string): void {
	const envelope: JsonPendingEnvelope = { status: "pending", jobId };
	console.log(JSON.stringify(envelope, null, 2));
}
