"use client";

import { useState, useRef, useEffect } from "react";
import { handleMediaProcessingError } from "@/lib/debug/error-handler";
import { useFilmstripThumbnails } from "@/hooks/timeline/use-filmstrip-thumbnails";
import { platform } from "@qcut/platform-core";
import { Button } from "../../ui/button";
import {
	MoreVertical,
	Scissors,
	Trash2,
	SplitSquareHorizontal,
	Music,
	ChevronRight,
	ChevronLeft,
	Type,
	Copy,
	FileJson,
	RefreshCw,
	EyeOff,
	Eye,
	Volume2,
	VolumeX,
	Sparkles,
	FolderOpen,
	Download,
	Palette,
} from "lucide-react";
import { useAsyncMediaItems } from "@/hooks/media/use-async-media-store";
import { getFileType, useMediaStore } from "@/stores/media/media-store";
import { useMediaPanelStore } from "@/components/editor/media-panel/store";
import { usePtyTerminalStore } from "@/stores/pty-terminal-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useProjectStore } from "@/stores/project-store";
import { useExportStore } from "@/stores/export-store";
import { usePropertiesPanelStore } from "@/stores/editor/properties-panel-store";
import AudioWaveform from "../audio-waveform";
import { toast } from "sonner";
import { TimelineElementProps, TrackType } from "@/types/timeline";
import { useTimelineElementResize } from "@/hooks/timeline/use-timeline-element-resize";
import { withErrorBoundary } from "@/components/error-boundary";
import { stripMarkdownSyntax } from "@/lib/markdown";
import {
	getTimelineElementDuration,
	getTimelineElementEndTime,
} from "@/lib/timeline";

// Helper function to get display name for element type
function getElementTypeName(element: { type: string }): string {
	switch (element.type) {
		case "text":
			return "text";
		case "captions":
			return "captions";
		case "sticker":
			return "sticker";
		case "markdown":
			return "markdown";
		default:
			return "clip";
	}
}
import {
	getTrackElementClasses,
	TIMELINE_CONSTANTS,
	getTrackHeight,
} from "@/constants/timeline-constants";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "../../ui/dropdown-menu";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
	ContextMenuSub,
	ContextMenuSubTrigger,
	ContextMenuSubContent,
} from "../../ui/context-menu";
import { COLOR_LABELS } from "@/types/generation";
import { getOrCreateObjectURL } from "@/lib/media/blob-manager";
import {
	DEFAULT_MEDIA_COLOR_SETTINGS,
	normalizeMediaColorSettings,
} from "@/lib/color/color-properties";
import { useTimelineClipboardStore } from "@/stores/timeline/timeline-clipboard-store";
import {
	applyTimelineSceneSplits,
	sceneTimelineSplitTimes,
} from "./timeline-smart-split";
import { VideoClipContextMenu } from "./video-clip-context-menu";

function shellQuote({ value }: { value: string }): string {
	return `'${value.replace(/'/g, "'\\''")}'`;
}

function secondsForCli({ value }: { value: number }): string {
	return value.toFixed(3).replace(/\.?0+$/, "");
}

function sourceRangeForElement({
	element,
}: {
	element: { duration: number; trimStart: number; trimEnd: number };
}): { start: number; end: number; duration: number } {
	const start = Math.max(0, element.trimStart);
	const end = Math.max(start, element.duration - element.trimEnd);
	return { start, end, duration: Math.max(0, end - start) };
}

function clipExportFilename({
	name,
	start,
	end,
}: {
	name: string;
	start: number;
	end: number;
}): string {
	const base = name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9._-]+/g, "-");
	return `${base || "clip"}-${secondsForCli({ value: start })}-${secondsForCli({ value: end })}.mp4`;
}

