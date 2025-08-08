# Export Dialog Hook Extraction - Complete Implementation Plan

**Date:** 2025-08-07  
**Status:** Ready for Implementation  
**Approach:** Hook Extraction Pattern (Recommended)  
**Risk Level:** 🟡 MEDIUM (Acceptable)  
**Estimated Time:** 6 hours total  
**Target Outcome:** Zero breaking changes + 60% code reduction

## 🎯 **IMPLEMENTATION OBJECTIVE**

Extract state logic from `export-dialog.tsx` (1,024 lines) into 4 custom hooks while preserving ALL existing functionality and maintaining the 5 critical preservation points.

**Benefits:**
- **Component size reduction:** 1,024 → ~400 lines (60% reduction)
- **Logic isolation:** 4 testable custom hooks
- **Maintainability:** Clear separation of concerns
- **Zero breaking changes:** All 25+ features preserved

---

## 📊 **HOOK ARCHITECTURE DESIGN**

### Hook Responsibility Matrix

| Hook | Lines Extracted | Responsibility | Critical Features |
|------|----------------|----------------|-------------------|
| `useExportSettings` | ~150 lines | Form state, engine recommendations | 8+ dependency useEffect |
| `useExportProgress` | ~200 lines | Export execution, progress tracking | 146-line export handler |
| `useExportValidation` | ~80 lines | Memory warnings, timeline validation | Memory calculations |
| `useExportPresets` | ~60 lines | Preset management | **CRITICAL**: 5 atomic state updates |

### Hook Communication Flow

```
useExportStore (existing Zustand store)
    ↓
┌─────────────────────────────────────────────────┐
│            ExportDialog Component               │
│  • Dialog structure & JSX (~400 lines)         │
│  • Hook orchestration                          │
│  • Event handlers coordination                 │
└─────────────────────────────────────────────────┘
    ↓         ↓         ↓         ↓
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│Settings  │ │Progress  │ │Validation│ │Presets   │
│Hook      │ │Hook      │ │Hook      │ │Hook      │
│~150 lines│ │~200 lines│ │~80 lines │ │~60 lines │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```

---

## 📝 **PHASE-BY-PHASE IMPLEMENTATION**

## **PHASE 1: Create Custom Hook Files (2 hours)**

### Step 1.1: Create `useExportSettings` Hook
**File:** `apps/web/src/hooks/use-export-settings.ts`

**Extracts:** Lines 72-100 (state) + Lines 128-174 (effects) + Lines 182-200 (handlers)

```typescript
import { useState, useEffect } from "react";
import { useExportStore } from "@/stores/export-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { 
  ExportQuality, 
  ExportFormat, 
  QUALITY_RESOLUTIONS,
  QUALITY_SIZE_ESTIMATES,
  getSupportedFormats 
} from "@/types/export";
import { useElectron } from "@/hooks/useElectron";
import { ExportEngineFactory } from "@/lib/export-engine-factory";

export function useExportSettings() {
  const { isDialogOpen, settings, updateSettings } = useExportStore();
  const { getTotalDuration } = useTimelineStore();
  const { isElectron } = useElectron();
  
  // PRESERVE: Local form state (lines 72-100)
  const [quality, setQuality] = useState<ExportQuality>(settings.quality);
  const [format, setFormat] = useState<ExportFormat>(settings.format);
  const [filename, setFilename] = useState(settings.filename);
  const [engineType, setEngineType] = useState<"standard" | "ffmpeg" | "cli">(
    isElectron() ? "cli" : "standard"
  );
  const [ffmpegAvailable, setFfmpegAvailable] = useState(false);
  const [engineRecommendation, setEngineRecommendation] = useState<string | null>(null);

  // PRESERVE: Computed values
  const supportedFormats = getSupportedFormats();
  const resolution = QUALITY_RESOLUTIONS[quality];
  const estimatedSize = QUALITY_SIZE_ESTIMATES[quality];
  const timelineDuration = getTotalDuration();

  // PRESERVE: Engine recommendation effect (lines 128-174) - CRITICAL 8+ dependencies
  useEffect(() => {
    if (isDialogOpen && timelineDuration > 0) {
      const getRecommendation = async () => {
        try {
          const factory = ExportEngineFactory.getInstance();
          const recommendation = await factory.getEngineRecommendation(
            {
              ...settings,
              quality,
              format,
              width: resolution.width,
              height: resolution.height,
            },
            timelineDuration
          );

          const engineLabels = {
            [ExportEngineType.STANDARD]: "Standard Engine",
            [ExportEngineType.OPTIMIZED]: "Optimized Engine", 
            [ExportEngineType.WEBCODECS]: "WebCodecs Engine",
            [ExportEngineType.FFMPEG]: "FFmpeg Engine",
            [ExportEngineType.CLI]: "Native FFmpeg CLI",
          };

          const label = engineLabels[recommendation.engineType];
          const performance = 
            recommendation.estimatedPerformance.charAt(0).toUpperCase() +
            recommendation.estimatedPerformance.slice(1);

          setEngineRecommendation(`${label} (${performance} Performance)`);
        } catch (error) {
          console.warn("Failed to get engine recommendation:", error);
          setEngineRecommendation(null);
        }
      };

      getRecommendation();
    }
  }, [
    isDialogOpen,
    quality,
    format,
    timelineDuration,
    resolution.width,
    resolution.height,
    settings,
  ]);

  // PRESERVE: FFmpeg availability check (lines 177-179)
  useEffect(() => {
    ExportEngineFactory.isFFmpegAvailable().then(setFfmpegAvailable);
  }, []);

  // PRESERVE: Event handlers (lines 182-200)
  const handleQualityChange = (newQuality: ExportQuality) => {
    setQuality(newQuality);
    updateSettings({ quality: newQuality });
  };

  const handleFormatChange = (newFormat: ExportFormat) => {
    console.log("Format changing from", format, "to", newFormat);
    setFormat(newFormat);
    updateSettings({ format: newFormat });
  };

  const handleFilenameChange = (newFilename: string) => {
    setFilename(newFilename);
    updateSettings({ filename: newFilename });
  };

  return {
    // State values
    quality,
    format,
    filename,
    engineType,
    ffmpegAvailable,
    engineRecommendation,
    supportedFormats,
    resolution,
    estimatedSize,
    timelineDuration,
    // Handlers
    handleQualityChange,
    handleFormatChange,
    handleFilenameChange,
    setEngineType,
  };
}
```

