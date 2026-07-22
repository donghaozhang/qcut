#!/usr/bin/env node

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, extname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { getInstalledQCutCliCandidates } from "./qcut-app.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);

function pathCandidate({ filePath, source }) {
	const extension = extname(filePath).toLowerCase();
	if ([".js", ".cjs", ".mjs"].includes(extension)) {
		return {
			command: process.execPath,
			prefixArgs: [filePath],
			source,
		};
	}
	if (extension === ".ts") {
		return { command: "bun", prefixArgs: ["run", filePath], source };
	}
	return { command: filePath, prefixArgs: [], source };
}

function overrideCandidate({ value, cwd }) {
	const isPath =
		isAbsolute(value) ||
		value.includes(sep) ||
		value.includes("/") ||
		existsSync(resolve(cwd, value));
	if (!isPath) return { command: value, prefixArgs: [], source: "environment" };
	return pathCandidate({
		filePath: resolve(cwd, value),
		source: "environment",
	});
}

function findQCutRepository({ start }) {
	let current = resolve(start);
	while (true) {
		const packagePath = join(current, "package.json");
		const cliSource = join(current, "electron/native-pipeline/cli/cli.ts");
		if (existsSync(packagePath) && existsSync(cliSource)) {
			try {
				const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
				if (packageJson.name === "qcut") return current;
			} catch {
				return null;
			}
		}
		const parent = dirname(current);
		if (parent === current) return null;
		current = parent;
	}
}

function repositoryCandidates({ cwd, scriptPath }) {
	const roots = new Set();
	for (const start of [cwd, dirname(scriptPath)]) {
		const root = findQCutRepository({ start });
		if (root) roots.add(root);
	}

	const candidates = [];
	for (const root of roots) {
		const builtCli = join(root, "dist/electron/native-pipeline/cli/cli.js");
		if (existsSync(builtCli)) {
			candidates.push(
				pathCandidate({ filePath: builtCli, source: "repository-build" })
			);
		}
		candidates.push({
			command: "bun",
			prefixArgs: ["run", "qcut"],
			source: "repository-source",
			cwd: root,
		});
	}
	return candidates;
}

function probeCandidate({ candidate, env, spawn }) {
	const result = spawn(
		candidate.command,
		[...candidate.prefixArgs, "--version"],
		{
			cwd: candidate.cwd,
			env: { ...env, ...candidate.env },
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
			// A hung candidate must not block CLI resolution forever.
			timeout: 5000,
		}
	);
	if (result.status !== 0) return null;
	const version = String(result.stdout ?? "")
		.trim()
		.split(/\r?\n/)
		.at(-1);
	return { ...candidate, version: version || "unknown" };
}

export function resolveQCutCli({
	env = process.env,
	cwd = process.cwd(),
	scriptPath = SCRIPT_PATH,
	spawn = spawnSync,
	installedCandidates,
} = {}) {
	const candidates = [];
	const override = env.QCUT_CLI_PATH?.trim();
	if (override) candidates.push(overrideCandidate({ value: override, cwd }));
	candidates.push(
		{ command: "qcut", prefixArgs: [], source: "path" },
		{ command: "qcut-pipeline", prefixArgs: [], source: "path" },
		...repositoryCandidates({ cwd, scriptPath }),
		...(installedCandidates ?? getInstalledQCutCliCandidates({ env }))
	);

	for (const candidate of candidates) {
		const resolved = probeCandidate({ candidate, env, spawn });
		if (resolved) return resolved;
	}
	return null;
}

export function runQCutCommand({
	resolved,
	args,
	env = process.env,
	spawn = spawnSync,
	stdio = "inherit",
}) {
	return spawn(resolved.command, [...resolved.prefixArgs, ...args], {
		cwd: resolved.cwd,
		env: { ...env, ...resolved.env },
		stdio,
		encoding: stdio === "pipe" ? "utf8" : undefined,
	});
}

function parseJsonOutput({ output }) {
	try {
		return JSON.parse(String(output).trim());
	} catch {
		return null;
	}
}

export function inspectQCut({
	resolved,
	requireEditor = false,
	env = process.env,
	spawn = spawnSync,
}) {
	const health = runQCutCommand({
		resolved,
		args: ["editor:health", "--status-only", "--json"],
		env,
		spawn,
		stdio: "pipe",
	});
	const healthPayload = parseJsonOutput({ output: health.stdout });
	const editorRunning = health.status === 0 && healthPayload?.status === "ok";
	const status = requireEditor && !editorRunning ? "error" : "ok";
	return {
		status,
		...(status === "error"
			? {
					code: "qcut:editor_unavailable",
					error: "QCut CLI was found, but the desktop editor is not reachable.",
				}
			: {}),
		data: {
			cli: {
				found: true,
				source: resolved.source,
				version: resolved.version,
			},
			editor: {
				running: editorRunning,
				response: healthPayload,
			},
		},
	};
}

function printJson({ payload, stream = process.stdout }) {
	stream.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function printMissingCli() {
	printJson({
		stream: process.stderr,
		payload: {
			status: "error",
			code: "qcut:cli_not_found",
			error:
				"QCut CLI was not found. Install QCut's CLI on PATH or set QCUT_CLI_PATH.",
		},
	});
}

export function isEntryPoint({
	argvPath = process.argv[1],
	moduleUrl = import.meta.url,
} = {}) {
	if (!argvPath) return false;
	return realpathSync(argvPath) === realpathSync(fileURLToPath(moduleUrl));
}

function main() {
	const args = process.argv.slice(2);
	const resolved = resolveQCutCli();
	if (!resolved) {
		printMissingCli();
		process.exitCode = 127;
		return;
	}

	if (args[0] === "doctor") {
		const requireEditor = args.includes("--require-editor");
		const result = inspectQCut({ resolved, requireEditor });
		printJson({ payload: result });
		process.exitCode = result.status === "ok" ? 0 : 1;
		return;
	}

	if (args.length === 0) {
		printJson({
			stream: process.stderr,
			payload: {
				status: "error",
				code: "qcut:missing_command",
				error: "Pass a QCut command or use 'doctor'.",
			},
		});
		process.exitCode = 2;
		return;
	}

	const result = runQCutCommand({ resolved, args });
	if (result.error) {
		printJson({
			stream: process.stderr,
			payload: {
				status: "error",
				code: "qcut:launch_failed",
				error: result.error.message,
			},
		});
		process.exitCode = 1;
		return;
	}
	process.exitCode = result.status ?? 1;
}

if (isEntryPoint()) main();
