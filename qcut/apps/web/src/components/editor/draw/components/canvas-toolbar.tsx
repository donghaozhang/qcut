import { useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Download, Save, Film, FolderOpen, Trash2 } from "lucide-react";
import { useProjectStore } from "@/stores/project-store";
import { TimelineIntegration } from "../utils/timeline-integration";
import { DrawingStorage } from "../utils/drawing-storage";
import { downloadDrawing } from "../utils/canvas-utils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { TldrawCanvasHandle } from "../tldraw-canvas";

interface CanvasToolbarProps {
	canvasRef: RefObject<TldrawCanvasHandle | null>;
	onShowFiles?: () => void;
	className?: string;
}

export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
	canvasRef,
	onShowFiles,
	className,
}) => {
	const [isExporting, setIsExporting] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const { activeProject } = useProjectStore();

	const getDataUrl = async (): Promise<string | null> => {
		if (!canvasRef.current) return null;
		return canvasRef.current.getCanvasDataUrl();
	};

	const handleDownload = async () => {
		try {
			const dataUrl = await getDataUrl();
			if (!dataUrl) {
				toast.error("Nothing to export — draw something first");
				return;
			}
			downloadDrawing(dataUrl, `drawing-${Date.now()}.png`);
			toast.success("Drawing downloaded");
		} catch {
			toast.error("Failed to download drawing");
		}
	};

	const handleExportToTimeline = async () => {
		if (!TimelineIntegration.isAvailable()) {
			toast.error("Timeline integration not available");
			return;
		}

		setIsExporting(true);
		try {
			const dataUrl = await getDataUrl();
			if (!dataUrl) {
				toast.error("Nothing to export — draw something first");
				return;
			}
			await TimelineIntegration.quickExport(dataUrl);
		} catch {
			toast.error("Failed to export to timeline");
		} finally {
			setIsExporting(false);
		}
	};

	const handleQuickSave = async () => {
		if (!activeProject?.id) {
			toast.error("No active project");
			return;
		}

		setIsSaving(true);
		try {
			// Save tldraw snapshot (JSON) instead of data URL
			const snapshot = canvasRef.current?.getSnapshot();
			if (!snapshot) {
				toast.error("Nothing to save — draw something first");
				return;
			}

			const filename = `drawing-${new Date().toISOString().slice(0, 19).replace(/[:-]/g, "")}.json`;
			await DrawingStorage.saveDrawing(snapshot, activeProject.id, filename, [
				"quick-save",
			]);
			toast.success("Drawing saved!");
		} catch {
			toast.error("Failed to save drawing");
		} finally {
			setIsSaving(false);
		}
	};

	const handleClear = () => {
		canvasRef.current?.clearAll();
		toast.success("Canvas cleared");
	};

	return (
		<div
			className={cn(
				"flex items-center gap-2 p-2 bg-gray-800 rounded-lg",
				className
			)}
		>
			<div className="flex items-center gap-1 border-r border-gray-600 pr-2">
				<Button
					variant="text"
					size="sm"
					onClick={handleClear}
					title="Clear Canvas"
					aria-label="Clear canvas"
					className="h-8 w-8 p-0"
				>
					<Trash2 size={14} aria-hidden="true" />
				</Button>
			</div>

			<div className="flex items-center gap-1">
				<Button
					variant="text"
					size="sm"
					onClick={handleQuickSave}
					disabled={isSaving || !activeProject}
					title="Quick Save"
					aria-label="Quick save"
					className="h-8 w-8 p-0"
				>
					{isSaving ? (
						<div
							className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin"
							aria-hidden="true"
						/>
					) : (
						<Save size={14} aria-hidden="true" />
					)}
				</Button>
				<Button
					variant="text"
					size="sm"
					onClick={handleDownload}
					title="Download as PNG"
					aria-label="Download as PNG"
					className="h-8 w-8 p-0"
				>
					<Download size={14} aria-hidden="true" />
				</Button>
				<Button
					variant="text"
					size="sm"
					onClick={handleExportToTimeline}
					disabled={isExporting}
					title="Export to Timeline"
					aria-label="Export to timeline"
					className="h-8 w-8 p-0"
				>
					{isExporting ? (
						<div
							className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin"
							aria-hidden="true"
						/>
					) : (
						<Film size={14} aria-hidden="true" />
					)}
				</Button>
				<Button
					variant="text"
					size="sm"
					onClick={onShowFiles}
					title="Saved Drawings"
					aria-label="Saved drawings"
					className="h-8 w-8 p-0"
				>
					<FolderOpen size={14} aria-hidden="true" />
				</Button>
			</div>

			<div className="ml-auto text-xs text-gray-400">
				{TimelineIntegration.isAvailable() ? (
					<span className="text-green-400">Timeline Ready</span>
				) : (
					<span className="text-red-400">Timeline Unavailable</span>
				)}
			</div>
		</div>
	);
};

export default CanvasToolbar;
