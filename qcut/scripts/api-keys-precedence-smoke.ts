#!/usr/bin/env bun
/**
 * API Keys Precedence smoke — standalone CLI for QUR-29.
 *
 * Modes:
 *   1. Deterministic matrix: exercises the pure `computeKeyStatus` helper
 *      with the 5 presence cases from IMPLEMENTATION.md §ST-2 plus a
 *      snapshot of KEY_SOURCE_PRECEDENCE. Asserts expected
 *      {set, source, shadowedBy}. Exits non-zero on any mismatch.
 *   2. Live probe: scans process.env, ~/.config/video-ai-studio/credentials.env,
 *      ~/.qcut/.env, and the Electron userData api-keys.json blob for each of
 *      the 8 supported fields (FAL, Freesound, Gemini, OpenRouter, Anthropic,
 *      ElevenLabs, GMI, Runway) and prints the resolved status per field.
 *   3. Save-and-verify: picks a field that is currently `not-set`, snapshots
 *      the aicp-cli + qcut-env tier files, writes a sentinel fake value to
 *      each in turn (simulating what the Save button syncs), re-probes the
 *      status after every write, asserts the expected {source, shadowedBy}
 *      transitions, and restores the tier files in a finally block so the
 *      host machine always ends in the pre-run state. Can also exercise the
 *      env-var tier by mutating process.env before the probe.
 *
 * Electron safeStorage decryption is not available outside Electron — the
 * probe treats a non-empty base64 entry in api-keys.json as `electron: true`,
 * which is equivalent for precedence purposes since resolveStatus only checks
 * presence. The save-and-verify mode therefore cannot simulate the tier-2
 * half of the Save button path; it covers tiers 1, 3, 4.
 *
 * Usage:
 *   bun run scripts/api-keys-precedence-smoke.ts                    # matrix + probe
 *   bun run scripts/api-keys-precedence-smoke.ts --matrix           # matrix only
 *   bun run scripts/api-keys-precedence-smoke.ts --probe            # probe only
 *   bun run scripts/api-keys-precedence-smoke.ts --json             # JSON output
 *   bun run scripts/api-keys-precedence-smoke.ts --save-and-verify  # write/verify/restore
 *   bun run scripts/api-keys-precedence-smoke.ts --save-and-verify --field=openRouterApiKey
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
		presence: { env: true, electron: true, file: false },
		expected: { set: true, source: "environment", shadowedBy: ["electron"] },
	},
	{
		label: "electron + file",
		presence: { env: false, electron: true, file: true },
		expected: { set: true, source: "electron", shadowedBy: ["file"] },
	},
	{
		label: "env + electron + file",
		presence: { env: true, electron: true, file: true },
		expected: {
			set: true,
			source: "environment",
			shadowedBy: ["electron", "file"],
		},
	},
	{
		label: "file only",
		presence: { env: false, electron: false, file: true },
		expected: { set: true, source: "file", shadowedBy: [] },
	},
	{
		label: "none",
		presence: { env: false, electron: false, file: false },
		expected: { set: false, source: "not-set", shadowedBy: [] },
	},
];

const EXPECTED_PRECEDENCE: readonly KeySource[] = [
	"environment",
	"electron",
	"file",
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
			file: aicpPresent || qcutEnvPresent,
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
		p.file ? "file" : "",
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
		`  tier 3 (file - qcut):     ${r.sources.qcutEnv.present ? green("found") : dim("missing")}  ${r.sources.qcutEnv.path}`
	);
	console.log(
		`  tier 3 (file - aicp):     ${r.sources.aicp.present ? green("found") : dim("missing")}  ${r.sources.aicp.path}  (legacy; merged into file tier)`
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

// -----------------------------------------------------------------------------
// Save-and-verify mode
// -----------------------------------------------------------------------------

type SaveStep = {
	label: string;
	expected: KeyStatus;
	actual?: KeyStatus;
	pass?: boolean;
};

function probeField(spec: FieldSpec): KeyStatus {
	const aicpEnv = parseEnvFile(getAicpCredentialsPath());
	const qcutEnv = parseEnvFile(getQcutEnvPath());
	const electronBlob = loadElectronBlob();
	const aicpPresent = spec.aicpName ? Boolean(aicpEnv[spec.aicpName]) : false;
	const qcutEnvPresent = spec.qcutEnvName
		? Boolean(qcutEnv[spec.qcutEnvName])
		: false;
	return computeKeyStatus({
		env: Boolean(
			process.env[spec.envName] ||
				(spec.altEnvName && process.env[spec.altEnvName])
		),
		electron: Boolean(electronBlob[spec.field]),
		file: aicpPresent || qcutEnvPresent,
	});
}

type FileSnapshot = {
	filePath: string;
	existed: boolean;
	content: Buffer | null;
};

function snapshotFile(filePath: string): FileSnapshot {
	const existed = fs.existsSync(filePath);
	return {
		filePath,
		existed,
		content: existed ? fs.readFileSync(filePath) : null,
	};
}

function restoreFile(snap: FileSnapshot): void {
	if (snap.existed && snap.content) {
		fs.writeFileSync(snap.filePath, snap.content, { mode: 0o600 });
	} else if (fs.existsSync(snap.filePath)) {
		fs.unlinkSync(snap.filePath);
	}
}

function upsertEnvLine(filePath: string, key: string, value: string): void {
	const dir = path.dirname(filePath);
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
	const prev = fs.existsSync(filePath)
		? fs.readFileSync(filePath, "utf-8").split("\n")
		: [];
	const kept: string[] = [];
	for (const line of prev) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) {
			kept.push(line);
			continue;
		}
		const eqIdx = trimmed.indexOf("=");
		if (eqIdx <= 0) {
			kept.push(line);
			continue;
		}
		if (trimmed.slice(0, eqIdx) === key) continue;
		kept.push(line);
	}
	kept.push(`${key}=${value}`);
	fs.writeFileSync(filePath, kept.join("\n") + "\n", { mode: 0o600 });
}

function assertStatus(
	actual: KeyStatus,
	expected: KeyStatus
): { pass: boolean; detail: string } {
	const pass = statusEq(actual, expected);
	const detail = pass
		? ""
		: `expected source=${expected.source} shadowedBy=[${expected.shadowedBy.join(",")}] set=${expected.set}; actual source=${actual.source} shadowedBy=[${actual.shadowedBy.join(",")}] set=${actual.set}`;
	return { pass, detail };
}

function runSaveAndVerify(fieldName: FieldKey): {
	field: FieldKey;
	allPass: boolean;
	steps: SaveStep[];
	notes: string[];
} {
	const spec = FIELDS.find((f) => f.field === fieldName);
	if (!spec) {
		throw new Error(
			`unknown field "${fieldName}" — valid: ${FIELDS.map((f) => f.field).join(", ")}`
		);
	}

	const notes: string[] = [];
	const steps: SaveStep[] = [];

	// Precondition: pick a field that is currently not-set, otherwise we risk
	// overwriting a real user key. Fail loudly.
	const initial = probeField(spec);
	if (initial.set) {
		throw new Error(
			`field "${fieldName}" is already set (source=${initial.source}). Pick a different --field to avoid clobbering real credentials.`
		);
	}

	const aicpPath = getAicpCredentialsPath();
	const qcutEnvPath = getQcutEnvPath();
	const aicpSnap = snapshotFile(aicpPath);
	const qcutEnvSnap = snapshotFile(qcutEnvPath);
	const sentinel = `qcut-smoke-DELETE-ME-${Date.now()}`;

	const savedEnvVar = process.env[spec.envName];
	const savedAltEnvVar = spec.altEnvName
		? process.env[spec.altEnvName]
		: undefined;

	try {
		// Step 1 — nothing set: source=not-set
		steps.push({
			label: "pre-flight — field is not-set",
			expected: { set: false, source: "not-set", shadowedBy: [] },
			actual: initial,
			pass: statusEq(initial, {
				set: false,
				source: "not-set",
				shadowedBy: [],
			}),
		});

		// Step 2 — write to canonical ~/.qcut/.env. Source should resolve
		// to `file` immediately; no shadow because the legacy AICP file is
		// still empty.
		if (spec.qcutEnvName) {
			upsertEnvLine(qcutEnvPath, spec.qcutEnvName, sentinel);
			const actual = probeField(spec);
			steps.push({
				label: "after write to ~/.qcut/.env — source=file",
				expected: { set: true, source: "file", shadowedBy: [] },
				actual,
				pass: statusEq(actual, {
					set: true,
					source: "file",
					shadowedBy: [],
				}),
			});
		} else {
			notes.push(
				`field ${fieldName} has no qcut-env mapping — skipped file-tier write step`
			);
		}

		// Step 3 — also populate legacy AICP credentials.env. Under the
		// unified `file` tier, this is still source=file (no extra shadow),
		// proving the two physical locations merge into one logical tier.
		if (spec.aicpName) {
			upsertEnvLine(aicpPath, spec.aicpName, sentinel);
			const actual = probeField(spec);
			steps.push({
				label:
					"after also writing to legacy credentials.env — still source=file (merged tier)",
				expected: { set: true, source: "file", shadowedBy: [] },
				actual,
				pass: statusEq(actual, {
					set: true,
					source: "file",
					shadowedBy: [],
				}),
			});
		} else {
			notes.push(
				`field ${fieldName} has no aicp-cli mapping — skipped legacy-file write step`
			);
		}

		// Step 4 — inject env var: tier 1 should outrank the file tier.
		process.env[spec.envName] = sentinel;
		{
			const actual = probeField(spec);
			const fileTierPopulated = Boolean(spec.aicpName || spec.qcutEnvName);
			const shadow: KeySource[] = fileTierPopulated ? ["file"] : [];
			steps.push({
				label: `env var ${spec.envName} injected — source=environment shadows=[${shadow.join(",")}]`,
				expected: {
					set: true,
					source: "environment",
					shadowedBy: shadow,
				},
				actual,
				pass: statusEq(actual, {
					set: true,
					source: "environment",
					shadowedBy: shadow,
				}),
			});
		}

		// Step 5 — remove env var: should drop back to the file tier.
		delete process.env[spec.envName];
		if (spec.altEnvName) delete process.env[spec.altEnvName];
		{
			const actual = probeField(spec);
			const fileTierPopulated = Boolean(spec.aicpName || spec.qcutEnvName);
			const expected: KeyStatus = fileTierPopulated
				? { set: true, source: "file", shadowedBy: [] }
				: { set: false, source: "not-set", shadowedBy: [] };
			steps.push({
				label: "env var unset — rolls back to file tier",
				expected,
				actual,
				pass: statusEq(actual, expected),
			});
		}
	} finally {
		// ALWAYS restore — even if an assertion threw. Leaves the host machine
		// in the pre-run state.
		restoreFile(aicpSnap);
		restoreFile(qcutEnvSnap);
		if (savedEnvVar === undefined) delete process.env[spec.envName];
		else process.env[spec.envName] = savedEnvVar;
		if (spec.altEnvName) {
			if (savedAltEnvVar === undefined) delete process.env[spec.altEnvName];
			else process.env[spec.altEnvName] = savedAltEnvVar;
		}
	}

	// Step 6 — post-cleanup sanity: back to not-set
	const finalStatus = probeField(spec);
	steps.push({
		label: "post-cleanup — field is back to not-set",
		expected: { set: false, source: "not-set", shadowedBy: [] },
		actual: finalStatus,
		pass: statusEq(finalStatus, {
			set: false,
			source: "not-set",
			shadowedBy: [],
		}),
	});

	const allPass = steps.every((s) => s.pass);
	return { field: fieldName, allPass, steps, notes };
}

function printSaveAndVerify(r: ReturnType<typeof runSaveAndVerify>): void {
	console.log(`\n=== Save-and-verify (${r.field}) ===\n`);
	for (const note of r.notes) {
		console.log(`  ${yellow("note")}  ${note}`);
	}
	for (const step of r.steps) {
		const badge = step.pass ? green("PASS") : red("FAIL");
		console.log(`  ${badge}  ${step.label}`);
		if (!step.pass) {
			const a = step.actual;
			const e = step.expected;
			console.log(
				`        expected: source=${e.source} shadowedBy=[${e.shadowedBy.join(",")}] set=${e.set}`
			);
			if (a) {
				console.log(
					`        actual:   source=${a.source} shadowedBy=[${a.shadowedBy.join(",")}] set=${a.set}`
				);
			}
		}
	}
	const summary = r.allPass ? green("ALL PASS") : red("FAILED");
	console.log(`\n  Save-and-verify: ${summary}\n`);
}

function parseFieldArg(args: string[]): FieldKey {
	const flag = args.find((a) => a.startsWith("--field="));
	const name = flag ? flag.slice("--field=".length) : "geminiApiKey";
	if (!FIELDS.some((f) => f.field === name)) {
		throw new Error(
			`--field must be one of: ${FIELDS.map((f) => f.field).join(", ")}`
		);
	}
	return name as FieldKey;
}

// -----------------------------------------------------------------------------

function main(): void {
	const args = process.argv.slice(2);
	const wantJson = args.includes("--json");
	const wantSaveVerify = args.includes("--save-and-verify");
	const onlyMatrix = args.includes("--matrix") && !args.includes("--probe");
	const onlyProbe = args.includes("--probe") && !args.includes("--matrix");

	if (wantSaveVerify) {
		const field = parseFieldArg(args);
		let result: ReturnType<typeof runSaveAndVerify>;
		try {
			result = runSaveAndVerify(field);
		} catch (err) {
			console.error(
				red(`save-and-verify failed to start: ${(err as Error).message}`)
			);
			process.exit(2);
		}
		if (wantJson) {
			console.log(JSON.stringify(result, null, 2));
		} else {
			printSaveAndVerify(result);
		}
		process.exit(result.allPass ? 0 : 1);
	}

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