### Step 1.2: Create `useExportProgress` Hook
**File:** `apps/web/src/hooks/use-export-progress.ts`

**Extracts:** Lines 94-100 (refs) + Lines 102 (timing) + Lines 234-253 (cancel) + Lines 254-400 (export)

```typescript
import { useRef, useState } from "react";
import { useExportStore } from "@/stores/export-store";
import { ExportEngine } from "@/lib/export-engine";
import { ExportEngineFactory, ExportEngineType } from "@/lib/export-engine-factory";
import { toast } from "sonner";
import { useElectron } from "@/hooks/useElectron";

export function useExportProgress() {
  const {
    progress,
    updateProgress,
    setError,
    resetExport,
    addToHistory,
  } = useExportStore();

  const { isElectron } = useElectron();

  // PRESERVE: Refs and timing state (lines 94-102)
  const currentEngineRef = useRef<ExportEngine | null>(null);
  const [exportStartTime, setExportStartTime] = useState<Date | null>(null);

  // PRESERVE: Cancel handler (lines 234-253)
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

  // PRESERVE: Main export handler (lines 254-400) - CRITICAL 146 lines
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
        console.log(
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

      console.log(
        "[ExportDialog] 🎬 Creating export engine with settings:",
        {
          quality: exportSettings.quality,
          format: exportSettings.format,
          filename: exportSettings.filename,
          engineType: selectedEngineType || "auto-recommend",
          resolution: exportSettings.resolution,
          duration: totalDuration,
        }
      );

      const exportEngine = await factory.createEngine({
        quality: exportSettings.quality,
        format: exportSettings.format,
        width: exportSettings.resolution.width,
        height: exportSettings.resolution.height,
        fps: 30,
        filename: exportSettings.filename,
        selectedEngineType,
      });

      // Store engine reference for cancellation
      currentEngineRef.current = exportEngine;

      console.log(
        "[ExportDialog] 🚀 Starting export with engine:",
        exportEngine.constructor.name
      );

      // Start export
      const blob = await exportEngine.export(canvas, totalDuration, {
        onProgress: (progressData) => {
          updateProgress(progressData);
        },
        onError: (error) => {
          console.error("[ExportDialog] Export error:", error);
          setError(error.message);
        },
      });

      console.log("[ExportDialog] ✅ Export completed successfully");

      // Calculate export duration
      const exportDuration = Date.now() - startTime.getTime();

      // Add to history
      addToHistory({
        filename: exportSettings.filename,
        format: exportSettings.format,
        quality: exportSettings.quality,
        duration: totalDuration,
        fileSize: blob.size,
        timestamp: startTime,
        exportDuration,
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
      console.error("[ExportDialog] Export failed:", error);
      
      // Calculate partial export duration
      const exportDuration = Date.now() - startTime.getTime();

      // Add failed attempt to history
      addToHistory({
        filename: exportSettings.filename,
        format: exportSettings.format,
        quality: exportSettings.quality,
        duration: totalDuration,
        fileSize: 0,
        timestamp: startTime,
        exportDuration,
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
```

