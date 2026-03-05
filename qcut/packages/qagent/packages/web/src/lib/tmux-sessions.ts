/**
 * Merge managed sessions with unmanaged tmux sessions.
 *
 * Discovers all running tmux sessions and identifies which ones are NOT
 * tracked by qagent. Creates lightweight DashboardSession objects for
 * unmanaged sessions so they appear on the dashboard with terminal access.
 */

import { listTmuxSessions, type TmuxSessionInfo } from "@composio/ao-core";
import type { DashboardSession } from "./types.js";

/**
 * Build a minimal DashboardSession for an unmanaged tmux session.
 */
function tmuxInfoToDashboard(info: TmuxSessionInfo): DashboardSession {
	const now = new Date().toISOString();
	return {
		id: info.name,
		projectId: "",
		status: "working",
		activity: null,
		branch: null,
		issueId: null,
		issueUrl: null,
		issueLabel: null,
		issueTitle: null,
		summary: null,
		summaryIsFallback: false,
		createdAt: info.created || now,
		lastActivityAt: info.created || now,
		tokenUsage: null,
		pr: null,
		metadata: {
			windows: String(info.windows),
			attached: info.attached ? "true" : "false",
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

	const unmanagedTmux = allTmux
		.filter((t) => !claimedTmuxNames.has(t.name))
		.sort((a, b) => a.name.localeCompare(b.name))
		.map(tmuxInfoToDashboard);

	return [...managedSessions, ...unmanagedTmux];
}
