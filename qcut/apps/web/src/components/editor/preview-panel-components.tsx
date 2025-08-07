"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Play, Pause, Expand, SkipBack, SkipForward } from "lucide-react";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { usePlaybackStore } from "@/stores/playback-store";
import { useEditorStore } from "@/stores/editor-store";
import { useProjectStore } from "@/stores/project-store";
import { useAspectRatio } from "@/hooks/use-aspect-ratio"; // 🔴 CRITICAL - WAS MISSING
import { cn } from "@/lib/utils";
import { formatTimeCode } from "@/lib/time";
import { EditableTimecode } from "@/components/ui/editable-timecode";
import { BackgroundSettings } from "../background-settings";
import { TimelineElement, TimelineTrack } from "@/types/timeline";
import type { MediaItem } from "@/stores/media-store-types";

// 🔴 CRITICAL - ADD THIS INTERFACE (used by FullscreenPreview)
interface ActiveElement {
  element: TimelineElement;
  track: TimelineTrack;
  mediaItem: MediaItem | null;
}

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
  const { isPlaying, seek } = usePlaybackStore();
  const { activeProject } = useProjectStore();
  const [isDragging, setIsDragging] = useState(false);

  const totalDuration = getTotalDuration();
  const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

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
          variant="text"
          size="icon"
          onClick={skipBackward}
          disabled={!hasAnyElements}
          className="h-auto p-0 text-white hover:text-white/80"
          title="Skip backward 1s"
        >
          <SkipBack className="h-3 w-3" />
        </Button>
        <Button
          variant="text"
          size="icon"
          onClick={toggle}
          disabled={!hasAnyElements}
          className="h-auto p-0 text-white hover:text-white/80"
        >
          {isPlaying ? (
            <Pause className="h-3 w-3" />
          ) : (
            <Play className="h-3 w-3" />
          )}
        </Button>
        <Button
          variant="text"
          size="icon"
          onClick={skipForward}
          disabled={!hasAnyElements}
          className="h-auto p-0 text-white hover:text-white/80"
          title="Skip forward 1s"
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
  activeProject: any;
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
    <div className="fixed inset-0 z-9999 flex flex-col">
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
            activeElements.map((elementData, index) =>
              renderElement(elementData, index)
            )
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
}: {
  hasAnyElements: boolean;
  onToggleExpanded: () => void;
  isExpanded: boolean;
  currentTime: number;
  setCurrentTime: (time: number) => void;
  toggle: () => void;
  getTotalDuration: () => number;
}) {
  const { isPlaying, seek } = usePlaybackStore();
  const { setCanvasSize, setCanvasSizeToOriginal } = useEditorStore();
  const { activeProject } = useProjectStore();
  const {
    currentPreset,
    isOriginal,
    getOriginalAspectRatio,
    getDisplayName,
    canvasPresets,
  } = useAspectRatio();

  const handlePresetSelect = (preset: { width: number; height: number }) => {
    setCanvasSize({ width: preset.width, height: preset.height });
  };

  const handleOriginalSelect = () => {
    const aspectRatio = getOriginalAspectRatio();
    setCanvasSizeToOriginal(aspectRatio);
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
          variant="text"
          size="icon"
          onClick={skipBackward}
          disabled={!hasAnyElements}
          className="h-auto p-0 text-white hover:text-white/80"
          title="Skip backward 1s"
        >
          <SkipBack className="h-3 w-3" />
        </Button>
        <Button
          variant="text"
          size="icon"
          onClick={toggle}
          disabled={!hasAnyElements}
          className="h-auto p-0 text-white hover:text-white/80"
        >
          {isPlaying ? (
            <Pause className="h-3 w-3" />
          ) : (
            <Play className="h-3 w-3" />
          )}
        </Button>
        <Button
          variant="text"
          size="icon"
          onClick={skipForward}
          disabled={!hasAnyElements}
          className="h-auto p-0 text-white hover:text-white/80"
          title="Skip forward 1s"
        >
          <SkipForward className="h-3 w-3" />
        </Button>
      </div>
      <div className="flex items-center gap-3">
        <BackgroundSettings />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              className="bg-panel-accent! text-foreground/85 text-[0.70rem] h-4 rounded-none border border-muted-foreground px-0.5 py-0 font-light"
              disabled={!hasAnyElements}
            >
              {getDisplayName()}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={handleOriginalSelect}
              className={cn("text-xs", isOriginal && "font-semibold")}
            >
              Original
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
          variant="text"
          size="icon"
          className="size-4! text-muted-foreground"
          onClick={onToggleExpanded}
          title="Enter fullscreen"
        >
          <Expand className="size-4!" />
        </Button>
      </div>
    </div>
  );
}