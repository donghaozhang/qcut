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
import { ExportEngineFactory, ExportEngineType } from "@/lib/export-engine-factory";
import { debugLog, debugWarn } from "@/lib/debug-config";

export function useExportSettings() {
  const { isDialogOpen, settings, updateSettings } = useExportStore();
  const { getTotalDuration } = useTimelineStore();
  const { isElectron } = useElectron();
  
  const [quality, setQuality] = useState<ExportQuality>(settings.quality);
  const [format, setFormat] = useState<ExportFormat>(settings.format);
  const [filename, setFilename] = useState(settings.filename);
  const [engineType, setEngineType] = useState<"standard" | "ffmpeg" | "cli">(
    isElectron() ? "cli" : "standard"
  );
  const [ffmpegAvailable, setFfmpegAvailable] = useState(false);
  const [engineRecommendation, setEngineRecommendation] = useState<string | null>(null);

  const supportedFormats = getSupportedFormats();
  const resolution = QUALITY_RESOLUTIONS[quality] || QUALITY_RESOLUTIONS[ExportQuality.HIGH];
  const estimatedSize = QUALITY_SIZE_ESTIMATES[quality] || QUALITY_SIZE_ESTIMATES[ExportQuality.HIGH];
  const timelineDuration = getTotalDuration();

  // Engine recommendation effect with multiple dependencies
  useEffect(() => {
    if (isDialogOpen && timelineDuration > 0) {
      let aborted = false;
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

          if (aborted) return;

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
          if (!aborted) {
            debugWarn("Failed to get engine recommendation:", error);
            setEngineRecommendation(null);
          }
        }
      };

      getRecommendation();
      return () => { aborted = true; };
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

  useEffect(() => {
    ExportEngineFactory.isFFmpegAvailable().then(setFfmpegAvailable);
  }, []);

  const handleQualityChange = (newQuality: ExportQuality) => {
    setQuality(newQuality);
    updateSettings({ quality: newQuality });
  };

  const handleFormatChange = (newFormat: ExportFormat) => {
    debugLog("Format changing from", format, "to", newFormat);
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
    // Store integration
    updateSettings,
  };
}