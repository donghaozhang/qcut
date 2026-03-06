"use client";

import { useEffect, useMemo, useState } from "react";
import {
	type DashboardSession,
	type DashboardStats,
	type DashboardPR,
	type AttentionLevel,
	getAttentionLevel,
	isPRRateLimited,
} from "@/lib/types";
import { CI_STATUS } from "@composio/ao-core/types";
import { AttentionZone } from "./AttentionZone";
import { PRTableRow } from "./PRStatus";
import { DynamicFavicon } from "./DynamicFavicon";
import { SessionCard } from "./SessionCard";
import { ConversationsPanel } from "./ConversationsPanel";

interface DashboardProps {
	sessions: DashboardSession[];
	orchestratorId?: string | null;
	projectName?: string;
}

const KANBAN_LEVELS = [
	"working",
	"pending",
	"review",
	"respond",
	"merge",
] as const;
const RELAY_SESSION_PREFIX = "relay-";
const SESSION_SORT_MODE = {
	DEFAULT: "default",
	CPU: "cpu",
	TOKEN: "token",
} as const;
type SessionSortMode =
	(typeof SESSION_SORT_MODE)[keyof typeof SESSION_SORT_MODE];

/** Main dashboard view with kanban-style session grouping and live SSE updates. */
export function Dashboard({
	sessions: initialSessions,
	orchestratorId,
	projectName,
}: DashboardProps) {
	const [showRelaySessions, setShowRelaySessions] = useState(false);
	const [sessionSortMode, setSessionSortMode] = useState<SessionSortMode>(
		SESSION_SORT_MODE.TOKEN
	);
	const [labelOverrides, setLabelOverrides] = useState<
		Record<string, string | null>
	>({});

	// Live activity/status overrides from SSE stream
	const [liveOverrides, setLiveOverrides] = useState<
		Record<string, { status?: string; activity?: string }>
	>({});

	useEffect(() => {
		const es = new EventSource("/api/events");
		es.onmessage = (ev) => {
			try {
				const data = JSON.parse(ev.data) as {
					type: string;
					sessions?: Array<{
						id: string;
						status?: string;
						activity?: string;
					}>;
				};
				if (data.type === "snapshot" && data.sessions) {
					const overrides: Record<
						string,
						{ status?: string; activity?: string }
					> = {};
					for (const s of data.sessions) {
						overrides[s.id] = {
							status: s.status,
							activity: s.activity,
						};
					}
					setLiveOverrides(overrides);
				}
			} catch {
				// Ignore malformed events
			}
		};
		return () => es.close();
	}, []);

	const sessions = useMemo(
		() =>
			initialSessions.map((s) => {
				const live = liveOverrides[s.id];
				const label =
					s.id in labelOverrides ? labelOverrides[s.id] : s.label;
				return {
					...s,
					...(label !== undefined ? { label } : {}),
					...(live?.status ? { status: live.status as DashboardSession["status"] } : {}),
					...(live?.activity ? { activity: live.activity as DashboardSession["activity"] } : {}),
				};
			}),
		[initialSessions, labelOverrides, liveOverrides]
	);
	const relaySessions = useMemo(
		() => sessions.filter((session) => isRelaySession({ session })),
		[sessions]
	);
	const visibleSessions = useMemo(
		() => sessions.filter((session) => !isRelaySession({ session })),
		[sessions]
	);
	const sortedVisibleSessions = useMemo(() => {
		if (sessionSortMode === SESSION_SORT_MODE.CPU) return sortSessionsByCpuUsage({ sessions: visibleSessions });
		if (sessionSortMode === SESSION_SORT_MODE.TOKEN) return sortSessionsByTokenUsage({ sessions: visibleSessions });
		return visibleSessions;
	}, [visibleSessions, sessionSortMode]);
	const sortedRelaySessions = useMemo(() => {
		if (sessionSortMode === SESSION_SORT_MODE.CPU) return sortSessionsByCpuUsage({ sessions: relaySessions });
		if (sessionSortMode === SESSION_SORT_MODE.TOKEN) return sortSessionsByTokenUsage({ sessions: relaySessions });
		return relaySessions;
	}, [relaySessions, sessionSortMode]);
	const [rateLimitDismissed, setRateLimitDismissed] = useState(false);
	const grouped = useMemo(() => {
		const zones: Record<AttentionLevel, DashboardSession[]> = {
			merge: [],
			respond: [],
			review: [],
			pending: [],
			working: [],
			done: [],
		};
		for (const session of sortedVisibleSessions) {
			zones[getAttentionLevel(session)].push(session);
		}
		return zones;
	}, [sortedVisibleSessions]);

	const openPRs = useMemo(() => {
		return visibleSessions
			.filter(
				(s): s is DashboardSession & { pr: DashboardPR } =>
					s.pr?.state === "open"
			)
			.map((s) => s.pr)
			.sort((a, b) => mergeScore(a) - mergeScore(b));
	}, [visibleSessions]);

	/** Handle send. */
	const handleSend = async (sessionId: string, message: string) => {
		const res = await fetch(
			`/api/sessions/${encodeURIComponent(sessionId)}/send`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ message }),
			}
		);
		if (!res.ok) {
			console.error(
				`Failed to send message to ${sessionId}:`,
				await res.text()
			);
		}
	};

	/** Handle kill. */
	const handleKill = async (sessionId: string) => {
		if (!confirm(`Kill session ${sessionId}?`)) return;
		const res = await fetch(
			`/api/sessions/${encodeURIComponent(sessionId)}/kill`,
			{
				method: "POST",
			}
		);
		if (!res.ok) {
			console.error(`Failed to kill ${sessionId}:`, await res.text());
		}
	};

	/** Handle merge. */
	const handleMerge = async (prNumber: number) => {
		const res = await fetch(`/api/prs/${prNumber}/merge`, { method: "POST" });
		if (!res.ok) {
			console.error(`Failed to merge PR #${prNumber}:`, await res.text());
		}
	};

	/** Handle restore. */
	const handleRestore = async (sessionId: string) => {
		if (!confirm(`Restore session ${sessionId}?`)) return;
		const res = await fetch(
			`/api/sessions/${encodeURIComponent(sessionId)}/restore`,
			{
				method: "POST",
			}
		);
		if (!res.ok) {
			console.error(`Failed to restore ${sessionId}:`, await res.text());
		}
	};

	const handleLabelChange = async (
		sessionId: string,
		label: string | null
	) => {
		// Optimistic update
		setLabelOverrides((prev) => ({ ...prev, [sessionId]: label }));
		const res = await fetch(
			`/api/sessions/${encodeURIComponent(sessionId)}/label`,
			{
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ label }),
			}
		);
		if (!res.ok) {
			console.error(
				`Failed to update label for ${sessionId}:`,
				await res.text()
			);
		}
	};

	// Compute live stats from the session list (reflects SSE updates)
	const liveStats = useMemo<DashboardStats>(() => {
		let workingSessions = 0;
		let openPRs = 0;
		let needsReview = 0;
		for (const s of visibleSessions) {
			if (s.activity === "active" || s.status === "working") workingSessions++;
			if (s.pr?.state === "open") {
				openPRs++;
				if (getAttentionLevel(s) === "review") needsReview++;
			}
		}
		return {
			totalSessions: visibleSessions.length,
			workingSessions,
			openPRs,
			needsReview,
		};
	}, [visibleSessions]);

	const hasKanbanSessions = KANBAN_LEVELS.some((l) => grouped[l].length > 0);

	const anyRateLimited = useMemo(
		() => visibleSessions.some((s) => s.pr && isPRRateLimited(s.pr)),
		[visibleSessions]
	);
	const isCpuSortEnabled = sessionSortMode === SESSION_SORT_MODE.CPU;
	const isTokenSortEnabled = sessionSortMode === SESSION_SORT_MODE.TOKEN;

	/** Send the gitit.md instruction to an individual session. */
	const handleGitit = async (sessionId: string) => {
		const res = await fetch("/api/commands/gitit", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ sessionId }),
		});
		if (!res.ok) {
			throw new Error(await res.text());
		}
	};

	/** Send the mergeit.md instruction to an individual session. */
	const handleMergeit = async (sessionId: string) => {
		const res = await fetch("/api/commands/mergeit", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ sessionId }),
		});
		if (!res.ok) {
			throw new Error(await res.text());
		}
	};

	/** Handle sort toggle — cycles TOKEN → CPU → DEFAULT → TOKEN. */
	const handleSortToggle = () => {
		setSessionSortMode((prev) => {
			if (prev === SESSION_SORT_MODE.TOKEN) return SESSION_SORT_MODE.CPU;
			if (prev === SESSION_SORT_MODE.CPU) return SESSION_SORT_MODE.DEFAULT;
			return SESSION_SORT_MODE.TOKEN;
		});
	};

	return (
		<div className="px-8 py-7">
			<DynamicFavicon sessions={visibleSessions} projectName={projectName} />
			{/* Header */}
			<div className="mb-8 flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-6">
				<div className="flex items-center gap-6">
					<h1 className="text-[17px] font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">
						Orchestrator
					</h1>
					<StatusLine stats={liveStats} />
				</div>
				<div className="flex items-center gap-3">
					<button
						type="button"
						onClick={handleSortToggle}
						aria-pressed={isCpuSortEnabled || isTokenSortEnabled}
						aria-label="Cycle sort mode"
						className="inline-flex items-center gap-1.5 rounded-[7px] border border-[var(--color-border-subtle)] bg-[rgba(255,255,255,0.02)] px-3 py-1.5 text-[11px] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-strong)]"
					>
						<svg
							className="h-3.5 w-3.5"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							viewBox="0 0 24 24"
						>
							<path d="M4 8h16M7 4l-3 4 3 4M20 16H4M17 12l3 4-3 4" />
						</svg>
						<span className="uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
							Sort
						</span>
						<span className="rounded-[4px] bg-[rgba(255,255,255,0.05)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-primary)]">
							{isTokenSortEnabled ? "Tokens" : isCpuSortEnabled ? "CPU%" : "Default"}
						</span>
					</button>
					{relaySessions.length > 0 && (
						<label className="flex cursor-pointer items-center gap-2 rounded-[7px] border border-[var(--color-border-subtle)] bg-[rgba(255,255,255,0.02)] px-3 py-1.5 text-[11px] text-[var(--color-text-secondary)]">
							<input
								type="checkbox"
								checked={showRelaySessions}
								onChange={(event) =>
									setShowRelaySessions(event.target.checked)
								}
								className="h-3.5 w-3.5 accent-[var(--color-accent)]"
								aria-label="show relay daemons"
							/>
							<span className="uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
								Relay
							</span>
							<span className="rounded-[4px] bg-[rgba(255,255,255,0.05)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-primary)]">
								{relaySessions.length}
							</span>
						</label>
					)}
					{orchestratorId && (
						<a
							href={`/sessions/${encodeURIComponent(orchestratorId)}`}
							className="orchestrator-btn flex items-center gap-2 rounded-[7px] px-4 py-2 text-[12px] font-semibold hover:no-underline"
						>
							<span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] opacity-80" />
							orchestrator
							<svg
								className="h-3 w-3 opacity-70"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								viewBox="0 0 24 24"
							>
								<path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
							</svg>
						</a>
					)}
				</div>
			</div>

			{/* Rate limit notice */}
			{anyRateLimited && !rateLimitDismissed && (
				<div className="mb-6 flex items-center gap-2.5 rounded border border-[rgba(245,158,11,0.25)] bg-[rgba(245,158,11,0.05)] px-3.5 py-2.5 text-[11px] text-[var(--color-status-attention)]">
					<svg
						className="h-3.5 w-3.5 shrink-0"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						viewBox="0 0 24 24"
					>
						<circle cx="12" cy="12" r="10" />
						<path d="M12 8v4M12 16h.01" />
					</svg>
					<span className="flex-1">
						GitHub API rate limited — PR data (CI status, review state, sizes)
						may be stale. Will retry automatically on next refresh.
					</span>
					<button
						onClick={() => setRateLimitDismissed(true)}
						className="ml-1 shrink-0 opacity-60 hover:opacity-100"
						aria-label="Dismiss"
					>
						<svg
							className="h-3.5 w-3.5"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							viewBox="0 0 24 24"
						>
							<path d="M18 6 6 18M6 6l12 12" />
						</svg>
					</button>
				</div>
			)}

			{/* Kanban columns for active zones */}
			{hasKanbanSessions && (
				<div className="mb-8 flex gap-4 overflow-x-auto pb-2">
					{KANBAN_LEVELS.map((level) =>
						grouped[level].length > 0 ? (
							<div key={level} className="min-w-[200px] flex-1">
								<AttentionZone
									level={level}
									sessions={grouped[level]}
									variant="column"
									onSend={handleSend}
									onKill={handleKill}
									onMerge={handleMerge}
									onRestore={handleRestore}
									onLabelChange={handleLabelChange}
									onGitit={handleGitit}
									onMergeit={handleMergeit}
								/>
							</div>
						) : null
					)}
				</div>
			)}

			{/* Done — full-width grid below Kanban */}
			{grouped.done.length > 0 && (
				<div className="mb-8">
					<AttentionZone
						level="done"
						sessions={grouped.done}
						variant="grid"
						onSend={handleSend}
						onKill={handleKill}
						onMerge={handleMerge}
						onRestore={handleRestore}
						onLabelChange={handleLabelChange}
						onGitit={handleGitit}
						onMergeit={handleMergeit}
					/>
				</div>
			)}

			{showRelaySessions && relaySessions.length > 0 && (
				<div className="mb-8">
					<RelaySessionsPanel sessions={sortedRelaySessions} />
				</div>
			)}

			<ConversationsPanel />

			{/* PR Table */}
			{openPRs.length > 0 && (
				<div className="mx-auto max-w-[900px]">
					<h2 className="mb-3 px-1 text-[10px] font-bold uppercase tracking-[0.10em] text-[var(--color-text-tertiary)]">
						Pull Requests
					</h2>
					<div className="overflow-hidden rounded-[6px] border border-[var(--color-border-default)]">
						<table className="w-full border-collapse">
							<thead>
								<tr className="border-b border-[var(--color-border-muted)]">
									<th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
										PR
									</th>
									<th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
										Title
									</th>
									<th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
										Size
									</th>
									<th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
										CI
									</th>
									<th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
										Review
									</th>
									<th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
										Unresolved
									</th>
								</tr>
							</thead>
							<tbody>
								{openPRs.map((pr) => (
									<PRTableRow key={pr.number} pr={pr} />
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}
		</div>
	);
}

/** Handle is relay session. */
function isRelaySession({
	session,
}: {
	session: Pick<DashboardSession, "id">;
}): boolean {
	return session.id.startsWith(RELAY_SESSION_PREFIX);
}

/** Handle relay sessions panel. */
function RelaySessionsPanel({
	sessions,
}: {
	sessions: DashboardSession[];
}) {
	return (
		<div className="rounded-[8px] border border-[var(--color-border-subtle)] bg-[rgba(148,163,184,0.06)] px-4 py-4">
			<div className="mb-3 flex items-center justify-between">
				<div>
					<h2 className="text-[10px] font-bold uppercase tracking-[0.10em] text-[var(--color-text-tertiary)]">
						Relay Daemons
					</h2>
					<p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
						Bridge sessions that sync team inbox messages with harness terminals.
					</p>
				</div>
				<span className="rounded-[4px] border border-[var(--color-border-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-text-secondary)]">
					{sessions.length} running
				</span>
			</div>
			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
				{sessions.map((session) => (
					<SessionCard key={session.id} session={session} />
				))}
			</div>
		</div>
	);
}

/** Compact stats summary showing session and PR counts. */
function StatusLine({ stats }: { stats: DashboardStats }) {
	if (stats.totalSessions === 0) {
		return (
			<span className="text-[13px] text-[var(--color-text-muted)]">
				no sessions
			</span>
		);
	}

	const parts: Array<{ value: number; label: string; color?: string }> = [
		{ value: stats.totalSessions, label: "sessions" },
		...(stats.workingSessions > 0
			? [
					{
						value: stats.workingSessions,
						label: "active",
						color: "var(--color-status-working)",
					},
				]
			: []),
		...(stats.openPRs > 0 ? [{ value: stats.openPRs, label: "PRs" }] : []),
		...(stats.needsReview > 0
			? [
					{
						value: stats.needsReview,
						label: "need review",
						color: "var(--color-status-attention)",
					},
				]
			: []),
	];

	return (
		<div className="flex items-baseline gap-0.5">
			{parts.map((p, i) => (
				<span key={p.label} className="flex items-baseline">
					{i > 0 && (
						<span className="mx-3 text-[11px] text-[var(--color-border-strong)]">
							·
						</span>
					)}
					<span
						className="text-[20px] font-bold tabular-nums tracking-tight"
						style={{ color: p.color ?? "var(--color-text-primary)" }}
					>
						{p.value}
					</span>
					<span className="ml-1.5 text-[11px] text-[var(--color-text-muted)]">
						{p.label}
					</span>
				</span>
			))}
		</div>
	);
}

/** Compute a numeric merge-readiness score for PR sorting (higher = closer to merge). */
function mergeScore(
	pr: Pick<
		DashboardPR,
		"ciStatus" | "reviewDecision" | "mergeability" | "unresolvedThreads"
	>
): number {
	let score = 0;
	if (!pr.mergeability.noConflicts) score += 40;
	if (pr.ciStatus === CI_STATUS.FAILING) score += 30;
	else if (pr.ciStatus === CI_STATUS.PENDING) score += 5;
	if (pr.reviewDecision === "changes_requested") score += 20;
	else if (pr.reviewDecision !== "approved") score += 10;
	score += pr.unresolvedThreads * 5;
	return score;
}

/** Handle sort sessions by cpu usage. */
function sortSessionsByCpuUsage({
	sessions,
}: {
	sessions: DashboardSession[];
}): DashboardSession[] {
	try {
		return [...sessions].sort((sessionA, sessionB) => {
			const cpuDifference =
				getSessionCpuPercent({ session: sessionB }) -
				getSessionCpuPercent({ session: sessionA });
			if (cpuDifference !== 0) return cpuDifference;
			return sessionA.id.localeCompare(sessionB.id);
		});
	} catch {
		return sessions;
	}
}

/** Sort sessions by total token usage descending. */
function sortSessionsByTokenUsage({
	sessions,
}: {
	sessions: DashboardSession[];
}): DashboardSession[] {
	try {
		return [...sessions].sort((a, b) => {
			const tokA = (a.tokenUsage?.inputTokens ?? 0) + (a.tokenUsage?.outputTokens ?? 0);
			const tokB = (b.tokenUsage?.inputTokens ?? 0) + (b.tokenUsage?.outputTokens ?? 0);
			if (tokB !== tokA) return tokB - tokA;
			return a.id.localeCompare(b.id);
		});
	} catch {
		return sessions;
	}
}

/** Get session cpu percent. */
function getSessionCpuPercent({
	session,
}: {
	session: Pick<DashboardSession, "metadata">;
}): number {
	try {
		const rawCpu = session.metadata.cpu ?? "0";
		const parsedCpu = Number.parseFloat(rawCpu);
		if (!Number.isFinite(parsedCpu)) return 0;
		return parsedCpu;
	} catch {
		return 0;
	}
}
