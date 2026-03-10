/**
 * Project Folder View
 *
 * UI component for browsing and importing files from the project folder structure.
 * Provides file selection, bulk import, and navigation capabilities.
 *
 * @module components/editor/media-panel/views/project-folder
 */

"use client";

import { platform } from "@qcut/platform-core";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Folder,
	File,
	Video,
	Image,
	Music,
	RefreshCw,
	ChevronUp,
	ChevronRight,
	Download,
	CheckSquare,
	Square,
	FolderOpen,
	AlertCircle,
} from "lucide-react";
import { useProjectFolder } from "@/hooks/use-project-folder";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ProjectFolderFileInfo } from "@/types/electron";

/**
 * Format file size in human-readable format.
 */
function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024)
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Get appropriate icon for file type.
 */
function getFileIcon(entry: ProjectFolderFileInfo) {
	if (entry.isDirectory) {
		return <Folder className="h-4 w-4 text-yellow-500" />;
	}
	switch (entry.type) {
		case "video":
			return <Video className="h-4 w-4 text-blue-500" />;
		case "audio":
			return <Music className="h-4 w-4 text-green-500" />;
		case "image":
			return <Image className="h-4 w-4 text-orange-500" />;
		default:
			return <File className="h-4 w-4 text-gray-500" />;
	}
}

/**
 * Renders a browsable UI for inspecting the current project folder and importing media files.
 *
 * The view shows breadcrumbs, folder and file entries (with icons and sizes), selection controls
 * for media files, import actions with per-file import reporting, scanning/error states, and a
 * scan summary when available.
 *
 * @returns The React element representing the project folder view.
 */