function TimelineElementComponent({
	element,
	track,
	zoomLevel,
	isSelected,
	onElementMouseDown,
	onElementClick,
}: TimelineElementProps) {
	const {
		mediaItems,
		loading: mediaItemsLoading,
		error: mediaItemsError,
	} = useAsyncMediaItems();
	// Use individual selectors to keep snapshots stable and avoid infinite update loops
	const updateElementTrim = useTimelineStore((s) => s.updateElementTrim);
	const updateElementDuration = useTimelineStore(
		(s) => s.updateElementDuration
	);
	const removeElementFromTrack = useTimelineStore(
		(s) => s.removeElementFromTrack
	);
	const removeElementFromTrackWithRipple = useTimelineStore(
		(s) => s.removeElementFromTrackWithRipple
	);
	const dragState = useTimelineStore((s) => s.dragState);
	const splitElement = useTimelineStore((s) => s.splitElement);
	const splitAndKeepLeft = useTimelineStore((s) => s.splitAndKeepLeft);
	const splitAndKeepRight = useTimelineStore((s) => s.splitAndKeepRight);
	const separateAudio = useTimelineStore((s) => s.separateAudio);
	const addElementToTrack = useTimelineStore((s) => s.addElementToTrack);
	const updateMediaElement = useTimelineStore((s) => s.updateMediaElement);
	const pushHistory = useTimelineStore((s) => s.pushHistory);
	const replaceElementMedia = useTimelineStore((s) => s.replaceElementMedia);
	const rippleEditingEnabled = useTimelineStore((s) => s.rippleEditingEnabled);
	const toggleElementHidden = useTimelineStore((s) => s.toggleElementHidden);
	const selectElement = useTimelineStore((s) => s.selectElement);
	const currentTime = usePlaybackStore((s) => s.currentTime);
	const activeProject = useProjectStore((s) => s.activeProject);
	const projectFps = activeProject?.fps ?? 30;
	const updateMediaItem = useMediaStore((s) => s.updateMediaItem);
	const canPasteAttributes = useTimelineClipboardStore(
		(state) => state.mediaAttributes !== null
	);

	const [elementMenuOpen, setElementMenuOpen] = useState(false);

	// Resize & trim helpers – must be declared before any conditional returns
	const {
		resizing,
		isResizing,
		handleResizeStart,
		handleResizeMove,
		handleResizeEnd,
	} = useTimelineElementResize({
		element,
		track,
		zoomLevel,
		onUpdateTrim: updateElementTrim,
		onUpdateDuration: updateElementDuration,
	});

	// Get media item for hook dependency (must be called at top level)
	const mediaItem =
		element.type === "media" || element.type === "sticker"
			? mediaItems.find((item) => item.id === element.mediaId)
			: null;

	// Use the media item URL directly - it's already been converted to blob if needed
	const mediaItemUrl = mediaItem?.url;

	const isAudio = mediaItem?.type === "audio";
	const isVideoClip = element.type === "media" && mediaItem?.type === "video";
	const isMediaClip = element.type === "media";
	const canShowVideoClipActions =
		element.type === "media" && (!mediaItem || mediaItem.type === "video");

	// Compute element dimensions (needed by filmstrip hook, must be before conditional returns)
	const effectiveDuration = getTimelineElementDuration({
		element,
		fps: projectFps,
	});
	const elementWidth = Math.max(
		TIMELINE_CONSTANTS.ELEMENT_MIN_WIDTH,
		effectiveDuration * TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel
	);

	// Viewport-aware filmstrip: only extract frames for visible clips
	const elementRef = useRef<HTMLDivElement>(null);
	const [isVisible, setIsVisible] = useState(true);

	useEffect(() => {
		const el = elementRef.current;
		if (!el) return;
		const observer = new IntersectionObserver(
			([entry]) => setIsVisible(entry.isIntersecting),
			{ threshold: 0 }
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	// Filmstrip thumbnails for video clips
	const filmstrip = useFilmstripThumbnails({
		mediaId: "mediaId" in element ? element.mediaId : "",
		file: mediaItem?.type === "video" ? mediaItem.file : undefined,
		duration: element.duration,
		trimStart: element.trimStart,
		trimEnd: element.trimEnd,
		zoomLevel,
		trackHeight: getTrackHeight(track.type),
		clipWidthPx: elementWidth,
		enabled:
			mediaItem?.type === "video" &&
			mediaItem?.thumbnailStatus === "ready" &&
			isVisible,
	});

	// Log if we have a media item but no URL
	if (mediaItem && !mediaItemUrl) {
		console.warn(`[TimelineElement] Media item ${mediaItem.id} has no URL`);
	}

	// Handle media loading states
	if (mediaItemsError) {
		console.error("Failed to load media items:", mediaItemsError);
		return (
			<div className="absolute bg-red-100 border border-red-300 rounded text-red-600 text-xs p-1">
				Error loading media
			</div>
		);
	}

	if (
		mediaItemsLoading &&
		(element.type === "media" || element.type === "sticker")
	) {
		return (
			<div className="absolute bg-card border border-border rounded text-muted-foreground text-xs p-1">
				Loading media...
			</div>
		);
	}

	// resizing hooks already declared earlier to maintain stable hook order.

	// Use real-time position during drag, otherwise use stored position
	const isBeingDragged = dragState.elementId === element.id;
	const elementStartTime =
		isBeingDragged && dragState.isDragging
			? dragState.currentTime
			: element.startTime;

	// Element should always be positioned at startTime - trimStart only affects content, not position
	const elementLeft = elementStartTime * 50 * zoomLevel;

	const handleElementSplitContext = (e: React.MouseEvent) => {
		e.stopPropagation();
		const effectiveStart = element.startTime;
		const effectiveEnd = getTimelineElementEndTime({ element });

		if (currentTime > effectiveStart && currentTime < effectiveEnd) {
			const secondElementId = splitElement(track.id, element.id, currentTime);
			if (!secondElementId) {
				toast.error("Failed to split element");
			}
		} else {
			toast.error("Playhead must be within element to split");
		}
	};

	const handleSplitAndKeepLeftContext = (e: React.MouseEvent) => {
		e.stopPropagation();
		const effectiveStart = element.startTime;
		const effectiveEnd = getTimelineElementEndTime({ element });
		if (currentTime <= effectiveStart || currentTime >= effectiveEnd) {
			toast.error("Playhead must be within element");
			return;
		}
		splitAndKeepLeft(track.id, element.id, currentTime);
	};

	const handleSplitAndKeepRightContext = (e: React.MouseEvent) => {
		e.stopPropagation();
		const effectiveStart = element.startTime;
		const effectiveEnd = getTimelineElementEndTime({ element });
		if (currentTime <= effectiveStart || currentTime >= effectiveEnd) {
			toast.error("Playhead must be within element");
			return;
		}
		splitAndKeepRight(track.id, element.id, currentTime);
	};

	const handleSeparateAudioContext = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (!isVideoClip) {
			toast.error("Separate audio is only available for video clips");
			return;
		}
		const audioElementId = separateAudio(track.id, element.id);
		if (audioElementId) {
			toast.success("Audio separated to a new track");
			return;
		}
		toast.error("Failed to separate audio");
	};

	const handleElementDuplicateContext = (e: React.MouseEvent) => {
		e.stopPropagation();
		const { id, ...elementWithoutId } = element;
		addElementToTrack(track.id, {
			...elementWithoutId,
			name: element.name + " (copy)",
			startTime: getTimelineElementEndTime({ element }) + 0.1,
		});
	};

	const handleElementDeleteContext = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (rippleEditingEnabled) {
			removeElementFromTrackWithRipple(track.id, element.id);
		} else {
			removeElementFromTrack(track.id, element.id);
		}
	};

	const handleCopyClip = (e: React.MouseEvent) => {
		e.stopPropagation();
		useTimelineClipboardStore.getState().copyClip({
			trackId: track.id,
			trackType: track.type,
			element,
		});
		toast.success("Clip copied");
	};

	const handleCutClip = (e: React.MouseEvent) => {
		e.stopPropagation();
		useTimelineClipboardStore.getState().copyClip({
			trackId: track.id,
			trackType: track.type,
			element,
		});
		if (rippleEditingEnabled) {
			removeElementFromTrackWithRipple(track.id, element.id);
		} else {
			removeElementFromTrack(track.id, element.id);
		}
		toast.success("Clip cut");
	};

	const handleCopyAttributes = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (element.type !== "media") return;
		useTimelineClipboardStore.getState().copyMediaAttributes(element);
		toast.success("Clip attributes copied");
	};

	const handlePasteAttributes = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (element.type !== "media") return;
		const attributes = useTimelineClipboardStore.getState().mediaAttributes;
		if (!attributes) {
			toast.error("Copy clip attributes first");
			return;
		}
		updateMediaElement(track.id, element.id, attributes);
		toast.success("Clip attributes pasted");
	};

	const handleToggleElementHidden = (e: React.MouseEvent) => {
		e.stopPropagation();
		toggleElementHidden(track.id, element.id);
	};

	const handleReplaceClip = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (element.type !== "media") {
			toast.error("Replace is only available for media clips");
			return;
		}

		// Create a file input to select replacement media
		const input = document.createElement("input");
		input.type = "file";
		input.accept = "video/*,audio/*,image/*";

		const cleanup = () => {
			input.remove();
		};

		input.onchange = async (e) => {
			try {
				const file = (e.target as HTMLInputElement).files?.[0];
				if (!file) return;

				const result = await replaceElementMedia(track.id, element.id, file);
				if (result.success) {
					toast.success("Clip replaced successfully");
				} else {
					toast.error(result.error || "Failed to replace clip");
				}
			} catch (error) {
				handleMediaProcessingError(error, "Replace clip", {
					trackId: track.id,
					elementId: element.id,
				});
			} finally {
				cleanup();
			}
		};

		// Cleanup if user cancels the file dialog
		input.oncancel = cleanup;

		input.click();
	};

	const handleOpenFileLocation = async (e: React.MouseEvent) => {
		e.stopPropagation();
		if (!mediaItem?.localPath) {
			toast.error("No local file path available");
			return;
		}
		if (!platform().shell?.showItemInFolder) {
			toast.error("Only available in desktop app");
			return;
		}
		try {
			await platform().shell.showItemInFolder(mediaItem.localPath);
		} catch (error) {
			console.error("Failed to open file location:", error);
			toast.error("Failed to open file location");
		}
	};

	const handleOpenSpeechTools = (e: React.MouseEvent) => {
		e.stopPropagation();
		useMediaPanelStore.getState().setActiveTab("word-timeline");
		toast.info("Opened Smart Speech tools");
	};

	const handleRecognizeSpeech = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (!mediaItem?.localPath) {
			toast.error("Speech recognition needs a local media file");
			return;
		}
		useMediaPanelStore.getState().setActiveTab("word-timeline");
		setTimeout(() => {
			window.dispatchEvent(
				new CustomEvent("qcut:transcribe-media", {
					detail: { filePath: mediaItem.localPath, elementId: element.id },
				})
			);
		}, 0);
	};

	const handleOpenAiPanel = ({
		e,
		mode,
	}: {
		e: React.MouseEvent;
		mode: "text" | "image";
	}) => {
		e.stopPropagation();
		const mediaPanel = useMediaPanelStore.getState();
		mediaPanel.setActiveTab("ai");
		mediaPanel.setAiActiveTab(mode);
	};

	const handleOpenAiAudio = (e: React.MouseEvent) => {
		e.stopPropagation();
		useMediaPanelStore.getState().setActiveTab("sounds");
	};

	const handleOpenLutPanel = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (!canShowVideoClipActions) {
			toast.error("LUT is only available for video clips");
			return;
		}
		selectElement(track.id, element.id, false);
		useExportStore.getState().setPanelView("properties");
		setTimeout(() => {
			window.dispatchEvent(
				new CustomEvent("qcut:open-media-properties-tab", {
					detail: {
						elementId: element.id,
						tab: "adjustments",
						scrollTo: "lut",
					},
				})
			);
		}, 0);
		toast.info("Opened LUT controls");
	};

	const openMediaPropertiesSection = ({
		e,
		tab,
		scrollTo,
	}: {
		e: React.MouseEvent;
		tab: "audio" | "speed";
		scrollTo?: "audio-separation";
	}) => {
		e.stopPropagation();
		selectElement(track.id, element.id, false);
		useExportStore.getState().setPanelView("properties");
		if (tab === "audio") {
			usePropertiesPanelStore.getState().requestAudioPanel({
				elementId: element.id,
				tab: scrollTo === "audio-separation" ? "voice" : "basic",
				section: scrollTo === "audio-separation" ? "separation" : undefined,
			});
		}
		setTimeout(() => {
			window.dispatchEvent(
				new CustomEvent("qcut:open-media-properties-tab", {
					detail: { elementId: element.id, tab },
				})
			);
		}, 0);
	};

	const handleDisableLut = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (element.type !== "media") return;
		const color = normalizeMediaColorSettings({ element });
		updateMediaElement(track.id, element.id, {
			color: {
				...color,
				filter: { ...DEFAULT_MEDIA_COLOR_SETTINGS.filter },
				lut: { ...DEFAULT_MEDIA_COLOR_SETTINGS.lut },
			},
		});
		toast.success("LUT disabled");
	};

	const handleResetSourceRange = (e: React.MouseEvent) => {
		e.stopPropagation();
		updateElementTrim(track.id, element.id, 0, 0);
		toast.success("Source range reset");
	};

	const handleRelinkClip = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (!mediaItem || !activeProject) {
			toast.error("Relink needs an active project and media item");
			return;
		}
		const input = document.createElement("input");
		input.type = "file";
		input.accept = `${mediaItem.type}/*`;
		const cleanup = () => input.remove();
		input.onchange = async (event) => {
			try {
				const file = (event.target as HTMLInputElement).files?.[0];
				if (!file) return;
				if (getFileType(file) !== mediaItem.type) {
					toast.error(`Choose a ${mediaItem.type} file to relink this clip`);
					return;
				}
				const sourcePath = platform().getPathForFile(file);
				if (!sourcePath) {
					toast.error("Unable to resolve the selected file path");
					return;
				}
				const result = await platform().mediaImport.relinkMedia(
					activeProject.id,
					mediaItem.id,
					sourcePath
				);
				if (!result.success) {
					toast.error(result.error || "Failed to relink clip");
					return;
				}
				const updated = await updateMediaItem(activeProject.id, mediaItem.id, {
					file,
					url: getOrCreateObjectURL(file, "timeline-relink"),
					localPath: result.targetPath || sourcePath,
					isLocalFile: true,
					thumbnailUrl: undefined,
					thumbnailStatus: mediaItem.type === "video" ? "pending" : undefined,
					importMetadata: {
						importMethod: result.importMethod || "symlink",
						originalPath: sourcePath,
						importedAt: Date.now(),
						fileSize: result.fileSize ?? file.size,
					},
				});
				if (!updated) {
					toast.error(
						"Relink succeeded on disk but media metadata was not saved"
					);
					return;
				}
				toast.success("Clip relinked");
			} catch (error) {
				handleMediaProcessingError(error, "Relink clip", {
					trackId: track.id,
					elementId: element.id,
				});
			} finally {
				cleanup();
			}
		};
		input.oncancel = cleanup;
		input.click();
	};

	const handleSmartShotSplit = async (e: React.MouseEvent) => {
		e.stopPropagation();
		if (element.type !== "media" || !activeProject || !mediaItem) return;
		const analyzeScenes = platform().claude?.analyze.scenes;
		if (!analyzeScenes) {
			toast.error("Smart shot split is only available in the desktop app");
			return;
		}
		const toastId = toast.loading("Detecting shot boundaries...");
		try {
			const result = await analyzeScenes(activeProject.id, {
				mediaId: mediaItem.id,
				threshold: 0.3,
			});
			const splitTimes = sceneTimelineSplitTimes({
				element,
				scenes: result.scenes,
				fps: projectFps,
			});
			const createdIds = applyTimelineSceneSplits({
				trackId: track.id,
				elementId: element.id,
				splitTimes,
				pushHistory,
				splitElement,
			});
			if (createdIds.length === 0) {
				toast.info("No shot boundaries found inside this clip", {
					id: toastId,
				});
				return;
			}
			toast.success(`Split into ${createdIds.length + 1} shots`, {
				id: toastId,
			});
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Smart shot split failed",
				{ id: toastId }
			);
		}
	};

	const handleExportSelectedClip = async (e: React.MouseEvent) => {
		e.stopPropagation();
		if (!isVideoClip) {
			toast.error("Export selected clip is only available for video clips");
			return;
		}
		if (!mediaItem?.localPath) {
			toast.error("Export selected clip needs a local video file");
			return;
		}
		if (
			!platform().ffmpeg?.exportVideoCLI ||
			!platform().files?.saveFileDialog
		) {
			toast.error("Export selected clip is only available in the desktop app");
			return;
		}

		const range = sourceRangeForElement({ element });
		if (range.duration <= 0) {
			toast.error("Selected clip has no exportable duration");
			return;
		}

		const outputPath = await platform().files.saveFileDialog(
			clipExportFilename({
				name: mediaItem.name || element.name,
				start: range.start,
				end: range.end,
			}),
			[{ name: "MP4 Video", extensions: ["mp4"] }]
		);
		if (!outputPath) return;

		let sessionId: string | null = null;
		try {
			const session = await platform().ffmpeg.createExportSession();
			sessionId = session.sessionId;
			const result = await platform().ffmpeg.exportVideoCLI({
				sessionId,
				width: mediaItem.width ?? 1920,
				height: mediaItem.height ?? 1080,
				fps: mediaItem.fps ?? projectFps,
				quality: "high",
				duration: range.duration,
				useDirectCopy: true,
				videoSources: [
					{
						elementId: element.id,
						path: mediaItem.localPath,
						startTime: 0,
						duration: element.duration,
						trimStart: range.start,
						trimEnd: Math.max(0, element.duration - range.end),
					},
				],
			});
			const tempOutput = result.outputFile ?? result.outputPath;
			if (!result.success || !tempOutput) {
				throw new Error(result.error || "FFmpeg export failed");
			}
			const data = await platform().ffmpeg.readOutputFile(tempOutput);
			if (!data) {
				throw new Error("Export produced no readable output file");
			}
			const saved = await platform().files.writeFile(outputPath, data);
			if (!saved) {
				throw new Error("Failed to write exported clip");
			}
			toast.success("Selected clip exported");
			if (platform().shell?.showItemInFolder) {
				await platform().shell.showItemInFolder(outputPath);
			}
		} catch (error) {
			console.error("Failed to export selected clip:", error);
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to export selected clip"
			);
		} finally {
			if (sessionId) {
				void platform().ffmpeg.cleanupExportSession(sessionId);
			}
		}
	};

	const handleReviewSelectedClip = async (e: React.MouseEvent) => {
		e.stopPropagation();
		if (!isVideoClip) {
			toast.error("AI review is only available for video clips");
			return;
		}
		if (!mediaItem?.localPath) {
			toast.error("AI review needs a local video file");
			return;
		}

		const range = sourceRangeForElement({ element });
		if (range.duration <= 0) {
			toast.error("Selected clip has no reviewable duration");
			return;
		}

		const command = [
			"qcut analyze video",
			`-i ${shellQuote({ value: mediaItem.localPath })}`,
			"--model openrouter_gemini_3_5_flash_video",
			"--analysis-type review",
			"--review-language zh",
			`--start-time ${secondsForCli({ value: range.start })}`,
			`--end-time ${secondsForCli({ value: range.end })}`,
			"--json",
		].join(" ");

		try {
			const terminal = usePtyTerminalStore.getState();
			const tabId = terminal.createSession("shell");
			usePtyTerminalStore.getState().switchSession(tabId);
			usePtyTerminalStore.getState().setCliProvider("shell");
			useMediaPanelStore.getState().setActiveTab("pty");
			await usePtyTerminalStore.getState().connect({
				manual: true,
				command,
			});
			toast.success("Started AI review in Terminal");
		} catch (error) {
			console.error("Failed to start AI review:", error);
			toast.error("Failed to start AI review");
		}
	};

	const renderElementContent = () => {
		if (element.type === "text") {
			return (
				<div className="w-full h-full flex items-center justify-start pl-2">
					<span className="text-xs text-foreground/80 truncate">
						{element.content}
					</span>
				</div>
			);
		}

		if (element.type === "sticker") {
			// Safe fallback: mediaItem is already fetched at line 119
			const thumbnailUrl = mediaItem?.thumbnailUrl || mediaItem?.url;

			return (
				<div className="w-full h-full flex items-center justify-start pl-2 gap-2">
					{thumbnailUrl ? (
						<>
							<img
								src={thumbnailUrl}
								alt={element.name}
								className="h-[calc(100%-8px)] w-auto object-contain rounded pointer-events-none select-none bg-white/10 p-0.5"
								onError={(e) => {
									// Hide image on error and show text fallback
									e.currentTarget.style.display = "none";
								}}
							/>
							<span className="text-xs text-foreground/80 truncate flex-1">
								{element.name}
							</span>
						</>
					) : (
						<span className="text-xs text-foreground/80 truncate">
							{element.name}
						</span>
					)}
				</div>
			);
		}

		if (element.type === "captions") {
			return (
				<div className="w-full h-full flex items-center justify-start pl-2">
					<span className="text-xs text-foreground/80 truncate">
						{element.text}
					</span>
				</div>
			);
		}

		if (element.type === "markdown") {
			const previewText = stripMarkdownSyntax({
				markdown: element.markdownContent || "",
				maxLength: 80,
			});

			return (
				<div className="w-full h-full flex items-center justify-start pl-2">
					<span className="text-xs text-foreground/80 truncate">
						{previewText || "Markdown"}
					</span>
				</div>
			);
		}

		// Render media element -> use outer mediaItem variable
		if (!mediaItem) {
			return (
				<span className="text-xs text-foreground/80 truncate">
					{element.name}
				</span>
			);
		}

		const TILE_ASPECT_RATIO = 16 / 9;

		if (mediaItem.type === "image") {
			// Calculate tile size based on 16:9 aspect ratio
			const trackHeight = getTrackHeight(track.type);
			const tileHeight = trackHeight - 8; // Account for padding
			const tileWidth = tileHeight * TILE_ASPECT_RATIO;

			return (
				<div className="w-full h-full flex items-center justify-center">
					<div className="bg-timeline-clip py-3 w-full h-full relative">
						{/* Background with tiled images */}
						<div
							className="absolute top-3 bottom-3 left-0 right-0"
							style={{
								backgroundImage: mediaItemUrl ? `url(${mediaItemUrl})` : "none",
								backgroundRepeat: "repeat-x",
								backgroundSize: `${tileWidth}px ${tileHeight}px`,
								backgroundPosition: "left center",
								pointerEvents: "none",
							}}
							onError={(e) => {
								console.error(
									"[TimelineElement] Background image failed to load:",
									{
										url: mediaItemUrl,
										elementId: element.id,
										mediaId: "mediaId" in element ? element.mediaId : undefined,
										error: e,
									}
								);
							}}
							aria-label={`Tiled background of ${mediaItem.name}`}
						/>
						{/* Overlay with vertical borders */}
						<div
							className="absolute top-3 bottom-3 left-0 right-0 pointer-events-none"
							style={{
								backgroundImage: `repeating-linear-gradient(
                  to right,
                  transparent 0px,
                  transparent ${tileWidth - 1}px,
                  rgba(255, 255, 255, 0.6) ${tileWidth - 1}px,
                  rgba(255, 255, 255, 0.6) ${tileWidth}px
                )`,
								backgroundPosition: "left center",
							}}
						/>
					</div>
				</div>
			);
		}

		if (mediaItem.type === "video") {
			// Show loading indicator while thumbnail generates
			if (
				mediaItem.thumbnailStatus === "loading" ||
				mediaItem.thumbnailStatus === "pending"
			) {
				return (
					<div className="w-full h-full flex items-center justify-center bg-[var(--color-timeline-video-clip)]">
						<span className="text-xs text-foreground/60 truncate px-2">
							{element.name} (loading...)
						</span>
					</div>
				);
			}

			const { frames, tileWidth, tileHeight } = filmstrip;
			const hasFilmstrip = frames.length > 0;

			// Show filmstrip tiles (or single-thumbnail fallback)
			if (hasFilmstrip || mediaItem.thumbnailUrl) {
				return (
					<div className="w-full h-full flex items-center justify-center">
						<div className="bg-[var(--color-timeline-video-clip)] py-3 w-full h-full relative">
							{/* Filmstrip frame tiles */}
							<div
								className="absolute top-3 bottom-3 left-0 right-0 flex flex-row overflow-hidden pointer-events-none"
								aria-label={`Filmstrip thumbnails of ${mediaItem.name}`}
							>
								{hasFilmstrip ? (
									frames.map((frame, i) => (
										<div
											key={`${frame.time}-${i}`}
											style={{
												width: tileWidth,
												height: tileHeight,
												backgroundImage: `url(${frame.url || mediaItem.thumbnailUrl})`,
												backgroundSize: "cover",
												backgroundPosition: "center",
												flexShrink: 0,
												borderRight:
													i < frames.length - 1
														? "1px solid rgba(255, 255, 255, 0.3)"
														: "none",
											}}
										/>
									))
								) : (
									<div
										className="w-full h-full"
										style={{
											backgroundImage: `url(${mediaItem.thumbnailUrl})`,
											backgroundRepeat: "repeat-x",
											backgroundSize: `${tileWidth}px ${tileHeight}px`,
											backgroundPosition: "left center",
										}}
									/>
								)}
							</div>
						</div>
					</div>
				);
			}

			// Fallback: no thumbnail
			return (
				<div className="w-full h-full flex items-center justify-center bg-[var(--color-timeline-video-clip)]">
					<span className="text-xs text-foreground/80 truncate px-2">
						{element.name}
					</span>
				</div>
			);
		}

		// Render audio element ->
		if (mediaItem.type === "audio") {
			return (
				<div className="w-full h-full flex items-center gap-2">
					<div className="flex-1 min-w-0">
						<AudioWaveform
							audioUrl={mediaItem.url || ""}
							height={24}
							className="w-full"
						/>
					</div>
				</div>
			);
		}

		return (
			<span className="text-xs text-foreground/80 truncate">
				{element.name}
			</span>
		);
	};

	const handleElementMouseDown = (e: React.MouseEvent) => {
		if (onElementMouseDown) {
			onElementMouseDown(e, element);
		}
	};

	return (
		<ContextMenu
			onOpenChange={(open) => {
				if (open && !isSelected) {
					// Defer past Radix's internal state settlement before selecting,
					// otherwise the menu re-closes mid-open.
					setTimeout(() => selectElement(track.id, element.id, false), 0);
				}
			}}
		>
			<ContextMenuTrigger asChild>
				<div
					ref={elementRef}
					className={`absolute top-0 h-full select-none timeline-element ${
						isBeingDragged ? "z-50" : "z-10"
					}`}
					style={{
						left: `${elementLeft}px`,
						width: `${elementWidth}px`,
					}}
					data-element-id={element.id}
					data-track-id={track.id}
					data-testid="timeline-element"
					data-duration={effectiveDuration}
					onMouseMove={resizing ? handleResizeMove : undefined}
					onMouseUp={resizing ? handleResizeEnd : undefined}
					onMouseLeave={resizing ? handleResizeEnd : undefined}
				>
					<div
						className={`relative h-full rounded-[0.15rem] cursor-pointer overflow-hidden ${getTrackElementClasses(
							track.type
						)} ${isSelected ? "border-b-[0.5px] border-t-[0.5px] border-foreground" : ""} ${
							isBeingDragged ? "z-50" : "z-10"
						} ${element.hidden ? "opacity-50" : ""}`}
						onClick={(e) => onElementClick && onElementClick(e, element)}
						onMouseDown={handleElementMouseDown}
					>
						<div className="absolute inset-0 flex items-center h-full">
							{renderElementContent()}
						</div>

						{element.hidden && (
							<div className="absolute inset-0 bg-background/50 flex items-center justify-center pointer-events-none">
								{isAudio ? (
									<VolumeX className="h-6 w-6 text-foreground" />
								) : (
									<EyeOff className="h-6 w-6 text-foreground" />
								)}
							</div>
						)}

						{isSelected && (
							<>
								<div
									className="absolute left-0 top-0 bottom-0 w-3 cursor-w-resize bg-transparent hover:bg-foreground/20 border-r-2 border-foreground/50 z-50 before:absolute before:inset-y-0 before:-left-4 before:w-8 before:content-[''] touch-action-none"
									onPointerDown={(e) =>
										handleResizeStart(e, element.id, "left")
									}
									data-testid="trim-start-handle"
								/>
								<div
									className="absolute right-0 top-0 bottom-0 w-3 cursor-e-resize bg-transparent hover:bg-foreground/20 border-l-2 border-foreground/50 z-50 before:absolute before:inset-y-0 before:-right-4 before:w-8 before:content-[''] touch-action-none"
									onPointerDown={(e) =>
										handleResizeStart(e, element.id, "right")
									}
								/>
							</>
						)}
						{/* Color label dot */}
						{element.colorLabel && (
							<div
								className="absolute top-0.5 right-1 h-2 w-2 rounded-full pointer-events-none z-20"
								style={{
									backgroundColor:
										COLOR_LABELS.find((c) => c.value === element.colorLabel)
											?.color || "transparent",
								}}
							/>
						)}
					</div>
				</div>
			</ContextMenuTrigger>
			{isVideoClip ? (
				<VideoClipContextMenu
					isDisabled={element.hidden === true}
					canPasteAttributes={canPasteAttributes}
					hasLocalFile={Boolean(mediaItem?.localPath)}
					actions={{
						copy: handleCopyClip,
						cut: handleCutClip,
						copyAttributes: handleCopyAttributes,
						pasteAttributes: handlePasteAttributes,
						remove: handleElementDeleteContext,
						duplicate: handleElementDuplicateContext,
						split: handleElementSplitContext,
						keepLeft: handleSplitAndKeepLeftContext,
						keepRight: handleSplitAndKeepRightContext,
						smartShotSplit: handleSmartShotSplit,
						openAiTextVideo: (e) => handleOpenAiPanel({ e, mode: "text" }),
						openAiImageVideo: (e) => handleOpenAiPanel({ e, mode: "image" }),
						openAiAudio: handleOpenAiAudio,
						review: handleReviewSelectedClip,
						openSmartSpeech: handleOpenSpeechTools,
						recognizeSpeech: handleRecognizeSpeech,
						openVoiceSeparation: (e) =>
							openMediaPropertiesSection({
								e,
								tab: "audio",
								scrollTo: "audio-separation",
							}),
						separateAudio: handleSeparateAudioContext,
						exportClip: handleExportSelectedClip,
						toggleDisabled: handleToggleElementHidden,
						relink: handleRelinkClip,
						replace: handleReplaceClip,
						openLut: handleOpenLutPanel,
						disableLut: handleDisableLut,
						openFileLocation: handleOpenFileLocation,
						resetRange: handleResetSourceRange,
						openSpeed: (e) => openMediaPropertiesSection({ e, tab: "speed" }),
					}}
				/>
			) : (
				<ContextMenuContent className="z-200">
					<ContextMenuItem onClick={handleElementSplitContext}>
						<Scissors className="h-4 w-4 mr-2" />
						Split at playhead
					</ContextMenuItem>
					<ContextMenuItem onClick={handleToggleElementHidden}>
						{isAudio ? (
							element.hidden ? (
								<Volume2 className="h-4 w-4 mr-2" />
							) : (
								<VolumeX className="h-4 w-4 mr-2" />
							)
						) : element.hidden ? (
							<Eye className="h-4 w-4 mr-2" />
						) : (
							<EyeOff className="h-4 w-4 mr-2" />
						)}
						<span>
							{isAudio
								? element.hidden
									? "Unmute"
									: "Mute"
								: element.hidden
									? "Show"
									: "Hide"}{" "}
							{getElementTypeName(element)}
						</span>
					</ContextMenuItem>
					<ContextMenuItem onClick={handleElementDuplicateContext}>
						<Copy className="h-4 w-4 mr-2" />
						Duplicate {getElementTypeName(element)}
					</ContextMenuItem>
					{element.type === "media" && (
						<ContextMenuItem onClick={handleReplaceClip}>
							<RefreshCw className="h-4 w-4 mr-2" />
							Replace clip
						</ContextMenuItem>
					)}
					{isMediaClip && (
						<>
							<ContextMenuSeparator />
							{canShowVideoClipActions && (
								<ContextMenuItem onClick={handleReviewSelectedClip}>
									<Sparkles className="h-4 w-4 mr-2" />
									AI Review Selected Clip
								</ContextMenuItem>
							)}
							{(canShowVideoClipActions || isAudio) && (
								<ContextMenuItem onClick={handleOpenSpeechTools}>
									<Type className="h-4 w-4 mr-2" />
									Recognize Speech / Captions
								</ContextMenuItem>
							)}
						</>
					)}
					<ContextMenuSeparator />
					<ContextMenuItem onClick={handleSplitAndKeepLeftContext}>
						<SplitSquareHorizontal className="h-4 w-4 mr-2" />
						Split and Keep Left
					</ContextMenuItem>
					<ContextMenuItem onClick={handleSplitAndKeepRightContext}>
						<SplitSquareHorizontal className="h-4 w-4 mr-2" />
						Split and Keep Right
					</ContextMenuItem>
					{canShowVideoClipActions && (
						<ContextMenuItem onClick={handleSeparateAudioContext}>
							<Music className="h-4 w-4 mr-2" />
							Separate Audio
						</ContextMenuItem>
					)}
					{canShowVideoClipActions && (
						<ContextMenuItem onClick={handleExportSelectedClip}>
							<Download className="h-4 w-4 mr-2" />
							Export Selected Clip
						</ContextMenuItem>
					)}
					{canShowVideoClipActions && (
						<ContextMenuItem onClick={handleOpenLutPanel}>
							<Palette className="h-4 w-4 mr-2" />
							LUT / Color
						</ContextMenuItem>
					)}
					{mediaItem?.localPath && (
						<ContextMenuItem onClick={handleOpenFileLocation}>
							<FolderOpen className="h-4 w-4 mr-2" />
							Open File Location
						</ContextMenuItem>
					)}
					{/* AI Tools — shown for AI-generated clips */}
					{element.type === "media" &&
						(() => {
							const media = mediaItems.find((m) => m.id === element.mediaId);
							const genParams = media?.metadata?.generationParams;
							const takes = media?.metadata?.takes as
								| Array<{ url: string; createdAt: number }>
								| undefined;
							const activeTakeIdx =
								(media?.metadata?.activeTakeIndex as number) ?? 0;
							const hasTakes = takes && takes.length > 1;

							if (!genParams) return null;

							return (
								<>
									<ContextMenuSeparator />
									<ContextMenuItem
										onClick={() => {
											window.dispatchEvent(
												new CustomEvent("gap:generate", {
													detail: {
														gap: {
															trackId: track.id,
															startTime: element.startTime,
															endTime: getTimelineElementEndTime({
																element,
																fps: projectFps,
															}),
														},
														mode: genParams.mode || "text-to-video",
														prompt: genParams.prompt || "",
														model: genParams.model || "fal-ai/ltx-video/v0.2.3",
														cameraMotion: genParams.cameraMotion,
													},
												})
											);
										}}
									>
										<Sparkles className="h-4 w-4 mr-2" />
										Regenerate Shot
									</ContextMenuItem>
									{hasTakes && (
										<div className="flex items-center gap-1 px-2 py-1.5">
											<button
												type="button"
												aria-label="Previous take"
												className="p-0.5 rounded hover:bg-accent"
												onClick={(e) => {
													e.stopPropagation();
													const { setActiveTake } = useMediaStore.getState();
													if (setActiveTake && media) {
														setActiveTake(media.id, activeTakeIdx - 1);
													}
												}}
											>
												<ChevronLeft className="h-3 w-3" />
											</button>
											<span className="text-xs text-muted-foreground">
												Take: {activeTakeIdx + 1}/{takes.length}
											</span>
											<button
												type="button"
												aria-label="Next take"
												className="p-0.5 rounded hover:bg-accent"
												onClick={(e) => {
													e.stopPropagation();
													const { setActiveTake } = useMediaStore.getState();
													if (setActiveTake && media) {
														setActiveTake(media.id, activeTakeIdx + 1);
													}
												}}
											>
												<ChevronRight className="h-3 w-3" />
											</button>
										</div>
									)}
								</>
							);
						})()}
					<ContextMenuSeparator />
					<ContextMenuItem
						onClick={async (e) => {
							e.stopPropagation();
							const info = {
								...element,
								endTime: getTimelineElementEndTime({ element }),
								trackId: track.id,
							};
							try {
								await navigator.clipboard.writeText(
									JSON.stringify(info, null, 2)
								);
								toast.success("Element info copied to clipboard");
							} catch (error) {
								console.error("Failed to copy element info:", error);
								toast.error("Failed to copy element info");
							}
						}}
					>
						<FileJson className="h-4 w-4 mr-2" />
						Copy Element Info
					</ContextMenuItem>
					<ContextMenuItem
						onClick={async (e) => {
							e.stopPropagation();
							try {
								await navigator.clipboard.writeText(element.id);
								toast.success("Element ID copied");
							} catch (error) {
								console.error("Failed to copy element ID:", error);
								toast.error("Failed to copy element ID");
							}
						}}
					>
						<Copy className="h-4 w-4 mr-2" />
						Copy Element ID
					</ContextMenuItem>
					{/* Color Labels */}
					<ContextMenuSub>
						<ContextMenuSubTrigger>
							<div className="flex items-center gap-2">
								{element.colorLabel && (
									<div
										className="h-3 w-3 rounded-full"
										style={{
											backgroundColor:
												COLOR_LABELS.find((c) => c.value === element.colorLabel)
													?.color || "transparent",
										}}
									/>
								)}
								<span>Color Label</span>
							</div>
						</ContextMenuSubTrigger>
						<ContextMenuSubContent>
							<ContextMenuItem
								onClick={() => {
									const store = useTimelineStore.getState();
									store.pushHistory();
									const newTracks = store._tracks.map((t) => ({
										...t,
										elements: t.elements.map((el) =>
											el.id === element.id
												? { ...el, colorLabel: undefined }
												: el
										),
									}));
									store.restoreTracks(newTracks);
								}}
							>
								No Label
							</ContextMenuItem>
							{COLOR_LABELS.map(({ value, color }) => (
								<ContextMenuItem
									key={value}
									onClick={() => {
										const store = useTimelineStore.getState();
										store.pushHistory();
										const newTracks = store._tracks.map((t) => ({
											...t,
											elements: t.elements.map((el) =>
												el.id === element.id ? { ...el, colorLabel: value } : el
											),
										}));
										store.restoreTracks(newTracks);
									}}
								>
									<div
										className="h-3 w-3 rounded-full mr-2"
										style={{ backgroundColor: color }}
									/>
									<span className="capitalize">{value}</span>
								</ContextMenuItem>
							))}
						</ContextMenuSubContent>
					</ContextMenuSub>
					<ContextMenuSeparator />
					<ContextMenuItem
						onClick={handleElementDeleteContext}
						className="text-destructive focus:text-destructive"
					>
						<Trash2 className="h-4 w-4 mr-2" />
						Delete {getElementTypeName(element)}
					</ContextMenuItem>
				</ContextMenuContent>
			)}
		</ContextMenu>
	);
}

// Error Fallback Component for Timeline Elements
const TimelineElementErrorFallback = ({
	resetError,
}: {
	resetError: () => void;
}) => (
	<div className="h-12 bg-destructive/10 border border-destructive/20 rounded flex items-center justify-center text-sm text-destructive">
		<span className="mr-2">⚠️ Element Error</span>
		<button
			onClick={resetError}
			className="underline hover:no-underline"
			type="button"
		>
			Retry
		</button>
	</div>
);

// Export wrapped component with error boundary
export const TimelineElement = withErrorBoundary(TimelineElementComponent, {
	isolate: true, // Only affects this element, not the entire timeline
	fallback: TimelineElementErrorFallback,
});
