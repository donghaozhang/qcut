#!/usr/bin/env bun
/**
 * API Keys Precedence smoke — standalone CLI for QUR-29.
 *
 * Runs two blocks:
 *   1. Deterministic matrix: exercises the pure `computeKeyStatus` helper
 *      with the 5 presence cases from IMPLEMENTATION.md §ST-2 plus a
 *      snapshot of KEY_SOURCE_PRECEDENCE. Asserts expected
 *      {set, source, shadowedBy}. Exits non-zero on any mismatch.
 *   2. Live probe: scans process.env, ~/.config/video-ai-studio/credentials.env,
 *      ~/.qcut/.env, and the Electron userData api-keys.json blob for each of
 *      the 8 supported fields (FAL, Freesound, Gemini, OpenRouter, Anthropic,
 *      ElevenLabs, GMI, Runway) and prints the resolved status per field.
 *
 * Electron safeStorage decryption is not available outside Electron — the
 * probe reports "electron: set (encrypted)" when api-keys.json contains a
 * non-empty base64 blob for a field, which is equivalent for precedence
 * purposes since resolveStatus only checks presence.
 *
 * Usage:
 *   bun run scripts/api-keys-precedence-smoke.ts           # matrix + probe
 *   bun run scripts/api-keys-precedence-smoke.ts --matrix  # matrix only
 *   bun run scripts/api-keys-precedence-smoke.ts --probe   # probe only
 *   bun run scripts/api-keys-precedence-smoke.ts --json    # JSON output
 */

import fs from "node:fs";
import path from "node:path";
import {
	KEY_SOURCE_PRECEDENCE,
	computeKeyStatus,
	type KeyStatus,
	type KeySource,
} from "../electron/api-key-status";

type Presence = Parameters<typeof computeKeyStatus>[0];

type MatrixCase = {
	label: string;
	presence: Presence;
	expected: KeyStatus;
};

const MATRIX_CASES: MatrixCase[] = [
	{
		label: "env + electron",
		presence: { env: true, electron: true, aicpCli: false, qcutEnv: false },
		expected: { set: true, source: "environment", shadowedBy: ["electron"] },
	},
	{
		label: "electron + aicp-cli",
		presence: { env: false, electron: true, aicpCli: true, qcutEnv: false },
		expected: { set: true, source: "electron", shadowedBy: ["aicp-cli"] },
	},
	{
		label: "env + electron + aicp-cli + qcut-env",
		presence: { env: true, electron: true, aicpCli: true, qcutEnv: true },
		expected: {
			set: true,
			source: "environment",
			shadowedBy: ["electron", "aicp-cli", "qcut-env"],
		},
	},
	{
		label: "qcut-env only",
		presence: { env: false, electron: false, aicpCli: false, qcutEnv: true },
		expected: { set: true, source: "qcut-env", shadowedBy: [] },
	},
	{
		label: "none",
		presence: { env: false, electron: false, aicpCli: false, qcutEnv: false },
		expected: { set: false, source: "not-set", shadowedBy: [] },
	},
];

const EXPECTED_PRECEDENCE: readonly KeySource[] = [
	"environment",
	"electron",
	"aicp-cli",
	"qcut-env",
];

type FieldKey =
	| "falApiKey"
	| "freesoundApiKey"
	| "geminiApiKey"
	| "openRouterApiKey"
	| "anthropicApiKey"
	| "elevenLabsApiKey"
	| "gmiApiKey"
	| "runwayApiKey";

type FieldSpec = {
	field: FieldKey;
	label: string;
	envName: string;
	altEnvName?: string;
	aicpName?: string;
	qcutEnvName?: string;
};

const FIELDS: FieldSpec[] = [
	{
		field: "falApiKey",
		label: "FAL",
		envName: "FAL_KEY",
		altEnvName: "FAL_API_KEY",
		aicpName: "FAL_KEY",
		qcutEnvName: "FAL_KEY",
	},
	{
		field: "freesoundApiKey",
		label: "Freesound",
		envName: "FREESOUND_API_KEY",
		qcutEnvName: "FREESOUND_API_KEY",
	},
	{
		field: "geminiApiKey",
		label: "Gemini",
		envName: "GEMINI_API_KEY",
		aicpName: "GEMINI_API_KEY",
		qcutEnvName: "GEMINI_API_KEY",
	},
	{
		field: "openRouterApiKey",
		label: "OpenRouter",
		envName: "OPENROUTER_API_KEY",
		aicpName: "OPENROUTER_API_KEY",
		qcutEnvName: "OPENROUTER_API_KEY",
	},
	{
		field: "anthropicApiKey",
		label: "Anthropic",
		envName: "ANTHROPIC_API_KEY",
		qcutEnvName: "ANTHROPIC_API_KEY",
	},
	{
		field: "elevenLabsApiKey",
		label: "ElevenLabs",
		envName: "ELEVENLABS_API_KEY",
		qcutEnvName: "ELEVENLABS_API_KEY",
	},
	{
		field: "gmiApiKey",
		label: "GMI",
		envName: "GMI_API_KEY",
		qcutEnvName: "GMI_API_KEY",
	},
	{
		field: "runwayApiKey",
		label: "Runway",
		envName: "RUNWAY_API_KEY",
		qcutEnvName: "RUNWAY_API_KEY",
	},
];

