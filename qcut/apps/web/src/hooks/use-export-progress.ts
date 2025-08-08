import { useRef, useState } from "react";
import { useExportStore } from "@/stores/export-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { useAsyncMediaItems } from "@/hooks/use-async-media-store";
import { ExportEngine } from "@/lib/export-engine";
import {
  ExportEngineFactory,
  ExportEngineType,
} from "@/lib/export-engine-factory";
import { toast } from "sonner";
import { useElectron } from "@/hooks/useElectron";
import { debugLog, debugError } from "@/lib/debug-config";

export function useExportProgress() {
  const { progress, updateProgress, setError, resetExport, addToHistory } =
    useExportStore();

  const { tracks } = useTimelineStore();
  const { mediaItems } = useAsyncMediaItems();
  const { isElectron } = useElectron();

  const currentEngineRef = useRef<ExportEngine | null>(null);
  const [exportStartTime, setExportStartTime] = useState<Date | null>(null);

  const handleCancel = () => {
    if (currentEngineRef.current && progress.isExporting) {
      currentEngineRef.current.cancel();
      currentEngineRef.current = null;

      updateProgress({
        progress: 0,
        status: "Export cancelled",
        isExporting: false,
      });

      toast.info("Export cancelled by user");

      setTimeout(() => {
        resetExport();
      }, 1000);
    }
  };

  const handleExport = async (
    canvas: HTMLCanvasElement,
    totalDuration: number,
    exportSettings: {
      quality: any;
      format: any;
      filename: string;
      engineType: string;
      resolution: { width: number; height: number };
    }
  ) => {
    // Reset any previous errors
    setError(null);
    resetExport();

    // Record export start time
    const startTime = new Date();
    setExportStartTime(startTime);

    try {
      if (totalDuration === 0) {
        throw new Error(
          "Timeline is empty - add some content before exporting"
        );
      }

      // Create export engine using factory for optimal performance
      const factory = ExportEngineFactory.getInstance();

      // Let factory auto-recommend for Electron, otherwise use manual selection
      let selectedEngineType: ExportEngineType | undefined;
      if (isElectron()) {
        debugLog(
          "[ExportDialog] 🖥️  Electron detected - letting factory auto-recommend engine"
        );
        selectedEngineType = undefined; // Let factory decide
      } else {
        selectedEngineType =
          exportSettings.engineType === "cli"
            ? ExportEngineType.CLI
            : exportSettings.engineType === "ffmpeg"
              ? ExportEngineType.FFMPEG
              : ExportEngineType.STANDARD;
      }

      debugLog("[ExportDialog] 🎬 Creating export engine with settings:", {
        quality: exportSettings.quality,
        format: exportSettings.format,
        filename: exportSettings.filename,
        engineType: selectedEngineType || "auto-recommend",
        resolution: exportSettings.resolution,
        duration: totalDuration,
      });

      const exportEngine = await factory.createEngine(
        canvas,
        {
          quality: exportSettings.quality,
          format: exportSettings.format,
          width: exportSettings.resolution.width,
          height: exportSettings.resolution.height,
          filename: exportSettings.filename,
        },
        tracks,
        mediaItems,
        totalDuration,
        selectedEngineType
      );

      // Store engine reference for cancellation
      currentEngineRef.current = exportEngine;

      debugLog(
        "[ExportDialog] 🚀 Starting export with engine:",
        exportEngine.constructor.name
      );

      // Start export with progress callback
      updateProgress({
        progress: 0,
        status: "Initializing export...",
        isExporting: true,
      });

      const blob = await exportEngine.export((progress, status) => {
        updateProgress({
          progress,
          status,
          isExporting: true,
        });
      });

      debugLog("[ExportDialog] ✅ Export completed successfully");

      // Calculate export duration
      const exportDuration = Date.now() - startTime.getTime();

      // Add to history
      addToHistory({
        filename: exportSettings.filename,
        settings: {
          quality: exportSettings.quality,
          format: exportSettings.format,
          filename: exportSettings.filename,
          width: exportSettings.resolution.width,
          height: exportSettings.resolution.height,
        },
        duration: exportDuration,
        fileSize: blob.size,
        success: true,
      });

      // Reset timing state
      setExportStartTime(null);

      // Create download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = exportSettings.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Show success message
      toast.success("Export completed successfully!", {
        description: `${exportSettings.filename} has been downloaded`,
      });

      // Reset export state
      updateProgress({
        progress: 100,
        status: "Export completed",
        isExporting: false,
      });

      // Clean up engine reference
      currentEngineRef.current = null;
    } catch (error: any) {
      debugError("[ExportDialog] Export failed:", error);

      // Calculate partial export duration
      const exportDuration = Date.now() - startTime.getTime();

      // Add failed attempt to history
      addToHistory({
        filename: exportSettings.filename,
        settings: {
          quality: exportSettings.quality,
          format: exportSettings.format,
          filename: exportSettings.filename,
          width: exportSettings.resolution.width,
          height: exportSettings.resolution.height,
        },
        duration: exportDuration,
        fileSize: 0,
        success: false,
        error: error.message,
      });

      setError(error.message);

      updateProgress({
        progress: 0,
        status: `Export failed: ${error.message}`,
        isExporting: false,
      });

      // Reset timing state
      setExportStartTime(null);

      // Clean up engine reference
      currentEngineRef.current = null;

      // Show error toast
      toast.error("Export failed", {
        description: error.message,
      });
    }
  };

  return {
    progress,
    exportStartTime,
    currentEngineRef,
    handleCancel,
    handleExport,
  };
}