export function ProjectFolderView() {
	const {
		projectId,
		currentPath,
		entries,
		scanResult,
		isScanning,
		error,
		navigateTo,
		navigateUp,
		refresh,
		getBreadcrumbs,
	} = useProjectFolder();

	const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
	const [isImporting, setIsImporting] = useState(false);

	// Filter to only media files (non-directories with known types)
	const mediaFiles = useMemo(
		() => entries.filter((e) => !e.isDirectory && e.type !== "unknown"),
		[entries]
	);

	const mediaFileCount = mediaFiles.length;

	// Toggle file selection
	const toggleSelection = (path: string) => {
		setSelectedFiles((prev) => {
			const next = new Set(prev);
			if (next.has(path)) {
				next.delete(path);
			} else {
				next.add(path);
			}
			return next;
		});
	};

	// Select all media files
	const selectAll = () => {
		setSelectedFiles(new Set(mediaFiles.map((f) => f.path)));
	};

	// Clear selection
	const clearSelection = () => {
		setSelectedFiles(new Set());
	};

	// Import selected files
	const importSelected = async () => {
		if (selectedFiles.size === 0 || !projectId) return;

		setIsImporting(true);
		let imported = 0;
		let failed = 0;

		for (const filePath of selectedFiles) {
			try {
				// Find the file info
				const file = entries.find((e) => e.path === filePath);
				if (!file) continue;

				// Use media import handler
				const result = await platform().mediaImport?.import({
					sourcePath: filePath,
					projectId,
					mediaId: crypto.randomUUID(),
					preferSymlink: true,
				});

				if (result?.success) {
					imported++;
				} else {
					failed++;
				}
			} catch (err) {
				failed++;
			}
		}

		setIsImporting(false);
		setSelectedFiles(new Set());

		if (imported > 0) {
			toast.success(`Imported ${imported} file${imported > 1 ? "s" : ""}`);
		}
		if (failed > 0) {
			toast.error(`Failed to import ${failed} file${failed > 1 ? "s" : ""}`);
		}
	};

	// Handle entry click
	const handleEntryClick = (entry: ProjectFolderFileInfo) => {
		if (entry.isDirectory) {
			navigateTo(entry.relativePath);
		} else if (entry.type !== "unknown") {
			toggleSelection(entry.path);
		}
	};

	// Handle keyboard navigation
	const handleEntryKeyDown = (
		e: React.KeyboardEvent,
		entry: ProjectFolderFileInfo
	) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			handleEntryClick(entry);
		}
	};

	const breadcrumbs = getBreadcrumbs();

	// No project selected
	if (!projectId) {
		return (
			<div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
				<FolderOpen className="h-12 w-12 mb-2 opacity-50" />
				<p className="text-sm">No project selected</p>
				<p className="text-xs mt-1">Open a project to browse its files</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full" data-testid="project-folder-view">
			{/* Breadcrumb navigation */}
			<div
				className="flex items-center gap-1 p-2 border-b overflow-x-auto"
				data-testid="breadcrumbs"
			>
				<Button
					variant="text"
					size="sm"
					onClick={navigateUp}
					disabled={!currentPath || isScanning}
					className="shrink-0"
					data-testid="navigate-up-button"
				>
					<ChevronUp className="h-4 w-4" />
				</Button>

				{breadcrumbs.map((crumb, index) => (
					<div key={crumb.path} className="flex items-center shrink-0">
						{index > 0 && (
							<ChevronRight className="h-3 w-3 text-muted-foreground mx-1" />
						)}
						<Button
							variant="text"
							size="sm"
							className="text-xs h-6 px-2"
							onClick={() => navigateTo(crumb.path)}
							disabled={isScanning}
						>
							{crumb.name}
						</Button>
					</div>
				))}

				<div className="flex-1" />

				<Button
					variant="text"
					size="sm"
					onClick={refresh}
					disabled={isScanning}
					className="shrink-0"
					data-testid="refresh-button"
				>
					<RefreshCw className={cn("h-4 w-4", isScanning && "animate-spin")} />
				</Button>
			</div>

			{/* Selection toolbar */}
			{mediaFileCount > 0 && (
				<div className="flex items-center justify-between p-2 border-b bg-muted/30">
					<div className="flex items-center gap-2">
						<Button
							variant="text"
							size="sm"
							onClick={selectAll}
							className="text-xs"
							data-testid="select-all-button"
						>
							<CheckSquare className="h-3 w-3 mr-1" />
							Select All ({mediaFileCount})
						</Button>
						{selectedFiles.size > 0 && (
							<Button
								variant="text"
								size="sm"
								onClick={clearSelection}
								className="text-xs"
								data-testid="clear-selection-button"
							>
								<Square className="h-3 w-3 mr-1" />
								Clear
							</Button>
						)}
					</div>
					{selectedFiles.size > 0 && (
						<Button
							size="sm"
							onClick={importSelected}
							disabled={isImporting}
							className="text-xs"
							data-testid="import-selected-button"
						>
							<Download className="h-3 w-3 mr-1" />
							Import {selectedFiles.size}
						</Button>
					)}
				</div>
			)}

			{/* Error state */}
			{error && (
				<div className="p-4 text-center text-destructive flex items-center justify-center gap-2">
					<AlertCircle className="h-4 w-4" />
					<p className="text-sm">{error}</p>
				</div>
			)}

			{/* File list */}
			<ScrollArea className="flex-1">
				<div className="p-2 space-y-1">
					{entries.length === 0 && !isScanning && !error && (
						<div
							className="p-8 text-center text-muted-foreground"
							data-testid="empty-folder-state"
						>
							<Folder className="h-12 w-12 mx-auto mb-2 opacity-50" />
							<p className="text-sm">Empty folder</p>
						</div>
					)}

					{isScanning && entries.length === 0 && (
						<div className="p-8 text-center text-muted-foreground">
							<RefreshCw className="h-8 w-8 mx-auto mb-2 animate-spin opacity-50" />
							<p className="text-sm">Scanning...</p>
						</div>
					)}

					{/* Sort: folders first, then files */}
					{[...entries]
						.sort((a, b) => {
							if (a.isDirectory && !b.isDirectory) return -1;
							if (!a.isDirectory && b.isDirectory) return 1;
							return a.name.localeCompare(b.name);
						})
						.map((entry) => (
							<div
								key={entry.path}
								role="button"
								tabIndex={0}
								className={cn(
									"flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors",
									"hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
									selectedFiles.has(entry.path) && "bg-accent",
									entry.type === "unknown" && !entry.isDirectory && "opacity-50"
								)}
								onClick={() => handleEntryClick(entry)}
								onKeyDown={(e) => handleEntryKeyDown(e, entry)}
								aria-selected={selectedFiles.has(entry.path)}
								aria-label={`${entry.isDirectory ? "Folder" : "File"}: ${entry.name}${entry.isDirectory ? "" : `, ${formatSize(entry.size)}`}`}
							>
								{/* Checkbox for media files */}
								{!entry.isDirectory && entry.type !== "unknown" && (
									<Checkbox
										checked={selectedFiles.has(entry.path)}
										onCheckedChange={() => toggleSelection(entry.path)}
										onClick={(e) => e.stopPropagation()}
										aria-label={`Select ${entry.name}`}
									/>
								)}

								{/* Spacer for non-selectable items */}
								{(entry.isDirectory || entry.type === "unknown") && (
									<div className="w-4" />
								)}

								{/* Icon */}
								{getFileIcon(entry)}

								{/* Name */}
								<span className="flex-1 truncate text-sm">{entry.name}</span>

								{/* Size (files only) */}
								{!entry.isDirectory && (
									<span className="text-xs text-muted-foreground shrink-0">
										{formatSize(entry.size)}
									</span>
								)}

								{/* Chevron for directories */}
								{entry.isDirectory && (
									<ChevronRight className="h-4 w-4 text-muted-foreground" />
								)}
							</div>
						))}
				</div>
			</ScrollArea>

			{/* Scan summary */}
			{scanResult && (
				<div className="p-2 border-t text-xs text-muted-foreground">
					Found {scanResult.files.length} media files (
					{formatSize(scanResult.totalSize)}) in {scanResult.scanTime}ms
				</div>
			)}
		</div>
	);
}
