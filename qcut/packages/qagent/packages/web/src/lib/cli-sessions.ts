/**
 * Discover unmanaged Claude Code and Codex CLI sessions.
 *
 * Finds claude/codex processes running in terminals (not managed by qagent,
 * not inside tmux, not the Claude Desktop app) and creates lightweight
 * DashboardSession objects so they appear on the dashboard.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DashboardSession } from "./types.js";
import { detectTerminalApp, readTerminalTabName } from "./terminal-utils";

const execFileAsync = promisify(execFile);

interface CLIProcess {
	pid: number;
	tty: string;
	args: string;
	agent: "claude-code" | "codex";
}

const CLAUDE_RE = /(?:^|[\s/])claude(?:\s|$)/;
const CODEX_RE = /(?:^|[\s/])codex(?:\s|$)/;
const CLAUDE_WRAPPER_RE = /(?:^|\s)--agent(?:=|\s+)(?:claude-code|claude)(?:\s|$)/;
const CODEX_WRAPPER_RE = /(?:^|\s)--agent(?:=|\s+)codex(?:\s|$)/;

/**
 * Discover claude and codex processes via `ps`.
 * Excludes processes with no TTY (??) which are background/Desktop processes.
 */
async function discoverCLIProcesses(): Promise<CLIProcess[]> {
	let stdout: string;
	try {
		const result = await execFileAsync("ps", ["-eo", "pid,tty,args"], {
			timeout: 5_000,
		});
		stdout = result.stdout;
	} catch {
		return [];
	}

	const processes: CLIProcess[] = [];
	for (const line of stdout.split("\n")) {
		const trimmed = line.trimStart();
		const cols = trimmed.split(/\s+/);
		if (cols.length < 3) continue;

		const pid = parseInt(cols[0]!, 10);
		const tty = cols[1]!;
		const args = cols.slice(2).join(" ");

		// Skip background processes (Claude Desktop, daemons)
		if (tty === "??" || tty === "-") continue;

		// Skip desktop app bundle processes (Claude.app, Codex.app, etc.)
		if (args.includes(".app/Contents/")) continue;

		// Skip Claude Desktop API-mode instances (spawned by Claude Desktop, not user CLI)
		if (args.includes("--output-format stream-json")) continue;
		if (args.includes("--permission-prompt-tool stdio")) continue;

		const agent = resolveAgentFromArgs({ args });

		if (agent && Number.isFinite(pid)) {
			processes.push({ pid, tty, args, agent });
		}
	}

	return processes;
}

/** Resolve agent from args. */
function resolveAgentFromArgs({
	args,
}: {
	args: string;
}): "claude-code" | "codex" | null {
	try {
		if (CLAUDE_RE.test(args) || CLAUDE_WRAPPER_RE.test(args)) {
			return "claude-code";
		}
		if (CODEX_RE.test(args) || CODEX_WRAPPER_RE.test(args)) {
			return "codex";
		}
		return null;
	} catch {
		return null;
	}
}

/**
 * Get tmux pane TTYs to exclude processes running inside tmux.
 */
async function getTmuxPaneTTYs(): Promise<Set<string>> {
	try {
		const { stdout } = await execFileAsync(
			"tmux",
			["list-panes", "-a", "-F", "#{pane_tty}"],
			{ timeout: 3_000 },
		);
		const ttys = new Set<string>();
		for (const line of stdout.split("\n")) {
			const tty = line.trim();
			if (tty) {
				// ps shows short TTY (e.g. "s009"), tmux shows full path (e.g. "/dev/ttys009")
				// Normalize: extract the short form
				const short = tty.replace(/^\/dev\/tty/, "");
				ttys.add(short);
				ttys.add(tty);
			}
		}
		return ttys;
	} catch {
		// tmux not running or not installed — no pane TTYs to exclude
		return new Set();
	}
}

interface ProcessActivity {
	activity: "active" | "idle";
	cpu: string;
}

/**
 * Detect whether a process is active or idle via CPU usage.
 * Returns activity status and the raw CPU percentage string.
 */
async function resolveProcessActivity(pid: number): Promise<ProcessActivity> {
	try {
		const { stdout } = await execFileAsync(
			"ps",
			["-o", "%cpu=", "-p", String(pid)],
			{ timeout: 3_000 },
		);
		const cpuRaw = parseFloat(stdout.trim());
		const cpu = Number.isFinite(cpuRaw) ? cpuRaw.toFixed(1) : "0.0";
		return {
			activity: Number.isFinite(cpuRaw) && cpuRaw > 1 ? "active" : "idle",
			cpu,
		};
	} catch {
		return { activity: "idle", cpu: "0.0" };
	}
}

/**
 * Resolve the current git branch for a directory.
 * Returns null if not a git repo or on error.
 */
async function resolveGitBranch(cwd: string): Promise<string | null> {
	try {
		const { stdout } = await execFileAsync(
			"git",
			["rev-parse", "--abbrev-ref", "HEAD"],
			{ timeout: 3_000, cwd },
		);
		const branch = stdout.trim();
		return branch || null;
	} catch {
		return null;
	}
}

/**
 * Resolve a process's working directory via lsof.
 */
async function resolveProcessCwd(pid: number): Promise<string | null> {
	try {
		const { stdout } = await execFileAsync(
			"lsof",
			["-a", "-p", String(pid), "-d", "cwd", "-Fn"],
			{ timeout: 3_000 },
		);
		for (const line of stdout.split("\n")) {
			if (line.startsWith("n") && line.length > 1) {
				return line.slice(1);
			}
		}
		return null;
	} catch {
		return null;
	}
}

/**
 * Resolve process start timestamp via ps lstart.
 */
