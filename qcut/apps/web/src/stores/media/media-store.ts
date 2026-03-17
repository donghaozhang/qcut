/**
 * Media Store
 *
 * Manages media items (videos, images, audio) imported into the project.
 * Handles media loading, thumbnail generation, and persistence.
 *
 * @module stores/media-store
 */

import { create } from "zustand";
import { debugLog, debugError } from "@/lib/debug/debug-config";
import { storageService } from "@/lib/storage/storage-service";
import { generateUUID, generateFileBasedId } from "@/lib/utils";
import { getOrCreateObjectURL } from "@/lib/media/blob-manager";
import {
	handleStorageError,
	handleMediaProcessingError,
} from "@/lib/debug/error-handler";
import type { MediaItem, MediaType } from "./media-store-types";

import {
	revokeMediaBlob,
	cloneFileForTemporaryUse,
	generateVideoThumbnailBrowser as generateVideoThumbnailBrowserImpl,
	getMediaDuration as getMediaDurationImpl,
} from "./media-store-helpers";

import { createFolderActions, type FolderActions } from "./media-store-folders";

// Re-export types and helpers for backward compatibility
export type { MediaItem, MediaType } from "./media-store-types";
export {
	getFileType,
	getImageDimensions,
	generateVideoThumbnailBrowser,
	getMediaDuration,
	getMediaAspectRatio,
} from "./media-store-helpers";

interface MediaStore extends FolderActions {
	mediaItems: MediaItem[];
	isLoading: boolean;
	hasInitialized: boolean;

	// Actions - now require projectId
	addMediaItem: (
		projectId: string,
		item: Omit<MediaItem, "id"> & { id?: string }
	) => Promise<string>;
	addGeneratedImages: (
		items: Array<{
			id?: string;
			url: string;
			type: MediaType;
			name: string;
			size: number;
			duration: number;
			metadata?: {
				source?: string;
				[key: string]: any;
			};
		}>
	) => Promise<void>;
	removeMediaItem: (projectId: string, id: string) => Promise<void>;
	loadProjectMedia: (projectId: string) => Promise<void>;
	clearProjectMedia: (projectId: string) => Promise<void>;
	clearAllMedia: () => void;
	restoreMediaItems: (items: MediaItem[]) => void;

	// Project folder sync
	syncFromProjectFolder: (
		projectId: string
	) => Promise<import("@/lib/project/project-folder-sync").SyncResult>;
}

const VIDEO_METADATA_MAX_RETRIES = 2;
const VIDEO_METADATA_RETRY_DELAY_MS = 300;

const delay = (ms: number): Promise<void> =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

// Helper to update a single field on a media item (in-memory only)
const updateMediaItemField = (itemId: string, updates: Partial<MediaItem>) => {
	const mediaStore = useMediaStore.getState();
	const updatedItems = mediaStore.mediaItems.map((item) => {
		if (item.id === itemId) {
			return { ...item, ...updates };
		}
		return item;
	});
	useMediaStore.setState({ mediaItems: updatedItems });
};

// Helper to update media item metadata and persist to storage
const updateMediaMetadataAndPersist = async (
	itemId: string,
	projectId: string,
	metadata: Partial<MediaItem>
) => {
	const mediaStore = useMediaStore.getState();
	const item = mediaStore.mediaItems.find((i) => i.id === itemId);

	if (!item) {
		debugError(`[MediaStore] Cannot update item ${itemId} - not found`);
		return;
	}

	// Update in-memory state
	const updatedItem = { ...item, ...metadata };
	const updatedItems = mediaStore.mediaItems.map((i) =>
		i.id === itemId ? updatedItem : i
	);
	useMediaStore.setState({ mediaItems: updatedItems });

	// Persist to storage
	try {
		await storageService.saveMediaItem(projectId, updatedItem);
		debugLog(`[MediaStore] Persisted thumbnail for ${item.name}`);
	} catch (error) {
		debugError(
			`[MediaStore] Failed to persist thumbnail for ${item.name}:`,
			error
		);
	}
};

