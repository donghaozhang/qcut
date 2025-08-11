import React from "react";
import { ExportDialog } from "@/components/export-dialog";
import { useExportStore } from "@/stores/export-store";
import { PanelView } from "@/types/panel";

export function ExportPanelContent() {
  const panelView = useExportStore((s) => s.panelView);

  // Only render export content when panel view is 'export'
  if (panelView !== PanelView.EXPORT) {
    return null;
  }

  return (
    <div className="h-full">
      <ExportDialog />
    </div>
  );
}
