import React from "react";
import { ExportDialog } from "@/components/export-dialog";
import { useExportStore } from "@/stores/export-store";

export function ExportPanelContent() {
  const { panelView } = useExportStore();

  // Only render export content when panel view is 'export'
  if (panelView !== "export") {
    return null;
  }

  return (
    <div className="h-full">
      <ExportDialog />
    </div>
  );
}
