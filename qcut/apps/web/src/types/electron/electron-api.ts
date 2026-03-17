/**
 * Master ElectronAPI interface definition (web-side).
 *
 * Composed from domain-specific sub-interfaces for maintainability.
 * Each sub-interface is defined in its own api-*.ts file.
 */

import type { ElectronFileOps } from "./api-file-ops";
import type { ElectronStorageOps } from "./api-storage";
import type { ElectronSoundOps } from "./api-sounds";
import type {
	ElectronAudioOps,
	ElectronVideoOps,
	ElectronScreenRecordingOps,
	ElectronScreenshotOps,
} from "./api-audio-video";
import type { ElectronTranscriptionOps } from "./api-transcription";
import type { ElectronFFmpegOps } from "./api-ffmpeg";
import type {
	ElectronApiKeyOps,
	ElectronShellOps,
	ElectronGitHubOps,
	ElectronFalOps,
} from "./api-external";
import type {
	ElectronGeminiChatOps,
	ElectronPtyOps,
	ElectronMcpOps,
} from "./api-gemini-pty-mcp";
import type { ElectronSkillsOps } from "./api-skills";
import type { ElectronClaudeOps } from "./api-claude";
import type {
	ElectronRemotionFolderOps,
	ElectronRemotionOps,
} from "./api-remotion";
import type { ElectronMoyinOps } from "./api-moyin";
import type { ElectronUpdateOps } from "./api-updates";
import type { ElectronLicenseOps } from "./api-license";
import type { ElectronPiAgentOps } from "./api-pi-agent";
import type { ElectronYouTubeOps } from "./api-youtube";
import type {
	AIPipelineProgress,
	AIPipelineGenerateOptions,
	AIPipelineResult,
	AIPipelineCostEstimate,
	AIPipelineStatus,
} from "./ai-pipeline";
import type { MediaImportOptions, MediaImportResult } from "./media-import";
import type {
	ProjectFolderFileInfo,
	ProjectFolderScanResult,
} from "./project-folder";

export interface ElectronAPI
	extends ElectronFileOps,
		ElectronStorageOps,
		ElectronSoundOps,
		ElectronAudioOps,
		ElectronVideoOps,
		ElectronScreenRecordingOps,
		ElectronScreenshotOps,
		ElectronTranscriptionOps,
		ElectronFFmpegOps,
		ElectronApiKeyOps,
		ElectronShellOps,
		ElectronGitHubOps,
		ElectronFalOps,
		ElectronGeminiChatOps,
		ElectronPtyOps,
		ElectronMcpOps,
		ElectronSkillsOps,
		ElectronClaudeOps,
		ElectronRemotionFolderOps,
		ElectronRemotionOps,
		ElectronMoyinOps,
		ElectronUpdateOps,
		ElectronLicenseOps,
		ElectronPiAgentOps,
		ElectronYouTubeOps {
	// System info
	platform: string;
	isElectron: boolean;

	// Generic IPC invoke method
	invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;

	// AI Pipeline operations
	aiPipeline?: {
		check: () => Promise<{ available: boolean; error?: string }>;
		status: () => Promise<AIPipelineStatus>;
		generate: (options: AIPipelineGenerateOptions) => Promise<AIPipelineResult>;
		listModels: () => Promise<AIPipelineResult>;
		estimateCost: (
			options: AIPipelineCostEstimate
		) => Promise<AIPipelineResult>;
		cancel: (sessionId: string) => Promise<{ success: boolean }>;
		refresh: () => Promise<AIPipelineStatus>;
		onProgress: (
			callback: (progress: AIPipelineProgress) => void
		) => () => void;
	};

	// Media Import operations
	mediaImport?: {
		import: (options: MediaImportOptions) => Promise<MediaImportResult>;
		validateSymlink: (symlinkPath: string) => Promise<boolean>;
		locateOriginal: (mediaPath: string) => Promise<string | null>;
		relinkMedia: (
			projectId: string,
			mediaId: string,
			newSourcePath: string
		) => Promise<MediaImportResult>;
		remove: (projectId: string, mediaId: string) => Promise<void>;
		checkSymlinkSupport: () => Promise<boolean>;
		getMediaPath: (projectId: string) => Promise<string>;
	};

	// Project Folder operations
	projectFolder?: {
		getRoot: (projectId: string) => Promise<string>;
		scan: (
			projectId: string,
			subPath?: string,
			options?: { recursive?: boolean; mediaOnly?: boolean }
		) => Promise<ProjectFolderScanResult>;
		list: (
			projectId: string,
			subPath?: string
		) => Promise<ProjectFolderFileInfo[]>;
		ensureStructure: (
			projectId: string
		) => Promise<{ created: string[]; existing: string[] }>;
	};

	// Project JSON auto-sync
	projectJson?: {
		write: (projectId: string) => Promise<{ ok: boolean }>;
	};

	// Video semantic search
	videoSearch?: {
		search: (
			projectId: string,
			query: string,
			options?: { topK?: number; minScore?: number; mediaFilter?: string[] }
		) => Promise<{
			results: Array<{
				mediaId: string;
				mediaName: string;
				chunkIndex: number;
				startTime: number;
				endTime: number;
				score: number;
				thumbnailPath?: string;
			}>;
			error?: string;
			message?: string;
		}>;
		indexMedia: (
			projectId: string,
			mediaId: string,
			mediaPath: string,
			mediaName: string,
			totalDuration: number
		) => Promise<{
			status: string;
			mediaId: string;
			chunks?: number;
			error?: string;
		}>;
		cancelIndexing: (projectId: string) => Promise<void>;
		indexStatus: (projectId: string) => Promise<{ indexedMediaIds: string[] }>;
		deleteIndex: (
			projectId: string,
			mediaId: string
		) => Promise<{ ok: boolean }>;
		providerStatus: () => Promise<{ name: string; available: boolean }>;
		onIndexProgress: (
			callback: (progress: {
				phase: string;
				current: number;
				total: number;
				mediaId?: string;
				mediaName?: string;
			}) => void
		) => void;
		removeListeners: () => void;
	};
}
