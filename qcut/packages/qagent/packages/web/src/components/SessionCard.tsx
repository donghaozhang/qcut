"use client";

import { useState, useEffect, useRef } from "react";
import {
	type DashboardSession,
	type AttentionLevel,
	getAttentionLevel,
	isPRRateLimited,
	TERMINAL_STATUSES,
	TERMINAL_ACTIVITIES,
} from "@/lib/types";
import { CI_STATUS } from "@composio/ao-core/types";
import { cn } from "@/lib/cn";
import { getSessionTitle } from "@/lib/format";
import {
	formatTokenCountCompact,
	formatTokenCountFull,
	formatUsd,
	toDisplayTokenUsage,
} from "@/lib/token-usage";
import { PRStatus } from "./PRStatus";
import { CICheckList } from "./CIBadge";
import { ActivityDot } from "./ActivityDot";
import { GateBlockerPanelLoader } from "./GateBlockerPanel";

interface SessionCardProps {
	session: DashboardSession;
	onSend?: (sessionId: string, message: string) => void;
	onKill?: (sessionId: string) => void;
	onMerge?: (prNumber: number) => void;
	onRestore?: (sessionId: string) => void;
	onLabelChange?: (sessionId: string, label: string | null) => void;
	onGitit?: (sessionId: string) => void;
}

const borderColorByLevel: Record<AttentionLevel, string> = {
	merge: "border-l-[var(--color-status-ready)]",
	respond: "border-l-[var(--color-status-error)]",
	review: "border-l-[var(--color-accent-orange)]",
	pending: "border-l-[var(--color-status-attention)]",
	working: "border-l-[var(--color-status-working)]",
	done: "border-l-[var(--color-border-default)]",
};
const AGENT_BADGE_CLASS_BY_AGENT = {
	"claude-code": "agent-badge agent-badge-claude",
	codex: "agent-badge agent-badge-codex",
	tmux: "agent-badge agent-badge-tmux",
	unknown: "agent-badge",
} as const;
type UnmanagedAgent = keyof typeof AGENT_BADGE_CLASS_BY_AGENT;

