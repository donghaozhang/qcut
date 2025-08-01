import { useExportStore } from "@/stores/export-store";

// Placeholder component - will be fully implemented in task 6
export function ExportDialog() {
  const { isDialogOpen, setDialogOpen } = useExportStore();

  if (!isDialogOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg p-6 w-[600px] max-w-[90vw]">
        <h2 className="text-xl font-semibold mb-4">Export Video</h2>
        <p className="text-muted-foreground mb-4">Export dialog implementation coming soon...</p>
        <button
          onClick={() => setDialogOpen(false)}
          className="px-4 py-2 bg-primary text-primary-foreground rounded hover:opacity-90"
        >
          Close
        </button>
      </div>
    </div>
  );
}