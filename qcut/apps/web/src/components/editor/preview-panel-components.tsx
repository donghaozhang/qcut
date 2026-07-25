"use client";

import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
	Play,
	Pause,
	Expand,
	SkipBack,
	SkipForward,
	MonitorPlay,
	AppWindow,
	Bot,
	ScanLine,
} from "lucide-react";
import { useState } from "react";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useEditorStore } from "@/stores/editor/editor-store";
import { useProjectStore } from "@/stores/project-store";
import { useAspectRatio } from "@/hooks/media/use-aspect-ratio";
import { cn } from "@/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatTimeCode } from "@/lib/time";
import { EditableTimecode } from "@/components/ui/editable-timecode";
import { BackgroundSettings } from "../background-settings";
import type { TProject } from "@/types/project";
import type { ActiveElement } from "./preview-panel/types";
import { AdjustmentLayerStack } from "./preview-panel/adjustment-layer-stack";
import { useTranslation } from "@/lib/i18n";
import { PREVIEW_QUALITY_OPTIONS } from "@/lib/preview/preview-quality";

// Component 1: FullscreenToolbar (no dependencies)
export function FullscreenToolbar({
	hasAnyElements,
	onToggleExpanded,
	currentTime,
	setCurrentTime,
	toggle,
	getTotalDuration,
}: {
	hasAnyElements: boolean;
	onToggleExpanded: () => void;
	currentTime: number;
	setCurrentTime: (time: number) => void;
	toggle: () => void;
	getTotalDuration: () => number;
}) {
	const { t } = useTranslation();
	const { isPlaying, seek } = usePlaybackStore();
	const { activeProject } = useProjectStore();
	const [isDragging, setIsDragging] = useState(false);

	const totalDuration = getTotalDuration();
	const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

	const handleToggleClick = () => {
		console.log("[PLAYBACK] Play/Pause button clicked", {
			isPlaying,
			currentTime,
			totalDuration,
		});
		toggle();
	};

	const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
		if (!hasAnyElements) return;
		const rect = e.currentTarget.getBoundingClientRect();
		const clickX = e.clientX - rect.left;
		const percentage = Math.max(0, Math.min(1, clickX / rect.width));
		const newTime = percentage * totalDuration;
		setCurrentTime(Math.max(0, Math.min(newTime, totalDuration)));
	};

	const handleTimelineDrag = (e: React.MouseEvent<HTMLDivElement>) => {
		if (!hasAnyElements) return;
		e.preventDefault();
		e.stopPropagation();
		const rect = e.currentTarget.getBoundingClientRect();
		setIsDragging(true);

		const handleMouseMove = (moveEvent: MouseEvent) => {
			moveEvent.preventDefault();
			const dragX = moveEvent.clientX - rect.left;
			const percentage = Math.max(0, Math.min(1, dragX / rect.width));
			const newTime = percentage * totalDuration;
			setCurrentTime(Math.max(0, Math.min(newTime, totalDuration)));
		};

		const handleMouseUp = () => {
			setIsDragging(false);
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
			document.body.style.userSelect = "";
		};

		document.body.style.userSelect = "none";
		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);
		handleMouseMove(e.nativeEvent);
	};

	const skipBackward = () => {
		const newTime = Math.max(0, currentTime - 1);
		setCurrentTime(newTime);
	};

	const skipForward = () => {
		const newTime = Math.min(totalDuration, currentTime + 1);
		setCurrentTime(newTime);
	};

	return (
		<div
			data-toolbar
			className="flex items-center gap-2 p-1 pt-2 w-full text-white"
		>
			<div className="flex items-center gap-1 text-[0.70rem] tabular-nums text-white/90">
				<EditableTimecode
					time={currentTime}
					duration={totalDuration}
					format="HH:MM:SS:FF"
					fps={activeProject?.fps || 30}
					onTimeChange={seek}
					disabled={!hasAnyElements}
					className="text-white/90 hover:bg-white/10"
				/>
				<span className="opacity-50">/</span>
				<span>
					{formatTimeCode(
						totalDuration,
						"HH:MM:SS:FF",
						activeProject?.fps || 30
					)}
				</span>
			</div>

			<div className="flex items-center gap-1">
				<Button
					type="button"
					variant="text"
					size="icon"
					onClick={skipBackward}
					disabled={!hasAnyElements}
					className="h-auto p-0 text-white hover:text-white/80"
					title={t("editor.preview.backOneSecond")}
				>
					<SkipBack className="h-3 w-3" />
				</Button>
				<Button
					type="button"
					variant="text"
					size="icon"
					onClick={handleToggleClick}
					disabled={!hasAnyElements}
					className="h-auto p-0 text-white hover:text-white/80"
					data-testid={
						isPlaying ? "preview-pause-button" : "preview-play-button"
					}
					data-playing={isPlaying}
					aria-label={
						isPlaying ? t("editor.preview.pause") : t("editor.preview.play")
					}
				>
					{isPlaying ? (
						<Pause className="h-3 w-3" />
					) : (
						<Play className="h-3 w-3" />
					)}
				</Button>
				<Button
					type="button"
					variant="text"
					size="icon"
					onClick={skipForward}
					disabled={!hasAnyElements}
					className="h-auto p-0 text-white hover:text-white/80"
					title={t("editor.preview.forwardOneSecond")}
				>
					<SkipForward className="h-3 w-3" />
				</Button>
			</div>

			<div className="flex-1 flex items-center gap-2">
				<div
					className={cn(
						"relative h-1 rounded-full cursor-pointer flex-1 bg-white/20",
						!hasAnyElements && "opacity-50 cursor-not-allowed"
					)}
					onClick={hasAnyElements ? handleTimelineClick : undefined}
					onMouseDown={hasAnyElements ? handleTimelineDrag : undefined}
					style={{ userSelect: "none" }}
				>
					<div
						className={cn(
							"absolute top-0 left-0 h-full rounded-full bg-white",
							!isDragging && "duration-100"
						)}
						style={{ width: `${progress}%` }}
					/>
					<div
						className="absolute top-1/2 w-3 h-3 rounded-full -translate-y-1/2 -translate-x-1/2 shadow-xs bg-white border border-black/20"
						style={{ left: `${progress}%` }}
					/>
				</div>
			</div>

			<Button
				variant="text"
				size="icon"
				className="size-4! text-white/80 hover:text-white"
				onClick={onToggleExpanded}
				title="Exit fullscreen (Esc)"
			>
				<Expand className="size-4!" />
			</Button>
		</div>
	);
}

