"use client";

import { useCallback, useRef } from "react";
import { useDragDrop } from "@/hooks/use-drag-drop";
import { Upload, Loader2, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { isMediaFile, isJsonFile } from "./helpers";
import { debugLog, debugError, debugWarn } from "@/lib/debug/debug-config";
import { platform } from "@qcut/platform-core";

export interface DropZoneProps {
	onJsonSelect: (file: File) => void;
	onMediaSelect: (filePath: string) => void;
	isLoading: boolean;
	isTranscribing: boolean;
	transcriptionProgress: string;
}

/** Drag-and-drop zone for importing JSON transcription or media files. */
export function DropZone({
	onJsonSelect,
	onMediaSelect,
	isLoading,
	isTranscribing,
	transcriptionProgress,
}: DropZoneProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleDrop = useCallback(
		(files: FileList) => {
			debugLog("[WordTimeline] handleDrop called");
			debugLog("[WordTimeline] Files count:", files.length);
			try {
				const file = files[0];
				if (!file) {
					debugLog("[WordTimeline] No file found in drop");
					return;
				}

				// Use webUtils.getPathForFile via preload (Electron 37+ removed File.path)
				const filePath = platform().getPathForFile?.(file) ?? undefined;

				debugLog("[WordTimeline] File dropped:", {
					name: file.name,
					type: file.type,
					size: file.size,
					path: filePath,
				});

				if (isJsonFile(file.name)) {
					debugLog("[WordTimeline] Detected JSON file, calling onJsonSelect");
					onJsonSelect(file);
				} else if (isMediaFile(file.name)) {
					debugLog("[WordTimeline] Detected media file");
					debugLog("[WordTimeline] File path from Electron:", filePath);
					if (filePath) {
						debugLog(
							"[WordTimeline] Calling onMediaSelect with path:",
							filePath
						);
						onMediaSelect(filePath);
					} else {
						debugError(
							"[WordTimeline] No file path available - not running in Electron?"
						);
						toast.error("Media transcription requires the desktop app");
					}
				} else {
					debugWarn(
						"[WordTimeline] Unsupported file type:",
						file.name,
						file.type
					);
					toast.error(
						"Unsupported file type. Drop JSON or media files (MP4, WAV, MP3, etc.)"
					);
				}
			} catch (err) {
				debugError("[WordTimeline] Error processing dropped file:", err);
				toast.error("Unable to process the dropped file");
			}
		},
		[onJsonSelect, onMediaSelect]
	);

	const { isDragOver, dragProps } = useDragDrop({ onDrop: handleDrop });

	const handleClick = useCallback(async () => {
		debugLog("[WordTimeline] handleClick called (file picker button)");
		try {
			// Use Electron's native file dialog to get the file path
			debugLog("[WordTimeline] Checking for file dialog API...");
			debugLog(
				"[WordTimeline] openFileDialog exists:",
				!!platform().files.openFileDialog
			);

			if (platform().files.openFileDialog) {
				debugLog("[WordTimeline] Opening native file dialog...");
				const dialogResult = await platform().files.openFileDialog();

				debugLog("[WordTimeline] File dialog result:", dialogResult);
				debugLog("[WordTimeline] Result type:", typeof dialogResult);

				// Handle both string (expected) and object (raw dialog result) formats
				let filePath: string | null = null;
				if (typeof dialogResult === "string") {
					filePath = dialogResult;
				} else if (dialogResult && typeof dialogResult === "object") {
					// Raw dialog result object - extract filePath
					const rawResult = dialogResult as {
						canceled?: boolean;
						filePaths?: string[];
					};
					debugLog("[WordTimeline] Raw dialog object:", rawResult);
					if (
						!rawResult.canceled &&
						rawResult.filePaths &&
						rawResult.filePaths.length > 0
					) {
						filePath = rawResult.filePaths[0];
					}
				}

				debugLog("[WordTimeline] Extracted file path:", filePath);

				if (!filePath) {
					debugLog(
						"[WordTimeline] No file selected (dialog cancelled or empty)"
					);
					return;
				}

				const fileName = filePath.split(/[/\\]/).pop() || "";
				debugLog("[WordTimeline] Selected file name:", fileName);

				if (isJsonFile(fileName)) {
					debugLog("[WordTimeline] JSON file detected, reading content...");
					// For JSON, we need to read the file content
					if (!platform().files.readFile) {
						debugError("[WordTimeline] readFile API not available");
						toast.error("File reading not available");
						return;
					}
					const buffer = await platform().files.readFile(filePath);
					debugLog(
						"[WordTimeline] File buffer received, size:",
						buffer?.length
					);
					if (buffer) {
						const uint8Array = new Uint8Array(buffer);
						const blob = new Blob([uint8Array], { type: "application/json" });
						const file = new File([blob], fileName, {
							type: "application/json",
						});
						debugLog("[WordTimeline] Calling onJsonSelect with File object");
						onJsonSelect(file);
					}
				} else if (isMediaFile(fileName)) {
					debugLog("[WordTimeline] Media file detected, calling onMediaSelect");
					debugLog("[WordTimeline] File path:", filePath);
					onMediaSelect(filePath);
				} else {
					debugWarn("[WordTimeline] Unsupported file type:", fileName);
					toast.error("Unsupported file type. Select JSON or media files.");
				}
			} else {
				debugLog(
					"[WordTimeline] File dialog not available, using HTML file input"
				);
				fileInputRef.current?.click();
			}
		} catch (err) {
			debugError("[WordTimeline] Error in handleClick:", err);
			toast.error("Unable to open the file picker");
		}
	}, [onJsonSelect, onMediaSelect]);

	const handleFileChange = useCallback(
		({ target }: React.ChangeEvent<HTMLInputElement>) => {
			try {
				const file = target.files?.[0];
				if (!file) {
					return;
				}

				if (isJsonFile(file.name)) {
					onJsonSelect(file);
				} else if (isMediaFile(file.name)) {
					// HTML file input doesn't provide file.path, need Electron dialog
					toast.error("Please use the file picker button for media files");
				}
			} catch {
				toast.error("Unable to read the selected file");
			}
		},
		[onJsonSelect]
	);

	const handleDropZoneKeyDown = useCallback(
		({ key, nativeEvent }: React.KeyboardEvent<HTMLButtonElement>) => {
			try {
				const isActivationKey =
					key === "Enter" || key === " " || key === "Spacebar";
				if (!isActivationKey) {
					return;
				}

				nativeEvent.preventDefault();
				handleClick();
			} catch {
				toast.error("Unable to open the file picker");
			}
		},
		[handleClick]
	);

	const isBusy = isLoading || isTranscribing;

	return (
		<div className="flex-1 flex items-center justify-center p-4" {...dragProps}>
			<input
				ref={fileInputRef}
				type="file"
				accept=".json,.mp4,.mov,.avi,.mkv,.webm,.wav,.mp3,.m4a,.aac"
				onChange={handleFileChange}
				className="hidden"
			/>
			<button
				type="button"
				onClick={handleClick}
				onKeyDown={handleDropZoneKeyDown}
				disabled={isBusy}
				className={cn(
					"border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all w-full max-w-sm",
					"hover:border-primary hover:bg-primary/5",
					isDragOver
						? "border-primary bg-primary/10 scale-105"
						: "border-muted-foreground/25",
					isBusy && "pointer-events-none opacity-50"
				)}
			>
				{isTranscribing ? (
					<>
						<Loader2 className="w-12 h-12 mx-auto mb-4 text-primary animate-spin">
							<title>Transcribing</title>
						</Loader2>
						<p className="text-sm text-primary font-medium">
							{transcriptionProgress || "Transcribing..."}
						</p>
						<p className="text-xs text-muted-foreground mt-2">
							This may take a moment depending on audio length
						</p>
					</>
				) : isLoading ? (
					<>
						<Loader2 className="w-12 h-12 mx-auto mb-4 text-primary animate-spin">
							<title>Loading</title>
						</Loader2>
						<p className="text-sm text-muted-foreground">Loading...</p>
					</>
				) : (
					<>
						<div className="flex justify-center gap-2 mb-4">
							<Upload className="w-10 h-10 text-muted-foreground">
								<title>Upload</title>
							</Upload>
							<Mic className="w-10 h-10 text-muted-foreground">
								<title>Transcribe</title>
							</Mic>
						</div>
						<p className="text-sm text-muted-foreground">
							Drop media or JSON file here, or click to select
						</p>
						<p className="text-xs text-muted-foreground/70 mt-2">
							Supports: MP4, MOV, WAV, MP3, JSON
						</p>
						<p className="text-xs text-muted-foreground/70 mt-1">
							Media files will be transcribed with ElevenLabs
						</p>
					</>
				)}
			</button>
		</div>
	);
}