/** Compact session card with inline label editing, activity dot, and action buttons. */
export function SessionCard({
	session,
	onSend,
	onKill,
	onMerge,
	onRestore,
	onLabelChange,
	onGitit,
}: SessionCardProps) {
	const [expanded, setExpanded] = useState(false);
	const [sendingAction, setSendingAction] = useState<string | null>(null);
	const [gititState, setGititState] = useState<"idle" | "loading" | "done" | "error">("idle");
	const [editingLabel, setEditingLabel] = useState(false);
	const [labelDraft, setLabelDraft] = useState(session.label ?? "");
	const labelInputRef = useRef<HTMLInputElement>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const level = getAttentionLevel(session);
	const pr = session.pr;

	useEffect(() => {
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, []);

	useEffect(() => {
		if (editingLabel && labelInputRef.current) {
			labelInputRef.current.focus();
			labelInputRef.current.select();
		}
	}, [editingLabel]);

	/** Handle commit label. */
	const commitLabel = () => {
		// Read directly from input to avoid stale closure with batched state updates
		const trimmed = (labelInputRef.current?.value ?? labelDraft).trim();
		const newLabel = trimmed || null;
		setEditingLabel(false);
		setLabelDraft(trimmed);
		if (newLabel !== (session.label ?? null)) {
			onLabelChange?.(session.id, newLabel);
		}
	};

	/** Handle action. */
	const handleAction = async (action: string, message: string) => {
		setSendingAction(action);
		onSend?.(session.id, message);
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = setTimeout(() => setSendingAction(null), 2000);
	};

	const rateLimited = pr ? isPRRateLimited(pr) : false;
	const alerts = getAlerts(session);
	const isReadyToMerge =
		!rateLimited && pr?.mergeability.mergeable && pr.state === "open";
	const isTerminal =
		TERMINAL_STATUSES.has(session.status) ||
		(session.activity !== null && TERMINAL_ACTIVITIES.has(session.activity));
	const isRestorable = isTerminal && session.status !== "merged";
	const unmanagedAgent: UnmanagedAgent =
		session.metadata.agent === "claude-code" ||
		session.metadata.agent === "codex" ||
		session.metadata.agent === "tmux"
			? session.metadata.agent
			: "unknown";
	const unmanagedAgentLabel =
		unmanagedAgent === "claude-code" ? "claude" : unmanagedAgent;
	const unmanagedAgentBadgeClass = AGENT_BADGE_CLASS_BY_AGENT[unmanagedAgent];

	const title = getSessionTitle(session);
	const tokenUsage = toDisplayTokenUsage({ usage: session.tokenUsage });
	const totalTokensLabel = formatTokenCountCompact({
		tokens: tokenUsage.totalTokens,
	});
	const inputTokensLabel = formatTokenCountFull({
		tokens: tokenUsage.inputTokens,
	});
	const outputTokensLabel = formatTokenCountFull({
		tokens: tokenUsage.outputTokens,
	});
	const hasEstimatedCost = tokenUsage.estimatedCostUsd > 0;
	const costLabel = hasEstimatedCost
		? formatUsd({ usd: tokenUsage.estimatedCostUsd })
		: null;

	return (
		<div
			className={cn(
				"session-card group cursor-pointer border border-l-[3px]",
				"hover:border-[var(--color-border-strong)]",
				borderColorByLevel[level],
				isReadyToMerge
					? "card-merge-ready border-[rgba(63,185,80,0.3)]"
					: "border-[var(--color-border-default)]",
				expanded && "border-[var(--color-border-strong)]",
				pr?.state === "merged" && "opacity-55"
			)}
			style={{
				borderRadius: 7,
				background:
					expanded && !isReadyToMerge
						? "linear-gradient(175deg, rgba(32,41,53,1) 0%, rgba(22,28,37,1) 100%)"
						: undefined,
			}}
			onClick={(e) => {
				if ((e.target as HTMLElement).closest("a, button, textarea")) return;
				setExpanded(!expanded);
			}}
		>
			{/* Header row: dot + label/ID + terminal link */}
			<div className="flex items-center gap-2 px-4 pt-4 pb-2">
				<ActivityDot activity={session.activity} />
				<div className="flex items-center gap-1.5 min-w-0">
					{editingLabel ? (
						<input
							ref={labelInputRef}
							value={labelDraft}
							onChange={(e) => setLabelDraft(e.target.value)}
							onBlur={commitLabel}
							onKeyDown={(e) => {
								if (e.key === "Enter") commitLabel();
								if (e.key === "Escape") {
									setLabelDraft(session.label ?? "");
									setEditingLabel(false);
								}
							}}
							className="w-28 rounded border border-[var(--color-accent)] bg-transparent px-1 py-0 font-[var(--font-mono)] text-[11px] text-[var(--color-text-primary)] outline-none"
							placeholder="label…"
						/>
					) : session.label ? (
						<button
							onClick={(e) => {
								e.stopPropagation();
								setLabelDraft(session.label ?? "");
								setEditingLabel(true);
							}}
							className="truncate rounded px-1 py-0 text-[11px] font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-subtle)]"
							title="Click to edit label"
						>
							{session.label}
						</button>
					) : (
						<button
							onClick={(e) => {
								e.stopPropagation();
								setLabelDraft("");
								setEditingLabel(true);
							}}
							className="hidden rounded px-1 py-0 text-[10px] text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-muted)] group-hover:inline-block"
							title="Add label"
						>
							+label
						</button>
					)}
					<span className="font-[var(--font-mono)] text-[11px] tracking-wide text-[var(--color-text-muted)]">
						{session.label ? `(${session.id})` : session.id}
					</span>
				</div>
				{!session.managed && (
					<span className={unmanagedAgentBadgeClass}>
						{unmanagedAgentLabel}
					</span>
				)}
				<div className="flex-1" />
				{isRestorable && session.managed && (
					<button
						onClick={(e) => {
							e.stopPropagation();
							onRestore?.(session.id);
						}}
						className="rounded border border-[rgba(88,166,255,0.35)] px-2 py-0.5 text-[11px] text-[var(--color-accent)] transition-colors hover:bg-[rgba(88,166,255,0.1)]"
					>
						restore
					</button>
				)}
				{onGitit && (
					<button
						onClick={(e) => {
							e.stopPropagation();
							if (gititState === "loading") return;
							setGititState("loading");
							Promise.resolve(onGitit(session.id)).then(() => {
								setGititState("done");
								setTimeout(() => setGititState("idle"), 2000);
							}).catch(() => {
								setGititState("error");
								setTimeout(() => setGititState("idle"), 2000);
							});
						}}
						disabled={gititState === "loading"}
						className="rounded border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] px-2.5 py-0.5 text-[11px] text-[var(--color-text-muted)] transition-colors hover:border-[rgba(136,192,208,0.5)] hover:text-[rgba(136,192,208,0.9)] hover:no-underline disabled:opacity-50"
					>
						{gititState === "loading" ? "…" : gititState === "done" ? "✓" : gititState === "error" ? "✗" : "gitit"}
					</button>
				)}
				{(!isTerminal || !session.managed) && (
					<a
						href={`/sessions/${encodeURIComponent(session.id)}`}
						onClick={(e) => e.stopPropagation()}
						className="rounded border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] px-2.5 py-0.5 text-[11px] text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] hover:no-underline"
					>
						terminal
					</a>
				)}
			</div>

			{/* Title — its own row, bigger, can wrap */}
			<div className="px-4 pb-3">
				<p
					className={cn(
						"leading-snug [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] overflow-hidden",
						level === "working"
							? "text-[13px] font-medium text-[var(--color-text-secondary)]"
							: "text-[14px] font-semibold text-[var(--color-text-primary)]"
					)}
				>
					{title}
				</p>
			</div>

			{/* Meta row: branch + PR pills + CPU + terminal app */}
			<div className="flex flex-wrap items-center gap-1.5 px-4 pb-2.5">
				{session.branch && (
					<span className="inline-flex items-center gap-1.5 rounded-[4px] bg-[rgba(136,192,208,0.08)] px-1.5 py-0.5 text-[10px]">
						<span className="text-[var(--color-text-tertiary)]">branch</span>
						<span className="font-[var(--font-mono)] text-[rgba(136,192,208,0.75)]">
							{session.branch}
						</span>
					</span>
				)}
				{session.branch && pr && (
					<span className="text-[9px] text-[var(--color-border-strong)]">
						&middot;
					</span>
				)}
				{pr && <PRStatus pr={pr} />}
				{totalTokensLabel && (
					<span
						className="inline-flex items-center gap-1 rounded-[4px] bg-[rgba(88,166,255,0.1)] px-1.5 py-0.5 text-[10px] text-[var(--color-accent)]"
						title={`${inputTokensLabel} in · ${outputTokensLabel} out`}
					>
						<span className="font-[var(--font-mono)]">{totalTokensLabel} tok</span>
						{costLabel && (
							<>
								<span className="text-[var(--color-text-tertiary)]">
									&middot;
								</span>
								<span>{costLabel}</span>
							</>
						)}
					</span>
				)}
				{session.metadata?.terminalApp && (
					<span className="inline-flex items-center gap-1 rounded-[4px] bg-[rgba(255,255,255,0.04)] px-1.5 py-0.5 text-[10px]">
						<svg className="h-2.5 w-2.5 text-[var(--color-text-tertiary)]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
							<path d="M4 17l6-5-6-5M12 19h8" />
						</svg>
						<span className="text-[var(--color-text-muted)]">
							{session.metadata.terminalApp}
						</span>
						{session.metadata?.terminalName && (
							<>
								<span className="text-[var(--color-text-tertiary)]">&middot;</span>
								<span className="text-[var(--color-text-muted)]">
									{session.metadata.terminalName}
								</span>
							</>
						)}
					</span>
				)}
				{session.metadata?.cpu && parseFloat(session.metadata.cpu) > 0 && (
					<span
						className="inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 font-[var(--font-mono)] text-[10px] tabular-nums"
						style={{
							color: parseFloat(session.metadata.cpu) > 50
								? "var(--color-status-error)"
								: parseFloat(session.metadata.cpu) > 10
									? "var(--color-status-attention)"
									: "var(--color-text-muted)",
							background: parseFloat(session.metadata.cpu) > 50
								? "rgba(248,81,73,0.1)"
								: parseFloat(session.metadata.cpu) > 10
									? "rgba(210,153,34,0.1)"
									: "rgba(255,255,255,0.04)",
						}}
					>
						<svg className="h-2.5 w-2.5" viewBox="0 0 16 16" fill="currentColor">
							<path d="M6 1h4v2h3v3h2v4h-2v3h-3v2H6v-2H3v-3H1V6h2V3h3V1zm1 2v2H5v2H3v2h2v2h2v2h2v-2h2V9h2V7h-2V5H9V3H7z" />
						</svg>
						{session.metadata.cpu}%
					</span>
				)}
			</div>

			{/* Rate limited indicator */}
			{rateLimited && pr?.state === "open" && (
				<div className="px-4 pb-3">
					<span className="inline-flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
						<svg
							className="h-3 w-3 text-[var(--color-text-tertiary)]"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							viewBox="0 0 24 24"
						>
							<circle cx="12" cy="12" r="10" />
							<path d="M12 8v4M12 16h.01" />
						</svg>
						PR data rate limited
					</span>
				</div>
			)}

			{/* Gate blocker callout — fetched on mount per card, cached 30s */}
			{session.managed && (
				<div className="px-4">
					<GateBlockerPanelLoader sessionId={session.id} />
				</div>
			)}

			{/* Merge button or alert tags */}
			{!rateLimited && (alerts.length > 0 || isReadyToMerge) && (
				<div className="px-4 pb-3.5 pt-0.5">
					{isReadyToMerge && pr ? (
						<button
							onClick={(e) => {
								e.stopPropagation();
								onMerge?.(pr.number);
							}}
							className="inline-flex items-center gap-1.5 rounded-[5px] border-0 bg-[var(--color-status-ready)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-text-inverse)] transition-[filter,transform] duration-[100ms] hover:-translate-y-px hover:brightness-110"
						>
							<svg
								className="h-3.5 w-3.5"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								viewBox="0 0 24 24"
							>
								<path d="M5 12h14M12 5l7 7-7 7" />
							</svg>
							Merge PR #{pr.number}
						</button>
					) : (
						<div className="flex flex-wrap gap-1">
							{alerts.map((alert) => (
								<span
									key={alert.key}
									className="inline-flex items-center gap-1"
								>
									<a
										href={alert.url}
										target="_blank"
										rel="noopener noreferrer"
										onClick={(e) => e.stopPropagation()}
										className={cn(
											"inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium hover:brightness-125 hover:no-underline",
											alert.className
										)}
									>
										{alert.count !== undefined && (
											<span className="font-bold">{alert.count}</span>
										)}
										{alert.label}
									</a>
									{alert.actionLabel && session.activity !== "active" && (
										<button
											onClick={(e) => {
												e.stopPropagation();
												handleAction(alert.key, alert.actionMessage ?? "");
											}}
											disabled={sendingAction === alert.key}
											className="rounded border border-[rgba(88,166,255,0.25)] px-2 py-0.5 text-[11px] text-[var(--color-accent)] transition-colors hover:bg-[rgba(88,166,255,0.1)] disabled:opacity-50"
										>
											{sendingAction === alert.key
												? "sent!"
												: alert.actionLabel}
										</button>
									)}
								</span>
							))}
						</div>
					)}
				</div>
			)}

			{/* Expandable detail panel */}
			{expanded && (
				<div className="border-t border-[var(--color-border-subtle)] px-4 py-3.5">
					{session.summary && pr?.title && session.summary !== pr.title && (
						<DetailSection label="Summary">
							<p className="text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
								{session.summary}
							</p>
						</DetailSection>
					)}

					{session.issueUrl && (
						<DetailSection label="Issue">
							<a
								href={session.issueUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="text-[12px] text-[var(--color-accent)] hover:underline"
							>
								{session.issueLabel || session.issueUrl}
								{session.issueTitle && `: ${session.issueTitle}`}
							</a>
						</DetailSection>
					)}

					{inputTokensLabel && outputTokensLabel && totalTokensLabel && (
						<DetailSection label="Usage">
							<p className="text-[12px] text-[var(--color-text-secondary)]">
								<span className="font-[var(--font-mono)]">{inputTokensLabel}</span>{" "}
								in ·{" "}
								<span className="font-[var(--font-mono)]">{outputTokensLabel}</span>{" "}
								out ·{" "}
								<span className="font-[var(--font-mono)]">
									{totalTokensLabel}
								</span>{" "}
								total
								{costLabel && (
									<>
										{" · "}
										<span className="font-[var(--font-mono)]">{costLabel}</span>
									</>
								)}
							</p>
						</DetailSection>
					)}

					{pr && pr.ciChecks.length > 0 && (
						<DetailSection label="CI Checks">
							<CICheckList checks={pr.ciChecks} />
						</DetailSection>
					)}

					{pr && pr.unresolvedComments.length > 0 && (
						<DetailSection label="Unresolved Comments">
							<div className="space-y-1">
								{pr.unresolvedComments.map((c) => (
									<div
										key={c.url}
										className="flex items-center gap-2 text-[12px]"
									>
										<span className="w-3 shrink-0 text-center text-[var(--color-status-error)]">
											●
										</span>
										<span className="min-w-0 flex-1 truncate font-[var(--font-mono)] text-[10px] text-[var(--color-text-secondary)]">
											{c.path}
										</span>
										<a
											href={c.url}
											target="_blank"
											rel="noopener noreferrer"
											className="shrink-0 text-[11px] text-[var(--color-accent)] hover:underline"
										>
											view →
										</a>
									</div>
								))}
							</div>
						</DetailSection>
					)}

					{pr && (
						<DetailSection label="PR">
							<p className="text-[12px] text-[var(--color-text-secondary)]">
								<a
									href={pr.url}
									target="_blank"
									rel="noopener noreferrer"
									className="hover:underline"
								>
									{pr.title}
								</a>
								<br />
								<span className="text-[var(--color-status-ready)]">
									+{pr.additions}
								</span>{" "}
								<span className="text-[var(--color-status-error)]">
									-{pr.deletions}
								</span>
								{" · "}mergeable: {pr.mergeability.mergeable ? "yes" : "no"}
								{" · "}review: {pr.reviewDecision}
							</p>
						</DetailSection>
					)}

					{!pr && (
						<p className="text-[12px] text-[var(--color-text-tertiary)]">
							No PR associated with this session.
						</p>
					)}

					{!session.managed && (
						<div className="mb-2.5">
							{session.metadata.agent ? (
								<>
									<p className="text-[12px] text-[var(--color-text-tertiary)]">
										Unmanaged{" "}
										{session.metadata.agent === "claude-code"
											? "Claude Code"
											: "Codex"}{" "}
										session — not tracked by qagent.
									</p>
									<p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
										PID {session.metadata.pid}
										{session.metadata.tty ? ` · ${session.metadata.tty}` : ""}
										{session.metadata.cwd ? ` · ${session.metadata.cwd}` : ""}
									</p>
								</>
							) : (
								<>
									<p className="text-[12px] text-[var(--color-text-tertiary)]">
										Unmanaged tmux session — not tracked by qagent.
									</p>
									<p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
										{session.metadata.windows} window
										{session.metadata.windows !== "1" ? "s" : ""}
										{session.metadata.attached === "true" ? " · attached" : ""}
									</p>
								</>
							)}
						</div>
					)}

					{session.managed && <div className="mt-3 flex gap-2 border-t border-[var(--color-border-subtle)] pt-3">
						{isRestorable && (
							<button
								onClick={(e) => {
									e.stopPropagation();
									onRestore?.(session.id);
								}}
								className="rounded border border-[rgba(88,166,255,0.35)] px-2.5 py-1 text-[11px] text-[var(--color-accent)] transition-colors hover:bg-[rgba(88,166,255,0.1)]"
							>
								restore session
							</button>
						)}
						{!isTerminal && (
							<button
								onClick={(e) => {
									e.stopPropagation();
									onKill?.(session.id);
								}}
								className="rounded border border-[rgba(239,68,68,0.35)] px-2.5 py-1 text-[11px] text-[var(--color-status-error)] transition-colors hover:bg-[rgba(239,68,68,0.1)]"
							>
								terminate
							</button>
						)}
						</div>}
				</div>
			)}
		</div>
	);
}

/** Collapsible section within the expanded session card. */
function DetailSection({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="mb-2.5">
			<div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
				{label}
			</div>
			{children}
		</div>
	);
}

interface Alert {
	key: string;
	label: string;
	className: string;
	url: string;
	count?: number;
	actionLabel?: string;
	actionMessage?: string;
}

/** Derive actionable alerts from a session's PR state (CI failures, review requests). */
function getAlerts(session: DashboardSession): Alert[] {
	const pr = session.pr;
	if (!pr || pr.state !== "open") return [];
	if (isPRRateLimited(pr)) return [];

	const alerts: Alert[] = [];

	if (pr.ciStatus === CI_STATUS.FAILING) {
		const failedCheck = pr.ciChecks.find((c) => c.status === "failed");
		const failCount = pr.ciChecks.filter((c) => c.status === "failed").length;
		if (failCount === 0) {
			alerts.push({
				key: "ci-unknown",
				label: "CI unknown",
				className:
					"border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.08)] text-[var(--color-status-attention)]",
				url: pr.url + "/checks",
			});
		} else {
			alerts.push({
				key: "ci-fail",
				label: `${failCount} CI check${failCount > 1 ? "s" : ""} failing`,
				className:
					"border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)] text-[var(--color-status-error)]",
				url: failedCheck?.url ?? pr.url + "/checks",
				actionLabel: "ask to fix",
				actionMessage: `Please fix the failing CI checks on ${pr.url}`,
			});
		}
	}

	if (pr.reviewDecision === "changes_requested") {
		alerts.push({
			key: "changes",
			label: "changes requested",
			className:
				"border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)] text-[var(--color-status-error)]",
			url: pr.url,
		});
	} else if (
		!pr.isDraft &&
		(pr.reviewDecision === "pending" || pr.reviewDecision === "none")
	) {
		alerts.push({
			key: "review",
			label: "needs review",
			className:
				"border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.08)] text-[var(--color-status-attention)]",
			url: pr.url,
			actionLabel: "ask to post",
			actionMessage: `Post ${pr.url} on slack asking for a review.`,
		});
	}

	if (!pr.mergeability.noConflicts) {
		alerts.push({
			key: "conflict",
			label: "merge conflict",
			className:
				"border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)] text-[var(--color-status-error)]",
			url: pr.url,
			actionLabel: "ask to fix",
			actionMessage: `Please resolve the merge conflicts on ${pr.url} by rebasing on the base branch`,
		});
	}

	if (pr.unresolvedThreads > 0) {
		const firstUrl = pr.unresolvedComments[0]?.url ?? pr.url + "/files";
		alerts.push({
			key: "comments",
			label: "unresolved comments",
			count: pr.unresolvedThreads,
			className:
				"border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)] text-[var(--color-status-error)]",
			url: firstUrl,
			actionLabel: "ask to resolve",
			actionMessage: `Please address all unresolved review comments on ${pr.url}`,
		});
	}

	return alerts;
}
