import { ipcMain } from "electron";
import type { BrowserWindow } from "electron";
import { assertIpcMainReady, assertRendererWindowReady } from "../utils/renderer-ipc-guard.js";
import { probeBatchCutExecutionReadiness } from "./claude-cuts-handler.js";

export const DEEP_HEALTH_CHECK_STATUSES = {
	OK: "ok",
	FAIL: "fail",
	SKIP: "skip",
} as const;

export type DeepHealthCheckStatus =
	(typeof DEEP_HEALTH_CHECK_STATUSES)[keyof typeof DEEP_HEALTH_CHECK_STATUSES];

export interface DeepHealthCheckResult {
	status: DeepHealthCheckStatus;
	message: string;
	durationMs: number;
}

export interface DeepHealthChecks {
	ipcMainReady: DeepHealthCheckResult;
	utilityMainBridge: DeepHealthCheckResult;
	rendererResponders: DeepHealthCheckResult;
	autoEditApplyCutsProbe: DeepHealthCheckResult;
}

export interface DeepHealthSummary {
	ok: number;
	failed: number;
	skipped: number;
}

export interface DeepHealthReport {
	checks: DeepHealthChecks;
	summary: DeepHealthSummary;
	generatedAt: number;
}

export interface MainProcessDeepHealthInput {
	getWindow: () => BrowserWindow;
	requestTimeline: ({ win }: { win: BrowserWindow }) => Promise<unknown>;
	utilityMainBridge?: DeepHealthCheckResult;
}

function buildStatusSummary({
	checks,
}: {
	checks: DeepHealthChecks;
}): DeepHealthSummary {
	try {
		const values = Object.values(checks);
		let ok = 0;
		let failed = 0;
		let skipped = 0;

		for (const value of values) {
			if (value.status === DEEP_HEALTH_CHECK_STATUSES.OK) {
				ok += 1;
				continue;
			}
			if (value.status === DEEP_HEALTH_CHECK_STATUSES.FAIL) {
				failed += 1;
				continue;
			}
			skipped += 1;
		}

		return { ok, failed, skipped };
	} catch {
		return { ok: 0, failed: 1, skipped: 0 };
	}
}

export function buildDeepHealthReport({
	checks,
}: {
	checks: DeepHealthChecks;
}): DeepHealthReport {
	try {
		return {
			checks,
			summary: buildStatusSummary({ checks }),
			generatedAt: Date.now(),
		};
	} catch {
		return {
			checks,
			summary: { ok: 0, failed: 1, skipped: 0 },
			generatedAt: Date.now(),
		};
	}
}

function buildSkippedCheck({
	message,
}: {
	message: string;
}): DeepHealthCheckResult {
	try {
		return {
			status: DEEP_HEALTH_CHECK_STATUSES.SKIP,
			message,
			durationMs: 0,
		};
	} catch {
		return {
			status: DEEP_HEALTH_CHECK_STATUSES.SKIP,
			message: "Skipped",
			durationMs: 0,
		};
	}
}

async function runDeepHealthCheck({
	run,
	successMessage,
	failureMessage,
}: {
	run: () => Promise<void>;
	successMessage: string;
	failureMessage: string;
}): Promise<DeepHealthCheckResult> {
	const startedAt = Date.now();
	try {
		await run();
		return {
			status: DEEP_HEALTH_CHECK_STATUSES.OK,
			message: successMessage,
			durationMs: Date.now() - startedAt,
		};
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return {
			status: DEEP_HEALTH_CHECK_STATUSES.FAIL,
			message: `${failureMessage}: ${detail}`,
			durationMs: Date.now() - startedAt,
		};
	}
}

function ensureTimelineShape({
	timeline,
}: {
	timeline: unknown;
}): void {
	try {
		if (typeof timeline !== "object" || timeline === null) {
			throw new Error("Timeline payload missing");
		}
		const record = timeline as { tracks?: unknown };
		if (!Array.isArray(record.tracks)) {
			throw new Error("Timeline tracks missing");
		}
	} catch (error) {
		if (error instanceof Error) {
			throw error;
		}
		throw new Error("Invalid timeline payload");
	}
}

export async function runMainProcessDeepHealthChecks({
	getWindow,
	requestTimeline,
	utilityMainBridge,
}: MainProcessDeepHealthInput): Promise<DeepHealthReport> {
	const ipcMainReady = await runDeepHealthCheck({
		run: async () => {
			assertIpcMainReady({
				ipcMainInstance: ipcMain,
				action: "deep health ipc-main probe",
				requiresOnce: false,
			});
		},
		successMessage: "ipcMain bridge methods are available.",
		failureMessage: "ipcMain readiness check failed",
	});

	const rendererResponders = await runDeepHealthCheck({
		run: async () => {
			const win = getWindow();
			assertRendererWindowReady({
				win,
				action: "deep health renderer responder probe",
			});
			const timeline = await requestTimeline({ win });
			ensureTimelineShape({ timeline });
		},
		successMessage: "Renderer timeline responder returned valid payload.",
		failureMessage: "Renderer responder probe failed",
	});

	const autoEditApplyCutsProbe = await runDeepHealthCheck({
		run: async () => {
			const win = getWindow();
			await probeBatchCutExecutionReadiness({ win });
		},
		successMessage: "Auto-edit apply-cuts readiness probe passed.",
		failureMessage: "Auto-edit apply-cuts readiness probe failed",
	});

	const utilityBridgeCheck =
		utilityMainBridge ??
		buildSkippedCheck({
			message: "Not running through utility-process bridge.",
		});

	return buildDeepHealthReport({
		checks: {
			ipcMainReady,
			utilityMainBridge: utilityBridgeCheck,
			rendererResponders,
			autoEditApplyCutsProbe,
		},
	});
}

export function buildUtilityMainBridgeCheck({
	message,
	failed,
	durationMs,
}: {
	message: string;
	failed: boolean;
	durationMs: number;
}): DeepHealthCheckResult {
	try {
		return {
			status: failed
				? DEEP_HEALTH_CHECK_STATUSES.FAIL
				: DEEP_HEALTH_CHECK_STATUSES.OK,
			message,
			durationMs,
		};
	} catch {
		return {
			status: DEEP_HEALTH_CHECK_STATUSES.FAIL,
			message: "Utility-main bridge check failed",
			durationMs,
		};
	}
}
