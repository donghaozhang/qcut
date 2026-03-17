// Define types directly to avoid static imports from media-store

import type { MediaImportMetadata } from "@/types/electron.d";

export type MediaType = "image" | "video" | "audio";

// ============================================================================
// Virtual Folder Types
// ============================================================================

/**
 * Virtual folder for organizing media items.
 * Virtual = metadata-only, files stay in original locations on disk.
 * Follows industry standards (Premiere bins, DaVinci bins, FCP events).
 */
export interface MediaFolder {
	id: string;
	name: string;
	parentId: string | null; // null = root level folder
	color?: string; // hex color for visual identification (e.g., "#ef4444")
	isExpanded: boolean; // UI collapse state for tree view
	createdAt: number; // timestamp (Date.now())
	updatedAt: number; // timestamp (Date.now())
}

// Folder constraints for validation
export const FOLDER_MAX_DEPTH = 3;
export const FOLDER_NAME_MAX_LENGTH = 50;
export const FOLDER_NAME_MIN_LENGTH = 1;

// Default folder IDs for optional auto-creation
export const DEFAULT_FOLDER_IDS = {
	VIDEOS: "default-videos",
	AUDIO: "default-audio",
	IMAGES: "default-images",
	AI_GENERATED: "default-ai-generated",
} as const;

// System folder IDs (not user-created)
export const SKILLS_FOLDER_ID = "system-skills-folder";

export interface MediaItem {
	id: string;
	name: string;
	type: MediaType;
	file: File;
	url?: string; // Object URL for preview (blob: URL)
	originalUrl?: string; // Original URL before blob conversion (e.g., fal.ai URL)
	localPath?: string; // REQUIRED for AI videos: Local file path on disk (absolute path)
	isLocalFile?: boolean; // True if file is saved to disk (MANDATORY for AI videos)
	thumbnailUrl?: string; // For video thumbnails (data URL, persisted to storage)
	thumbnailStatus?: "pending" | "loading" | "ready" | "failed"; // Thumbnail generation state
	duration?: number; // For video/audio duration
	width?: number; // For video/image width
	height?: number; // For video/image height
	fps?: number; // For video frame rate
	// Text-specific properties
	content?: string; // Text content
	fontSize?: number; // Font size
	fontFamily?: string; // Font family
	color?: string; // Text color
	backgroundColor?: string; // Background color
	textAlign?: "left" | "center" | "right"; // Text alignment
	ephemeral?: boolean; // Marks items as temporary (not saved)
	// Metadata for various sources (AI generated, etc.)
	metadata?: {
		source?: string; // e.g., 'text2image', 'upload', etc.
		[key: string]: any; // Allow other metadata
	};
	// Virtual folder membership (can be in multiple folders like tags)
	folderIds?: string[];
	// Import metadata for symlink/copy tracking
	importMetadata?: MediaImportMetadata;
}

// Generation metadata helpers (typed access to metadata.generationParams / takes)
// These fields are stored in MediaItem.metadata but typed here for convenience.
// See apps/web/src/types/generation.ts for GenerationParams and MediaTake types.

// Export type definitions for the store functions
export type MediaStoreUtils = {
	getFileType: (file: File) => MediaType | null;
	getImageDimensions: (
		file: File
	) => Promise<{ width: number; height: number }>;
	generateVideoThumbnail: (
		file: File,
		time?: number
	) => Promise<{ thumbnailUrl: string; width: number; height: number }>;
	getMediaDuration: (file: File) => Promise<number>;
	getMediaAspectRatio: (item: MediaItem) => number;
};

// Export type for the store itself
export type MediaStore = {
	mediaItems: MediaItem[];
	isLoading: boolean;
	hasInitialized: boolean;
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
	) => void;
	removeMediaItem: (projectId: string, id: string) => Promise<void>;
	loadProjectMedia: (projectId: string) => Promise<void>;
	clearProjectMedia: (projectId: string) => Promise<void>;
	clearAllMedia: () => void;
	// Folder assignment methods
	addToFolder: (mediaId: string, folderId: string) => void;
	removeFromFolder: (mediaId: string, folderId: string) => void;
	moveToFolder: (mediaId: string, targetFolderId: string | null) => void;
	getMediaByFolder: (folderId: string | null) => MediaItem[];
	// Bulk folder operations (for skills/automation)
	bulkAddToFolder: (mediaIds: string[], folderId: string) => void;
	bulkMoveToFolder: (mediaIds: string[], folderId: string | null) => void;
	autoOrganizeByType: () => void;
	// Takes management (for AI-generated media with multiple versions)
	addTake?: (mediaId: string, take: { url: string; localPath?: string; createdAt: number }) => void;
	deleteTake?: (mediaId: string, takeIndex: number) => void;
	setActiveTake?: (mediaId: string, takeIndex: number) => void;
};
