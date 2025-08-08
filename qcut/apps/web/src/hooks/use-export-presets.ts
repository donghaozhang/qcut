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
    const presetFilename = `${preset.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now()}`;
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