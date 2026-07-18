import { TProject, Scene } from "@/types/project";
import { TimelineTrack } from "@/types/timeline";
import type { MediaImportMetadata } from "@/types/electron.d";

export interface StorageAdapter<T> {
	get(key: string): Promise<T | null>;
	set(key: string, value: T): Promise<void>;
	remove(key: string): Promise<void>;
	list(): Promise<string[]>;
	clear(): Promise<void>;
}

export interface MediaFileData {
	id: string;
	name: string;
	type: "image" | "video" | "audio";
	size: number;
	lastModified: number;
	width?: number;
	height?: number;
	duration?: number;
	url?: string; // For generated images with blob URLs
	thumbnailUrl?: string; // Video thumbnail as data URL (persisted)
	metadata?: Record<string, unknown>; // Additional metadata
	localPath?: string; // Filesystem path for FFmpeg CLI export (videos only)
	folderIds?: string[]; // Virtual folder membership
	importMetadata?: MediaImportMetadata; // Symlink/copy import tracking
	// File will be stored separately in OPFS
}

/**
 * Serialized folder data for IndexedDB storage.
 * Matches MediaFolder interface from media-store-types.ts
 */
export interface FolderData {
	id: string;
	name: string;
	parentId: string | null;
	color?: string;
	isExpanded: boolean;
	createdAt: number;
	updatedAt: number;
}

export interface TimelineData {
	tracks: TimelineTrack[];
	lastModified: string;
}

export interface StorageConfig {
	projectsDb: string;
	mediaDb: string;
	timelineDb: string;
	version: number;
}

// Serialized scene type
export interface SerializedScene {
	id: string;
	name: string;
	isMain: boolean;
	createdAt: string;
	updatedAt: string;
}

/** Project payload for storage (Date -> string, scenes -> SerializedScene[]). */
export type SerializedProject = Omit<
	TProject,
	"createdAt" | "updatedAt" | "scenes"
> & {
	createdAt: string;
	updatedAt: string;
	scenes: SerializedScene[];
};

/** Studio-page project folder payload for storage (Date -> string). */
export interface SerializedProjectFolder {
	id: string;
	name: string;
	createdAt: string;
}

// Extend FileSystemDirectoryHandle with missing async iterator methods
declare global {
	interface FileSystemDirectoryHandle {
		keys(): AsyncIterableIterator<string>;
		values(): AsyncIterableIterator<FileSystemHandle>;
		entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
	}
}
