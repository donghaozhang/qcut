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

class StorageService {
  private projectsAdapter!: StorageAdapter<SerializedProject>;
  private config: StorageConfig;
  private useLocalStorage = false;
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
      this.useLocalStorage = true;
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
    const { mediaMetadataAdapter, mediaFilesAdapter } =
      this.getProjectMediaAdapters(projectId);

    // Save file to project-specific OPFS
    await mediaFilesAdapter.set(mediaItem.id, mediaItem.file);

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

    if (!file || !metadata) return null;

    // Create new object URL for the file
    const url = URL.createObjectURL(file);

    return {
      id: metadata.id,
      name: metadata.name,
      type: metadata.type,
      file,
      url,
      width: metadata.width,
      height: metadata.height,
      duration: metadata.duration,
      // thumbnailUrl would need to be regenerated or cached separately
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
}

// Export singleton instance
export const storageService = new StorageService();
export { StorageService };
