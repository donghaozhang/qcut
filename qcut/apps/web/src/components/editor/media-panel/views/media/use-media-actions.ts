import { platform } from "@qcut/platform-core";
import { useCallback, useRef, useState } from "react";
import type { MediaItem } from "@/stores/media/media-store-types";
import { toast } from "sonner";
import { debugLog, debugError } from "@/lib/debug/debug-config";
import { createObjectURL } from "@/lib/media/blob-manager";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useAdjustmentStore } from "@/stores/ai/adjustment-store";
import { useText2ImageStore } from "@/stores/ai/text2image-store";
import { useMediaPanelStore } from "../../store";

interface UseMediaActionsParams {
	mediaItems: MediaItem[];
	filteredMediaItems: MediaItem[];
	activeProjectId: string | undefined;
	addMediaItem:
		| ((
				projectId: string,
				item: Omit<MediaItem, "id"> & { id?: string }
		  ) => Promise<string>)
		| undefined;
	removeMediaItem:
		| ((projectId: string, id: string) => Promise<void>)
		| undefined;
	mediaStoreHasInitialized: boolean | undefined;
	selectedIds: Set<string>;
	setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export function useMediaActions({
	mediaItems,
	filteredMediaItems,
	activeProjectId,
	addMediaItem,
	removeMediaItem,
	mediaStoreHasInitialized,
	selectedIds,
	setSelectedIds,
}: UseMediaActionsParams) {
	const { setOriginalImage } = useAdjustmentStore();
	const { setActiveTab } = useMediaPanelStore();
	const setModelType = useText2ImageStore((s) => s.setModelType);

	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isProcessing, setIsProcessing] = useState(false);
	const [progress, setProgress] = useState(0);
	const [isSyncing, setIsSyncing] = useState(false);
	const hasSyncedRef = useRef(false);

	// ---- File processing ----
	const processFiles = async (files: FileList | File[]) => {
		if (!files || files.length === 0) return;
		if (!activeProjectId) {
			toast.error("No active project");
			return;
		}

		setIsProcessing(true);
		setProgress(0);

		try {
			const filesArray = Array.from(files);
			const { processMediaFiles } = await import(
				"@/lib/media/media-processing"
			);
			const processedItems = await processMediaFiles(filesArray, (p) => {
				setProgress(p);
			});

			if (!addMediaItem) {
				throw new Error("Media store not ready");
			}
			await Promise.all(
				processedItems.map((item) => addMediaItem(activeProjectId, item))
			);

			toast.success(`Successfully uploaded ${processedItems.length} file(s)`);
		} catch (error) {
			debugError("[Media View] Upload process failed:", error);
			toast.error("Failed to process files");
		} finally {
			setIsProcessing(false);
			setProgress(0);
		}
	};

	// ---- File select ----
	const handleFileSelect = () => fileInputRef.current?.click();

	// ---- Sync project folder ----
	const handleSync = useCallback(async () => {
		if (!activeProjectId || isSyncing) return;
		setIsSyncing(true);
		try {
			const { syncProjectFolder } = await import(
				"@/lib/project/project-folder-sync"
			);
			const result = await syncProjectFolder(activeProjectId);
			if (result.imported > 0) {
				toast.success(`Synced ${result.imported} file(s) from project folder`);
			} else if (result.errors.length > 0) {
				toast.error(`Sync failed for ${result.errors.length} file(s)`);
			} else {
				toast.info("Project folder in sync — no new files found");
			}
		} catch (err) {
			debugError("[MediaView] Sync failed:", err);
			toast.error("Failed to sync project folder");
		} finally {
			setIsSyncing(false);
		}
	}, [activeProjectId, isSyncing]);

	// ---- Auto-sync on first mount ----
	const triggerAutoSync = useCallback(() => {
		if (
			!hasSyncedRef.current &&
			mediaStoreHasInitialized &&
			activeProjectId &&
			platform().projectFolder
		) {
			hasSyncedRef.current = true;
			import("@/lib/project/project-folder-sync")
				.then(({ syncProjectFolder }) => syncProjectFolder(activeProjectId))
				.then((result) => {
					if (result.imported > 0) {
						toast.info(
							`Auto-synced ${result.imported} file(s) from project folder`
						);
					}
				})
				.catch(() => {
					// Silent fail for auto-sync
				});
		}
	}, [mediaStoreHasInitialized, activeProjectId]);

