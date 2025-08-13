"use client";

import { useDragDrop } from "@/hooks/use-drag-drop";
import { processMediaFiles } from "@/lib/media-processing";
import { useAsyncMediaStore } from "@/hooks/use-async-media-store";
import type { MediaItem } from "@/stores/media-store-types";
import { Image, Loader2, Music, Plus, Video, Edit, Layers } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MediaDragOverlay } from "@/components/editor/media-panel/drag-overlay";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DraggableMediaItem } from "@/components/ui/draggable-item";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ExportAllButton } from "../export-all-button";
import { useAdjustmentStore } from "@/stores/adjustment-store";
import { useMediaPanelStore } from "../store";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";

export function MediaView() {
  const {
    store: mediaStore,
    loading: mediaStoreLoading,
    error: mediaStoreError,
  } = useAsyncMediaStore();
  const mediaItems = mediaStore?.mediaItems || [];
  const addMediaItem = mediaStore?.addMediaItem;
  const removeMediaItem = mediaStore?.removeMediaItem;
  const { activeProject } = useProjectStore();
  const { setOriginalImage } = useAdjustmentStore();
  const { setActiveTab } = useMediaPanelStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [mediaFilter, setMediaFilter] = useState("all");
  const [filteredMediaItems, setFilteredMediaItems] = useState(mediaItems);

  // Media store state monitoring (debug removed)
  // useEffect(() => {
  //   // Debug logging removed - media store working correctly
  // }, [mediaItems, activeProject, mediaStore, mediaStoreLoading]);

  useEffect(() => {
    const filtered = mediaItems.filter((item) => {
      if (mediaFilter && mediaFilter !== "all" && item.type !== mediaFilter) {
        return false;
      }

      if (
        searchQuery &&
        !item.name.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }

      return true;
    });

    setFilteredMediaItems(filtered);
  }, [mediaItems, mediaFilter, searchQuery]);

  const processFiles = async (files: FileList | File[]) => {
    console.log(
      "[Media View] 🚀 processFiles called with",
      files?.length || 0,
      "files"
    );

    if (!files || files.length === 0) {
      console.log("[Media View] ❌ No files provided");
      return;
    }
    if (!activeProject) {
      console.log("[Media View] ❌ No active project");
      toast.error("No active project");
      return;
    }

    console.log(
      "[Media View] ▶️ Starting upload process for project:",
      activeProject.id
    );
    setIsProcessing(true);
    setProgress(0);

    try {
      console.log("[Media View] 📋 File details:");
      Array.from(files).forEach((file, i) => {
        console.log(
          `  ${i + 1}. ${file.name} (${file.type}, ${(file.size / 1024 / 1024).toFixed(2)} MB)`
        );
      });

      // Process files (extract metadata, generate thumbnails, etc.)
      console.log("[Media View] 🔧 Calling processMediaFiles...");
      const processedItems = await processMediaFiles(files, (p) => {
        console.log(`[Media View] 📊 Upload progress: ${p}%`);
        setProgress(p);
      });

      console.log(
        "[Media View] ✅ processMediaFiles completed, got",
        processedItems.length,
        "processed items"
      );

      // Add each processed media item to the store
      console.log("[Media View] 💾 Adding items to media store...");
      for (const [index, item] of processedItems.entries()) {
        console.log(
          `[Media View] ➕ Adding item ${index + 1}/${processedItems.length}:`,
          item.name
        );
        if (!addMediaItem) {
          throw new Error("Media store not ready");
        }
        await addMediaItem(activeProject.id, item);
        console.log(`[Media View] ✅ Item ${index + 1} added successfully`);
      }

      console.log("[Media View] 🎉 Upload process completed successfully!");
      toast.success(`Successfully uploaded ${processedItems.length} file(s)`);
    } catch (error) {
      // Show error toast if processing fails
      console.error("[Media View] ❌ Upload process failed:", error);
      toast.error("Failed to process files");
    } finally {
      console.log("[Media View] 🏁 Cleaning up upload process...");
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const { isDragOver, dragProps } = useDragDrop({
    // When files are dropped, process them
    onDrop: processFiles,
  });

  const handleFileSelect = () => fileInputRef.current?.click(); // Open file picker

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // When files are selected via file picker, process them
    if (e.target.files) processFiles(e.target.files);
    e.target.value = ""; // Reset input
  };

  const handleRemove = async (e: React.MouseEvent, id: string) => {
    // Remove a media item from the store
    e.stopPropagation();

    if (!activeProject) {
      toast.error("No active project");
      return;
    }

    // Media store now handles cascade deletion automatically
    if (removeMediaItem) {
      await removeMediaItem(activeProject.id, id);
    } else {
      toast.error("Media store not loaded");
    }
  };

  const handleEdit = async (e: React.MouseEvent, item: MediaItem) => {
    // Send image to adjustment panel for editing
    e.stopPropagation();

    if (item.type !== "image") {
      toast.error("Only images can be edited");
      return;
    }

    if (!item.file) {
      toast.error("Image file not available for editing");
      return;
    }

    try {
      // Set the original image in the adjustment store
      const imageUrl = item.url || URL.createObjectURL(item.file);
      setOriginalImage(item.file, imageUrl);

      // Switch to adjustment tab
      setActiveTab("adjustment");

      toast.success(`"${item.name}" loaded in adjustment panel`);
    } catch (error) {
      console.error("Failed to load image for editing:", error);
      toast.error("Failed to load image for editing");
    }
  };

  const formatDuration = (duration: number) => {
    // Format seconds as mm:ss
    const min = Math.floor(duration / 60);
    const sec = Math.floor(duration % 60);
    return `${min}:${sec.toString().padStart(2, "0")}`;
  };

  // Handle media store loading/error states
  if (mediaStoreError) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-center">
          <div className="text-red-500 mb-2">Failed to load media store</div>
          <div className="text-sm text-muted-foreground">
            {mediaStoreError.message}
          </div>
        </div>
      </div>
    );
  }

  if (mediaStoreLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center space-x-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading media library...</span>
        </div>
      </div>
    );
  }

  const renderPreview = (item: MediaItem) => {
    // Render a preview for each media type (image, video, audio, unknown)
    if (item.type === "image") {
      return (
        <div className="w-full h-full flex items-center justify-center">
          <img
            src={item.url}
            alt={item.name}
            className="max-w-full max-h-full object-contain"
            loading="lazy"
          />
        </div>
      );
    }

    if (item.type === "video") {
      if (item.thumbnailUrl) {
        return (
          <div className="relative w-full h-full">
            <img
              src={item.thumbnailUrl}
              alt={item.name}
              className="w-full h-full object-cover rounded"
              loading="lazy"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded">
              <Video className="h-6 w-6 text-white drop-shadow-md" />
            </div>
            {item.duration && (
              <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1 rounded">
                {formatDuration(item.duration)}
              </div>
            )}
          </div>
        );
      }
      return (
        <div className="w-full h-full bg-muted/30 flex flex-col items-center justify-center text-muted-foreground rounded">
          <Video className="h-6 w-6 mb-1" />
          <span className="text-xs">Video</span>
          {item.duration && (
            <span className="text-xs opacity-70">
              {formatDuration(item.duration)}
            </span>
          )}
        </div>
      );
    }

    if (item.type === "audio") {
      return (
        <div className="w-full h-full bg-linear-to-br from-green-500/20 to-emerald-500/20 flex flex-col items-center justify-center text-muted-foreground rounded border border-green-500/20">
          <Music className="h-6 w-6 mb-1" />
          <span className="text-xs">Audio</span>
          {item.duration && (
            <span className="text-xs opacity-70">
              {formatDuration(item.duration)}
            </span>
          )}
        </div>
      );
    }

    return (
      <div className="w-full h-full bg-muted/30 flex flex-col items-center justify-center text-muted-foreground rounded">
        <Image className="h-6 w-6" />
        <span className="text-xs mt-1">Unknown</span>
      </div>
    );
  };

  return (
    <>
      {/* Hidden file input for uploading media */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,audio/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
        aria-label="Upload media files"
      />

      <div
        className={`h-full flex flex-col gap-1 transition-colors relative ${isDragOver ? "bg-accent/30" : ""}`}
        {...dragProps}
      >
        <div className="p-3 pb-2 bg-panel">
          {/* Search and filter controls */}
          <div className="flex gap-2">
            <Select value={mediaFilter} onValueChange={setMediaFilter}>
              <SelectTrigger className="w-[80px] h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="video">Video</SelectItem>
                <SelectItem value="audio">Audio</SelectItem>
                <SelectItem value="image">Image</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="text"
              placeholder="Search media..."
              className="min-w-[60px] flex-1 h-9 text-xs"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Button
              variant="outline"
              size="lg"
              onClick={handleFileSelect}
              disabled={isProcessing}
              className="flex-none bg-transparent min-w-[30px] whitespace-nowrap overflow-hidden px-2 justify-center items-center h-9"
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </Button>
            <ExportAllButton variant="outline" size="sm" className="h-9" />
          </div>
        </div>

        <ScrollArea className="h-full">
          <div className="flex-1 p-3 pt-0">
            {isDragOver || filteredMediaItems.length === 0 ? (
              <MediaDragOverlay
                isVisible={true}
                isProcessing={isProcessing}
                progress={progress}
                onClick={handleFileSelect}
                isEmptyState={filteredMediaItems.length === 0 && !isDragOver}
              />
            ) : (
              <div
                className="grid gap-2"
                style={{
                  gridTemplateColumns: "repeat(auto-fill, 160px)",
                }}
              >
                {/* Render each media item as a draggable button */}
                {filteredMediaItems.map((item) => (
                  <ContextMenu key={item.id}>
                    <ContextMenuTrigger>
                      <DraggableMediaItem
                        name={item.name}
                        preview={renderPreview(item)}
                        dragData={{
                          id: item.id,
                          type: item.type,
                          name: item.name,
                        }}
                        showPlusOnDrag={false}
                        onAddToTimeline={(currentTime) =>
                          useTimelineStore
                            .getState()
                            .addMediaAtTime(item, currentTime)
                        }
                        rounded={false}
                      />
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem>Export clips</ContextMenuItem>
                      {(item.type === "image" || item.type === "video") && (
                        <ContextMenuItem 
                          onClick={(e) => {
                            e.stopPropagation();
                            const { addOverlaySticker } = useStickersOverlayStore.getState();
                            addOverlaySticker(item.id);
                            toast.success(`Added "${item.name}" as overlay`);
                          }}
                        >
                          <Layers className="h-4 w-4 mr-2" />
                          Add as Overlay
                        </ContextMenuItem>
                      )}
                      {item.type === "image" && (
                        <ContextMenuItem onClick={(e) => handleEdit(e, item)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </ContextMenuItem>
                      )}
                      <ContextMenuItem
                        variant="destructive"
                        onClick={(e) => handleRemove(e, item.id)}
                      >
                        Delete
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </>
  );
}
