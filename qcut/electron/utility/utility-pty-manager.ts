/**
 * PTY Session Manager for Utility Process
 *
 * Manages node-pty sessions in the utility process.
 * Communicates with main process via parentPort messages.
 */

import { platform } from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";
import type { MessagePort } from "node:worker_threads";
import { createSpawnDiagnostics } from "../pty-spawn-diagnostics.js";

// Use electron-log when available, fall back to console
let logger: {
	info: (...args: unknown[]) => void;
	warn: (...args: unknown[]) => void;
	error: (...args: unknown[]) => void;
};
try {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	logger = require("electron-log");
} catch {
	logger = console;
}

// Dynamic import for node-pty using require() instead of ESM import.
// This is intentional: node-pty is a native Node addon (.node file) that
// must be loaded via require() in Electron's packaged environment. Native
// modules cannot be loaded with static ESM imports because Electron
// resolves them from app.asar / resources at runtime, and the two-stage
// fallback (standard path → production resourcesPath) cannot be expressed
// with static imports.
let pty: typeof import("node-pty");
try {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	pty = require("node-pty");
	logger.info("[UtilityPTY] Loaded node-pty from standard path");
} catch (error) {
	logger.warn(
		"[UtilityPTY] Failed to load node-pty from standard path:",
		error
	);
	const resourcesPath = process.resourcesPath ?? "";
	const modulePath = path.join(resourcesPath, "node_modules/node-pty");
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		pty = require(modulePath);
		logger.info(
			"[UtilityPTY] Loaded node-pty from production path:",
			modulePath
		);
	} catch (prodError) {
		logger.error(
			"[UtilityPTY] Failed to load node-pty from production path:",
			prodError
		);
		// Don't throw — PTY will be unavailable but HTTP server can still run
	}
}

interface PtySession {
	id: string;
	process: import("node-pty").IPty;
}

interface SpawnMessage {
	requestId: string;
	sessionId: string;
	command?: string;
	cols?: number;
	rows?: number;
	cwd?: string;
	env?: Record<string, string>;
	mcpServerPath?: string | null;
	projectId?: string;
	projectRoot?: string;
	apiBaseUrl?: string;
}

/** Return a recovery hint for common PTY spawn errors. */
function getPtySpawnRecoveryHint(message: string): string | null {
	const normalized = message.toLowerCase();
	if (
		normalized.includes("posix_spawnp failed") ||
		normalized.includes("node_module_version") ||
		normalized.includes("module version mismatch")
	) {
		return "node-pty may be built for a different ABI. Run: npx electron-rebuild -f -w node-pty";
	}
	return null;
}

/** Determine the default shell for the current platform. */
function getShell(): string {
	if (platform() === "win32") return process.env.COMSPEC || "cmd.exe";
	return process.env.SHELL || "/bin/bash";
}

/** Return default shell arguments. */
function getShellArgs(): string[] {
	if (platform() === "win32") return [];
	return ["-l"];
}

/** Parse existing CLAUDE_MCP_SERVERS JSON config. */
function parseMcpServerConfig(rawConfig?: string): Record<string, unknown> {
	if (!rawConfig) return {};
	try {
		const parsed = JSON.parse(rawConfig);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
			return parsed as Record<string, unknown>;
	} catch {
		/* ignore */
	}
	return {};
}

/** Build the CLAUDE_MCP_SERVERS env variable with QCut server injected. */
function buildClaudeMcpServersEnv(opts: {
	existingRawConfig?: string;
	mcpServerPath: string;
	projectId?: string;
	projectRoot?: string;
	apiBaseUrl?: string;
}): string {
	const existing = parseMcpServerConfig(opts.existingRawConfig);
	const qcutEnv: Record<string, string> = {};
	if (opts.projectId) qcutEnv.QCUT_PROJECT_ID = opts.projectId;
	if (opts.projectRoot) qcutEnv.QCUT_PROJECT_ROOT = opts.projectRoot;
	if (opts.apiBaseUrl) qcutEnv.QCUT_API_BASE_URL = opts.apiBaseUrl;
	return JSON.stringify({
		...existing,
		qcut: { command: "node", args: [opts.mcpServerPath], env: qcutEnv },
	});
}

export class UtilityPtyManager {
	private sessions = new Map<string, PtySession>();
	private parentPort: MessagePort;

	constructor(parentPort: MessagePort) {
		this.parentPort = parentPort;
	}