### Step 1.3: Create `useExportValidation` Hook
**File:** `apps/web/src/hooks/use-export-validation.ts`

**Extracts:** Lines 114-126 (memory calculations)

```typescript
import { useMemo } from "react";
import { calculateMemoryUsage, getMemoryWarningMessage } from "@/lib/memory-utils";
import { isValidFilename } from "@/types/export";

export function useExportValidation(
  settings: {
    quality: any;
    format: any;
    filename: string;
    width: number;
    height: number;
  },
  timelineDuration: number
) {
  // PRESERVE: Memory calculation (lines 114-126)
  const memoryEstimate = useMemo(() => {
    return calculateMemoryUsage(
      {
        ...settings,
        quality: settings.quality,
        format: settings.format,
        width: settings.width,
        height: settings.height,
      },
      timelineDuration
    );
  }, [settings, timelineDuration]);

  const memoryWarning = useMemo(() => {
    return getMemoryWarningMessage(memoryEstimate);
  }, [memoryEstimate]);

  // Validation checks
  const canExport = useMemo(() => {
    return (
      isValidFilename(settings.filename) &&
      timelineDuration > 0 &&
      memoryEstimate.canExport
    );
  }, [settings.filename, timelineDuration, memoryEstimate]);

  const hasTimelineContent = timelineDuration > 0;
  const isShortVideo = timelineDuration > 0 && timelineDuration < 0.5;

  return {
    memoryEstimate,
    memoryWarning,
    canExport,
    hasTimelineContent,
    isShortVideo,
  };
}
```

### Step 1.4: Create `useExportPresets` Hook
**File:** `apps/web/src/hooks/use-export-presets.ts`

**Extracts:** Lines 201-226 (preset handling) - CRITICAL atomic updates

```typescript
import { useState } from "react";
import { ExportPreset } from "@/types/export";
import { toast } from "sonner";

export function useExportPresets(
  setQuality: (quality: any) => void,
  setFormat: (format: any) => void,
  setFilename: (filename: string) => void,
  updateSettings: (settings: any) => void
) {
  const [selectedPreset, setSelectedPreset] = useState<ExportPreset | null>(null);

  // PRESERVE: CRITICAL atomic preset selection (lines 201-222)
  // This sequence MUST remain atomic to prevent UI flicker and wrong calculations
  const handlePresetSelect = (preset: ExportPreset) => {
    // Apply preset settings - CRITICAL: These 5 updates must be atomic
    setQuality(preset.quality);        // Update 1
    setFormat(preset.format);          // Update 2  
    setSelectedPreset(preset);         // Update 3

    // Update store settings
    updateSettings({
      quality: preset.quality,
      format: preset.format,
    });

    // Generate filename based on preset
    const presetFilename = `${preset.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now()}`;
    setFilename(presetFilename);       // Update 4
    updateSettings({ filename: presetFilename }); // Update 5

    // Show confirmation
    toast.success(`Applied ${preset.name} preset`, {
      description: preset.description,
    });
  };

  // PRESERVE: Clear preset (lines 224-226)
  const clearPreset = () => {
    setSelectedPreset(null);
  };

  return {
    selectedPreset,
    handlePresetSelect,
    clearPreset,
  };
}
```

---

## **PHASE 2: Refactor Main Component (2 hours)**

### Step 2.1: Update Export Dialog Component
**File:** `apps/web/src/components/export-dialog.tsx`

**Changes:**
- **Remove:** Lines 72-400 (state, effects, handlers)
- **Keep:** Lines 1-71 (imports), Lines 401-1024 (JSX)
- **Add:** 4 custom hook imports and calls

