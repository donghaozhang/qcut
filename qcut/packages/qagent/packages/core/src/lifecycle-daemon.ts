#!/usr/bin/env node
/**
 * Lifecycle Daemon — background process that watches all sessions.
 *
 * DEPRECATED: Use packages/cli/src/lifecycle-daemon.ts instead.
 * This version cannot load plugins because they're not resolvable from
 * the core package. The CLI version has plugins as dependencies.
 *
 * PID file: ~/.qagent/lifecycle-{configHash}.pid
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";

// ── Config & bootstrap ──────────────────────────────────────────────────────

const configPath = process.env.QAGENT_CONFIG;
if (!configPath) {
	console.error("QAGENT_CONFIG environment variable is required");
	process.exit(1);
}

// Dynamic imports so this file can be the entry point
const { loadConfigWithPath } = await import("./config.js");
const { createPluginRegistry } = await import("./plugin-registry.js");
const { createSessionManager } = await import("./session-manager.js");
const { createLifecycleManager } = await import("./lifecycle-manager.js");

const { config } = loadConfigWithPath(configPath);
const registry = createPluginRegistry();

// Load plugins — use dynamic import from this module's context
await registry.loadFromConfig(config, (pkg: string) => import(pkg));

const sessionManager = createSessionManager({ config, registry });
const lm = createLifecycleManager({ config, registry, sessionManager });

// ── PID file management ─────────────────────────────────────────────────────

function getPidPath(): string {
	const hash = createHash("sha256")
		.update(dirname(configPath!))
		.digest("hex")
		.slice(0, 12);
	const dir = join(homedir(), ".qagent");
	mkdirSync(dir, { recursive: true });
	return join(dir, `lifecycle-${hash}.pid`);
}

const pidPath = getPidPath();
writeFileSync(pidPath, String(process.pid));

function cleanup(): void {
	try {
		// Only remove if it's still our PID
		const stored = readFileSync(pidPath, "utf-8").trim();
		if (stored === String(process.pid)) {
			unlinkSync(pidPath);
		}
	} catch {
		// Best effort
	}
}

process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(0); });
process.on("SIGTERM", () => { cleanup(); process.exit(0); });

// ── Start lifecycle manager ─────────────────────────────────────────────────

lm.start();

// ── Auto-shutdown when idle ─────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set(["merged", "killed", "done", "errored", "terminated", "cleanup"]);
const IDLE_SHUTDOWN_MS = 5 * 60 * 1000; // 5 minutes with no active sessions
let lastActiveSeen = Date.now();

setInterval(async () => {
	try {
		const sessions = await sessionManager.list();
		const active = sessions.filter(s => !TERMINAL_STATUSES.has(s.status));

		if (active.length > 0) {
			lastActiveSeen = Date.now();
		} else if (Date.now() - lastActiveSeen > IDLE_SHUTDOWN_MS) {
			lm.stop();
			process.exit(0);
		}
	} catch {
		// Check failed — keep running
	}
}, 60_000);
