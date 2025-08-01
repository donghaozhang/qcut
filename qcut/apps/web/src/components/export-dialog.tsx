import React, { useState, useRef, useEffect } from "react";
import { useExportStore } from "@/stores/export-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { useMediaStore } from "@/stores/media-store";
import { ExportCanvas, ExportCanvasRef } from "@/components/export-canvas";
import { ExportEngine } from "@/lib/export-engine";
import { ExportEngineFactory, ExportEngineType } from "@/lib/export-engine-factory";
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
  QUALITY_SIZE_ESTIMATES,
  FORMAT_INFO,
  getSupportedFormats,
  isValidFilename,
  EXPORT_PRESETS,
  ExportPreset
} from "@/types/export";
import { calculateMemoryUsage, getMemoryWarningMessage } from "@/lib/memory-utils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function ExportDialog() {
  const { 
    isDialogOpen, 
    setDialogOpen, 
    settings, 
    updateSettings, 
    progress,
    updateProgress,
    setError,
    resetExport,
    error 
  } = useExportStore();
  
  const { getTotalDuration, tracks } = useTimelineStore();
  const { mediaItems } = useMediaStore();
  const canvasRef = useRef<ExportCanvasRef>(null);
  
  // Local state for form inputs
  const [quality, setQuality] = useState<ExportQuality>(settings.quality);
  const [format, setFormat] = useState<ExportFormat>(settings.format);
  const [filename, setFilename] = useState(settings.filename);
  
  // Get supported formats
  const supportedFormats = getSupportedFormats();
  
  // Engine recommendation state
  const [engineRecommendation, setEngineRecommendation] = useState<string | null>(null);
  
  // Current export engine reference for cancellation
  const currentEngineRef = useRef<ExportEngine | null>(null);
  
  // Preset selection state
  const [selectedPreset, setSelectedPreset] = useState<ExportPreset | null>(null);

  // Helper functions
  const getResolution = (quality: ExportQuality) => QUALITY_RESOLUTIONS[quality];
  const getEstimatedSize = (quality: ExportQuality) => QUALITY_SIZE_ESTIMATES[quality];
  const timelineDuration = getTotalDuration();
  const resolution = getResolution(quality);
  const estimatedSize = getEstimatedSize(quality);
  
  // Calculate memory usage
  const memoryEstimate = calculateMemoryUsage({
    ...settings,
    quality,
    format,
    width: resolution.width,
    height: resolution.height
  }, timelineDuration);
  
  const memoryWarning = getMemoryWarningMessage(memoryEstimate);

  // Get engine recommendation when dialog opens or settings change
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
              height: resolution.height
            },
            timelineDuration
          );
          
          const engineLabels = {
            [ExportEngineType.STANDARD]: "Standard Engine",
            [ExportEngineType.OPTIMIZED]: "Optimized Engine", 
            [ExportEngineType.WEBCODECS]: "WebCodecs Engine"
          };
          
          const label = engineLabels[recommendation.engineType];
          const performance = recommendation.estimatedPerformance.charAt(0).toUpperCase() + 
                            recommendation.estimatedPerformance.slice(1);
          
          setEngineRecommendation(`${label} (${performance} Performance)`);
        } catch (error) {
          console.warn('Failed to get engine recommendation:', error);
          setEngineRecommendation(null);
        }
      };
      
      getRecommendation();
    }
  }, [isDialogOpen, quality, format, timelineDuration, resolution.width, resolution.height]);

  // Handle form changes
  const handleQualityChange = (newQuality: ExportQuality) => {
    setQuality(newQuality);
    updateSettings({ quality: newQuality });
    clearPreset(); // Clear preset when manually changing settings
  };

  const handleFormatChange = (newFormat: ExportFormat) => {
    setFormat(newFormat);
    updateSettings({ format: newFormat });
    clearPreset(); // Clear preset when manually changing settings
  };

  const handleFilenameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFilename = e.target.value;
    setFilename(newFilename);
    updateSettings({ filename: newFilename });
  };

  const handlePresetSelect = (preset: ExportPreset) => {
    // Apply preset settings
    setQuality(preset.quality);
    setFormat(preset.format);
    setSelectedPreset(preset);
    
    // Update store settings
    updateSettings({ 
      quality: preset.quality,
      format: preset.format 
    });
    
    // Generate filename based on preset
    const presetFilename = `${preset.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`;
    setFilename(presetFilename);
    updateSettings({ filename: presetFilename });
    
    // Show confirmation
    toast.success(`Applied ${preset.name} preset`, {
      description: preset.description
    });
  };

  const clearPreset = () => {
    setSelectedPreset(null);
  };

  const handleClose = () => {
    if (!progress.isExporting) {
      setDialogOpen(false);
    }
  };

  const handleCancel = () => {
    if (currentEngineRef.current && progress.isExporting) {
      currentEngineRef.current.cancel();
      currentEngineRef.current = null;
      
      // Reset export state
      updateProgress({
        progress: 0,
        status: "Export cancelled",
        isExporting: false
      });
      
      toast.info("Export cancelled by user");
      
      // Reset after a brief moment
      setTimeout(() => {
        resetExport();
      }, 1000);
    }
  };

  const handleExport = async () => {
    // Reset any previous errors
    setError(null);
    resetExport();

    try {
      // Get canvas element
      const canvas = canvasRef.current?.getCanvas();
      if (!canvas) {
        throw new Error("Canvas not available for export");
      }

      // Update canvas dimensions before export
      canvasRef.current?.updateDimensions();

      // Get timeline duration
      const totalDuration = getTotalDuration();
      if (totalDuration === 0) {
        throw new Error("Timeline is empty - add some content before exporting");
      }

      // Create export engine using factory for optimal performance
      const factory = ExportEngineFactory.getInstance();
      const exportEngine = await factory.createEngine(
        canvas,
        {
          ...settings,
          quality,
          format,
          width: resolution.width,
          height: resolution.height
        },
        tracks,
        mediaItems,
        totalDuration
      );
      
      // Store engine reference for cancellation
      currentEngineRef.current = exportEngine;

      // Progress callback to update UI
      const progressCallback = (progressValue: number, status: string) => {
        updateProgress({
          progress: progressValue,
          status: status,
          isExporting: true
        });
      };

      // Start export with download
      await exportEngine.exportAndDownload(filename, progressCallback);

      // Export completed successfully
      updateProgress({
        progress: 100,
        status: "Export complete!",
        isExporting: false
      });

      // Show success toast notification
      toast.success("Video exported successfully!", {
        description: `${filename}${FORMAT_INFO[format].extension} has been downloaded to your device.`
      });

      // Clear engine reference
      currentEngineRef.current = null;

      // Close dialog after successful export
      setTimeout(() => {
        setDialogOpen(false);
        resetExport();
      }, 2000);

    } catch (error) {
      // Log detailed error information for debugging
      console.error("Export failed:", error);
      console.error("Export context:", {
        canvasAvailable: !!canvasRef.current?.getCanvas(),
        timelineDuration: getTotalDuration(),
        tracksCount: tracks.length,
        mediaItemsCount: mediaItems.length,
        settings: settings
      });

      // Get user-friendly error message
      let errorMessage = "Export failed";
      if (error instanceof Error) {
        errorMessage = error.message;
      }

      // Clear engine reference
      currentEngineRef.current = null;

      // Set error in store for UI display
      setError(errorMessage);
      
      // Show appropriate toast based on error type
      if (errorMessage.includes('cancelled')) {
        toast.info("Export cancelled by user");
      } else {
        toast.error("Export failed", {
          description: errorMessage
        });
      }
      
      // Reset progress on error
      updateProgress({
        progress: 0,
        status: "",
        isExporting: false
      });
    }
  };

  if (!isDialogOpen) return null;

  return (
    <div className="h-full bg-background rounded-sm">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold">Export Video</h2>
            <p className="text-sm text-muted-foreground">Configure export settings and render your video</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            disabled={progress.isExporting}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Export Button - Top Section */}
        <div className="p-4 border-b border-border">
          {progress.isExporting ? (
            <div className="space-y-2">
              <Button
                onClick={handleCancel}
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
              onClick={handleExport}
              disabled={!isValidFilename(filename) || timelineDuration === 0 || !memoryEstimate.canExport}
              className="w-full"
              size="lg"
            >
              <Download className="w-4 h-4 mr-2" />
              Export Video
            </Button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          
          {/* Export Presets */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Quick Presets</CardTitle>
              <p className="text-xs text-muted-foreground">
                Choose a preset optimized for your platform
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {EXPORT_PRESETS.map((preset) => (
                  <Button
                    key={preset.id}
                    variant={selectedPreset?.id === preset.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => handlePresetSelect(preset)}
                    className="h-auto p-3 flex-col items-start gap-1"
                  >
                    <div className="flex items-center gap-2 w-full">
                      <span className="text-lg">{preset.icon}</span>
                      <span className="font-medium text-xs">{preset.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground text-left line-clamp-2">
                      {preset.description}
                    </span>
                  </Button>
                ))}
              </div>
              {selectedPreset && (
                <div className="mt-3 p-2 bg-muted rounded-md">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {selectedPreset.icon} {selectedPreset.name} Applied
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearPreset}
                      className="h-6 px-2 text-xs"
                    >
                      Clear
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedPreset.description}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Quality Selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Quality</CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup value={quality} onValueChange={handleQualityChange}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value={ExportQuality.HIGH} id="1080p" />
                  <Label htmlFor="1080p" className="text-sm cursor-pointer">
                    1080p (High Quality) - {QUALITY_RESOLUTIONS[ExportQuality.HIGH].label}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value={ExportQuality.MEDIUM} id="720p" />
                  <Label htmlFor="720p" className="text-sm cursor-pointer">
                    720p (Medium Quality) - {QUALITY_RESOLUTIONS[ExportQuality.MEDIUM].label}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value={ExportQuality.LOW} id="480p" />
                  <Label htmlFor="480p" className="text-sm cursor-pointer">
                    480p (Low Quality) - {QUALITY_RESOLUTIONS[ExportQuality.LOW].label}
                  </Label>
                </div>
              </RadioGroup>
            </CardContent>
          </Card>

          {/* Format Selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Format</CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup value={format} onValueChange={handleFormatChange}>
                {supportedFormats.map((fmt) => (
                  <div key={fmt} className="flex items-center space-x-2">
                    <RadioGroupItem value={fmt} id={fmt} />
                    <Label htmlFor={fmt} className="text-sm cursor-pointer">
                      <div>
                        <div className="font-medium">{FORMAT_INFO[fmt].label}</div>
                        <div className="text-xs text-muted-foreground">{FORMAT_INFO[fmt].description}</div>
                      </div>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>

          {/* File Information */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Export Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Resolution:</span>
                  <span className="ml-2 text-muted-foreground">{resolution.label}</span>
                </div>
                <div>
                  <span className="font-medium">Est. size:</span>
                  <span className="ml-2 text-muted-foreground">{estimatedSize}</span>
                </div>
                <div>
                  <span className="font-medium">Duration:</span>
                  <span className={cn(
                    "ml-2",
                    timelineDuration === 0 ? "text-red-500" : "text-muted-foreground"
                  )}>
                    {timelineDuration === 0 ? "No content" : `${timelineDuration.toFixed(2)}s`}
                  </span>
                </div>
                <div>
                  <span className="font-medium">Format:</span>
                  <span className="ml-2 text-muted-foreground">{FORMAT_INFO[format].label}</span>
                </div>
                {engineRecommendation && (
                  <div>
                    <span className="font-medium">Engine:</span>
                    <span className="ml-2 text-muted-foreground">{engineRecommendation}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Filename Input */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Filename</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                <Input
                  value={filename}
                  onChange={handleFilenameChange}
                  placeholder="Enter filename"
                  className={cn(!isValidFilename(filename) && "border-red-500")}
                />
                <span className="text-sm text-muted-foreground">{FORMAT_INFO[format].extension}</span>
              </div>
              {!isValidFilename(filename) && (
                <p className="text-sm text-red-500 mt-2">
                  Invalid filename. Avoid special characters: &lt; &gt; : " / \ | ? *
                </p>
              )}
            </CardContent>
          </Card>

          {/* Memory Warnings */}
          {memoryWarning && memoryEstimate.warningLevel !== 'none' && (
            <Alert className={cn(
              memoryEstimate.warningLevel === 'maximum' ? "border-red-500 bg-red-50" :
              memoryEstimate.warningLevel === 'critical' ? "border-red-500 bg-red-50" :
              "border-yellow-500 bg-yellow-50"
            )}>
              <AlertTriangle className={cn(
                "h-4 w-4",
                memoryEstimate.warningLevel === 'maximum' || memoryEstimate.warningLevel === 'critical' 
                  ? "text-red-600" : "text-yellow-600"
              )} />
              <AlertDescription className={cn(
                memoryEstimate.warningLevel === 'maximum' || memoryEstimate.warningLevel === 'critical' 
                  ? "text-red-800" : "text-yellow-800"
              )}>
                <div className="font-medium">
                  {memoryEstimate.warningLevel === 'maximum' ? 'Export Blocked' :
                   memoryEstimate.warningLevel === 'critical' ? 'High Memory Usage' :
                   'Memory Warning'}
                </div>
                <div>{memoryWarning}</div>
                {memoryEstimate.recommendation && (
                  <div className="mt-1 text-sm">
                    <strong>Recommendation:</strong> Switch to {memoryEstimate.recommendation.suggestedQuality} quality 
                    ({memoryEstimate.recommendation.description})
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Timeline Warnings */}
          {timelineDuration === 0 && (
            <Alert className="border-red-500 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                <div className="font-medium">No Content</div>
                <div>Your timeline is empty. Add some media files to export a video.</div>
              </AlertDescription>
            </Alert>
          )}

          {/* Short timeline warning */}
          {timelineDuration > 0 && timelineDuration < 0.5 && (
            <Alert className="border-yellow-500 bg-yellow-50">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800">
                <div className="font-medium">Very Short Video</div>
                <div>Your timeline is very short ({timelineDuration.toFixed(2)}s). Consider adding more content for a better export result.</div>
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

          {/* Progress Display */}
          {progress.isExporting && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Export Progress</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span>Progress</span>
                  <span>{progress.progress.toFixed(0)}%</span>
                </div>
                <Progress value={progress.progress} className="w-full" />
                <p className="text-sm text-muted-foreground">{progress.status}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Hidden Export Canvas */}
      <ExportCanvas ref={canvasRef} />
    </div>
  );
}