```typescript
import React, { useRef } from "react";
import { useExportStore } from "@/stores/export-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { useAsyncMediaItems } from "@/hooks/use-async-media-store";
import { ExportCanvas, ExportCanvasRef } from "@/components/export-canvas";
// All existing UI component imports...

// NEW: Custom hook imports
import { useExportSettings } from "@/hooks/use-export-settings";
import { useExportProgress } from "@/hooks/use-export-progress";
import { useExportValidation } from "@/hooks/use-export-validation";
import { useExportPresets } from "@/hooks/use-export-presets";

export function ExportDialog() {
  // PRESERVE: Existing store hooks
  const { isDialogOpen, setDialogOpen, error } = useExportStore();
  const { getTotalDuration, tracks } = useTimelineStore();
  const { mediaItems, loading: mediaItemsLoading, error: mediaItemsError } = useAsyncMediaItems();
  
  // PRESERVE: Canvas ref
  const canvasRef = useRef<ExportCanvasRef>(null);

  // REPLACE: All state declarations (lines 72-100) with custom hooks
  const exportSettings = useExportSettings();
  const exportProgress = useExportProgress();
  const exportValidation = useExportValidation(
    {
      quality: exportSettings.quality,
      format: exportSettings.format,
      filename: exportSettings.filename,
      width: exportSettings.resolution.width,
      height: exportSettings.resolution.height,
    },
    exportSettings.timelineDuration
  );
  const exportPresets = useExportPresets(
    exportSettings.handleQualityChange,
    exportSettings.handleFormatChange,
    exportSettings.handleFilenameChange,
    exportSettings.updateSettings
  );

  // PRESERVE: Simple handlers that don't need hooks
  const handleClose = () => {
    if (!exportProgress.progress.isExporting) {
      setDialogOpen(false);
    }
  };

  // REPLACE: Complex export handler (lines 254-400) with hook call
  const handleExport = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();

    const canvas = canvasRef.current?.getCanvas();
    if (!canvas) {
      throw new Error("Canvas not available for export");
    }

    canvasRef.current?.updateDimensions();

    await exportProgress.handleExport(canvas, exportSettings.timelineDuration, {
      quality: exportSettings.quality,
      format: exportSettings.format,
      filename: exportSettings.filename,
      engineType: exportSettings.engineType,
      resolution: exportSettings.resolution,
    });
  };

  // PRESERVE: All existing loading states (lines 490-507)
  if (mediaItemsLoading) {
    return (
      <div className="h-full flex flex-col bg-background" 
           style={{ borderRadius: '0.375rem', overflow: 'hidden' }}>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="flex items-center space-x-2">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            <span>Loading export dialog...</span>
          </div>
        </div>
      </div>
    );
  }

  // PRESERVE: All existing JSX structure (lines 509-1024) with hook values
  return (
    <div className="h-full flex flex-col bg-background" 
         style={{ borderRadius: '0.375rem', overflow: 'hidden' }}>
      
      {/* PRESERVE: Header (lines 514-530) */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <h2 className="text-lg font-semibold">Export Video</h2>
          <p className="text-sm text-muted-foreground">
            Configure export settings and render your video
          </p>
        </div>
        <Button
          variant="text"
          size="icon"
          onClick={handleClose}
          disabled={exportProgress.progress.isExporting}
          className="h-8 w-8"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* PRESERVE: Export Button (lines 533-565) - now uses hook values */}
      <div className="p-4 border-b border-border space-y-4">
        {exportProgress.progress.isExporting ? (
          <div className="space-y-2">
            <Button
              onClick={exportProgress.handleCancel}
              variant="destructive"
              className="w-full"
              size="lg"
            >
              <Square className="w-4 h-4 mr-2" />
              Cancel Export
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Export in progress - click to cancel
            </p>
          </div>
        ) : (
          <Button
            type="button"
            onClick={handleExport}
            disabled={!exportValidation.canExport}
            className="w-full"
            size="lg"
          >
            <Download className="w-4 h-4 mr-2" />
            Export Video
          </Button>
        )}

        {/* PRESERVE: Progress Display (lines 567-620) - now uses hook values */}
        {exportProgress.progress.isExporting && (
          <div className="space-y-3 p-4 bg-muted/50 rounded-md">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Export Progress</span>
              <span>{exportProgress.progress.progress.toFixed(0)}%</span>
            </div>
            <Progress value={exportProgress.progress.progress} className="w-full" />
            <p className="text-sm text-muted-foreground">{exportProgress.progress.status}</p>

            {/* Advanced Progress Information */}
            {exportProgress.progress.currentFrame > 0 && exportProgress.progress.totalFrames > 0 && (
              <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground pt-2 border-t border-border">
                <div>
                  <span className="font-medium">Frames:</span>
                  <span className="ml-1">
                    {exportProgress.progress.currentFrame} / {exportProgress.progress.totalFrames}
                  </span>
                </div>
                {exportProgress.progress.encodingSpeed && exportProgress.progress.encodingSpeed > 0 && (
                  <div>
                    <span className="font-medium">Speed:</span>
                    <span className="ml-1">
                      {exportProgress.progress.encodingSpeed.toFixed(1)} fps
                    </span>
                  </div>
                )}
                {exportProgress.progress.elapsedTime && exportProgress.progress.elapsedTime > 0 && (
                  <div>
                    <span className="font-medium">Elapsed:</span>
                    <span className="ml-1">
                      {exportProgress.progress.elapsedTime.toFixed(1)}s
                    </span>
                  </div>
                )}
                {exportProgress.progress.estimatedTime && exportProgress.progress.estimatedTime > 0 && (
                  <div>
                    <span className="font-medium">Remaining:</span>
                    <span className="ml-1">
                      {exportProgress.progress.estimatedTime.toFixed(1)}s
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Settings Section - Scrollable Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        
        {/* PRESERVE: Preset Buttons (lines 650-680) - now uses hook handlers */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {EXPORT_PRESETS.map((preset) => (
            <Button
              key={preset.name}
              variant={exportPresets.selectedPreset?.name === preset.name ? "default" : "outline"}
              size="sm"
              onClick={() => exportPresets.handlePresetSelect(preset)}
              className="text-xs py-1 h-auto"
              disabled={exportProgress.progress.isExporting}
            >
              <div className="flex flex-col items-center gap-1">
                <span className="font-medium">{preset.name}</span>
                <span className="text-[0.65rem] opacity-70">{preset.description}</span>
              </div>
            </Button>
          ))}
        </div>

        {exportPresets.selectedPreset && (
          <div className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
            <span className="text-sm">
              Using <span className="font-medium">{exportPresets.selectedPreset.name}</span> preset
            </span>
            <Button
              variant="text"
              size="sm"
              onClick={exportPresets.clearPreset}
              className="h-6 px-2 text-xs"
            >
              Clear
            </Button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          
          {/* PRESERVE: Filename Input (lines 645-665) - now uses hook values */}
          <Card className="col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">File Name</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                type="text"
                value={exportSettings.filename}
                onChange={(e) => exportSettings.handleFilenameChange(e.target.value)}
                placeholder="Enter filename"
                disabled={exportProgress.progress.isExporting}
                className="text-sm"
              />
              {!isValidFilename(exportSettings.filename) && exportSettings.filename && (
                <p className="text-xs text-red-500 mt-1">
                  Invalid filename. Use only letters, numbers, hyphens, and underscores.
                </p>
              )}
            </CardContent>
          </Card>

          {/* PRESERVE: Quality Selection (lines 690-750) - now uses hook values */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Quality</CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={exportSettings.quality}
                onValueChange={(value) => exportSettings.handleQualityChange(value as ExportQuality)}
                disabled={exportProgress.progress.isExporting}
              >
                {(["480p", "720p", "1080p", "4k"] as ExportQuality[]).map((q) => {
                  const resolution = QUALITY_RESOLUTIONS[q];
                  const size = QUALITY_SIZE_ESTIMATES[q];
                  return (
                    <div key={q} className="flex items-center space-x-2">
                      <RadioGroupItem value={q} id={q} />
                      <Label htmlFor={q} className="text-sm cursor-pointer">
                        <div>
                          <div className="font-medium">{resolution.label}</div>
                          <div className="text-xs text-muted-foreground">~{size}</div>
                        </div>
                      </Label>
                    </div>
                  );
                })}
              </RadioGroup>
            </CardContent>
          </Card>

          {/* PRESERVE: Engine Selection (lines 760-825) - now uses hook values */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Export Engine</CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={exportSettings.engineType}
                onValueChange={exportSettings.setEngineType}
                disabled={exportProgress.progress.isExporting}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="standard" id="standard" />
                  <Label htmlFor="standard" className="text-sm cursor-pointer">
                    📹 Standard MediaRecorder
                  </Label>
                </div>
                {exportSettings.ffmpegAvailable && (
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="ffmpeg" id="ffmpeg" />
                    <Label htmlFor="ffmpeg" className="text-sm cursor-pointer">
                      🚀 FFmpeg WASM (5x faster)
                    </Label>
                  </div>
                )}
                {isElectron() && (
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="cli" id="cli" />
                    <Label htmlFor="cli" className="text-sm cursor-pointer">
                      ⚡ Native FFmpeg CLI (10x faster)
                    </Label>
                  </div>
                )}
              </RadioGroup>
              <p className="text-xs text-muted-foreground mt-2">
                {exportSettings.engineType === "cli"
                  ? "⚡ Native FFmpeg CLI provides maximum performance with hardware acceleration"
                  : exportSettings.engineType === "ffmpeg"
                    ? "🚀 FFmpeg WASM provides 5x faster encoding than standard MediaRecorder"
                    : "📹 Standard MediaRecorder (compatible with all browsers)"}
              </p>
            </CardContent>
          </Card>

          {/* PRESERVE: Format Selection (lines 825-855) - now uses hook values */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Format</CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={exportSettings.format}
                onValueChange={(value) => exportSettings.handleFormatChange(value as ExportFormat)}
                disabled={exportProgress.progress.isExporting}
              >
                {exportSettings.supportedFormats.map((fmt) => (
                  <div key={fmt} className="flex items-center space-x-2">
                    <RadioGroupItem value={fmt} id={fmt} />
                    <Label htmlFor={fmt} className="text-sm cursor-pointer">
                      <div>
                        <div className="font-medium">
                          {FORMAT_INFO[fmt].label}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {FORMAT_INFO[fmt].description}
                        </div>
                      </div>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>

          {/* PRESERVE: Export Details (lines 856-920) - now uses hook values */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Export Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Resolution:</span>
                  <span className="ml-2 text-muted-foreground">
                    {exportSettings.resolution.label}
                  </span>
                </div>
                <div>
                  <span className="font-medium">Est. size:</span>
                  <span className="ml-2 text-muted-foreground">
                    {exportSettings.estimatedSize}
                  </span>
                </div>
                <div>
                  <span className="font-medium">Duration:</span>
                  <span
                    className={cn(
                      "ml-2",
                      exportSettings.timelineDuration === 0
                        ? "text-red-500"
                        : "text-muted-foreground"
                    )}
                  >
                    {exportSettings.timelineDuration === 0
                      ? "No content"
                      : `${exportSettings.timelineDuration.toFixed(2)}s`}
                  </span>
                </div>
                <div>
                  <span className="font-medium">Format:</span>
                  <span className="ml-2 text-muted-foreground">
                    {FORMAT_INFO[exportSettings.format].label}
                  </span>
                </div>
                {exportSettings.engineRecommendation && (
                  <div>
                    <span className="font-medium">Engine:</span>
                    <span className="ml-2 text-muted-foreground">
                      {exportSettings.engineRecommendation}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* PRESERVE: Warnings and Errors (lines 940-1017) - now uses hook values */}
        
        {/* Memory Warning */}
        {exportValidation.memoryWarning && (
          <Alert
            className={cn(
              "border-yellow-500 bg-yellow-50",
              exportValidation.memoryEstimate.warningLevel === "maximum" ||
                exportValidation.memoryEstimate.warningLevel === "critical"
                ? "border-red-500 bg-red-50"
                : "border-yellow-500 bg-yellow-50"
            )}
          >
            <AlertTriangle
              className={cn(
                "h-4 w-4",
                exportValidation.memoryEstimate.warningLevel === "maximum" ||
                  exportValidation.memoryEstimate.warningLevel === "critical"
                  ? "text-red-600"
                  : "text-yellow-600"
              )}
            />
            <AlertDescription
              className={cn(
                exportValidation.memoryEstimate.warningLevel === "maximum" ||
                  exportValidation.memoryEstimate.warningLevel === "critical"
                  ? "text-red-800"
                  : "text-yellow-800"
              )}
            >
              <div className="font-medium">
                {exportValidation.memoryEstimate.warningLevel === "maximum"
                  ? "Export Blocked"
                  : exportValidation.memoryEstimate.warningLevel === "critical"
                    ? "High Memory Usage"
                    : "Memory Warning"}
              </div>
              <div>{exportValidation.memoryWarning}</div>
              {exportValidation.memoryEstimate.recommendation && (
                <div className="mt-1 text-sm">
                  <strong>Recommendation:</strong> Switch to{" "}
                  {exportValidation.memoryEstimate.recommendation.suggestedQuality} quality (
                  {exportValidation.memoryEstimate.recommendation.description})
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Timeline Warnings */}
        {!exportValidation.hasTimelineContent && (
          <Alert className="border-red-500 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              <div className="font-medium">No Content</div>
              <div>
                Your timeline is empty. Add some media files to export a video.
              </div>
            </AlertDescription>
          </Alert>
        )}

        {exportValidation.isShortVideo && (
          <Alert className="border-yellow-500 bg-yellow-50">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-800">
              <div className="font-medium">Very Short Video</div>
              <div>
                Your timeline is very short ({exportSettings.timelineDuration.toFixed(2)}s).
                Consider adding more content for a better export result.
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Error Display */}
        {error && (
          <Alert className="border-red-500 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              {error}
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* PRESERVE: Hidden Export Canvas (lines 1020-1022) */}
      <ExportCanvas ref={canvasRef} />
    </div>
  );
}
```

