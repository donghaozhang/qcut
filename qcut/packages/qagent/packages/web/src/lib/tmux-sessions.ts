/**
 * Merge managed sessions with unmanaged tmux sessions.
 *
 * Discovers all running tmux sessions and identifies which ones are NOT
 * tracked by qagent. Creates lightweight DashboardSession objects for
 * unmanaged sessions so they appear on the dashboard with terminal access.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { listTmuxSessions, type TmuxSessionInfo } from "@composio/ao-core";
import type { DashboardSession } from "./types.js";
import { emptyDashboardTokenUsage } from "./token-usage";

const execFileAsync = promisify(execFile);

/** Resolve the active pane's PID and cwd for a tmux session. */
async function resolveTmuxPaneInfo(
	sessionName: string,
): Promise<{ pid: string | null; cwd: string | null }> {
	try {
		const { stdout } = await execFileAsync(
			"tmux",
			["list-panes", "-t", sessionName, "-F", "#{pane_pid} #{pane_current_path}"],
			{ timeout: 3_000 },
		);
		const first = stdout.split("\n")[0]?.trim();
		if (!first) return { pid: null, cwd: null };
		const spaceIdx = first.indexOf(" ");
		if (spaceIdx === -1) return { pid: first, cwd: null };
		return { pid: first.slice(0, spaceIdx), cwd: first.slice(spaceIdx + 1) };
	} catch {
		return { pid: null, cwd: null };
	}
}

/** Resolve git branch for a directory. */
async function resolveGitBranch(cwd: string): Promise<string | null> {
	try {
		const { stdout } = await execFileAsync(
			"git",
			["rev-parse", "--abbrev-ref", "HEAD"],
			{ timeout: 3_000, cwd },
		);
		return stdout.trim() || null;
	} catch {
		return null;
	}
}

/**
 * Build a minimal DashboardSession for an unmanaged tmux session.
 */
function tmuxInfoToDashboard(
	info: TmuxSessionInfo,
	paneInfo?: { pid: string | null; cwd: string | null },
	branch?: string | null,
): DashboardSession {
	const now = new Date().toISOString();
	return {
		id: info.name,
		projectId: "",
		status: "working",
		activity: null,
		branch: branch ?? null,
		issueId: null,
		issueUrl: null,
		issueLabel: null,
		issueTitle: null,
		summary: null,
		summaryIsFallback: false,
		createdAt: info.created || now,
		lastActivityAt: info.created || now,
		tokenUsage: emptyDashboardTokenUsage(),
		pr: null,
		metadata: {
			agent: "tmux",
			windows: String(info.windows),
			attached: info.attached ? "true" : "false",
			...(paneInfo?.pid ? { pid: paneInfo.pid } : {}),
			...(paneInfo?.cwd ? { cwd: paneInfo.cwd } : {}),
		},
		managed: false,
	};
}

/**
 * Merge managed DashboardSessions with unmanaged tmux sessions.
 *
 * @param managedSessions - Sessions from sessionManager.list(), already tagged managed: true
 * @returns Combined list: managed first, then unmanaged sorted by name
 */
export async function mergeWithUnmanagedTmux(
	managedSessions: DashboardSession[]
): Promise<DashboardSession[]> {
	let allTmux: TmuxSessionInfo[];
	try {
		allTmux = await listTmuxSessions();
	} catch {
		return managedSessions;
	}

	if (allTmux.length === 0) return managedSessions;

	const claimedTmuxNames = new Set<string>();
	for (const s of managedSessions) {
		claimedTmuxNames.add(s.id);
		if (s.metadata.tmuxName) {
			claimedTmuxNames.add(s.metadata.tmuxName);
		}
	}

	const unmanagedInfo = allTmux
		.filter((t) => !claimedTmuxNames.has(t.name))
		.sort((a, b) => a.name.localeCompare(b.name));

	if (unmanagedInfo.length === 0) return managedSessions;

	// Resolve pane PID + cwd in parallel
	const paneInfos = await Promise.all(
		unmanagedInfo.map((t) => resolveTmuxPaneInfo(t.name)),
	);
	// Resolve git branches from cwds
	const branches = await Promise.all(
		paneInfos.map((p) => (p.cwd ? resolveGitBranch(p.cwd) : Promise.resolve(null))),
	);

	const unmanagedTmux = unmanagedInfo.map((t, i) =>
		tmuxInfoToDashboard(t, paneInfos[i], branches[i]),
	);

	return [...managedSessions, ...unmanagedTmux];
}