	// ---- Selection helpers ----
	const toggleSelect = useCallback(
		(id: string, e?: React.MouseEvent) => {
			setSelectedIds((prev) => {
				const next = new Set(prev);
				if (e?.shiftKey && prev.size > 0) {
					const lastId = [...prev].pop()!;
					const ids = filteredMediaItems.map((m) => m.id);
					const a = ids.indexOf(lastId);
					const b = ids.indexOf(id);
					const [start, end] = a < b ? [a, b] : [b, a];
					for (let i = start; i <= end; i++) next.add(ids[i]);
				} else if (e?.metaKey || e?.ctrlKey) {
					if (next.has(id)) next.delete(id);
					else next.add(id);
				} else {
					if (next.size === 1 && next.has(id)) {
						next.clear();
					} else {
						next.clear();
						next.add(id);
					}
				}
				return next;
			});
		},
		[filteredMediaItems, setSelectedIds]
	);

	const clearSelection = useCallback(
		() => setSelectedIds(new Set()),
		[setSelectedIds]
	);

	const handleAddSelectedToTimeline = useCallback(() => {
		const { addMediaAtTime } = useTimelineStore.getState();
		const { currentTime } = usePlaybackStore.getState();
		const items = mediaItems.filter((m) => selectedIds.has(m.id));
		for (const item of items) {
			addMediaAtTime(item, currentTime);
		}
		toast.success(`Added ${items.length} item(s) to timeline`);
		clearSelection();
	}, [selectedIds, mediaItems, clearSelection]);

	const handleDeleteSelected = useCallback(async () => {
		if (!activeProjectId || !removeMediaItem) return;
		const ids = [...selectedIds];
		try {
			await Promise.all(ids.map((id) => removeMediaItem(activeProjectId, id)));
			toast.success(`Deleted ${ids.length} item(s)`);
			clearSelection();
		} catch (error) {
			debugError("[MediaActions] Delete selected failed:", error);
			toast.error("Failed to delete selected items");
		}
	}, [selectedIds, activeProjectId, removeMediaItem, clearSelection]);

	const handleDownloadSelected = useCallback(async () => {
		const items = mediaItems.filter((m) => selectedIds.has(m.id));
		try {
			for (const item of items) {
				const url = item.url || item.thumbnailUrl;
				if (!url) continue;
				const a = document.createElement("a");
				a.href = url;
				a.download = item.name;
				a.click();
			}
			toast.success(`Downloading ${items.length} item(s)`);
		} catch (error) {
			debugError("[MediaActions] Download failed:", error);
			toast.error("Failed to download selected items");
		}
	}, [selectedIds, mediaItems]);

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (e.target.files) processFiles(e.target.files);
		e.target.value = "";
	};

	const handleRemove = async (e: React.MouseEvent, id: string) => {
		e.stopPropagation();
		if (!activeProjectId) {
			toast.error("No active project");
			return;
		}
		if (removeMediaItem) {
			try {
				await removeMediaItem(activeProjectId, id);
			} catch (error) {
				debugError("[MediaActions] Remove item failed:", error);
				toast.error("Failed to remove media item");
			}
		} else {
			toast.error("Media store not loaded");
		}
	};

	const handleEdit = async (e: React.MouseEvent, item: MediaItem) => {
		e.stopPropagation();
		if (item.type !== "image") {
			toast.error("Only images can be edited");
			return;
		}
		if (!item.file) {
			toast.error("Image file not available for editing");
			return;
		}
		try {
			const imageUrl =
				item.url ||
				item.thumbnailUrl ||
				createObjectURL(item.file, "adjustment-original");
			setOriginalImage(item.file, imageUrl);
			setModelType("adjustment");
			setActiveTab("text2image");
			toast.success(`"${item.name}" loaded in AI Images`);
		} catch (error) {
			debugError("Failed to load image for editing:", error);
			toast.error("Failed to load image for editing");
		}
	};

	return {
		fileInputRef,
		isProcessing,
		progress,
		isSyncing,
		processFiles,
		handleFileSelect,
		handleSync,
		triggerAutoSync,
		toggleSelect,
		clearSelection,
		handleAddSelectedToTimeline,
		handleDeleteSelected,
		handleDownloadSelected,
		handleFileChange,
		handleRemove,
		handleEdit,
	};
}
