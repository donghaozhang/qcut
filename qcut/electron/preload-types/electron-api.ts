/**
 * Master ElectronAPI interface definition.
 *
 * Composed from domain-specific sub-interfaces in api-types/.
 */

import type {
	FileOpsAPI,
	StorageAPI,
	ThemeAPI,
} from "./api-types/file-storage-api";
import type {
	SoundAPI,
	AudioAPI,
	VideoAPI,
	ScreenshotAPI,
	ScreenRecordingAPI,
} from "./api-types/media-api";
import type { TranscriptionAPI } from "./api-types/transcription-api";
import type { FFmpegExportAPI } from "./api-types/ffmpeg-export-api";
import type {
	ApiKeysAPI,
	ShellAPI,
	GitHubAPI,
	FalAPI,
	GeminiChatAPI,
} from "./api-types/ai-services-api";
import type { PtyAPI, McpAPI } from "./api-types/terminal-tools-api";
import type {
	SkillsAPI,
	AIPipelineAPI,
	MediaImportAPI,
	ProjectFolderAPI,
} from "./api-types/features-api";
import type {
	ClaudeMediaAPI,
	ClaudeTimelineAPI,
} from "./api-types/claude-timeline-api";
import type {
	ClaudeTransactionAPI,
	ClaudeProjectAPI,
} from "./api-types/claude-project-api";
import type {
	ClaudeAnalyzeAPI,
	ClaudeEventsAPI,
	ClaudeNotificationsAPI,
	ClaudeNavigatorAPI,
	ClaudeScreenRecordingBridgeAPI,
	ClaudeProjectCrudAPI,
	ClaudeUiAPI,
	ClaudeStateAPI,
} from "./api-types/claude-ui-api";
import type {
	RemotionFolderAPI,
	MoyinAPI,
} from "./api-types/remotion-moyin-api";
import type { UpdatesAPI, LicenseAPI } from "./api-types/system-api";

// ============================================================================
// Master ElectronAPI interface
// ============================================================================

export interface ElectronAPI
	extends FileOpsAPI,
		StorageAPI,
		ThemeAPI,
		SoundAPI,
		AudioAPI,
		VideoAPI,
		ScreenshotAPI,
		ScreenRecordingAPI,
		TranscriptionAPI,
		FFmpegExportAPI,
		ApiKeysAPI,
		ShellAPI,
		GitHubAPI,
		FalAPI,
		GeminiChatAPI,
		PtyAPI,
		McpAPI,
		SkillsAPI,
		AIPipelineAPI,
		MediaImportAPI,
		ProjectFolderAPI,
		RemotionFolderAPI,
		MoyinAPI,
		UpdatesAPI,
		LicenseAPI {
	platform: NodeJS.Platform;
	isElectron: boolean;

	// Claude Code Integration API
	claude?: ClaudeMediaAPI &
		ClaudeTimelineAPI &
		ClaudeTransactionAPI &
		ClaudeProjectAPI &
		ClaudeAnalyzeAPI &
		ClaudeEventsAPI &
		ClaudeNotificationsAPI &
		ClaudeNavigatorAPI &
		ClaudeScreenRecordingBridgeAPI &
		ClaudeProjectCrudAPI &
		ClaudeUiAPI &
		ClaudeStateAPI;
}

// ============================================================================
// Global augmentation
// ============================================================================

declare global {
	interface Window {
		electronAPI: ElectronAPI;
	}
}
