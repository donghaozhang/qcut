"use client";

import { useRef, useEffect } from "react";
import {
	Scissors,
	ArrowLeftToLine,
	ArrowRightToLine,
	Trash2,
	Snowflake,
	Copy,
	Crop,
	SplitSquareHorizontal,
	Pause,
	Play,
	FoldHorizontal,
	Magnet,
	Link,
	Link2,
	ZoomIn,
	ZoomOut,
	Bookmark,
	LayersIcon,
	Sparkles,
	FileText,
	Plus,
	Rows3,
} from "lucide-react";
import { Button } from "../../ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
	TooltipProvider,
} from "../../ui/tooltip";
import {
	SplitButton,
	SplitButtonLeft,
	SplitButtonRight,
	SplitButtonSeparator,
} from "../../ui/split-button";
import { Slider } from "@/components/ui/slider";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useProjectStore } from "@/stores/project-store";
import { useSceneStore } from "@/stores/timeline/scene-store";
import { ScenesView } from "../scenes-view";
import { EFFECTS_ENABLED } from "@/config/features";
import {
	COMPACT_TRACK_HEIGHTS,
	TIMELINE_CONSTANTS,
	TEST_MEDIA_ID,
} from "@/constants/timeline-constants";
import { toast } from "sonner";
import { debugLog, debugError } from "@/lib/debug/debug-config";
import { getTimelineElementEndTime } from "@/lib/timeline";
import { addAdjustmentLayer } from "@/lib/timeline/adjustment-layer";
import { freezeSelectedElementAtPlayhead } from "@/lib/timeline/freeze-frame";
import { useActionShortcutLabels } from "@/hooks/keyboard/use-action-shortcut-label";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TrackType } from "@/types/timeline";
import { CloudTaskCenter } from "@/components/editor/cloud-task-center";
import { TrackIcon } from "./track-icon";
import { useTranslation } from "@/lib/i18n";
import { createDuplicatedTimelineElement } from "@/stores/timeline/timeline-clipboard-store";
import {
	localizeSceneName,
	localizeTrackTypeName,
} from "@/lib/i18n/timeline-names";
import { TimelineEditModeControl } from "./timeline-edit-mode-control";

const ADD_TRACK_OPTIONS: TrackType[] = [
	"media",
	"audio",
	"text",
	"captions",
	"sticker",
	"adjustment",
	"remotion",
	"hyperframes",
	"markdown",
];

export interface TimelineToolbarProps {
	zoomLevel: number;
	setZoomLevel: (zoomLevel: number) => void;
}

