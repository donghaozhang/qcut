"use client";

import {
	Scissors,
	ArrowLeftToLine,
	ArrowRightToLine,
	Trash2,
	Snowflake,
	Copy,
	SplitSquareHorizontal,
	Pause,
	Play,
	Magnet,
	Link,
	ZoomIn,
	ZoomOut,
	Bookmark,
	LayersIcon,
	Sparkles,
	FileText,
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
	TIMELINE_CONSTANTS,
	TEST_MEDIA_ID,
} from "@/constants/timeline-constants";
import { toast } from "sonner";
import { debugLog, debugError } from "@/lib/debug/debug-config";

export interface TimelineToolbarProps {
	zoomLevel: number;
	setZoomLevel: (zoomLevel: number) => void;
}

export function TimelineToolbar({
	zoomLevel,
	setZoomLevel,
}: TimelineToolbarProps) {
	const tracks = useTimelineStore((s) => s.tracks);
	const addTrack = useTimelineStore((s) => s.addTrack);
	const addElementToTrack = useTimelineStore((s) => s.addElementToTrack);
	const addMarkdownAtTime = useTimelineStore((s) => s.addMarkdownAtTime);
	const removeElementFromTrack = useTimelineStore(
		(s) => s.removeElementFromTrack
	);
	const removeElementFromTrackWithRipple = useTimelineStore(
		(s) => s.removeElementFromTrackWithRipple
	);
	const selectedElements = useTimelineStore((s) => s.selectedElements);
	const clearSelectedElements = useTimelineStore(
		(s) => s.clearSelectedElements
	);
	const splitElement = useTimelineStore((s) => s.splitElement);
	const splitAndKeepLeft = useTimelineStore((s) => s.splitAndKeepLeft);
	const splitAndKeepRight = useTimelineStore((s) => s.splitAndKeepRight);
	const separateAudio = useTimelineStore((s) => s.separateAudio);
	const snappingEnabled = useTimelineStore((s) => s.snappingEnabled);
	const toggleSnapping = useTimelineStore((s) => s.toggleSnapping);
	const rippleEditingEnabled = useTimelineStore((s) => s.rippleEditingEnabled);
	const toggleRippleEditing = useTimelineStore((s) => s.toggleRippleEditing);
	const showEffectsTrack = useTimelineStore((s) => s.showEffectsTrack);
	const toggleEffectsTrack = useTimelineStore((s) => s.toggleEffectsTrack);
	const currentTime = usePlaybackStore((s) => s.currentTime);
	const duration = usePlaybackStore((s) => s.duration);
	const isPlaying = usePlaybackStore((s) => s.isPlaying);
	const toggle = usePlaybackStore((s) => s.toggle);
	const toggleBookmark = useProjectStore((s) => s.toggleBookmark);
	const isBookmarked = useProjectStore((s) => s.isBookmarked);
	const { scenes, currentScene } = useSceneStore();

	const handleSplitSelected = () => {
		if (selectedElements.length === 0) return;
		let splitCount = 0;
		for (const { trackId, elementId } of selectedElements) {
			const track = tracks.find((t) => t.id === trackId);
			const element = track?.elements.find((c) => c.id === elementId);
			if (element && track) {
				const effectiveStart = element.startTime;
				const effectiveEnd =
					element.startTime +
					(element.duration - element.trimStart - element.trimEnd);
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
			if (element) {
				const newStartTime =
					element.startTime +
					(element.duration - element.trimStart - element.trimEnd) +
					0.1;
				const { id, ...elementWithoutId } = element;
				addElementToTrack(trackId, {
					...elementWithoutId,
					startTime: newStartTime,
				});
			}
		}
		clearSelectedElements();
	};

	const handleFreezeSelected = () => {
		toast.info("Freeze frame functionality coming soon!");
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
		const effectiveEnd =
			element.startTime +
			(element.duration - element.trimStart - element.trimEnd);
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
		const effectiveEnd =
			element.startTime +
			(element.duration - element.trimStart - element.trimEnd);
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

	const handleDeleteSelected = () => {
		if (selectedElements.length === 0) return;
		for (const { trackId, elementId } of selectedElements) {
			if (rippleEditingEnabled) {
				removeElementFromTrackWithRipple(trackId, elementId);
			} else {
				removeElementFromTrack(trackId, elementId);
			}
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

	const handleSceneManagement = () => {
		toast.info(
			"Scene management coming soon! This will allow you to create and switch between different timeline scenes.",
			{
				duration: 4000,
				action: {
					label: "Learn More",
					onClick: () => {
						debugLog("Scene management documentation");
					},
				},
			}
		);
	};

	const currentBookmarked = isBookmarked(currentTime);

	return (
		<div
			className="flex items-center justify-between px-2 py-1 border-b h-10"
			data-testid="timeline-toolbar"
		>
			<div className="flex items-center gap-1">
				<TooltipProvider delayDuration={500}>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="text"
								size="icon"
								type="button"
								onClick={handleAddMarkdown}
								data-testid="add-markdown-button"
								aria-label="Add markdown at playhead"
							>
								<FileText className="h-4 w-4" aria-hidden="true" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Add markdown at playhead</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="text"
								size="icon"
								onClick={toggle}
								className="mr-2"
								data-testid={
									isPlaying ? "timeline-pause-button" : "timeline-play-button"
								}
								data-playing={isPlaying}
								aria-label={isPlaying ? "Pause" : "Play"}
							>
								{isPlaying ? (
									<Pause className="h-4 w-4" aria-hidden="true" />
								) : (
									<Play className="h-4 w-4" aria-hidden="true" />
								)}
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							{isPlaying ? "Pause (Space)" : "Play (Space)"}
						</TooltipContent>
					</Tooltip>

					<div className="w-px h-6 bg-border mx-1" />
					<div
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
										<Button variant="text" size="icon" aria-label="Scenes">
											<LayersIcon className="h-4 w-4" aria-hidden="true" />
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
								variant="text"
								size="icon"
								onClick={handleSplitSelected}
								data-testid="split-clip-button"
								aria-label="Split element"
							>
								<Scissors className="h-4 w-4" aria-hidden="true" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Split element (Ctrl+S)</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="text"
								size="icon"
								onClick={handleSplitAndKeepLeft}
								aria-label="Split and keep left"
							>
								<ArrowLeftToLine className="h-4 w-4" aria-hidden="true" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Split and keep left (Ctrl+Q)</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="text"
								size="icon"
								onClick={handleSplitAndKeepRight}
								aria-label="Split and keep right"
							>
								<ArrowRightToLine className="h-4 w-4" aria-hidden="true" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Split and keep right (Ctrl+W)</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="text"
								size="icon"
								onClick={handleSeparateAudio}
								aria-label="Separate audio"
							>
								<SplitSquareHorizontal className="h-4 w-4" aria-hidden="true" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Separate audio (Ctrl+D)</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="text"
								size="icon"
								onClick={handleDuplicateSelected}
								aria-label="Duplicate element"
							>
								<Copy className="h-4 w-4" aria-hidden="true" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Duplicate element (Ctrl+D)</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="text"
								size="icon"
								onClick={handleFreezeSelected}
								aria-label="Freeze frame"
							>
								<Snowflake className="h-4 w-4" aria-hidden="true" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Freeze frame (F)</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="text"
								size="icon"
								onClick={handleDeleteSelected}
								aria-label="Delete element"
							>
								<Trash2 className="h-4 w-4" aria-hidden="true" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Delete element (Delete)</TooltipContent>
					</Tooltip>

					<div className="w-px h-6 bg-border mx-1" />

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="text"
								size="icon"
								onClick={handleToggleBookmark}
								aria-pressed={currentBookmarked}
								aria-label={
									currentBookmarked ? "Remove bookmark" : "Add bookmark"
								}
							>
								<Bookmark
									className={`h-4 w-4 ${currentBookmarked ? "fill-primary text-primary" : ""}`}
									aria-hidden="true"
								/>
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							{currentBookmarked ? "Remove bookmark" : "Add bookmark"}
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			</div>

			<div>
				<TooltipProvider delayDuration={500}>
					<Tooltip>
						<TooltipTrigger asChild>
							<SplitButton>
								<SplitButtonLeft disabled>
									{currentScene?.name || "Main scene"}
								</SplitButtonLeft>
								<SplitButtonSeparator />
								<SplitButtonRight
									type="button"
									aria-label="Open scenes menu"
									onClick={handleSceneManagement}
								>
									<LayersIcon className="h-4 w-4" aria-hidden="true" />
								</SplitButtonRight>
							</SplitButton>
						</TooltipTrigger>
						<TooltipContent>
							Scene: {currentScene?.name || "Main scene"} • Click layers to
							manage scenes
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			</div>

			<div className="flex items-center gap-1">
				<TooltipProvider delayDuration={500}>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="text"
								size="icon"
								onClick={toggleSnapping}
								aria-label={
									snappingEnabled ? "Disable snapping" : "Enable snapping"
								}
								aria-pressed={snappingEnabled}
							>
								{snappingEnabled ? (
									<Magnet className="h-4 w-4 text-primary" aria-hidden="true" />
								) : (
									<Magnet className="h-4 w-4" aria-hidden="true" />
								)}
							</Button>
						</TooltipTrigger>
						<TooltipContent>Auto snapping</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="text"
								size="icon"
								onClick={toggleRippleEditing}
								aria-label={
									rippleEditingEnabled
										? "Disable ripple editing"
										: "Enable ripple editing"
								}
								aria-pressed={rippleEditingEnabled}
							>
								<Link
									className={`h-4 w-4 ${
										rippleEditingEnabled ? "text-primary" : ""
									}`}
									aria-hidden="true"
								/>
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							{rippleEditingEnabled
								? "Disable Ripple Editing"
								: "Enable Ripple Editing"}
						</TooltipContent>
					</Tooltip>

					{EFFECTS_ENABLED && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="text"
									size="icon"
									onClick={toggleEffectsTrack}
									aria-label={
										showEffectsTrack
											? "Hide effects track"
											: "Show effects track"
									}
									aria-pressed={showEffectsTrack}
								>
									<Sparkles
										className={`h-4 w-4 ${
											showEffectsTrack ? "text-primary" : ""
										}`}
										aria-hidden="true"
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
						aria-label="Zoom out"
					>
						<ZoomOut className="h-4 w-4" aria-hidden="true" />
					</Button>
					<Slider
						className="w-24"
						value={[zoomLevel]}
						onValueChange={handleZoomSliderChange}
						min={0.05}
						max={4}
						step={0.05}
						data-zoom-level={zoomLevel}
						aria-label="Timeline zoom level"
					/>
					<Button
						variant="text"
						size="icon"
						onClick={handleZoomIn}
						data-testid="zoom-in-button"
						aria-label="Zoom in"
					>
						<ZoomIn className="h-4 w-4" aria-hidden="true" />
					</Button>
				</div>
			</div>
		</div>
	);
}
