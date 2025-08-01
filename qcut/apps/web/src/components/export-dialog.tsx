import React, { useState, useRef } from "react";
import { useExportStore } from "@/stores/export-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { ExportCanvas, ExportCanvasRef } from "@/components/export-canvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Download, X, AlertTriangle } from "lucide-react";
import { 
  ExportQuality, 
  QUALITY_RESOLUTIONS, 
  QUALITY_SIZE_ESTIMATES,
  isValidFilename 
} from "@/types/export";
import { cn } from "@/lib/utils";

export function ExportDialog() {
  const { 
    isDialogOpen, 
    setDialogOpen, 
    settings, 
    updateSettings, 
    progress,
    error 
  } = useExportStore();
  
  const { getTotalDuration } = useTimelineStore();
  const canvasRef = useRef<ExportCanvasRef>(null);
  
  // Local state for form inputs
  const [quality, setQuality] = useState<ExportQuality>(settings.quality);
  const [filename, setFilename] = useState(settings.filename);

  // Helper functions
  const getResolution = (quality: ExportQuality) => QUALITY_RESOLUTIONS[quality];
  const getEstimatedSize = (quality: ExportQuality) => QUALITY_SIZE_ESTIMATES[quality];
  const timelineDuration = getTotalDuration();
  const resolution = getResolution(quality);
  const estimatedSize = getEstimatedSize(quality);

  // Handle form changes
  const handleQualityChange = (newQuality: ExportQuality) => {
    setQuality(newQuality);
    updateSettings({ quality: newQuality });
  };

  const handleFilenameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFilename = e.target.value;
    setFilename(newFilename);
    updateSettings({ filename: newFilename });
  };

  const handleClose = () => {
    if (!progress.isExporting) {
      setDialogOpen(false);
    }
  };

  const handleExport = async () => {
    // Placeholder for export logic - will be implemented in task 7
    console.log("Export started with settings:", { quality, filename, resolution });
    
    // TODO: Implement actual export logic with export engine
    alert("Export functionality will be implemented in the next task!");
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
          <Button
            onClick={handleExport}
            disabled={progress.isExporting || !isValidFilename(filename) || timelineDuration === 0}
            className="w-full"
            size="lg"
          >
            <Download className="w-4 h-4 mr-2" />
            {progress.isExporting ? "Exporting..." : "Export Video"}
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          
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
                  <span className="ml-2 text-muted-foreground">{timelineDuration.toFixed(2)}s</span>
                </div>
                <div>
                  <span className="font-medium">Format:</span>
                  <span className="ml-2 text-muted-foreground">MP4</span>
                </div>
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
                <span className="text-sm text-muted-foreground">.mp4</span>
              </div>
              {!isValidFilename(filename) && (
                <p className="text-sm text-red-500 mt-2">
                  Invalid filename. Avoid special characters: &lt; &gt; : " / \ | ? *
                </p>
              )}
            </CardContent>
          </Card>

          {/* Timeline Warning */}
          {timelineDuration === 0 && (
            <Alert className="border-red-500 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                <div className="font-medium">No Content</div>
                <div>Your timeline is empty. Add some media files to export a video.</div>
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