function parseEnvFile(filePath: string): Record<string, string> {
	if (!fs.existsSync(filePath)) return {};
	const result: Record<string, string> = {};
	for (const line of fs.readFileSync(filePath, "utf-8").split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eqIdx = trimmed.indexOf("=");
		if (eqIdx <= 0) continue;
		result[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
	}
	return result;
}

function getHome(): string {
	return process.env.HOME || process.env.USERPROFILE || "";
}

function getAicpCredentialsPath(): string {
	const home = getHome();
	if (process.platform === "win32") {
		const appData =
			process.env.APPDATA || path.join(home, "AppData", "Roaming");
		return path.join(appData, "video-ai-studio", "credentials.env");
	}
	return path.join(home, ".config", "video-ai-studio", "credentials.env");
}

function getQcutEnvPath(): string {
	return path.join(getHome(), ".qcut", ".env");
}

function getElectronApiKeysPath(): string {
	const home = getHome();
	if (process.platform === "darwin") {
		return path.join(
			home,
			"Library",
			"Application Support",
			"qcut",
			"api-keys.json"
		);
	}
	if (process.platform === "win32") {
		const appData =
			process.env.APPDATA || path.join(home, "AppData", "Roaming");
		return path.join(appData, "qcut", "api-keys.json");
	}
	return path.join(home, ".config", "qcut", "api-keys.json");
}

function loadElectronBlob(): Record<string, string> {
	const filePath = getElectronApiKeysPath();
	if (!fs.existsSync(filePath)) return {};
	try {
		return JSON.parse(fs.readFileSync(filePath, "utf-8"));
	} catch {
		return {};
	}
}

function color(code: number, text: string): string {
	return process.stdout.isTTY ? `\x1b[${code}m${text}\x1b[0m` : text;
}
const green = (t: string) => color(32, t);
const red = (t: string) => color(31, t);
const yellow = (t: string) => color(33, t);
const dim = (t: string) => color(2, t);

function statusEq(a: KeyStatus, b: KeyStatus): boolean {
	if (a.set !== b.set) return false;
	if (a.source !== b.source) return false;
	if (a.shadowedBy.length !== b.shadowedBy.length) return false;
	for (let i = 0; i < a.shadowedBy.length; i += 1) {
		if (a.shadowedBy[i] !== b.shadowedBy[i]) return false;
	}
	return true;
}

type MatrixResult = {
	label: string;
	expected: KeyStatus;
	actual: KeyStatus;
	pass: boolean;
};

function runMatrix(): {
	results: MatrixResult[];
	precedenceOk: boolean;
	allPass: boolean;
} {
	const results: MatrixResult[] = MATRIX_CASES.map((c) => {
		const actual = computeKeyStatus(c.presence);
		return {
			label: c.label,
			expected: c.expected,
			actual,
			pass: statusEq(actual, c.expected),
		};
	});
	const precedenceOk =
		KEY_SOURCE_PRECEDENCE.length === EXPECTED_PRECEDENCE.length &&
		KEY_SOURCE_PRECEDENCE.every((v, i) => v === EXPECTED_PRECEDENCE[i]);
	const allPass = precedenceOk && results.every((r) => r.pass);
	return { results, precedenceOk, allPass };
}

type FieldProbe = {
	field: FieldKey;
	label: string;
	presence: Presence;
	status: KeyStatus;
};

function runProbe(): {
	probes: FieldProbe[];
	sources: {
		aicp: { path: string; present: boolean };
		qcutEnv: { path: string; present: boolean };
		electron: { path: string; present: boolean };
	};
} {
	const aicpPath = getAicpCredentialsPath();
	const qcutEnvPath = getQcutEnvPath();
	const electronPath = getElectronApiKeysPath();

	const aicpEnv = parseEnvFile(aicpPath);
	const qcutEnv = parseEnvFile(qcutEnvPath);
	const electronBlob = loadElectronBlob();

	const probes: FieldProbe[] = FIELDS.map((spec) => {
		const envPresent = Boolean(
			process.env[spec.envName] ||
				(spec.altEnvName && process.env[spec.altEnvName])
		);
		const aicpPresent = spec.aicpName ? Boolean(aicpEnv[spec.aicpName]) : false;
		const qcutEnvPresent = spec.qcutEnvName
			? Boolean(qcutEnv[spec.qcutEnvName])
			: false;
		const electronPresent = Boolean(electronBlob[spec.field]);

		const presence: Presence = {
			env: envPresent,
			electron: electronPresent,
			aicpCli: aicpPresent,
			qcutEnv: qcutEnvPresent,
		};
		return {
			field: spec.field,
			label: spec.label,
			presence,
			status: computeKeyStatus(presence),
		};
	});

	return {
		probes,
		sources: {
			aicp: { path: aicpPath, present: fs.existsSync(aicpPath) },
			qcutEnv: { path: qcutEnvPath, present: fs.existsSync(qcutEnvPath) },
			electron: { path: electronPath, present: fs.existsSync(electronPath) },
		},
	};
}

function formatStatus(s: KeyStatus): string {
	if (!s.set) return dim("not-set");
	const shadow =
		s.shadowedBy.length > 0 ? `  shadows: [${s.shadowedBy.join(", ")}]` : "";
	return `${green(s.source)}${shadow}`;
}

function formatPresence(p: Presence): string {
	const parts = [
		p.env ? "env" : "",
		p.electron ? "electron" : "",
		p.aicpCli ? "aicp-cli" : "",
		p.qcutEnv ? "qcut-env" : "",
	].filter(Boolean);
	return parts.length === 0 ? dim("none") : parts.join("+");
}

function printMatrix(r: ReturnType<typeof runMatrix>): void {
	console.log("\n=== Deterministic matrix (computeKeyStatus) ===\n");
	for (const row of r.results) {
		const badge = row.pass ? green("PASS") : red("FAIL");
		console.log(`  ${badge}  ${row.label}`);
		if (!row.pass) {
			console.log(
				`        expected: source=${row.expected.source} shadowedBy=[${row.expected.shadowedBy.join(
					","
				)}] set=${row.expected.set}`
			);
			console.log(
				`        actual:   source=${row.actual.source} shadowedBy=[${row.actual.shadowedBy.join(
					","
				)}] set=${row.actual.set}`
			);
		}
	}
	console.log(
		`\n  ${r.precedenceOk ? green("PASS") : red("FAIL")}  KEY_SOURCE_PRECEDENCE snapshot: [${KEY_SOURCE_PRECEDENCE.join(", ")}]`
	);
	const summary = r.allPass ? green("ALL PASS") : red("FAILED");
	console.log(`\n  Matrix: ${summary}\n`);
}

function printProbe(r: ReturnType<typeof runProbe>): void {
	console.log("=== Live tier probe ===\n");
	console.log(
		`  tier 1 (env vars):        scan of process.env for each field's env name`
	);
	console.log(
		`  tier 2 (electron):        ${r.sources.electron.present ? green("found") : dim("missing")}  ${r.sources.electron.path}`
	);
	console.log(
		`  tier 3 (aicp-cli):        ${r.sources.aicp.present ? green("found") : dim("missing")}  ${r.sources.aicp.path}`
	);
	console.log(
		`  tier 4 (qcut-env):        ${r.sources.qcutEnv.present ? green("found") : dim("missing")}  ${r.sources.qcutEnv.path}`
	);
	console.log();

	const labelW = Math.max(...r.probes.map((p) => p.label.length));
	for (const probe of r.probes) {
		const label = probe.label.padEnd(labelW, " ");
		const presence = formatPresence(probe.presence).padEnd(40, " ");
		console.log(
			`  ${label}  tiers=${presence}  status=${formatStatus(probe.status)}`
		);
	}
	console.log();
}

function main(): void {
	const args = process.argv.slice(2);
	const wantJson = args.includes("--json");
	const onlyMatrix = args.includes("--matrix") && !args.includes("--probe");
	const onlyProbe = args.includes("--probe") && !args.includes("--matrix");

	const matrix = onlyProbe ? null : runMatrix();
	const probe = onlyMatrix ? null : runProbe();

	if (wantJson) {
		const out: Record<string, unknown> = {};
		if (matrix) {
			out.matrix = {
				precedence: [...KEY_SOURCE_PRECEDENCE],
				precedenceOk: matrix.precedenceOk,
				allPass: matrix.allPass,
				results: matrix.results,
			};
		}
		if (probe) {
			out.probe = probe;
		}
		console.log(JSON.stringify(out, null, 2));
	} else {
		if (matrix) printMatrix(matrix);
		if (probe) printProbe(probe);
	}

	const failed = matrix && !matrix.allPass;
	process.exit(failed ? 1 : 0);
}

main();
