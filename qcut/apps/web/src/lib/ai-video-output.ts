import { generateUUID } from "@/lib/utils";
import { debugLog } from "@/lib/debug-config";

export interface AIVideoOutput {
  id: string;
  filename: string;
  localPath: string;
  status: "downloading" | "completed" | "error";
  progress: number;
  metadata: {
    prompt: string;
    model: string;
    duration: number;
    createdAt: Date;
  };
}

export class AIVideoOutputManager {
  private outputDir: string;
  private activeDownloads = new Map<string, AIVideoOutput>();

  constructor(baseOutputDir = "./ai-generated-videos") {
    this.outputDir = baseOutputDir;
  }

  async startDownload(
    videoId: string,
    prompt: string,
    model: string
  ): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `ai-video-${model}-${videoId}-${timestamp}.mp4`;
    const localPath = `${this.outputDir}/${filename}`;

    const output: AIVideoOutput = {
      id: videoId,
      filename,
      localPath,
      status: "downloading",
      progress: 0,
      metadata: {
        prompt,
        model,
        duration: 0,
        createdAt: new Date(),
      },
    };

    this.activeDownloads.set(videoId, output);
    debugLog(
      `🚀 AIVideoOutputManager: Started download tracking for ${videoId}`
    );
    return localPath;
  }

  updateProgress(videoId: string, progress: number) {
    const download = this.activeDownloads.get(videoId);
    if (download) {
      download.progress = Math.min(100, Math.max(0, progress));
      debugLog(
        `📊 AIVideoOutputManager: Progress ${videoId}: ${download.progress}%`
      );
    }
  }

  async completeDownload(
    videoId: string,
    videoDuration = 5
  ): Promise<AIVideoOutput | null> {
    const download = this.activeDownloads.get(videoId);
    if (download) {
      download.status = "completed";
      download.progress = 100;
      download.metadata.duration = videoDuration;
      debugLog(`✅ AIVideoOutputManager: Download completed for ${videoId}`);
      return download;
    }
    return null;
  }

  markError(videoId: string, error: string): void {
    const download = this.activeDownloads.get(videoId);
    if (download) {
      download.status = "error";
      console.error(
        `❌ AIVideoOutputManager: Download failed for ${videoId}: ${error}`
      );
    }
  }

  getDownloadStatus(videoId: string): AIVideoOutput | null {
    return this.activeDownloads.get(videoId) || null;
  }

  getAllActiveDownloads(): AIVideoOutput[] {
    return Array.from(this.activeDownloads.values());
  }

  cleanupDownload(videoId: string): void {
    this.activeDownloads.delete(videoId);
    debugLog(
      `🧹 AIVideoOutputManager: Cleaned up download tracking for ${videoId}`
    );
  }

  // Helper method to create File object from downloaded data
  async createFileFromData(
    data: Uint8Array,
    filename: string,
    mimeType = "video/mp4"
  ): Promise<File> {
    const blob = new Blob([data], { type: mimeType });
    return new File([blob], filename, { type: mimeType });
  }
}