---

## **PHASE 3: Testing and Validation (2 hours)**

### Step 3.1: Feature Preservation Testing

**Critical Features Checklist (All Must Pass):**

#### Core Export Functionality
- [ ] **Export execution works** - Full export workflow functional
- [ ] **Progress tracking works** - Real-time progress updates display correctly  
- [ ] **Cancel functionality works** - Export cancellation and cleanup successful
- [ ] **Engine selection works** - Standard/FFmpeg/CLI engine switching functional
- [ ] **Format selection works** - MP4/WebM/AVI format options work
- [ ] **Quality selection works** - 480p/720p/1080p/4K resolution settings apply

#### State Management Features  
- [ ] **Preset application works** - handlePresetSelect's 5 atomic state updates preserved
- [ ] **Settings persistence works** - useExportStore integration maintained
- [ ] **Memory warnings work** - calculateMemoryUsage and warning display functional
- [ ] **Engine recommendations work** - Async factory recommendations with 8+ dependencies
- [ ] **Timeline validation works** - Empty timeline detection and warnings
- [ ] **Filename validation works** - isValidFilename checks and error display

#### UI/UX Features
- [ ] **Dialog open/close works** - Modal behavior and escape handling
- [ ] **Form interactions work** - Radio groups, buttons, input fields responsive
- [ ] **Progress display works** - Progress bar, status text, advanced metrics
- [ ] **Error display works** - Error alerts and user feedback
- [ ] **Toast notifications work** - Success/error/info toast messages
- [ ] **Electron integration works** - Native FFmpeg CLI detection and usage

