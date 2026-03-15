/**
 * Root PlatformAPI interface — the unified contract that adapters implement.
 *
 * @module @qcut/platform-core/types/platform
 */

import type { PlatformCapability } from "./base.js";
import type {
	PlatformFilesAPI,
	PlatformStorageAPI,
	PlatformThemeAPI,
	PlatformShellAPI,
	PlatformApiKeysAPI,
	PlatformLicenseAPI,
} from "./core-api.js";
import type {
	PlatformSoundsAPI,
	PlatformAudioAPI,
	PlatformVideoAPI,
	PlatformScreenshotAPI,
	PlatformScreenRecordingAPI,
	PlatformFFmpegAPI,
	PlatformTranscriptionAPI,
} from "./media-api.js";
import type {
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
	PlatformRemotionAPI,
	PlatformMoyinAPI,
	PlatformUpdatesAPI,
	PlatformFillerAnalysisAPI,
	PlatformPiAgentAPI,
} from "./integration-api.js";
import type { PlatformClaudeAPI } from "./claude-api.js";

/**
 * The unified platform API contract.
 *
 * Platform adapters implement this interface:
 * - `platform-desktop`: wraps window.electronAPI (full capability)
 * - `platform-web`: browser APIs + stubs (QCut Lite)
 *
 * Capabilities that an adapter does not support should throw
 * `PlatformUnsupportedError` or return graceful fallback values.
 */
export interface PlatformAPI extends PlatformFillerAnalysisAPI {
	/** Platform identifier */
	readonly platform: "desktop" | "web" | "ios";

	/** Whether running in Electron context */
	readonly isElectron: boolean;

	/** Check if a capability is available on this platform */
	hasCapability(cap: PlatformCapability): boolean;

	/** Resolve native file path from a File object (Electron webUtils) */
	getPathForFile(file: File): string;

	// -- Core namespaces --
	files: PlatformFilesAPI;
	storage: PlatformStorageAPI;
	theme: PlatformThemeAPI;
	shell: PlatformShellAPI;
	apiKeys: PlatformApiKeysAPI;
	license: PlatformLicenseAPI;

	// -- Media namespaces --
	sounds: PlatformSoundsAPI;
	audio: PlatformAudioAPI;
	video: PlatformVideoAPI;
	screenshot: PlatformScreenshotAPI;
	screenRecording: PlatformScreenRecordingAPI;
	ffmpeg: PlatformFFmpegAPI;
	transcription: PlatformTranscriptionAPI;

	// -- Integration namespaces --
	fal: PlatformFalAPI;
	geminiChat: PlatformGeminiChatAPI;
	github: PlatformGitHubAPI;
	youtube: PlatformYouTubeAPI;
	pty: PlatformPtyAPI;
	mcp: PlatformMcpAPI;
	skills: PlatformSkillsAPI;
	aiPipeline: PlatformAIPipelineAPI;
	mediaImport: PlatformMediaImportAPI;
	projectFolder: PlatformProjectFolderAPI;
	projectJson: PlatformProjectJsonAPI;
	remotionFolder: PlatformRemotionFolderAPI;
	remotion?: PlatformRemotionAPI;
	moyin: PlatformMoyinAPI;
	updates: PlatformUpdatesAPI;

	// -- Pi Agent (optional — desktop-only) --
	piAgent?: PlatformPiAgentAPI;

	// -- Claude (optional — desktop-only in QCut Lite) --
	claude?: PlatformClaudeAPI;
}
