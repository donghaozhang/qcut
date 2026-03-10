"use client";

import { Button } from "@/components/ui/button";
import { useErrorReporter } from "@/hooks/use-error-reporter";
import {
	getCachedScreenRecordingStatus,
	getScreenRecordingStatus,
	registerScreenRecordingE2EBridge,
	startScreenRecording,
	stopScreenRecording,
	subscribeToScreenRecordingStatus,
} from "@/lib/project/screen-recording-controller";
import { Circle, Loader2, Square } from "lucide-react";
import {
	useCallback,
	useEffect,
	useMemo,
	useState,
	type KeyboardEvent,
} from "react";
import { toast } from "sonner";
import type { ScreenRecordingStatus } from "@/types/electron";

const RECORDING_SHORTCUT_KEY = "r";

function formatDurationLabel({ durationMs }: { durationMs: number }): string {
	try {
		const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
		const minutes = Math.floor(totalSeconds / 60)
			.toString()
			.padStart(2, "0");
		const seconds = (totalSeconds % 60).toString().padStart(2, "0");
		return `${minutes}:${seconds}`;
	} catch {
		return "00:00";
	}
}

function isEditableTarget({ target }: { target: EventTarget | null }): boolean {
	if (!(target instanceof HTMLElement)) {
		return false;
	}

	if (target.isContentEditable) {
		return true;
	}

	const tagName = target.tagName.toLowerCase();
	return tagName === "input" || tagName === "textarea" || tagName === "select";
}

export function ScreenRecordingControl() {
	const reportError = useErrorReporter("ScreenRecordingControl");
	const [status, setStatus] = useState<ScreenRecordingStatus | null>(
		getCachedScreenRecordingStatus()
	);
	const [isBusy, setIsBusy] = useState(false);
	const [tickMs, setTickMs] = useState(Date.now());

	const refreshStatus = useCallback(async (): Promise<void> => {
		try {
			const nextStatus = await getScreenRecordingStatus();
			setStatus(nextStatus);
		} catch (error) {
			reportError(error, "refresh status", { showToast: false });
		}
	}, [reportError]);

	useEffect(() => {
		try {
			registerScreenRecordingE2EBridge();
			const unsubscribe = subscribeToScreenRecordingStatus({
				listener: (nextStatus) => {
					setStatus(nextStatus);
				},
			});
			refreshStatus().catch(() => {});
			return () => {
				try {
					unsubscribe();
				} catch (error) {
					reportError(error, "unsubscribe from status events", {
						showToast: false,
					});
				}
			};
		} catch (error) {
			reportError(error, "initialize recording bridge", { showToast: false });
			return () => {};
		}
	}, [refreshStatus, reportError]);

	useEffect(() => {
		if (!status?.recording) {
			return;
		}

		const intervalId = window.setInterval(() => {
			setTickMs(Date.now());
		}, 1000);

		return () => {
			window.clearInterval(intervalId);
		};
	}, [status?.recording]);

	const elapsedLabel = useMemo(() => {
		if (!status?.recording || !status?.startedAt) {
			return "00:00";
		}
		const durationMs = Math.max(0, tickMs - status?.startedAt);
		return formatDurationLabel({ durationMs });
	}, [status?.recording, status?.startedAt, tickMs]);

	const handleToggleRecording = useCallback(async (): Promise<void> => {
		if (isBusy) {
			return;
		}

		setIsBusy(true);
		try {
			if (status?.recording) {
				const stopResult = await stopScreenRecording();
				if (stopResult.filePath) {
					toast("Screen recording saved", {
						description: stopResult.filePath,
					});
				} else {
					toast("Screen recording stopped");
				}
			} else {
				const startResult = await startScreenRecording();
				toast("Screen recording started", {
					description: `Saving to ${startResult.filePath}`,
				});
			}
			await refreshStatus();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Unknown recording error";
			toast("Screen recording failed", {
				description: message,
			});
			reportError(error, "toggle recording", { showToast: false });
		} finally {
			setIsBusy(false);
		}
	}, [isBusy, refreshStatus, status?.recording, reportError]);

	const handleButtonKeyDown = useCallback(
		({ key }: KeyboardEvent<HTMLButtonElement>): void => {
			try {
				if (key === "Enter" || key === " ") {
					return;
				}
			} catch (error) {
				reportError(error, "button key handler", { showToast: false });
			}
		},
		[reportError]
	);

	const handleGlobalShortcut = useCallback(
		({
			key,
			ctrlKey,
			metaKey,
			shiftKey,
			target,
			preventDefault,
		}: globalThis.KeyboardEvent): void => {
			try {
				const hasModifier = ctrlKey || metaKey;
				const shortcutMatches =
					hasModifier &&
					shiftKey &&
					key.toLowerCase() === RECORDING_SHORTCUT_KEY &&
					!isEditableTarget({ target });

				if (!shortcutMatches) {
					return;
				}

				preventDefault();
				handleToggleRecording().catch(() => {});
			} catch (error) {
				reportError(error, "global shortcut handler", { showToast: false });
			}
		},
		[handleToggleRecording, reportError]
	);

	useEffect(() => {
		try {
			window.addEventListener("keydown", handleGlobalShortcut);
			return () => {
				try {
					window.removeEventListener("keydown", handleGlobalShortcut);
				} catch (error) {
					reportError(error, "unregister keyboard shortcut", {
						showToast: false,
					});
				}
			};
		} catch (error) {
			reportError(error, "register keyboard shortcut", { showToast: false });
			return () => {};
		}
	}, [handleGlobalShortcut, reportError]);

	const recordingActive = status?.recording;
	const buttonLabel = recordingActive ? `REC ${elapsedLabel}` : "Record";

	return (
		<Button
			type="button"
			size="sm"
			variant="outline"
			className={
				recordingActive
					? "h-7 text-xs border-red-500/60 text-red-500 hover:bg-red-500/10 hover:text-red-400"
					: "h-7 text-xs"
			}
			onClick={() => {
				handleToggleRecording().catch(() => {});
			}}
			onKeyDown={handleButtonKeyDown}
			disabled={isBusy}
			data-testid="screen-recording-toggle-button"
			aria-label={recordingActive ? "Stop recording" : "Start recording"}
			title={
				recordingActive
					? "Stop screen recording (Ctrl/Cmd + Shift + R)"
					: "Start screen recording (Ctrl/Cmd + Shift + R)"
			}
		>
			{isBusy ? (
				<Loader2 className="h-4 w-4 animate-spin" />
			) : recordingActive ? (
				<Square className="h-4 w-4 fill-current" />
			) : (
				<Circle className="h-4 w-4" />
			)}
			<span className="text-sm">{buttonLabel}</span>
		</Button>
	);
}
