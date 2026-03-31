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
import { Circle, Loader2, Mic, MicOff, Square } from "lucide-react";
import {
	useCallback,
	useEffect,
	useMemo,
	useState,
	type KeyboardEvent,
} from "react";
import { toast } from "sonner";
import type { ScreenRecordingStatus } from "@/types/electron";
import { useScreenRecordingEnhancementStore } from "@/stores/screen-recording-store";
import { getAudioInputDevices } from "@/lib/screen-recording/audio-capture";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";

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
		<div className="flex items-center gap-1">
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
			<MicPopover disabled={!!recordingActive || isBusy} />
		</div>
	);
}

function MicPopover({ disabled }: { disabled: boolean }) {
	const micEnabled = useScreenRecordingEnhancementStore((s) => s.micEnabled);
	const setMicEnabled = useScreenRecordingEnhancementStore(
		(s) => s.setMicEnabled
	);
	const micDeviceId = useScreenRecordingEnhancementStore((s) => s.micDeviceId);
	const setMicDeviceId = useScreenRecordingEnhancementStore(
		(s) => s.setMicDeviceId
	);
	const micGain = useScreenRecordingEnhancementStore((s) => s.micGain);
	const setMicGain = useScreenRecordingEnhancementStore((s) => s.setMicGain);
	const systemAudioEnabled = useScreenRecordingEnhancementStore(
		(s) => s.systemAudioEnabled
	);
	const setSystemAudioEnabled = useScreenRecordingEnhancementStore(
		(s) => s.setSystemAudioEnabled
	);

	const [devices, setDevices] = useState<{ deviceId: string; label: string }[]>(
		[]
	);
	const [open, setOpen] = useState(false);

	useEffect(() => {
		if (!open) return;
		getAudioInputDevices()
			.then(setDevices)
			.catch(() => setDevices([]));
	}, [open]);

	const MicIcon = micEnabled ? Mic : MicOff;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					size="sm"
					variant="outline"
					className={`h-7 w-7 p-0 ${micEnabled ? "border-blue-500/60 text-blue-500" : ""}`}
					disabled={disabled}
					aria-label={micEnabled ? "Microphone on" : "Microphone off"}
					data-testid="mic-toggle-button"
				>
					<MicIcon className="h-3.5 w-3.5" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-64 p-3 space-y-3" align="end">
				{/* Mic toggle */}
				<div className="flex items-center justify-between">
					<span className="text-xs font-medium">Microphone</span>
					<Switch
						checked={micEnabled}
						onCheckedChange={setMicEnabled}
						aria-label="Toggle microphone"
					/>
				</div>

				{/* Device selector */}
				{micEnabled && devices.length > 0 && (
					<div className="space-y-1">
						<button
							type="button"
							className={`w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted/50 transition-colors ${
								micDeviceId === null ? "bg-muted font-medium" : ""
							}`}
							onClick={() => setMicDeviceId(null)}
						>
							System default
						</button>
						{devices.map((d) => (
							<button
								key={d.deviceId}
								type="button"
								className={`w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted/50 transition-colors ${
									micDeviceId === d.deviceId ? "bg-muted font-medium" : ""
								}`}
								onClick={() => setMicDeviceId(d.deviceId)}
							>
								{d.label}
							</button>
						))}
					</div>
				)}

				{/* Gain slider */}
				{micEnabled && (
					<div className="space-y-1">
						<span className="text-xs text-muted-foreground">Gain</span>
						<div className="flex items-center gap-2">
							<Slider
								min={0}
								max={5}
								step={0.1}
								value={[micGain]}
								onValueChange={([v]) => setMicGain(v)}
								className="flex-1"
							/>
							<span className="text-xs text-muted-foreground w-8 text-right">
								{micGain.toFixed(1)}x
							</span>
						</div>
					</div>
				)}

				{/* System audio */}
				<div className="flex items-center justify-between pt-1 border-t border-border/50">
					<span className="text-xs font-medium">System audio</span>
					<Switch
						checked={systemAudioEnabled}
						onCheckedChange={setSystemAudioEnabled}
						aria-label="Toggle system audio"
					/>
				</div>
			</PopoverContent>
		</Popover>
	);
}
