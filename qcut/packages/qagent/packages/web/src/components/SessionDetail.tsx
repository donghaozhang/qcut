"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { type DashboardSession } from "@/lib/types";
import { DirectTerminal } from "./DirectTerminal";
import { ConversationViewer } from "./ConversationViewer";
import { TerminalMirror } from "./TerminalMirror";
import { CLITerminalPanel } from "./CLITerminalPanel";
import { PRCard, buildGitHubBranchUrl, buildGitHubRepoUrl } from "./PRCard";
import { ActivityDot } from "./ActivityDot";

interface OrchestratorZones {
	merge: number;
	respond: number;
	review: number;
	pending: number;
	working: number;
	done: number;
}

interface SessionDetailProps {
	session: DashboardSession;
	isOrchestrator?: boolean;
	orchestratorZones?: OrchestratorZones;
}

// ── Helpers ──────────────────────────────────────────────────────────

const activityMeta: Record<string, { label: string; color: string }> = {
	active: { label: "Active", color: "var(--color-status-working)" },
	ready: { label: "Ready", color: "var(--color-status-ready)" },
	idle: { label: "Idle", color: "var(--color-status-idle)" },
	waiting_input: {
		label: "Waiting for input",
		color: "var(--color-status-attention)",
	},
	blocked: { label: "Blocked", color: "var(--color-status-error)" },
	exited: { label: "Exited", color: "var(--color-status-error)" },
};