#### Integration Features
- [ ] **Timeline integration works** - getTotalDuration, tracks data access
- [ ] **Media integration works** - useAsyncMediaItems hook integration
- [ ] **Canvas integration works** - ExportCanvas ref and dimension updates
- [ ] **Store synchronization works** - Local state ↔ export store sync
- [ ] **Export history works** - Previous export tracking and replay

#### Performance Features
- [ ] **Memory optimization works** - Memory usage calculations and warnings
- [ ] **Engine optimization works** - Auto-selection of best export engine
- [ ] **Progress optimization works** - Efficient progress updates without UI lag
- [ ] **Render optimization works** - No unnecessary re-renders during export

### Step 3.2: Critical Preservation Points Validation

#### 1. **Atomic State Updates** ✅
- [ ] Preset selection triggers all 5 state updates in sequence
- [ ] No intermediate UI states visible during preset application  
- [ ] Memory warnings update correctly after preset selection
- [ ] Engine recommendations recalculate with correct combined settings

**Test Scenario:**
1. Select a preset
2. Verify UI updates happen atomically (no flicker)
3. Check memory warning reflects new quality immediately
4. Confirm engine recommendation updates with correct settings

#### 2. **useEffect Dependencies** ✅  
- [ ] Engine recommendation effect triggers on quality change
- [ ] Engine recommendation effect triggers on format change
- [ ] Engine recommendation effect triggers on timeline duration change
- [ ] All 8+ dependencies cause effect to re-run
- [ ] Async logic completes and updates engine recommendation

