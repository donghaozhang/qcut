"use client";

import { useEffect } from "react";
import { usePtyTerminalStore } from "@/stores/pty-terminal-store";
import { TerminalEmulator } from "@/components/editor/media-panel/views/pty-terminal/terminal-emulator";
import { Button } from "@/components/ui/button";
import { Play, Square, Bot, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getProviderConfig } from "@/types/cli-provider";

/**
 * Lightweight agent terminal view embedded in the preview panel.
 * Shares the same PTY session as the media panel's terminal tab.
 * Full configuration (model, provider, skills) stays in the media panel — this is a read/watch view.
 */
export function PreviewAgentView() {
	const {
		sessionId,
		activeSessionId,
		status,
		cliProvider,
		connect,
		disconnect,
		ensureAutoConnected,
		setTerminalMountedIn,
	} = usePtyTerminalStore();

	const isConnected = status === "connected";
	const isConnecting = status === "connecting";
	const providerLabel = getProviderConfig(cliProvider).name;

	// Claim terminal mount on mount, release on unmount
	useEffect(() => {
		setTerminalMountedIn("preview-panel");
		return () => {
			// Only release if we still own the mount
			if (
				usePtyTerminalStore.getState().terminalMountedIn === "preview-panel"
			) {
				setTerminalMountedIn(null);
			}
		};
	}, [setTerminalMountedIn]);

	useEffect(() => {
		ensureAutoConnected();
	}, [ensureAutoConnected]);

	const statusColor =
		status === "connected"
			? "bg-green-500"
			: status === "connecting"
				? "bg-yellow-500"
				: status === "error"
					? "bg-red-500"
					: "bg-muted-foreground/40";

	return (
		<div className="h-full w-full flex flex-col min-h-0 bg-[#1a1a1a] rounded-sm overflow-hidden">
			{/* Minimal header */}
			<div className="flex items-center justify-between px-3 py-1.5 bg-[#222] border-b border-[#333] shrink-0">
				<div className="flex items-center gap-2">
					<Bot className="size-3.5 text-muted-foreground" />
					<span className="text-xs font-medium text-[#e0e0e0]">
						{providerLabel}
					</span>
					<div
						className={cn("size-2 rounded-full", statusColor)}
						title={status}
					/>
				</div>
				<div className="flex items-center gap-1.5">
					{isConnected ? (
						<Button
							variant="text"
							size="sm"
							onClick={() => disconnect({ userInitiated: true })}
							className="h-6 px-2 text-xs text-[#e0e0e0] hover:bg-[#333]"
						>
							<Square className="size-3 mr-1" />
							Stop
						</Button>
					) : (
						<Button
							variant="text"
							size="sm"
							onClick={() => connect({ manual: true })}
							disabled={isConnecting}
							className="h-6 px-2 text-xs text-[#e0e0e0] hover:bg-[#333]"
						>
							{isConnecting ? (
								<Loader2 className="size-3 mr-1 animate-spin" />
							) : (
								<Play className="size-3 mr-1" />
							)}
							{isConnecting ? "Connecting..." : "Start"}
						</Button>
					)}
				</div>
			</div>

			{/* Terminal or idle state */}
			<div className="flex-1 min-h-0">
				{isConnected && sessionId && activeSessionId ? (
					<TerminalEmulator
						tabId={`preview-${activeSessionId}`}
						sessionId={sessionId}
						isVisible
					/>
				) : (
					<div className="h-full flex flex-col items-center justify-center gap-3 text-[#888]">
						<Bot className="size-8" />
						<p className="text-sm">No agent running</p>
						<Button
							variant="outline"
							size="sm"
							onClick={() => connect({ manual: true })}
							disabled={isConnecting}
							className="border-[#444] text-[#ccc] hover:bg-[#333]"
						>
							{isConnecting ? (
								<>
									<Loader2 className="size-3.5 mr-1.5 animate-spin" />
									Connecting...
								</>
							) : (
								<>
									<Play className="size-3.5 mr-1.5" />
									Start Agent
								</>
							)}
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
