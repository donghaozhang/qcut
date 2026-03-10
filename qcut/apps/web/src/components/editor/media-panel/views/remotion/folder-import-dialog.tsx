/**
 * Folder Import Dialog
 *
 * Dialog for importing Remotion components from a project folder.
 * Handles folder selection, scanning, bundling, and import process.
 *
 * @module components/editor/media-panel/views/remotion/folder-import-dialog
 */

"use client";

import { platform } from "@qcut/platform-core";
import { useCallback, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
	AlertCircle,
	CheckCircle,
	FolderOpen,
	Loader2,
	RefreshCw,
	Trash2,
	X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { isFolderImportAvailable } from "@/lib/remotion/component-loader";
import { useRemotionStore } from "@/stores/ai/remotion-store";
import type {
	FolderImportResult,
	ImportedFolderInfo,
} from "@/lib/remotion/types";

// ============================================================================
// Types
// ============================================================================

export interface FolderImportDialogProps {
	/** Whether the dialog is open */
	open: boolean;
	/** Callback when dialog is closed */
	onOpenChange: (open: boolean) => void;
	/** Callback when import is successful */
	onImportSuccess?: (componentIds: string[]) => void;
}

type ImportStatus =
	| "idle"
	| "scanning"
	| "bundling"
	| "importing"
	| "success"
	| "error";

interface ImportState {
	/** Current import status */
	status: ImportStatus;
	/** Selected folder path */
	folderPath: string | null;
	/** Import result */
	result: FolderImportResult | null;
	/** Error message */
	error: string | null;
	/** Progress message */
	progressMessage: string;
}

// ============================================================================
// Imported Folder Item
// ============================================================================

interface ImportedFolderItemProps {
	folder: ImportedFolderInfo;
	onRefresh: (folderPath: string) => void;
	onRemove: (folderPath: string) => void;
	isRefreshing: boolean;
}

function ImportedFolderItem({
	folder,
	onRefresh,
	onRemove,
	isRefreshing,
}: ImportedFolderItemProps) {
	const folderName = folder.folderPath.split(/[/\\]/).pop() || "Folder";
	const importDate = new Date(folder.importedAt).toLocaleDateString();

	return (
		<div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
			<div className="flex items-center gap-3 min-w-0">
				<FolderOpen className="h-5 w-5 text-violet-400 shrink-0" />
				<div className="min-w-0">
					<p className="font-medium text-sm truncate" title={folder.folderPath}>
						{folderName}
					</p>
					<p className="text-xs text-muted-foreground">
						{folder.componentIds.length} component
						{folder.componentIds.length !== 1 ? "s" : ""} • Imported{" "}
						{importDate}
					</p>
				</div>
			</div>
			<div className="flex items-center gap-1">
				<Button
					variant="outline"
					size="icon"
					className="h-8 w-8"
					onClick={() => onRefresh(folder.folderPath)}
					disabled={isRefreshing}
					title="Refresh components from folder"
				>
					<RefreshCw
						className={cn("h-4 w-4", isRefreshing && "animate-spin")}
					/>
				</Button>
				<Button
					variant="outline"
					size="icon"
					className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
					onClick={() => onRemove(folder.folderPath)}
					disabled={isRefreshing}
					title="Remove imported folder"
				>
					<Trash2 className="h-4 w-4" />
				</Button>
			</div>
		</div>
	);
}

// ============================================================================
// Component
/**
 * Renders a dialog that lets users import Remotion components from a project folder.
 *
 * The dialog supports folder selection or drag-and-drop, displays import progress and errors,
 * and lists previously imported folders with refresh and remove actions.
 *
 * @param open - Whether the dialog is open
 * @param onOpenChange - Callback invoked when the dialog open state changes
 * @param onImportSuccess - Optional callback invoked with imported component IDs after a successful import
 * @returns The dialog React element for selecting, importing, and managing project folders
 */

export function FolderImportDialog({
	open,
	onOpenChange,
	onImportSuccess,
}: FolderImportDialogProps) {
	const [state, setState] = useState<ImportState>({
		status: "idle",
		folderPath: null,
		result: null,
		error: null,
		progressMessage: "",
	});
	const [isDragOver, setIsDragOver] = useState(false);
	const dragCounterRef = useRef(0);

	// Get actions via getState() to avoid unstable references in deps
	const importFromFolder = useRemotionStore.getState().importFromFolder;
	const refreshFolder = useRemotionStore.getState().refreshFolder;
	const removeFolder = useRemotionStore.getState().removeFolder;

	// Use useShallow for arrays to prevent infinite re-renders
	const importedFolders = useRemotionStore(
		useShallow((state) => Array.from(state.importedFolders.values()))
	);
	const isFolderImporting = useRemotionStore(
		(state) => state.isFolderImporting
	);

	// Check if folder import is available
	const isAvailable = isFolderImportAvailable();

	// Reset state when dialog opens/closes
	const handleOpenChange = useCallback(
		(open: boolean) => {
			if (!open) {
				setState({
					status: "idle",
					folderPath: null,
					result: null,
					error: null,
					progressMessage: "",
				});
			}
			onOpenChange(open);
		},
		[onOpenChange]
	);

	// Handle drag events - use counter to handle child element events
	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
	}, []);

	const handleDragEnter = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		dragCounterRef.current++;
		if (dragCounterRef.current === 1) {
			setIsDragOver(true);
		}
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		dragCounterRef.current--;
		if (dragCounterRef.current === 0) {
			setIsDragOver(false);
		}
	}, []);

	// Handle dropped folder
	const handleDrop = useCallback(
		async (e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			dragCounterRef.current = 0;
			setIsDragOver(false);

			if (!isAvailable) {
				setState((prev) => ({
					...prev,
					status: "error",
					error: "Folder import is only available in Electron",
				}));
				return;
			}

			// Prevent concurrent imports
			if (isFolderImporting) {
				return;
			}

			// Get the dropped folder path via webUtils (Electron 37+ removed File.path)
			const files = e.dataTransfer.files;
			if (files.length === 0) return;

			const droppedPath = platform().getPathForFile?.(files[0]);
			if (!droppedPath) {
				setState((prev) => ({
					...prev,
					status: "error",
					error: "Could not get folder path. Please use the folder selector.",
				}));
				return;
			}

			setState({
				status: "scanning",
				folderPath: droppedPath,
				result: null,
				error: null,
				progressMessage: "Validating folder...",
			});

			try {
				// Use the store's importFromFolder with the dropped path
				const result = await importFromFolder(droppedPath);

				if (!result.success) {
					setState({
						status: "error",
						folderPath: droppedPath,
						result,
						error: result.errors.join("; ") || "Import failed",
						progressMessage: "",
					});
					return;
				}

				setState({
					status: "success",
					folderPath: droppedPath,
					result,
					error: null,
					progressMessage: "",
				});

				toast.success(
					`Imported ${result.successCount} component${result.successCount !== 1 ? "s" : ""} from folder`
				);
				onImportSuccess?.(result.componentIds);

				setTimeout(() => {
					handleOpenChange(false);
				}, 1500);
			} catch (error) {
				setState({
					status: "error",
					folderPath: droppedPath,
					result: null,
					error: error instanceof Error ? error.message : "Unknown error",
					progressMessage: "",
				});
			}
		},
		[
			isAvailable,
			isFolderImporting,
			importFromFolder,
			onImportSuccess,
			handleOpenChange,
		]
	);

	// Handle folder selection and import
	const handleSelectFolder = useCallback(async () => {
		if (!isAvailable) {
			setState((prev) => ({
				...prev,
				status: "error",
				error: "Folder import is only available in Electron",
			}));
			return;
		}

		setState({
			status: "scanning",
			folderPath: null,
			result: null,
			error: null,
			progressMessage: "Selecting folder...",
		});

		try {
			// Call the store's importFromFolder which handles folder selection
			const result = await importFromFolder();

			if (!result.success) {
				// If no folder was selected (cancelled), just reset to idle
				if (result.errors.length === 0 && result.folderPath === "") {
					setState({
						status: "idle",
						folderPath: null,
						result: null,
						error: null,
						progressMessage: "",
					});
					return;
				}

				setState({
					status: "error",
					folderPath: result.folderPath,
					result,
					error: result.errors.join("; ") || "Import failed",
					progressMessage: "",
				});
				return;
			}

			setState({
				status: "success",
				folderPath: result.folderPath,
				result,
				error: null,
				progressMessage: "",
			});

			toast.success(
				`Imported ${result.successCount} component${result.successCount !== 1 ? "s" : ""} from folder`
			);
			onImportSuccess?.(result.componentIds);

			// Close dialog after a short delay
			setTimeout(() => {
				handleOpenChange(false);
			}, 1500);
		} catch (error) {
			setState({
				status: "error",
				folderPath: null,
				result: null,
				error: error instanceof Error ? error.message : "Unknown error",
				progressMessage: "",
			});
		}
	}, [isAvailable, importFromFolder, onImportSuccess, handleOpenChange]);

	// Handle folder refresh
	const handleRefreshFolder = useCallback(
		async (folderPath: string) => {
			const result = await refreshFolder(folderPath);

			if (result.success) {
				toast.success(
					`Refreshed ${result.successCount} component${result.successCount !== 1 ? "s" : ""}`
				);
			} else {
				toast.error(result.errors.join("; ") || "Failed to refresh folder");
			}
		},
		[refreshFolder]
	);

	// Handle folder removal
	const handleRemoveFolder = useCallback(
		(folderPath: string) => {
			removeFolder(folderPath);
			toast.success("Folder removed successfully");
		},
		[removeFolder]
	);

	// Render status message based on current state
	const renderStatusContent = () => {
		switch (state.status) {
			case "scanning":
				return (
					<div className="flex flex-col items-center gap-2">
						<Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
						<p className="text-sm text-muted-foreground">
							Scanning folder for compositions...
						</p>
					</div>
				);
			case "bundling":
				return (
					<div className="flex flex-col items-center gap-2">
						<Loader2 className="h-10 w-10 animate-spin text-violet-400" />
						<p className="text-sm text-muted-foreground">
							Bundling components...
						</p>
					</div>
				);
			case "importing":
				return (
					<div className="flex flex-col items-center gap-2">
						<Loader2 className="h-10 w-10 animate-spin text-violet-400" />
						<p className="text-sm text-muted-foreground">
							{state.progressMessage || "Importing components..."}
						</p>
					</div>
				);
			case "success":
				return (
					<div className="flex flex-col items-center gap-2">
						<CheckCircle className="h-10 w-10 text-green-500" />
						<p className="text-sm text-green-400">Import successful!</p>
						{state.result && (
							<p className="text-xs text-muted-foreground">
								{state.result.successCount} component
								{state.result.successCount !== 1 ? "s" : ""} imported
							</p>
						)}
					</div>
				);
			case "error":
				return (
					<div className="flex flex-col items-center gap-2">
						<AlertCircle className="h-10 w-10 text-red-400" />
						<p className="text-sm text-red-400">Import failed</p>
					</div>
				);
			default:
				return (
					<div className="flex flex-col items-center gap-2">
						<FolderOpen className="h-10 w-10 text-muted-foreground" />
						<p className="text-sm text-muted-foreground">
							Click to select or drag & drop a Remotion project folder
						</p>
						<p className="text-xs text-muted-foreground/70">
							Folder should contain a Root.tsx or Composition components
						</p>
					</div>
				);
		}
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<FolderOpen className="h-5 w-5 text-violet-400" />
						Import Remotion Folder
					</DialogTitle>
					<DialogDescription>
						Import Remotion compositions from a project folder. Components will
						be scanned, bundled, and registered.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					{/* Availability Warning */}
					{!isAvailable && (
						<div className="bg-yellow-500/10 border border-yellow-500/30 rounded-md p-3">
							<p className="text-sm text-yellow-400 flex items-center gap-2">
								<AlertCircle className="h-4 w-4" />
								Folder import is only available in the desktop app
							</p>
						</div>
					)}

					{/* Folder Selection / Drop Zone */}
					<button
						type="button"
						aria-label="Select or drop Remotion folder"
						className={cn(
							"w-full border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
							"focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-background",
							"border-border hover:border-muted-foreground",
							state.status === "error" && "border-red-500/50 bg-red-500/5",
							isDragOver && "border-violet-500 bg-violet-500/10",
							!isAvailable && "opacity-50 cursor-not-allowed"
						)}
						onClick={handleSelectFolder}
						onDragOver={handleDragOver}
						onDragEnter={handleDragEnter}
						onDragLeave={handleDragLeave}
						onDrop={handleDrop}
						disabled={
							!isAvailable ||
							isFolderImporting ||
							state.status === "scanning" ||
							state.status === "bundling" ||
							state.status === "importing"
						}
					>
						{isDragOver ? (
							<div className="flex flex-col items-center gap-2">
								<FolderOpen className="h-10 w-10 text-violet-400" />
								<p className="text-sm text-violet-400">Drop folder here</p>
							</div>
						) : (
							renderStatusContent()
						)}
					</button>

					{/* Error Display */}
					{state.status === "error" && state.error && (
						<div className="bg-red-500/10 border border-red-500/30 rounded-md p-3">
							<p className="text-sm text-red-400 flex items-start gap-2">
								<X className="h-4 w-4 shrink-0 mt-0.5" />
								{state.error}
							</p>
						</div>
					)}

					{/* Import Result Details */}
					{state.result && state.result.errors.length > 0 && (
						<div className="bg-yellow-500/10 border border-yellow-500/30 rounded-md p-3">
							<p className="text-sm font-medium text-yellow-400 mb-2">
								Some components could not be imported:
							</p>
							<ul className="text-sm text-yellow-300 space-y-1">
								{state.result.errors.map((error, i) => (
									<li key={i} className="flex items-start gap-2">
										<AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
										{error}
									</li>
								))}
							</ul>
						</div>
					)}

					{/* Imported Folders List */}
					{importedFolders.length > 0 && (
						<div className="space-y-2">
							<div className="flex items-center gap-2">
								<h4 className="text-sm font-medium">Imported Folders</h4>
								<Badge variant="secondary" className="text-[10px]">
									{importedFolders.length}
								</Badge>
							</div>
							<ScrollArea className="max-h-[200px]">
								<div className="space-y-2">
									{importedFolders.map((folder) => (
										<ImportedFolderItem
											key={folder.folderPath}
											folder={folder}
											onRefresh={handleRefreshFolder}
											onRemove={handleRemoveFolder}
											isRefreshing={isFolderImporting}
										/>
									))}
								</div>
							</ScrollArea>
						</div>
					)}
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={() => handleOpenChange(false)}>
						{state.status === "success" ? "Done" : "Cancel"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export default FolderImportDialog;
