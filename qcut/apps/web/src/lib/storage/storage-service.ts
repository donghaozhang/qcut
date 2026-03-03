import { TProject } from "@/types/project";
import { MediaItem } from "@/stores/media/media-store";
import { IndexedDBAdapter } from "./indexeddb-adapter";
import { LocalStorageAdapter } from "./localstorage-adapter";
import { ElectronStorageAdapter } from "./electron-adapter";
import { OPFSAdapter } from "./opfs-adapter";
import {
	MediaFileData,
	StorageConfig,
	SerializedProject,
	SerializedScene,
	TimelineData,
	StorageAdapter,
	FolderData,
} from "./types";
import type { MediaFolder } from "@/stores/media/media-store-types";
import { TimelineTrack } from "@/types/timeline";
import { debugLog, debugError, debugWarn } from "@/lib/debug/debug-config";

class StorageService {
	private projectsAdapter!: StorageAdapter<SerializedProject>;
	private config: StorageConfig;
	private isInitialized = false;
	private mediaAdapterCache = new Map<
		string,
		{
			mediaMetadataAdapter: IndexedDBAdapter<MediaFileData>;
			mediaFilesAdapter: OPFSAdapter;
		}
	>();
	private folderAdapterCache = new Map<string, IndexedDBAdapter<FolderData>>();

	constructor() {
		this.config = {
			projectsDb: "video-editor-projects",
			mediaDb: "video-editor-media",
			timelineDb: "video-editor-timelines",
			version: 1,
		};

		// Initialize storage immediately
		this.initializeStorage();
	}

	private isElectronEnvironment(): boolean {
		return (
			typeof window !== "undefined" &&
			!!(window as any).electronAPI &&
			!!(window as any).electronAPI.storage
		);
	}

	private async initializeStorage() {
		if (this.isInitialized) {
			return; // Already initialized
		}

		// Try Electron IPC first if available
		if (this.isElectronEnvironment()) {
			try {
				this.projectsAdapter = new ElectronStorageAdapter<SerializedProject>(
					this.config.projectsDb,
					"projects"
				);
				// Test if Electron IPC works
				await this.projectsAdapter.list();
				this.isInitialized = true;
				return;
			} catch (error) {}
		}

		// Try IndexedDB second
		try {
			this.projectsAdapter = new IndexedDBAdapter<SerializedProject>(
				this.config.projectsDb,
				"projects",
				this.config.version
			);

			// Test if IndexedDB works by doing a simple operation
			await this.projectsAdapter.list();
			this.isInitialized = true;
		} catch (error) {
			this.projectsAdapter = new LocalStorageAdapter<SerializedProject>(
				this.config.projectsDb,
				"projects"
			);
			this.isInitialized = true;
		}
	}

	// Helper to get project-specific media adapters
	private getProjectMediaAdapters(projectId: string) {
		const cachedAdapters = this.mediaAdapterCache.get(projectId);
		if (cachedAdapters) {
			return cachedAdapters;
		}

		const mediaMetadataAdapter = new IndexedDBAdapter<MediaFileData>(
			`${this.config.mediaDb}-${projectId}`,
			"media-metadata",
			this.config.version
		);

		const mediaFilesAdapter = new OPFSAdapter(`media-files-${projectId}`);

		const adapters = { mediaMetadataAdapter, mediaFilesAdapter };
		this.mediaAdapterCache.set(projectId, adapters);
		debugLog("[StorageService] Cached media adapters", { projectId });

		return adapters;
	}

	private clearProjectMediaAdapters(projectId: string) {
		if (this.mediaAdapterCache.delete(projectId)) {
			debugLog("[StorageService] Cleared cached media adapters", {
				projectId,
			});
		}
	}

