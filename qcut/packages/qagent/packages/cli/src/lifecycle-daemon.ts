#!/usr/bin/env node
/**
 * Lifecycle Daemon — background process that watches all sessions.
 *
 * Auto-started by `qagent spawn` when no daemon is running.
 * Runs the lifecycle manager (poll loop, reconciliation, issue discovery)
 * and auto-exits when no active sessions remain for 5 minutes.
 *
 * IMPORTANT: This file lives in the CLI package (not core) because plugins
 * are only resolvable from here — the CLI has them as dependencies.
 *
 * PID file: ~/.qagent/lifecycle-{configHash}.pid
 */

import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	loadConfigWithPath,
	createPluginRegistry,
	createSessionManager,
	createLifecycleManager,
	getDaemonPidPath,
} from "@composio/ao-core";

// ── Config & bootstrap ──────────────────────────────────────────────────────

const configPath = process.env.QAGENT_CONFIG;
if (!configPath) {
	console.error("QAGENT_CONFIG environment variable is required");
	process.exit(1);
}

const { config } = loadConfigWithPath(configPath);
const registry = createPluginRegistry();

// Load plugins — import from CLI context where they're resolvable
await registry.loadFromConfig(config, (pkg: string) => import(pkg));

const sessionManager = createSessionManager({ config, registry });
const lm = createLifecycleManager({ config, registry, sessionManager });

// ── PID file management ─────────────────────────────────────────────────────

const pidPath = getDaemonPidPath(configPath);
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