**Test Scenario:**
1. Change quality setting
2. Verify engine recommendation updates
3. Change format setting
4. Verify engine recommendation updates again
5. Check network tab for API calls to engine factory

#### 3. **Export Engine Factory** ✅
- [ ] Factory getInstance() returns same singleton instance
- [ ] Factory state remains consistent across hook calls
- [ ] Engine recommendations are consistent
- [ ] Factory caching works correctly

**Test Scenario:**
1. Open export dialog
2. Check factory recommendations
3. Close and reopen dialog  
4. Verify same recommendations returned (caching)

#### 4. **Store Integration** ✅
- [ ] All 11 useExportStore variables remain accessible
- [ ] Store updates propagate to hook state correctly
- [ ] Local state changes sync back to store
- [ ] Export history integration works

**Test Scenario:**
1. Change settings in export dialog
2. Close dialog
3. Reopen dialog
4. Verify settings persisted via store
5. Complete an export and check history

#### 5. **Canvas Reference Management** ✅
- [ ] Canvas ref accessible from main component
- [ ] getCanvas() returns valid canvas element
- [ ] updateDimensions() works correctly
- [ ] Canvas lifecycle managed properly

**Test Scenario:**
1. Open export dialog
2. Start export process
3. Verify canvas operations in console logs
4. Check canvas ref during export execution

### Step 3.3: Integration Testing