// Component 2: FullscreenPreview (depends on FullscreenToolbar)
export function FullscreenPreview({
	previewDimensions,
	activeProject,
	renderBlurBackground,
	activeElements,
	renderElement,
	blurBackgroundElements,
	hasAnyElements,
	toggleExpanded,
	currentTime,
	setCurrentTime,
	toggle,
	getTotalDuration,
}: {
	previewDimensions: { width: number; height: number };
	activeProject: TProject | null;
	renderBlurBackground: () => React.ReactNode;
	activeElements: ActiveElement[];
	renderElement: (elementData: ActiveElement, index: number) => React.ReactNode;
	blurBackgroundElements: ActiveElement[];
	hasAnyElements: boolean;
	toggleExpanded: () => void;
	currentTime: number;
	setCurrentTime: (time: number) => void;
	toggle: () => void;
	getTotalDuration: () => number;
}) {
	return (
		<div
			className="fixed inset-0 z-9999 flex flex-col"
			data-testid="fullscreen-preview"
		>
			<div className="flex-1 flex items-center justify-center bg-background">
				<div
					className="relative overflow-hidden border border-border m-3"
					style={{
						width: previewDimensions.width,
						height: previewDimensions.height,
						backgroundColor:
							activeProject?.backgroundType === "blur"
								? "#1a1a1a"
								: activeProject?.backgroundColor || "#1a1a1a",
					}}
				>
					{renderBlurBackground()}
					{activeElements.length === 0 ? (
						<div className="absolute inset-0 flex items-center justify-center text-white/60">
							No elements at current time
						</div>
					) : (
						<AdjustmentLayerStack
							activeElements={activeElements}
							currentTime={currentTime}
							fps={activeProject?.fps ?? 30}
							renderElement={renderElement}
						/>
					)}

					{activeProject?.backgroundType === "blur" &&
						blurBackgroundElements.length === 0 &&
						activeElements.length > 0 && (
							<div className="absolute bottom-2 left-2 right-2 bg-black/70 text-white text-xs p-2 rounded">
								Add a video or image to use blur background
							</div>
						)}
				</div>
			</div>
			<div className="p-4 bg-black">
				<FullscreenToolbar
					hasAnyElements={hasAnyElements}
					onToggleExpanded={toggleExpanded}
					currentTime={currentTime}
					setCurrentTime={setCurrentTime}
					toggle={toggle}
					getTotalDuration={getTotalDuration}
				/>
			</div>
		</div>
	);
}

