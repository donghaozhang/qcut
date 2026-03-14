/**
 * @qcut/platform-core — Platform-agnostic API contract for QCut.
 *
 * @module @qcut/platform-core
 */

// Base types and capability enum
export {
	PlatformCapability,
	type ThemeSource,
	type FileDialogFilter,
	type FileInfo,
	type SaveBlobResult,
} from "./types/base.js";

// Core API namespaces
export type {
	PlatformFilesAPI,
	PlatformStorageAPI,
	PlatformThemeAPI,
	PlatformShellAPI,
	PlatformApiKeysAPI,
	PlatformLicenseAPI,
	LicenseInfo,
	LicenseCreditBalance,
	LicenseUserProfile,
} from "./types/core-api.js";

// Media API namespaces
export type {
	PlatformSoundsAPI,
	PlatformAudioAPI,
	PlatformVideoAPI,
	PlatformScreenshotAPI,
	PlatformScreenRecordingAPI,
	PlatformFFmpegAPI,
	PlatformTranscriptionAPI,
} from "./types/media-api.js";

// Integration API namespaces
export type {
	PlatformFalAPI,
	PlatformGeminiChatAPI,
	PlatformGitHubAPI,
	PlatformYouTubeAPI,
	PlatformPtyAPI,
	PlatformMcpAPI,
	PlatformSkillsAPI,
	PlatformAIPipelineAPI,
	PlatformMediaImportAPI,
	PlatformProjectFolderAPI,
	PlatformProjectJsonAPI,
	PlatformRemotionFolderAPI,
	PlatformMoyinAPI,
	PlatformUpdatesAPI,
	PlatformFillerAnalysisAPI,
	PlatformPiAgentAPI,
} from "./types/integration-api.js";

// Claude API namespaces
export type {
	PlatformClaudeAPI,
	PlatformClaudeMediaAPI,
	PlatformClaudeTimelineAPI,
	PlatformClaudeTransactionAPI,
	PlatformClaudeProjectAPI,
	PlatformClaudeExportAPI,
	PlatformClaudeDiagnosticsAPI,
	PlatformClaudeAnalyzeAPI,
	PlatformClaudeEventsAPI,
	PlatformClaudeNotificationsAPI,
	PlatformClaudeNavigatorAPI,
	PlatformClaudeScreenRecordingBridgeAPI,
	PlatformClaudeUiAPI,
	PlatformClaudeStateAPI,
	PlatformClaudeProjectCrudAPI,
} from "./types/claude-api.js";

// Root PlatformAPI
export type { PlatformAPI } from "./types/platform.js";

// Capabilities
export {
	PlatformUnsupportedError,
	PLATFORM_CAPABILITIES,
	isPlatformCapable,
	getMissingCapabilities,
} from "./capabilities.js";

// Provider
export { initPlatform, platform } from "./provider.js";
