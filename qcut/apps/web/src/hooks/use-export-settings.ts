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

export function useExportSettings() {
  const { isDialogOpen, settings, updateSettings } = useExportStore();
  const { getTotalDuration } = useTimelineStore();
  const { isElectron } = useElectron();
  
  // PRESERVE: Local form state (lines 72-100 from original)
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

  // PRESERVE: FFmpeg availability check (lines 177-179 from original)
  useEffect(() => {
    ExportEngineFactory.isFFmpegAvailable().then(setFfmpegAvailable);
  }, []);

  // PRESERVE: Event handlers (lines 182-200 from original)
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
    // Store integration
    updateSettings,
  };
}