	// Helper to get project-specific folder adapter
	private getProjectFolderAdapter(
		projectId: string
	): IndexedDBAdapter<FolderData> {
		const cached = this.folderAdapterCache.get(projectId);
		if (cached) {
			return cached;
		}

		const adapter = new IndexedDBAdapter<FolderData>(
			`${this.config.mediaDb}-${projectId}-folders`,
			"folders",
			this.config.version
		);

		this.folderAdapterCache.set(projectId, adapter);
		debugLog("[StorageService] Cached folder adapter", { projectId });

		return adapter;
	}

	// Helper to get project-specific timeline adapter
	private getProjectTimelineAdapter({
		projectId,
		sceneId,
	}: {
		projectId: string;
		sceneId?: string;
	}) {
		const dbName = sceneId
			? `${this.config.timelineDb}-${projectId}-${sceneId}`
			: `${this.config.timelineDb}-${projectId}`;

		return new IndexedDBAdapter<TimelineData>(
			dbName,
			"timeline",
			this.config.version
		);
	}

	// Project operations
	async saveProject({ project }: { project: TProject }): Promise<void> {
		// Ensure storage is initialized
		await this.initializeStorage();

		// Convert scenes to serializable format
		const serializedScenes: SerializedScene[] = project.scenes.map((scene) => ({
			id: scene.id,
			name: scene.name,
			isMain: scene.isMain,
			createdAt: scene.createdAt.toISOString(),
			updatedAt: scene.updatedAt.toISOString(),
		}));

		// Convert TProject to serializable format
		const serializedProject: SerializedProject = {
			id: project.id,
			name: project.name,
			// Don't save blob URLs as they don't persist across sessions
			thumbnail: project.thumbnail?.startsWith("blob:")
				? ""
				: project.thumbnail,
			createdAt: project.createdAt.toISOString(),
			updatedAt: project.updatedAt.toISOString(),
			scenes: serializedScenes,
			currentSceneId: project.currentSceneId,
			backgroundColor: project.backgroundColor,
			backgroundType: project.backgroundType,
			blurIntensity: project.blurIntensity,
			bookmarks: project.bookmarks,
			fps: project.fps,
			canvasSize: project.canvasSize,
			canvasMode: project.canvasMode,
		};

		await this.projectsAdapter.set(project.id, serializedProject);
	}

	async loadProject({ id }: { id: string }): Promise<TProject | null> {
		const serializedProject = await this.projectsAdapter.get(id);

		if (!serializedProject) return null;

		// Convert scenes back from serialized format
		const scenes =
			serializedProject.scenes?.map((scene) => ({
				id: scene.id,
				name: scene.name,
				isMain: scene.isMain,
				createdAt: new Date(scene.createdAt),
				updatedAt: new Date(scene.updatedAt),
			})) || [];

		// Convert back to TProject format
		return {
			id: serializedProject.id,
			name: serializedProject.name,
			thumbnail: serializedProject.thumbnail,
			createdAt: new Date(serializedProject.createdAt),
			updatedAt: new Date(serializedProject.updatedAt),
			scenes,
			currentSceneId: serializedProject.currentSceneId || scenes[0]?.id || "",
			backgroundColor: serializedProject.backgroundColor,
			backgroundType: serializedProject.backgroundType,
			blurIntensity: serializedProject.blurIntensity,
			bookmarks: serializedProject.bookmarks,
			fps: serializedProject.fps,
			canvasSize: serializedProject.canvasSize || { width: 1920, height: 1080 },
			canvasMode: serializedProject.canvasMode || "preset",
		};
	}