async function resolveProcessStartedAt(pid: number): Promise<string | null> {
	try {
		const { stdout } = await execFileAsync(
			"ps",
			["-o", "lstart=", "-p", String(pid)],
			{ timeout: 3_000 },
		);
		const startedAtRaw = stdout.trim();
		if (!startedAtRaw) return null;
		const startedAtMs = Date.parse(startedAtRaw);
		if (!Number.isFinite(startedAtMs)) return null;
		return new Date(startedAtMs).toISOString();
	} catch {
		return null;
	}
}

/** Convert a discovered CLI process into a DashboardSession object. */
function cliProcessToDashboard(
	proc: CLIProcess,
	cwd: string | null,
	branch: string | null,
	activity: "active" | "idle" = "idle",
	cpu = "0.0",
	terminalApp: string | null = null,
	terminalName: string | null = null,
	processStartedAt: string | null = null,
): DashboardSession {
	const now = new Date().toISOString();
	return {
		id: `${proc.agent}:${proc.pid}`,
		projectId: "",
		status: "working",
		activity,
		branch,
		issueId: null,
		issueUrl: null,
		issueLabel: null,
		issueTitle: null,
		summary: null,
		summaryIsFallback: false,
		createdAt: now,
		lastActivityAt: now,
		tokenUsage: null,
		pr: null,
		metadata: {
			pid: String(proc.pid),
			tty: proc.tty,
			agent: proc.agent,
			command: proc.args,
			...(cwd ? { cwd } : {}),
			cpu,
			...(terminalApp ? { terminalApp } : {}),
			...(terminalName ? { terminalName } : {}),
			...(processStartedAt ? { processStartedAt } : {}),
		},
		managed: false,
	};
}

/**
 * Find a single CLI session by its dashboard ID (e.g. "claude-code:1293").
 * Used by /api/sessions/[id] to serve detail pages.
 */
export async function findCLISession(
	id: string,
): Promise<DashboardSession | null> {
	if (process.platform === "win32") return null;
	const match = id.match(/^(claude-code|codex):(\d+)$/);
	if (!match) return null;

	const agent = match[1] as "claude-code" | "codex";
	const pid = parseInt(match[2]!, 10);

	const processes = await discoverCLIProcesses();
	const proc = processes.find((p) => p.agent === agent && p.pid === pid);
	if (!proc) return null;

	const [cwd, processInfo, terminalApp, processStartedAt] = await Promise.all([
		resolveProcessCwd(pid),
		resolveProcessActivity(pid),
		detectTerminalApp(pid),
		resolveProcessStartedAt(pid),
	]);
	const [branch, terminalName] = await Promise.all([
		cwd ? resolveGitBranch(cwd) : Promise.resolve(null),
		readTerminalTabName(proc.tty, terminalApp, { pid, cwd: cwd ?? undefined }),
	]);
	return cliProcessToDashboard(
		proc,
		cwd,
		branch,
		processInfo.activity,
		processInfo.cpu,
		terminalApp,
		terminalName,
		processStartedAt,
	);
}

/**
 * Merge managed sessions with unmanaged CLI agent processes.
 *
 * Must be called AFTER mergeWithUnmanagedTmux so that processes running
 * inside tmux (managed or unmanaged) are already accounted for.
 */
export async function mergeWithUnmanagedCLI(
	managedSessions: DashboardSession[],
): Promise<DashboardSession[]> {
	// CLI process discovery relies on Unix ps/lsof — skip on non-Unix platforms
	if (process.platform === "win32") return managedSessions;

	const processes = await discoverCLIProcesses();
	if (processes.length === 0) return managedSessions;

	// Exclude processes in tmux panes (covered by tmux discovery)
	const tmuxTTYs = await getTmuxPaneTTYs();

	// Collect PIDs already claimed by managed sessions
	const claimedPids = new Set<number>();
	for (const s of managedSessions) {
		if (s.metadata.pid) {
			claimedPids.add(parseInt(s.metadata.pid, 10));
		}
	}

	const unmanaged = processes.filter((p) => {
		if (claimedPids.has(p.pid)) return false;
		// Check both short and full TTY forms against tmux panes
		if (tmuxTTYs.has(p.tty)) return false;
		const shortTTY = p.tty.replace(/^\/dev\/tty/, "");
		if (tmuxTTYs.has(shortTTY)) return false;
		return true;
	});

	if (unmanaged.length === 0) return managedSessions;

	// Resolve CWDs, activity, and terminal apps in parallel
	const [cwds, processInfos, terminalApps, processStartedAts] = await Promise.all([
		Promise.all(unmanaged.map((p) => resolveProcessCwd(p.pid))),
		Promise.all(unmanaged.map((p) => resolveProcessActivity(p.pid))),
		Promise.all(unmanaged.map((p) => detectTerminalApp(p.pid))),
		Promise.all(unmanaged.map((p) => resolveProcessStartedAt(p.pid))),
	]);

	// Resolve git branches and terminal tab names in parallel
	const [branches, terminalNames] = await Promise.all([
		Promise.all(
			cwds.map((cwd) => (cwd ? resolveGitBranch(cwd) : Promise.resolve(null))),
		),
		Promise.all(
			unmanaged.map((p, i) => readTerminalTabName(p.tty, terminalApps[i] ?? null, { pid: p.pid, cwd: cwds[i] ?? undefined })),
		),
	]);

	const unmanagedSessions = unmanaged.map((p, i) =>
		cliProcessToDashboard(
			p,
			cwds[i] ?? null,
			branches[i] ?? null,
			processInfos[i]!.activity,
			processInfos[i]!.cpu,
			terminalApps[i] ?? null,
			terminalNames[i] ?? null,
			processStartedAts[i] ?? null,
		),
	);

	return [...managedSessions, ...unmanagedSessions];
}
