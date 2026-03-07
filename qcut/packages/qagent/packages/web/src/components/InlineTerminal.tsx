"use client";

import type { DashboardSession } from "@/lib/types";
import { DirectTerminal } from "./DirectTerminal";
import { ConversationViewer } from "./ConversationViewer";
import { TerminalMirror } from "./TerminalMirror";
import { CLITerminalPanel } from "./CLITerminalPanel";

/** Inline terminal viewer — picks the right component based on session type. */
export function InlineTerminal({ session }: { session: DashboardSession }) {
	const height = "360px";

	// Managed session → DirectTerminal with tmux
	if (session.managed) {
		return (
			<DirectTerminal
				sessionId={session.id}
				tmuxName={session.metadata?.tmuxName}
				startFullscreen={false}
				variant="agent"
				height={height}
			/>
		);
	}

	// Unmanaged CLI + claude-code/codex → ConversationViewer
	const agent = session.metadata?.agent;
	if (
		(agent === "claude-code" && session.metadata?.cwd) ||
		agent === "codex"
	) {
		return (
			<ConversationViewer
				sessionId={session.id}
				startFullscreen={false}
				height={height}
			/>
		);
	}

	// Unmanaged CLI + has TTY + in iTerm/Terminal → TerminalMirror
	const termApp = session.metadata?.terminalApp;
	const canMirror =
		session.metadata?.tty &&
		(!termApp || termApp === "iTerm" || termApp === "Terminal");
	if (session.metadata?.agent && canMirror) {
		return (
			<TerminalMirror
				session={session}
				startFullscreen={false}
				height={height}
			/>
		);
	}

	// Unmanaged CLI + agent but no viewer → CLITerminalPanel
	if (session.metadata?.agent) {
		return <CLITerminalPanel session={session} />;
	}

	// Fallback → DirectTerminal
	return (
		<DirectTerminal
			sessionId={session.id}
			tmuxName={session.metadata?.tmuxName}
			startFullscreen={false}
			variant="agent"
			height={height}
		/>
	);
}