	async loadAllProjects(): Promise<TProject[]> {
		// Ensure storage is initialized
		await this.initializeStorage();

		const projectIds = await this.projectsAdapter.list();

		// DEBUG: Log how many project IDs found
		debugLog(
			`[StorageService.loadAllProjects] Found ${projectIds.length} project IDs to load`
		);
		if (projectIds.length > 0 && projectIds.length <= 10) {
			debugLog("[StorageService.loadAllProjects] Project IDs:", projectIds);
		} else if (projectIds.length > 10) {
			debugLog(
				"[StorageService.loadAllProjects] First 5 project IDs:",
				projectIds.slice(0, 5)
			);
			debugLog(
				"[StorageService.loadAllProjects] Last 5 project IDs:",
				projectIds.slice(-5)
			);
		}

		const projects: TProject[] = [];

		for (const id of projectIds) {
			const project = await this.loadProject({ id });
			if (project) {
				projects.push(project);
			} else {
			}
		}

		// Sort by last updated (most recent first)
		return projects.sort(
			(a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
		);
	}

	async deleteProject(id: string): Promise<void> {
		await this.projectsAdapter.remove(id);
		this.clearProjectMediaAdapters(id);
		await this.deleteFolders(id);
	}

	// Media operations - now project-specific
	async saveMediaItem(projectId: string, mediaItem: MediaItem): Promise<void> {
		// DEBUG: Log projectId at entry point
		debugLog(
			`[StorageService.saveMediaItem] Called with projectId: ${projectId}, mediaItem.id: ${mediaItem.id}, mediaItem.name: ${mediaItem.name}`
		);

		const { mediaMetadataAdapter, mediaFilesAdapter } =
			this.getProjectMediaAdapters(projectId);

		// Only save file if it has actual content
		if (mediaItem.file.size > 0) {
			// Save file to project-specific OPFS
			await mediaFilesAdapter.set(mediaItem.id, mediaItem.file);
		}

		// Save metadata to project-specific IndexedDB
		const metadata: MediaFileData = {
			id: mediaItem.id,
			name: mediaItem.name,
			type: mediaItem.type,
			size: mediaItem.file.size,
			lastModified: mediaItem.file.lastModified,
			width: mediaItem.width,
			height: mediaItem.height,
			duration: mediaItem.duration,
			// Only store non-blob URLs (e.g., data URLs, http URLs)
			// Blob URLs are temporary and don't persist across sessions
			url: mediaItem.url?.startsWith("blob:") ? undefined : mediaItem.url,
			// Persist thumbnail data URL for videos (survives reload)
			thumbnailUrl: mediaItem.thumbnailUrl,
			metadata: mediaItem.metadata,
			// Persist localPath for FFmpeg CLI export (videos only)
			localPath: mediaItem.localPath,
			// Persist folder membership for virtual folder organization
			folderIds: mediaItem.folderIds,
		};

		await mediaMetadataAdapter.set(mediaItem.id, metadata);
	}

	async loadMediaItem(
		projectId: string,
		id: string
	): Promise<MediaItem | null> {
		const { mediaMetadataAdapter, mediaFilesAdapter } =
			this.getProjectMediaAdapters(projectId);

		const [file, metadata] = await Promise.all([
			mediaFilesAdapter.get(id),
			mediaMetadataAdapter.get(id),
		]);

		if (!metadata) return null;

		let url: string | undefined;
		let actualFile: File;

		if (file && file.size > 0) {
			// File exists with content
			actualFile = file;

			// In Electron, convert to data URL for better compatibility
			if (this.isElectronEnvironment() && metadata.type === "image") {
				// For images in Electron, use data URL
				url = await new Promise<string>((resolve, reject) => {
					const reader = new FileReader();
					reader.onload = () => {
						if (typeof reader.result === "string") {
							resolve(reader.result);
						} else {
							reject(new Error("Failed to read file as data URL"));
						}
					};
					reader.onerror = () => reject(reader.error);
					reader.readAsDataURL(file);
				});
				debugLog(
					`[StorageService] Created data URL for ${metadata.name} in Electron`
				);
			} else {
				// DON'T create blob URL here - let consumers create lazily
				// This prevents wasteful URL creation during cleanup migrations
				// MediaStore.loadProjectMedia() will create URLs when needed
				url = undefined;
				debugLog(
					`[StorageService] Loaded ${metadata.name} without blob URL (lazy creation)`
				);
			}
		} else if (metadata.url) {
			// No file or empty file, but we have a URL (e.g., generated image fallback)
			// Skip invalid blob URLs from previous sessions
			if (metadata.url.startsWith("blob:")) {
				debugWarn(
					`[StorageService] Skipping invalid blob URL for ${metadata.name}. Blob URLs don't persist across sessions.`
				);
				return null;
			}
			url = metadata.url;
			// Create empty file placeholder
			actualFile = new File([], metadata.name, {
				type: `${metadata.type}/jpeg`,
			});
			debugLog(
				`[StorageService] Using stored URL for ${metadata.name}: ${url}`
			);
		} else {
			// No file and no URL, cannot load
			debugWarn(
				`[StorageService] No file or URL found for media item: ${metadata.name}`
			);
			return null;
		}

		// Verify or regenerate localPath for videos
		// Temp files in /tmp may be cleaned up by the OS between sessions
		let localPath = metadata.localPath;
		if (
			metadata.type === "video" &&
			actualFile &&
			actualFile.size > 0 &&
			this.isElectronEnvironment() &&
			(window as any).electronAPI?.video?.saveTemp
		) {
			// Verify existing localPath still points to a real file
			let needsRegeneration = !localPath;
			if (localPath && (window as any).electronAPI?.video?.verifyFile) {
				try {
					const exists = await (window as any).electronAPI.video.verifyFile(
						localPath
					);
					if (!exists) {
						debugLog(
							`[StorageService] Temp file missing, will recreate: ${metadata.name}`
						);
						needsRegeneration = true;
					}
				} catch {
					needsRegeneration = true;
				}
			}

			if (needsRegeneration) {
				try {
					const arrayBuffer = await actualFile.arrayBuffer();
					const uint8Array = new Uint8Array(arrayBuffer);
					localPath = await (window as any).electronAPI.video.saveTemp(
						uint8Array,
						metadata.name
					);

					// Update metadata with new localPath for future loads
					if (localPath) {
						metadata.localPath = localPath;
						await mediaMetadataAdapter.set(id, metadata);
						debugLog(`[StorageService] Regenerated localPath: ${localPath}`);
					}
				} catch (error) {
					debugWarn(
						`[StorageService] Failed to regenerate localPath for ${metadata.name}:`,
						error
					);
				}
			}
		}

		return {
			id: metadata.id,
			name: metadata.name,
			type: metadata.type,
			file: actualFile,
			url,
			// Load persisted thumbnail data URL (survives reload)
			thumbnailUrl: metadata.thumbnailUrl,
			width: metadata.width,
			height: metadata.height,
			duration: metadata.duration,
			metadata: metadata.metadata,
			// Restore localPath for FFmpeg CLI export
			localPath,
			// Restore folder membership for virtual folder organization
			folderIds: metadata.folderIds,
		};
	}

	async loadAllMediaItems(projectId: string): Promise<MediaItem[]> {
		const { mediaMetadataAdapter } = this.getProjectMediaAdapters(projectId);

		const mediaIds = await mediaMetadataAdapter.list();
		const mediaItems: MediaItem[] = [];

		for (const id of mediaIds) {
			const item = await this.loadMediaItem(projectId, id);
			if (item) {
				mediaItems.push(item);
			}
		}

		return mediaItems;
	}

	/** Fast thumbnail lookup — reads only metadata (no file blobs from OPFS). */
	async findProjectThumbnail(
		projectId: string,
		timelineTracks: TimelineTrack[] | null
	): Promise<string | null> {
		const { mediaMetadataAdapter } = this.getProjectMediaAdapters(projectId);
		const mediaIds = await mediaMetadataAdapter.list();
		if (!mediaIds.length) return null;

		// Build ordered list: timeline media first, then all media
		const priorityIds: string[] = [];
		if (timelineTracks) {
			const timelineMediaIds = timelineTracks
				.flatMap((t) => t.elements)
				.filter((e) => e.type === "media")
				.sort((a, b) => a.startTime - b.startTime)
				.map((e) => e.mediaId);
			for (const id of timelineMediaIds) {
				if (mediaIds.includes(id)) priorityIds.push(id);
			}
		}
		// Add remaining media IDs not already in priority list
		for (const id of mediaIds) {
			if (!priorityIds.includes(id)) priorityIds.push(id);
		}

		// Scan metadata only — no file blob loading
		for (const id of priorityIds) {
			const metadata = await mediaMetadataAdapter.get(id);
			if (!metadata) continue;

			// Use persisted thumbnail data URL (videos)
			if (metadata.thumbnailUrl) return metadata.thumbnailUrl;
			// Use persisted non-blob URL (generated images with data URLs)
			if (
				metadata.url &&
				!metadata.url.startsWith("blob:") &&
				(metadata.type === "image" || metadata.type === "video")
			) {
				return metadata.url;
			}
		}

		return null;
	}

	async deleteMediaItem(projectId: string, id: string): Promise<void> {
		const { mediaMetadataAdapter, mediaFilesAdapter } =
			this.getProjectMediaAdapters(projectId);

		await Promise.all([
			mediaFilesAdapter.remove(id),
			mediaMetadataAdapter.remove(id),
		]);
	}

	async deleteProjectMedia(projectId: string): Promise<void> {
		const { mediaMetadataAdapter, mediaFilesAdapter } =
			this.getProjectMediaAdapters(projectId);

		await Promise.all([
			mediaMetadataAdapter.clear(),
			mediaFilesAdapter.clear(),
		]);
		this.clearProjectMediaAdapters(projectId);
	}

	// ============================================================================
	// Folder Operations - Virtual folder persistence
	// ============================================================================

	/**
	 * Save all folders for a project.
	 * Replaces existing folders with the new set.
	 */
	async saveFolders(projectId: string, folders: MediaFolder[]): Promise<void> {
		const adapter = this.getProjectFolderAdapter(projectId);

		// Clear existing folders and save all new ones
		await adapter.clear();

		for (const folder of folders) {
			const folderData: FolderData = {
				id: folder.id,
				name: folder.name,
				parentId: folder.parentId,
				color: folder.color,
				isExpanded: folder.isExpanded,
				createdAt: folder.createdAt,
				updatedAt: folder.updatedAt,
			};
			await adapter.set(folder.id, folderData);
		}

		debugLog(
			`[StorageService] Saved ${folders.length} folders for project ${projectId}`
		);
	}

	/**
	 * Load all folders for a project.
	 */
	async loadFolders(projectId: string): Promise<MediaFolder[]> {
		const adapter = this.getProjectFolderAdapter(projectId);
		const folderIds = await adapter.list();
		const folders: MediaFolder[] = [];

		for (const id of folderIds) {
			const data = await adapter.get(id);
			if (data) {
				folders.push({
					id: data.id,
					name: data.name,
					parentId: data.parentId,
					color: data.color,
					isExpanded: data.isExpanded ?? true,
					createdAt: data.createdAt,
					updatedAt: data.updatedAt,
				});
			}
		}

		debugLog(
			`[StorageService] Loaded ${folders.length} folders for project ${projectId}`
		);
		return folders;
	}

	/**
	 * Delete all folders for a project.
	 */
	async deleteFolders(projectId: string): Promise<void> {
		const adapter = this.getProjectFolderAdapter(projectId);
		await adapter.clear();
		this.folderAdapterCache.delete(projectId);
		debugLog(`[StorageService] Deleted folders for project ${projectId}`);
	}

	// Legacy timeline operations (kept for backward compatibility)
	async saveProjectTimeline({
		projectId,
		tracks,
		sceneId,
	}: {
		projectId: string;
		tracks: TimelineTrack[];
		sceneId?: string;
	}): Promise<void> {
		return this.saveTimeline({ projectId, tracks, sceneId });
	}

	async loadProjectTimeline({
		projectId,
		sceneId,
	}: {
		projectId: string;
		sceneId?: string;
	}): Promise<TimelineTrack[] | null> {
		return this.loadTimeline({ projectId, sceneId });
	}

	async deleteProjectTimeline({
		projectId,
	}: {
		projectId: string;
	}): Promise<void> {
		const timelineAdapter = this.getProjectTimelineAdapter({ projectId });
		await timelineAdapter.remove("timeline");
	}

	// Scene-aware timeline operations
	async saveTimeline({
		projectId,
		tracks,
		sceneId,
	}: {
		projectId: string;
		tracks: TimelineTrack[];
		sceneId?: string;
	}): Promise<void> {
		const timelineAdapter = this.getProjectTimelineAdapter({
			projectId,
			sceneId,
		});
		const timelineData: TimelineData = {
			tracks,
			lastModified: new Date().toISOString(),
		};
		await timelineAdapter.set("timeline", timelineData);
	}

	async loadTimeline({
		projectId,
		sceneId,
	}: {
		projectId: string;
		sceneId?: string;
	}): Promise<TimelineTrack[] | null> {
		const timelineAdapter = this.getProjectTimelineAdapter({
			projectId,
			sceneId,
		});
		const timelineData = await timelineAdapter.get("timeline");
		return timelineData ? timelineData.tracks : null;
	}

	// Utility methods
	async clearAllData(): Promise<void> {
		// Clear all projects
		await this.projectsAdapter.clear();

		// Note: Project-specific media and timelines will be cleaned up when projects are deleted
	}

	async getStorageInfo(): Promise<{
		projects: number;
		isOPFSSupported: boolean;
		isIndexedDBSupported: boolean;
	}> {
		const projectIds = await this.projectsAdapter.list();

		return {
			projects: projectIds.length,
			isOPFSSupported: this.isOPFSSupported(),
			isIndexedDBSupported: this.isIndexedDBSupported(),
		};
	}

	async getProjectStorageInfo(projectId: string): Promise<{
		mediaItems: number;
		hasTimeline: boolean;
	}> {
		const { mediaMetadataAdapter } = this.getProjectMediaAdapters(projectId);
		const timelineAdapter = this.getProjectTimelineAdapter({ projectId });

		const [mediaIds, timelineData] = await Promise.all([
			mediaMetadataAdapter.list(),
			timelineAdapter.get("timeline"),
		]);

		return {
			mediaItems: mediaIds.length,
			hasTimeline: !!timelineData,
		};
	}

	// Check browser support
	isOPFSSupported(): boolean {
		return OPFSAdapter.isSupported();
	}

	isIndexedDBSupported(): boolean {
		return "indexedDB" in window;
	}

	isFullySupported(): boolean {
		return this.isIndexedDBSupported() && this.isOPFSSupported();
	}

	/**
	 * Check storage quota to prevent running out of space
	 */
	async checkStorageQuota(): Promise<{
		available: boolean;
		usage: number;
		quota: number;
		usagePercent: number;
	}> {
		if (typeof navigator === "undefined" || !("storage" in navigator)) {
			// Storage API not supported - assume available but with unknown limits
			debugLog(
				"[StorageService] Storage API not supported, assuming available"
			);
			return { available: true, usage: 0, quota: Infinity, usagePercent: 0 };
		}

		try {
			const estimate = await navigator.storage.estimate();
			const usage = estimate.usage || 0;
			const quota = estimate.quota || Infinity;
			const usagePercent = quota === Infinity ? 0 : (usage / quota) * 100;

			debugLog(
				`[StorageService] Storage usage: ${(usage / 1024 / 1024).toFixed(2)}MB / ${quota === Infinity ? "∞" : (quota / 1024 / 1024).toFixed(2)}MB (${usagePercent.toFixed(1)}%`
			);

			return {
				available: usagePercent < 80, // Warn at 80% usage
				usage,
				quota,
				usagePercent,
			};
		} catch (error) {
			debugError("[StorageService] Failed to check storage quota:", error);
			// On error, assume available to not block operations
			return { available: true, usage: 0, quota: Infinity, usagePercent: 0 };
		}
	}
}

// Export singleton instance
export const storageService = new StorageService();
export { StorageService };
