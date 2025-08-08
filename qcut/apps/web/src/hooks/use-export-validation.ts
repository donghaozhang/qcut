import { useMemo } from "react";
import { calculateMemoryUsage, getMemoryWarningMessage } from "@/lib/memory-utils";
import { isValidFilename, ExportSettings } from "@/types/export";

export function useExportValidation(
  settings: Pick<ExportSettings, 'quality' | 'format' | 'filename' | 'width' | 'height'>,
  timelineDuration: number
) {
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
  const hasValidFilename = isValidFilename(settings.filename);

  return {
    memoryEstimate,
    memoryWarning,
    canExport,
    hasTimelineContent,
    isShortVideo,
    hasValidFilename,
  };
}