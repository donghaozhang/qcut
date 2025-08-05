import React, {
  useRef,
  forwardRef,
  useImperativeHandle,
  useEffect,
} from "react";
import { useEditorStore } from "@/stores/editor-store";
import { useExportStore } from "@/stores/export-store";

// Export ref interface for parent components
export interface ExportCanvasRef {
  getCanvas: () => HTMLCanvasElement | null;
  updateDimensions: () => void;
}

// Canvas component for video export rendering
export const ExportCanvas = forwardRef<ExportCanvasRef>((props, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { canvasSize } = useEditorStore();
  const { settings } = useExportStore();

  // Expose canvas methods to parent
  useImperativeHandle(ref, () => ({
    getCanvas: () => canvasRef.current,
    updateDimensions: () => {
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = settings.width;
        canvas.height = settings.height;
      }
    },
  }));

  // Update canvas dimensions when settings change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = settings.width;
      canvas.height = settings.height;

      // Set CSS size to match for proper scaling
      canvas.style.width = `${settings.width}px`;
      canvas.style.height = `${settings.height}px`;
    }
  }, [settings.width, settings.height]);

  return (
    <canvas
      ref={canvasRef}
      className="export-canvas"
      style={{
        position: "absolute",
        visibility: "hidden",
        left: "-9999px",
        top: "-9999px",
        pointerEvents: "none",
      }}
      width={settings.width}
      height={settings.height}
    />
  );
});

ExportCanvas.displayName = "ExportCanvas";