	spawn(msg: SpawnMessage): void {
		if (!pty) {
			this.parentPort.postMessage({
				type: "pty:spawn-result",
				requestId: msg.requestId,
				success: false,
				error: "node-pty not available in utility process",
			});
			return;
		}

		try {
			let shell: string;
			let args: string[];

			if (msg.command) {
				if (platform() === "win32") {
					shell = process.env.COMSPEC || "cmd.exe";
					args = ["/c", msg.command];
				} else {
					shell = getShell();
					args = ["-c", msg.command];
				}
			} else {
				shell = getShell();
				args = getShellArgs();
			}

			const spawnCwd = msg.cwd || process.cwd();
			const spawnEnv: NodeJS.ProcessEnv = { ...process.env, ...msg.env };

			// Wire up MCP server for Claude commands
			const isClaudeCommand =
				typeof msg.command === "string" &&
				msg.command.trim().startsWith("claude");
			if (isClaudeCommand) {
				// Strip parent Claude Code session markers so the inner claude does
				// not detect a nested session and bail. CLAUDECODE alone is not
				// enough — the CLI also sets CLAUDE_CODE_ENTRYPOINT,
				// CLAUDE_CODE_EXECPATH, CLAUDE_CODE_SSE_PORT, AI_AGENT, etc.
				// Match case-insensitively: Windows env vars can land as
				// `ClaudeCode` / `claudecode`, and `spawnEnv` is a plain object
				// so bare `delete spawnEnv.CLAUDECODE` misses those casings.
				for (const key of Object.keys(spawnEnv)) {
					const upper = key.toUpperCase();
					if (
						upper === "CLAUDECODE" ||
						upper === "AI_AGENT" ||
						upper.startsWith("CLAUDE_CODE_")
					) {
						delete spawnEnv[key];
					}
				}
			}
			if (isClaudeCommand && msg.mcpServerPath) {
				spawnEnv.CLAUDE_MCP_SERVERS = buildClaudeMcpServersEnv({
					existingRawConfig: spawnEnv.CLAUDE_MCP_SERVERS,
					mcpServerPath: msg.mcpServerPath,
					projectId: msg.projectId,
					projectRoot: msg.projectRoot || spawnCwd,
					apiBaseUrl: msg.apiBaseUrl,
				});
			}

			// Windows env keys are case-insensitive at the OS level, but
			// `spawnEnv` is a plain spread of `process.env` — bare
			// `spawnEnv.PATH` returns `undefined` when the variable was set as
			// `Path` / `path`. Fall back through common casings so binary
			// resolution diagnostics work regardless of source.
			const diagnostics = createSpawnDiagnostics({
				shell,
				args,
				cwd: spawnCwd,
				command: msg.command,
				envPath: spawnEnv.PATH ?? spawnEnv.Path ?? spawnEnv.path,
				platformName: platform(),
				pathExtEnv: spawnEnv.PATHEXT ?? spawnEnv.PathExt ?? spawnEnv.pathext,
			});
			logger.info("[UtilityPTY] ===== SPAWN =====");
			logger.info(`[UtilityPTY] sessionId=${msg.sessionId}`);
			logger.info(`[UtilityPTY] shell=${diagnostics.shell}`);
			// Redact the command payload — args can contain raw user input
			// (`["-c", msg.command]` on Unix) which may include tokens or
			// prompts; log only the shell flags + a payload-length marker.
			const safeArgs = diagnostics.args.map((arg) =>
				typeof arg === "string" && arg.startsWith("-")
					? arg
					: `<redacted ${typeof arg === "string" ? arg.length : 0} chars>`
			);
			logger.info(`[UtilityPTY] args=${JSON.stringify(safeArgs)}`);
			logger.info(
				`[UtilityPTY] cwd=${diagnostics.cwd} (exists=${diagnostics.cwdExists})`
			);
			logger.info(`[UtilityPTY] PATH preview: ${diagnostics.pathPreview}`);
			if (diagnostics.commandBinary) {
				logger.info(
					`[UtilityPTY] resolved ${diagnostics.commandBinary}: ${
						diagnostics.resolvedCommandPath || "NOT FOUND"
					}`
				);
			}

			const ptyProcess = pty.spawn(shell, args, {
				name: "xterm-256color",
				cols: msg.cols || 80,
				rows: msg.rows || 24,
				cwd: spawnCwd,
				env: spawnEnv,
			});

			const session: PtySession = { id: msg.sessionId, process: ptyProcess };
			this.sessions.set(msg.sessionId, session);

			ptyProcess.onData((data: string) => {
				this.parentPort.postMessage({
					type: "pty:data",
					sessionId: msg.sessionId,
					data,
				});
			});

			ptyProcess.onExit(
				({ exitCode, signal }: { exitCode: number; signal?: number }) => {
					logger.info(
						`[UtilityPTY] exit sessionId=${msg.sessionId} exitCode=${exitCode} signal=${signal ?? "none"}`
					);
					this.parentPort.postMessage({
						type: "pty:exit",
						sessionId: msg.sessionId,
						exitCode,
						signal,
					});
					this.sessions.delete(msg.sessionId);
				}
			);

			this.parentPort.postMessage({
				type: "pty:spawn-result",
				requestId: msg.requestId,
				success: true,
				sessionId: msg.sessionId,
			});
		} catch (error: unknown) {
			const message =
				error instanceof Error ? error.message : "PTY spawn failed";
			const hint = getPtySpawnRecoveryHint(message);
			this.parentPort.postMessage({
				type: "pty:spawn-result",
				requestId: msg.requestId,
				success: false,
				error: hint ? `${message}. ${hint}` : message,
			});
		}
	}

	write(sessionId: string, data: string): void {
		this.sessions.get(sessionId)?.process.write(data);
	}

	output(sessionId: string, data: string): void {
		try {
			if (!this.sessions.has(sessionId)) {
				return;
			}
			const normalized = data.endsWith("\n") ? data : `${data}\r\n`;
			this.parentPort.postMessage({
				type: "pty:data",
				sessionId,
				data: normalized,
			});
		} catch {
			// no-op
		}
	}

	resize(sessionId: string, cols: number, rows: number): void {
		this.sessions.get(sessionId)?.process.resize(cols, rows);
	}

	kill(sessionId: string): void {
		const session = this.sessions.get(sessionId);
		if (session) {
			try {
				session.process.kill();
			} catch {
				/* ignore */
			}
			this.sessions.delete(sessionId);
			this.parentPort.postMessage({
				type: "pty:kill-result",
				sessionId,
				success: true,
			});
		} else {
			this.parentPort.postMessage({
				type: "pty:kill-result",
				sessionId,
				success: false,
				error: "Session not found",
			});
		}
	}

	killAll(): void {
		for (const [, session] of this.sessions) {
			try {
				session.process.kill();
			} catch {
				/* ignore */
			}
		}
		const count = this.sessions.size;
		this.sessions.clear();
		this.parentPort.postMessage({ type: "pty:kill-all-result", count });
	}
}
