import React, { useRef } from "react";
import { useExportStore } from "@/stores/export-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { useAsyncMediaItems } from "@/hooks/use-async-media-store";
import { ExportCanvas, ExportCanvasRef } from "@/components/export-canvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Download, X, AlertTriangle, Square } from "lucide-react";
import {
  ExportQuality,
  ExportFormat,
  QUALITY_RESOLUTIONS,
  FORMAT_INFO,
  isValidFilename,
  EXPORT_PRESETS,
} from "@/types/export";
import { cn } from "@/lib/utils";
import { useElectron } from "@/hooks/useElectron";
import { PlatformIcon } from "@/components/export-icons";

// NEW: Custom hook imports
import { useExportSettings } from "@/hooks/use-export-settings";
import { useExportProgress } from "@/hooks/use-export-progress";
import { useExportValidation } from "@/hooks/use-export-validation";
import { useExportPresets } from "@/hooks/use-export-presets";

export function ExportDialog() {
  const { isDialogOpen, setDialogOpen, error } = useExportStore();
  const { getTotalDuration } = useTimelineStore();
  const {
    mediaItems,
    loading: mediaItemsLoading,
    error: mediaItemsError,
  } = useAsyncMediaItems();

  const canvasRef = useRef<ExportCanvasRef>(null);
  const { isElectron } = useElectron();

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
      // Use the export store's error handling
      useExportStore.getState().setError("Canvas not available for export");
      return;
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

  if (mediaItemsLoading) {
    return (
      <div
        className="h-full flex flex-col bg-background"
        style={{ borderRadius: "0.375rem", overflow: "hidden" }}
      >
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="flex items-center space-x-2">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            <span>Loading export dialog...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-full flex flex-col bg-background"
      style={{ borderRadius: "0.375rem", overflow: "hidden" }}
    >
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

        {exportProgress.progress.isExporting && (
          <div className="space-y-3 p-4 bg-muted/50 rounded-md">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Export Progress</span>
              <span>{exportProgress.progress.progress.toFixed(0)}%</span>
            </div>
            <Progress
              value={exportProgress.progress.progress}
              className="w-full"
            />
            <p className="text-sm text-muted-foreground">
              {exportProgress.progress.status}
            </p>

            {/* Advanced Progress Information */}
            {exportProgress.progress.currentFrame > 0 &&
              exportProgress.progress.totalFrames > 0 && (
                <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground pt-2 border-t border-border">
                  <div>
                    <span className="font-medium">Frames:</span>
                    <span className="ml-1">
                      {exportProgress.progress.currentFrame} /{" "}
                      {exportProgress.progress.totalFrames}
                    </span>
                  </div>
                  {exportProgress.progress.encodingSpeed &&
                    exportProgress.progress.encodingSpeed > 0 && (
                      <div>
                        <span className="font-medium">Speed:</span>
                        <span className="ml-1">
                          {exportProgress.progress.encodingSpeed.toFixed(1)} fps
                        </span>
                      </div>
                    )}
                  {exportProgress.progress.elapsedTime &&
                    exportProgress.progress.elapsedTime > 0 && (
                      <div>
                        <span className="font-medium">Elapsed:</span>
                        <span className="ml-1">
                          {exportProgress.progress.elapsedTime.toFixed(1)}s
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
        <div className="grid grid-cols-2 gap-2 mb-4">
          {EXPORT_PRESETS.map((preset) => (
            <Button
              key={preset.name}
              variant={
                exportPresets.selectedPreset?.name === preset.name
                  ? "default"
                  : "outline"
              }
              size="sm"
              onClick={() => exportPresets.handlePresetSelect(preset)}
              className="text-xs p-3 h-auto overflow-hidden"
              disabled={exportProgress.progress.isExporting}
            >
              <div className="flex flex-col items-center gap-1.5 w-full">
                <PlatformIcon
                  presetId={preset.id}
                  className="size-5 shrink-0"
                />
                <div className="flex flex-col items-center gap-0.5 w-full">
                  <span className="font-medium text-xs">{preset.name}</span>
                  <span className="text-[0.6rem] opacity-70 leading-tight text-center line-clamp-2">
                    {preset.description}
                  </span>
                </div>
              </div>
            </Button>
          ))}
        </div>

        {exportPresets.selectedPreset && (
          <div className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
            <span className="text-sm">
              Using{" "}
              <span className="font-medium">
                {exportPresets.selectedPreset.name}
              </span>{" "}
              preset
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
          <Card className="col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">File Name</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                type="text"
                value={exportSettings.filename}
                onChange={(e) =>
                  exportSettings.handleFilenameChange(e.target.value)
                }
                placeholder="Enter filename"
                disabled={exportProgress.progress.isExporting}
                className="text-sm"
              />
              {!exportValidation.hasValidFilename &&
                exportSettings.filename && (
                  <p className="text-xs text-red-500 mt-1">
                    Invalid filename. Use only letters, numbers, hyphens, and
                    underscores.
                  </p>
                )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Quality</CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={exportSettings.quality}
                onValueChange={(value) =>
                  exportSettings.handleQualityChange(value as ExportQuality)
                }
                disabled={exportProgress.progress.isExporting}
              >
                {Object.values(ExportQuality).map((q) => {
                  const resolution = QUALITY_RESOLUTIONS[q];
                  if (!resolution) return null;
                  return (
                    <div key={q} className="flex items-center space-x-2">
                      <RadioGroupItem value={q} id={q} />
                      <Label htmlFor={q} className="text-sm cursor-pointer">
                        <div>
                          <div className="font-medium">{resolution.label}</div>
                          <div className="text-xs text-muted-foreground">
                            ~{exportSettings.estimatedSize}
                          </div>
                        </div>
                      </Label>
                    </div>
                  );
                })}
              </RadioGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Export Engine</CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={exportSettings.engineType}
                onValueChange={(value) =>
                  exportSettings.setEngineType(
                    value as "standard" | "ffmpeg" | "cli"
                  )
                }
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

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Format</CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={exportSettings.format}
                onValueChange={(value) =>
                  exportSettings.handleFormatChange(value as ExportFormat)
                }
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

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Export Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Resolution:</span>
                  <span className="text-muted-foreground">
                    {exportSettings.resolution?.label || "N/A"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-medium">Est. size:</span>
                  <span className="text-muted-foreground">
                    {exportSettings.estimatedSize}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-medium">Duration:</span>
                  <span
                    className={cn(
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
                <div className="flex justify-between items-center">
                  <span className="font-medium">Format:</span>
                  <span className="text-muted-foreground">
                    {FORMAT_INFO[exportSettings.format].label}
                  </span>
                </div>
                {exportSettings.engineRecommendation && (
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Engine:</span>
                    <span className="text-muted-foreground">
                      {exportSettings.engineRecommendation}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

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
                  {
                    exportValidation.memoryEstimate.recommendation
                      .suggestedQuality
                  }{" "}
                  quality (
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
                Your timeline is very short (
                {exportSettings.timelineDuration.toFixed(2)}s). Consider adding
                more content for a better export result.
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

      <ExportCanvas ref={canvasRef} />
    </div>
  );
}
