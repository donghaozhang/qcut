import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
	FolderOpen,
	Trash2,
	Download,
	FileImage,
	Calendar,
	HardDrive,
} from "lucide-react";
import { useProjectStore } from "@/stores/project-store";
import { DrawingStorage, type DrawingMetadata } from "../utils/drawing-storage";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface SavedDrawingsProps {
	onLoadDrawing?: (drawingData: string) => void;
	className?: string;
}

export const SavedDrawings: React.FC<SavedDrawingsProps> = ({
	onLoadDrawing,
	className,
}) => {
	const [savedDrawings, setSavedDrawings] = useState<
		Array<{ id: string; metadata: DrawingMetadata }>
	>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [selectedDrawing, setSelectedDrawing] = useState<string | null>(null);
	const [storageStats, setStorageStats] = useState<{
		count: number;
		totalSize: number;
	} | null>(null);

	const { activeProject } = useProjectStore();

	const loadSavedDrawings = useCallback(async () => {
		if (!activeProject?.id) return;

		setIsLoading(true);
		try {
			const drawings = await DrawingStorage.listProjectDrawings(
				activeProject.id
			);
			setSavedDrawings(drawings);
		} catch {
			toast.error("Failed to load saved drawings");
		} finally {
			setIsLoading(false);
		}
	}, [activeProject?.id]);

	const loadStorageStats = useCallback(async () => {
		if (!activeProject?.id) return;

		try {
			const stats = await DrawingStorage.getStorageStats(activeProject.id);
			setStorageStats(stats);
		} catch {
			// Silent fail for stats
		}
	}, [activeProject?.id]);

	useEffect(() => {
		if (activeProject?.id) {
			loadSavedDrawings();
			loadStorageStats();
		}
	}, [activeProject?.id, loadSavedDrawings, loadStorageStats]);

	const handleLoadDrawing = async (drawingId: string) => {
		try {
			setIsLoading(true);
			const result = await DrawingStorage.loadDrawing(drawingId);

			if (result && onLoadDrawing) {
				onLoadDrawing(result.data);
				toast.success(`Loaded "${result.metadata.filename}"`);
				setSelectedDrawing(drawingId);
			} else {
				toast.error("Failed to load drawing");
			}
		} catch {
			toast.error("Failed to load drawing");
		} finally {
			setIsLoading(false);
		}
	};

	const handleDeleteDrawing = async (drawingId: string, filename: string) => {
		if (!confirm(`Delete "${filename}"? This cannot be undone.`)) {
			return;
		}

		try {
			setIsLoading(true);
			const success = await DrawingStorage.deleteDrawing(drawingId);

			if (success) {
				toast.success(`Deleted "${filename}"`);
				await loadSavedDrawings();
				await loadStorageStats();
				if (selectedDrawing === drawingId) {
					setSelectedDrawing(null);
				}
			} else {
				toast.error("Failed to delete drawing");
			}
		} catch {
			toast.error("Failed to delete drawing");
		} finally {
			setIsLoading(false);
		}
	};

	const handleExportDrawing = async (drawingId: string, filename: string) => {
		try {
			const result = await DrawingStorage.loadDrawing(drawingId);
			if (result) {
				await DrawingStorage.exportDrawing(result.data, filename);
				toast.success(`Exported "${filename}"`);
			} else {
				toast.error("Failed to load drawing for export");
			}
		} catch {
			toast.error("Failed to export drawing");
		}
	};

	const formatFileSize = (bytes: number): string => {
		if (bytes === 0) return "0 B";
		const k = 1024;
		const sizes = ["B", "KB", "MB"];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
	};

	const formatDate = (dateString: string): string => {
		return new Date(dateString).toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	if (!activeProject) {
		return (
			<div className={cn("p-4 text-center text-muted-foreground", className)}>
				<FileImage size={48} className="mx-auto mb-2 opacity-50" />
				<p>No active project</p>
				<p className="text-sm">Open a project to save and load drawings</p>
			</div>
		);
	}

	return (
		<div className={cn("p-4 h-full flex flex-col space-y-4", className)}>
			{/* Storage Stats */}
			{storageStats && storageStats.count > 0 && (
				<div className="text-xs text-muted-foreground flex items-center gap-4 pb-2">
					<div className="flex items-center gap-1">
						<HardDrive size={12} />
						<span>{storageStats.count} drawings</span>
					</div>
					<div>{formatFileSize(storageStats.totalSize)}</div>
				</div>
			)}

			{/* Saved Drawings List */}
			<div className="flex-1 overflow-y-auto">
				{isLoading ? (
					<div className="text-center py-8 text-muted-foreground">
						<div className="w-6 h-6 border border-muted-foreground border-t-transparent rounded-full animate-spin mx-auto mb-2" />
						<p className="text-sm">Loading...</p>
					</div>
				) : savedDrawings.length === 0 ? (
					<div className="text-center py-8 text-muted-foreground">
						<FileImage size={32} className="mx-auto mb-2 opacity-50" />
						<p className="text-sm">No saved drawings</p>
						<p className="text-xs">
							Use the Save button in the toolbar to save drawings
						</p>
					</div>
				) : (
					<div className="space-y-2">
						{savedDrawings.map((drawing) => (
							<div
								key={drawing.id}
								className={cn(
									"p-3 rounded-lg border transition-colors",
									selectedDrawing === drawing.id
										? "border-orange-500 bg-orange-500/10"
										: "border-gray-700 bg-gray-800/50 hover:bg-gray-800"
								)}
							>
								<div className="flex items-center justify-between mb-2">
									<div className="flex-1 min-w-0">
										<p className="text-sm font-medium text-white truncate">
											{drawing.metadata.filename}
										</p>
										<div className="flex items-center gap-2 text-xs text-muted-foreground">
											<Calendar size={10} />
											<span>{formatDate(drawing.metadata.created)}</span>
											<span>-</span>
											<span>{formatFileSize(drawing.metadata.size)}</span>
										</div>
									</div>
								</div>

								<div className="flex items-center gap-1">
									<Button
										variant="text"
										size="sm"
										onClick={() => handleLoadDrawing(drawing.id)}
										className="h-7 px-2 text-xs"
										disabled={isLoading}
									>
										<FolderOpen size={12} className="mr-1" />
										Load
									</Button>
									<Button
										variant="text"
										size="sm"
										onClick={() =>
											handleExportDrawing(drawing.id, drawing.metadata.filename)
										}
										className="h-7 px-2 text-xs"
										disabled={isLoading}
									>
										<Download size={12} className="mr-1" />
										Export
									</Button>
									<Button
										variant="text"
										size="sm"
										onClick={() =>
											handleDeleteDrawing(drawing.id, drawing.metadata.filename)
										}
										className="h-7 px-2 text-xs text-red-400 hover:text-red-300"
										disabled={isLoading}
									>
										<Trash2 size={12} />
									</Button>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
};

export default SavedDrawings;
