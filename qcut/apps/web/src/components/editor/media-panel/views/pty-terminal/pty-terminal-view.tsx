"use client";

import { useCallback, useEffect } from "react";
import { usePtyTerminalStore } from "@/stores/pty-terminal-store";
import { TerminalEmulator } from "./terminal-emulator";
import { SessionTab } from "./session-tab";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Play,
	Square,
	RotateCcw,
	Terminal as TerminalIcon,
	Sparkles,
	Loader2,
	Brain,
	X,
	Bot,
	MessageSquare,
	Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CliProvider } from "@/types/cli-provider";
import {
	CLI_PROVIDERS,
	DEFAULT_OPENROUTER_MODELS,
	CLAUDE_MODELS,
} from "@/types/cli-provider";
import { useMediaPanelStore } from "../../store";

export function PtyTerminalView() {
	const activeTab = useMediaPanelStore((state) => state.activeTab);
	const {
		sessions,
		sessionOrder,
		activeSessionId,
		status,
		exitCode,
		error,
		cliProvider,
		selectedModel,
		selectedClaudeModel,
		activeSkill,
		workingDirectory,
		connect,
		disconnect,
		ensureAutoConnected,
		createSession,
		closeSession,
		switchSession,
		renameSession,
		setCliProvider,
		setSelectedModel,
		setSelectedClaudeModel,
		clearSkillContext,
		handleError,
	} = usePtyTerminalStore();

	const setAsyncActionError = useCallback(
		({ error }: { error: unknown }) => {
			const message =
				error instanceof Error ? error.message : "Terminal action failed";
			handleError(message);
		},
		[handleError]
	);

	const handleStart = async () => {
		try {
			await connect({ manual: true });
		} catch (error) {
			setAsyncActionError({ error });
		}
	};

	const handleStop = async () => {
		try {
			await disconnect({ userInitiated: true });
		} catch (error) {
			setAsyncActionError({ error });
		}
	};

	const handleRestart = async () => {
		try {
			await disconnect();
			await new Promise((resolve) => setTimeout(resolve, 100));
			await connect({ manual: true });
		} catch (error) {
			setAsyncActionError({ error });
		}
	};

	const handleNewSession = () => {
		createSession();
	};

	const isConnected = status === "connected";
	const isConnecting = status === "connecting";
	const isTerminalVisible = activeTab === "pty";
	const hasSessions = sessionOrder.length > 0;

	useEffect(() => {
		if (!isTerminalVisible) {
			return;
		}

		ensureAutoConnected({ cwd: workingDirectory || undefined }).catch(
			(error: unknown) => {
				setAsyncActionError({ error });
			}
		);
	}, [
		ensureAutoConnected,
		isTerminalVisible,
		workingDirectory,
		setAsyncActionError,
	]);

	return (
		<div
			className="flex flex-col h-full w-full min-w-0"
			data-testid="pty-terminal-view"
		>
			{/* Header Controls */}
			<div className="flex items-center justify-between p-2 border-b bg-muted/30">
				<div className="flex items-center gap-3">
					{/* Provider Selector */}
					<div className="flex items-center gap-2">
						<Select
							value={cliProvider}
							onValueChange={(value: CliProvider) => setCliProvider(value)}
							disabled={isConnected || isConnecting}
						>
							<SelectTrigger
								className="w-[140px] h-8"
								aria-label="Select CLI provider"
								data-testid="terminal-provider-selector"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{Object.values(CLI_PROVIDERS).map((provider) => (
									<SelectItem key={provider.id} value={provider.id}>
										<div className="flex items-center gap-2">
											{provider.id === "gemini" && (
												<Sparkles className="h-3 w-3" aria-hidden="true" />
											)}
											{provider.id === "codex" && (
												<Bot className="h-3 w-3" aria-hidden="true" />
											)}
											{provider.id === "claude" && (
												<MessageSquare className="h-3 w-3" aria-hidden="true" />
											)}
											{provider.id === "shell" && (
												<TerminalIcon className="h-3 w-3" aria-hidden="true" />
											)}
											<span>{provider.name}</span>
										</div>
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						{/* Model Selector (only for Codex) */}
						{cliProvider === "codex" && (
							<Select
								value={selectedModel || ""}
								onValueChange={setSelectedModel}
								disabled={isConnected || isConnecting}
							>
								<SelectTrigger
									className="w-[180px] h-8"
									aria-label="Select AI model"
								>
									<SelectValue placeholder="Select model" />
								</SelectTrigger>
								<SelectContent>
									{DEFAULT_OPENROUTER_MODELS.map((model) => (
										<SelectItem key={model.id} value={model.id}>
											<div className="flex flex-col">
												<span className="text-sm">{model.name}</span>
												<span className="text-xs text-muted-foreground">
													{model.provider}
												</span>
											</div>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}

						{/* Model Selector (only for Claude) */}
						{cliProvider === "claude" && (
							<Select
								value={selectedClaudeModel || ""}
								onValueChange={setSelectedClaudeModel}
								disabled={isConnected || isConnecting}
							>
								<SelectTrigger
									className="w-[160px] h-8"
									aria-label="Select Claude model"
								>
									<SelectValue placeholder="Select model" />
								</SelectTrigger>
								<SelectContent>
									{CLAUDE_MODELS.map((model) => (
										<SelectItem key={model.id} value={model.id}>
											<div className="flex flex-col">
												<span className="text-sm">{model.name}</span>
												<span className="text-xs text-muted-foreground">
													{model.description}
												</span>
											</div>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
					</div>

					{/* Status Indicator */}
					<div
						className="flex items-center gap-1.5"
						data-testid="terminal-status"
						data-status={status}
					>
						<div
							className={cn(
								"h-2 w-2 rounded-full",
								status === "connected" && "bg-green-500",
								status === "connecting" && "bg-yellow-500 animate-pulse",
								status === "disconnected" && "bg-gray-400",
								status === "error" && "bg-red-500"
							)}
							aria-hidden="true"
						/>
						<span className="text-xs text-muted-foreground capitalize">
							{status}
						</span>
					</div>

					{/* Active Skill Badge */}
					{activeSkill && (
						<div className="flex items-center gap-1 px-2 py-0.5 bg-primary/10 rounded-full">
							<Brain className="h-3 w-3 text-primary" aria-hidden="true" />
							<span className="text-xs text-primary font-medium truncate max-w-[120px]">
								{activeSkill.name}
							</span>
							<button
								type="button"
								onClick={clearSkillContext}
								className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors"
								aria-label="Clear skill context"
							>
								<X className="h-3 w-3" aria-hidden="true" />
							</button>
						</div>
					)}
				</div>

				{/* Action Buttons */}
				<div className="flex items-center gap-1">
					{!isConnected && !isConnecting && (
						<Button
							type="button"
							variant="default"
							size="sm"
							onClick={handleStart}
							aria-label="Start terminal session"
							data-testid="terminal-start-button"
						>
							<Play className="h-4 w-4 mr-1" aria-hidden="true" />
							Start
						</Button>
					)}

					{isConnecting && (
						<Button type="button" variant="outline" size="sm" disabled>
							<Loader2
								className="h-4 w-4 mr-1 animate-spin"
								aria-hidden="true"
							/>
							Connecting...
						</Button>
					)}

					{isConnected && (
						<>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={handleRestart}
								aria-label="Restart terminal session"
								data-testid="terminal-restart-button"
							>
								<RotateCcw className="h-4 w-4" aria-hidden="true" />
							</Button>
							<Button
								type="button"
								variant="destructive"
								size="sm"
								onClick={handleStop}
								aria-label="Stop terminal session"
								data-testid="terminal-stop-button"
							>
								<Square className="h-4 w-4 mr-1" aria-hidden="true" />
								Stop
							</Button>
						</>
					)}
				</div>
			</div>

			{/* Session Tab Bar */}
			{hasSessions && (
				<div
					className="flex items-center gap-0.5 px-2 py-1 border-b bg-muted/20 overflow-x-auto"
					role="tablist"
					aria-label="Terminal sessions"
				>
					{sessionOrder.map((tabId) => {
						const session = sessions.get(tabId);
						if (!session) return null;
						return (
							<SessionTab
								key={tabId}
								tabId={tabId}
								label={session.label}
								status={session.status}
								isActive={tabId === activeSessionId}
								onSelect={() => switchSession(tabId)}
								onClose={() => {
									closeSession(tabId).catch(setAsyncActionError);
								}}
								onRename={(label) => renameSession(tabId, label)}
							/>
						);
					})}
					<button
						type="button"
						onClick={handleNewSession}
						disabled={sessions.size >= 5}
						className={cn(
							"h-7 w-7 flex items-center justify-center rounded shrink-0",
							sessions.size >= 5
								? "opacity-30 cursor-not-allowed"
								: "hover:bg-muted/50 text-muted-foreground"
						)}
						aria-label="New terminal session"
						data-testid="new-session-button"
					>
						<Plus className="h-3.5 w-3.5" />
					</button>
				</div>
			)}

			{/* Error Display */}
			{error && (
				<div className="p-2 bg-destructive/10 border-b border-destructive/20">
					<p className="text-sm text-destructive">{error}</p>
				</div>
			)}

			{/* Exit Code Display */}
			{exitCode !== null && status === "disconnected" && (
				<div className="p-2 bg-muted/50 border-b">
					<p className="text-sm text-muted-foreground">
						Process exited with code {exitCode}
					</p>
				</div>
			)}

			{/* Terminal Area — all sessions mounted, only active visible */}
			<div className="flex-1 min-h-0 bg-terminal-bg overflow-hidden relative">
				{hasSessions ? (
					sessionOrder.map((tabId) => {
						const session = sessions.get(tabId);
						if (!session) return null;
						const isActiveTab = tabId === activeSessionId;
						const isSessionReady =
							session.status === "connected" || session.status === "connecting";

						return (
							<div
								key={tabId}
								className="absolute inset-0"
								style={{ display: isActiveTab ? "block" : "none" }}
							>
								{isSessionReady ? (
									<TerminalEmulator
										tabId={tabId}
										sessionId={session.sessionId}
										isVisible={isActiveTab && isTerminalVisible}
									/>
								) : (
									<SessionPlaceholder
										session={session}
										cliProvider={session.cliProvider}
										selectedModel={session.selectedModel}
										selectedClaudeModel={session.selectedClaudeModel}
									/>
								)}
							</div>
						);
					})
				) : (
					<div className="h-full flex flex-col items-center justify-center text-muted-foreground">
						<TerminalIcon className="h-12 w-12 mb-4 opacity-50" />
						<p className="text-sm">
							Click Start to launch {CLI_PROVIDERS[cliProvider].name}
						</p>
						<p className="text-xs mt-1 opacity-70">
							Select a provider above and click Start
						</p>
					</div>
				)}
			</div>
		</div>
	);
}

/** Placeholder shown when a session tab is selected but not connected */
function SessionPlaceholder({
	session,
	cliProvider,
	selectedModel,
	selectedClaudeModel,
}: {
	session: import("@/stores/pty-session-types").SessionState;
	cliProvider: CliProvider;
	selectedModel: string | null;
	selectedClaudeModel: string | null;
}) {
	return (
		<div className="h-full flex flex-col items-center justify-center text-muted-foreground">
			{session.activeSkill ? (
				<>
					<Brain className="h-12 w-12 mb-4 text-primary" />
					<p className="text-sm font-medium text-foreground">
						{session.activeSkill.name}
					</p>
					<p className="text-xs mt-1 opacity-70">
						Click Start to run with {CLI_PROVIDERS[cliProvider].name}
					</p>
					{cliProvider === "codex" && (
						<p className="text-xs mt-2 text-muted-foreground">
							Using model: {selectedModel || "default"}
						</p>
					)}
					{cliProvider === "claude" && (
						<p className="text-xs mt-2 text-muted-foreground">
							Using model: {selectedClaudeModel || "sonnet"}
						</p>
					)}
					{cliProvider === "gemini" && (
						<p className="text-xs mt-2 text-muted-foreground">
							Skill instructions will be sent automatically
						</p>
					)}
				</>
			) : (
				<>
					{cliProvider === "gemini" && (
						<Sparkles className="h-12 w-12 mb-4 opacity-50" />
					)}
					{cliProvider === "codex" && (
						<Bot className="h-12 w-12 mb-4 opacity-50" />
					)}
					{cliProvider === "claude" && (
						<MessageSquare className="h-12 w-12 mb-4 opacity-50" />
					)}
					{cliProvider === "shell" && (
						<TerminalIcon className="h-12 w-12 mb-4 opacity-50" />
					)}
					<p className="text-sm">
						Click Start to launch {CLI_PROVIDERS[cliProvider].name}
					</p>
					{cliProvider === "gemini" && (
						<p className="text-xs mt-1 opacity-70">
							Requires Google account authentication on first use
						</p>
					)}
					{cliProvider === "codex" && (
						<p className="text-xs mt-1 opacity-70">
							Requires OpenRouter API key in Settings
						</p>
					)}
					{cliProvider === "claude" && (
						<p className="text-xs mt-1 opacity-70">
							Uses Claude Pro/Max login (API key optional)
						</p>
					)}
				</>
			)}
		</div>
	);
}