// Background metadata extraction without blocking UI
const extractVideoMetadataBackground = async (
	file: File,
	itemId: string,
	projectId: string,
	attempt = 1
) => {
	try {
		// Set status to loading
		updateMediaItemField(itemId, { thumbnailStatus: "loading" });

		// Clone file to isolate temporary operations from display URL
		const fileClone = cloneFileForTemporaryUse(file);

		const [thumbnailResult, durationResult] = await Promise.allSettled([
			generateVideoThumbnailBrowserImpl(fileClone),
			getMediaDurationImpl(fileClone),
		]);

		if (thumbnailResult.status === "rejected") {
			throw thumbnailResult.reason;
		}

		const result = {
			thumbnailUrl: thumbnailResult.value.thumbnailUrl,
			thumbnailStatus: "ready" as const,
			width: thumbnailResult.value.width,
			height: thumbnailResult.value.height,
			fps: 30,
			...(durationResult.status === "fulfilled"
				? { duration: durationResult.value }
				: {}),
		};

		if (durationResult.status === "rejected") {
			debugError(
				`[MediaStore] Duration extraction failed for ${itemId}, keeping thumbnail`,
				durationResult.reason
			);
		}

		// Update the media item with real metadata and persist to storage
		await updateMediaMetadataAndPersist(itemId, projectId, result);
		return result;
	} catch (browserError) {
		if (attempt < VIDEO_METADATA_MAX_RETRIES) {
			debugError(
				`[MediaStore] Thumbnail generation attempt ${attempt} failed for ${itemId}, retrying`,
				browserError
			);
			await delay(VIDEO_METADATA_RETRY_DELAY_MS * attempt);
			return extractVideoMetadataBackground(
				file,
				itemId,
				projectId,
				attempt + 1
			);
		}

		// Set status to failed
		updateMediaItemField(itemId, { thumbnailStatus: "failed" });
		debugError(
			`[MediaStore] Thumbnail generation failed for ${itemId} after ${attempt} attempt(s):`,
			browserError
		);
	}
};