/** Convert a snake_case status string to title case with common abbreviations. */
function humanizeStatus(status: string): string {
	return status
		.replace(/_/g, " ")
		.replace(/\bci\b/gi, "CI")
		.replace(/\bpr\b/gi, "PR")
		.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Format an ISO timestamp as a human-readable relative time string. */
function relativeTime(iso: string): string {
	const ms = new Date(iso).getTime();
	if (!iso || isNaN(ms)) return "unknown";
	const diff = Date.now() - ms;
	const seconds = Math.floor(diff / 1000);
	if (seconds < 60) return "just now";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

// ── Orchestrator status strip ─────────────────────────────────────────

/** Compact status bar showing orchestrator zone counts and uptime. */
function OrchestratorStatusStrip({
	zones,
	createdAt,
}: {
	zones: OrchestratorZones;
	createdAt: string;
}) {
	const [uptime, setUptime] = useState<string>("");

	useEffect(() => {
		const compute = () => {
			const diff = Date.now() - new Date(createdAt).getTime();
			const h = Math.floor(diff / 3_600_000);
			const m = Math.floor((diff % 3_600_000) / 60_000);
			setUptime(h > 0 ? `${h}h ${m}m` : `${m}m`);
		};
		compute();
		const id = setInterval(compute, 30_000);
		return () => clearInterval(id);
	}, [createdAt]);

	const stats: Array<{
		value: number;
		label: string;
		color: string;
		bg: string;
	}> = [
		{
			value: zones.merge,
			label: "merge-ready",
			color: "#3fb950",
			bg: "rgba(63,185,80,0.1)",
		},
		{
			value: zones.respond,
			label: "responding",
			color: "#f85149",
			bg: "rgba(248,81,73,0.1)",
		},
		{
			value: zones.review,
			label: "review",
			color: "#d18616",
			bg: "rgba(209,134,22,0.1)",
		},
		{
			value: zones.working,
			label: "working",
			color: "#58a6ff",
			bg: "rgba(88,166,255,0.1)",
		},
		{
			value: zones.pending,
			label: "pending",
			color: "#d29922",
			bg: "rgba(210,153,34,0.1)",
		},
		{
			value: zones.done,
			label: "done",
			color: "#484f58",
			bg: "rgba(72,79,88,0.15)",
		},
	].filter((s) => s.value > 0);

	const total =
		zones.merge +
		zones.respond +
		zones.review +
		zones.working +
		zones.pending +
		zones.done;

	return (
		<div
			className="border-b border-[var(--color-border-subtle)] px-8 py-4"
			style={{
				background:
					"linear-gradient(to bottom, rgba(88,166,255,0.04) 0%, transparent 100%)",
			}}
		>
			<div className="mx-auto flex max-w-[900px] items-center gap-3 flex-wrap">
				{/* Total count */}
				<div className="flex items-baseline gap-1.5 mr-2">
					<span className="text-[22px] font-bold leading-none tabular-nums text-[var(--color-text-primary)]">
						{total}
					</span>
					<span className="text-[11px] text-[var(--color-text-tertiary)]">
						agents
					</span>
				</div>

				<div className="h-5 w-px bg-[var(--color-border-subtle)] mr-1" />

				{/* Per-zone pills */}
				{stats.length > 0 ? (
					stats.map((s) => (
						<div
							key={s.label}
							className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
							style={{ background: s.bg }}
						>
							<span
								className="text-[15px] font-bold leading-none tabular-nums"
								style={{ color: s.color }}
							>
								{s.value}
							</span>
							<span
								className="text-[10px] font-medium"
								style={{ color: s.color, opacity: 0.8 }}
							>
								{s.label}
							</span>
						</div>
					))
				) : (
					<span className="text-[12px] text-[var(--color-text-tertiary)]">
						no active agents
					</span>
				)}

				{uptime && (
					<span className="ml-auto font-[var(--font-mono)] text-[11px] text-[var(--color-text-tertiary)]">
						up {uptime}
					</span>
				)}
			</div>
		</div>
	);
}

// ── CPU indicator ─────────────────────────────────────────────────────

/** Compact CPU usage indicator with radial gauge. */
function CPUIndicator({ cpu }: { cpu: string }) {
	const value = parseFloat(cpu);
	const pct = Math.min(value, 100);
	const radius = 18;
	const circumference = 2 * Math.PI * radius;
	const offset = circumference - (pct / 100) * circumference;
	const color =
		pct > 50
			? "var(--color-status-error)"
			: pct > 10
				? "var(--color-status-attention)"
				: "var(--color-text-tertiary)";

	return (
		<div className="flex flex-col items-center gap-0.5 shrink-0">
			<div className="relative h-[48px] w-[48px]">
				<svg className="h-full w-full -rotate-90" viewBox="0 0 44 44">
					<circle
						cx="22"
						cy="22"
						r={radius}
						fill="none"
						stroke="rgba(255,255,255,0.06)"
						strokeWidth="3"
					/>
					<circle
						cx="22"
						cy="22"
						r={radius}
						fill="none"
						stroke={color}
						strokeWidth="3"
						strokeLinecap="round"
						strokeDasharray={circumference}
						strokeDashoffset={offset}
						style={{ transition: "stroke-dashoffset 0.5s ease" }}
					/>
				</svg>
				<span
					className="absolute inset-0 flex items-center justify-center font-[var(--font-mono)] text-[12px] font-bold tabular-nums"
					style={{ color }}
				>
					{Math.round(pct)}
				</span>
			</div>
			<span className="text-[9px] font-medium uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]">
				CPU %
			</span>
		</div>
	);
}

// ── Terminal viewer selector ──────────────────────────────────────────

/** Select the appropriate terminal viewer for a session. */
function SessionTerminal({
	session,
	isOrchestrator,
	startFullscreen,
}: {
	session: DashboardSession;
	isOrchestrator: boolean;
	startFullscreen: boolean;
}) {
	const terminalVariant = isOrchestrator ? "orchestrator" : "agent";
	const terminalHeight = isOrchestrator
		? "calc(100vh - 240px)"
		: "max(440px, calc(100vh - 440px))";

	// 1. Managed session → DirectTerminal with tmux
	if (session.managed) {
		return (
			<DirectTerminal
				sessionId={session.id}
				tmuxName={session.metadata?.tmuxName}
				startFullscreen={startFullscreen}
				variant={terminalVariant}
				height={terminalHeight}
			/>
		);
	}

	// 2. Unmanaged CLI + claude-code/codex → ConversationViewer (JSONL)
	const agent = session.metadata?.agent;
	if (
		(agent === "claude-code" && session.metadata?.cwd) ||
		agent === "codex"
	) {
		return (
			<ConversationViewer
				sessionId={session.id}
				startFullscreen={startFullscreen}
				height={terminalHeight}
			/>
		);
	}

	// 3. Unmanaged CLI + any agent + has TTY + in iTerm/Terminal → TerminalMirror
	const termApp = session.metadata?.terminalApp;
	const canMirror =
		session.metadata?.tty &&
		(!termApp || termApp === "iTerm" || termApp === "Terminal");
	if (session.metadata?.agent && canMirror) {
		return (
			<TerminalMirror
				session={session}
				startFullscreen={startFullscreen}
				height={terminalHeight}
			/>
		);
	}

	// 4. Unmanaged CLI + agent but no viewer available → CLITerminalPanel
	if (session.metadata?.agent) {
		return <CLITerminalPanel session={session} />;
	}

	// 5. Fallback → DirectTerminal with tmux
	return (
		<DirectTerminal
			sessionId={session.id}
			tmuxName={session.metadata?.tmuxName}
			startFullscreen={startFullscreen}
			variant={terminalVariant}
			height={terminalHeight}
		/>
	);
}

// ── Main component ────────────────────────────────────────────────────

/** Full session detail view with terminal, PR card, and metadata. */
export function SessionDetail({
	session,
	isOrchestrator = false,
	orchestratorZones,
}: SessionDetailProps) {
	const searchParams = useSearchParams();
	const startFullscreen = searchParams.get("fullscreen") === "true";
	const pr = session.pr;
	const activity = (session.activity && activityMeta[session.activity]) ?? {
		label: session.activity ?? "unknown",
		color: "var(--color-text-muted)",
	};

	const accentColor = "var(--color-accent)";

	return (
		<div className="min-h-screen bg-[var(--color-bg-base)]">
			{/* Nav bar — glass effect */}
			<nav className="nav-glass sticky top-0 z-10 border-b border-[var(--color-border-subtle)]">
				<div className="mx-auto flex max-w-[900px] items-center gap-2 px-8 py-2.5">
					<a
						href="/"
						className="flex items-center gap-1 text-[11px] font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)] hover:no-underline"
					>
						<svg
							className="h-3 w-3 opacity-60"
							fill="none"
							stroke="currentColor"
							strokeWidth="2.5"
							viewBox="0 0 24 24"
						>
							<path d="M15 18l-6-6 6-6" />
						</svg>
						Orchestrator
					</a>
					<span className="text-[var(--color-border-strong)]">/</span>
					<span className="font-[var(--font-mono)] text-[11px] text-[var(--color-text-tertiary)]">
						{session.id}
					</span>
					{isOrchestrator && (
						<span
							className="ml-1 rounded px-2 py-0.5 text-[10px] font-semibold tracking-[0.05em]"
							style={{
								color: accentColor,
								background: `color-mix(in srgb, ${accentColor} 10%, transparent)`,
								border: `1px solid color-mix(in srgb, ${accentColor} 20%, transparent)`,
							}}
						>
							orchestrator
						</span>
					)}
				</div>
			</nav>

			{/* Orchestrator status strip */}
			{isOrchestrator && orchestratorZones && (
				<OrchestratorStatusStrip
					zones={orchestratorZones}
					createdAt={session.createdAt}
				/>
			)}

			<div className="mx-auto max-w-[900px] px-8 py-6">
				{/* ── Header card ─────────────────────────────────────────── */}
				<div
					className="detail-card mb-6 rounded-[8px] border border-[var(--color-border-default)] p-5"
					style={{
						borderLeft: isOrchestrator
							? `3px solid ${accentColor}`
							: `3px solid ${activity.color}`,
					}}
				>
					<div className="flex items-start gap-3">
						<div className="flex-1 min-w-0">
							<div className="flex flex-wrap items-center gap-2.5">
								<h1 className="font-[var(--font-mono)] text-[17px] font-semibold tracking-[-0.01em] text-[var(--color-text-primary)]">
									{session.id}
								</h1>
								{/* Activity badge */}
								<div
									className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5"
									style={{
										background: `color-mix(in srgb, ${activity.color} 12%, transparent)`,
										border: `1px solid color-mix(in srgb, ${activity.color} 20%, transparent)`,
									}}
								>
									<ActivityDot activity={session.activity} dotOnly size={6} />
									<span
										className="text-[11px] font-semibold"
										style={{ color: activity.color }}
									>
										{activity.label}
									</span>
								</div>
								{/* Terminal app badge */}
								{session.metadata?.terminalApp && (
									<div className="flex items-center gap-1.5 rounded-full bg-[rgba(255,255,255,0.06)] px-2.5 py-0.5 border border-[var(--color-border-subtle)]">
										<svg className="h-3 w-3 text-[var(--color-text-tertiary)]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
											<path d="M4 17l6-5-6-5M12 19h8" />
										</svg>
										<span className="text-[11px] font-medium text-[var(--color-text-secondary)]">
											{session.metadata.terminalApp}
										</span>
										{session.metadata?.terminalName && (
											<>
												<span className="text-[var(--color-text-tertiary)]">&middot;</span>
												<span className="text-[11px] text-[var(--color-text-muted)]">
													{session.metadata.terminalName}
												</span>
											</>
										)}
									</div>
								)}
							</div>

							{session.summary && (
								<p className="mt-2 text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
									{session.summary}
								</p>
							)}

							{/* Meta chips */}
							<div className="mt-3 flex flex-wrap items-center gap-1.5">
								{session.projectId && (
									<>
										{pr ? (
											<a
												href={buildGitHubRepoUrl(pr)}
												target="_blank"
												rel="noopener noreferrer"
												className="rounded-[4px] border border-[var(--color-border-subtle)] bg-[rgba(255,255,255,0.04)] px-2 py-0.5 text-[11px] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)] hover:no-underline"
											>
												{session.projectId}
											</a>
										) : (
											<span className="rounded-[4px] border border-[var(--color-border-subtle)] bg-[rgba(255,255,255,0.04)] px-2 py-0.5 text-[11px] text-[var(--color-text-secondary)]">
												{session.projectId}
											</span>
										)}
										<span className="text-[var(--color-text-tertiary)]">
											&middot;
										</span>
									</>
								)}

								{pr && (
									<>
										<a
											href={pr.url}
											target="_blank"
											rel="noopener noreferrer"
											className="rounded-[4px] border border-[var(--color-border-subtle)] bg-[rgba(255,255,255,0.04)] px-2 py-0.5 text-[11px] text-[var(--color-accent)] transition-colors hover:border-[var(--color-accent)] hover:no-underline"
										>
											PR #{pr.number}
										</a>
										{(session.branch || session.issueUrl) && (
											<span className="text-[var(--color-text-tertiary)]">
												&middot;
											</span>
										)}
									</>
								)}

								{session.branch && (
									<>
										{pr ? (
											<a
												href={buildGitHubBranchUrl(pr)}
												target="_blank"
												rel="noopener noreferrer"
												className="rounded-[4px] border border-[var(--color-border-subtle)] bg-[rgba(255,255,255,0.04)] px-2 py-0.5 font-[var(--font-mono)] text-[10px] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)] hover:no-underline"
											>
												{session.branch}
											</a>
										) : (
											<span className="rounded-[4px] border border-[var(--color-border-subtle)] bg-[rgba(255,255,255,0.04)] px-2 py-0.5 font-[var(--font-mono)] text-[10px] text-[var(--color-text-secondary)]">
												{session.branch}
											</span>
										)}
										{session.issueUrl && (
											<span className="text-[var(--color-text-tertiary)]">
												&middot;
											</span>
										)}
									</>
								)}

								{session.issueUrl && (
									<a
										href={session.issueUrl}
										target="_blank"
										rel="noopener noreferrer"
										className="rounded-[4px] border border-[var(--color-border-subtle)] bg-[rgba(255,255,255,0.04)] px-2 py-0.5 text-[11px] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)] hover:no-underline"
									>
										{session.issueLabel || session.issueUrl}
									</a>
								)}
							</div>

							<ClientTimestamps
								status={session.status}
								createdAt={session.createdAt}
								lastActivityAt={session.lastActivityAt}
							/>
						</div>

						{/* CPU usage indicator — right side */}
						{session.metadata?.cpu && (
							<CPUIndicator cpu={session.metadata.cpu} />
						)}
					</div>
				</div>

				{/* ── PR Card ─────────────────────────────────────────────── */}
				{pr && <PRCard pr={pr} sessionId={session.id} />}

				{/* ── Terminal ─────────────────────────────────────────────── */}
				<div className={pr ? "mt-6" : ""}>
					<div className="mb-3 flex items-center gap-2">
						<div
							className="h-3 w-0.5 rounded-full"
							style={{
								background: isOrchestrator ? accentColor : activity.color,
								opacity: 0.7,
							}}
						/>
						<span className="text-[10px] font-bold uppercase tracking-[0.10em] text-[var(--color-text-tertiary)]">
							Terminal
						</span>
					</div>
					<SessionTerminal
						session={session}
						isOrchestrator={isOrchestrator}
						startFullscreen={startFullscreen}
					/>
				</div>
			</div>
		</div>
	);
}

// ── Client-side timestamps ────────────────────────────────────────────

/** Render relative timestamps that update client-side to avoid hydration mismatch. */
function ClientTimestamps({
	status,
	createdAt,
	lastActivityAt,
}: {
	status: string;
	createdAt: string;
	lastActivityAt: string;
}) {
	const [created, setCreated] = useState<string | null>(null);
	const [lastActive, setLastActive] = useState<string | null>(null);

	useEffect(() => {
		setCreated(relativeTime(createdAt));
		setLastActive(relativeTime(lastActivityAt));
	}, [createdAt, lastActivityAt]);

	return (
		<div className="mt-2.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-[var(--color-text-tertiary)]">
			<span className="rounded-[3px] bg-[rgba(255,255,255,0.05)] px-1.5 py-0.5 text-[10px] font-medium">
				{humanizeStatus(status)}
			</span>
			{created && (
				<>
					<span className="opacity-40">&middot;</span>
					<span>created {created}</span>
				</>
			)}
			{lastActive && (
				<>
					<span className="opacity-40">&middot;</span>
					<span>active {lastActive}</span>
				</>
			)}
		</div>
	);
}
