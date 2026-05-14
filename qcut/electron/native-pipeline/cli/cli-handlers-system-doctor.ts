/**
 * `system doctor` — environment/container health probe.
 *
 * Reports bun + ffmpeg versions, `~/.qcut/.env` presence & mode (0600
 * expected), and how many keys are configured. Used by the Daytona /
 * E2B spawn probe to gate "container is healthy" before exposing a
 * shell to the caller. Provider HTTP pings are intentionally NOT made
 * here — `--skip-health` is the default-on contract.
 *
 * Exit-code contract: success=true → 0; success=false → non-zero
 * (`api_key_missing`-class issues are the most common cause).
 *
 * @module electron/native-pipeline/cli/cli-handlers-system-doctor
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

import type { CLIResult, CLIRunOptions } from "./cli-runner/types.js";
import { checkKeys } from "../infra/key-manager.js";

export type DoctorCheckStatus = "ok" | "warn" | "fail";

export interface DoctorCheck {
	name: string;
	status: DoctorCheckStatus;
	detail?: string;
}

export interface DoctorReport {
	status: "ok" | "fail";
	checks: DoctorCheck[];
	keys_configured: number;
	keys_total: number;
	cli_version: string;
	bun_version: string | null;
	ffmpeg_version: string | null;
	env_file: string;
}

function safeVersion(cmd: string, args: string[]): string | null {
	try {
		const result = spawnSync(cmd, args, { encoding: "utf8" });
		if (result.status !== 0) return null;
		return result.stdout.split("\n")[0]?.trim() ?? null;
	} catch {
		return null;
	}
}

function ok(name: string, detail?: string): DoctorCheck {
	return { name, status: "ok", detail };
}

function warn(name: string, detail: string): DoctorCheck {
	return { name, status: "warn", detail };
}

function fail(name: string, detail: string): DoctorCheck {
	return { name, status: "fail", detail };
}

/**
 * Run all probes. `skipHealth=true` means: do not make any outbound
 * provider calls. Only inspect the local container state.
 */
export function runDoctor(opts: { skipHealth: boolean }): DoctorReport {
	const checks: DoctorCheck[] = [];

	const bunVersion = safeVersion("bun", ["--version"]);
	checks.push(bunVersion ? ok("bun", bunVersion) : fail("bun", "not on PATH"));

	const ffmpegVersion = safeVersion("ffmpeg", ["-version"]);
	checks.push(
		ffmpegVersion ? ok("ffmpeg", ffmpegVersion) : fail("ffmpeg", "not on PATH")
	);

	const envPath = path.join(os.homedir(), ".qcut", ".env");
	let keysConfigured = 0;
	let keysTotal = 0;
	if (fs.existsSync(envPath)) {
		try {
			const mode = fs.statSync(envPath).mode & 0o777;
			if (mode !== 0o600) {
				checks.push(
					warn("env_file_mode", `expected 0600, got 0${mode.toString(8)}`)
				);
			} else {
				checks.push(ok("env_file_mode", "0600"));
			}
		} catch {
			checks.push(warn("env_file_mode", "could not stat"));
		}

		const statuses = checkKeys();
		keysTotal = statuses.length;
		keysConfigured = statuses.filter((s) => s.configured).length;
		checks.push(
			keysConfigured > 0
				? ok("env_file_keys", `${keysConfigured}/${keysTotal} configured`)
				: fail(
						"env_file_keys",
						`0/${keysTotal} configured (set with: qcut system set-key)`
					)
		);
	} else {
		checks.push(fail("env_file", `${envPath} not found`));
	}

	if (!opts.skipHealth) {
		// Provider HTTP pings deliberately out of scope for v0 — they're
		// external SLO dependencies, not a CLI smoke test. Surface as warn
		// so consumers know it wasn't run.
		checks.push(
			warn("provider_pings", "not implemented (use --skip-health to suppress)")
		);
	}

	const status: "ok" | "fail" = checks.some((c) => c.status === "fail")
		? "fail"
		: "ok";

	return {
		status,
		checks,
		keys_configured: keysConfigured,
		keys_total: keysTotal,
		cli_version: process.env.QCUT_VERSION ?? "dev",
		bun_version: bunVersion,
		ffmpeg_version: ffmpegVersion,
		env_file: envPath,
	};
}

/**
 * CLI handler. Returns `CLIResult.success = false` (non-zero exit) when
 * any check fails so the spawn probe in downstream PRs can gate on it.
 * The full report is always attached to `data` so the human-readable
 * fallback and the `--json` mode can both render it.
 */
export function handleSystemDoctor(options: CLIRunOptions): CLIResult {
	const report = runDoctor({ skipHealth: options.skipHealth ?? false });
	if (report.status === "ok") {
		return { success: true, data: report };
	}
	const failedNames = report.checks
		.filter((c) => c.status === "fail")
		.map((c) => c.name)
		.join(", ");
	return {
		success: false,
		error: `doctor failed: ${failedNames}`,
		data: report,
	};
}