export function TimelineToolbar({
	zoomLevel,
	setZoomLevel,
}: TimelineToolbarProps) {
	const { locale, t } = useTranslation();
	const tracks = useTimelineStore((s) => s.tracks);
	const addTrack = useTimelineStore((s) => s.addTrack);
	const insertTrackAt = useTimelineStore((s) => s.insertTrackAt);
	const addElementToTrack = useTimelineStore((s) => s.addElementToTrack);
	const getTotalDuration = useTimelineStore((s) => s.getTotalDuration);
	const addMarkdownAtTime = useTimelineStore((s) => s.addMarkdownAtTime);
	const removeElementFromTrack = useTimelineStore(
		(s) => s.removeElementFromTrack
	);
	const deleteSelectedElementsWithRipple = useTimelineStore(
		(s) => s.deleteSelectedElementsWithRipple
	);
	const selectedElements = useTimelineStore((s) => s.selectedElements);
	const clearSelectedElements = useTimelineStore(
		(s) => s.clearSelectedElements
	);
	const splitElement = useTimelineStore((s) => s.splitElement);
	const splitAndKeepLeft = useTimelineStore((s) => s.splitAndKeepLeft);
	const splitAndKeepRight = useTimelineStore((s) => s.splitAndKeepRight);
	const separateAudio = useTimelineStore((s) => s.separateAudio);
	const setTrackHeightMode = useTimelineStore((s) => s.setTrackHeightMode);
	const snappingEnabled = useTimelineStore((s) => s.snappingEnabled);
	const toggleSnapping = useTimelineStore((s) => s.toggleSnapping);
	const rippleEditingEnabled = useTimelineStore((s) => s.rippleEditingEnabled);
	const toggleRippleEditing = useTimelineStore((s) => s.toggleRippleEditing);
	const mainTrackMagnetEnabled = useTimelineStore(
		(s) => s.mainTrackMagnetEnabled
	);
	const toggleMainTrackMagnet = useTimelineStore(
		(s) => s.toggleMainTrackMagnet
	);
	const linkedRippleEnabled = useTimelineStore((s) => s.linkedRippleEnabled);
	const toggleLinkedRipple = useTimelineStore((s) => s.toggleLinkedRipple);
	const showEffectsTrack = useTimelineStore((s) => s.showEffectsTrack);
	const toggleEffectsTrack = useTimelineStore((s) => s.toggleEffectsTrack);
	const currentTime = usePlaybackStore((s) => s.currentTime);
	const duration = usePlaybackStore((s) => s.duration);
	const isPlaying = usePlaybackStore((s) => s.isPlaying);
	const toggle = usePlaybackStore((s) => s.toggle);
	const toggleBookmark = useProjectStore((s) => s.toggleBookmark);
	const isBookmarked = useProjectStore((s) => s.isBookmarked);
	const projectFps = useProjectStore((s) => s.activeProject?.fps ?? 30);
	const { scenes, currentScene } = useSceneStore();
	const { withShortcut } = useActionShortcutLabels();
	const currentSceneName = localizeSceneName({
		name: currentScene?.name,
		locale,
	});
	const compactTracks =
		tracks.length > 0 &&
		tracks.every((track) => track.height === COMPACT_TRACK_HEIGHTS[track.type]);
	const selectedElement =
		selectedElements.length === 1
			? tracks
					.find((track) => track.id === selectedElements[0].trackId)
					?.elements.find(
						(element) => element.id === selectedElements[0].elementId
					)
			: null;
	const hasSelection = selectedElements.length > 0;
	const hasSingleSelection = selectedElements.length === 1;
	const hasSingleMediaSelection = selectedElement?.type === "media";

	// DOM-direct timecode update during playback (avoids React re-renders)
	const timecodeRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const el = timecodeRef.current;
		if (!el) return;
		const handleTick = (e: Event) => {
			const time = (e as CustomEvent).detail?.time;
			if (time != null) {
				el.textContent = `${time.toFixed(1)}s / ${duration.toFixed(1)}s`;
			}
		};
		// Also sync on pause (store updates currentTime on pause)
		const handleUpdate = () => {
			const t = usePlaybackStore.getState().currentTime;
			el.textContent = `${t.toFixed(1)}s / ${duration.toFixed(1)}s`;
		};
		window.addEventListener("playback-update", handleTick);
		window.addEventListener("playback-seek", handleUpdate);
		return () => {
			window.removeEventListener("playback-update", handleTick);
			window.removeEventListener("playback-seek", handleUpdate);
		};
	}, [duration]);

	const handleSplitSelected = () => {
		if (selectedElements.length === 0) return;
		let splitCount = 0;
		for (const { trackId, elementId } of selectedElements) {
			const track = tracks.find((t) => t.id === trackId);
			const element = track?.elements.find((c) => c.id === elementId);
			if (element && track) {
				const effectiveStart = element.startTime;
				const effectiveEnd = getTimelineElementEndTime({ element });
				if (currentTime > effectiveStart && currentTime < effectiveEnd) {
					const newElementId = splitElement(trackId, elementId, currentTime);
					if (newElementId) splitCount++;
				}
			}
		}
		if (splitCount === 0) {
			toast.error("Playhead must be within selected elements to split");
		}
	};

	const handleDuplicateSelected = () => {
		if (selectedElements.length === 0) return;
		const canDuplicate = selectedElements.length === 1;
		if (!canDuplicate) return;

		for (const { trackId, elementId } of selectedElements) {
			const track = tracks.find((t) => t.id === trackId);
			const element = track?.elements.find((el) => el.id === elementId);
			if (element && track) {
				addElementToTrack(
					trackId,
					createDuplicatedTimelineElement({
						entry: {
							trackId,
							trackType: track.type,
							element,
						},
						fps: projectFps,
					})
				);
			}
		}
		clearSelectedElements();
	};

	const handleFreezeSelected = () => {
		freezeSelectedElementAtPlayhead();
	};

	const handleSplitAndKeepLeft = () => {
		if (selectedElements.length !== 1) {
			toast.error("Select exactly one element");
			return;
		}
		const { trackId, elementId } = selectedElements[0];
		const track = tracks.find((t) => t.id === trackId);
		const element = track?.elements.find((c) => c.id === elementId);
		if (!element) return;
		const effectiveStart = element.startTime;
		const effectiveEnd = getTimelineElementEndTime({ element });
		if (currentTime <= effectiveStart || currentTime >= effectiveEnd) {
			toast.error("Playhead must be within selected element");
			return;
		}
		splitAndKeepLeft(trackId, elementId, currentTime);
	};

	const handleSplitAndKeepRight = () => {
		if (selectedElements.length !== 1) {
			toast.error("Select exactly one element");
			return;
		}
		const { trackId, elementId } = selectedElements[0];
		const track = tracks.find((t) => t.id === trackId);
		const element = track?.elements.find((c) => c.id === elementId);
		if (!element) return;
		const effectiveStart = element.startTime;
		const effectiveEnd = getTimelineElementEndTime({ element });
		if (currentTime <= effectiveStart || currentTime >= effectiveEnd) {
			toast.error("Playhead must be within selected element");
			return;
		}
		splitAndKeepRight(trackId, elementId, currentTime);
	};

	const handleSeparateAudio = () => {
		if (selectedElements.length !== 1) {
			toast.error("Select exactly one media element to separate audio");
			return;
		}
		const { trackId, elementId } = selectedElements[0];
		const track = tracks.find((t) => t.id === trackId);
		if (!track || track.type !== "media") {
			toast.error("Select a media element to separate audio");
			return;
		}
		separateAudio(trackId, elementId);
	};

	const handleCropSelected = () => {
		if (!selectedElement || selectedElement.type !== "media") {
			toast.error("Select one media clip to crop");
			return;
		}
		window.dispatchEvent(
			new CustomEvent("qcut:open-media-properties-tab", {
				detail: {
					elementId: selectedElement.id,
					tab: "basic",
					scrollTo: "crop",
				},
			})
		);
	};

	const handleDeleteSelected = () => {
		if (selectedElements.length === 0) return;
		if (rippleEditingEnabled) {
			deleteSelectedElementsWithRipple(selectedElements);
			return;
		}
		for (const { trackId, elementId } of selectedElements) {
			removeElementFromTrack(trackId, elementId);
		}
		clearSelectedElements();
	};

	const handleAddMarkdown = () => {
		try {
			addMarkdownAtTime(
				{
					id: `markdown-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
					type: "markdown",
					name: "Markdown",
					markdownContent: "# Title\n\nStart writing...",
					duration: TIMELINE_CONSTANTS.MARKDOWN_DEFAULT_DURATION,
					startTime: 0,
					trimStart: 0,
					trimEnd: 0,
					theme: "dark",
					fontSize: 18,
					fontFamily: "Arial",
					padding: 16,
					backgroundColor: "rgba(0, 0, 0, 0.85)",
					textColor: "#ffffff",
					scrollMode: "static",
					scrollSpeed: 30,
					x: 0,
					y: 0,
					width: 720,
					height: 420,
					rotation: 0,
					opacity: 1,
				},
				currentTime
			);
		} catch (error) {
			debugError("Failed to add markdown element:", error);
			toast.error("Failed to add markdown");
		}
	};

	const handleZoomIn = () => {
		const next = TIMELINE_CONSTANTS.ZOOM_LEVELS.find(
			(v) => v > zoomLevel + 0.001
		);
		setZoomLevel(next ?? 4);
	};

	const handleZoomOut = () => {
		const prev = [...TIMELINE_CONSTANTS.ZOOM_LEVELS]
			.reverse()
			.find((v) => v < zoomLevel - 0.001);
		setZoomLevel(prev ?? 0.05);
	};

	const handleZoomSliderChange = (values: number[]) => {
		const [nextZoomLevel] = values;
		if (typeof nextZoomLevel === "number") {
			setZoomLevel(nextZoomLevel);
		}
	};

	const handleToggleBookmark = async () => {
		try {
			await toggleBookmark(currentTime);
		} catch (error) {
			debugError("Failed to toggle bookmark:", error);
			toast.error("Failed to update bookmark");
		}
	};

	const currentBookmarked = isBookmarked(currentTime);
	const addTrackFromMenu = ({ type }: { type: TrackType }) => {
		if (type !== "adjustment") {
			addTrack(type);
			return;
		}
		addAdjustmentLayer({
			timeline: { tracks, insertTrackAt, addElementToTrack, getTotalDuration },
			currentTime,
		});
	};

	return (
		<div
			className="flex items-center justify-between px-2 py-1 border-b h-10"
			data-testid="timeline-toolbar"
		>
			<div className="flex items-center gap-1">
				<CloudTaskCenter />
				<TooltipProvider delayDuration={500}>
					<TimelineEditModeControl />
					<div className="mx-1 h-6 w-px bg-border" />
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="text"
								size="icon"
								type="button"
								aria-label="Add track"
								title="Add track"
								data-testid="add-track-button"
							>
								<Plus className="h-4 w-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start">
							<DropdownMenuLabel>Add track</DropdownMenuLabel>
							<DropdownMenuSeparator />
							{ADD_TRACK_OPTIONS.map((trackType) => (
								<DropdownMenuItem
									key={trackType}
									onSelect={() => addTrackFromMenu({ type: trackType })}
								>
									<TrackIcon type={trackType} />
									{localizeTrackTypeName({ type: trackType, locale })}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="text"
								size="icon"
								type="button"
								onClick={handleAddMarkdown}
								data-testid="add-markdown-button"
							>
								<FileText className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Add markdown at playhead</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="text"
								size="icon"
								type="button"
								onClick={toggle}
								className="mr-2"
								data-testid={
									isPlaying ? "timeline-pause-button" : "timeline-play-button"
								}
								data-playing={isPlaying}
							>
								{isPlaying ? (
									<Pause className="h-4 w-4" />
								) : (
									<Play className="h-4 w-4" />
								)}
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							{withShortcut(isPlaying ? "Pause" : "Play", "toggle-play")}
						</TooltipContent>
					</Tooltip>

					<div className="w-px h-6 bg-border mx-1" />
					<div
						ref={timecodeRef}
						className="text-xs text-muted-foreground font-mono px-2"
						style={{ minWidth: "18ch", textAlign: "center" }}
						data-testid="current-time-display"
					>
						{currentTime.toFixed(1)}s / {duration.toFixed(1)}s
					</div>

					{scenes.length > 0 && (
						<>
							<div className="w-px h-6 bg-border mx-1" />
							<ScenesView>
								<Tooltip>
									<TooltipTrigger asChild>
										<Button variant="text" size="icon">
											<LayersIcon className="h-4 w-4" />
										</Button>
									</TooltipTrigger>
									<TooltipContent>
										Scenes ({scenes.length}) -{" "}
										{currentScene?.name || "No scene"}
									</TooltipContent>
								</Tooltip>
							</ScenesView>
						</>
					)}

					{tracks.length === 0 && (
						<>
							<div className="w-px h-6 bg-border mx-1" />
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="outline"
										size="sm"
										onClick={() => {
											const trackId = addTrack("media");
											addElementToTrack(trackId, {
												type: "media",
												mediaId: TEST_MEDIA_ID,
												name: "Test Clip",
												duration: TIMELINE_CONSTANTS.DEFAULT_TEXT_DURATION,
												startTime: 0,
												trimStart: 0,
												trimEnd: 0,
											});
										}}
										className="text-xs"
									>
										Add Test Clip
									</Button>
								</TooltipTrigger>
								<TooltipContent>Add a test clip to try playback</TooltipContent>
							</Tooltip>
						</>
					)}

					<div className="w-px h-6 bg-border mx-1" />

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant={compactTracks ? "default" : "text"}
								size="icon"
								onClick={() =>
									setTrackHeightMode(compactTracks ? "default" : "compact")
								}
								onKeyDown={(event) => {
									if (event.key !== "Enter" && event.key !== " ") return;
									event.preventDefault();
									setTrackHeightMode(compactTracks ? "default" : "compact");
								}}
								aria-label={
									compactTracks
										? "Restore default track heights"
										: "Compact tracks"
								}
								aria-pressed={compactTracks}
								title="Compact tracks"
								data-testid="compact-tracks-button"
							>
								<Rows3 className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							{compactTracks ? "Restore track heights" : "Compact tracks"}
						</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant="text"
								size="icon"
								onClick={handleSplitSelected}
								disabled={!hasSelection}
								aria-label="Split selected clips at playhead"
								data-testid="split-clip-button"
							>
								<Scissors className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							{withShortcut("Split element", "split-element")}
						</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant="text"
								size="icon"
								onClick={handleSplitAndKeepLeft}
								disabled={!hasSingleSelection}
								aria-label="Split and keep left"
								data-testid="split-keep-left-button"
							>
								<ArrowLeftToLine className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							{withShortcut("Split and keep left", "trim-end-to-playhead")}
						</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant="text"
								size="icon"
								onClick={handleSplitAndKeepRight}
								disabled={!hasSingleSelection}
								aria-label="Split and keep right"
								data-testid="split-keep-right-button"
							>
								<ArrowRightToLine className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							{withShortcut("Split and keep right", "trim-start-to-playhead")}
						</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant="text"
								size="icon"
								onClick={handleSeparateAudio}
								disabled={!hasSingleMediaSelection}
								aria-label="Separate audio from selected clip"
								data-testid="separate-audio-button"
							>
								<SplitSquareHorizontal className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							{withShortcut("Separate audio", "separate-audio-selected")}
						</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant="text"
								size="icon"
								onClick={handleDuplicateSelected}
								disabled={!hasSingleSelection}
								aria-label="Duplicate selected clip"
								data-testid="duplicate-clip-button"
							>
								<Copy className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							{withShortcut("Duplicate clip", "duplicate-selected")}
						</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant="text"
								size="icon"
								onClick={handleCropSelected}
								disabled={!hasSingleMediaSelection}
								aria-label="Crop selected clip"
								data-testid="crop-clip-button"
							>
								<Crop className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							{withShortcut("Crop clip", "crop-selected")}
						</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant="text"
								size="icon"
								onClick={handleFreezeSelected}
								onKeyDown={(event) => {
									if (event.key !== "Enter" && event.key !== " ") return;
									event.preventDefault();
									handleFreezeSelected();
								}}
								aria-label="Add freeze frame at playhead"
								title="Freeze frame"
								data-testid="freeze-frame-button"
							>
								<Snowflake className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							{withShortcut("Freeze frame", "freeze-selected")}
						</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant="text"
								size="icon"
								onClick={handleDeleteSelected}
								disabled={!hasSelection}
								aria-label={
									rippleEditingEnabled
										? "Delete selected clips with ripple"
										: "Delete selected clips"
								}
								data-testid="delete-selected-button"
							>
								<Trash2 className="h-4 w-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							{withShortcut(
								rippleEditingEnabled ? "Delete with ripple" : "Delete element",
								"delete-selected"
							)}
						</TooltipContent>
					</Tooltip>

					<div className="w-px h-6 bg-border mx-1" />

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant="text"
								size="icon"
								onClick={handleToggleBookmark}
								aria-label={
									currentBookmarked ? "Remove bookmark" : "Add bookmark"
								}
							>
								<Bookmark
									className={`h-4 w-4 ${currentBookmarked ? "fill-primary text-primary" : ""}`}
								/>
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							{withShortcut(
								currentBookmarked ? "Remove bookmark" : "Add bookmark",
								"toggle-bookmark"
							)}
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			</div>

			<div>
				<TooltipProvider delayDuration={500}>
					<Tooltip>
						<TooltipTrigger asChild>
							<SplitButton>
								<SplitButtonLeft disabled>{currentSceneName}</SplitButtonLeft>
								<SplitButtonSeparator />
								<ScenesView>
									<SplitButtonRight
										type="button"
										aria-label={t("timeline.scene.open")}
									>
										<LayersIcon className="h-4 w-4" aria-hidden="true" />
									</SplitButtonRight>
								</ScenesView>
							</SplitButton>
						</TooltipTrigger>
						<TooltipContent>
							{t("timeline.scene.tooltip", { name: currentSceneName })}
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			</div>

			<div className="flex items-center gap-1">
				<TooltipProvider delayDuration={500}>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant={snappingEnabled ? "default" : "text"}
								size="icon"
								onClick={toggleSnapping}
								aria-label="Toggle timeline snapping"
								aria-pressed={snappingEnabled}
								data-testid="timeline-snapping-button"
								data-enabled={snappingEnabled}
							>
								{snappingEnabled ? (
									<Magnet className="h-4 w-4 text-primary" />
								) : (
									<Magnet className="h-4 w-4" />
								)}
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							{withShortcut(
								snappingEnabled
									? t("timeline.toolbar.disableSnapping")
									: t("timeline.toolbar.enableSnapping"),
								"toggle-snapping"
							)}
						</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant={mainTrackMagnetEnabled ? "default" : "text"}
								size="icon"
								onClick={toggleMainTrackMagnet}
								aria-label="Toggle main-track magnet"
								aria-pressed={mainTrackMagnetEnabled}
								data-testid="timeline-main-magnet-button"
								data-enabled={mainTrackMagnetEnabled}
							>
								<FoldHorizontal
									className={`h-4 w-4 ${
										mainTrackMagnetEnabled ? "text-primary" : ""
									}`}
								/>
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							{withShortcut(
								mainTrackMagnetEnabled
									? t("timeline.toolbar.disableMainTrackMagnet")
									: t("timeline.toolbar.enableMainTrackMagnet"),
								"toggle-main-track-magnet"
							)}
						</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant={rippleEditingEnabled ? "default" : "text"}
								size="icon"
								onClick={toggleRippleEditing}
								aria-label="Toggle ripple editing"
								aria-pressed={rippleEditingEnabled}
								data-testid="timeline-ripple-button"
								data-enabled={rippleEditingEnabled}
							>
								<Link
									className={`h-4 w-4 ${
										rippleEditingEnabled ? "text-primary" : ""
									}`}
								/>
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							{rippleEditingEnabled
								? t("timeline.toolbar.disableRippleEditing")
								: t("timeline.toolbar.enableRippleEditing")}
						</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant={linkedRippleEnabled ? "default" : "text"}
								size="icon"
								onClick={toggleLinkedRipple}
								aria-label="Toggle linked ripple"
								aria-pressed={linkedRippleEnabled}
								data-testid="timeline-linked-ripple-button"
								data-enabled={linkedRippleEnabled}
							>
								<Link2
									className={`h-4 w-4 ${
										linkedRippleEnabled ? "text-primary" : ""
									}`}
								/>
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							{withShortcut(
								linkedRippleEnabled
									? t("timeline.toolbar.disableLinkedRipple")
									: t("timeline.toolbar.enableLinkedRipple"),
								"toggle-linked-ripple"
							)}
						</TooltipContent>
					</Tooltip>

					{EFFECTS_ENABLED && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button variant="text" size="icon" onClick={toggleEffectsTrack}>
									<Sparkles
										className={`h-4 w-4 ${
											showEffectsTrack ? "text-primary" : ""
										}`}
									/>
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								{showEffectsTrack ? "Hide Effects Track" : "Show Effects Track"}
							</TooltipContent>
						</Tooltip>
					)}
				</TooltipProvider>

				<div className="h-6 w-px bg-border mx-1" />

				<div className="flex items-center gap-1">
					<Button
						variant="text"
						size="icon"
						onClick={handleZoomOut}
						data-testid="zoom-out-button"
					>
						<ZoomOut className="h-4 w-4" />
					</Button>
					<Slider
						className="w-24"
						value={[zoomLevel]}
						onValueChange={handleZoomSliderChange}
						min={0.05}
						max={4}
						step={0.05}
						aria-label="Timeline zoom"
						data-zoom-level={zoomLevel}
					/>
					<Button
						variant="text"
						size="icon"
						onClick={handleZoomIn}
						data-testid="zoom-in-button"
					>
						<ZoomIn className="h-4 w-4" />
					</Button>
				</div>
			</div>
		</div>
	);
}
