"use client";

import { useState, useCallback } from "react";
import { type DashboardSession } from "@/lib/types";
import { cn } from "@/lib/cn";

/** Fallback panel for CLI agent sessions without a viewer, with "Open in Terminal" button. */
export function CLITerminalPanel({ session }: { session: DashboardSession }) {
	const [opening, setOpening] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const openTerminal = useCallback(async () => {
		setOpening(true);
		setError(null);
		try {
			const res = await fetch(
				`/api/sessions/${encodeURIComponent(session.id)}/open-terminal`,
				{ method: "POST" },
			);
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setError(data.error ?? "Failed to open terminal");
			}
		} catch (err) {
			console.error("[CLITerminalPanel] Failed to open terminal:", err);
			setError("Failed to open terminal");
		} finally {
			setOpening(false);
		}
	}, [session.id]);

	const agentName =
		session.metadata.agent === "claude-code" ? "Claude Code" : "Codex";

	return (
		<div className="rounded-[6px] border border-[var(--color-border-default)] bg-[#0a0a0f] overflow-hidden">
			{/* Chrome bar */}
			<div className="flex items-center gap-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] px-3 py-2">
				<div className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-status-working)]" />
				<span className="font-[var(--font-mono)] text-[11px] text-[var(--color-accent)]">
					{session.id}
				</span>
				<span className="text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]">
					{agentName}
				</span>
			</div>
			{/* Body */}
			<div className="flex flex-col items-center justify-center gap-4 py-16 px-6">
				<div className="flex flex-col items-center gap-1.5 text-center">
					<p className="text-[13px] text-[var(--color-text-secondary)]">
						This {agentName} session is running in your terminal
					</p>
					{(session.metadata.pid || session.metadata.tty) && (
					<div className="flex items-center gap-3 font-[var(--font-mono)] text-[11px] text-[var(--color-text-muted)]">
						{session.metadata.pid && <span>PID {session.metadata.pid}</span>}
						{session.metadata.pid && session.metadata.tty && (
							<span className="text-[var(--color-border-strong)]">&middot;</span>
						)}
						{session.metadata.tty && <span>TTY {session.metadata.tty}</span>}
					</div>
				)}
				</div>
				<button
					type="button"
					onClick={openTerminal}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") openTerminal();
					}}
					disabled={opening}
					className={cn(
						"mt-2 flex items-center gap-2 rounded-[6px] px-5 py-2.5 text-[13px] font-medium transition-colors",
						"bg-[var(--color-accent)] text-white hover:brightness-110",
						"disabled:opacity-50 disabled:cursor-not-allowed",
					)}
				>
					<svg
						className="h-4 w-4"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						viewBox="0 0 24 24"
					>
						<path d="M4 17l6-5-6-5M12 19h8" />
					</svg>
					{opening ? "Opening\u2026" : "Open in Terminal"}
				</button>
				{error && (
					<p className="text-[11px] text-[var(--color-status-error)]">
						{error}
					</p>
				)}
				</div>
		</div>
	);
}