export const useMediaStore = create<MediaStore>((set, get) => ({
	mediaItems: [],
	isLoading: false,
	hasInitialized: false,

	addMediaItem: async (projectId, item) => {
		console.log("step 6g: media-store addMediaItem", {
			projectId,
			id: item.id,
			hasFile: !!item.file,
			url: item.url,
			originalUrl: (item as any).originalUrl,
			size: item.file?.size,
			type: item.type,
		});
		// DEBUG: Log projectId parameter
		console.log(
			`[MediaStore.addMediaItem] Called with projectId: ${projectId}, item.name: ${item.name}`
		);

		// Generate consistent ID based on file properties if not provided
		let id = item.id;
		if (!id && item.file) {
			try {
				id = await generateFileBasedId(item.file);
				debugLog(
					`[MediaStore] Generated consistent ID for ${item.name}: ${id}`
				);
			} catch (error) {
				debugLog(
					"[MediaStore] Failed to generate file-based ID, using random UUID"
				);
				id = generateUUID();
			}
		} else if (!id) {
			id = generateUUID();
		}

		const newItem: MediaItem = {
			...item,
			id,
		};

		console.log("[MediaStore.addMediaItem] Saving media item", {
			projectId,
			id: newItem.id,
			name: newItem.name,
			type: newItem.type,
			hasFile: !!newItem.file,
			fileSize: newItem.file?.size,
			url: newItem.url,
		});

		// Debug logging for ID generation (Task 1.3)
		debugLog(`[MediaStore] Generated ID for ${newItem.name}:`, {
			id: newItem.id,
			hasFile: !!newItem.file,
			providedId: item.id,
			generatedNew: !item.id && item.file,
		});

		// Add to local state immediately for UI responsiveness
		// For videos without thumbnails, set pending status for UI feedback
		const itemWithStatus: MediaItem =
			newItem.type === "video" && newItem.file && !newItem.thumbnailUrl
				? { ...newItem, thumbnailStatus: "pending" as const }
				: newItem;

		set((state) => ({
			mediaItems: [...state.mediaItems, itemWithStatus],
		}));

		// Save to persistent storage in background
		try {
			await storageService.saveMediaItem(projectId, newItem);
			console.log("[MediaStore.addMediaItem] Saved to storage", {
				projectId,
				id: newItem.id,
				name: newItem.name,
				type: newItem.type,
			});

			// Trigger thumbnail generation for videos AFTER storage save succeeds
			if (newItem.type === "video" && newItem.file && !newItem.thumbnailUrl) {
				extractVideoMetadataBackground(newItem.file, newItem.id, projectId);
			}

			return newItem.id;
		} catch (error) {
			console.error(
				"[MediaStore.addMediaItem] Storage save FAILED, keeping item unsaved",
				{
					projectId,
					id: newItem.id,
					name: newItem.name,
					type: newItem.type,
					error: error instanceof Error ? error.message : String(error),
				}
			);
			handleStorageError(error, "Add media item to storage", {
				projectId,
				itemId: newItem.id,
				itemType: newItem.type,
				itemName: newItem.name,
				operation: "saveMediaItem",
			});

			// Keep the item visible; mark as unsaved for UI/toast handling
			set((state) => ({
				mediaItems: state.mediaItems.map((media) =>
					media.id === newItem.id
						? {
								...media,
								metadata: {
									...media.metadata,
									unsaved: true,
									storageError:
										error instanceof Error ? error.message : String(error),
								},
							}
						: media
				),
			}));
			throw error;
		}
	},

	addGeneratedImages: async (items) => {
		// Import utilities for COEP-safe image loading
		const { convertToBlob, needsBlobConversion, downloadImageAsFile } =
			await import("@/lib/media/image-utils");

		const newItems: MediaItem[] = await Promise.all(
			items.map(async (item) => {
				let processedUrl = item.url;
				let file: File;

				try {
					// Convert fal.media URLs to blob URLs to bypass COEP restrictions
					if (needsBlobConversion(item.url)) {
						processedUrl = await convertToBlob(item.url);
					}

					// Download the image as a proper File object for storage
					file = await downloadImageAsFile(item.url, item.name);
				} catch (error) {
					handleMediaProcessingError(error, "Process generated image", {
						imageName: item.name,
						imageUrl: item.url,
						operation: "downloadGeneratedImage",
						showToast: false, // Don't spam users during batch operations
					});

					// Create empty file as fallback
					file = new File([], item.name, { type: "image/jpeg" });
					// Keep original URL as fallback
					processedUrl = item.url;
				}

				// Create URL for immediate display - use data URL for SVGs to avoid blob URL issues in Electron
				// Use cached blob URLs for display to avoid creating duplicates for the same file
				let displayUrl = processedUrl;
				if (file.size > 0) {
					// Special handling for SVG files - use data URL instead of blob URL
					if (
						file.type === "image/svg+xml" ||
						file.name.toLowerCase().endsWith(".svg")
					) {
						try {
							const text = await file.text();
							displayUrl = `data:image/svg+xml;base64,${btoa(text)}`;
						} catch (error) {
							displayUrl = getOrCreateObjectURL(
								file,
								"addMediaItem-svg-fallback"
							);
						}
					} else {
						displayUrl = getOrCreateObjectURL(file, "addMediaItem-display");
					}
				}

				return {
					id: item.id ?? generateUUID(), // Preserve existing ID if provided
					name: item.name,
					type: item.type,
					file, // Now contains actual image data
					url: displayUrl, // Use object URL created from the actual file
					duration: item.duration,
					metadata: {
						...item.metadata,
						originalUrl: item.url, // Keep original URL for reference
					},
				};
			})
		);

		// Add to local state immediately
		set((state) => ({
			mediaItems: [...state.mediaItems, ...newItems],
		}));

		// Save each generated image to persistent storage
		try {
			const { useProjectStore } = await import("@/stores/project-store");
			const currentProject = useProjectStore.getState().activeProject;

			if (currentProject) {
				await Promise.all(
					newItems.map(async (item) => {
						try {
							await storageService.saveMediaItem(currentProject.id, item);
						} catch (error) {
							handleStorageError(error, "Save generated image to storage", {
								projectId: currentProject.id,
								itemId: item.id,
								itemName: item.name,
								operation: "saveGeneratedImage",
								showToast: false, // Don't spam during batch save
							});
						}
					})
				);
			} else {
			}
		} catch (error) {}
	},

	removeMediaItem: async (projectId: string, id: string) => {
		const state = get();
		const item = state.mediaItems.find((media) => media.id === id);

		// For generated images with fal.media origins, clean up using the cache
		if (item?.metadata?.originalUrl) {
			const { revokeBlobUrl } = await import("@/lib/media/image-utils");
			revokeBlobUrl(item.metadata.originalUrl);
		}
		// For other blob URLs (like video thumbnails), revoke directly
		else if (
			item?.url &&
			item.url.startsWith("blob:") &&
			!item.metadata?.originalUrl
		) {
			revokeMediaBlob(item.url, "removeMediaItem:url");
		}
		if (item?.thumbnailUrl && item.thumbnailUrl.startsWith("blob:")) {
			revokeMediaBlob(item.thumbnailUrl, "removeMediaItem:thumbnail");
		}

		// 1) Remove from local state immediately
		set((state) => ({
			mediaItems: state.mediaItems.filter((media) => media.id !== id),
		}));

		// 2) Cascade into the timeline: remove any elements using this media ID
		const { useTimelineStore } = await import("../timeline/timeline-store");
		const timeline = useTimelineStore.getState();
		const {
			tracks,
			removeElementFromTrack,
			removeElementFromTrackWithRipple,
			rippleEditingEnabled,
			pushHistory,
		} = timeline;

		// Find all elements that reference this media
		const elementsToRemove: Array<{ trackId: string; elementId: string }> = [];
		for (const track of tracks) {
			for (const el of track.elements) {
				if (el.type === "media" && el.mediaId === id) {
					elementsToRemove.push({ trackId: track.id, elementId: el.id });
				}
			}
		}

		// If there are elements to remove, push history once before batch removal
		if (elementsToRemove.length > 0) {
			pushHistory();

			// Remove all elements without pushing additional history entries
			for (const { trackId, elementId } of elementsToRemove) {
				if (rippleEditingEnabled) {
					removeElementFromTrackWithRipple(trackId, elementId, false);
				} else {
					removeElementFromTrack(trackId, elementId, false);
				}
			}
		}

		// 3) Remove from persistent storage
		try {
			await storageService.deleteMediaItem(projectId, id);
		} catch (error) {
			debugError("[MediaStore] deleteMediaItem failed", {
				projectId,
				id,
				error,
			});
		}
	},

	loadProjectMedia: async (projectId) => {
		set({ isLoading: true });
		debugLog(`[MediaStore] Loading media for project: ${projectId}`);

		try {
			const mediaItems = await storageService.loadAllMediaItems(projectId);
			debugLog(
				`[MediaStore] Loaded ${mediaItems.length} media items from storage`
			);

			// Process media items with enhanced error handling
			const updatedMediaItems = await Promise.all(
				mediaItems.map(async (item) => {
					// LAZY URL CREATION: Create display URL if missing
					let displayUrl = item.url;
					if (!displayUrl && item.file && item.file.size > 0) {
						displayUrl = getOrCreateObjectURL(item.file, "media-store-display");
						debugLog(
							`[MediaStore] Created lazy URL for ${item.name}: ${displayUrl}`
						);
					}

					if (item.type === "video" && item.file) {
						// Check if thumbnail already exists in storage
						if (item.thumbnailUrl) {
							debugLog(`[MediaStore] Using stored thumbnail for ${item.name}`);
							return {
								...item,
								url: displayUrl,
								thumbnailStatus: "ready" as const,
							};
						}

						// No stored thumbnail - need to generate
						debugLog(`[MediaStore] Generating thumbnail for ${item.name}`);

						// Start background generation
						extractVideoMetadataBackground(item.file, item.id, projectId);

						// Return item with pending status for now
						return {
							...item,
							url: displayUrl,
							thumbnailStatus: "pending" as const,
						};
					}
					return {
						...item,
						url: displayUrl,
					};
				})
			);

			set({ mediaItems: updatedMediaItems, hasInitialized: true });
			debugLog(
				`[MediaStore] ✅ Media loading complete: ${updatedMediaItems.length} items`
			);
		} catch (error) {
			handleStorageError(error, "Load project media items", {
				projectId,
				operation: "loadAllMediaItems",
			});

			// Set empty array to prevent undefined state
			set({ mediaItems: [], hasInitialized: true });
		} finally {
			set({ isLoading: false });
		}
	},

	clearProjectMedia: async (projectId) => {
		const state = get();
		let revokedCount = 0;

		// Enhanced cleanup with better URL tracking and logging
		state.mediaItems.forEach((item) => {
			if (item.url && item.url.startsWith("blob:")) {
				revokeMediaBlob(item.url, "clearProjectMedia:url");
				debugLog(
					`[Cleanup] Revoked blob URL for ${item.name} (project: ${projectId}): ${item.url}`
				);
				revokedCount++;
			}
			if (item.thumbnailUrl && item.thumbnailUrl.startsWith("blob:")) {
				revokeMediaBlob(item.thumbnailUrl, "clearProjectMedia:thumbnail");

				revokedCount++;
			}
		});

		// Clear local state
		set({ mediaItems: [] });

		// Also clean up orphaned stickers when media is cleared
		try {
			const { useStickersOverlayStore } = await import(
				"@/stores/stickers-overlay-store"
			);
			const stickerStore = useStickersOverlayStore.getState();
			if (stickerStore.overlayStickers.size > 0) {
				debugLog(
					`[MediaStore] Media cleared, cleaning up ${stickerStore.overlayStickers.size} orphaned stickers`
				);
				stickerStore.cleanupInvalidStickers([]); // Empty array = all stickers are invalid
			}
		} catch (error) {
			debugError(
				"[MediaStore] Failed to cleanup stickers after media clear:",
				error
			);
		}

		// Clear persistent storage
		try {
			const mediaIds = state.mediaItems.map((item) => item.id);
			await Promise.all(
				mediaIds.map((id) => storageService.deleteMediaItem(projectId, id))
			);
			debugLog(
				`[Cleanup] Cleared ${mediaIds.length} media items from persistent storage for project ${projectId}`
			);
		} catch (error) {}
	},

	clearAllMedia: () => {
		const state = get();
		let revokedCount = 0;

		// Enhanced cleanup with better URL tracking and logging
		state.mediaItems.forEach((item) => {
			if (item.url && item.url.startsWith("blob:")) {
				revokeMediaBlob(item.url, "clearAllMedia:url");
				debugLog(`[Cleanup] Revoked blob URL for ${item.name}: ${item.url}`);
				revokedCount++;
			}
			if (item.thumbnailUrl && item.thumbnailUrl.startsWith("blob:")) {
				revokeMediaBlob(item.thumbnailUrl, "clearAllMedia:thumbnail");
				debugLog(
					`[Cleanup] Revoked thumbnail blob URL for ${item.name}: ${item.thumbnailUrl}`
				);
				revokedCount++;
			}
		});

		debugLog(
			`[Cleanup] Revoked ${revokedCount} blob URLs from ${state.mediaItems.length} media items`
		);

		// Clear local state
		set({ mediaItems: [] });
	},

	restoreMediaItems: (items: MediaItem[]) => {
		debugLog(`[MediaStore] Restoring ${items.length} media items (rollback)`);
		set({ mediaItems: items });
	},

	// Takes management (for AI-generated media with multiple versions)
	addTake: (mediaId: string, take: { url: string; localPath?: string; createdAt: number }) => {
		set((state) => ({
			mediaItems: state.mediaItems.map((item) => {
				if (item.id !== mediaId) return item;
				const takes = [...(item.metadata?.takes || []), take];
				return {
					...item,
					url: take.url,
					metadata: {
						...item.metadata,
						takes,
						activeTakeIndex: takes.length - 1,
					},
				};
			}),
		}));
	},

	deleteTake: (mediaId: string, takeIndex: number) => {
		set((state) => ({
			mediaItems: state.mediaItems.map((item) => {
				if (item.id !== mediaId || !item.metadata?.takes) return item;
				const takes = [...item.metadata.takes];
				if (takeIndex < 0 || takeIndex >= takes.length || takes.length <= 1)
					return item;
				takes.splice(takeIndex, 1);
				const activeIdx = Math.min(
					item.metadata.activeTakeIndex ?? 0,
					takes.length - 1
				);
				return {
					...item,
					url: takes[activeIdx]?.url ?? item.url,
					metadata: { ...item.metadata, takes, activeTakeIndex: activeIdx },
				};
			}),
		}));
	},

	setActiveTake: (mediaId: string, takeIndex: number) => {
		set((state) => ({
			mediaItems: state.mediaItems.map((item) => {
				if (item.id !== mediaId || !item.metadata?.takes) return item;
				const idx = Math.max(
					0,
					Math.min(takeIndex, item.metadata.takes.length - 1)
				);
				return {
					...item,
					url: item.metadata.takes[idx]?.url ?? item.url,
					metadata: { ...item.metadata, activeTakeIndex: idx },
				};
			}),
		}));
	},

	// Spread folder actions slice
	...createFolderActions(set, get),

	syncFromProjectFolder: async (projectId) => {
		try {
			const { syncProjectFolder } = await import(
				"@/lib/project/project-folder-sync"
			);
			return syncProjectFolder(projectId);
		} catch (error) {
			debugError("[MediaStore] Failed to sync from project folder:", error);
			return {
				imported: 0,
				skipped: 0,
				errors: [String(error)],
				scanTime: 0,
				totalDiskFiles: 0,
			};
		}
	},
}));

// Expose for iPad CLI debugging (qcut://eval)
(window as any).__mediaStore = useMediaStore;
