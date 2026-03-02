"use client";

import { useCallback, useEffect } from "react";
import { usePtyTerminalStore } from "@/stores/pty-terminal-store";
import { TerminalEmulator } from "./terminal-emulator";
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
	MonitorPlay,
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
		sessionId,
		status,
		exitCode,
		error,
		cliProvider,
		selectedModel,
		selectedClaudeModel,
		activeSkill,
		workingDirectory,
		terminalMountedIn,
		connect,
		disconnect,
		ensureAutoConnected,
		setCliProvider,
		setSelectedModel,
		setSelectedClaudeModel,
		clearSkillContext,
		handleError,
		setTerminalMountedIn,
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

	const isConnected = status === "connected";
	const isConnecting = status === "connecting";
	const isTerminalVisible = activeTab === "pty";
	const isMountedInPreview = terminalMountedIn === "preview-panel";

	// Claim terminal mount for media panel when visible (only if preview doesn't have it)
	useEffect(() => {
		if (!isTerminalVisible || isMountedInPreview) {
			return;
		}
		setTerminalMountedIn("media-panel");
		return () => {
			// Only release if we're the ones who claimed it
			if (usePtyTerminalStore.getState().terminalMountedIn === "media-panel") {
				setTerminalMountedIn(null);
			}
		};
	}, [isTerminalVisible, isMountedInPreview, setTerminalMountedIn]);

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
						<div className="flex items-center gap-1 px-2 py-0.5 bg-purple-500/10 rounded-full">
							<Brain className="h-3 w-3 text-purple-500" aria-hidden="true" />
							<span className="text-xs text-purple-600 font-medium truncate max-w-[120px]">
								{activeSkill.name}
							</span>
							<button
								type="button"
								onClick={clearSkillContext}
								className="ml-0.5 text-purple-400 hover:text-destructive transition-colors"
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

			{/* Terminal Area */}
			<div className="flex-1 min-h-0 bg-[#1a1a1a] overflow-hidden">
				{isMountedInPreview && (isConnected || isConnecting) ? (
					<div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
						<MonitorPlay className="h-10 w-10 opacity-50" />
						<p className="text-sm">Agent is active in the Preview panel</p>
						<p className="text-xs opacity-60">
							Switch back from Agent mode in Preview to use the terminal here
						</p>
					</div>
				) : isConnected || isConnecting ? (
					<TerminalEmulator
						sessionId={sessionId}
						isVisible={isTerminalVisible}
					/>
				) : (
					<div className="h-full flex flex-col items-center justify-center text-muted-foreground">
						{activeSkill ? (
							<>
								<Brain className="h-12 w-12 mb-4 text-purple-500" />
								<p className="text-sm font-medium text-foreground">
									{activeSkill.name}
								</p>
								<p className="text-xs mt-1 opacity-70">
									Click Start to run with {CLI_PROVIDERS[cliProvider].name}
								</p>
								{cliProvider === "codex" && (
									<p className="text-xs mt-2 text-blue-400">
										Using model: {selectedModel || "default"}
									</p>
								)}
								{cliProvider === "claude" && (
									<p className="text-xs mt-2 text-orange-400">
										Using model: {selectedClaudeModel || "sonnet"}
									</p>
								)}
								{cliProvider === "gemini" && (
									<p className="text-xs mt-2 text-purple-400">
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
				)}
			</div>
		</div>
	);
}