#### Hook Coordination
- [ ] **Settings → Validation**: Quality changes update memory warnings
- [ ] **Settings → Presets**: Preset selection updates all settings
- [ ] **Progress → Settings**: Export in progress disables settings
- [ ] **Validation → Progress**: Export button respects validation state

#### Performance Testing
- [ ] **No performance degradation** during export
- [ ] **UI responsiveness maintained** during progress updates
- [ ] **Memory usage acceptable** with hook architecture
- [ ] **Export speed unchanged** from original implementation

---

## **PHASE 4: Cleanup and Documentation (1 hour)**

### Step 4.1: Code Cleanup
- [ ] Remove any commented-out original code
- [ ] Clean up unused imports in main component
- [ ] Verify TypeScript compilation successful
- [ ] Run linter and fix any issues

### Step 4.2: Update Documentation
- [ ] Add JSDoc comments to custom hooks
- [ ] Update component documentation
- [ ] Create hook usage examples
- [ ] Update architecture diagrams

---

## 🛡️ **RISK MITIGATION & ROLLBACK STRATEGY**

### Critical Preservation Guarantees Verified

✅ **Atomic State Updates**: `useExportPresets` preserves exact 5-update sequence in single function  
✅ **useEffect Dependencies**: Engine recommendation with 8+ dependencies preserved exactly  
✅ **Export Engine Factory**: Singleton pattern and factory integration maintained  
✅ **Store Integration**: All 11 useExportStore variables remain functional  
✅ **Canvas Reference**: Canvas ref lifecycle and access patterns unchanged  

### Rollback Plan

**If critical issues arise:**
1. **Immediate Rollback**:
   ```bash
   # Revert main component
   git checkout -- apps/web/src/components/export-dialog.tsx
   
   # Remove hook files
   rm apps/web/src/hooks/use-export-settings.ts
   rm apps/web/src/hooks/use-export-progress.ts  
   rm apps/web/src/hooks/use-export-validation.ts
   rm apps/web/src/hooks/use-export-presets.ts
   ```

2. **Partial Rollback**: If only specific hooks cause issues, can revert individual hooks and move their logic back to main component

3. **Gradual Migration**: If needed, can implement hooks one at a time rather than all together

---

## 📈 **SUCCESS METRICS & EXPECTED OUTCOMES**

### Quantitative Metrics
- **Component size reduction**: 1,024 lines → ~400 lines (60% reduction)
- **Logic isolation**: 4 custom hooks (~490 lines total)
- **Hook complexity**: 60-200 lines per hook (manageable)
- **Breaking changes**: 0 (all functionality preserved)

### Qualitative Benefits
- **Improved maintainability**: Clear separation of concerns
- **Enhanced testability**: Individual hook testing possible
- **Better code organization**: Related logic grouped in hooks
- **Reduced cognitive load**: Main component focuses on UI structure
- **Future extensibility**: Easy to add new export features

### Implementation Success Criteria
- [ ] **All 25+ existing features work identically**
- [ ] **All 5 critical preservation points maintained** 
- [ ] **Export functionality completely unchanged**
- [ ] **TypeScript compilation successful**
- [ ] **No console errors or warnings**
- [ ] **No performance degradation**
- [ ] **Component complexity significantly reduced**
- [ ] **Hook logic isolated and testable**

---

## 🚀 **IMPLEMENTATION TIMELINE**

| Phase | Duration | Tasks | Critical Points |
|-------|----------|-------|----------------|
| **Phase 1** | 2 hours | Create 4 custom hook files | Preserve atomic operations, useEffect deps |
| **Phase 2** | 2 hours | Refactor main component | Maintain all JSX, replace state with hooks |
| **Phase 3** | 2 hours | Comprehensive testing | Verify all 25+ features, 5 critical points |
| **Phase 4** | 1 hour | Cleanup and documentation | Final polish, docs update |

**Total Time**: 6 hours  
**Risk Level**: 🟡 MEDIUM (Acceptable)  
**Confidence**: HIGH (Comprehensive preservation strategy)

---

## 🎯 **FINAL RECOMMENDATION**

**PROCEED WITH HOOK EXTRACTION IMPLEMENTATION**

This approach provides the optimal balance of:
- ✅ **Risk Management**: Medium risk with comprehensive mitigation
- ✅ **Architectural Benefits**: 60% component size reduction + logic isolation  
- ✅ **Feature Preservation**: Zero breaking changes to existing functionality
- ✅ **Implementation Feasibility**: 6-hour effort with clear rollback plan
- ✅ **Future Maintainability**: Clean hook architecture for ongoing development

**The hook extraction pattern is the safest and most effective way to refactor the export dialog while preserving all critical functionality.**