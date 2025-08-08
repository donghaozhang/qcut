import { useState } from "react";
import {
  ExportPreset,
  ExportQuality,
  ExportFormat,
  ExportSettings,
} from "@/types/export";
import { toast } from "sonner";

export function useExportPresets(
  setQuality: (quality: ExportQuality) => void,
  setFormat: (format: ExportFormat) => void,
  setFilename: (filename: string) => void,
  updateSettings: (settings: Partial<ExportSettings>) => void
) {
  const [selectedPreset, setSelectedPreset] = useState<ExportPreset | null>(
    null
  );

  const handlePresetSelect = (preset: ExportPreset) => {
    // Apply preset settings atomically to prevent UI flicker
    setQuality(preset.quality);
    setFormat(preset.format);
    setSelectedPreset(preset);

    // Update store settings
    updateSettings({
      quality: preset.quality,
      format: preset.format,
    });

    // Generate filename based on preset
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, -5);
    const presetFilename = `${preset.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${timestamp}`;
    setFilename(presetFilename);
    updateSettings({ filename: presetFilename });

    // Show confirmation
    toast.success(`Applied ${preset.name} preset`, {
      description: preset.description,
    });
  };

  const clearPreset = () => {
    setSelectedPreset(null);
  };

  return {
    selectedPreset,
    handlePresetSelect,
    clearPreset,
  };
}
