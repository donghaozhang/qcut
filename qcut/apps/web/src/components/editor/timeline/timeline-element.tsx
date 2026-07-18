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
	SlidersHorizontal,
	Link2,
	Camera,
	Clapperboard,
} from "lucide-react";
import { useAsyncMediaItems } from "@/hooks/media/use-async-media-store";
import { getFileType, useMediaStore } from "@/stores/media/media-store";
import { useMediaPanelStore } from "@/components/editor/media-panel/store";
import { usePtyTerminalStore } from "@/stores/pty-terminal-store";
import { useCloudTaskStore } from "@/stores/cloud-task-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useProjectStore } from "@/stores/project-store";
import { useExportStore } from "@/stores/export-store";
import { usePropertiesPanelStore } from "@/stores/editor/properties-panel-store";
import AudioWaveform from "../audio-waveform";
import { toast } from "sonner";
import { TimelineElementProps, TrackType } from "@/types/timeline";
import { useTimelineElementResize } from "@/hooks/timeline/use-timeline-element-resize";
import { useTimelinePrecisionEdit } from "@/hooks/timeline/use-timeline-precision-edit";
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
		case "adjustment":
			return "adjustment layer";
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
	rollbackTimelineSceneSplits,
	sceneTimelineSplitTimes,
} from "./timeline-smart-split";
import { VideoClipContextMenu } from "./video-clip-context-menu";
import { TimelineElementTaskBadge } from "./timeline-element-task-badge";
import {
	loadClipAttributePresets,
	saveClipAttributePreset,
} from "@/lib/timeline/clip-attribute-presets";
import { alignMediaElementsByAudio } from "@/lib/audio/audio-alignment";
import { registerCloudTaskRuntimeActions } from "@/lib/cloud-tasks/task-runtime-actions";
import { useVideoEditRequestStore } from "@/stores/video-edit-request-store";
import { useTranslation } from "@/lib/i18n";
import { localizeTimelineElementName } from "@/lib/i18n/timeline-names";

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
	const { locale, t } = useTranslation();
	const displayName = localizeTimelineElementName({
		name: element.name,
		locale,
	});
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
	const updateElementStartTime = useTimelineStore(
		(s) => s.updateElementStartTime
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
	const selectedElements = useTimelineStore((s) => s.selectedElements);
	const groupSelectedElements = useTimelineStore(
		(s) => s.groupSelectedElements
	);
	const ungroupElements = useTimelineStore((s) => s.ungroupElements);
	const createMediaContainerFromSelection = useTimelineStore(
		(s) => s.createMediaContainerFromSelection
	);
	const breakApartMediaContainer = useTimelineStore(
		(s) => s.breakApartMediaContainer
	);
	const selectMulticamClip = useTimelineStore((s) => s.selectMulticamClip);
	const activeProject = useProjectStore((s) => s.activeProject);
	const projectFps = activeProject?.fps ?? 30;
	const updateMediaItem = useMediaStore((s) => s.updateMediaItem);
	const canPasteAttributes = useTimelineClipboardStore(
		(state) => state.mediaAttributes !== null
	);

	const [elementMenuOpen, setElementMenuOpen] = useState(false);
	const [clipAttributePresets, setClipAttributePresets] = useState(
		loadClipAttributePresets
	);

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
	const {
		canRollLeft,
		canRollRight,
		canSlip,
		editMode,
		handleRollKeyDown,
		handleRollPointerDown,
		handleSlipPointerDown,
		isPrecisionEditing,
	} = useTimelinePrecisionEdit({
		element: element.type === "media" ? element : null,
		mediaSupportsSlip: isVideoClip || isAudio,
		projectFps,
		track,
		zoomLevel,
	});

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
		trackHeight: getTrackHeight(track.type, track.height),
		clipWidthPx: elementWidth,
		enabled:
			mediaItem?.type === "video" &&
			mediaItem?.thumbnailStatus === "ready" &&
			elementWidth >= 12 &&
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
		const currentTime = usePlaybackStore.getState().currentTime;
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
		const currentTime = usePlaybackStore.getState().currentTime;
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
		const currentTime = usePlaybackStore.getState().currentTime;
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

	const handleSaveClipPreset = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (element.type !== "media") return;
		const { preset, presets } = saveClipAttributePreset({ element });
		setClipAttributePresets(presets);
		toast.success(`Saved ${preset.name}`);
	};

	const handleApplyClipPreset = (presetId: string) => {
		if (element.type !== "media") return;
		const preset = clipAttributePresets.find(
			(candidate) => candidate.id === presetId
		);
		if (!preset) {
			toast.error("Clip preset is no longer available");
			return;
		}
		updateMediaElement(track.id, element.id, preset.attributes);
		toast.success(`Applied ${preset.name}`);
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

	const startTranscriptionTask = () => {
		if (!mediaItem?.localPath) {
			toast.error("语音识别需要本地媒体文件");
			return;
		}
		const taskId = useCloudTaskStore.getState().createTask({
			kind: "transcription",
			label: `识别字幕：${element.name}`,
			payload: {
				elementId: element.id,
				trackId: track.id,
				mediaId: mediaItem.id,
			},
			message: "准备识别语音",
		});
		useCloudTaskStore.getState().startTask({
			id: taskId,
			message: "正在读取媒体",
		});
		useMediaPanelStore.getState().setActiveTab("word-timeline");
		setTimeout(() => {
			window.dispatchEvent(
				new CustomEvent("qcut:transcribe-media", {
					detail: {
						filePath: mediaItem.localPath,
						elementId: element.id,
						taskId,
					},
				})
			);
		}, 0);
	};

	const handleOpenSpeechTools = (e: React.MouseEvent) => {
		e.stopPropagation();
		startTranscriptionTask();
	};

	const handleRecognizeSpeech = (e: React.MouseEvent) => {
		e.stopPropagation();
		startTranscriptionTask();
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
		if (!mediaItem || mediaItem.type !== "video") {
			toast.error(t("timeline.toast.aiAudioRequiresVideo"));
			return;
		}
		useVideoEditRequestStore.getState().requestAudioGeneration({
			id: `audio-generation-${element.id}-${Date.now()}`,
			sourceVideo: mediaItem.file,
			previewUrl: mediaItem.url,
			targetElementId: element.id,
			sourceStart: sourceRangeForElement({ element }).start,
			sourceEnd: sourceRangeForElement({ element }).end,
			soundEffectPrompt: "根据画面内容生成同步的环境音和动作音效",
			autoStart: true,
		});
		useMediaPanelStore.getState().setActiveTab("video-edit");
	};

	const handleOpenEffectsPanel = (e: React.MouseEvent) => {
		e.stopPropagation();
		selectElement(track.id, element.id, false);
		useMediaPanelStore.getState().setActiveTab("effects");
	};

	const handleToggleGroup = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (element.groupId) {
			const count = ungroupElements(element.groupId);
			if (count > 0) {
				toast.success(t("timeline.toast.ungrouped", { count }));
			}
			return;
		}
		const groupId = groupSelectedElements();
		if (!groupId) {
			toast.error(t("timeline.toast.selectTwoForGroup"));
			return;
		}
		toast.success(t("timeline.toast.groupCreated"));
	};

	const handleLinkMedia = (e: React.MouseEvent) => {
		e.stopPropagation();
		const groupId = groupSelectedElements();
		if (!groupId) {
			toast.error(t("timeline.toast.selectTwoToLink"));
			return;
		}
		toast.success(t("timeline.toast.mediaLinked"));
	};

	const handleCreateMediaContainer = ({
		e,
		kind,
	}: {
		e: React.MouseEvent;
		kind: "compound" | "multicam";
	}) => {
		e.stopPropagation();
		const containerId = createMediaContainerFromSelection(kind);
		if (!containerId) {
			toast.error(t("timeline.toast.selectTwoOrdinary"));
			return;
		}
		toast.success(
			kind === "multicam"
				? t("timeline.toast.multicamCreated")
				: t("timeline.toast.compoundCreated")
		);
	};

	const handleBreakApartMediaContainer = (e: React.MouseEvent) => {
		e.stopPropagation();
		const count = breakApartMediaContainer(track.id, element.id);
		if (count === 0) {
			toast.error(t("timeline.toast.notContainer"));
			return;
		}
		toast.success(t("timeline.toast.sourcesRestored", { count }));
	};

	const handleSelectMulticamClip = (clipId: string) => {
		if (!selectMulticamClip(track.id, element.id, clipId)) return;
		toast.success(t("timeline.toast.cameraSwitched"));
	};

	const handleAudioVideoAlignment = async (e: React.MouseEvent) => {
		e.stopPropagation();
		const state = useTimelineStore.getState();
		const selectedMedia = state.selectedElements.flatMap((selection) => {
			const selectedTrack = state.tracks.find(
				(candidate) => candidate.id === selection.trackId
			);
			const selectedElement = selectedTrack?.elements.find(
				(candidate) => candidate.id === selection.elementId
			);
			return selectedElement?.type === "media"
				? [
						{
							trackId: selection.trackId,
							element: selectedElement,
						},
					]
				: [];
		});
		if (selectedMedia.length !== 2) {
			toast.error(t("timeline.toast.selectTwoToAlign"));
			return;
		}
		const reference =
			selectedMedia.find(
				({ element: selected }) => selected.id === element.id
			) ?? selectedMedia[0];
		const target = selectedMedia.find(
			({ element: selected }) => selected.id !== reference.element.id
		);
		if (!target || reference.element.compound || target.element.compound) {
			toast.error(t("timeline.toast.alignOrdinary"));
			return;
		}
		const referenceFile = mediaItems.find(
			(item) => item.id === reference.element.mediaId
		)?.file;
		const targetFile = mediaItems.find(
			(item) => item.id === target.element.mediaId
		)?.file;
		if (!referenceFile || !targetFile) {
			toast.error(t("timeline.toast.localMediaRequired"));
			return;
		}

		const toastId = toast.loading(t("timeline.toast.analyzingAudio"));
		try {
			const alignment = await alignMediaElementsByAudio({
				referenceElement: reference.element,
				targetElement: target.element,
				referenceFile,
				targetFile,
			});
			updateElementStartTime(
				target.trackId,
				target.element.id,
				alignment.targetStartTime
			);
			toast.success(
				t("timeline.toast.audioAligned", {
					confidence: Math.round(alignment.confidence * 100),
				}),
				{ id: toastId }
			);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: t("timeline.toast.alignmentFailed"),
				{
					id: toastId,
				}
			);
		}
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

	const runSmartShotSplit = async ({
		existingTaskId,
	}: {
		existingTaskId?: string;
	} = {}) => {
		if (element.type !== "media" || !activeProject || !mediaItem) return;
		const analyzeScenes = platform().claude?.analyze.scenes;
		if (!analyzeScenes) {
			toast.error("智能镜头分割仅支持桌面版");
			return;
		}
		const sourceElement = structuredClone(element);
		const taskId =
			existingTaskId ??
			useCloudTaskStore.getState().createTask({
				kind: "scene-detection",
				label: `镜头分割：${element.name}`,
				payload: {
					elementId: element.id,
					trackId: track.id,
					mediaId: mediaItem.id,
				},
				message: "等待检测镜头",
			});
		let canceled = false;
		const openSource = () =>
			useTimelineStore.getState().selectElement(track.id, element.id);
		const retry = () => void runSmartShotSplit({ existingTaskId: taskId });
		registerCloudTaskRuntimeActions({
			taskId,
			actions: {
				cancel: () => {
					canceled = true;
				},
				retry,
				open: openSource,
			},
		});
		useCloudTaskStore.getState().startTask({
			id: taskId,
			message: "正在检测镜头边界",
		});
		useCloudTaskStore.getState().updateProgress({ id: taskId, progress: 10 });
		const toastId = toast.loading("正在检测镜头边界...");
		try {
			const result = await analyzeScenes(activeProject.id, {
				mediaId: mediaItem.id,
				threshold: 0.3,
			});
			if (
				canceled ||
				useCloudTaskStore.getState().tasks.find((task) => task.id === taskId)
					?.status === "canceled"
			) {
				toast.dismiss(toastId);
				return;
			}
			useCloudTaskStore.getState().updateProgress({
				id: taskId,
				progress: 70,
				message: "正在写入时间线",
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
				useCloudTaskStore.getState().completeTask({
					id: taskId,
					message: "片段内未发现镜头边界",
					output: { createdElementIds: [] },
				});
				toast.info("片段内未发现镜头边界", {
					id: toastId,
				});
				return;
			}
			useCloudTaskStore.getState().completeTask({
				id: taskId,
				message: `已分成 ${createdIds.length + 1} 个镜头`,
				output: { createdElementIds: createdIds },
			});
			toast.success(`已分成 ${createdIds.length + 1} 个镜头`, {
				id: toastId,
			});
			registerCloudTaskRuntimeActions({
				taskId,
				actions: {
					open: openSource,
					undo: () => {
						const timeline = useTimelineStore.getState();
						timeline.pushHistory();
						timeline.restoreTracks(
							rollbackTimelineSceneSplits({
								tracks: timeline._tracks,
								trackId: track.id,
								sourceElement,
								createdElementIds: createdIds,
							})
						);
						void useTimelineStore.getState().saveImmediate();
						useCloudTaskStore.getState().completeTask({
							id: taskId,
							message: "镜头分割结果已撤销",
							output: { createdElementIds: [], undone: true },
						});
						registerCloudTaskRuntimeActions({
							taskId,
							actions: { open: openSource, retry },
						});
						toast.success("已撤销镜头分割");
					},
				},
			});
		} catch (error) {
			if (canceled) return;
			const message =
				error instanceof Error ? error.message : "智能镜头分割失败";
			useCloudTaskStore.getState().failTask({ id: taskId, error: message });
			toast.error(message, { id: toastId });
		}
	};

	const handleSmartShotSplit = (e: React.MouseEvent) => {
		e.stopPropagation();
		void runSmartShotSplit();
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

	const startReviewTask = async ({
		requestedTaskId,
	}: {
		requestedTaskId?: string;
	}) => {
		if (!isVideoClip) {
			toast.error("AI 审片只支持视频片段");
			return;
		}
		if (!mediaItem?.localPath) {
			toast.error("AI 审片需要本地视频文件");
			return;
		}

		const range = sourceRangeForElement({ element });
		if (range.duration <= 0) {
			toast.error("所选片段没有可审查的时长");
			return;
		}
		const cloudTasks = useCloudTaskStore.getState();
		const taskId =
			requestedTaskId ??
			cloudTasks.createTask({
				kind: "review",
				label: `AI 审片：${element.name}`,
				payload: {
					elementId: element.id,
					trackId: track.id,
					mediaId: mediaItem.id,
					startTime: range.start,
					endTime: range.end,
				},
				message: "准备启动在线审片",
			});

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
			if (!tabId) throw new Error("无法创建审片终端会话");
			cloudTasks.startTask({
				id: taskId,
				sessionId: tabId,
				message: "正在运行在线审片",
			});
			const callbackId = `task-${tabId}`;
			terminal.registerExitCallback(callbackId, (exitCode) => {
				terminal.unregisterExitCallback(callbackId);
				const status = useCloudTaskStore
					.getState()
					.tasks.find((task) => task.id === taskId)?.status;
				if (status === "canceled") return;
				if (exitCode === 0) {
					useCloudTaskStore.getState().completeTask({
						id: taskId,
						message: "审片完成，结果已保存在终端输出",
						output: { terminalTabId: tabId },
					});
					return;
				}
				useCloudTaskStore.getState().failTask({
					id: taskId,
					error: `审片命令退出，状态码 ${exitCode}`,
				});
			});
			registerCloudTaskRuntimeActions({
				taskId,
				actions: {
					cancel: () => terminal.closeSession(tabId),
					retry: () => startReviewTask({ requestedTaskId: taskId }),
					open: () => {
						usePtyTerminalStore.getState().switchSession(tabId);
						useMediaPanelStore.getState().setActiveTab("pty");
					},
				},
			});
			usePtyTerminalStore.getState().switchSession(tabId);
			usePtyTerminalStore.getState().setCliProvider("shell");
			useMediaPanelStore.getState().setActiveTab("pty");
			await usePtyTerminalStore.getState().connect({
				manual: true,
				command,
			});
			useCloudTaskStore.getState().updateProgress({
				id: taskId,
				progress: 15,
				message: "审片已启动，可在任务中心查看",
			});
			toast.success("AI 审片已启动");
		} catch (error) {
			console.error("Failed to start AI review:", error);
			const message =
				error instanceof Error ? error.message : "启动 AI 审片失败";
			useCloudTaskStore.getState().failTask({ id: taskId, error: message });
			toast.error(message);
		}
	};

	const handleReviewSelectedClip = async (e: React.MouseEvent) => {
		e.stopPropagation();
		await startReviewTask({});
	};

	const renderElementContent = () => {
		if (element.type === "media" && element.compound) {
			const isMulticam = element.compound.kind === "multicam";
			return (
				<div className="flex h-full w-full items-center gap-2 bg-zinc-800 px-2 text-zinc-100 dark:bg-zinc-200 dark:text-zinc-900">
					{isMulticam ? (
						<Camera className="size-3.5 shrink-0 text-cyan-400 dark:text-cyan-700" />
					) : (
						<Clapperboard className="size-3.5 shrink-0 text-amber-400 dark:text-amber-700" />
					)}
					<span className="truncate text-xs font-medium">{displayName}</span>
				</div>
			);
		}

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
								alt={displayName}
								className="h-[calc(100%-8px)] w-auto object-contain rounded pointer-events-none select-none bg-white/10 p-0.5"
								onError={(e) => {
									// Hide image on error and show text fallback
									e.currentTarget.style.display = "none";
								}}
							/>
							<span className="text-xs text-foreground/80 truncate flex-1">
								{displayName}
							</span>
						</>
					) : (
						<span className="text-xs text-foreground/80 truncate">
							{displayName}
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

		if (element.type === "adjustment") {
			return (
				<div className="flex h-full w-full items-center gap-1.5 px-2">
					<SlidersHorizontal className="size-3.5 shrink-0" />
					<span className="truncate text-xs text-foreground/80">
						{displayName}
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
					{displayName}
				</span>
			);
		}

		const TILE_ASPECT_RATIO = 16 / 9;

		if (mediaItem.type === "image") {
			// Calculate tile size based on 16:9 aspect ratio
			const trackHeight = getTrackHeight(track.type, track.height);
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
							{displayName} (loading...)
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
						{displayName}
					</span>
				</div>
			);
		}

		// Render audio element ->
		if (mediaItem.type === "audio") {
			return (
				<div className="w-full h-full py-[3px]">
					<AudioWaveform
						audioUrl={mediaItem.url || ""}
						sourcePath={mediaItem.localPath}
						sourceDuration={mediaItem.duration ?? element.duration}
						cacheKey={`media:${mediaItem.id}:${mediaItem.file.size}:${mediaItem.file.lastModified}`}
						className="w-full h-full"
						sourceStart={element.trimStart}
						sourceEnd={element.duration - element.trimEnd}
						barWidth={0.5}
						barGap={0.5}
						color="rgba(126, 196, 255, 0.95)"
					/>
				</div>
			);
		}

		return (
			<span className="text-xs text-foreground/80 truncate">{displayName}</span>
		);
	};

	const handleElementMouseDown = (e: React.MouseEvent) => {
		if (editMode !== "select") {
			e.preventDefault();
			e.stopPropagation();
			return;
		}
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
						isBeingDragged ||
						isPrecisionEditing ||
						(isSelected && editMode === "roll")
							? "z-50"
							: "z-10"
					}`}
					style={{
						left: `${elementLeft}px`,
						width: `${elementWidth}px`,
					}}
					data-element-id={element.id}
					data-track-id={track.id}
					data-testid="timeline-element"
					data-duration={effectiveDuration}
					data-edit-mode={editMode}
					onMouseMove={resizing ? handleResizeMove : undefined}
					onMouseUp={resizing ? handleResizeEnd : undefined}
					onMouseLeave={resizing ? handleResizeEnd : undefined}
				>
					<div
						className={`relative h-full rounded-[0.15rem] overflow-hidden ${getTrackElementClasses(
							track.type
						)} ${
							editMode === "slip"
								? canSlip
									? "cursor-ew-resize"
									: "cursor-not-allowed"
								: "cursor-pointer"
						} ${isSelected ? "border-b-[0.5px] border-t-[0.5px] border-foreground" : ""} ${
							isBeingDragged ||
							isPrecisionEditing ||
							(isSelected && editMode === "roll")
								? "z-50"
								: "z-10"
						} ${element.hidden ? "opacity-50" : ""}`}
						onClick={(e) => onElementClick && onElementClick(e, element)}
						onMouseDown={handleElementMouseDown}
						onPointerDown={handleSlipPointerDown}
					>
						<div className="absolute inset-0 flex items-center h-full">
							{renderElementContent()}
						</div>
						{element.groupId ? (
							<div
								className="pointer-events-none absolute left-1 top-1 z-30 grid size-4 place-items-center rounded-sm bg-black/65 text-white"
								title="Grouped clip"
							>
								<Link2 className="size-2.5" />
							</div>
						) : null}

						{element.hidden && (
							<div className="absolute inset-0 bg-background/50 flex items-center justify-center pointer-events-none">
								{isAudio ? (
									<VolumeX className="h-6 w-6 text-foreground" />
								) : (
									<EyeOff className="h-6 w-6 text-foreground" />
								)}
							</div>
						)}

						{isSelected && editMode !== "slip" && (
							<>
								<button
									type="button"
									className={`absolute bottom-0 left-0 top-0 z-50 w-3 border-r-2 bg-transparent before:absolute before:-left-4 before:inset-y-0 before:w-8 before:content-[''] ${
										editMode === "roll"
											? canRollLeft
												? "cursor-ew-resize border-amber-300 bg-amber-300/15 hover:bg-amber-300/30"
												: "cursor-not-allowed border-muted-foreground/30 opacity-40"
											: "cursor-w-resize border-foreground/50 hover:bg-foreground/20"
									}`}
									onPointerDown={(event) => {
										if (editMode === "roll") {
											handleRollPointerDown({ event, side: "left" });
											return;
										}
										handleResizeStart(event, element.id, "left");
									}}
									onKeyDown={(event) =>
										handleRollKeyDown({ event, side: "left" })
									}
									aria-label={
										editMode === "roll"
											? "Roll edit left cut"
											: "Trim clip start"
									}
									title={
										editMode === "roll" ? "Roll edit cut" : "Trim clip start"
									}
									data-testid="trim-start-handle"
								/>
								<button
									type="button"
									className={`absolute bottom-0 right-0 top-0 z-50 w-3 border-l-2 bg-transparent before:absolute before:-right-4 before:inset-y-0 before:w-8 before:content-[''] ${
										editMode === "roll"
											? canRollRight
												? "cursor-ew-resize border-amber-300 bg-amber-300/15 hover:bg-amber-300/30"
												: "cursor-not-allowed border-muted-foreground/30 opacity-40"
											: "cursor-e-resize border-foreground/50 hover:bg-foreground/20"
									}`}
									onPointerDown={(event) => {
										if (editMode === "roll") {
											handleRollPointerDown({ event, side: "right" });
											return;
										}
										handleResizeStart(event, element.id, "right");
									}}
									onKeyDown={(event) =>
										handleRollKeyDown({ event, side: "right" })
									}
									aria-label={
										editMode === "roll"
											? "Roll edit right cut"
											: "Trim clip end"
									}
									title={
										editMode === "roll" ? "Roll edit cut" : "Trim clip end"
									}
									data-testid="trim-end-handle"
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
						<TimelineElementTaskBadge
							element={element}
							showLabel={elementWidth >= 120}
						/>
					</div>
				</div>
			</ContextMenuTrigger>
			{isVideoClip ? (
				<VideoClipContextMenu
					isDisabled={element.hidden === true}
					canPasteAttributes={canPasteAttributes}
					hasLocalFile={Boolean(mediaItem?.localPath)}
					presets={clipAttributePresets}
					canGroup={selectedElements.length >= 2}
					isGrouped={Boolean(element.groupId)}
					canCreateContainer={selectedElements.length >= 2 && !element.compound}
					canAlignAudioVideo={
						selectedElements.length === 2 && !element.compound
					}
					canLinkMedia={selectedElements.length >= 2 && !element.groupId}
					compoundKind={element.compound?.kind}
					multicamClips={
						element.compound?.kind === "multicam"
							? element.compound.clips.map((clip) => ({
									id: clip.id,
									name: clip.element.name,
									active: clip.id === element.compound?.activeClipId,
								}))
							: []
					}
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
						savePreset: handleSaveClipPreset,
						applyPreset: handleApplyClipPreset,
						openEffects: handleOpenEffectsPanel,
						toggleGroup: handleToggleGroup,
						alignAudioVideo: handleAudioVideoAlignment,
						createCompound: (e) =>
							handleCreateMediaContainer({ e, kind: "compound" }),
						createMulticam: (e) =>
							handleCreateMediaContainer({ e, kind: "multicam" }),
						breakApart: handleBreakApartMediaContainer,
						linkMedia: handleLinkMedia,
						selectMulticamClip: handleSelectMulticamClip,
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