// Component 3: PreviewToolbar (depends on FullscreenToolbar)
export function PreviewToolbar({
	hasAnyElements,
	onToggleExpanded,
	isExpanded,
	currentTime,
	setCurrentTime,
	toggle,
	getTotalDuration,
	previewScale,
	onPreviewScaleChange,
	showSafeAreas,
	onToggleSafeAreas,
}: {
	hasAnyElements: boolean;
	onToggleExpanded: () => void;
	isExpanded: boolean;
	currentTime: number;
	setCurrentTime: (time: number) => void;
	toggle: () => void;
	getTotalDuration: () => number;
	previewScale: "fit" | 75 | 100 | 125 | 150;
	onPreviewScaleChange: (scale: "fit" | 75 | 100 | 125 | 150) => void;
	showSafeAreas: boolean;
	onToggleSafeAreas: () => void;
}) {
	const { t } = useTranslation();
	const { isPlaying, seek, previewQuality, setPreviewQuality } =
		usePlaybackStore();
	const { setCanvasSize, setCanvasSizeToOriginal } = useEditorStore();
	const { activeProject, updateProjectCanvasSize } = useProjectStore();
	const {
		currentPreset,
		isOriginal,
		getOriginalAspectRatio,
		getDisplayName,
		canvasPresets,
	} = useAspectRatio();

	const handleToggleClick = () => {
		console.log("[PLAYBACK] Play/Pause button clicked", {
			action: isPlaying ? "pause" : "play",
			previousState: isPlaying ? "playing" : "paused",
			currentTime: Number(currentTime.toFixed(3)),
			willPause: isPlaying,
			willPlay: !isPlaying,
		});
		toggle();
	};

	const handlePresetSelect = (preset: { width: number; height: number }) => {
		const nextSize = { width: preset.width, height: preset.height };
		setCanvasSize(nextSize, "preset");
		void updateProjectCanvasSize(nextSize, "preset");
	};

	const handleOriginalSelect = () => {
		const aspectRatio = getOriginalAspectRatio();
		setCanvasSizeToOriginal(aspectRatio);
		const nextSize = useEditorStore.getState().canvasSize;
		void updateProjectCanvasSize(nextSize, "original");
	};

	const totalDuration = getTotalDuration();

	const skipBackward = () => {
		const newTime = Math.max(0, currentTime - 1);
		setCurrentTime(newTime);
	};

	const skipForward = () => {
		const newTime = Math.min(totalDuration, currentTime + 1);
		setCurrentTime(newTime);
	};

	if (isExpanded) {
		return (
			<FullscreenToolbar
				{...{
					hasAnyElements,
					onToggleExpanded,
					currentTime,
					setCurrentTime,
					toggle,
					getTotalDuration,
				}}
			/>
		);
	}

	return (
		<div
			data-toolbar
			className="flex items-end justify-between gap-2 p-1 pt-2 w-full"
		>
			<div>
				<p
					className={cn(
						"text-[0.75rem] text-muted-foreground flex items-center gap-1 w-[10rem]",
						!hasAnyElements && "opacity-50"
					)}
				>
					<EditableTimecode
						time={currentTime}
						duration={getTotalDuration()}
						format="HH:MM:SS:FF"
						fps={activeProject?.fps || 30}
						onTimeChange={seek}
						disabled={!hasAnyElements}
					/>
					<span className="opacity-50">/</span>
					<span className="tabular-nums">
						{formatTimeCode(
							getTotalDuration(),
							"HH:MM:SS:FF",
							activeProject?.fps || 30
						)}
					</span>
				</p>
			</div>
			<div className="flex items-center gap-1">
				<Button
					type="button"
					variant="text"
					size="icon"
					onClick={skipBackward}
					disabled={!hasAnyElements}
					className="h-auto p-0 text-white hover:text-white/80"
					title={t("editor.preview.backOneSecond")}
				>
					<SkipBack className="h-3 w-3" />
				</Button>
				<Button
					type="button"
					variant="text"
					size="icon"
					onClick={handleToggleClick}
					disabled={!hasAnyElements}
					className="h-auto p-0 text-white hover:text-white/80"
					data-testid={
						isPlaying ? "preview-pause-button" : "preview-play-button"
					}
					data-playing={isPlaying}
					aria-label={
						isPlaying ? t("editor.preview.pause") : t("editor.preview.play")
					}
				>
					{isPlaying ? (
						<Pause className="h-3 w-3" />
					) : (
						<Play className="h-3 w-3" />
					)}
				</Button>
				<Button
					type="button"
					variant="text"
					size="icon"
					onClick={skipForward}
					disabled={!hasAnyElements}
					className="h-auto p-0 text-white hover:text-white/80"
					title={t("editor.preview.forwardOneSecond")}
				>
					<SkipForward className="h-3 w-3" />
				</Button>
			</div>
			<div className="flex items-center gap-3">
				<BackgroundSettings />
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							type="button"
							variant="text"
							size="sm"
							className="h-5 min-w-14 px-1 text-[10px] text-muted-foreground"
							disabled={!hasAnyElements}
							aria-label={t("editor.preview.quality")}
							title={t("editor.preview.quality")}
							data-testid="preview-quality-button"
						>
							{t(
								PREVIEW_QUALITY_OPTIONS.find(
									(option) => option.value === previewQuality
								)?.labelKey ?? PREVIEW_QUALITY_OPTIONS[0].labelKey
							)}
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="min-w-40">
						{PREVIEW_QUALITY_OPTIONS.map((option) => (
							<DropdownMenuItem
								key={option.value}
								onClick={() => setPreviewQuality(option.value)}
								className={cn(
									"flex flex-col items-start gap-0.5 text-xs",
									previewQuality === option.value && "font-semibold"
								)}
							>
								<span>{t(option.labelKey)}</span>
								<span className="text-[10px] font-normal text-muted-foreground">
									{t(option.descriptionKey)}
								</span>
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							type="button"
							variant="text"
							size="sm"
							className="h-5 min-w-10 px-1 text-[10px] text-muted-foreground"
							aria-label={t("editor.preview.scale")}
							title={t("editor.preview.scale")}
						>
							{previewScale === "fit"
								? t("editor.preview.fit")
								: `${previewScale}%`}
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{(["fit", 75, 100, 125, 150] as const).map((scale) => (
							<DropdownMenuItem
								key={scale}
								onClick={() => onPreviewScaleChange(scale)}
								className={cn(
									"text-xs",
									previewScale === scale && "font-semibold"
								)}
							>
								{scale === "fit" ? t("editor.preview.fitPanel") : `${scale}%`}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
				<Button
					type="button"
					variant={showSafeAreas ? "default" : "text"}
					size="icon"
					className="size-5! text-muted-foreground"
					onClick={onToggleSafeAreas}
					onKeyDown={(event) => {
						if (event.key !== "Enter" && event.key !== " ") return;
						event.preventDefault();
						onToggleSafeAreas();
					}}
					aria-label={
						showSafeAreas
							? t("editor.preview.hideSafeAreas")
							: t("editor.preview.showSafeAreas")
					}
					aria-pressed={showSafeAreas}
					title={t("editor.preview.safeAreas")}
				>
					<ScanLine className="size-4" />
				</Button>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							type="button"
							size="sm"
							className="bg-panel-accent! text-foreground/85 text-[0.70rem] h-4 rounded-none border border-muted-foreground px-0.5 py-0 font-light"
							disabled={!hasAnyElements}
						>
							{isOriginal ? t("editor.preview.original") : getDisplayName()}
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem
							onClick={handleOriginalSelect}
							className={cn("text-xs", isOriginal && "font-semibold")}
						>
							{t("editor.preview.original")}
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						{canvasPresets.map((preset) => (
							<DropdownMenuItem
								key={preset.name}
								onClick={() => handlePresetSelect(preset)}
								className={cn(
									"text-xs",
									currentPreset?.name === preset.name && "font-semibold"
								)}
							>
								{preset.name}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
				<Button
					type="button"
					variant="text"
					size="icon"
					className="size-4! text-muted-foreground"
					onClick={onToggleExpanded}
					title={t("editor.preview.fullscreen")}
				>
					<Expand className="size-4!" />
				</Button>
			</div>
		</div>
	);
}

/** Shared mode toggle for switching between Video / MCP / Agent preview modes. */
export function PreviewModeToggle({
	value,
	onValueChange,
}: {
	value: string;
	onValueChange: (mode: string) => void;
}) {
	const { t } = useTranslation();

	return (
		<ToggleGroup
			type="single"
			value={value}
			onValueChange={onValueChange}
			size="sm"
			className="h-7"
		>
			<ToggleGroupItem
				value="video"
				aria-label={t("editor.preview.videoLabel")}
				className="px-2 py-1 text-xs gap-1"
			>
				<MonitorPlay className="size-3" />
				<span className="hidden sm:inline">{t("editor.preview.video")}</span>
			</ToggleGroupItem>
			<ToggleGroupItem
				value="mcp"
				aria-label={t("editor.preview.mcpLabel")}
				className="px-2 py-1 text-xs gap-1"
			>
				<AppWindow className="size-3" />
				<span className="hidden sm:inline">{t("editor.preview.mcp")}</span>
			</ToggleGroupItem>
			<ToggleGroupItem
				value="agent"
				aria-label={t("editor.preview.agentLabel")}
				className="px-2 py-1 text-xs gap-1"
			>
				<Bot className="size-3" />
				<span className="hidden sm:inline">{t("editor.preview.agent")}</span>
			</ToggleGroupItem>
		</ToggleGroup>
	);
}
