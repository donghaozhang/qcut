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

  // PRESERVE: CRITICAL atomic preset selection (lines 201-222 from original)
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

  // PRESERVE: Clear preset (lines 224-226 from original)
  const clearPreset = () => {
    setSelectedPreset(null);
  };

  return {
    selectedPreset,
    handlePresetSelect,
    clearPreset,
  };
}