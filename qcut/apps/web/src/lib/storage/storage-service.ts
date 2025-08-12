import { TProject } from "@/types/project";
import { MediaItem } from "@/stores/media-store";
import { IndexedDBAdapter } from "./indexeddb-adapter";
import { LocalStorageAdapter } from "./localstorage-adapter";
import { ElectronStorageAdapter } from "./electron-adapter";
import { OPFSAdapter } from "./opfs-adapter";
import {
  MediaFileData,
  StorageConfig,
  SerializedProject,
  TimelineData,
  StorageAdapter,
} from "./types";
import { TimelineTrack } from "@/types/timeline";
import { debugLog, debugError } from "@/lib/debug-config";

class StorageService {
  private projectsAdapter!: StorageAdapter<SerializedProject>;
  private config: StorageConfig;
  private isInitialized = false;

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
    const mediaMetadataAdapter = new IndexedDBAdapter<MediaFileData>(
      `${this.config.mediaDb}-${projectId}`,
      "media-metadata",
      this.config.version
    );

    const mediaFilesAdapter = new OPFSAdapter(`media-files-${projectId}`);

    return { mediaMetadataAdapter, mediaFilesAdapter };
  }

  // Helper to get project-specific timeline adapter
  private getProjectTimelineAdapter(projectId: string) {
    return new IndexedDBAdapter<TimelineData>(
      `${this.config.timelineDb}-${projectId}`,
      "timeline",
      this.config.version
    );
  }

  // Project operations
  async saveProject(project: TProject): Promise<void> {
    // Ensure storage is initialized
    await this.initializeStorage();
    // Convert TProject to serializable format
    const serializedProject: SerializedProject = {
      id: project.id,
      name: project.name,
      thumbnail: project.thumbnail,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      backgroundColor: project.backgroundColor,
      backgroundType: project.backgroundType,
      blurIntensity: project.blurIntensity,
      bookmarks: project.bookmarks,
      fps: project.fps,
    };

    await this.projectsAdapter.set(project.id, serializedProject);
  }

  async loadProject(id: string): Promise<TProject | null> {
    const serializedProject = await this.projectsAdapter.get(id);

    if (!serializedProject) return null;

    // Convert back to TProject format
    return {
      id: serializedProject.id,
      name: serializedProject.name,
      thumbnail: serializedProject.thumbnail,
      createdAt: new Date(serializedProject.createdAt),
      updatedAt: new Date(serializedProject.updatedAt),
      backgroundColor: serializedProject.backgroundColor,
      backgroundType: serializedProject.backgroundType,
      blurIntensity: serializedProject.blurIntensity,
      bookmarks: serializedProject.bookmarks,
      fps: serializedProject.fps,
    };
  }

  async loadAllProjects(): Promise<TProject[]> {
    // Ensure storage is initialized
    await this.initializeStorage();

    const projectIds = await this.projectsAdapter.list();
    const projects: TProject[] = [];

    for (const id of projectIds) {
      const project = await this.loadProject(id);
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
  }

  // Media operations - now project-specific
  async saveMediaItem(projectId: string, mediaItem: MediaItem): Promise<void> {
    console.log("[StorageService] saveMediaItem called:", {
      projectId,
      mediaItemId: mediaItem.id,
      name: mediaItem.name,
      type: mediaItem.type,
      fileSize: mediaItem.file.size,
      url: mediaItem.url,
      isBlobUrl: mediaItem.url?.startsWith('blob:')
    });

    const { mediaMetadataAdapter, mediaFilesAdapter } =
      this.getProjectMediaAdapters(projectId);

    // Only save file if it has actual content
    if (mediaItem.file.size > 0) {
      console.log("[StorageService] Saving file to OPFS:", mediaItem.id);
      // Save file to project-specific OPFS
      await mediaFilesAdapter.set(mediaItem.id, mediaItem.file);
      console.log("[StorageService] File saved to OPFS successfully");
    } else {
      console.warn("[StorageService] File has no content, skipping OPFS save");
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
      // Don't store blob URLs as they become invalid after page reload
      // Store data URLs and non-blob URLs (like original URLs from external sources)
      url: mediaItem.url && (!mediaItem.url.startsWith('blob:') || mediaItem.url.startsWith('data:')) ? mediaItem.url : undefined,
      metadata: mediaItem.metadata,
    };

    console.log("[StorageService] Saving metadata to IndexedDB:", {
      id: metadata.id,
      storedUrl: metadata.url,
      originalUrl: mediaItem.url
    });

    await mediaMetadataAdapter.set(mediaItem.id, metadata);
    console.log("[StorageService] Metadata saved successfully");
  }

  async loadMediaItem(
    projectId: string,
    id: string
  ): Promise<MediaItem | null> {
    console.error("[BLOB DEBUG] StorageService.loadMediaItem called:", { projectId, id });
    
    const { mediaMetadataAdapter, mediaFilesAdapter } =
      this.getProjectMediaAdapters(projectId);

    const [file, metadata] = await Promise.all([
      mediaFilesAdapter.get(id),
      mediaMetadataAdapter.get(id),
    ]);

    console.log("[StorageService] Loaded from storage:", {
      hasFile: !!file,
      fileSize: file?.size,
      hasMetadata: !!metadata,
      storedUrl: metadata?.url
    });

    if (!metadata) {
      console.warn("[StorageService] No metadata found for media item:", id);
      return null;
    }

    let url: string | undefined;
    let actualFile: File;

    // Prioritize stored data URLs over creating new blob URLs
    if (metadata.url && metadata.url.startsWith('data:')) {
      // Use stored data URL (preferred for SVG stickers)
      url = metadata.url;
      actualFile = file || new File([], metadata.name, {
        type: `${metadata.type}/svg+xml`,
      });
      console.log(
        `[StorageService] Using stored data URL for ${metadata.name}: ${url.substring(0, 50)}...`
      );
    } else if (file && file.size > 0) {
      // File exists with content, convert SVG to data URL or create blob URL
      if (metadata.name.endsWith('.svg') || metadata.type === 'image') {
        try {
          // Convert SVG files to data URLs to avoid blob:file:// issues
          const reader = new FileReader();
          url = await new Promise<string>((resolve, reject) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          console.log(
            `[StorageService] Converted SVG file to data URL for ${metadata.name}`
          );
        } catch (error) {
          console.error(`[StorageService] Failed to convert SVG to data URL, using blob URL:`, error);
          url = URL.createObjectURL(file);
        }
      } else {
        // For non-SVG files, create blob URL
        url = URL.createObjectURL(file);
        console.log(
          `[StorageService] Created new blob URL for ${metadata.name}: ${url}`
        );
      }
      actualFile = file;
      debugLog(
        `[StorageService] Processed file for ${metadata.name}: ${url?.substring(0, 50)}`
      );
    } else if (metadata.url && !metadata.url.startsWith('blob:')) {
      // No file or empty file, but we have a data URL or non-blob URL (e.g., external URL)
      url = metadata.url;
      // Create empty file placeholder
      actualFile = new File([], metadata.name, {
        type: `${metadata.type}/jpeg`,
      });
      console.log(
        `[StorageService] Using stored URL for ${metadata.name}: ${url.substring(0, 50)}...`
      );
    } else {
      // No valid file or URL available
      console.warn(
        `[StorageService] No valid file or URL found for media item: ${metadata.name}, id: ${id}`
      );
      // Create an empty file as fallback
      actualFile = new File([], metadata.name, {
        type: `${metadata.type}/jpeg`,
      });
      // Don't set a URL if we don't have a valid one
      url = undefined;
    }

    const result = {
      id: metadata.id,
      name: metadata.name,
      type: metadata.type,
      file: actualFile,
      url,
      width: metadata.width,
      height: metadata.height,
      duration: metadata.duration,
      metadata: metadata.metadata,
      // thumbnailUrl would need to be regenerated or cached separately
    };

    console.log('[STORAGE] Loading item:', {
      itemName: result.name,
      url: result.url?.substring(0, 50) + '...',
      isBlobUrl: result.url?.startsWith('blob:'),
      isFileBlob: result.url?.startsWith('blob:file:'),
      isDataUrl: result.url?.startsWith('data:'),
      fileSize: result.file.size,
      timestamp: new Date().toISOString()
    });

    return result;
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
  }

  // Timeline operations - now project-specific
  async saveTimeline(
    projectId: string,
    tracks: TimelineTrack[]
  ): Promise<void> {
    const timelineAdapter = this.getProjectTimelineAdapter(projectId);
    const timelineData: TimelineData = {
      tracks,
      lastModified: new Date().toISOString(),
    };
    await timelineAdapter.set("timeline", timelineData);
  }

  async loadTimeline(projectId: string): Promise<TimelineTrack[] | null> {
    const timelineAdapter = this.getProjectTimelineAdapter(projectId);
    const timelineData = await timelineAdapter.get("timeline");
    return timelineData ? timelineData.tracks : null;
  }

  async deleteProjectTimeline(projectId: string): Promise<void> {
    const timelineAdapter = this.getProjectTimelineAdapter(projectId);
    await timelineAdapter.remove("timeline");
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
    const timelineAdapter = this.getProjectTimelineAdapter(projectId);

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
   * Clear media items with problematic blob URLs
   */
  async clearBlobUrlMediaItems(projectId: string): Promise<number> {
    const { mediaMetadataAdapter } = this.getProjectMediaAdapters(projectId);
    
    const mediaIds = await mediaMetadataAdapter.list();
    let clearedCount = 0;
    
    for (const id of mediaIds) {
      const metadata = await mediaMetadataAdapter.get(id);
      if (metadata && metadata.url && metadata.url.startsWith('blob:file:///')) {
        await this.deleteMediaItem(projectId, id);
        clearedCount++;
        console.log(`[StorageService] Cleared problematic media item: ${metadata.name}`);
      }
    }
    
    console.log(`[StorageService] Cleared ${clearedCount} media items with blob URLs`);
    return clearedCount;
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
