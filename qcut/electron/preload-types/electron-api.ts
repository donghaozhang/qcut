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
	ProjectJsonAPI,
	ProjectFolderAPI,
} from "./api-types/features-api";
import type {
	ClaudeMediaAPI,
	ClaudeTimelineAPI,
	ClaudeSearchAPI,
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
	ClaudePointerAPI,
	ClaudeUiAPI,
	ClaudeStateAPI,
	ClaudeImportEvidenceAPI,
	ClaudeSameProfileWritebackAPI,
} from "./api-types/claude-ui-api";
import type {
	RemotionFolderAPI,
	MoyinAPI,
} from "./api-types/remotion-moyin-api";
import type { HyperframesAPI } from "./api-types/hyperframes-api";
import type { JianyingDraftExportPreloadAPI } from "./api-types/jianying-draft-export-api";
import type { JianyingTransitionPreloadAPI } from "./api-types/jianying-transition-api";
import type { JianyingFilterLabPreloadAPI } from "./api-types/jianying-filter-lab-api";
import type { JianyingEnvelopePreloadAPI } from "./api-types/jianying-envelope-api";
import type { JianyingDraftImportPreloadAPI } from "./api-types/jianying-draft-import-api";
import type { JianyingSameProfileWritebackPreloadAPI } from "./api-types/jianying-same-profile-writeback-api";
import type {
	AppShellAPI,
	UpdatesAPI,
	LicenseAPI,
} from "./api-types/system-api";
import type { YouTubeApi } from "./api-types/youtube-api";

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
		ProjectJsonAPI,
		ProjectFolderAPI,
		RemotionFolderAPI,
		HyperframesAPI,
		MoyinAPI,
		AppShellAPI,
		UpdatesAPI,
		LicenseAPI,
		YouTubeApi,
		JianyingDraftExportPreloadAPI,
		JianyingTransitionPreloadAPI,
		JianyingFilterLabPreloadAPI,
		JianyingEnvelopePreloadAPI,
		JianyingDraftImportPreloadAPI,
		JianyingSameProfileWritebackPreloadAPI {
	platform: NodeJS.Platform;
	isElectron: boolean;

	// Claude Code Integration API
	claude?: ClaudeMediaAPI &
		ClaudeTimelineAPI &
		ClaudeSearchAPI &
		ClaudeTransactionAPI &
		ClaudeProjectAPI &
		ClaudeAnalyzeAPI &
		ClaudeEventsAPI &
		ClaudeNotificationsAPI &
		ClaudeNavigatorAPI &
		ClaudeScreenRecordingBridgeAPI &
		ClaudeProjectCrudAPI &
		ClaudePointerAPI &
		ClaudeUiAPI &
		ClaudeStateAPI &
		ClaudeImportEvidenceAPI &
		ClaudeSameProfileWritebackAPI;
}

// ============================================================================
// Global augmentation
// ============================================================================

declare global {
	interface Window {
		electronAPI: ElectronAPI;
	}
}
